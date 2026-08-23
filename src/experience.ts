import type { Bar } from "./domain";

export interface PredictionRecord { predictionId: string; symbol: string; decisionTimestamp: number; horizonBars: number; probability: number; decision: "BUY" | "SELL" | "HOLD" | "NO_TRADE"; modelVersion: string; featureVersion: string; resolved?: PredictionResolution; }
export interface PredictionResolution { resolutionTimestamp: number; forwardReturn: number; label: "WIN" | "LOSS" | "FLAT"; maxFavorableExcursion: number; maxAdverseExcursion: number; }
export interface ExperienceRecord extends PredictionRecord { resolved: PredictionResolution; }

export function resolvePrediction(prediction: PredictionRecord, bars: readonly Bar[]): ExperienceRecord | null {
  const eligible = bars.filter((bar) => bar.symbol === prediction.symbol && bar.startMs + bar.intervalMs > prediction.decisionTimestamp).sort((a, b) => a.startMs - b.startMs); const horizon = eligible.slice(0, prediction.horizonBars); if (horizon.length < prediction.horizonBars || !horizon.length) return null;
  const entry = horizon[0].open; const exit = horizon.at(-1)!.close; const forwardReturn = exit / entry - 1; const maxFavorableExcursion = Math.max(...horizon.map((bar) => bar.high / entry - 1)); const maxAdverseExcursion = Math.min(...horizon.map((bar) => bar.low / entry - 1)); const label = forwardReturn > 0 ? "WIN" : forwardReturn < 0 ? "LOSS" : "FLAT";
  return { ...prediction, resolved: { resolutionTimestamp: horizon.at(-1)!.startMs + horizon.at(-1)!.intervalMs, forwardReturn, label, maxFavorableExcursion, maxAdverseExcursion } };
}
