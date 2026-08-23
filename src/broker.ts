import type { Fill, PaperOrder, Position, Quote } from "./domain";

export interface BrokerConfig { initialCash: number; feeBps: number; slippageBps: number; }

export class PaperBroker {
  private cash: number;
  private readonly orders = new Map<string, PaperOrder>();
  private readonly positions = new Map<string, Position>();
  private fillSequence = 0;

  constructor(private readonly config: BrokerConfig) {
    if (!Number.isFinite(config.initialCash) || config.initialCash <= 0) throw new Error("initialCash must be positive");
    this.cash = config.initialCash;
  }

  get balance() { return this.cash; }
  get openPositions(): Position[] { return [...this.positions.values()].map((p) => ({ ...p })); }
  get allOrders(): PaperOrder[] { return [...this.orders.values()].map((o) => structuredClone(o)); }

  submit(order: PaperOrder): void {
    if (order.quantity <= 0) throw new Error("Order quantity must be positive");
    if (this.orders.has(order.id)) throw new Error(`Duplicate order id: ${order.id}`);
    this.orders.set(order.id, structuredClone(order));
  }

  onQuote(quote: Quote): Fill[] {
    const fills: Fill[] = [];
    for (const order of this.orders.values()) {
      if (order.symbol !== quote.symbol || !["NEW", "WORKING", "PARTIALLY_FILLED"].includes(order.status)) continue;
      const filled = order.fills.reduce((sum, f) => sum + f.quantity, 0);
      const remaining = order.quantity - filled;
      const executable = order.type === "MARKET"
        ? (order.side === "BUY" ? quote.ask : quote.bid)
        : order.limitPrice !== undefined && ((order.side === "BUY" && quote.ask <= order.limitPrice) || (order.side === "SELL" && quote.bid >= order.limitPrice))
          ? order.side === "BUY" ? Math.min(quote.ask, order.limitPrice) : Math.max(quote.bid, order.limitPrice)
          : null;
      if (remaining <= 0 || executable === null || !Number.isFinite(executable)) { if (remaining > 0) order.status = "WORKING"; continue; }
      const signedSlippage = order.side === "BUY" ? 1 : -1;
      const price = executable * (1 + signedSlippage * this.config.slippageBps / 10_000);
      const fee = price * remaining * this.config.feeBps / 10_000;
      const fill: Fill = { id: `fill-${++this.fillSequence}`, orderId: order.id, ts: quote.ts, quantity: remaining, price, fee };
      order.fills.push(fill); order.status = "FILLED"; this.applyFill(order, fill); fills.push(fill);
    }
    return fills;
  }

  markToMarket(prices: Readonly<Record<string, number>>): number {
    return this.cash + [...this.positions.values()].reduce((sum, p) => sum + p.quantity * (prices[p.symbol] ?? p.averagePrice), 0);
  }

  private applyFill(order: PaperOrder, fill: Fill) {
    const signedQuantity = order.side === "BUY" ? fill.quantity : -fill.quantity;
    const old = this.positions.get(order.symbol) ?? { symbol: order.symbol, quantity: 0, averagePrice: 0, realisedPnl: 0 };
    const nextQuantity = old.quantity + signedQuantity;
    if (old.quantity !== 0 && Math.sign(old.quantity) !== Math.sign(nextQuantity) && nextQuantity !== 0) throw new Error("Shorting/reversal is disabled in V1");
    const closing = old.quantity !== 0 && Math.sign(old.quantity) !== Math.sign(signedQuantity);
    const realisedPnl = closing ? old.realisedPnl + (fill.price - old.averagePrice) * Math.min(Math.abs(old.quantity), fill.quantity) * Math.sign(old.quantity) - fill.fee : old.realisedPnl;
    this.cash += order.side === "BUY" ? -(fill.price * fill.quantity + fill.fee) : fill.price * fill.quantity - fill.fee;
    if (nextQuantity === 0) this.positions.delete(order.symbol);
    else this.positions.set(order.symbol, { symbol: order.symbol, quantity: nextQuantity, averagePrice: closing ? old.averagePrice : (old.averagePrice * old.quantity + fill.price * signedQuantity) / nextQuantity, realisedPnl });
  }
}
