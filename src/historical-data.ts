import { readFileSync } from "node:fs";
import type { Bar } from "./domain";
import { parseTimestampStrict, validateBar } from "./data";
import { TradingCalendar } from "./calendar";

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

export function suggestSplits(bars: readonly Bar[], manifest?: { expectedSession?: string; timezone?: string; calendarHolidays?: readonly string[]; calendarEarlyCloses?: Readonly<Record<string, number>>; barIntervalMs?: number }, proportions = { train: 0.5, validation: 0.15, calibration: 0.15, test: 0.2 }): { trainEnd: number; validationEnd: number; calibrationEnd: number; testEnd: number; testDecisionEnd: number; outcomeDataEnd: number; sessionCount: number; trainSessions: number; validationEndSession: number; calibrationEndSession: number; testEndSession: number; outcomeTailBars: number } {
  const calendar = new TradingCalendar({ timeZone: manifest?.timezone ?? "UTC", holidays: manifest?.calendarHolidays, earlyCloses: manifest?.calendarEarlyCloses, ...(manifest?.expectedSession === "ALL" ? { sessionOpenHour: 0, sessionOpenMinute: 0, sessionCloseHour: 23, sessionCloseMinute: 59 } : {}) }); const sessionKeys = [...new Set(bars.map((bar) => calendar.sessionKey(bar.startMs)))].sort(); if (sessionKeys.length < 4) throw new Error("DATASET_TOO_SMALL_FOR_EXPERIMENT:INSUFFICIENT_SESSIONS"); const rowsFor = (key: string) => bars.filter((bar) => calendar.sessionKey(bar.startMs) === key).sort((a, b) => a.startMs - b.startMs); const boundary = (fraction: number) => sessionKeys[Math.min(sessionKeys.length - 1, Math.max(0, Math.floor(sessionKeys.length * fraction) - 1))]!; const trainKey = boundary(proportions.train); const validationKey = boundary(proportions.train + proportions.validation); const calibrationKey = boundary(proportions.train + proportions.validation + proportions.calibration); const trainEnd = Math.max(...rowsFor(trainKey).map((bar) => bar.startMs + bar.intervalMs)); const validationEnd = Math.max(...rowsFor(validationKey).map((bar) => bar.startMs + bar.intervalMs)); const calibrationEnd = Math.max(...rowsFor(calibrationKey).map((bar) => bar.startMs + bar.intervalMs)); const finalRows = bars.filter((bar) => calendar.sessionKey(bar.startMs) === sessionKeys.at(-1)); const outcomeTailBars = 20; const testRows = bars.filter((bar) => bar.startMs >= calibrationEnd).sort((a, b) => a.startMs - b.startMs); const testDecisionEnd = testRows[Math.max(0, testRows.length - outcomeTailBars - 1)]?.startMs ?? calibrationEnd; const outcomeDataEnd = Math.max(...bars.map((bar) => bar.startMs + bar.intervalMs)); return { trainEnd, validationEnd, calibrationEnd, testEnd: outcomeDataEnd, testDecisionEnd, outcomeDataEnd, sessionCount: sessionKeys.length, trainSessions: sessionKeys.indexOf(trainKey) + 1, validationEndSession: sessionKeys.indexOf(validationKey) + 1, calibrationEndSession: sessionKeys.indexOf(calibrationKey) + 1, testEndSession: sessionKeys.length, outcomeTailBars: Math.min(outcomeTailBars, finalRows.length) };
}
