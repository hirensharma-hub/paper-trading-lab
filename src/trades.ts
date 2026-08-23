import type { ClosedTrade, Fill, PaperOrder } from "./domain";

interface OpenLot { symbol: string; strategyId: string; strategyVersion: string; entryTimestamp: number; entryPrice: number; quantity: number; entryFees: number; maxHigh: number; minLow: number; entryRegime?: string; entryPatterns?: readonly string[]; }
export interface TradeContext { high?: number; low?: number; regime?: string; patterns?: readonly string[]; }

export class TradeLedger {
  private readonly open = new Map<string, OpenLot[]>();
  private readonly closed: ClosedTrade[] = [];
  private sequence = 0;
  updateMark(symbol: string, high: number, low: number) { for (const lot of this.open.get(symbol) ?? []) { lot.maxHigh = Math.max(lot.maxHigh, high); lot.minLow = Math.min(lot.minLow, low); } }
  applyFill(order: PaperOrder, fill: Fill, context: TradeContext = {}): readonly ClosedTrade[] {
    const lots = this.open.get(order.symbol) ?? []; const created: ClosedTrade[] = [];
    if (order.side === "BUY") { lots.push({ symbol: order.symbol, strategyId: order.strategyId, strategyVersion: order.strategyVersion, entryTimestamp: fill.ts, entryPrice: fill.price, quantity: fill.quantity, entryFees: fill.fee, maxHigh: context.high ?? fill.price, minLow: context.low ?? fill.price, entryRegime: context.regime, entryPatterns: context.patterns }); this.open.set(order.symbol, lots); return created; }
    let remaining = fill.quantity;
    while (remaining > 0 && lots.length) { const lot = lots[0]; const quantity = Math.min(remaining, lot.quantity); const entryFee = lot.entryFees * quantity / lot.quantity; const exitFee = fill.fee * quantity / fill.quantity; const grossPnl = (fill.price - lot.entryPrice) * quantity; const trade: ClosedTrade = { tradeId: `trade-${++this.sequence}`, symbol: order.symbol, strategyId: lot.strategyId, strategyVersion: lot.strategyVersion, entryTimestamp: lot.entryTimestamp, exitTimestamp: fill.ts, entryPrice: lot.entryPrice, exitPrice: fill.price, quantity, grossPnl, entryFees: entryFee, exitFees: exitFee, netPnl: grossPnl - entryFee - exitFee, holdingPeriodMs: fill.ts - lot.entryTimestamp, entryRegime: lot.entryRegime, exitRegime: context.regime, entryPatterns: lot.entryPatterns, exitPatterns: context.patterns, mfePerShare: lot.maxHigh - lot.entryPrice, maePerShare: lot.minLow - lot.entryPrice }; this.closed.push(trade); created.push(trade); lot.quantity -= quantity; lot.entryFees -= entryFee; remaining -= quantity; if (lot.quantity <= 0) lots.shift(); }
    if (lots.length) this.open.set(order.symbol, lots); else this.open.delete(order.symbol); return created;
  }
  all() { return this.closed.map((trade) => structuredClone(trade)); }
  openQuantity(symbol: string) { return (this.open.get(symbol) ?? []).reduce((sum, lot) => sum + lot.quantity, 0); }
}
