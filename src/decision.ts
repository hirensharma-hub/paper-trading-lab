import type { IntelligenceDecision, MarketAnalysisSnapshot } from "./intelligence";

export interface DecisionResult { action: IntelligenceDecision; symbol: string; timestamp: number; allowed: boolean; reason: string; evidenceQuality?: string; expectedValue?: number; }
export interface DecisionPolicy { minimumEvidence?: "WEAK" | "MODERATE" | "STRONG" | "VERY_STRONG"; allowWarnings?: boolean; }
const rank: Record<string, number> = { INSUFFICIENT: 0, WEAK: 1, MODERATE: 2, STRONG: 3, VERY_STRONG: 4 };
export class DecisionEngine {
  constructor(private readonly policy: DecisionPolicy = {}) {}
  decide(snapshot: MarketAnalysisSnapshot): DecisionResult { const quality = snapshot.evidence?.quality; const minimum = this.policy.minimumEvidence ?? "MODERATE"; const evidenceAllowed = quality !== undefined && rank[quality] >= rank[minimum]; const oodStatus = snapshot.prediction?.ood?.status; const oodAllowed = oodStatus === undefined || oodStatus === "IN_DISTRIBUTION" || (oodStatus === "WARNING" && this.policy.allowWarnings === true); const allowed = snapshot.decision !== "NO_TRADE" && evidenceAllowed && oodAllowed; return { action: allowed ? snapshot.decision : "NO_TRADE", symbol: snapshot.symbol, timestamp: snapshot.timestamp, allowed, reason: allowed ? snapshot.reason : !evidenceAllowed ? "Evidence quality is below decision policy" : "OOD state is blocked by decision policy", evidenceQuality: quality, expectedValue: snapshot.expectedValue }; }
}
