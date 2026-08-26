import test from "node:test";
import assert from "node:assert/strict";
import { HistogramGradientBoostingClassifier } from "../src/hgb";
import { trainingDataset, type DatasetRow } from "../src/ml";

const rows = (split: DatasetRow["split"] = "TRAIN"): DatasetRow[] => [
  { symbol: "TEST", decisionTimestamp: 1, features: [-2, 0], label: 0, split },
  { symbol: "TEST", decisionTimestamp: 2, features: [-1, 0.2], label: 0, split },
  { symbol: "TEST", decisionTimestamp: 3, features: [1, 0.2], label: 1, split },
  { symbol: "TEST", decisionTimestamp: 4, features: [2, 0], label: 1, split },
];
const config = { maxIter: 8, learningRate: 0.05, maxLeafNodes: 7, maxDepth: null, minSamplesLeaf: 1, l2Regularization: 1 };

test("HGB produces deterministic finite probabilities and metadata", () => {
  const dataset = trainingDataset(rows());
  const first = new HistogramGradientBoostingClassifier().fit(dataset, config);
  const second = new HistogramGradientBoostingClassifier().fit(dataset, config);
  const probabilities = rows().map((row) => first.predictProbability(row.features));
  assert.deepEqual(probabilities, rows().map((row) => second.predictProbability(row.features)));
  assert.ok(probabilities.every((value) => Number.isFinite(value) && value >= 0 && value <= 1));
  assert.equal(first.metadata().fittedObservationIds.length, rows().length);
  assert.deepEqual(first.metadata().config, config);
});

test("HGB rejects non-TRAIN rows and single-class training", () => {
  assert.throws(() => new HistogramGradientBoostingClassifier().fit(trainingDataset(rows("TEST")), config), /TRAIN/);
  assert.throws(() => new HistogramGradientBoostingClassifier().fit(trainingDataset(rows().map((row) => ({ ...row, label: 1 as 0 | 1 }))), config), /SINGLE_CLASS/);
});
