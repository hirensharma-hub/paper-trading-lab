import type { Bar, FeatureVector, Quote } from "./domain";
import { appendBar, validateQuote } from "./data";
import { buildFeatures } from "./features";
import { TrustedAnalogueEngine, type TrustedAnalogueObservation, type TargetSpecificAnalogueResult } from "./analogues";
import { assessEvidence, type EvidenceResult } from "./evidence";
import { expectedValue } from "./statistics";
import { detectMarketStructure, type MarketStructureSnapshot } from "./structure";
import { classifyRegime, type RegimeState } from "./regime";
import { detectPatterns, type PatternDetection } from "./patterns";
import { type OodStatus } from "./ml";
import { PredictiveModelBundle } from "./ml-contracts";
import { namedFeatures, type NamedFeatureVector } from "./feature-schema";

export type IntelligenceDecision = "BUY" | "SELL" | "HOLD" | "NO_TRADE";
export interface MarketAnalysisSnapshot { symbol: string; barCloseTimestamp: number; quoteTimestamp?: number; featureTimestamp?: number; decisionTimestamp: number; timestamp: number; features: FeatureVector | null; structure: MarketStructureSnapshot | null; regime: RegimeState | null; patterns: readonly PatternDetection[]; prediction?: { predictionId: string; modelId: string; modelVersion: string; featureSetVersion: string; featureIds: readonly string[]; targetVersion: string; rawProbability: number; calibratedProbability: number; probability: number; ood: { status: OodStatus; maxAbsZ: number } }; analogues?: TargetSpecificAnalogueResult & { distances: readonly number[]; evidence: "INSUFFICIENT" | "SUFFICIENT" }; evidence?: EvidenceResult; expectedValue?: number; dataQuality?: { ok: boolean; issues: readonly string[] }; }
export interface IntelligenceConfig { model?: PredictiveModelBundle; trustedAnalogues?: readonly TrustedAnalogueObservation[]; minimumAnalogueSample?: number; probabilityThreshold?: number; evidence?: Partial<Pick<import("./evidence").EvidenceInputs, "outOfSample" | "calibrated" | "costSurvives" | "parameterStable" | "recentStable">>; featureConfig?: { sessionsPerYear?: number; sessionMinutesPerDay?: number }; }

export function featureVectorForModel(features: FeatureVector): number[] { return [features.ret1, features.ret5, features.emaFastDistance, features.emaSlowDistance, features.rsi14 / 100, features.realisedVol20, features.volumeZ, features.spreadBps ?? 0, features.bookImbalance ?? 0]; }

export class IntelligenceEngine {
  private readonly histories = new Map<string, Bar[]>();
  constructor(private readonly config: IntelligenceConfig = {}) {}
  analyze(bar: Bar, quote?: Quote): MarketAnalysisSnapshot {
    if (quote) { validateQuote(quote); if (quote.symbol !== bar.symbol || quote.ts < bar.startMs + bar.intervalMs) throw new Error("Quote must be for the same symbol at or after bar completion"); }
    const history = this.histories.get(bar.symbol) ?? []; const next = appendBar(history, bar); this.histories.set(bar.symbol, next);
    const timestamp = bar.startMs + bar.intervalMs; const decisionTimestamp = quote?.ts ?? timestamp; const rawFeatures = buildFeatures(next, quote, { ...this.config.featureConfig, decisionTimestamp }); const features = rawFeatures ? { ...rawFeatures, ts: decisionTimestamp } : null;
    if (!features) return { symbol: bar.symbol, barCloseTimestamp: timestamp, quoteTimestamp: quote?.ts, featureTimestamp: decisionTimestamp, decisionTimestamp, timestamp, features: null, structure: null, regime: null, patterns: [], dataQuality: { ok: true, issues: ["FEATURE_WARMUP"] } };
    const structure = detectMarketStructure(next); const regime = classifyRegime(features, structure); const patterns = detectPatterns(features, structure, regime); const named = namedFeatures(features); const predictionResult = this.config.model && typeof this.config.model.predict === "function" ? this.config.model.predict(named) : undefined; const prediction = predictionResult && this.config.model ? { ...predictionResult, predictionId: `prediction-${bar.symbol}-${decisionTimestamp}`, modelId: this.config.model.modelId, modelVersion: this.config.model.modelVersion, featureSetVersion: this.config.model.featureSetVersion, featureIds: this.config.model.featureIds, targetVersion: this.config.model.targetVersion } : undefined;
    const analogues = this.config.trustedAnalogues?.length ? new TrustedAnalogueEngine().query(this.config.trustedAnalogues, { currentFeatures: named, decisionTimestamp, featureSetVersion: this.config.model?.featureSetVersion ?? "baseline-named-v1", featureIds: this.config.model?.featureIds ?? Object.keys(named), targetVersion: this.config.model?.targetVersion ?? "", targetKind: "FORWARD_CLOSE_RETURN", regime: regime.trend, minimumSample: this.config.minimumAnalogueSample }) : undefined;
    const evidence = analogues ? assessEvidence({ sampleSize: analogues.sampleSize, outOfSample: this.config.evidence?.outOfSample ?? false, calibrated: this.config.evidence?.calibrated ?? false, costSurvives: this.config.evidence?.costSurvives ?? false, regimeConsistent: analogues.sampleSize > 0, parameterStable: this.config.evidence?.parameterStable ?? false, recentStable: this.config.evidence?.recentStable ?? false }) : undefined;
    const averageWin = analogues?.targetKind === "FORWARD_CLOSE_RETURN" ? Math.max(0, analogues.forwardReturn?.mean ?? 0) : 0; const averageLoss = analogues?.targetKind === "FORWARD_CLOSE_RETURN" ? Math.abs(Math.min(0, analogues.forwardReturn?.mean ?? 0)) : 0; const ev = prediction && analogues && Number.isFinite(averageWin) && Number.isFinite(averageLoss) ? expectedValue(prediction.probability, averageWin, averageLoss, 0) : undefined;
    return { symbol: bar.symbol, barCloseTimestamp: timestamp, quoteTimestamp: quote?.ts, featureTimestamp: features.ts, decisionTimestamp, timestamp: features.ts, features, structure, regime, patterns, prediction, analogues, evidence, expectedValue: ev, dataQuality: { ok: true, issues: [] } };
  }
}
