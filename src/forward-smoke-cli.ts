import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ForwardPaperRuntime } from "./forward-runtime";
import { loadForwardConfig } from "./forward-config";
import type { Bar } from "./domain";

const root = mkdtempSync(join(tmpdir(), "paper-forward-smoke-"));
const start = Date.parse("2026-08-03T13:30:00Z");
const env = { ...process.env, PAPER_RUNTIME_DATA_DIR: root, FORWARD_START_TIMESTAMP: new Date(start).toISOString(), MIN_NEW_BINARY_EXPERIENCES_FOR_TRAINING: "390" };
const config = loadForwardConfig(env); const buildBar = (index: number): Bar => { const open = 200 + index * .25; const close = open + .15; return { symbol: "AMZN", startMs: start + index * 300_000, intervalMs: 300_000, open, high: close + .08, low: open - .05, close, volume: 1_000_000 + index * 1000 }; };
let runtime = new ForwardPaperRuntime(config); runtime.setMinimumAnalogueEvidence(0); const results = []; for (let index = 0; index < 26; index++) results.push(runtime.processBar(buildBar(index), start + (index + 1) * 300_000)); const processed = results.filter((r) => r.status === "PROCESSED"); const predictions = runtime.store.all("predictions").length; const orders = runtime.store.all("paper_orders").length; const resolved = runtime.store.all("resolved_experiences").length; if (processed.length !== 26 || predictions < 1 || orders < 1 || resolved < 1) throw new Error(`FORWARD_SMOKE_ASSERTION_FAILED:${JSON.stringify({ processed: processed.length, predictions, orders, resolved })}`); runtime.close();
runtime = new ForwardPaperRuntime(config); runtime.setMinimumAnalogueEvidence(0); const duplicate = runtime.processBar(buildBar(25), start + 27 * 300_000); if (duplicate.status !== "DUPLICATE") throw new Error("FORWARD_SMOKE_DUPLICATE_ASSERTION_FAILED"); const verify = runtime.verifyDatabase(); if (!verify.ok) throw new Error("FORWARD_SMOKE_DATABASE_ASSERTION_FAILED"); console.log(JSON.stringify({ mode: "FORWARD_PAPER", session: "OPEN", completedBars: processed.length, predictions, paperOrders: orders, resolvedExperiences: resolved, duplicateStatus: duplicate.status, restartRecoveredPositions: runtime.broker.openPositions.length, lockedHoldoutLearningRows: runtime.learningStatus().holdoutLearningRows }, null, 2)); runtime.close(); rmSync(root, { recursive: true, force: true });
