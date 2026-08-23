import type { Bar } from "./domain";

export interface ForwardReturnTarget { symbol: string; featureTimestamp: number; decisionTimestamp: number; targetStartTimestamp: number; targetEndTimestamp: number; horizonBars: number; forwardLogReturn: number; label: "LONG" | "FLAT" | "SHORT"; }
export interface TimeSplit { train: readonly number[]; validation: readonly number[]; test: readonly number[]; }

export function forwardReturnTarget(bars: readonly Bar[], index: number, horizonBars: number, costThreshold = 0): ForwardReturnTarget | null {
  if (horizonBars <= 0 || index < 0 || index + horizonBars >= bars.length) return null;
  const decisionTimestamp = bars[index].startMs + bars[index].intervalMs; const targetEndTimestamp = bars[index + horizonBars].startMs + bars[index + horizonBars].intervalMs; const forwardLogReturn = Math.log(bars[index + horizonBars].close / bars[index].close); const threshold = Math.abs(costThreshold);
  return { symbol: bars[index].symbol, featureTimestamp: decisionTimestamp, decisionTimestamp, targetStartTimestamp: decisionTimestamp, targetEndTimestamp, horizonBars, forwardLogReturn, label: forwardLogReturn > threshold ? "LONG" : forwardLogReturn < -threshold ? "SHORT" : "FLAT" };
}

export function chronologicalSplit(size: number, trainRatio = 0.6, validationRatio = 0.2): TimeSplit { if (!Number.isInteger(size) || size < 3 || trainRatio <= 0 || validationRatio <= 0 || trainRatio + validationRatio >= 1) throw new Error("Invalid chronological split"); const trainEnd = Math.floor(size * trainRatio); const validationEnd = trainEnd + Math.floor(size * validationRatio); return { train: Array.from({ length: trainEnd }, (_, i) => i), validation: Array.from({ length: validationEnd - trainEnd }, (_, i) => trainEnd + i), test: Array.from({ length: size - validationEnd }, (_, i) => validationEnd + i) }; }

export function purgedChronologicalSplit(size: number, horizonBars: number, trainRatio = 0.6, validationRatio = 0.2, embargoBars = 0): TimeSplit {
  const base = chronologicalSplit(size, trainRatio, validationRatio); const validationStart = base.validation[0] ?? size; const testStart = base.test[0] ?? size;
  const train = base.train.filter((i) => i + horizonBars < validationStart && i + embargoBars < validationStart);
  const validation = base.validation.filter((i) => i + horizonBars < testStart && i + embargoBars < testStart);
  const test = base.test.filter((i) => i >= testStart + embargoBars);
  return { train, validation, test };
}

export function assertNoLookahead(decisionTimestamp: number, target: ForwardReturnTarget): void { if (target.featureTimestamp > decisionTimestamp || target.decisionTimestamp !== decisionTimestamp || target.targetStartTimestamp < decisionTimestamp || target.targetEndTimestamp <= target.targetStartTimestamp) throw new Error("Target or feature timestamps violate point-in-time rules"); }
