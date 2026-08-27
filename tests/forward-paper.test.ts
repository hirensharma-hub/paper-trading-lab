import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { loadForwardConfig } from "../src/forward-config";
import { ForwardPaperRuntime } from "../src/forward-runtime";
import type { Bar } from "../src/domain";

const make = (startMs: number, closeOffset = .1): Bar => ({ symbol: "AMZN", startMs, intervalMs: 300_000, open: 200, high: 200.2, low: 199.9, close: 200 + closeOffset, volume: 1_000_000 });
function runtime() { const root = mkdtempSync(join(tmpdir(), "forward-test-")); const start = Date.parse("2026-08-03T13:30:00Z"); const config = loadForwardConfig({ ...process.env, PAPER_RUNTIME_DATA_DIR: root, FORWARD_START_TIMESTAMP: new Date(start).toISOString() }); const value = new ForwardPaperRuntime(config); value.setMinimumAnalogueEvidence(0); return { value, root, start }; }

test("forward runtime fails closed and scopes the paper mode", () => {
  assert.throws(() => loadForwardConfig({ ...process.env, EXTERNAL_EXECUTION_ENABLED: "true" }), /FORWARD_RUNTIME_FORBIDDEN_CONFIGURATION/);
  const { value, root } = runtime(); try { const health = value.health(); assert.equal(health.runtimeMode, "FORWARD_PAPER"); assert.equal(health.paperOnly, true); assert.equal(value.verifyModel().algorithm, "logistic-regression"); } finally { value.close(); rmSync(root, { recursive: true, force: true }); }
});

test("completed bars are exactly once and incomplete bars do not mutate state", () => {
  const { value, root, start } = runtime(); try { const incomplete = value.processBar(make(start), start + 299_999); assert.equal(incomplete.status, "SKIPPED"); assert.equal(value.store.all("processed_bars").length, 0); const complete = value.processBar(make(start), start + 300_000); assert.equal(complete.status, "PROCESSED"); const duplicate = value.processBar(make(start), start + 600_000); assert.equal(duplicate.status, "DUPLICATE"); assert.equal(value.store.all("decisions").length, 1); } finally { value.close(); rmSync(root, { recursive: true, force: true }); }
});

test("closed sessions and locked holdout are fail-closed", () => {
  const { value, root, start } = runtime(); try { const weekend = value.processBar(make(Date.parse("2026-08-08T13:30:00Z")), Date.parse("2026-08-08T14:00:00Z")); assert.equal(weekend.status, "SKIPPED"); assert.equal(weekend.reason, "OUTSIDE_REGULAR_SESSION"); const holdout = value.processBar(make(Date.parse("2026-04-16T13:30:00Z")), Date.parse("2026-04-16T14:00:00Z")); assert.equal(holdout.status, "SKIPPED"); assert.equal(holdout.reason, "BEFORE_FORWARD_START"); void start; } finally { value.close(); rmSync(root, { recursive: true, force: true }); }
});

test("paper broker, pending experience, and restart state recover", () => {
  const { value, root, start } = runtime(); try { for (let i = 0; i < 23; i++) value.processBar({ ...make(start + i * 300_000, .1 + i * .01), open: 200 + i * .1, high: 200.3 + i * .1, low: 199.9 + i * .1, close: 200.1 + i * .1 }, start + (i + 1) * 300_000); assert.ok(value.store.all("predictions").length > 0); assert.ok(value.store.all("resolved_experiences").length > 0); const persistedOrders = value.store.all("paper_orders").length; value.close(); const config = loadForwardConfig({ ...process.env, PAPER_RUNTIME_DATA_DIR: root, FORWARD_START_TIMESTAMP: new Date(start).toISOString() }); const recovered = new ForwardPaperRuntime(config); try { assert.equal(recovered.store.all("paper_orders").length, persistedOrders); assert.equal(recovered.processBar({ ...make(start + 22 * 300_000, .1), open: 202.2, high: 202.4, low: 202.1, close: 202.3 }, start + 24 * 300_000).status, "DUPLICATE"); assert.equal(recovered.learningStatus().holdoutLearningRows, 0); } finally { recovered.close(); } } finally { rmSync(root, { recursive: true, force: true }); }
});
