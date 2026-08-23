import type { Bar, DataQualityReport, Quote } from "./domain";
import { validateBar, validateQuote } from "./data";

export interface HistoricalMarketDataProvider { getBars(symbol: string, startMs?: number, endMs?: number): Promise<readonly Bar[]>; }
export interface LiveQuoteProvider { subscribe(symbols: readonly string[], onQuote: (quote: Quote) => void): Promise<() => void>; }
export interface InstrumentMetadataProvider { getInstrument(symbol: string): Promise<{ symbol: string; exchange?: string; currency?: string } | null>; }
export class InMemoryMarketDataProvider implements HistoricalMarketDataProvider {
  constructor(private readonly bars: readonly Bar[]) {}
  async getBars(symbol: string, startMs = -Infinity, endMs = Infinity) { return this.bars.filter((bar) => bar.symbol === symbol && bar.startMs >= startMs && bar.startMs <= endMs); }
}

export function parseCsvBars(csv: string): { bars: readonly Bar[]; report: DataQualityReport } {
  const rows = csv.trim().split(/\r?\n/).filter(Boolean); const header = rows.shift()?.split(",").map((x) => x.trim().toLowerCase()) ?? []; const get = (values: string[], key: string) => values[header.indexOf(key)]?.trim(); const bars: Bar[] = []; const seen = new Set<string>(); let rejectedRows = 0; let duplicates = 0; let invalidOhlc = 0; let invalidVolume = 0; let timeGaps = 0; const symbols = new Set<string>();
  for (const row of rows) { const values = row.split(","); const symbol = get(values, "symbol"); const timestamp = Date.parse(get(values, "timestamp") ?? get(values, "start") ?? ""); const intervalMs = Number(get(values, "intervalms") ?? 60_000); const bar = { symbol: symbol ?? "", startMs: timestamp, intervalMs, open: Number(get(values, "open")), high: Number(get(values, "high")), low: Number(get(values, "low")), close: Number(get(values, "close")), volume: Number(get(values, "volume")) };
    try { validateBar(bar); const key = `${bar.symbol}:${bar.startMs}`; if (seen.has(key)) { duplicates++; continue; } const previous = bars.filter((b) => b.symbol === bar.symbol).at(-1); if (previous && bar.startMs - previous.startMs > bar.intervalMs * 1.5) timeGaps++; seen.add(key); symbols.add(bar.symbol); bars.push(bar); } catch (error) { rejectedRows++; if (bar.volume < 0 || !Number.isFinite(bar.volume)) invalidVolume++; else invalidOhlc++; }
  }
  bars.sort((a, b) => a.symbol.localeCompare(b.symbol) || a.startMs - b.startMs); return { bars, report: { totalRows: rows.length, acceptedRows: bars.length, rejectedRows, duplicates, timeGaps, invalidOhlc, invalidVolume, start: bars[0]?.startMs, end: bars.at(-1)?.startMs, symbols: [...symbols].sort() } };
}

export function validateQuoteBatch(quotes: readonly Quote[]) { quotes.forEach(validateQuote); return quotes; }
