import type { FeatureVector } from "./domain";

export type FeatureId = string;
export type NamedFeatureVector = Readonly<Record<FeatureId, number>>;
export const FEATURE_SET_VERSION = "baseline-named-v1";
export const CANONICAL_FEATURE_IDS = ["ret1", "ret5", "emaFastDistance", "emaSlowDistance", "rsi14Normalized", "realisedVol20", "volumeZ", "spreadBps", "bookImbalance"] as const;
export function namedFeatures(features: FeatureVector): NamedFeatureVector { return { ret1: features.ret1, ret5: features.ret5, emaFastDistance: features.emaFastDistance, emaSlowDistance: features.emaSlowDistance, rsi14Normalized: features.rsi14 / 100, realisedVol20: features.realisedVol20, volumeZ: features.volumeZ, spreadBps: features.spreadBps ?? 0, bookImbalance: features.bookImbalance ?? 0 }; }
export function selectNamedFeatures(features: NamedFeatureVector, featureIds: readonly FeatureId[]): number[] { const unique = new Set(featureIds); if (unique.size !== featureIds.length || featureIds.some((id) => !(id in features))) throw new Error("Feature IDs do not exactly match the available named feature schema"); return featureIds.map((id) => features[id]); }
