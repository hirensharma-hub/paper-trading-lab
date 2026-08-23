import type { Bar, FeatureVector, Quote } from "./domain";
import { appendBar, validateQuote } from "./data";
import { buildFeatures } from "./features";
import { nearestAnalogues, type AnalogueObservation, type AnalogueResult } from "./analogues";
import { assessEvidence, type EvidenceResult } from "./evidence";
import { expectedValue } from "./statistics";
import { detectMarketStructure, type MarketStructureSnapshot } from "./structure";
import { classifyRegime, type RegimeState } from "./regime";
import { detectPatterns, type PatternDetection } from "./patterns";
import { MODEL_FEATURE_VERSION, type OodStatus, type ScalerState } from "./ml";

export type IntelligenceDecision = "BUY" | "SELL" | "HOLD" | "NO_TRADE";
export interface PredictiveModel { featureVersion?: string; targetVersion?: string; predictProbability(features: readonly number[]): number; transformFeatures?(features: readonly number[]): readonly number[]; assessOod?(features: readonly number[]): { status: OodStatus; maxAbsZ: number }; }
export interface MarketAnalysisSnapshot { symbol: string; timestamp: number; features: FeatureVector | null; structure: MarketStructureSnapshot | null; regime: RegimeState | null; patterns: readonly PatternDetection[]; prediction?: { probability: number; ood?: { status: OodStatus; maxAbsZ: number } }; analogues?: AnalogueResult; evidence?: EvidenceResult; expectedValue?: number; decision: IntelligenceDecision; reason: string; }
export interface IntelligenceConfig { model?: PredictiveModel; featureVersion?: string; targetVersion?: string; analogueScaler?: ScalerState; analogues?: readonly AnalogueObservation[]; minimumAnalogueSample?: number; probabilityThreshold?: number; roundTripCost?: number; evidence?: Partial<Pick<import("./evidence").EvidenceInputs, "outOfSample" | "calibrated" | "costSurvives" | "parameterStable" | "recentStable">>; featureConfig?: { sessionsPerYear?: number; sessionMinutesPerDay?: number }; }

export function featureVectorForModel(features: FeatureVector): number[] { return [features.ret1, features.ret5, features.emaFastDistance, features.emaSlowDistance, features.rsi14 / 100, features.realisedVol20, features.volumeZ, features.spreadBps ?? 0, features.bookImbalance ?? 0]; }

export class IntelligenceEngine {
  private readonly histories = new Map<string, Bar[]>();
  constructor(private readonly config: IntelligenceConfig = {}) {}
  analyze(bar: Bar, quote?: Quote): MarketAnalysisSnapshot {
    if (quote) { validateQuote(quote); if (quote.symbol !== bar.symbol || quote.ts < bar.startMs + bar.intervalMs) throw new Error("Quote must be for the same symbol at or after bar completion"); }
    const history = this.histories.get(bar.symbol) ?? []; const next = appendBar(history, bar); this.histories.set(bar.symbol, next);
    const timestamp = bar.startMs + bar.intervalMs; const decisionTimestamp = quote?.ts ?? timestamp; const rawFeatures = buildFeatures(next, quote, { ...this.config.featureConfig, decisionTimestamp }); const features = rawFeatures ? { ...rawFeatures, ts: decisionTimestamp } : null;
    if (!features) return { symbol: bar.symbol, timestamp, features: null, structure: null, regime: null, patterns: [], decision: "NO_TRADE", reason: "Warming up" };
    const structure = detectMarketStructure(next); const regime = classifyRegime(features, structure); const patterns = detectPatterns(features, structure, regime); const rawModelFeatures = featureVectorForModel(features); const modelFeatures = this.config.model?.transformFeatures?.(rawModelFeatures) ?? rawModelFeatures; const schemaCompatible = (this.config.featureVersion ?? MODEL_FEATURE_VERSION) === MODEL_FEATURE_VERSION && (!this.config.model?.featureVersion || this.config.model.featureVersion === MODEL_FEATURE_VERSION); const prediction = this.config.model && schemaCompatible ? { probability: this.config.model.predictProbability(rawModelFeatures), ood: this.config.model.assessOod?.(modelFeatures) } : undefined;
    const targetVersion = this.config.targetVersion ?? this.config.model?.targetVersion ?? "forward-close-v1"; const analogues = this.config.analogues?.length ? nearestAnalogues(modelFeatures, this.config.analogues, 50, this.config.minimumAnalogueSample ?? 20, { asOfTimestamp: decisionTimestamp, scaler: this.config.analogueScaler, requiredRegime: regime.trend, featureVersion: this.config.featureVersion ?? MODEL_FEATURE_VERSION, targetVersion }) : undefined;
    const evidence = analogues ? assessEvidence({ sampleSize: analogues.sampleSize, outOfSample: this.config.evidence?.outOfSample ?? false, calibrated: this.config.evidence?.calibrated ?? false, costSurvives: this.config.evidence?.costSurvives ?? false, regimeConsistent: analogues.sampleSize > 0 && (analogues.regimeDistribution[regime.trend] ?? 0) >= 0.2, parameterStable: this.config.evidence?.parameterStable ?? false, recentStable: this.config.evidence?.recentStable ?? false }) : undefined;
    const averageWin = analogues?.meanMfe ?? Math.max(0, analogues?.meanForwardReturn ?? 0); const averageLoss = Math.abs(analogues?.meanMae ?? Math.min(0, analogues?.meanForwardReturn ?? 0)); const ev = prediction && analogues && Number.isFinite(averageWin) && Number.isFinite(averageLoss) ? expectedValue(prediction.probability, averageWin, averageLoss, this.config.roundTripCost ?? 0) : undefined;
    const ood = prediction?.ood?.status; const evidenceRank = { INSUFFICIENT: 0, WEAK: 1, MODERATE: 2, STRONG: 3, VERY_STRONG: 4 }; const evidenceAllowed = evidence !== undefined && evidenceRank[evidence.quality] >= evidenceRank.MODERATE; const decision: IntelligenceDecision = !prediction || !analogues || !evidenceAllowed || ood === "OUT_OF_DISTRIBUTION" ? "NO_TRADE" : prediction.probability >= (this.config.probabilityThreshold ?? 0.6) && (ev ?? -Infinity) > 0 ? "BUY" : "HOLD";
    const reason = decision === "NO_TRADE" ? "Insufficient point-in-time evidence or model coverage" : decision === "BUY" ? "Model probability and expected value pass research gates" : "Model evidence does not pass the entry gates";
    return { symbol: bar.symbol, timestamp: features.ts, features, structure, regime, patterns, prediction, analogues, evidence, expectedValue: ev, decision, reason };
  }
}
