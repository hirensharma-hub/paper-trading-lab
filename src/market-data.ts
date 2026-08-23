import type { Bar, DataQualityIssue, DataQualityReport, Quote } from "./domain";
import { validateBar, validateQuote } from "./data";
import { readFile } from "node:fs/promises";

export interface HistoricalMarketDataProvider { getBars(symbol: string, startMs?: number, endMs?: number): Promise<readonly Bar[]>; }
export interface LiveQuoteProvider { subscribe(symbols: readonly string[], onQuote: (quote: Quote) => void): Promise<() => void>; }
export interface InstrumentMetadataProvider { getInstrument(symbol: string): Promise<{ symbol: string; exchange?: string; currency?: string } | null>; }
export class InMemoryMarketDataProvider implements HistoricalMarketDataProvider { constructor(private readonly bars: readonly Bar[]) {} async getBars(symbol: string, startMs = -Infinity, endMs = Infinity) { return this.bars.filter((bar) => bar.symbol === symbol && bar.startMs >= startMs && bar.startMs <= endMs).sort((a, b) => a.startMs - b.startMs); } }
export class CsvFileMarketDataProvider implements HistoricalMarketDataProvider { constructor(private readonly filePath: string) {} async getBars(symbol: string, startMs = -Infinity, endMs = Infinity) { const parsed = parseCsvBars(await readFile(this.filePath, "utf8")); return parsed.bars.filter((bar) => bar.symbol === symbol && bar.startMs >= startMs && bar.startMs <= endMs); } }

const REQUIRED = ["symbol", "timestamp", "open", "high", "low", "close", "volume"] as const;
export function parseCsvBars(csv: string): { bars: readonly Bar[]; report: DataQualityReport } {
  const rows = csv.trim().split(/\r?\n/).filter(Boolean); const rawHeader = rows.shift()?.split(",").map((x) => x.trim().toLowerCase()) ?? []; const header = new Map(rawHeader.map((name, index) => [name, index])); const issues: DataQualityIssue[] = []; const accepted: Bar[] = []; const seen = new Set<string>(); let duplicates = 0; let invalidOhlc = 0; let invalidVolume = 0; let invalidTimestampRows = 0; let invalidIntervalRows = 0; let missingFieldRows = 0;
  const missing = REQUIRED.filter((field) => !header.has(field));
  if (missing.length) { for (let i = 0; i < rows.length; i++) issues.push({ row: i + 2, code: "MISSING_FIELD", message: `Missing required columns: ${missing.join(", ")}` }); return { bars: [], report: { totalRows: rows.length, acceptedRows: 0, rejectedRows: rows.length, duplicates: 0, timeGaps: 0, invalidOhlc: 0, invalidVolume: 0, invalidTimestampRows: 0, invalidIntervalRows: 0, missingFieldRows: rows.length, symbols: [], issues } }; }
  const value = (values: string[], field: string) => values[header.get(field)!]?.trim() ?? "";
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const values = rows[rowIndex].split(","); const symbol = value(values, "symbol"); const timestamp = Date.parse(value(values, "timestamp")); const intervalMs = Number(value(values, "intervalms") || 60_000); const bar = { symbol, startMs: timestamp, intervalMs, open: Number(value(values, "open")), high: Number(value(values, "high")), low: Number(value(values, "low")), close: Number(value(values, "close")), volume: Number(value(values, "volume")) };
    if (!symbol || !Number.isFinite(timestamp)) { invalidTimestampRows++; issues.push({ row: rowIndex + 2, code: "INVALID_TIMESTAMP", message: "Timestamp is missing or invalid" }); continue; }
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) { invalidIntervalRows++; issues.push({ row: rowIndex + 2, code: "INVALID_INTERVAL", message: "Interval must be positive" }); continue; }
    try { validateBar(bar); } catch { if (bar.volume < 0 || !Number.isFinite(bar.volume)) { invalidVolume++; issues.push({ row: rowIndex + 2, code: "INVALID_VOLUME", message: "Volume must be finite and non-negative" }); } else { invalidOhlc++; issues.push({ row: rowIndex + 2, code: "INVALID_OHLC", message: "OHLC values are inconsistent or non-positive" }); } continue; }
    const key = `${bar.symbol}:${bar.startMs}:${bar.intervalMs}`; if (seen.has(key)) { duplicates++; issues.push({ row: rowIndex + 2, code: "DUPLICATE_BAR", message: `Duplicate bar ${key}` }); continue; } seen.add(key); accepted.push(bar);
  }
  accepted.sort((a, b) => a.symbol.localeCompare(b.symbol) || a.startMs - b.startMs); const symbols = [...new Set(accepted.map((bar) => bar.symbol))].sort(); let timeGaps = 0;
  for (const symbol of symbols) { const symbolBars = accepted.filter((bar) => bar.symbol === symbol); for (let i = 1; i < symbolBars.length; i++) if (symbolBars[i].startMs - symbolBars[i - 1].startMs > symbolBars[i - 1].intervalMs) { timeGaps++; issues.push({ row: 0, code: "TIME_GAP", message: `${symbol} has a gap before ${symbolBars[i].startMs}` }); } }
  const globalStart = accepted.length ? Math.min(...accepted.map((bar) => bar.startMs)) : undefined; const globalEnd = accepted.length ? Math.max(...accepted.map((bar) => bar.startMs)) : undefined;
  return { bars: accepted, report: { totalRows: rows.length, acceptedRows: accepted.length, rejectedRows: rows.length - accepted.length, duplicates, timeGaps, invalidOhlc, invalidVolume, invalidTimestampRows, invalidIntervalRows, missingFieldRows, globalStart, globalEnd, start: globalStart, end: globalEnd, symbols, issues } };
}

export function validateQuoteBatch(quotes: readonly Quote[]) { quotes.forEach(validateQuote); return quotes; }
