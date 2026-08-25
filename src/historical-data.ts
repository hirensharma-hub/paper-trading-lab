import { readFileSync } from "node:fs";
import type { Bar } from "./domain";
import { parseTimestampStrict, validateBar } from "./data";

export interface BarLoadOptions { intervalMs: number; symbols: readonly string[]; }
export function parseIntervalMs(raw: string | number): number { if (typeof raw === "number") return raw; const value = raw.trim().toLowerCase(); if (/^\d+$/.test(value)) return Number(value); const match = /^(\d+)m$/.exec(value); if (match) return Number(match[1]) * 60_000; const hours = /^(\d+)h$/.exec(value); if (hours) return Number(hours[1]) * 3_600_000; throw new Error(`INVALID_INTERVAL:${raw}`); }

function number(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed)) throw new Error(`INVALID_NUMBER:${field}`);
  return parsed;
}

function fromRecord(record: Record<string, unknown>, options: BarLoadOptions, fallbackSymbol?: string): Bar {
  const symbol = String(record.symbol ?? fallbackSymbol ?? "").trim();
  if (!symbol) throw new Error("SYMBOL_COLUMN_REQUIRED");
  const rawTimestamp = String(record.timestamp ?? record.startMs ?? "");
  const bar: Bar = { symbol, startMs: parseTimestampStrict(rawTimestamp), intervalMs: number(record.intervalMs ?? options.intervalMs, "intervalMs"), open: number(record.open, "open"), high: number(record.high, "high"), low: number(record.low, "low"), close: number(record.close, "close"), volume: number(record.volume, "volume") };
  validateBar(bar);
  return bar;
}

function csvRecords(text: string): { records: Record<string, unknown>[]; hasSymbol: boolean } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length) throw new Error("EMPTY_DATA_FILE");
  const headers = lines.shift()!.split(",").map((value) => value.trim().toLowerCase());
  const records = lines.map((line) => { const cells = line.split(","); return Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() ?? ""])); });
  return { records, hasSymbol: headers.includes("symbol") };
}

export function loadBarsFile(path: string, options: BarLoadOptions): Bar[] {
  const text = readFileSync(path, "utf8");
  if (path.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(text) as unknown;
    const records = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === "object" && Array.isArray((parsed as { bars?: unknown }).bars) ? (parsed as { bars: unknown[] }).bars : undefined);
    if (!records) throw new Error("JSON_BARS_ARRAY_REQUIRED");
    const fallback = options.symbols.length === 1 ? options.symbols[0] : undefined;
    return records.map((record) => fromRecord(record as Record<string, unknown>, options, fallback));
  }
  const parsed = csvRecords(text);
  const fallback = !parsed.hasSymbol && options.symbols.length === 1 ? options.symbols[0] : undefined;
  if (!parsed.hasSymbol && !fallback) throw new Error("SYMBOL_COLUMN_REQUIRED_FOR_MULTISYMBOL_DATA");
  return parsed.records.map((record) => fromRecord(record, options, fallback));
}

export function loadCsvBars(path: string, intervalMs: number, symbols: readonly string[] = ["UNKNOWN"]): Bar[] { return loadBarsFile(path, { intervalMs, symbols }); }

export function suggestSplits(bars: readonly Bar[], proportions = { train: 0.5, validation: 0.15, calibration: 0.15, test: 0.2 }): { trainEnd: number; validationEnd: number; calibrationEnd: number; testEnd: number } {
  const timestamps = [...new Set(bars.map((bar) => bar.startMs))].sort((a, b) => a - b);
  if (timestamps.length < 4) throw new Error("INSUFFICIENT_TIMESTAMPS_FOR_SPLIT_SUGGESTION");
  const pick = (fraction: number) => timestamps[Math.min(timestamps.length - 1, Math.max(0, Math.floor(timestamps.length * fraction) - 1))]!;
  return { trainEnd: pick(proportions.train), validationEnd: pick(proportions.train + proportions.validation), calibrationEnd: pick(proportions.train + proportions.validation + proportions.calibration), testEnd: timestamps.at(-1)! };
}
