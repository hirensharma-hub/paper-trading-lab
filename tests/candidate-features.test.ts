import assert from "node:assert/strict";
import test from "node:test";
import { TradingCalendar } from "../src/calendar";
import { buildCandidateFeatures, buildCandidateFeaturesAt, causalAverageTrueRange, CANDIDATE_OHLCV_FEATURE_IDS } from "../src/candidate-features";
import type { Bar } from "../src/domain";

const calendar = new TradingCalendar();
const sessionBars = (day: string, base: number): Bar[] => {
  const bounds = calendar.sessionBounds(Date.parse(`${day}T12:00:00Z`));
  return Array.from({ length: 78 }, (_, index) => {
    const startMs = bounds.openMs + index * 300_000;
    const open = base + index * 0.02;
    return { symbol: "AMZN", startMs, intervalMs: 300_000, open, high: open + 0.15, low: open - 0.1, close: open + 0.05, volume: 1000 + index };
  });
};

const bars = [...sessionBars("2025-07-01", 100), ...sessionBars("2025-07-02", 102)];

test("candidate-ohlcv-v3 emits exactly the preregistered additive feature schema", () => {
    const values = buildCandidateFeaturesAt(bars, 100, calendar);
    assert.notEqual(values, null);
    assert.deepEqual(Object.keys(values!).filter((key) => CANDIDATE_OHLCV_FEATURE_IDS.includes(key as never)), [...CANDIDATE_OHLCV_FEATURE_IDS]);
    assert.ok(Math.abs(values!.closeLocation - ((102 + 22 * 0.02 + 0.05 - (102 + 22 * 0.02 - 0.1)) / 0.25)) < 1e-12);
    assert.ok(values!.sessionProgress >= 0);
    assert.ok(values!.sessionProgress <= 1);
});

test("candidate openingGapPct uses the previous complete session close", () => {
    const values = buildCandidateFeaturesAt(bars, 78, calendar)!;
    assert.ok(Math.abs(values.openingGapPct - (102 / 101.59 - 1)) < 1e-12);
});

test("candidate closeLocation is neutral for zero-range bars", () => {
    const modified = bars.slice();
    modified[100] = { ...modified[100]!, high: modified[100]!.close, low: modified[100]!.close };
    assert.equal(buildCandidateFeaturesAt(modified, 100, calendar)!.closeLocation, 0.5);
});

test("candidate features are unchanged when future bars are mutated", () => {
    const target = 100;
    const mutated = bars.map((bar, index) => index > target ? { ...bar, open: bar.open * 7, high: bar.high * 7, low: bar.low * 7, close: bar.close * 7, volume: bar.volume * 11 } : bar);
    assert.deepEqual(buildCandidateFeaturesAt(mutated, target, calendar), buildCandidateFeaturesAt(bars, target, calendar));
});

test("ret10 and ret20 use only past/current closes", () => {
    const target = 100;
    const values = buildCandidateFeaturesAt(bars, target, calendar)!;
    const current = bars[target]!.close;
    assert.ok(Math.abs(values.ret10 - (current / bars[target - 10]!.close - 1)) < 1e-12);
    assert.ok(Math.abs(values.ret20 - (current / bars[target - 20]!.close - 1)) < 1e-12);
});

test("current-bar range, body, ATR, and calendar progress use only eligible information", () => {
    const target = 100;
    const values = buildCandidateFeaturesAt(bars, target, calendar)!;
    const current = bars[target]!;
    assert.ok(Math.abs(values.barRangePct - (current.high - current.low) / current.close) < 1e-12);
    assert.ok(Math.abs(values.bodyPct - (current.close - current.open) / current.open) < 1e-12);
    assert.ok(values.atr14Pct > 0);
    const bounds = calendar.sessionBounds(current.startMs);
    assert.ok(Math.abs(values.sessionProgress - (current.startMs - bounds.openMs) / (bounds.closeMs - bounds.openMs)) < 1e-12);
    const futureMutated = bars.map((bar, index) => index > target ? { ...bar, high: bar.high * 9, low: bar.low / 9, close: bar.close * 9 } : bar);
    const changed = buildCandidateFeaturesAt(futureMutated, target, calendar)!;
    assert.equal(changed.atr14Pct, values.atr14Pct);
    assert.equal(changed.barRangePct, values.barRangePct);
    assert.equal(changed.bodyPct, values.bodyPct);
    assert.equal(changed.sessionProgress, values.sessionProgress);
});

test("causal ATR is finite after warm-up", () => {
    assert.equal(Number.isFinite(causalAverageTrueRange(bars.slice(0, 101))), true);
    assert.ok(Number.isNaN(causalAverageTrueRange(bars.slice(0, 14))));
});

test("first-session opening gap is unavailable rather than fabricated", () => {
    assert.equal(buildCandidateFeaturesAt(bars, 30, calendar), null);
});
