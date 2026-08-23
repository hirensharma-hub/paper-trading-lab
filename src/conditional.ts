import type { ClosedTrade } from "./domain";
import { performanceMetrics, type PerformanceMetrics } from "./metrics";

export interface ConditionalPerformance { label: string; sampleCount: number; metrics: PerformanceMetrics; }
export function performanceByLabel(trades: readonly ClosedTrade[], labelOf: (trade: ClosedTrade) => string | undefined, periodsPerYear = 252): readonly ConditionalPerformance[] {
  const groups = new Map<string, ClosedTrade[]>(); for (const trade of trades) { const label = labelOf(trade); if (!label) continue; const group = groups.get(label) ?? []; group.push(trade); groups.set(label, group); }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, group]) => ({ label, sampleCount: group.length, metrics: performanceMetrics([100_000, ...group.reduce<number[]>((equity, trade) => [...equity, equity.at(-1)! + trade.netPnl], [])], group.map((trade) => trade.netPnl), periodsPerYear) }));
}
