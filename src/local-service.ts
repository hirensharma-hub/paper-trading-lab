import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Bar, Quote } from "./domain";
import { validateBar, validateQuote } from "./data";

export interface LocalServiceOptions { host?: string; port?: number; maxBodyBytes?: number; allowedOrigins?: readonly string[]; unsafeAllowNonLoopbackForDevelopment?: boolean; protocolVersion?: string; serviceVersion?: string; }
export interface LocalEnginePort { health: unknown; portfolioSnapshot(ts: number): unknown; setOperationalNow(ts: number): void; onBar(bar: Bar, quote: Quote): unknown; pause(): void; resume(): void; activateKillSwitch(): void; resetKillSwitch(): void; }
export interface LocalServiceStatus { ok: true; service: "paper-trading-lab"; safety: "PAPER_ONLY"; serviceVersion: string; protocolVersion: string; engineMode: string; dataStatus: string; engine: unknown; }
type MarketEvent = { bar: Bar; quote: Quote };

async function body(request: IncomingMessage, maximum: number): Promise<unknown> { const chunks: Buffer[] = []; let length = 0; for await (const chunk of request) { const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); length += bytes.length; if (length > maximum) throw new Error("Request body too large"); chunks.push(bytes); } if (!chunks.length) throw new Error("Request body is required"); return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function json(response: ServerResponse, status: number, value: unknown, origin?: string) { response.statusCode = status; response.setHeader("Content-Type", "application/json"); if (origin) response.setHeader("Access-Control-Allow-Origin", origin); response.end(JSON.stringify(value)); }
function permittedOrigin(origin: string | undefined, configured: readonly string[]): string | undefined { return origin && configured.includes(origin) ? origin : undefined; }

export class LocalPaperEngineService {
  private server?: Server;
  constructor(readonly engine: LocalEnginePort, private readonly options: LocalServiceOptions = {}) {}
  async start(): Promise<void> {
    if (this.server) throw new Error("Service is already running");
    const host = this.options.host ?? "127.0.0.1"; const port = this.options.port ?? 47821; const maximum = this.options.maxBodyBytes ?? 1_000_000; const configuredOrigins = this.options.allowedOrigins ?? []; const loopback = host === "127.0.0.1" || host === "::1" || host === "localhost"; if (!loopback && !this.options.unsafeAllowNonLoopbackForDevelopment) throw new Error("Non-loopback binding requires unsafeAllowNonLoopbackForDevelopment");
    this.server = createServer(async (request, response) => {
      const origin = permittedOrigin(request.headers.origin, configuredOrigins);
      try {
        if (request.headers.origin && !origin) { json(response, 403, { ok: false, error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin is not allowed" } }); return; }
        if (request.method === "OPTIONS") { if (!origin) { response.statusCode = 403; response.end(); return; } response.statusCode = 204; response.setHeader("Access-Control-Allow-Origin", origin); response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS"); response.setHeader("Access-Control-Allow-Headers", "Content-Type"); response.end(); return; }
        this.engine.setOperationalNow(Date.now());
        const path = new URL(request.url ?? "/", `http://${host}`).pathname;
        if (request.method === "GET" && path === "/health") { const health = this.engine.health as Record<string, unknown>; json(response, 200, { ok: true, service: "paper-trading-lab", safety: "PAPER_ONLY", serviceVersion: this.options.serviceVersion ?? String(health.serviceVersion ?? "0.2.0"), protocolVersion: this.options.protocolVersion ?? String(health.protocolVersion ?? "1"), engineMode: String(health.engineMode ?? "INTEGRATED_RESEARCH"), dataStatus: health.dataFresh ? "FRESH" : health.lastQuoteTs && Object.keys(health.lastQuoteTs as object).length ? "STALE" : "NO_DATA", engine: health } satisfies LocalServiceStatus, origin); return; }
        if (request.method === "GET" && path === "/state") { const health = this.engine.health as Record<string, unknown>; json(response, 200, { ok: true, serviceVersion: this.options.serviceVersion ?? "0.2.0", protocolVersion: this.options.protocolVersion ?? "1", engineMode: health.engineMode ?? "INTEGRATED_RESEARCH", dataStatus: health.dataFresh ? "FRESH" : "NO_DATA", snapshot: this.engine.portfolioSnapshot(Date.now()), health }, origin); return; }
        if (request.method === "POST" && path === "/market-event") { const payload = await body(request, maximum); if (!isRecord(payload) || !isRecord(payload.bar) || !isRecord(payload.quote)) throw new Error("Market event requires bar and quote objects"); validateBar(payload.bar as unknown as Bar); validateQuote(payload.quote as unknown as Quote); const event: MarketEvent = { bar: payload.bar as unknown as Bar, quote: payload.quote as unknown as Quote }; const signal = this.engine.onBar(event.bar, event.quote); json(response, 200, { ok: true, signal, engine: this.engine.health }, origin); return; }
        if (request.method === "POST" && path === "/control/pause") { this.engine.pause(); json(response, 200, { ok: true, engine: this.engine.health }, origin); return; }
        if (request.method === "POST" && path === "/control/resume") { this.engine.resume(); json(response, 200, { ok: true, engine: this.engine.health }, origin); return; }
        if (request.method === "POST" && path === "/control/kill-switch") { this.engine.activateKillSwitch(); json(response, 200, { ok: true, engine: this.engine.health }, origin); return; }
        if (request.method === "POST" && path === "/control/reset-kill-switch") { this.engine.resetKillSwitch(); json(response, 200, { ok: true, engine: this.engine.health }, origin); return; }
        json(response, 404, { ok: false, error: "Not found" }, origin);
      } catch (error) { const message = error instanceof Error ? error.message : "Request failed"; json(response, message === "Request body too large" ? 413 : 400, { ok: false, error: { code: message === "Request body too large" ? "BODY_TOO_LARGE" : "BAD_REQUEST", message } }, origin); }
    });
    await new Promise<void>((resolve, reject) => { this.server!.once("error", reject); this.server!.listen(port, host, () => resolve()); });
  }
  async stop(): Promise<void> { if (!this.server) return; const server = this.server; this.server = undefined; await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
  address(): { host: string; port: number } | null { const address = this.server?.address(); return address && typeof address !== "string" ? { host: address.address, port: address.port } : null; }
}
