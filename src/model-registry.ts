export type ModelLifecycle = "CANDIDATE" | "ACTIVE" | "REJECTED";
export interface ModelRecord { modelId: string; version: string; algorithm: string; featureVersion: string; datasetVersion: string; metrics: Readonly<Record<string, number>>; lifecycle: ModelLifecycle; createdAt: number; }

export class ModelRegistry {
  private readonly models = new Map<string, ModelRecord>();
  register(model: ModelRecord): void { if (this.models.has(model.modelId)) throw new Error(`Duplicate model id: ${model.modelId}`); if (model.lifecycle === "ACTIVE" && [...this.models.values()].some((item) => item.lifecycle === "ACTIVE")) throw new Error("Only one active model is permitted"); this.models.set(model.modelId, structuredClone(model)); }
  get(modelId: string): ModelRecord | undefined { const model = this.models.get(modelId); return model ? structuredClone(model) : undefined; }
  active(): ModelRecord | undefined { const model = [...this.models.values()].find((item) => item.lifecycle === "ACTIVE"); return model ? structuredClone(model) : undefined; }
  promote(modelId: string, minimumOosScore: number): ModelRecord { const candidate = this.models.get(modelId); if (!candidate || candidate.lifecycle !== "CANDIDATE") throw new Error("Only a registered candidate can be promoted"); const score = candidate.metrics.outOfSampleScore; if (!Number.isFinite(score) || score < minimumOosScore) throw new Error("Candidate does not meet out-of-sample promotion threshold"); for (const model of this.models.values()) if (model.lifecycle === "ACTIVE") model.lifecycle = "REJECTED"; candidate.lifecycle = "ACTIVE"; return structuredClone(candidate); }
  all(): readonly ModelRecord[] { return [...this.models.values()].map((model) => structuredClone(model)); }
}
