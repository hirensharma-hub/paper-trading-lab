import type { Bar, Quote } from "./domain";

export function validateBar(bar: Bar): void {
  if (!bar.symbol || !Number.isInteger(bar.startMs) || bar.intervalMs <= 0) throw new Error("Invalid bar identity or interval");
  if (![bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite) || bar.volume < 0) throw new Error("Invalid bar values");
  if (bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close) || bar.low > bar.high) throw new Error("OHLC bounds are inconsistent");
}

export function validateQuote(quote: Quote): void {
  if (!quote.symbol || !Number.isInteger(quote.ts) || !Number.isFinite(quote.bid) || !Number.isFinite(quote.ask) || quote.bid <= 0 || quote.ask <= 0 || quote.bid > quote.ask) throw new Error("Invalid quote");
  if (quote.bidSize !== undefined && (!Number.isFinite(quote.bidSize) || quote.bidSize < 0)) throw new Error("Invalid bid size");
  if (quote.askSize !== undefined && (!Number.isFinite(quote.askSize) || quote.askSize < 0)) throw new Error("Invalid ask size");
}

export function appendBar(history: readonly Bar[], bar: Bar): Bar[] {
  validateBar(bar);
  const last = history.at(-1);
  if (last && (last.symbol !== bar.symbol || bar.startMs <= last.startMs)) throw new Error("Bars must be symbol-specific and strictly increasing");
  return [...history, bar];
}
