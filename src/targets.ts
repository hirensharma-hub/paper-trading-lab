import type { Bar } from "./domain";

export type TargetKind = "FORWARD_CLOSE_RETURN" | "TRIPLE_BARRIER";
export type AmbiguityPolicy = "AMBIGUOUS" | "CONSERVATIVE_DOWN";
export interface TargetDefinition { targetVersion: string; kind: TargetKind; horizonBars: number; costThreshold?: number; upperBarrierMultiple?: number; lowerBarrierMultiple?: number; ambiguityPolicy?: AmbiguityPolicy; }
export type TargetStateStatus = "AVAILABLE" | "WARMUP" | "MISSING_REQUIRED_INPUT" | "TARGET_UNREGISTERED";
export interface TargetStateAtDecision { status: TargetStateStatus; values: Readonly<Record<string, number>>; featureVersions: readonly string[]; }
export interface TargetResolution { targetVersion: string; targetKind: TargetKind; entryTimestamp: number; entryPrice: number; targetStartTimestamp: number; targetEndTimestamp: number; resolutionTimestamp: number; label: "LONG" | "SHORT" | "FLAT" | "UP" | "DOWN" | "TIMEOUT" | "AMBIGUOUS"; forwardReturn: number; mfe: number; mae: number; }
export interface TargetResolver { readonly kind: TargetKind; resolve(definition: TargetDefinition, bars: readonly Bar[], entryIndex: number, atr?: number): TargetResolution | null; }
export class TargetRegistry {
  private readonly targets = new Map<string, TargetDefinition>(); private readonly resolvers = new Map<TargetKind, TargetResolver>();
  register(target: TargetDefinition): void { if (this.targets.has(target.targetVersion)) throw new Error(`Duplicate target version: ${target.targetVersion}`); if (!Number.isInteger(target.horizonBars) || target.horizonBars <= 0) throw new Error("Target horizon must be positive"); if (target.kind === "TRIPLE_BARRIER" && (!Number.isFinite(target.upperBarrierMultiple) || !Number.isFinite(target.lowerBarrierMultiple))) throw new Error("Triple-barrier target requires barrier multiples"); this.targets.set(target.targetVersion, structuredClone(target)); }
  registerResolver(resolver: TargetResolver) { this.resolvers.set(resolver.kind, resolver); }
  get(targetVersion: string): TargetDefinition | undefined { const target = this.targets.get(targetVersion); return target ? structuredClone(target) : undefined; }
  resolver(kind: TargetKind) { return this.resolvers.get(kind); }
  all(): readonly TargetDefinition[] { return [...this.targets.values()].map((target) => structuredClone(target)); }
}
