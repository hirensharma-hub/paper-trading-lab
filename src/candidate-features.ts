import type { Bar } from "./domain";
import { TradingCalendar } from "./calendar";
import { buildFeatures } from "./features";
import { namedFeatures, OHLCV_FEATURE_IDS, type NamedFeatureVector } from "./feature-schema";

export const CANDIDATE_FEATURE_SET_VERSION = "candidate-ohlcv-v3";
export const NEW_CAUSAL_FEATURE_IDS = [
  "ret10", "ret20", "atr14Pct", "barRangePct", "closeLocation", "bodyPct", "openingGapPct", "sessionProgress",
] as const;
export const CANDIDATE_OHLCV_FEATURE_IDS = [...OHLCV_FEATURE_IDS, ...NEW_CAUSAL_FEATURE_IDS] as const;

const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** ATR(14) using only completed bars in `bars`; the first true range uses no unavailable prior close. */
export function causalAverageTrueRange(bars: readonly Bar[], period = 14): number {
  if (bars.length < period + 1) return Number.NaN;
  const start = bars.length - period;
  const ranges = bars.slice(start).map((bar, offset) => {
    const prior = bars[start + offset - 1]?.close;
    return Math.max(bar.high - bar.low, prior === undefined ? 0 : Math.abs(bar.high - prior), prior === undefined ? 0 : Math.abs(bar.low - prior));
  });
  return ranges.every(Number.isFinite) ? mean(ranges) : Number.NaN;
}

function previousCompleteSessionClose(bars: readonly Bar[], currentSession: string, calendar: TradingCalendar): number | undefined {
  let cursor = bars.length - 1;
  while (cursor >= 0 && calendar.sessionKey(bars[cursor]!.startMs) === currentSession) cursor--;
  while (cursor >= 0) {
    const key = calendar.sessionKey(bars[cursor]!.startMs);
    const last = bars[cursor]!;
    while (cursor >= 0 && calendar.sessionKey(bars[cursor]!.startMs) === key) cursor--;
    const bounds = calendar.sessionBounds(Date.parse(`${key}T12:00:00Z`));
    if (calendar.isRegularSession(last.startMs) && last.startMs + last.intervalMs === bounds.closeMs && Number.isFinite(last.close) && last.close > 0) return last.close;
  }
  return undefined;
}

/**
 * Candidate V2B features. The input ends at the current completed bar and is
 * deliberately independent of any bars after that bar.
 */
export function buildCandidateFeatures(bars: readonly Bar[], calendar: TradingCalendar, decisionTimestamp?: number): NamedFeatureVector | null {
  if (!bars.length) return null;
  if (bars.some((bar) => bar.symbol !== bars[0]!.symbol)) throw new Error("Feature history must contain one symbol");
  const history = bars;
  const current = history.at(-1)!;
  const completedAt = current.startMs + current.intervalMs;
  if (decisionTimestamp !== undefined && history.some((bar) => bar.startMs + bar.intervalMs > decisionTimestamp)) throw new Error("Feature history contains data after the decision timestamp");
  if (history.length < 21) return null;
  const baseline = buildFeatures(history, undefined, { decisionTimestamp: decisionTimestamp ?? completedAt });
  if (!baseline) return null;
  const close = current.close;
  const atr = causalAverageTrueRange(history, 14);
  const closes = history.map((bar) => bar.close);
  const currentSession = calendar.sessionKey(current.startMs);
  let currentSessionFirst = current;
  for (let index = history.length - 2; index >= 0 && calendar.sessionKey(history[index]!.startMs) === currentSession; index--) currentSessionFirst = history[index]!;
  const priorClose = previousCompleteSessionClose(history, currentSession, calendar);
  if (!calendar.isRegularSession(current.startMs) || !calendar.isRegularSession(currentSessionFirst.startMs) || priorClose === undefined || !Number.isFinite(atr) || !Number.isFinite(close) || close <= 0 || !Number.isFinite(current.open) || current.open <= 0) return null;
  const bounds = calendar.sessionBounds(current.startMs);
  const sessionLength = bounds.closeMs - bounds.openMs;
  if (sessionLength <= 0) return null;
  const ret = (lookback: number) => {
    const prior = closes.at(-(lookback + 1));
    return prior !== undefined && prior > 0 ? close / prior - 1 : Number.NaN;
  };
  const openingGapPct = currentSessionFirst.open / priorClose - 1;
  const closeLocation = current.high === current.low ? 0.5 : (close - current.low) / (current.high - current.low);
  const sessionProgress = Math.min(1, Math.max(0, (current.startMs - bounds.openMs) / sessionLength));
  const values: NamedFeatureVector = {
    ...namedFeatures(baseline),
    ret10: ret(10),
    ret20: ret(20),
    atr14Pct: atr / close,
    barRangePct: (current.high - current.low) / close,
    closeLocation,
    bodyPct: (current.close - current.open) / current.open,
    openingGapPct,
    sessionProgress,
  };
  if (Object.values(values).some((value) => !Number.isFinite(value))) return null;
  return values;
}

export function candidateFeatureVector(values: NamedFeatureVector): number[] {
  return CANDIDATE_OHLCV_FEATURE_IDS.map((id) => {
    const value = values[id];
    if (!Number.isFinite(value)) throw new Error(`Missing or non-finite candidate feature: ${id}`);
    return value;
  });
}

export function featureAvailability(values: NamedFeatureVector | null): boolean { return values !== null && CANDIDATE_OHLCV_FEATURE_IDS.every((id) => Number.isFinite(values[id])); }

/** Test/runtime helper: evaluate a timestamp using only the prefix ending at that bar. */
export function buildCandidateFeaturesAt(bars: readonly Bar[], index: number, calendar: TradingCalendar): NamedFeatureVector | null {
  if (!Number.isInteger(index) || index < 0 || index >= bars.length) throw new Error("Candidate feature index is invalid");
  const prefix = bars.slice(0, index + 1);
  return buildCandidateFeatures(prefix, calendar, prefix.at(-1)!.startMs + prefix.at(-1)!.intervalMs);
}
