import type { Bar, FeatureVector, Quote } from "./domain";
import { appendBar, validateQuote } from "./data";
import { buildFeatures } from "./features";
import { TrustedAnalogueEngine, type TrustedAnalogueObservation, type TargetSpecificAnalogueResult, type TrustedAnalogueScalerProfile } from "./analogues";
import { assessEvidence, type EvidenceResult } from "./evidence";
import { expectedValue } from "./statistics";
import { detectMarketStructure, type MarketStructureSnapshot } from "./structure";
import { classifyRegime, type RegimeState } from "./regime";
import { detectPatterns, type PatternDetection } from "./patterns";
import { type OodStatus } from "./ml";
import { PredictiveModelBundle } from "./ml-contracts";
import { namedFeatures, type NamedFeatureVector } from "./feature-schema";
import { averageTrueRange } from "./features";
import { type TargetRegistry, type TargetStateAtDecision } from "./targets";
import { defaultTargetRegistry } from "./experience";
import { ExecutionCostModel } from "./costs";

export type IntelligenceDecision = "BUY" | "SELL" | "HOLD" | "NO_TRADE";
export const TRIPLE_BARRIER_EV_VERSION = "triple-barrier-ev-v1";
export const TRIPLE_BARRIER_TIMEOUT_RETURN = 0;
export const TRIPLE_BARRIER_AMBIGUOUS_RETURN = 0;
export interface MarketAnalysisSnapshot { symbol: string; barCloseTimestamp: number; quoteTimestamp?: number; featureTimestamp?: number; decisionTimestamp: number; timestamp: number; features: FeatureVector | null; structure: MarketStructureSnapshot | null; regime: RegimeState | null; patterns: readonly PatternDetection[]; targetState?: TargetStateAtDecision; prediction?: { predictionId: string; modelId: string; modelVersion: string; featureSetVersion: string; featureIds: readonly string[]; targetVersion: string; rawProbability: number; calibratedProbability: number; probability: number; ood: { status: OodStatus; maxAbsZ: number } }; analogues?: TargetSpecificAnalogueResult & { distances: readonly number[]; evidence: "INSUFFICIENT" | "SUFFICIENT" }; evidence?: EvidenceResult; expectedValue?: number; dataQuality?: { ok: boolean; issues: readonly string[] }; }
export interface IntelligenceConfig { model?: PredictiveModelBundle; targetRegistry?: TargetRegistry; trustedAnalogues?: readonly TrustedAnalogueObservation[]; analogueScalerProfile?: TrustedAnalogueScalerProfile; minimumAnalogueSample?: number; probabilityThreshold?: number; costModel?: ExecutionCostModel; evidence?: import("./evidence").ResearchEvidenceContext; featureConfig?: { sessionsPerYear?: number; sessionMinutesPerDay?: number }; }

export function featureVectorForModel(features: FeatureVector): number[] { return [features.ret1, features.ret5, features.emaFastDistance, features.emaSlowDistance, features.rsi14 / 100, features.realisedVol20, features.volumeZ, features.spreadBps ?? 0, features.bookImbalance ?? 0]; }

export class IntelligenceEngine {
  private readonly histories = new Map<string, Bar[]>();
  constructor(private readonly config: IntelligenceConfig = {}) {}
  targetRegistry(): TargetRegistry { return this.config.targetRegistry ?? defaultTargetRegistry; }
  analyze(bar: Bar, quote?: Quote): MarketAnalysisSnapshot {
    if (quote) { validateQuote(quote); if (quote.symbol !== bar.symbol || quote.ts < bar.startMs + bar.intervalMs) throw new Error("Quote must be for the same symbol at or after bar completion"); }
    const history = this.histories.get(bar.symbol) ?? []; const next = appendBar(history, bar); this.histories.set(bar.symbol, next);
    const timestamp = bar.startMs + bar.intervalMs; const decisionTimestamp = quote?.ts ?? timestamp; const rawFeatures = buildFeatures(next, quote, { ...this.config.featureConfig, decisionTimestamp }); const features = rawFeatures ? { ...rawFeatures, ts: decisionTimestamp } : null;
    if (!features) return { symbol: bar.symbol, barCloseTimestamp: timestamp, quoteTimestamp: quote?.ts, featureTimestamp: decisionTimestamp, decisionTimestamp, timestamp, features: null, structure: null, regime: null, patterns: [], targetState: { status: "WARMUP", values: {}, featureVersions: [] }, dataQuality: { ok: true, issues: ["FEATURE_WARMUP"] } };
    const structure = detectMarketStructure(next); const regime = classifyRegime(features, structure); const patterns = detectPatterns(features, structure, regime); const named = namedFeatures(features); const registry = this.targetRegistry(); const definition = this.config.model ? registry.get(this.config.model.targetVersion) : undefined; const atrAtDecision = definition?.kind === "TRIPLE_BARRIER" ? averageTrueRange(next, 14) : undefined; const targetState: TargetStateAtDecision = !this.config.model ? { status: "MISSING_REQUIRED_INPUT", values: {}, featureVersions: [] } : !definition ? { status: "TARGET_UNREGISTERED", values: {}, featureVersions: [] } : definition.kind === "TRIPLE_BARRIER" && !Number.isFinite(atrAtDecision) ? { status: "MISSING_REQUIRED_INPUT", values: {}, featureVersions: ["atr14-v1"] } : { status: "AVAILABLE", values: atrAtDecision === undefined ? {} : { atrAtDecision }, featureVersions: atrAtDecision === undefined ? [] : ["atr14-v1"] };
    const predictionResult = targetState.status === "AVAILABLE" && this.config.model ? this.config.model.predict(named) : undefined; const prediction = predictionResult && this.config.model ? { ...predictionResult, predictionId: `prediction-${bar.symbol}-${decisionTimestamp}`, modelId: this.config.model.modelId, modelVersion: this.config.model.modelVersion, featureSetVersion: this.config.model.featureSetVersion, featureIds: this.config.model.featureIds, targetVersion: this.config.model.targetVersion } : undefined;
    const analogues = prediction && this.config.trustedAnalogues?.length && this.config.analogueScalerProfile && definition ? new TrustedAnalogueEngine().query(this.config.trustedAnalogues, { currentFeatures: named, decisionTimestamp, featureSetVersion: this.config.model!.featureSetVersion, featureIds: this.config.model!.featureIds, targetVersion: definition.targetVersion, targetKind: definition.kind, scalerProfile: this.config.analogueScalerProfile, minimumSample: this.config.minimumAnalogueSample }) : undefined;
    const evidence = analogues ? assessEvidence({ sampleSize: analogues.sampleSize, context: this.config.evidence, regimeConsistent: analogues.sampleSize > 0 }) : undefined;
    const cost = this.config.costModel?.estimateRoundTrip(features.close, features.close).returnUnits ?? 0; let ev: number | undefined; if (prediction && analogues && definition?.kind === "FORWARD_CLOSE_RETURN" && analogues.forwardReturn) ev = prediction.probability * analogues.forwardReturn.meanPositiveReturn + (1 - prediction.probability) * analogues.forwardReturn.meanNegativeReturn - cost; if (prediction && analogues && definition?.kind === "TRIPLE_BARRIER" && analogues.barrier && Number.isFinite(targetState.values.atrAtDecision)) { const pUp = prediction.probability; const remainder = Math.max(0, 1 - pUp); const analogueNonUp = analogues.barrier.downRate + analogues.barrier.timeoutRate + analogues.barrier.ambiguousRate || 1; const pDown = remainder * analogues.barrier.downRate / analogueNonUp; const pTimeout = remainder * analogues.barrier.timeoutRate / analogueNonUp; const pAmbiguous = remainder * analogues.barrier.ambiguousRate / analogueNonUp; const upper = (definition.upperBarrierMultiple! * targetState.values.atrAtDecision) / features.close; const lower = (definition.lowerBarrierMultiple! * targetState.values.atrAtDecision) / features.close; ev = pUp * upper + pDown * -lower + pTimeout * TRIPLE_BARRIER_TIMEOUT_RETURN + pAmbiguous * TRIPLE_BARRIER_AMBIGUOUS_RETURN - cost; }
    return { symbol: bar.symbol, barCloseTimestamp: timestamp, quoteTimestamp: quote?.ts, featureTimestamp: features.ts, decisionTimestamp, timestamp: features.ts, features, structure, regime, patterns, targetState, prediction, analogues, evidence, expectedValue: ev, dataQuality: { ok: true, issues: targetState.status === "AVAILABLE" ? [] : [targetState.status] } };
  }
}
