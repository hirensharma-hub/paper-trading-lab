import type { Position } from "./domain";
import type { MarketAnalysisSnapshot } from "./intelligence";

export type ExitReasonCode = "MODEL_EXIT_THRESHOLD" | "MAX_HOLD_REACHED" | "REGIME_INVALIDATION" | "PATTERN_INVALIDATION" | "RISK_EXIT";
export interface ExitPolicyState { entryTimestamp?: number; entryModelProbability?: number; entryRegime?: string; entryPatterns?: readonly string[]; now: number; riskExit?: boolean; }
export interface ExitPolicyConfig { version?: string; modelExitProbability?: number; maxHoldMs?: number; invalidateRegime?: boolean; invalidatingPatterns?: readonly string[]; }
export interface ExitDecision { action: "KEEP_POSITION" | "CLOSE_POSITION"; reasonCodes: readonly ExitReasonCode[]; humanReadableReason: string; }

export class ExitPolicy {
  readonly version: string;
  constructor(private readonly config: ExitPolicyConfig = {}) { this.version = config.version ?? "baseline-exit-v1"; }
  evaluate(analysis: MarketAnalysisSnapshot, position: Position, state: ExitPolicyState): ExitDecision {
    const reasons: ExitReasonCode[] = [];
    if (state.riskExit) reasons.push("RISK_EXIT");
    if (this.config.modelExitProbability !== undefined && analysis.prediction?.calibratedProbability !== undefined && analysis.prediction.calibratedProbability < this.config.modelExitProbability) reasons.push("MODEL_EXIT_THRESHOLD");
    if (this.config.maxHoldMs !== undefined && state.entryTimestamp !== undefined && state.now - state.entryTimestamp >= this.config.maxHoldMs) reasons.push("MAX_HOLD_REACHED");
    if (this.config.invalidateRegime && state.entryRegime && analysis.regime?.trend && state.entryRegime !== analysis.regime.trend) reasons.push("REGIME_INVALIDATION");
    if (this.config.invalidatingPatterns?.some((pattern) => analysis.patterns.some((item) => item.type === pattern))) reasons.push("PATTERN_INVALIDATION");
    return reasons.length ? { action: "CLOSE_POSITION", reasonCodes: reasons, humanReadableReason: reasons.join(", ") } : { action: "KEEP_POSITION", reasonCodes: ["HOLD_POSITION" as ExitReasonCode], humanReadableReason: "Position remains within exit policy" };
  }
}
