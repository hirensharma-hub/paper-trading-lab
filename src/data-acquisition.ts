import { writeFileSync } from "node:fs";
import { parseTimestampStrict, validateBar } from "./data";
import type { Bar } from "./domain";

export type HistoricalInterval = "1m" | "5m" | "15m" | "1h" | "1d";
export interface HistoricalBarsRequest { symbol: string; interval: HistoricalInterval; start: string; end: string; regularSessionOnly?: boolean; }
export interface HistoricalBarsResponse { bars: readonly Bar[]; provider: string; requested: HistoricalBarsRequest; rawResponseCount: number; metadata: Record<string, unknown>; }
export interface HistoricalDataProvider { providerId: string; fetchBars(request: HistoricalBarsRequest): Promise<HistoricalBarsResponse>; }
export interface FetchLike { (input: string, init?: RequestInit): Promise<Response>; }

const TWELVE_DATA_MAX_ROWS = 5000;
const MIN_CHUNK_DAYS = 1;

export function toTwelveDataInterval(interval: HistoricalInterval): string {
  switch (interval) {
    case "1m": return "1min";
    case "5m": return "5min";
    case "15m": return "15min";
    case "1h": return "1h";
    case "1d": return "1day";
    default: { const exhaustive: never = interval; throw new Error(`INVALID_HISTORICAL_INTERVAL:${String(exhaustive)}`); }
  }
}

function intervalMilliseconds(interval: HistoricalInterval): number {
  switch (interval) {
    case "1m": return 60_000;
    case "5m": return 300_000;
    case "15m": return 900_000;
    case "1h": return 3_600_000;
    case "1d": return 86_400_000;
    default: { const exhaustive: never = interval; throw new Error(`INVALID_HISTORICAL_INTERVAL:${String(exhaustive)}`); }
  }
}

// 20% safety margin against the provider's 5,000-row response ceiling.
function safeChunkDays(interval: HistoricalInterval): number {
  const barsPerDay = 86_400_000 / intervalMilliseconds(interval);
  return Math.max(MIN_CHUNK_DAYS, Math.floor((TWELVE_DATA_MAX_ROWS * 0.8) / barsPerDay));
}

function parseProviderTimestamp(raw: unknown): number {
  const value = String(raw ?? "");
  const explicit = /^\d+$/.test(value) ? value : /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  const timestamp = /^\d+$/.test(explicit) ? Number(explicit) * (Number(explicit) < 10_000_000_000 ? 1000 : 1) : parseTimestampStrict(explicit);
  if (!Number.isFinite(timestamp)) throw new Error("TWELVE_DATA_INVALID_TIMESTAMP");
  return timestamp;
}

interface AcquisitionAudit { requestedStart: string; requestedEnd: string; returnedCount: number; firstReturnedTimestamp?: string; lastReturnedTimestamp?: string; subdivided: boolean; }

function normalizeRow(symbol: string, interval: HistoricalInterval, row: Record<string, unknown>): Bar {
  const bar: Bar = { symbol, startMs: parseProviderTimestamp(row.datetime ?? row.timestamp), intervalMs: intervalMilliseconds(interval), open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume) };
  validateBar(bar);
  return bar;
}

function dateOnly(timestamp: number): string { return new Date(timestamp).toISOString().slice(0, 10); }

export class TwelveDataProvider implements HistoricalDataProvider {
  readonly providerId = "twelve-data";
  constructor(private readonly apiKey: string | undefined = process.env.TWELVE_DATA_API_KEY, private readonly fetchImpl: FetchLike = fetch, private readonly baseUrl = "https://api.twelvedata.com/time_series") {}

  async fetchBars(request: HistoricalBarsRequest): Promise<HistoricalBarsResponse> {
    if (!this.apiKey?.trim()) throw new Error("TWELVE_DATA_API_KEY_REQUIRED");
    const startMs = Date.parse(request.start);
    const endMs = Date.parse(request.end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) throw new Error("INVALID_HISTORICAL_DATE_RANGE");
    const apiInterval = toTwelveDataInterval(request.interval);
    const initialChunkDays = safeChunkDays(request.interval);
    const chunks: AcquisitionAudit[] = [];
    const rawRows: Bar[] = [];
    let rawResponseCount = 0;
    let duplicateCount = 0;
    let rejectedProviderRows = 0;
    let emptyChunkCount = 0;
    const rejectionReasons: string[] = [];

    const requestChunk = async (chunkStartMs: number, chunkEndMs: number, chunkDays: number): Promise<void> => {
      const requestedStart = dateOnly(chunkStartMs);
      const requestedEnd = dateOnly(chunkEndMs);
      const params = new URLSearchParams({ symbol: request.symbol, interval: apiInterval, start_date: requestedStart, end_date: requestedEnd, timezone: "UTC", order: "asc", format: "JSON", outputsize: String(TWELVE_DATA_MAX_ROWS), apikey: this.apiKey! });
      if (request.regularSessionOnly) params.set("prepost", "false");
      let response: Response | undefined;
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await this.fetchImpl(`${this.baseUrl}?${params.toString()}`);
          if (response.ok) break;
          if (![429, 500, 502, 503, 504].includes(response.status)) throw new Error(`TWELVE_DATA_HTTP_${response.status}`);
          lastError = new Error(`TWELVE_DATA_HTTP_${response.status}`);
        } catch (error) {
          lastError = error;
          if (error instanceof Error && /^TWELVE_DATA_HTTP_4(?!29)/.test(error.message)) throw error;
        }
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
      if (!response?.ok) throw lastError instanceof Error ? lastError : new Error("TWELVE_DATA_REQUEST_FAILED");
      const body = await response.json() as { status?: string; message?: string; values?: Record<string, unknown>[] };
      if (body.status === "error" || !Array.isArray(body.values)) throw new Error(`TWELVE_DATA_RESPONSE_INVALID:${body.message ?? "values missing"}`);
      const values = body.values;
      if (values.length === 0) emptyChunkCount++;
      const first = values[0]?.datetime ?? values[0]?.timestamp;
      const last = values.at(-1)?.datetime ?? values.at(-1)?.timestamp;
      const audit: AcquisitionAudit = { requestedStart, requestedEnd, returnedCount: values.length, firstReturnedTimestamp: first === undefined ? undefined : String(first), lastReturnedTimestamp: last === undefined ? undefined : String(last), subdivided: false };
      if (values.length >= TWELVE_DATA_MAX_ROWS && chunkDays > MIN_CHUNK_DAYS) {
        const midpoint = chunkStartMs + Math.floor((chunkEndMs - chunkStartMs) / 2);
        const leftEnd = new Date(midpoint).setUTCHours(23, 59, 59, 999);
        const rightStart = new Date(leftEnd + 1);
        rightStart.setUTCHours(0, 0, 0, 0);
        audit.subdivided = true;
        chunks.push(audit);
        await requestChunk(chunkStartMs, Math.min(chunkEndMs, leftEnd), Math.max(MIN_CHUNK_DAYS, Math.floor(chunkDays / 2)));
        if (rightStart.getTime() <= chunkEndMs) await requestChunk(rightStart.getTime(), chunkEndMs, Math.max(MIN_CHUNK_DAYS, Math.ceil(chunkDays / 2)));
        return;
      }
      chunks.push(audit);
      rawResponseCount += values.length;
      for (const row of values) {
        try { rawRows.push(normalizeRow(request.symbol, request.interval, row)); }
        catch (error) { rejectedProviderRows++; rejectionReasons.push(error instanceof Error ? error.message : "INVALID_PROVIDER_ROW"); }
      }
      if (rejectedProviderRows > 0) throw new Error(`TWELVE_DATA_INVALID_BAR:${rejectionReasons.at(-1)}`);
    };

    for (let cursor = startMs; cursor <= endMs;) {
      const chunkEnd = Math.min(endMs, cursor + initialChunkDays * 86_400_000 - 1);
      await requestChunk(cursor, chunkEnd, Math.max(MIN_CHUNK_DAYS, Math.ceil((chunkEnd - cursor + 1) / 86_400_000)));
      const next = new Date(dateOnly(chunkEnd));
      next.setUTCDate(next.getUTCDate() + 1);
      cursor = next.getTime();
    }
    const unique = new Map<string, Bar>();
    for (const bar of rawRows) { const key = `${bar.symbol}:${bar.startMs}`; if (unique.has(key)) duplicateCount++; else unique.set(key, bar); }
    const bars = [...unique.values()].sort((a, b) => a.startMs - b.startMs);
    return { bars, provider: this.providerId, requested: request, rawResponseCount, metadata: { endpoint: "time_series", timezone: "UTC", apiInterval, chunkDays: initialChunkDays, chunks, rawResponseCount, normalizedBarCount: rawRows.length, duplicateCount, rejectedProviderRows, rejectionReasons, emptyChunkCount, missingChunkPolicy: "EXPLICITLY_RECORDED_NOT_FILLED", retrievedAt: new Date().toISOString(), apiKeyPersisted: false } };
  }
}

export function barsToCsv(bars: readonly Bar[]): string { return ["timestamp,symbol,open,high,low,close,volume", ...bars.map((bar) => `${new Date(bar.startMs).toISOString()},${bar.symbol},${bar.open},${bar.high},${bar.low},${bar.close},${bar.volume}`)].join("\n") + "\n"; }
export function writeAcquisitionOutput(outputPath: string, response: HistoricalBarsResponse): void { writeFileSync(outputPath, barsToCsv(response.bars)); writeFileSync(`${outputPath}.provenance.json`, JSON.stringify({ provider: response.provider, symbols: [response.requested.symbol], interval: response.requested.interval, requestedStart: response.requested.start, requestedEnd: response.requested.end, downloadedAt: response.metadata.retrievedAt, rawResponseCount: response.rawResponseCount, normalizedBarCount: response.bars.length, metadata: response.metadata }, null, 2)); }
