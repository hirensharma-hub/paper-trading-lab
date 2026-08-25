import { createHash } from "node:crypto";
import type { Bar, Quote } from "./domain";

export const BAR_CANONICALIZATION_VERSION = "bars-canonical-json-v1" as const;
export type DatasetOrigin = "EXTERNAL_HISTORICAL_FILE" | "SYNTHETIC_FIXTURE";
export function canonicalizeBars(bars: readonly Bar[]): readonly [string, number, number, number, number, number, number, number][] { return [...bars].map((bar) => [String(bar.symbol), Number(bar.startMs), Number(bar.intervalMs), Number(bar.open), Number(bar.high), Number(bar.low), Number(bar.close), Number(bar.volume)] as [string, number, number, number, number, number, number, number]).sort((a, b) => String(a[0]).localeCompare(String(b[0])) || Number(a[1]) - Number(b[1])); }
export function canonicalDatasetHash(bars: readonly Bar[]): string { return createHash("sha256").update(JSON.stringify({ version: BAR_CANONICALIZATION_VERSION, rows: canonicalizeBars(bars) })).digest("hex"); }
export function parseTimestampStrict(raw: string): number { const value = raw.trim(); if (/^[+-]?\d+$/.test(value)) { const timestamp = Number(value); if (Number.isSafeInteger(timestamp)) return timestamp; } if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) throw new Error(`TIMESTAMP_FORMAT_REJECTED:${raw}`); const timestamp = Date.parse(value); if (!Number.isFinite(timestamp)) throw new Error(`TIMESTAMP_INVALID:${raw}`); return timestamp; }

export function validateBar(bar: Bar): void {
  if (!bar.symbol || !Number.isInteger(bar.startMs) || bar.intervalMs <= 0) throw new Error("Invalid bar identity or interval");
  if (![bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite) || [bar.open, bar.high, bar.low, bar.close].some((value) => value <= 0) || bar.volume < 0) throw new Error("Invalid bar values");
  if (bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close) || bar.low > bar.high) throw new Error("OHLC bounds are inconsistent");
}

export function validateQuote(quote: Quote): void {
  if (!quote.symbol || !Number.isInteger(quote.ts) || !Number.isFinite(quote.bid) || !Number.isFinite(quote.ask) || quote.bid <= 0 || quote.ask <= 0 || quote.bid > quote.ask) throw new Error("Invalid quote");
  if (quote.bidSize !== undefined && (!Number.isFinite(quote.bidSize) || quote.bidSize < 0)) throw new Error("Invalid bid size");
  if (quote.askSize !== undefined && (!Number.isFinite(quote.askSize) || quote.askSize < 0)) throw new Error("Invalid ask size");
  if (quote.last !== undefined && (!Number.isFinite(quote.last) || quote.last <= 0)) throw new Error("Invalid last trade price");
}

export function appendBar(history: readonly Bar[], bar: Bar): Bar[] {
  validateBar(bar);
  const last = history.at(-1);
  if (last && (last.symbol !== bar.symbol || bar.startMs <= last.startMs)) throw new Error("Bars must be symbol-specific and strictly increasing");
  return [...history, bar];
}
