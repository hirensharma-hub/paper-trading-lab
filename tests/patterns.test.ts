import test from "node:test";
import assert from "node:assert/strict";
import { detectPatterns } from "../src/patterns";

test("failed breakout requires current-bar excursion beyond the prior range", () => {
  const base = { ts: 1, symbol: "SPY", close: 99, currentHigh: 105, currentLow: 98, ret1: 0, ret5: 0, emaFast: 100, emaSlow: 100, emaFastDistance: 0, emaSlowDistance: 0, rsi14: 50, realisedVol20: 0.2, volumeZ: 0 };
  const structure = { symbol: "SPY", timestamp: 1, swingHighs: [], swingLows: [], rangeHigh: 100, rangeLow: 90, trend: "RANGE" as const };
  assert.equal(detectPatterns(base, structure).some((pattern) => pattern.type === "FAILED_BREAKOUT"), true);
});
