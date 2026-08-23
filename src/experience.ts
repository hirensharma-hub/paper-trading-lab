import type { Bar } from "./domain";
import { tripleBarrierTarget } from "./research";
import { TargetRegistry } from "./targets";

export interface PredictionRecord { predictionId: string; symbol: string; decisionTimestamp: number; horizonBars: number; targetVersion: string; targetParameters?: Readonly<Record<string, number>>; probability: number; decision: "BUY" | "SELL" | "HOLD" | "NO_TRADE"; modelVersion: string; featureVersion: string; resolved?: PredictionResolution; }
export interface PredictionResolution { resolutionTimestamp: number; forwardReturn: number; label: "WIN" | "LOSS" | "FLAT"; maxFavorableExcursion: number; maxAdverseExcursion: number; }
export interface ExperienceRecord extends PredictionRecord { resolved: PredictionResolution; }

export const defaultTargetRegistry = new TargetRegistry();
defaultTargetRegistry.register({ targetVersion: "forward-close-v1", kind: "FORWARD_CLOSE_RETURN", horizonBars: 1 });
defaultTargetRegistry.register({ targetVersion: "triple-barrier-v1", kind: "TRIPLE_BARRIER", horizonBars: 1, upperBarrierMultiple: 1, lowerBarrierMultiple: 1 });

export function resolvePrediction(prediction: PredictionRecord, bars: readonly Bar[], registry: TargetRegistry = defaultTargetRegistry): ExperienceRecord | null {
  const definition = registry.get(prediction.targetVersion); if (!definition || prediction.horizonBars <= 0) return null;
  const history = bars.filter((bar) => bar.symbol === prediction.symbol).sort((a, b) => a.startMs - b.startMs); let decisionIndex = -1; for (let index = 0; index < history.length; index++) if (history[index].startMs + history[index].intervalMs <= prediction.decisionTimestamp) decisionIndex = index; const targetIndex = decisionIndex + prediction.horizonBars; if (decisionIndex < 0 || targetIndex >= history.length) return null;
  const entry = history[decisionIndex].close; const targetBar = history[targetIndex]; const window = history.slice(decisionIndex + 1, targetIndex + 1); const forwardReturn = targetBar.close / entry - 1; const maxFavorableExcursion = Math.max(...window.map((bar) => bar.high / entry - 1)); const maxAdverseExcursion = Math.min(...window.map((bar) => bar.low / entry - 1)); let label: PredictionResolution["label"] = forwardReturn > 0 ? "WIN" : forwardReturn < 0 ? "LOSS" : "FLAT";
  if (definition.kind === "TRIPLE_BARRIER") { const atr = prediction.targetParameters?.atr; if (!Number.isFinite(atr) || atr! <= 0) return null; const barrier = tripleBarrierTarget(history, decisionIndex, atr!, definition.upperBarrierMultiple ?? 1, definition.lowerBarrierMultiple ?? 1, prediction.horizonBars); if (!barrier || barrier.label === "AMBIGUOUS") label = "FLAT"; else label = barrier.label === "UP" ? "WIN" : barrier.label === "DOWN" ? "LOSS" : "FLAT"; }
  return { ...prediction, resolved: { resolutionTimestamp: targetBar.startMs + targetBar.intervalMs, forwardReturn, label, maxFavorableExcursion, maxAdverseExcursion } };
}

export class PredictionQueue {
  private readonly pending = new Map<string, PredictionRecord>();
  enqueue(prediction: PredictionRecord): void { if (this.pending.has(prediction.predictionId)) throw new Error(`Duplicate prediction id: ${prediction.predictionId}`); this.pending.set(prediction.predictionId, structuredClone(prediction)); }
  resolveAvailable(bars: readonly Bar[]): readonly ExperienceRecord[] { const resolved: ExperienceRecord[] = []; for (const [id, prediction] of this.pending) { const experience = resolvePrediction(prediction, bars); if (experience) { resolved.push(experience); this.pending.delete(id); } } return resolved; }
  pendingRecords(): readonly PredictionRecord[] { return [...this.pending.values()].map((prediction) => structuredClone(prediction)); }
}
