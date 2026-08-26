import type { DatasetRow, TrainingDataset } from "./ml";

export interface HistogramGradientBoostingConfig { maxIter: number; learningRate: number; maxLeafNodes: number; maxDepth: number | null; minSamplesLeaf: number; l2Regularization: number; }
interface HistogramTree { feature: number; thresholds: number[]; values: number[]; }
interface FeatureBins { thresholds: number[]; bins: number[]; binCount: number; }
const sigmoid = (value: number) => value >= 0 ? 1 / (1 + Math.exp(-value)) : Math.exp(value) / (1 + Math.exp(value));

/** Deterministic histogram gradient boosting with binned, multi-leaf base trees. */
export class HistogramGradientBoostingClassifier {
  readonly algorithm = "histogram-gradient-boosting";
  private initialLogit = 0;
  private trees: HistogramTree[] = [];
  private fittedIds: string[] = [];
  private config?: HistogramGradientBoostingConfig;

  fit(dataset: TrainingDataset, config: HistogramGradientBoostingConfig): this {
    if (!dataset.rows.length || dataset.rows.some((row) => row.split !== "TRAIN")) throw new Error("HGB may only fit TRAIN rows");
    if (new Set(dataset.rows.map((row) => row.label)).size < 2) throw new Error("TRAIN_SINGLE_CLASS");
    if (!Number.isInteger(config.maxIter) || config.maxIter <= 0 || !Number.isFinite(config.learningRate) || config.learningRate <= 0 || !Number.isInteger(config.maxLeafNodes) || config.maxLeafNodes < 2 || !Number.isInteger(config.minSamplesLeaf) || config.minSamplesLeaf < 1 || !Number.isFinite(config.l2Regularization) || config.l2Regularization < 0) throw new Error("Invalid HGB configuration");
    const width = dataset.rows[0]!.features.length;
    if (!width || dataset.rows.some((row) => row.features.length !== width || row.features.some((value) => !Number.isFinite(value)))) throw new Error("HGB requires finite equal-width rows");
    this.config = structuredClone(config); this.fittedIds = dataset.rows.map((row) => `${row.symbol}-${row.decisionTimestamp}`); const prevalence = dataset.rows.reduce((sum, row) => sum + row.label, 0) / dataset.rows.length; const bounded = Math.min(1 - 1e-12, Math.max(1e-12, prevalence)); this.initialLogit = Math.log(bounded / (1 - bounded)); this.trees = [];
    const featureBins = Array.from({ length: width }, (_, feature) => this.makeBins(dataset.rows, feature)); const logits = dataset.rows.map(() => this.initialLogit);
    for (let iteration = 0; iteration < config.maxIter; iteration++) { const gradients = dataset.rows.map((row, index) => row.label - sigmoid(logits[index]!)); const hessians = logits.map((logit) => { const p = sigmoid(logit); return Math.max(1e-6, p * (1 - p)); }); const tree = this.fitTree(dataset.rows, gradients, hessians, config, featureBins); this.trees.push(tree); dataset.rows.forEach((_row, index) => { logits[index] += config.learningRate * this.predictTree(tree, dataset.rows[index]!.features); }); }
    return this;
  }

  private makeBins(rows: readonly DatasetRow[], feature: number): FeatureBins { const sorted = rows.map((row) => row.features[feature]!).sort((a, b) => a - b); const binCount = Math.min(32, Math.max(2, sorted.length)); const thresholds = [...new Set(Array.from({ length: binCount - 1 }, (_unused, index) => sorted[Math.min(sorted.length - 1, Math.floor((index + 1) * sorted.length / binCount))]!))]; const bins = rows.map((row) => this.binFor(row.features[feature]!, thresholds)); return { thresholds, bins, binCount: thresholds.length + 1 }; }
  private binFor(value: number, thresholds: readonly number[]): number { let low = 0; let high = thresholds.length; while (low < high) { const middle = Math.floor((low + high) / 2); if (value <= thresholds[middle]!) high = middle; else low = middle + 1; } return low; }

  private fitTree(rows: readonly DatasetRow[], gradients: readonly number[], hessians: readonly number[], config: HistogramGradientBoostingConfig, featureBins: readonly FeatureBins[]): HistogramTree {
    const totalGradient = gradients.reduce((sum, value) => sum + value, 0); const totalHessian = hessians.reduce((sum, value) => sum + value, 0); const rootScore = totalGradient ** 2 / (totalHessian + config.l2Regularization); let bestFeature = 0; let bestGain = -Infinity; let bestSegments: { lo: number; hi: number; gradient: number; hessian: number }[] = [];
    const leafValue = (gradient: number, hessian: number) => gradient / (hessian + config.l2Regularization);
    for (let feature = 0; feature < featureBins.length; feature++) {
      const bins = featureBins[feature]!; const gradientByBin = Array(bins.binCount).fill(0) as number[]; const hessianByBin = Array(bins.binCount).fill(0) as number[]; const countByBin = Array(bins.binCount).fill(0) as number[];
      bins.bins.forEach((bin, index) => { gradientByBin[bin] += gradients[index]!; hessianByBin[bin] += hessians[index]!; countByBin[bin]++; });
      const segments = [{ lo: 0, hi: bins.binCount - 1 }];
      while (segments.length < config.maxLeafNodes) {
        let chosen: { segment: number; split: number; gain: number } | undefined;
        for (let segment = 0; segment < segments.length; segment++) {
          const current = segments[segment]!; let leftGradient = 0; let leftHessian = 0; let leftCount = 0; let totalCount = 0; let fullGradient = 0; let fullHessian = 0; for (let bin = current.lo; bin <= current.hi; bin++) { totalCount += countByBin[bin]!; fullGradient += gradientByBin[bin]!; fullHessian += hessianByBin[bin]!; }
          for (let split = current.lo; split < current.hi; split++) { leftGradient += gradientByBin[split]!; leftHessian += hessianByBin[split]!; leftCount += countByBin[split]!; const rightCount = totalCount - leftCount; if (leftCount < config.minSamplesLeaf || rightCount < config.minSamplesLeaf) continue; const rightGradient = fullGradient - leftGradient; const rightHessian = fullHessian - leftHessian; const gain = leftGradient ** 2 / (leftHessian + config.l2Regularization) + rightGradient ** 2 / (rightHessian + config.l2Regularization) - fullGradient ** 2 / (fullHessian + config.l2Regularization); if (!chosen || gain > chosen.gain) chosen = { segment, split, gain }; }
        }
        if (!chosen || chosen.gain <= 0) break; const original = segments[chosen.segment]!; segments.splice(chosen.segment, 1, { lo: original.lo, hi: chosen.split }, { lo: chosen.split + 1, hi: original.hi });
      }
      const scoredSegments = segments.map((segment) => { let gradient = 0; let hessian = 0; for (let bin = segment.lo; bin <= segment.hi; bin++) { gradient += gradientByBin[bin]!; hessian += hessianByBin[bin]!; } return { ...segment, gradient, hessian }; }); const score = scoredSegments.reduce((sum, segment) => sum + segment.gradient ** 2 / (segment.hessian + config.l2Regularization), 0) - rootScore;
      if (score > bestGain) { bestGain = score; bestFeature = feature; bestSegments = scoredSegments; }
    }
    const bins = featureBins[bestFeature]!; const values = bestSegments.length ? bestSegments.map((segment) => leafValue(segment.gradient, segment.hessian)) : [leafValue(totalGradient, totalHessian)]; const thresholds = bestSegments.slice(0, -1).map((segment) => bins.thresholds[segment.hi]!); return { feature: bestFeature, thresholds, values };
  }

  private predictTree(tree: HistogramTree, features: readonly number[]): number { const bin = this.binFor(features[tree.feature]!, tree.thresholds); return tree.values[Math.min(tree.values.length - 1, bin)]!; }
  predictProbability(features: readonly number[]): number { if (!this.config || !this.trees.length || features.some((value) => !Number.isFinite(value))) throw new Error("HGB is not fitted or features are invalid"); return sigmoid(this.trees.reduce((logit, tree) => logit + this.config!.learningRate * this.predictTree(tree, features), this.initialLogit)); }
  metadata() { if (!this.config) throw new Error("HGB is not fitted"); return { algorithm: this.algorithm, config: structuredClone(this.config), initialLogit: this.initialLogit, iterations: this.trees.length, fittedObservationIds: [...this.fittedIds] }; }
}
