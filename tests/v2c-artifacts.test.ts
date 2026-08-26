import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifyArtifactManifest } from "../src/serialization";

const json = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const v2cDir = "research/v2c";

test("V2C freezes exact V2B folds, features, target, and three HGB candidates", () => {
  const v2b = json<{ temporalFolds: unknown[] }>("research/v2b/candidate-v2b-spec.json");
  const v2c = json<{ temporalFoldBoundaries: unknown[]; baselineModel: { featureSetVersion: string; featureIds: string[] }; candidateModel: { featureSetVersion: string; featureIds: string[] }; target: { targetVersion: string; labelPolicyVersion: string }; hyperparameterCandidates: unknown[]; finalHoldoutStatus: string }>(`${v2cDir}/candidate-v2c-spec.json`);
  assert.deepEqual(v2c.temporalFoldBoundaries, v2b.temporalFolds);
  assert.equal(v2c.baselineModel.featureSetVersion, "candidate-ohlcv-v3");
  assert.equal(v2c.candidateModel.featureSetVersion, "candidate-ohlcv-v3");
  assert.deepEqual(v2c.baselineModel.featureIds, v2c.candidateModel.featureIds);
  assert.equal(v2c.target.targetVersion, "triple-barrier-next-open-20-u1.5-d1-v1");
  assert.equal(v2c.target.labelPolicyVersion, "tb-up-vs-down-exclude-timeout-ambiguous-v1");
  assert.equal(v2c.hyperparameterCandidates.length, 3);
  assert.equal(v2c.finalHoldoutStatus, "LOCKED");
});

test("V2C selection and calibration never use evaluation rows", () => {
  const selection = json<{ baseline: { evaluationUsed: boolean; selectionSource: string }[]; candidate: { evaluationUsed: boolean; selectionSource: string }[] }>(`${v2cDir}/hyperparameter-selection.json`);
  for (const item of [...selection.baseline, ...selection.candidate]) {
    assert.equal(item.evaluationUsed, false);
    assert.equal(item.selectionSource, "validation-log-loss-only");
  }
  const calibration = json<{ calibratorTraining: string }>(`${v2cDir}/calibration-comparison.json`);
  assert.match(calibration.calibratorTraining, /CALIBRATION split only/);
  assert.match(calibration.calibratorTraining, /evaluation labels never used/);
});

test("V2C comparable observations have exact parity and finite bounded probabilities", () => {
  const parity = json<{ baseline: { missingRuntimeFeatureCount: number; mismatchCount: number; parityStatus: string }; candidate: { missingRuntimeFeatureCount: number; mismatchCount: number; parityStatus: string }; missingObservationIds: string[]; mismatchedObservationIds: string[] }>(`${v2cDir}/feature-parity.json`);
  assert.deepEqual([parity.baseline.missingRuntimeFeatureCount, parity.baseline.mismatchCount, parity.candidate.missingRuntimeFeatureCount, parity.candidate.mismatchCount], [0, 0, 0, 0]);
  assert.deepEqual([parity.baseline.parityStatus, parity.candidate.parityStatus], ["PASS", "PASS"]);
  assert.deepEqual(parity.missingObservationIds, []);
  assert.deepEqual(parity.mismatchedObservationIds, []);
  const temporal = json<{ folds: { comparableRows: number; baselineEligibleRows: number; candidateEligibleRows: number; missingBaselineObservationIds: string[]; mismatchedObservationIds: string[] }[]; aggregate: { probabilityDistributions: Record<string, { minimum: number; maximum: number }>; comparableObservationCount: number; baselineFoldMetrics: { logLoss: number; brier: number; rocAuc: number }[]; candidateFoldMetrics: { logLoss: number; brier: number; rocAuc: number }[]; foldMeans: { baseline: { logLoss: number; brier: number; rocAuc: number }; candidate: { logLoss: number; brier: number; rocAuc: number } } } }>(`${v2cDir}/temporal-fold-comparison.json`);
  assert.equal(temporal.folds.length, 4);
  for (const fold of temporal.folds) {
    assert.equal(fold.baselineEligibleRows, fold.comparableRows);
    assert.equal(fold.candidateEligibleRows, fold.comparableRows);
    assert.deepEqual(fold.missingBaselineObservationIds, []);
    assert.deepEqual(fold.mismatchedObservationIds, []);
  }
  assert.equal(temporal.aggregate.comparableObservationCount, 8800);
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  for (const key of ["logLoss", "brier", "rocAuc"] as const) {
    assert.equal(temporal.aggregate.foldMeans.baseline[key], mean(temporal.aggregate.baselineFoldMetrics.map((row) => row[key])));
    assert.equal(temporal.aggregate.foldMeans.candidate[key], mean(temporal.aggregate.candidateFoldMetrics.map((row) => row[key])));
  }
  for (const value of Object.values(temporal.aggregate.probabilityDistributions)) {
    assert.ok(Number.isFinite(value.minimum) && Number.isFinite(value.maximum));
    assert.ok(value.minimum >= 0 && value.maximum <= 1);
  }
});

test("V2C keeps every final-holdout counter at zero and verifies artifacts", () => {
  const audit = json<Record<string, unknown>>(`${v2cDir}/holdout-lock-audit.json`);
  assert.equal(audit.finalHoldoutStatus, "LOCKED");
  assert.equal(audit.verification, "PASS");
  for (const [key, value] of Object.entries(audit)) if (key.startsWith("finalHoldout") && typeof value === "number") assert.equal(value, 0, key);
  const decision = json<{ criteria: Record<string, { passed: boolean }>; developmentSelectionGate: string; finalHoldoutEvaluation: string }>(`${v2cDir}/candidate-v2c-decision.json`);
  assert.equal(decision.developmentSelectionGate, Object.values(decision.criteria).every((item) => item.passed) ? "PASS" : "FAIL");
  assert.equal(decision.finalHoldoutEvaluation, "NOT_PERFORMED");
  const manifest = json<{ artifacts: { relativePath: string; sizeBytes: number; sha256: string }[] }>(`${v2cDir}/artifact-manifest.json`);
  assert.deepEqual(verifyArtifactManifest(v2cDir, manifest), { valid: true, failures: [] });
});
