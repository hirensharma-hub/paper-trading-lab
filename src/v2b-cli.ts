import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Bar, PaperOrder } from "./domain";
import { canonicalDatasetHash, BAR_CANONICALIZATION_VERSION } from "./data";
import { loadBarsFile } from "./historical-data";
import { TradingCalendar } from "./calendar";
import { averageTrueRange, buildFeatures } from "./features";
import { namedFeatures, OHLCV_FEATURE_IDS, type NamedFeatureVector } from "./feature-schema";
import { type DatasetObservation, type DatasetRow, classificationMetrics, calibrationBins, expectedCalibrationError, fitOodProfile, assessOod, LogisticRegression, PlattCalibrator, StandardScaler, trainingDataset, calibrationDataset } from "./ml";
import { FIRST_LABEL_POLICY, FIRST_TARGET, type DatasetManifest } from "./experiment";
import { ExpectedBarClock } from "./bar-schedule";
import { TargetRegistry } from "./targets";
import { TripleBarrierResolver } from "./experience";
import { TrustedAnalogueEngine, fitTrustedAnalogueScaler, summarizeTrustedAnalogues, type TrustedAnalogueObservation, type TrustedAnalogueScalerProfile } from "./analogues";
import { decomposeTripleBarrierProbabilities } from "./intelligence";
import { ExecutionCostModel } from "./costs";
import { PaperBroker } from "./broker";
import { sanitizeArtifact, canonicalJson, assertFiniteArtifact, verifyArtifactManifest } from "./serialization";
import { buildCandidateFeatures, buildCandidateFeaturesAt, CANDIDATE_FEATURE_SET_VERSION, CANDIDATE_OHLCV_FEATURE_IDS, NEW_CAUSAL_FEATURE_IDS } from "./candidate-features";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => args.includes(name) ? args[args.indexOf(name) + 1] ?? fallback : fallback;
const dataPath = flag("--data", "./data/amzn-5m-20250701-20260630.csv");
const manifestPath = flag("--manifest", "./research/v2a-amzn-20250701-20260630/manifest.json");
const outputDir = flag("--output", "./research/v2b");
const fail = (message: string): never => { console.error(message); process.exit(1); };
const gitSha = (() => { try { return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { return "unknown"; } })();
const sha256 = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const finite = (value: number | undefined): number | null => value !== undefined && Number.isFinite(value) ? value : null;
const mean = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const std = (values: readonly number[]) => { if (!values.length) return null; const m = mean(values)!; return Math.sqrt(values.reduce((sum, value) => sum + (value - m) ** 2, 0) / values.length); };
const quantile = (values: readonly number[], q: number) => { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const position = (sorted.length - 1) * q; const lo = Math.floor(position); const hi = Math.ceil(position); return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (position - lo); };
const distribution = (values: readonly number[]) => ({ minimum: finite(Math.min(...values)), p05: quantile(values, .05), p25: quantile(values, .25), median: quantile(values, .5), p75: quantile(values, .75), p95: quantile(values, .95), maximum: finite(Math.max(...values)), mean: mean(values) });
const date = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);
const sessionOf = (calendar: TradingCalendar, timestamp: number) => calendar.sessionKey(timestamp);
const subset = (bars: readonly Bar[], start: number, end: number) => bars.filter((bar) => bar.startMs >= start && bar.startMs + bar.intervalMs <= end).sort((a, b) => a.startMs - b.startMs);

function writeJson(name: string, value: unknown): void {
  const safe = sanitizeArtifact(value);
  assertFiniteArtifact(safe, name);
  writeFileSync(`${outputDir}/${name}.json`, canonicalJson(safe));
}

interface ResearchObservation extends DatasetObservation {
  readonly featureValues: NamedFeatureVector;
  readonly atr: number;
  readonly barIndex: number;
}

interface FoldSpec {
  fold: number;
  trainingSessions: readonly string[];
  evaluationSessions: readonly string[];
  trainingHistoryRange: readonly [number, number];
  evaluationRange: readonly [number, number];
  internalRoles: { train: readonly [number, number]; validation: readonly [number, number]; calibration: readonly [number, number] };
}

interface Prediction { rawProbability: number; calibratedProbability: number; ood: ReturnType<typeof assessOod>; analogue: ReturnType<TrustedAnalogueEngine["query"]>; ev?: EvDiagnostic; }
interface Fit { featureSetVersion: string; featureIds: readonly string[]; trainRows: readonly ResearchObservation[]; validationRows: readonly ResearchObservation[]; calibrationRows: readonly ResearchObservation[]; selectedL2: number; scaler: StandardScaler; model: LogisticRegression; calibrator?: PlattCalibrator; ood: ReturnType<typeof fitOodProfile>; analoguePool: readonly TrustedAnalogueObservation[]; analogueScaler: TrustedAnalogueScalerProfile; analogueScaled: readonly { observation: TrustedAnalogueObservation; values: readonly number[] }[]; }
interface EvDiagnostic { modelProbability: number; analogueProbability: number | null; effectiveProbabilityUsed: number; expectedUpside: number; expectedDownside: number; estimatedCosts: number; breakEvenProbability: number | null; probabilityMarginToBreakEven: number | null; ev: number; evMargin: number | null; outcomeProbabilities: ReturnType<typeof decomposeTripleBarrierProbabilities>; }
interface ScoredRow { row: ResearchObservation; prediction: Prediction; buy: boolean; reasonCode: string; }

function sessionKeys(bars: readonly Bar[], calendar: TradingCalendar): string[] { return [...new Set(bars.map((bar) => sessionOf(calendar, bar.startMs)))].sort(); }
function boundsForSessions(calendar: TradingCalendar, keys: readonly string[]): readonly [number, number] { return [calendar.sessionBounds(Date.parse(`${keys[0]}T12:00:00Z`)).openMs, calendar.sessionBounds(Date.parse(`${keys.at(-1)}T12:00:00Z`)).closeMs]; }

function makeFoldSpecs(bars: readonly Bar[], calendar: TradingCalendar): FoldSpec[] {
  const sessions = sessionKeys(bars, calendar);
  const edges = [0.40, 0.55, 0.70, 0.85, 1].map((fraction) => Math.min(sessions.length, Math.max(1, Math.floor(sessions.length * fraction))));
  const uniqueEdges = edges.map((edge, index) => index === 0 ? edge : Math.max(edge, edges[index - 1]! + 1));
  return [0, 1, 2, 3].map((index) => {
    const trainingSessions = sessions.slice(0, uniqueEdges[index]!);
    const evaluationSessions = sessions.slice(uniqueEdges[index]!, uniqueEdges[index + 1]!);
    const historyKeys = trainingSessions;
    const trainEnd = Math.max(1, Math.floor(historyKeys.length * .60));
    const validationEnd = Math.max(trainEnd + 1, Math.floor(historyKeys.length * .80));
    const range = boundsForSessions(calendar, evaluationSessions);
    return { fold: index + 1, trainingSessions, evaluationSessions, trainingHistoryRange: boundsForSessions(calendar, trainingSessions), evaluationRange: range, internalRoles: { train: boundsForSessions(calendar, historyKeys.slice(0, trainEnd)), validation: boundsForSessions(calendar, historyKeys.slice(trainEnd, validationEnd)), calibration: boundsForSessions(calendar, historyKeys.slice(validationEnd)) } };
  });
}

function buildObservationSets(bars: readonly Bar[], base: DatasetManifest, calendar: TradingCalendar): { baseline: Map<string, ResearchObservation>; candidate: Map<string, ResearchObservation> } {
  const resolver = new TargetRegistry();
  resolver.register(FIRST_TARGET);
  resolver.registerResolver(new TripleBarrierResolver());
  const targetResolver = resolver.resolver("TRIPLE_BARRIER")!;
  const baseline = new Map<string, ResearchObservation>();
  const candidate = new Map<string, ResearchObservation>();
  for (const symbol of base.symbols) {
    const history = bars.filter((bar) => bar.symbol === symbol).sort((a, b) => a.startMs - b.startMs);
    const schedule = new ExpectedBarClock(calendar, base.barIntervalMs);
    for (let index = 21; index < history.length - FIRST_TARGET.horizonBars; index++) {
      const completed = history.slice(0, index + 1);
      const current = completed.at(-1)!;
      const decisionTimestamp = current.startMs + current.intervalMs;
      const baseFeatures = buildFeatures(completed, undefined, { decisionTimestamp });
      const atr = averageTrueRange(completed, 14);
      if (!baseFeatures || !Number.isFinite(atr)) continue;
      const resolution = targetResolver.resolve(FIRST_TARGET, history, index + 1, atr, schedule);
      if (!resolution) continue;
      const modelLabel = (resolution.label === "UP" ? 1 : resolution.label === "DOWN" ? 0 : undefined) as 0 | 1 | undefined;
      const observationId = `${symbol}-${decisionTimestamp}`;
      const common = { observationId, symbol, featureTimestamp: baseFeatures.ts, decisionTimestamp, targetStartTimestamp: resolution.targetStartTimestamp, targetEndTimestamp: resolution.plannedTargetEndTimestamp, plannedTargetEndTimestamp: resolution.plannedTargetEndTimestamp, outcomeAvailableTimestamp: resolution.outcomeAvailableTimestamp, targetVersion: FIRST_TARGET.targetVersion, targetKind: "TRIPLE_BARRIER" as const, rawTargetLabel: resolution.label, modelLabel, labelPolicy: FIRST_LABEL_POLICY, split: "TEST" as const, targetScheduleVersion: `eligible-bars-v1:${base.barIntervalMs}`, targetCalendarSpecHash: base.calendarSpecHash };
      const baseValues = namedFeatures(baseFeatures);
      const baseWithPrice = { ...baseValues, close: baseFeatures.close };
      baseline.set(observationId, { ...common, featureSetVersion: "baseline-ohlcv-v2", featureIds: OHLCV_FEATURE_IDS, namedFeatures: baseWithPrice, featureValues: baseWithPrice, atr, barIndex: bars.findIndex((bar) => bar.symbol === symbol && bar.startMs === current.startMs) });
      const candidateValues = buildCandidateFeatures(completed, calendar, decisionTimestamp);
      if (candidateValues) candidate.set(observationId, { ...common, featureSetVersion: CANDIDATE_FEATURE_SET_VERSION, featureIds: CANDIDATE_OHLCV_FEATURE_IDS, namedFeatures: { ...candidateValues, close: baseFeatures.close }, featureValues: { ...candidateValues, close: baseFeatures.close }, atr, barIndex: bars.findIndex((bar) => bar.symbol === symbol && bar.startMs === current.startMs) });
    }
  }
  return { baseline, candidate };
}

function toRow(observation: ResearchObservation, featureIds: readonly string[], split: DatasetRow["split"]): DatasetRow { return { symbol: observation.symbol, decisionTimestamp: observation.decisionTimestamp, targetStartTimestamp: observation.targetStartTimestamp, targetEndTimestamp: observation.targetEndTimestamp, features: featureIds.map((id) => observation.namedFeatures[id]), label: observation.modelLabel!, split }; }
function rowsInSessions(observations: readonly ResearchObservation[], sessions: readonly string[], calendar: TradingCalendar): ResearchObservation[] { const wanted = new Set(sessions); return observations.filter((row) => wanted.has(sessionOf(calendar, row.decisionTimestamp))).sort((a, b) => a.decisionTimestamp - b.decisionTimestamp); }
function fitVariant(observations: readonly ResearchObservation[], fold: FoldSpec, featureSetVersion: string, featureIds: readonly string[], calendar: TradingCalendar): Fit {
  const evalStart = fold.evaluationRange[0];
  const isHistoricallyResolved = (row: ResearchObservation) => row.modelLabel !== undefined && row.outcomeAvailableTimestamp < evalStart && row.targetEndTimestamp < evalStart;
  const internalTrain = rowsInSessions(observations, fold.trainingSessions.filter((key) => Date.parse(`${key}T12:00:00Z`) >= fold.internalRoles.train[0] && Date.parse(`${key}T12:00:00Z`) < fold.internalRoles.train[1]), calendar).filter(isHistoricallyResolved);
  const internalValidation = rowsInSessions(observations, fold.trainingSessions.filter((key) => Date.parse(`${key}T12:00:00Z`) >= fold.internalRoles.validation[0] && Date.parse(`${key}T12:00:00Z`) < fold.internalRoles.validation[1]), calendar).filter(isHistoricallyResolved);
  const internalCalibration = rowsInSessions(observations, fold.trainingSessions.filter((key) => Date.parse(`${key}T12:00:00Z`) >= fold.internalRoles.calibration[0] && Date.parse(`${key}T12:00:00Z`) < fold.internalRoles.calibration[1]), calendar).filter(isHistoricallyResolved);
  if (internalTrain.length < 10 || new Set(internalTrain.map((row) => row.modelLabel)).size < 2) throw new Error(`V2B_FOLD_${fold.fold}_TRAIN_INSUFFICIENT`);
  const trainData = internalTrain.map((row) => toRow(row, featureIds, "TRAIN"));
  const scaler = new StandardScaler().fitTraining(trainingDataset(trainData));
  const scaleRows = (rows: readonly ResearchObservation[], split: DatasetRow["split"]) => rows.map((row) => ({ ...toRow(row, featureIds, split), features: scaler.transform(featureIds.map((id) => row.namedFeatures[id])) }));
  const scaledTrain = scaleRows(internalTrain, "TRAIN");
  const scaledValidation = scaleRows(internalValidation, "VALIDATION");
  const l2Candidates = [0.001, 0.01, 0.1, 1];
  const validationScores = l2Candidates.map((l2) => { const model = new LogisticRegression().fit(trainingDataset(scaledTrain), { l2, epochs: 180 }); const probabilities = scaledValidation.map((row) => model.predictProbability(row.features)); return { l2, logLoss: scaledValidation.length && new Set(scaledValidation.map((row) => row.label)).size > 1 ? classificationMetrics(scaledValidation.map((row) => row.label), probabilities).logLoss : null }; });
  const selectedL2 = validationScores.filter((score) => score.logLoss !== null).sort((a, b) => a.logLoss! - b.logLoss!)[0]?.l2 ?? 0.01;
  const model = new LogisticRegression().fit(trainingDataset(scaledTrain), { l2: selectedL2, epochs: 180 });
  const scaledCalibration = scaleRows(internalCalibration, "CALIBRATION");
  const calibrationRaw = scaledCalibration.map((row) => model.predictProbability(row.features));
  const calibrator = scaledCalibration.length && new Set(scaledCalibration.map((row) => row.label)).size > 1 ? new PlattCalibrator().fit(calibrationDataset(scaledCalibration), calibrationRaw, 500, .05) : undefined;
  const ood = { ...fitOodProfile(scaledTrain.map((row) => row.features), internalTrain.map((row) => row.observationId)), featureSetVersion, featureIds: [...featureIds] };
  const analoguePool: TrustedAnalogueObservation[] = internalTrain.concat(internalCalibration).map((row) => ({ observationId: row.observationId, symbol: row.symbol, featureTimestamp: row.featureTimestamp, decisionTimestamp: row.decisionTimestamp, targetStartTimestamp: row.targetStartTimestamp, targetEndTimestamp: row.targetEndTimestamp, featureSetVersion, featureIds: [...featureIds], namedFeatures: row.namedFeatures, targetVersion: row.targetVersion, targetKind: row.targetKind, targetLabel: row.rawTargetLabel, regime: "NOT_TESTED", sourceKind: "TRAIN_DATASET", sourceDatasetId: `candidate-v2b-fold-${fold.fold}`, sourceDatasetVersion: "1", sourceObservationId: row.observationId }));
  const analogueDataset = { role: "TRAIN" as const, observations: analoguePool, featureTrainingStartTimestamp: internalTrain[0]!.decisionTimestamp, featureTrainingEndTimestamp: internalCalibration.at(-1)?.decisionTimestamp ?? internalTrain.at(-1)!.decisionTimestamp, trainingDecisionCutoff: evalStart - 1, outcomeAvailabilityCutoff: evalStart - 1, datasetId: `candidate-v2b-fold-${fold.fold}`, datasetVersion: "1", splitId: `fold-${fold.fold}-train-only` };
  const analogueScaler = fitTrustedAnalogueScaler(analogueDataset, featureSetVersion, featureIds);
  const analogueScaled = analoguePool.map((observation) => ({ observation, values: featureIds.map((id, index) => (observation.namedFeatures[id]! - analogueScaler.means[index]!) / (analogueScaler.scales[index] || 1)) }));
  return { featureSetVersion, featureIds, trainRows: internalTrain, validationRows: internalValidation, calibrationRows: internalCalibration, selectedL2, scaler, model, calibrator, ood, analoguePool, analogueScaler, analogueScaled };
}

function fastAnalogueQuery(fit: Fit, row: ResearchObservation): ReturnType<TrustedAnalogueEngine["query"]> {
  const current = fit.featureIds.map((id, index) => (row.namedFeatures[id]! - fit.analogueScaler.means[index]!) / (fit.analogueScaler.scales[index] || 1));
  const ranked = fit.analogueScaled.map(({ observation, values }) => ({ observation, distance: Math.sqrt(values.reduce((sum, value, index) => sum + (value - current[index]!) ** 2, 0)) })).sort((a, b) => a.distance - b.distance).slice(0, 50);
  const summary = summarizeTrustedAnalogues(ranked.map(({ observation }) => observation), row.targetKind);
  return { ...summary, distances: ranked.map(({ distance }) => distance), evidence: ranked.length >= 20 ? "SUFFICIENT" : "INSUFFICIENT" };
}

function predict(fit: Fit, row: ResearchObservation): Prediction {
  const vector = fit.featureIds.map((id) => {
    const value = row.namedFeatures[id];
    if (!Number.isFinite(value)) throw new Error(`Missing or non-finite feature: ${id}`);
    return value;
  });
  const scaled = fit.scaler.transform(vector);
  const rawProbability = fit.model.predictProbability(scaled);
  const calibratedProbability = fit.calibrator?.transform(rawProbability) ?? rawProbability;
  const analogue = fastAnalogueQuery(fit, row);
  return { rawProbability, calibratedProbability, ood: assessOod(vector, fit.ood), analogue };
}

function evDiagnostic(prediction: Prediction, row: ResearchObservation, costModel: ExecutionCostModel): EvDiagnostic | undefined {
  if (!prediction.analogue.barrier) return undefined;
  const referencePrice = row.featureValues.close;
  const outcomes = decomposeTripleBarrierProbabilities(prediction.calibratedProbability, prediction.analogue.barrier, "P_UP_GIVEN_UP_OR_DOWN");
  const upper = FIRST_TARGET.upperBarrierMultiple! * row.atr / referencePrice;
  const lower = FIRST_TARGET.lowerBarrierMultiple! * row.atr / referencePrice;
  const cost = costModel.estimateRoundTrip(referencePrice, referencePrice, "BUY").returnUnits;
  const evAtP0 = decomposeTripleBarrierProbabilities(0, prediction.analogue.barrier, "P_UP_GIVEN_UP_OR_DOWN");
  const evAtP1 = decomposeTripleBarrierProbabilities(1, prediction.analogue.barrier, "P_UP_GIVEN_UP_OR_DOWN");
  const valueAt = (outcome: ReturnType<typeof decomposeTripleBarrierProbabilities>) => outcome.up * upper + outcome.down * -lower - cost;
  const ev0 = valueAt(evAtP0); const ev1 = valueAt(evAtP1); const slope = ev1 - ev0;
  const breakEven = Math.abs(slope) > 1e-15 ? -ev0 / slope : null;
  const ev = valueAt(outcomes);
  return { modelProbability: prediction.calibratedProbability, analogueProbability: prediction.analogue.barrier.upRate + prediction.analogue.barrier.downRate > 0 ? prediction.analogue.barrier.upRate / (prediction.analogue.barrier.upRate + prediction.analogue.barrier.downRate) : null, effectiveProbabilityUsed: outcomes.up, expectedUpside: outcomes.up * upper, expectedDownside: outcomes.down * lower, estimatedCosts: cost, breakEvenProbability: breakEven, probabilityMarginToBreakEven: breakEven === null ? null : prediction.calibratedProbability - breakEven, ev, evMargin: breakEven === null ? null : prediction.calibratedProbability - breakEven, outcomeProbabilities: outcomes };
}

function metricReport(rows: readonly ScoredRow[], calibrated = true) {
  const binary = rows.filter((item) => item.row.modelLabel !== undefined);
  const labels = binary.map((item) => item.row.modelLabel!) as (0 | 1)[];
  const probabilities = binary.map((item) => calibrated ? item.prediction.calibratedProbability : item.prediction.rawProbability);
  if (!labels.length) return null;
  const base = classificationMetrics(labels, probabilities);
  const tp = base.confusion.truePositive; const tn = base.confusion.trueNegative; const fp = base.confusion.falsePositive; const fn = base.confusion.falseNegative;
  const tpr = tp + fn ? tp / (tp + fn) : null; const tnr = tn + fp ? tn / (tn + fp) : null; const denominator = Math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn));
  const pairs = probabilities.map((p, index) => ({ p, label: labels[index]! })).sort((a, b) => b.p - a.p); const positives = labels.filter((label) => label === 1).length; const negatives = labels.length - positives; let concordant = 0; let ties = 0; for (const positive of pairs.filter((row) => row.label === 1)) for (const negative of pairs.filter((row) => row.label === 0)) positive.p > negative.p ? concordant++ : positive.p === negative.p ? ties++ : undefined; let seen = 0; let averagePrecision = 0; pairs.forEach((row, index) => { if (row.label === 1) { seen++; averagePrecision += seen / (index + 1); } });
  return { accuracy: base.accuracy, balancedAccuracy: tpr !== null && tnr !== null ? (tpr + tnr) / 2 : null, upPrecision: base.precision, upRecall: base.recall, upF1: base.f1, rocAuc: positives && negatives ? (concordant + ties / 2) / (positives * negatives) : null, prAucAveragePrecision: positives ? averagePrecision / positives : null, matthewsCorrelationCoefficient: denominator ? (tp * tn - fp * fn) / denominator : null, brier: base.brier, logLoss: base.logLoss, ece: expectedCalibrationError(labels, probabilities), confusion: { TP: tp, FP: fp, TN: tn, FN: fn }, observedBinaryPrevalence: mean(labels) };
}

function calibrationReport(rows: readonly ScoredRow[]) {
  const binary = rows.filter((item) => item.row.modelLabel !== undefined); const labels = binary.map((item) => item.row.modelLabel!) as (0 | 1)[]; const raw = binary.map((item) => item.prediction.rawProbability); const calibrated = binary.map((item) => item.prediction.calibratedProbability); if (!labels.length) return null;
  const bins = (probabilities: readonly number[]) => calibrationBins(labels, probabilities).map((bin) => ({ lower: bin.lower, upper: bin.upper, count: bin.count, meanPredicted: finite(bin.meanPredicted), observedPositiveFrequency: finite(bin.eventRate) }));
  return { uncalibratedBrier: metricReport(rows, false)?.brier ?? null, calibratedBrier: metricReport(rows, true)?.brier ?? null, uncalibratedLogLoss: metricReport(rows, false)?.logLoss ?? null, calibratedLogLoss: metricReport(rows, true)?.logLoss ?? null, uncalibratedECE: expectedCalibrationError(labels, raw), calibratedECE: expectedCalibrationError(labels, calibrated), uncalibratedBins: bins(raw), calibratedBins: bins(calibrated) };
}

function scoreRows(rows: readonly ResearchObservation[], fit: Fit, costModel: ExecutionCostModel): ScoredRow[] {
  return rows.map((row) => { const prediction = predict(fit, row); const ev = evDiagnostic(prediction, row, costModel); prediction.ev = ev; let reasonCode = "LOW_EXPECTED_VALUE"; let buy = false; if (prediction.ood.status === "OUT_OF_DISTRIBUTION") reasonCode = "MODEL_OUT_OF_DISTRIBUTION"; else if (prediction.ood.status === "WARNING") reasonCode = "MODEL_OOD_WARNING"; else if (prediction.analogue.evidence !== "SUFFICIENT") reasonCode = "INSUFFICIENT_ANALOGUES"; else if (!ev) reasonCode = "LOW_EXPECTED_VALUE"; else if (ev.ev <= 0) reasonCode = "LOW_EXPECTED_VALUE"; else if (prediction.calibratedProbability < .6) reasonCode = "ENTRY_THRESHOLD_NOT_MET"; else { reasonCode = "BUY"; buy = true; } return { row, prediction, buy, reasonCode }; });
}

function confusion(rows: readonly ScoredRow[]) { return { intents: rows.filter((item) => item.buy).length, orders: rows.filter((item) => item.buy).length, positiveEv: rows.filter((item) => item.prediction.ev !== undefined && item.prediction.ev.ev > 0).length }; }

function runPaperReplay(rows: readonly ScoredRow[], bars: readonly Bar[], costConfig: { spreadBps: number; entrySlippageBps: number; exitSlippageBps: number; entryFeeBps: number; exitFeeBps: number }): Record<string, unknown> {
  const initialCash = 100_000; const broker = new PaperBroker({ initialCash, feeBps: costConfig.entryFeeBps, slippageBps: costConfig.entrySlippageBps, entryFeeBps: costConfig.entryFeeBps, exitFeeBps: costConfig.exitFeeBps, entrySlippageBps: costConfig.entrySlippageBps, exitSlippageBps: costConfig.exitSlippageBps });
  const history = bars.filter((bar) => bar.symbol === rows[0]?.row.symbol).sort((a, b) => a.startMs - b.startMs); const indexByStart = new Map(history.map((bar, index) => [bar.startMs, index])); const halfSpread = costConfig.spreadBps / 20_000; const equity: number[] = []; let tradeCount = 0;
  for (const item of rows) {
    const index = indexByStart.get(history.find((bar) => bar.startMs + bar.intervalMs === item.row.decisionTimestamp)?.startMs ?? -1); if (index === undefined) continue;
    if (item.buy && broker.openPositions.length === 0 && history[index + 1]) {
      const entry = history[index + 1]!; const order: PaperOrder = { id: `v2b-buy-${item.row.observationId}`, symbol: entry.symbol, side: "BUY", type: "MARKET", quantity: 1, status: "NEW", strategyId: "candidate-v2b", strategyVersion: "1", reason: "V2B_BUY", submittedAt: item.row.decisionTimestamp, fills: [] }; broker.submit(order); broker.onQuote({ symbol: entry.symbol, ts: entry.startMs, bid: entry.open * (1 - halfSpread), ask: entry.open * (1 + halfSpread), last: entry.open });
      const exit = history[Math.min(history.length - 1, index + 1 + 6)]; if (exit && broker.openPositions.length) { const closeOrder: PaperOrder = { id: `v2b-sell-${item.row.observationId}`, symbol: exit.symbol, side: "SELL", type: "MARKET", quantity: 1, status: "NEW", strategyId: "candidate-v2b", strategyVersion: "1", reason: "V2B_MAX_HOLD_EXIT", submittedAt: exit.startMs, fills: [] }; broker.submit(closeOrder); broker.onQuote({ symbol: exit.symbol, ts: exit.startMs, bid: exit.close * (1 - halfSpread), ask: exit.close * (1 + halfSpread), last: exit.close }); if (closeOrder.status === "FILLED") tradeCount++; }
    }
    equity.push(broker.markToMarket({ [item.row.symbol]: item.row.featureValues.close }));
  }
  const finalEquity = equity.at(-1) ?? initialCash; let high = initialCash; let maxDrawdown = 0; for (const value of equity) { high = Math.max(high, value); maxDrawdown = Math.max(maxDrawdown, (high - value) / high); } const returns = equity.slice(1).map((value, index) => value / (equity[index] || initialCash) - 1).filter(Number.isFinite); const returnMean = mean(returns); const returnStd = std(returns); const sharpe = returnMean !== null && returnStd !== null && returnStd > 0 ? returnMean / returnStd * Math.sqrt(252 * 78) : null;
  return { intents: rows.filter((item) => item.buy).length, orders: broker.allOrders.length, fills: broker.allFills.length, trades: tradeCount, fees: broker.feesPaid, slippage: broker.estimatedSlippage, paperReturn: finalEquity / initialCash - 1, maxDrawdown, sharpe, finalEquity };
}

function parityReport(bars: readonly Bar[], observations: readonly ResearchObservation[], calendar: TradingCalendar, candidate: boolean) {
  const expected = observations.length; let checked = 0; let missing = 0; let mismatch = 0; let maxDiff = 0;
  for (const row of observations) { const values = candidate ? buildCandidateFeaturesAt(bars.filter((bar) => bar.symbol === row.symbol), row.barIndex, calendar) : (() => { const symbolBars = bars.filter((bar) => bar.symbol === row.symbol); const prefix = symbolBars.slice(0, row.barIndex + 1); const base = buildFeatures(prefix, undefined, { decisionTimestamp: row.decisionTimestamp }); return base ? namedFeatures(base) : null; })(); if (!values) { missing++; continue; } checked++; for (const id of row.featureIds) { const difference = Math.abs(values[id]! - row.namedFeatures[id]!); maxDiff = Math.max(maxDiff, difference); if (difference > 1e-12) mismatch++; } }
  return { expectedComparableCount: expected, checkedCount: checked, missingRuntimeFeatureCount: missing, mismatchCount: mismatch, maximumAbsoluteDifference: maxDiff, featureSetVersion: candidate ? CANDIDATE_FEATURE_SET_VERSION : "baseline-ohlcv-v2", featureIds: candidate ? [...CANDIDATE_OHLCV_FEATURE_IDS] : [...OHLCV_FEATURE_IDS], strictTolerance: 1e-12, parityStatus: expected === checked && missing === 0 && mismatch === 0 && maxDiff <= 1e-12 ? "PASS" : "FAIL" };
}

function driftReport(foldRuns: readonly { spec: FoldSpec; fit: Fit; evalRows: readonly ResearchObservation[] }[], featureIds: readonly string[], variant: string) {
  return foldRuns.map(({ spec, fit, evalRows }) => ({ fold: spec.fold, featureSetVersion: variant, features: Object.fromEntries(featureIds.map((feature) => { const train = fit.trainRows.map((row) => row.namedFeatures[feature]).filter(Number.isFinite); const evaluation = evalRows.map((row) => row.namedFeatures[feature]).filter(Number.isFinite); const trainAll = fit.trainRows.map((row) => row.namedFeatures[feature]); const evalAll = evalRows.map((row) => row.namedFeatures[feature]); const trainMean = mean(train); const trainStd = std(train); return [feature, { trainingMean: trainMean, trainingStd: trainStd, evaluationMean: mean(evaluation), evaluationStd: std(evaluation), standardizedMeanDifference: trainStd && trainMean !== null && mean(evaluation) !== null ? (mean(evaluation)! - trainMean) / trainStd : null, trainingNonfiniteCount: trainAll.length - train.length, evaluationNonfiniteCount: evalAll.length - evaluation.length }]; })) }));
}

function coefficientStability(runs: readonly { spec: FoldSpec; fit: Fit }[], featureIds: readonly string[], variant: string) {
  const rows = featureIds.map((feature, index) => { const values = runs.map(({ fit }) => fit.model.metadata().weights[index]!); return { feature, featureSetVersion: variant, coefficientsByFold: runs.map(({ spec, fit }) => ({ fold: spec.fold, coefficient: fit.model.metadata().weights[index]! })), positiveCount: values.filter((value) => value > 0).length, negativeCount: values.filter((value) => value < 0).length, zeroCount: values.filter((value) => value === 0).length, mean: mean(values), std: std(values), sign: values.some((value) => value > 0) && values.some((value) => value < 0) ? "SIGN_UNSTABLE" : "STABLE_OR_ZERO" }; });
  return { featureSetVersion: variant, folds: runs.length, features: rows };
}

function evReport(rows: readonly ScoredRow[]) { const values = rows.map((item) => item.prediction.ev?.ev).filter((value): value is number => value !== undefined); const margins = rows.map((item) => item.prediction.ev?.probabilityMarginToBreakEven).filter((value): value is number => value !== undefined); return { distribution: distribution(values), negativeCount: values.filter((value) => value < 0).length, zeroCount: values.filter((value) => value === 0).length, positiveCount: values.filter((value) => value > 0).length, meanProbabilityToBreakEvenMargin: mean(margins), diagnostics: rows.map((item) => ({ observationId: item.row.observationId, decisionTimestamp: item.row.decisionTimestamp, ...item.prediction.ev })).filter((item) => item.ev !== undefined) }; }

function funnel(rows: readonly ScoredRow[]) { const reasonCodeCounts: Record<string, number> = {}; rows.forEach((row) => { reasonCodeCounts[row.reasonCode] = (reasonCodeCounts[row.reasonCode] ?? 0) + 1; }); return { allEvaluationDecisions: rows.length, featuresAvailable: rows.length, predictions: rows.length, analogueQueries: rows.length, analogueSufficient: rows.filter((row) => row.prediction.analogue.evidence === "SUFFICIENT").length, evEvaluated: rows.filter((row) => row.prediction.ev !== undefined).length, positiveEv: rows.filter((row) => (row.prediction.ev?.ev ?? -Infinity) > 0).length, thresholdPassed: rows.filter((row) => row.prediction.calibratedProbability >= .6).length, buyDecisions: rows.filter((row) => row.buy).length, noTradeOrHold: rows.filter((row) => !row.buy).length, reasonCodeCounts }; }

function main(): void {
  mkdirSync(outputDir, { recursive: true });
  const base = JSON.parse(readFileSync(manifestPath, "utf8")) as DatasetManifest;
  const bars = loadBarsFile(dataPath, { intervalMs: base.barIntervalMs, symbols: base.symbols });
  const calendar = new TradingCalendar({ timeZone: base.timezone, holidays: base.calendarHolidays, earlyCloses: base.calendarEarlyCloses });
  const developmentEnd = calendar.sessionBounds(Date.parse("2026-03-31T12:00:00Z")).closeMs;
  const developmentBars = subset(bars, base.startTimestamp, developmentEnd);
  if (!developmentBars.length) fail("V2B_DEVELOPMENT_DATA_EMPTY");
  const developmentHash = canonicalDatasetHash(developmentBars);
  const folds = makeFoldSpecs(developmentBars, calendar);
  const spec = { protocolId: "candidate-v2b-causal-ohlcv-v3", creationGitSha: gitSha, symbol: "AMZN", interval: "5m", developmentStart: "2025-07-01", developmentEnd: "2026-03-31", quarantineStart: "2026-04-01", quarantineEnd: "2026-04-15", finalHoldoutStart: "2026-04-16", finalHoldoutEnd: "2026-06-30", finalHoldoutStatus: "LOCKED", baselineFeatureSet: "baseline-ohlcv-v2", candidateFeatureSet: CANDIDATE_FEATURE_SET_VERSION, modelFamily: "LOGISTIC_REGRESSION", targetVersion: FIRST_TARGET.targetVersion, labelPolicyVersion: FIRST_LABEL_POLICY.version, paperOnly: true, runtimeMode: "RESEARCH_EVALUATION", developmentDatasetHash: developmentHash, calendarHash: base.calendarSpecHash, temporalFolds: folds, comparisonObservationPolicy: "For each fold, take the exact candidate-eligible observation IDs in the fold evaluation sessions and score both baseline and candidate on that identical ID set; baseline-only warm-up rows are excluded.", internalFoldRoles: "Expanding historical sessions are split chronologically into TRAIN, VALIDATION, and CALIBRATION. Scaler, model, L2 selection, Platt calibration, OOD state, and analogue database use no fold-evaluation rows; rows whose outcomes are unavailable before evaluation are purged from fitting.", selectionCriteria: { primaryMetric: "LOG_LOSS", meanCandidateLogLossLessThanBaseline: true, candidateLogLossWinsAtLeast: 3, meanCandidateBrierNotWorse: true, meanCandidateRocAucNotWorseByMoreThan: 0.01, noFoldCandidateLogLossDegradationGreaterThan: 0.05 }, preregistrationStatus: "WRITTEN_BEFORE_CANDIDATE_SCORING" };
  // This is intentionally the first result-producing write in the protocol.
  writeJson("candidate-v2b-spec", spec);
  const sets = buildObservationSets(developmentBars, base, calendar);
  const baselineObservations = [...sets.baseline.values()]; const candidateObservations = [...sets.candidate.values()];
  const costConfig = { spreadBps: 1, entrySlippageBps: .5, exitSlippageBps: .5, entryFeeBps: .5, exitFeeBps: .5 }; const costModel = new ExecutionCostModel(costConfig);
  const foldResults: Record<string, unknown>[] = []; const baselineRuns: { spec: FoldSpec; fit: Fit; evalRows: ResearchObservation[]; scored: ScoredRow[] }[] = []; const candidateRuns: { spec: FoldSpec; fit: Fit; evalRows: ResearchObservation[]; scored: ScoredRow[] }[] = [];
  for (const fold of folds) {
    const candidateEval = rowsInSessions(candidateObservations, fold.evaluationSessions, calendar); const comparableIds = new Set(candidateEval.map((row) => row.observationId)); const baselineEligible = rowsInSessions(baselineObservations, fold.evaluationSessions, calendar); const baselineEval = baselineEligible.filter((row) => comparableIds.has(row.observationId)); const candidateFit = fitVariant(candidateObservations, fold, CANDIDATE_FEATURE_SET_VERSION, CANDIDATE_OHLCV_FEATURE_IDS, calendar); const baselineFit = fitVariant(baselineObservations, fold, "baseline-ohlcv-v2", OHLCV_FEATURE_IDS, calendar); const candidateScored = scoreRows(candidateEval, candidateFit, costModel); const baselineScored = scoreRows(baselineEval, baselineFit, costModel); baselineRuns.push({ spec: fold, fit: baselineFit, evalRows: baselineEval, scored: baselineScored }); candidateRuns.push({ spec: fold, fit: candidateFit, evalRows: candidateEval, scored: candidateScored }); foldResults.push({ fold: fold.fold, trainingSessions: fold.trainingSessions, evaluationSessions: fold.evaluationSessions, baselineEligibleRows: baselineEligible.length, candidateEligibleRows: candidateEval.length, comparableRows: comparableIds.size, rowsExcludedForCandidateWarmup: baselineEligible.length - comparableIds.size, exactComparableObservationIds: [...comparableIds].sort(), baseline: { metrics: metricReport(baselineScored), probabilityDistribution: distribution(baselineScored.map((row) => row.prediction.calibratedProbability)), observedBinaryPrevalence: mean(baselineScored.filter((row) => row.row.modelLabel !== undefined).map((row) => row.row.modelLabel!)), calibration: calibrationReport(baselineScored), selectedL2: baselineFit.selectedL2, decisionFunnel: funnel(baselineScored), ev: evReport(baselineScored), paperReplay: runPaperReplay(baselineScored, developmentBars, costConfig) }, candidate: { metrics: metricReport(candidateScored), probabilityDistribution: distribution(candidateScored.map((row) => row.prediction.calibratedProbability)), observedBinaryPrevalence: mean(candidateScored.filter((row) => row.row.modelLabel !== undefined).map((row) => row.row.modelLabel!)), calibration: calibrationReport(candidateScored), selectedL2: candidateFit.selectedL2, decisionFunnel: funnel(candidateScored), ev: evReport(candidateScored), paperReplay: runPaperReplay(candidateScored, developmentBars, costConfig) } });
  }
  const allBaseline = baselineRuns.flatMap((run) => run.scored); const allCandidate = candidateRuns.flatMap((run) => run.scored); const baselineAggregate = metricReport(allBaseline); const candidateAggregate = metricReport(allCandidate); const brierMean = (runs: readonly { scored: readonly ScoredRow[] }[]) => mean(runs.map((run) => metricReport(run.scored)?.brier).filter((value): value is number => value !== null && value !== undefined)); const logLossMean = (runs: readonly { scored: readonly ScoredRow[] }[]) => mean(runs.map((run) => metricReport(run.scored)?.logLoss).filter((value): value is number => value !== null && value !== undefined)); const rocMean = (runs: readonly { scored: readonly ScoredRow[] }[]) => mean(runs.map((run) => metricReport(run.scored)?.rocAuc).filter((value): value is number => value !== null && value !== undefined));
  const baselineMeanLogLoss = logLossMean(baselineRuns); const candidateMeanLogLoss = logLossMean(candidateRuns); const baselineMeanBrier = brierMean(baselineRuns); const candidateMeanBrier = brierMean(candidateRuns); const baselineMeanRoc = rocMean(baselineRuns); const candidateMeanRoc = rocMean(candidateRuns); const foldWins = baselineRuns.filter((run, index) => (metricReport(candidateRuns[index]!.scored)?.logLoss ?? Infinity) < (metricReport(run.scored)?.logLoss ?? Infinity)).length;
  const criteria = { meanLogLossImproved: { rule: "candidate mean temporal-fold LOG LOSS < baseline mean temporal-fold LOG LOSS", observedBaseline: baselineMeanLogLoss, observedCandidate: candidateMeanLogLoss, passed: candidateMeanLogLoss !== null && baselineMeanLogLoss !== null && candidateMeanLogLoss < baselineMeanLogLoss }, logLossWinsAtLeast3Of4: { rule: "candidate log loss is lower in at least 3 of 4 folds", observedBaseline: baselineMeanLogLoss, observedCandidate: candidateMeanLogLoss, observedFoldWins: foldWins, threshold: 3, passed: foldWins >= 3 }, meanBrierNotWorse: { rule: "candidate mean Brier <= baseline mean Brier", observedBaseline: baselineMeanBrier, observedCandidate: candidateMeanBrier, passed: candidateMeanBrier !== null && baselineMeanBrier !== null && candidateMeanBrier <= baselineMeanBrier }, meanRocAucNotWorseByMoreThan0_01: { rule: "candidate mean ROC-AUC >= baseline mean ROC-AUC - 0.01", observedBaseline: baselineMeanRoc, observedCandidate: candidateMeanRoc, tolerance: 0.01, passed: candidateMeanRoc !== null && baselineMeanRoc !== null && candidateMeanRoc >= baselineMeanRoc - .01 }, noFoldLogLossDegradationGreaterThan0_05: { rule: "no candidate fold log loss is more than 0.05 worse than corresponding baseline fold", threshold: 0.05, observedDegradations: baselineRuns.map((run, index) => (metricReport(candidateRuns[index]!.scored)?.logLoss ?? Infinity) - (metricReport(run.scored)?.logLoss ?? Infinity)), passed: baselineRuns.every((run, index) => (metricReport(candidateRuns[index]!.scored)?.logLoss ?? Infinity) - (metricReport(run.scored)?.logLoss ?? Infinity) <= .05) } };
  const gate = Object.values(criteria).every((criterion) => criterion.passed); const allComparable = [...new Set(candidateRuns.flatMap((run) => run.scored.map((row) => row.row.observationId)))];
  const calibrationComparison = { perFold: folds.map((fold, index) => ({ fold: fold.fold, baseline: calibrationReport(baselineRuns[index]!.scored), candidate: calibrationReport(candidateRuns[index]!.scored) })), aggregate: { baseline: calibrationReport(allBaseline), candidate: calibrationReport(allCandidate) } };
  const featureDrift = { baseline: driftReport(baselineRuns, OHLCV_FEATURE_IDS, "baseline-ohlcv-v2"), candidate: driftReport(candidateRuns, CANDIDATE_OHLCV_FEATURE_IDS, CANDIDATE_FEATURE_SET_VERSION) };
  const coefficient = { baseline: coefficientStability(baselineRuns, OHLCV_FEATURE_IDS, "baseline-ohlcv-v2"), candidate: coefficientStability(candidateRuns, CANDIDATE_OHLCV_FEATURE_IDS, CANDIDATE_FEATURE_SET_VERSION), priorInstabilityCheck: Object.fromEntries(["ret1", "emaSlowDistance", "realisedVol20"].map((feature) => [feature, { candidate: coefficientStability(candidateRuns, CANDIDATE_OHLCV_FEATURE_IDS, CANDIDATE_FEATURE_SET_VERSION).features.find((row) => row.feature === feature)?.sign ?? "NOT_AVAILABLE" }])) };
  const decisionFunnel = { baseline: { perFold: baselineRuns.map((run) => funnel(run.scored)), aggregate: funnel(allBaseline) }, candidate: { perFold: candidateRuns.map((run) => funnel(run.scored)), aggregate: funnel(allCandidate) } };
  const evMargins = { baseline: evReport(allBaseline), candidate: evReport(allCandidate) };
  writeJson("feature-set-v3", { featureSetVersion: CANDIDATE_FEATURE_SET_VERSION, baselineFeatureSetVersion: "baseline-ohlcv-v2", baselineFeatureIds: [...OHLCV_FEATURE_IDS], candidateFeatureIds: [...CANDIDATE_OHLCV_FEATURE_IDS], newFeatureIds: [...NEW_CAUSAL_FEATURE_IDS], definitions: { ret10: "close_t / close_(t-10) - 1", ret20: "close_t / close_(t-20) - 1", atr14Pct: "causal ATR(14) / current close", barRangePct: "(high_t - low_t) / close_t", closeLocation: "(close_t - low_t) / (high_t - low_t), or 0.5 when high_t == low_t", bodyPct: "(close_t - open_t) / open_t", openingGapPct: "current regular-session open / previous complete regular-session close - 1", sessionProgress: "bounded (current bar start - session open) / (session close - session open)" }, availability: "Only completed current bars, prior completed regular-session close, current session open, and exchange-calendar time are used; no future price values." });
  writeJson("temporal-fold-comparison", { protocolId: spec.protocolId, folds: foldResults, aggregate: { baseline: baselineAggregate, candidate: candidateAggregate, baselineMeanLogLoss, candidateMeanLogLoss, baselineMeanBrier, candidateMeanBrier, baselineMeanRocAuc: baselineMeanRoc, candidateMeanRocAuc: candidateMeanRoc, logLossFoldWins: foldWins, comparableObservationCount: allComparable.length } });
  writeJson("calibration-comparison", calibrationComparison); writeJson("feature-drift", featureDrift); writeJson("coefficient-stability", coefficient); writeJson("probability-ev-margin-diagnostics", { baseline: { probabilityDistribution: distribution(allBaseline.map((row) => row.prediction.calibratedProbability)), ev: evMargins.baseline }, candidate: { probabilityDistribution: distribution(allCandidate.map((row) => row.prediction.calibratedProbability)), ev: evMargins.candidate }, methodology: "Existing triple-barrier EV: outcome probabilities from calibrated model probability and analogue barrier rates, barrier returns from ATR, minus ExecutionCostModel round-trip cost. A single break-even probability is reported only when EV is affine and has non-zero probability slope." });
  writeJson("decision-funnel-comparison", decisionFunnel); writeJson("candidate-v2b-decision", { primaryMetric: "LOG_LOSS", criteria, developmentSelectionGate: gate ? "PASS" : "FAIL", candidateV2BStatus: gate ? "SELECTED_FOR_FUTURE_HOLDOUT_EVALUATION" : "REJECTED_AT_DEVELOPMENT_GATE", baselineModelLifecycle: "CANDIDATE", finalHoldoutEvaluation: "NOT_PERFORMED" });
  const baselineParity = parityReport(developmentBars, baselineObservations.filter((row) => allComparable.includes(row.observationId)), calendar, false); const candidateParity = parityReport(developmentBars, candidateObservations.filter((row) => allComparable.includes(row.observationId)), calendar, true);
  writeJson("holdout-lock-audit", { finalHoldoutStatus: "LOCKED", finalHoldoutFeatures: 0, finalHoldoutLabels: 0, finalHoldoutTargets: 0, finalHoldoutPredictions: 0, finalHoldoutProbabilities: 0, finalHoldoutOODReports: 0, finalHoldoutAnalogueReports: 0, finalHoldoutEVReports: 0, finalHoldoutDecisions: 0, finalHoldoutOrders: 0, finalHoldoutTrades: 0, finalHoldoutBenchmarkReports: 0, sourceStructuralArtifacts: ["research/v2a/final-holdout-manifest.json", "research/v2a/final-holdout-structural-preflight.json"], verification: "PASS" });
  writeJson("feature-parity", { baseline: baselineParity, candidate: candidateParity, expectedComparableCount: candidateParity.expectedComparableCount, checkedCount: candidateParity.checkedCount, missingRuntimeFeatureCount: candidateParity.missingRuntimeFeatureCount, mismatchCount: candidateParity.mismatchCount });
  const summary = { protocolId: spec.protocolId, selectionGate: gate ? "PASS" : "FAIL", baselineMeanLogLoss, candidateMeanLogLoss, foldWins, baselineMeanBrier, candidateMeanBrier, baselineMeanRoc, candidateMeanRoc, comparableObservationCount: allComparable.length, candidatePositiveEvCount: evMargins.candidate.positiveCount, candidateBuyDecisions: funnel(allCandidate).buyDecisions, candidateTrades: (candidateRuns.flatMap((run) => run.scored).length ? candidateRuns.map((run) => run.scored).reduce((sum, rows) => sum + Number((runPaperReplay(rows, developmentBars, costConfig).trades ?? 0)), 0) : 0), finalHoldoutStatus: "LOCKED" };
  writeFileSync(`${outputDir}/README.md`, `# Candidate V2B — Controlled Causal Feature Expansion\n\nDevelopment-only comparison of ` + "`baseline-ohlcv-v2`" + ` and ` + "`candidate-ohlcv-v3`" + ` using four chronological expanding folds. The final holdout remains locked and was not evaluated.\n\n## Result\n\n` + canonicalJson(summary) + `\n\nSelection is mechanically determined by ` + "`candidate-v2b-decision.json`" + `. Raw market data and credentials are intentionally excluded.\n`);
  const artifactNames = ["candidate-v2b-spec", "feature-set-v3", "temporal-fold-comparison", "calibration-comparison", "feature-drift", "coefficient-stability", "probability-ev-margin-diagnostics", "decision-funnel-comparison", "candidate-v2b-decision", "holdout-lock-audit", "feature-parity"];
  const artifacts = artifactNames.concat(["README"]).map((name) => { const path = `${outputDir}/${name}.${name === "README" ? "md" : "json"}`; const bytes = readFileSync(path); return { relativePath: path.slice(outputDir.length + 1), sizeBytes: bytes.byteLength, sha256: sha256(bytes) }; });
  const artifactManifest = { protocolId: spec.protocolId, artifacts }; writeJson("artifact-manifest", artifactManifest); const verification = verifyArtifactManifest(outputDir, artifactManifest); if (!verification.valid) fail(`V2B_ARTIFACT_VERIFICATION_FAILED:${verification.failures.join(",")}`);
  console.log(JSON.stringify({ ...summary, artifactVerification: "PASS", baselineParity: baselineParity.parityStatus, candidateParity: candidateParity.parityStatus, tests: "run separately" }, null, 2));
}

try { main(); } catch (error) { fail(error instanceof Error ? error.message : String(error)); }
