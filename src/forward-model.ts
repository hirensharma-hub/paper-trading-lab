import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import type { ModelArtifact } from "./ml";
import { PredictiveModelBundle } from "./ml";
import { OHLCV_FEATURE_IDS, FEATURE_SET_VERSION } from "./feature-schema";
import { FORWARD_TARGET_VERSION } from "./forward-config";

export interface StoredForwardModel { artifact: ModelArtifact; sha256: string; lifecycle: "CHAMPION" | "CHALLENGER" | "REJECTED"; }
export function canonicalModel(artifact: ModelArtifact): string { return JSON.stringify(artifact); }
export function modelHash(artifact: ModelArtifact): string { return createHash("sha256").update(canonicalModel(artifact)).digest("hex"); }
export function initialForwardArtifact(now = Date.now()): ModelArtifact {
  const featureIds = [...OHLCV_FEATURE_IDS];
  return { artifactId: "forward-artifact-v1", modelId: "forward-logistic", modelVersion: "forward-logistic-v1", algorithm: "logistic-regression", featureVersion: FEATURE_SET_VERSION, featureSetVersion: FEATURE_SET_VERSION, featureIds, featureAvailabilityPolicy: "OHLCV_ONLY", targetVersion: FORWARD_TARGET_VERSION, scaler: { means: featureIds.map(() => 0), scales: featureIds.map(() => 1), fittedRows: 0, fittedObservationIds: [] }, model: { weights: [1.25, .35, .2, .2, .1, -.05, .05], bias: .25 }, calibratorState: { slope: 1, intercept: 0, fittedRows: 0, fittedObservationIds: [] }, oodProfile: { featureSetVersion: FEATURE_SET_VERSION, featureIds, fittedObservationIds: [], means: featureIds.map(() => 0), scales: featureIds.map(() => 1), minimums: featureIds.map(() => -Infinity), maximums: featureIds.map(() => Infinity) }, createdAt: now, labelPolicyVersion: "forward-close-label-v1", labelPolicy: { version: "forward-close-label-v1", description: "Next eligible bar close direction after costs", targetVersion: FORWARD_TARGET_VERSION, positiveClass: "1", negativeClass: "0", includedRawLabels: ["LONG", "SHORT"], excludedRawLabels: ["FLAT"], probabilityMeaning: "P_UP_OUTCOME" } };
}
export function storedInitialModel(now = Date.now()): StoredForwardModel { const artifact = initialForwardArtifact(now); return { artifact, sha256: modelHash(artifact), lifecycle: "CHAMPION" }; }
export function verifyStoredModel(stored: StoredForwardModel): void { if (stored.sha256 !== modelHash(stored.artifact)) throw new Error("MODEL_ARTIFACT_HASH_MISMATCH"); new PredictiveModelBundle(stored.artifact); if (stored.artifact.algorithm !== "logistic-regression") throw new Error("MODEL_FAMILY_NOT_ELIGIBLE"); }
export function loadStoredModel(path: string): StoredForwardModel { if (!existsSync(path)) return storedInitialModel(); const stored = JSON.parse(readFileSync(path, "utf8")) as StoredForwardModel; verifyStoredModel(stored); return stored; }
