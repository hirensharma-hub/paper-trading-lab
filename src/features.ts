import type { Bar, FeatureVector, Quote } from "./domain";

const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const std = (values: readonly number[]) => {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
};

export interface FeatureConfig {
  sessionsPerYear?: number;
  sessionMinutesPerDay?: number;
}

export function ema(values: readonly number[], period: number): number {
  if (values.length < period) return Number.NaN;
  const alpha = 2 / (period + 1);
  let result = mean(values.slice(0, period));
  for (const value of values.slice(period)) result = alpha * value + (1 - alpha) * result;
  return result;
}

export function rsi(values: readonly number[], period = 14): number {
  if (values.length <= period) return Number.NaN;
  const changes = values.slice(1).map((value, i) => value - values[i]);
  const gains = changes.slice(0, period).map((v) => Math.max(v, 0));
  const losses = changes.slice(0, period).map((v) => Math.max(-v, 0));
  let averageGain = mean(gains);
  let averageLoss = mean(losses);
  for (const change of changes.slice(period)) {
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (averageLoss === 0) return 100;
  return 100 - 100 / (1 + averageGain / averageLoss);
}

export function buildFeatures(bars: readonly Bar[], quote?: Quote, config: FeatureConfig = {}): FeatureVector | null {
  if (bars.some((bar) => bar.symbol !== bars[0].symbol)) throw new Error("Feature history must contain one symbol");
  if (bars.length < 20) return null;
  const closes = bars.map((bar) => bar.close);
  const volumes = bars.slice(-20).map((bar) => bar.volume);
  const close = closes.at(-1)!;
  const fast = ema(closes, 5);
  const slow = ema(closes, 20);
  const returns = closes.slice(1).map((value, i) => Math.log(value / closes[i]));
  const recentReturns = returns.slice(-20);
  const volumeMean = mean(volumes);
  const volumeStd = std(volumes);
  const sessionMinutes = config.sessionMinutesPerDay ?? 390;
  const sessionsPerYear = config.sessionsPerYear ?? 252;
  const intervalMinutes = bars.at(-1)!.intervalMs / 60_000;
  const annualisedPeriods = intervalMinutes > 0 ? sessionsPerYear * (sessionMinutes / intervalMinutes) : Number.NaN;
  return {
    ts: bars.at(-1)!.startMs + bars.at(-1)!.intervalMs,
    symbol: bars.at(-1)!.symbol,
    close,
    ret1: returns.at(-1) ?? Number.NaN,
    ret5: Math.log(close / closes.at(-6)!),
    emaFast: fast,
    emaSlow: slow,
    emaFastDistance: (close - fast) / close,
    emaSlowDistance: (close - slow) / close,
    rsi14: rsi(closes),
    realisedVol20: std(recentReturns) * Math.sqrt(annualisedPeriods),
    volumeZ: volumeStd === 0 ? 0 : (volumes.at(-1)! - volumeMean) / volumeStd,
    spreadBps: quote ? ((quote.ask - quote.bid) / ((quote.ask + quote.bid) / 2)) * 10_000 : undefined,
    bookImbalance: quote?.bidSize !== undefined && quote.askSize !== undefined
      ? (quote.bidSize - quote.askSize) / (quote.bidSize + quote.askSize || 1)
      : undefined,
  };
}
