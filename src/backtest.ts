import type { Bar, Quote } from "./domain";
import { ResearchEngine } from "./engine";
export interface ReplayEvent { bar: Bar; quote: Quote; }
export interface BacktestResult { signals: number; filledOrders: number; equity: readonly number[]; finalEquity: number; }
export function replay(events: readonly ReplayEvent[], engine: ResearchEngine): BacktestResult { const equity: number[] = [engine.portfolioSnapshot(events[0]?.quote.ts ?? 0).equity]; let signals = 0; for (const event of events) { const signal = engine.onBar(event.bar, event.quote); if (signal.action !== "HOLD") signals++; equity.push(engine.portfolioSnapshot(event.quote.ts).equity); } return { signals, filledOrders: engine.broker.allOrders.filter((o) => o.status === "FILLED").length, equity, finalEquity: equity.at(-1)! }; }
