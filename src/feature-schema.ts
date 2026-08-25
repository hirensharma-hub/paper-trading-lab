import type { FeatureVector } from "./domain";

export type FeatureId = string;
export type NamedFeatureVector = Readonly<Record<FeatureId, number>>;
export const FEATURE_SET_VERSION = "baseline-ohlcv-v1";
export const CANONICAL_FEATURE_IDS = ["ret1", "ret5", "emaFastDistance", "emaSlowDistance", "rsi14Normalized", "realisedVol20", "volumeZ", "spreadBps", "bookImbalance"] as const;
export const OHLCV_FEATURE_IDS = ["ret1", "ret5", "emaFastDistance", "emaSlowDistance", "rsi14Normalized", "realisedVol20", "volumeZ"] as const;
export const QUOTE_FEATURE_IDS = ["spreadBps", "bookImbalance"] as const;
export function namedFeatures(features: FeatureVector): NamedFeatureVector { const base: Record<string, number> = { ret1: features.ret1, ret5: features.ret5, emaFastDistance: features.emaFastDistance, emaSlowDistance: features.emaSlowDistance, rsi14Normalized: features.rsi14 / 100, realisedVol20: features.realisedVol20, volumeZ: features.volumeZ }; if (features.spreadBps !== undefined) base.spreadBps = features.spreadBps; if (features.bookImbalance !== undefined) base.bookImbalance = features.bookImbalance; return base; }
export function selectNamedFeatures(features: NamedFeatureVector, featureIds: readonly FeatureId[]): number[] { const unique = new Set(featureIds); if (unique.size !== featureIds.length || featureIds.some((id) => !(id in features))) throw new Error("Feature IDs do not exactly match the available named feature schema"); return featureIds.map((id) => features[id]); }
