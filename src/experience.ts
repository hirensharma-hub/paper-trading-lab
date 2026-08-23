import type { Bar } from "./domain";

export interface PredictionRecord { predictionId: string; symbol: string; decisionTimestamp: number; horizonBars: number; targetVersion: string; probability: number; decision: "BUY" | "SELL" | "HOLD" | "NO_TRADE"; modelVersion: string; featureVersion: string; resolved?: PredictionResolution; }
export interface PredictionResolution { resolutionTimestamp: number; forwardReturn: number; label: "WIN" | "LOSS" | "FLAT"; maxFavorableExcursion: number; maxAdverseExcursion: number; }
export interface ExperienceRecord extends PredictionRecord { resolved: PredictionResolution; }

export function resolvePrediction(prediction: PredictionRecord, bars: readonly Bar[]): ExperienceRecord | null {
  if (prediction.targetVersion !== "forward-close-v1" || prediction.horizonBars <= 0) return null;
  const history = bars.filter((bar) => bar.symbol === prediction.symbol).sort((a, b) => a.startMs - b.startMs); let decisionIndex = -1; for (let index = 0; index < history.length; index++) if (history[index].startMs + history[index].intervalMs <= prediction.decisionTimestamp) decisionIndex = index; const targetIndex = decisionIndex + prediction.horizonBars; if (decisionIndex < 0 || targetIndex >= history.length) return null;
  const entry = history[decisionIndex].close; const target = history[targetIndex]; const window = history.slice(decisionIndex + 1, targetIndex + 1); const forwardReturn = target.close / entry - 1; const maxFavorableExcursion = Math.max(...window.map((bar) => bar.high / entry - 1)); const maxAdverseExcursion = Math.min(...window.map((bar) => bar.low / entry - 1)); const label = forwardReturn > 0 ? "WIN" : forwardReturn < 0 ? "LOSS" : "FLAT";
  return { ...prediction, resolved: { resolutionTimestamp: target.startMs + target.intervalMs, forwardReturn, label, maxFavorableExcursion, maxAdverseExcursion } };
}

export class PredictionQueue {
  private readonly pending = new Map<string, PredictionRecord>();
  enqueue(prediction: PredictionRecord): void { if (this.pending.has(prediction.predictionId)) throw new Error(`Duplicate prediction id: ${prediction.predictionId}`); this.pending.set(prediction.predictionId, structuredClone(prediction)); }
  resolveAvailable(bars: readonly Bar[]): readonly ExperienceRecord[] { const resolved: ExperienceRecord[] = []; for (const [id, prediction] of this.pending) { const experience = resolvePrediction(prediction, bars); if (experience) { resolved.push(experience); this.pending.delete(id); } } return resolved; }
  pendingRecords(): readonly PredictionRecord[] { return [...this.pending.values()].map((prediction) => structuredClone(prediction)); }
}
