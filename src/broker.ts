import type { Fill, PaperOrder, Position, Quote } from "./domain";

export interface BrokerConfig { initialCash: number; feeBps: number; slippageBps: number; entryFeeBps?: number; exitFeeBps?: number; entrySlippageBps?: number; exitSlippageBps?: number; }

export class PaperBroker {
  private cash: number;
  private readonly orders = new Map<string, PaperOrder>();
  private readonly positions = new Map<string, Position>();
  private fillSequence = 0;
  private realisedPnlTotal = 0;
  private feesPaidTotal = 0;
  private estimatedSlippageTotal = 0;
  private readonly lastQuoteTs = new Map<string, number>();

  constructor(private readonly config: BrokerConfig) {
    if (!Number.isFinite(config.initialCash) || config.initialCash <= 0) throw new Error("initialCash must be positive");
    this.cash = config.initialCash;
  }

  get balance() { return this.cash; }
  get openPositions(): Position[] { return [...this.positions.values()].map((p) => ({ ...p })); }
  get allOrders(): PaperOrder[] { return [...this.orders.values()].map((o) => structuredClone(o)); }
  get allFills(): Fill[] { return [...this.orders.values()].flatMap((order) => order.fills.map((fill) => structuredClone(fill))); }
  get realisedPnl() { return this.realisedPnlTotal; }
  get feesPaid() { return this.feesPaidTotal; }
  get estimatedSlippage() { return this.estimatedSlippageTotal; }

  submit(order: PaperOrder): void {
    if (order.quantity <= 0) throw new Error("Order quantity must be positive");
    if (this.orders.has(order.id)) throw new Error(`Duplicate order id: ${order.id}`);
    this.orders.set(order.id, structuredClone(order));
  }

  onQuote(quote: Quote): Fill[] {
    if (!Number.isFinite(quote.bid) || !Number.isFinite(quote.ask) || quote.bid <= 0 || quote.ask <= 0 || quote.bid > quote.ask) {
      throw new Error("Invalid or crossed quote");
    }
    const fills: Fill[] = [];
    for (const order of this.orders.values()) {
      if (order.symbol !== quote.symbol || !["NEW", "WORKING", "PARTIALLY_FILLED"].includes(order.status)) continue;
      if (quote.ts <= (this.lastQuoteTs.get(order.id) ?? -Infinity)) continue;
      this.lastQuoteTs.set(order.id, quote.ts);
      const filled = order.fills.reduce((sum, f) => sum + f.quantity, 0);
      const remaining = order.quantity - filled;
      const existingPosition = this.positions.get(order.symbol)?.quantity ?? 0;
      if (order.side === "SELL" && existingPosition <= 0) { order.status = "REJECTED"; order.rejectionReason = "Long-only broker cannot sell without a position"; continue; }
      const executable = order.type === "MARKET"
        ? (order.side === "BUY" ? quote.ask : quote.bid)
        : order.limitPrice !== undefined && ((order.side === "BUY" && quote.ask <= order.limitPrice) || (order.side === "SELL" && quote.bid >= order.limitPrice))
          ? order.side === "BUY" ? Math.min(quote.ask, order.limitPrice) : Math.max(quote.bid, order.limitPrice)
          : null;
      if (remaining <= 0 || executable === null || !Number.isFinite(executable)) { if (remaining > 0) order.status = "WORKING"; continue; }
      const displayedSize = order.side === "BUY" ? quote.askSize : quote.bidSize;
      const liquidityQuantity = displayedSize === undefined ? remaining : Math.max(0, Math.floor(displayedSize));
      let fillQuantity = Math.min(remaining, liquidityQuantity || (displayedSize === undefined ? remaining : 0));
      if (order.side === "SELL") fillQuantity = Math.min(fillQuantity, existingPosition);
      const slippageBps = order.side === "BUY" ? (this.config.entrySlippageBps ?? this.config.slippageBps) : (this.config.exitSlippageBps ?? this.config.slippageBps);
      const feeBps = order.side === "BUY" ? (this.config.entryFeeBps ?? this.config.feeBps) : (this.config.exitFeeBps ?? this.config.feeBps);
      const estimatedPrice = executable * (order.type === "MARKET" ? 1 + (order.side === "BUY" ? 1 : -1) * slippageBps / 10_000 : 1);
      if (order.side === "BUY" && fillQuantity > 0) {
        const affordable = Math.floor(this.cash / (estimatedPrice * (1 + feeBps / 10_000)));
        fillQuantity = Math.min(fillQuantity, affordable);
      }
      if (fillQuantity <= 0) {
        if (order.side === "BUY" && this.cash < executable * (1 + this.config.feeBps / 10_000)) {
          order.status = "REJECTED"; order.rejectionReason = "Insufficient simulated cash";
        } else order.status = "WORKING";
        continue;
      }
      // Limit orders fill at an executable price without adverse slippage; this preserves the limit bound.
      const signedSlippage = order.type === "MARKET" ? (order.side === "BUY" ? 1 : -1) : 0;
      const rawPrice = executable * (1 + signedSlippage * slippageBps / 10_000);
      const price = order.limitPrice === undefined ? rawPrice : order.side === "BUY" ? Math.min(rawPrice, order.limitPrice) : Math.max(rawPrice, order.limitPrice);
      const fee = price * fillQuantity * feeBps / 10_000;
      this.estimatedSlippageTotal += Math.abs(price - executable) * fillQuantity;
      const fill: Fill = { id: `fill-${++this.fillSequence}`, orderId: order.id, ts: quote.ts, quantity: fillQuantity, price, fee };
      order.fills.push(fill); order.status = fillQuantity < remaining ? "PARTIALLY_FILLED" : "FILLED"; this.applyFill(order, fill); fills.push(fill);
    }
    return fills;
  }

  markToMarket(prices: Readonly<Record<string, number>>): number {
    return this.cash + [...this.positions.values()].reduce((sum, p) => sum + p.quantity * (prices[p.symbol] ?? p.averagePrice), 0);
  }

  private applyFill(order: PaperOrder, fill: Fill) {
    const signedQuantity = order.side === "BUY" ? fill.quantity : -fill.quantity;
    const old = this.positions.get(order.symbol) ?? { symbol: order.symbol, quantity: 0, averagePrice: 0, realisedPnl: 0, entryFees: 0 };
    const nextQuantity = old.quantity + signedQuantity;
    if (old.quantity !== 0 && Math.sign(old.quantity) !== Math.sign(nextQuantity) && nextQuantity !== 0) throw new Error("Shorting/reversal is disabled in V1");
    const closing = old.quantity !== 0 && Math.sign(old.quantity) !== Math.sign(signedQuantity);
    const closedQuantity = closing ? Math.min(Math.abs(old.quantity), fill.quantity) : 0;
    const allocatedEntryFees = closing && old.quantity > 0 ? old.entryFees * (closedQuantity / old.quantity) : 0;
    const netTradePnl = closing ? (fill.price - old.averagePrice) * closedQuantity - allocatedEntryFees - fill.fee : 0;
    const realisedPnl = closing ? old.realisedPnl + netTradePnl : old.realisedPnl;
    if (closing) this.realisedPnlTotal += netTradePnl;
    this.feesPaidTotal += fill.fee;
    this.cash += order.side === "BUY" ? -(fill.price * fill.quantity + fill.fee) : fill.price * fill.quantity - fill.fee;
    if (nextQuantity === 0) this.positions.delete(order.symbol);
    else this.positions.set(order.symbol, { symbol: order.symbol, quantity: nextQuantity, averagePrice: closing ? old.averagePrice : (old.averagePrice * old.quantity + fill.price * signedQuantity) / nextQuantity, realisedPnl, entryFees: closing ? old.entryFees - allocatedEntryFees : old.entryFees + fill.fee, entryTimestamp: closing ? old.entryTimestamp : old.entryTimestamp ?? fill.ts, entryModelProbability: old.entryModelProbability, entryRegime: old.entryRegime, entryPatterns: old.entryPatterns });
  }
}
