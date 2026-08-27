import { appendFileSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type ForwardTable = "processed_bars" | "market_bars" | "predictions" | "decisions" | "paper_orders" | "paper_fills" | "paper_positions" | "portfolio_snapshots" | "pending_experiences" | "resolved_experiences" | "models" | "training_runs" | "evaluation_runs" | "promotion_decisions" | "events";

/**
 * Small durable ledger used by the Oracle Micro deployment.  It deliberately
 * has no network/database dependency: each table is append-only NDJSON and
 * state snapshots are atomically replaced.  Queries are bounded by the caller
 * and all writes are local to PAPER_RUNTIME_DATA_DIR.
 */
export class ForwardStore {
  private readonly lockPath: string;
  private lockFd?: number;
  constructor(readonly root: string, private readonly acquireLock = true) {
    mkdirSync(root, { recursive: true });
    this.lockPath = join(root, "runtime.lock");
    if (acquireLock) this.acquire();
  }

  private acquire() {
    try {
      this.lockFd = openSync(this.lockPath, "wx");
      writeFileSync(this.lockPath, `${process.pid}\n`, "utf8");
    } catch { throw new Error("FORWARD_RUNTIME_ALREADY_RUNNING"); }
  }

  close() { if (this.lockFd !== undefined) { closeSync(this.lockFd); this.lockFd = undefined; try { unlinkSync(this.lockPath); } catch { /* already removed */ } } }

  private tablePath(table: ForwardTable) { return join(this.root, `${table}.ndjson`); }
  append<T extends object>(table: ForwardTable, value: T, id = this.idOf(value)): boolean {
    if (id && this.has(table, id)) return false;
    appendFileSync(this.tablePath(table), `${JSON.stringify(value)}\n`, "utf8");
    return true;
  }
  has(table: ForwardTable, id: string): boolean { return this.readRaw(table).some((row) => this.idOf(row) === id); }
  all<T extends object>(table: ForwardTable): T[] { return this.readRaw(table) as T[]; }
  recent<T extends object>(table: ForwardTable, limit = 100): T[] { const safe = Math.max(1, Math.min(500, Math.floor(limit))); return this.all<T>(table).slice(-safe).reverse(); }
  latest<T extends object>(table: ForwardTable): T | undefined { return this.all<T>(table).at(-1); }
  replaceSnapshot<T>(name: string, value: T) {
    const path = join(this.root, name);
    const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(temp, JSON.stringify(value, null, 2), "utf8");
    renameSync(temp, path);
  }
  readSnapshot<T>(name: string): T | undefined { const path = join(this.root, name); return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as T : undefined; }
  verify(): { ok: boolean; tables: Record<string, number>; errors: string[] } {
    const tables: Record<string, number> = {}; const errors: string[] = [];
    for (const table of ["processed_bars", "market_bars", "predictions", "decisions", "paper_orders", "paper_fills", "paper_positions", "portfolio_snapshots", "pending_experiences", "resolved_experiences", "models", "training_runs", "evaluation_runs", "promotion_decisions", "events"] as ForwardTable[]) {
      try { tables[table] = this.all(table).length; } catch (error) { errors.push(`${table}:${error instanceof Error ? error.message : "INVALID_JSON"}`); }
    }
    return { ok: errors.length === 0, tables, errors };
  }
  private readRaw(table: ForwardTable): Record<string, unknown>[] {
    const path = this.tablePath(table); if (!existsSync(path)) return [];
    return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
  }
  private idOf(value: object): string | undefined {
    const record = value as Record<string, unknown>;
    for (const key of ["id", "barId", "predictionId", "decisionId", "orderId", "fillId", "experienceId", "modelVersion", "runId"]) if (typeof record[key] === "string") return record[key] as string;
    return undefined;
  }
}

export function boundedLimit(raw: string | null, fallback = 100): number {
  if (raw === null || raw === "") return fallback;
  const parsed = Number(raw); if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) throw new Error("LIMIT_MUST_BE_BETWEEN_1_AND_500");
  return parsed;
}

export function snapshotPath(root: string, name: string) { return join(root, name); }
export function ensureParent(path: string) { mkdirSync(dirname(path), { recursive: true }); }
