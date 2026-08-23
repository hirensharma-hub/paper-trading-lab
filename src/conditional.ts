import type { ClosedTrade } from "./domain";
import { performanceMetrics, type PerformanceMetrics } from "./metrics";

export interface ConditionalPerformance { label: string; sampleCount: number; metrics: PerformanceMetrics; }
export function performanceByLabel(trades: readonly ClosedTrade[], labelOf: (trade: ClosedTrade) => string | undefined, periodsPerYear = 252): readonly ConditionalPerformance[] {
  const groups = new Map<string, ClosedTrade[]>(); for (const trade of trades) { const label = labelOf(trade); if (!label) continue; const group = groups.get(label) ?? []; group.push(trade); groups.set(label, group); }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, group]) => { const ordered = [...group].sort((a, b) => a.exitTimestamp - b.exitTimestamp); const returns = ordered.map((trade) => trade.entryPrice > 0 && trade.quantity > 0 ? trade.netPnl / (trade.entryPrice * trade.quantity) : 0); const equity = ordered.reduce<{ ts: number; value: number }[]>((values, trade, index) => [...values, { ts: trade.exitTimestamp, value: values.at(-1)!.value * (1 + returns[index]) }], [{ ts: ordered[0].entryTimestamp, value: 100_000 }]); return { label, sampleCount: group.length, metrics: performanceMetrics(equity, returns, periodsPerYear) }; });
}
