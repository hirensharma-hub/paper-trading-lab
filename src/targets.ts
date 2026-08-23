export type TargetKind = "FORWARD_CLOSE_RETURN" | "TRIPLE_BARRIER";
export interface TargetDefinition { targetVersion: string; kind: TargetKind; horizonBars?: number; costThreshold?: number; upperBarrierMultiple?: number; lowerBarrierMultiple?: number; }

export class TargetRegistry {
  private readonly targets = new Map<string, TargetDefinition>();
  register(target: TargetDefinition): void { if (this.targets.has(target.targetVersion)) throw new Error(`Duplicate target version: ${target.targetVersion}`); if (target.horizonBars !== undefined && (!Number.isInteger(target.horizonBars) || target.horizonBars <= 0)) throw new Error("Target horizon must be positive"); this.targets.set(target.targetVersion, structuredClone(target)); }
  get(targetVersion: string): TargetDefinition | undefined { const target = this.targets.get(targetVersion); return target ? structuredClone(target) : undefined; }
  all(): readonly TargetDefinition[] { return [...this.targets.values()].map((target) => structuredClone(target)); }
}
