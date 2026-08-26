import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TargetRegistry } from "../src/targets";
import { TripleBarrierResolver } from "../src/experience";
import { FIRST_TARGET } from "../src/experiment";
import { V2D_TARGET } from "../src/v2d-target";
import { sessionPairedBootstrap } from "../src/v2d-stats";
import { verifyArtifactManifest } from "../src/serialization";

const bars = (mutate: (index: number, bar: { high: number; low: number }) => void = () => {}) => Array.from({ length: 25 }, (_, index) => {
  const bar = { symbol: "TEST", startMs: index * 10, intervalMs: 10, open: 100, high: 100, low: 100, close: 100, volume: 1 };
  mutate(index, bar);
  return bar;
});
const resolver = () => { const registry = new TargetRegistry(); registry.register(FIRST_TARGET); registry.register(V2D_TARGET); registry.registerResolver(new TripleBarrierResolver()); return registry.resolver("TRIPLE_BARRIER")!; };

test("V2D target is versioned, symmetric, next-open, and 20 eligible bars", () => {
  assert.notEqual(FIRST_TARGET.targetVersion, V2D_TARGET.targetVersion);
  assert.equal(V2D_TARGET.entryReferenceMethod, "NEXT_BAR_OPEN");
  assert.equal(V2D_TARGET.horizonBars, 20);
  assert.equal(V2D_TARGET.upperBarrierMultiple, V2D_TARGET.lowerBarrierMultiple);
  const result = resolver().resolve(V2D_TARGET, bars((index, bar) => { if (index === 6) bar.high = 102; }), 1, 2);
  assert.equal(result?.entryTimestamp, 10);
  assert.equal(result?.entryPrice, 100);
  assert.equal(result?.label, "UP");
  assert.equal(result?.plannedTargetEndTimestamp, 210);
});

test("V2D preserves timeout and ambiguity semantics and ignores later mutation", () => {
  const r = resolver();
  assert.equal(r.resolve(V2D_TARGET, bars(), 1, 2)?.label, "TIMEOUT");
  assert.equal(r.resolve(V2D_TARGET, bars((index, bar) => { if (index === 4) { bar.high = 102; bar.low = 98; } }), 1, 2)?.label, "AMBIGUOUS");
  const before = r.resolve(V2D_TARGET, bars(), 1, 2);
  const after = r.resolve(V2D_TARGET, bars((index, bar) => { if (index > 20) bar.high = 999; }), 1, 2);
  assert.deepEqual(after, before);
});

test("V1 and V2 do not mix and their geometry changes behavior", () => {
  const history = bars((index, bar) => { if (index === 6) bar.high = 102.5; });
  const r = resolver();
  assert.equal(r.resolve(FIRST_TARGET, history, 1, 2)?.label, "TIMEOUT");
  assert.equal(r.resolve(V2D_TARGET, history, 1, 2)?.label, "UP");
});

test("session bootstrap is deterministic and samples sessions, not rows", () => {
  const rows = [...Array.from({ length: 100 }, () => ({ session: "A", label: 1 as const, constantProbability: .5, logisticProbability: .9 })), { session: "B", label: 0 as const, constantProbability: .5, logisticProbability: .1 }];
  const one = sessionPairedBootstrap(rows, 200, 7), two = sessionPairedBootstrap(rows, 200, 7, "BRIER");
  assert.deepEqual(one, sessionPairedBootstrap(rows, 200, 7));
  assert.equal(one.unit, "SESSION");
  assert.equal(one.sessionCount, 2);
  assert.equal(two.metric, "BRIER");
});

test("V2D artifacts are complete, finite, verified, and holdout locked", () => {
  const root = "research/v2d";
  const manifest = JSON.parse(readFileSync(`${root}/artifact-manifest.json`, "utf8")) as { artifacts: { relativePath: string; sizeBytes: number; sha256: string }[] };
  const expected = ["candidate-v2d-spec.json", "target-definition-v2.json", "target-distribution.json", "temporal-fold-comparison.json", "trivial-baseline-comparison.json", "session-bootstrap.json", "calibration-diagnostics.json", "coefficient-stability.json", "ood-analogue-diagnostics.json", "ev-diagnostics.json", "decision-funnel.json", "candidate-v2d-decision.json", "holdout-lock-audit.json", "README.md"];
  assert.deepEqual(manifest.artifacts.map((item) => item.relativePath).sort(), expected.sort());
  assert.equal(verifyArtifactManifest(root, manifest).valid, true);
  const spec = JSON.parse(readFileSync(`${root}/candidate-v2d-spec.json`, "utf8"));
  assert.equal(spec.preregistrationStatus, "WRITTEN_BEFORE_V2D_TARGET_SCORING");
  assert.equal(spec.finalHoldoutStatus, "LOCKED");
  assert.deepEqual(spec.featureIds, ["ret1", "ret5", "emaFastDistance", "emaSlowDistance", "rsi14Normalized", "realisedVol20", "volumeZ"]);
  const audit = JSON.parse(readFileSync(`${root}/holdout-lock-audit.json`, "utf8"));
  for (const key of Object.keys(audit).filter((key) => key.startsWith("finalHoldout") && key !== "finalHoldoutStatus")) assert.equal(audit[key], 0, key);
});
