import type { FeatureVector } from "./domain";
import type { MarketStructureSnapshot } from "./structure";
import type { RegimeState } from "./regime";

export type PatternType = "BREAKOUT" | "FAILED_BREAKOUT" | "TREND_CONTINUATION" | "MEAN_REVERSION_EXTREME" | "VOLATILITY_COMPRESSION" | "VOLATILITY_EXPANSION" | "SUPPORT_TEST" | "RESISTANCE_TEST";
export interface PatternDetection { symbol: string; timestamp: number; type: PatternType; version: string; strength: number; levels: Readonly<Record<string, number>>; supportingFeatures: readonly string[]; contradictingFeatures: readonly string[]; regime?: RegimeState; }

export function detectPatterns(features: FeatureVector, structure: MarketStructureSnapshot | null, regime?: RegimeState): readonly PatternDetection[] {
  if (!structure) return []; const result: PatternDetection[] = []; const base = { symbol: features.symbol, timestamp: features.ts, version: "rule-pattern-1.0.0", regime };
  if (features.close > structure.rangeHigh) result.push({ ...base, type: "BREAKOUT", strength: Math.min(1, Math.abs(features.close - structure.rangeHigh) / features.close * 100), levels: { rangeHigh: structure.rangeHigh }, supportingFeatures: ["close_above_range_high"], contradictingFeatures: [] });
  if (features.close < structure.rangeLow) result.push({ ...base, type: "BREAKOUT", strength: Math.min(1, Math.abs(features.close - structure.rangeLow) / features.close * 100), levels: { rangeLow: structure.rangeLow }, supportingFeatures: ["close_below_range_low"], contradictingFeatures: [] });
  if (Math.abs(features.emaSlowDistance) >= 0.03) result.push({ ...base, type: "MEAN_REVERSION_EXTREME", strength: Math.min(1, Math.abs(features.emaSlowDistance) / 0.1), levels: { emaSlow: features.emaSlow }, supportingFeatures: ["large_ma_deviation"], contradictingFeatures: ["trend_may_persist"] });
  if (features.realisedVol20 < 0.15) result.push({ ...base, type: "VOLATILITY_COMPRESSION", strength: 1 - Math.min(1, features.realisedVol20 / 0.15), levels: {}, supportingFeatures: ["low_realised_volatility"], contradictingFeatures: [] });
  if (features.realisedVol20 > 0.75) result.push({ ...base, type: "VOLATILITY_EXPANSION", strength: Math.min(1, features.realisedVol20 / 1.5), levels: {}, supportingFeatures: ["high_realised_volatility"], contradictingFeatures: [] });
  return result;
}
