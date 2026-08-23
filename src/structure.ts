import type { Bar } from "./domain";

export interface SwingPoint { index: number; timestamp: number; price: number; type: "HIGH" | "LOW"; }
export interface MarketStructureSnapshot { symbol: string; timestamp: number; swingHighs: readonly SwingPoint[]; swingLows: readonly SwingPoint[]; rangeHigh: number; rangeLow: number; trend: "HIGHER_HIGHS_HIGHER_LOWS" | "LOWER_HIGHS_LOWER_LOWS" | "RANGE" | "INSUFFICIENT"; }
export interface StructureConfig { pivotRadius?: number; rangeLookback?: number; }

export function detectMarketStructure(bars: readonly Bar[], config: StructureConfig = {}): MarketStructureSnapshot | null {
  if (!bars.length) return null; const radius = config.pivotRadius ?? 2; const rangeLookback = config.rangeLookback ?? 20; const highs: SwingPoint[] = []; const lows: SwingPoint[] = [];
  for (let i = radius; i < bars.length - radius; i++) { const current = bars[i]; const left = bars.slice(i - radius, i); const right = bars.slice(i + 1, i + radius + 1); if (left.every((bar) => current.high > bar.high) && right.every((bar) => current.high >= bar.high)) highs.push({ index: i, timestamp: current.startMs + current.intervalMs, price: current.high, type: "HIGH" }); if (left.every((bar) => current.low < bar.low) && right.every((bar) => current.low <= bar.low)) lows.push({ index: i, timestamp: current.startMs + current.intervalMs, price: current.low, type: "LOW" }); }
  const lastHighs = highs.slice(-2); const lastLows = lows.slice(-2); const trend = lastHighs.length < 2 || lastLows.length < 2 ? "INSUFFICIENT" : lastHighs[1].price > lastHighs[0].price && lastLows[1].price > lastLows[0].price ? "HIGHER_HIGHS_HIGHER_LOWS" : lastHighs[1].price < lastHighs[0].price && lastLows[1].price < lastLows[0].price ? "LOWER_HIGHS_LOWER_LOWS" : "RANGE";
  const recent = bars.slice(-rangeLookback); return { symbol: bars.at(-1)!.symbol, timestamp: bars.at(-1)!.startMs + bars.at(-1)!.intervalMs, swingHighs: highs, swingLows: lows, rangeHigh: Math.max(...recent.map((bar) => bar.high)), rangeLow: Math.min(...recent.map((bar) => bar.low)), trend };
}
