import type { Bar } from "./domain";

export interface ForwardReturnTarget { symbol: string; featureTimestamp: number; decisionTimestamp: number; targetStartTimestamp: number; targetEndTimestamp: number; horizonBars: number; forwardLogReturn: number; label: "LONG" | "FLAT" | "SHORT"; }
export interface TimeSplit { train: readonly number[]; validation: readonly number[]; test: readonly number[]; }
export interface TripleBarrierTarget { symbol: string; featureTimestamp: number; decisionTimestamp: number; targetStartTimestamp: number; targetEndTimestamp: number; horizonBars: number; upperBarrier: number; lowerBarrier: number; label: "UP" | "DOWN" | "TIMEOUT" | "AMBIGUOUS"; ambiguousAtIndex?: number; version: string; }

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

export function tripleBarrierTarget(bars: readonly Bar[], index: number, atr: number, upperAtrMultiple: number, lowerAtrMultiple: number, horizonBars: number, ambiguity: "AMBIGUOUS" | "CONSERVATIVE_DOWN" = "AMBIGUOUS"): TripleBarrierTarget | null {
  if (index < 0 || index >= bars.length || !Number.isFinite(atr) || atr <= 0 || horizonBars <= 0 || index + 1 >= bars.length) return null;
  const entry = bars[index].close; const upperBarrier = entry + atr * upperAtrMultiple; const lowerBarrier = entry - atr * lowerAtrMultiple; const endIndex = Math.min(bars.length - 1, index + horizonBars); let label: TripleBarrierTarget["label"] = "TIMEOUT"; let ambiguousAtIndex: number | undefined;
  for (let i = index + 1; i <= endIndex; i++) { const hitUpper = bars[i].high >= upperBarrier; const hitLower = bars[i].low <= lowerBarrier; if (hitUpper && hitLower) { label = ambiguity === "CONSERVATIVE_DOWN" ? "DOWN" : "AMBIGUOUS"; ambiguousAtIndex = i; break; } if (hitUpper) { label = "UP"; break; } if (hitLower) { label = "DOWN"; break; } }
  return { symbol: bars[index].symbol, featureTimestamp: bars[index].startMs + bars[index].intervalMs, decisionTimestamp: bars[index].startMs + bars[index].intervalMs, targetStartTimestamp: bars[index + 1].startMs, targetEndTimestamp: bars[endIndex].startMs + bars[endIndex].intervalMs, horizonBars, upperBarrier, lowerBarrier, label, ambiguousAtIndex, version: "triple-barrier-1.0.0" };
}

export interface WalkForwardConfig { trainBars: number; validationBars: number; testBars: number; stepBars: number; embargoBars?: number; targetHorizon?: number; }
export interface WalkForwardFold extends TimeSplit { fold: number; }
export function generateWalkForwardSplits(size: number, config: WalkForwardConfig): readonly WalkForwardFold[] { const folds: WalkForwardFold[] = []; const embargo = config.embargoBars ?? 0; const horizon = config.targetHorizon ?? 0; let start = 0; let fold = 0; while (start + config.trainBars + config.validationBars + config.testBars <= size) { const trainStart = start; const trainEnd = start + config.trainBars; const validationStart = trainEnd + Math.max(embargo, horizon); const validationEnd = validationStart + config.validationBars; const testStart = validationEnd + Math.max(embargo, horizon); const testEnd = testStart + config.testBars; if (testEnd > size) break; folds.push({ fold: fold++, train: Array.from({ length: trainEnd - trainStart }, (_, i) => trainStart + i), validation: Array.from({ length: validationEnd - validationStart }, (_, i) => validationStart + i), test: Array.from({ length: testEnd - testStart }, (_, i) => testStart + i) }); start += config.stepBars; } return folds; }
