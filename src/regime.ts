import type { FeatureVector } from "./domain";
import type { MarketStructureSnapshot } from "./structure";

export type TrendRegime = "STRONG_UPTREND" | "UPTREND" | "RANGE" | "DOWNTREND" | "STRONG_DOWNTREND" | "UNCERTAIN";
export type VolatilityRegime = "LOW" | "NORMAL" | "HIGH" | "EXPANDING" | "CONTRACTING";
export interface RegimeState { symbol: string; timestamp: number; trend: TrendRegime; volatility: VolatilityRegime; score: number; version: string; }
export interface RegimeConfig { strongTrendDistance?: number; normalVolatility?: number; highVolatility?: number; }

export function classifyRegime(features: FeatureVector, structure?: MarketStructureSnapshot | null, config: RegimeConfig = {}): RegimeState {
  const strong = config.strongTrendDistance ?? 0.01; const normalVol = config.normalVolatility ?? 0.25; const highVol = config.highVolatility ?? 0.5; const distance = (features.emaFast - features.emaSlow) / features.close; const trend: TrendRegime = !Number.isFinite(distance) ? "UNCERTAIN" : distance >= strong ? (structure?.trend === "HIGHER_HIGHS_HIGHER_LOWS" ? "STRONG_UPTREND" : "UPTREND") : distance <= -strong ? (structure?.trend === "LOWER_HIGHS_LOWER_LOWS" ? "STRONG_DOWNTREND" : "DOWNTREND") : "RANGE"; const volatility: VolatilityRegime = !Number.isFinite(features.realisedVol20) ? "NORMAL" : features.realisedVol20 >= highVol ? "HIGH" : features.realisedVol20 <= normalVol ? "LOW" : "NORMAL";
  return { symbol: features.symbol, timestamp: features.ts, trend, volatility, score: Math.min(1, Math.abs(distance) / Math.max(strong, 1e-9)), version: "rule-regime-1.0.0" };
}
