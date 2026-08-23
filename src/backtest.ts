import type { Bar, ClosedTrade, PortfolioSnapshot, Quote } from "./domain";
import { ResearchEngine } from "./engine";
import { performanceMetrics, type PerformanceMetrics } from "./metrics";
import { TradeLedger } from "./trades";

export interface ReplayEvent { bar: Bar; quote: Quote; regime?: string; patterns?: readonly string[]; }
export interface BacktestResult { signals: number; filledOrders: number; equity: readonly number[]; snapshots: readonly PortfolioSnapshot[]; trades: readonly ClosedTrade[]; metrics: PerformanceMetrics; finalEquity: number; }

/** Replays normalized completed bars with quotes at/after the bar close. */
export function replay(events: readonly ReplayEvent[], engine: ResearchEngine): BacktestResult {
  const sorted = [...events].sort((a, b) => a.quote.ts - b.quote.ts || a.bar.symbol.localeCompare(b.bar.symbol));
  if (sorted.some((event) => event.quote.ts < event.bar.startMs + event.bar.intervalMs)) throw new Error("Replay quote cannot precede its completed bar");
  const ledger = new TradeLedger(); const equity: number[] = [engine.portfolioSnapshot(sorted[0]?.quote.ts ?? 0).equity]; const snapshots: PortfolioSnapshot[] = [engine.portfolioSnapshot(sorted[0]?.quote.ts ?? 0)]; const processedFills = new Set<string>(); let signals = 0;
  for (const event of sorted) {
    const signal = engine.onBar(event.bar, event.quote); if (signal.action !== "HOLD") signals++; ledger.updateMark(event.bar.symbol, event.bar.high, event.bar.low);
    for (const order of engine.broker.allOrders) for (const fill of order.fills) if (!processedFills.has(fill.id)) { processedFills.add(fill.id); ledger.applyFill(order, fill, { high: event.bar.high, low: event.bar.low, regime: event.regime, patterns: event.patterns }); }
    const snapshot = engine.portfolioSnapshot(event.quote.ts); snapshots.push(snapshot); equity.push(snapshot.equity);
  }
  const trades = ledger.all(); const metrics = performanceMetrics(equity, trades.map((trade) => trade.netPnl)); return { signals, filledOrders: engine.broker.allOrders.filter((order) => order.status === "FILLED").length, equity, snapshots, trades, metrics, finalEquity: equity.at(-1)! };
}
