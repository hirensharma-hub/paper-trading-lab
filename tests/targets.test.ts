import test from "node:test";
import assert from "node:assert/strict";
import { resolvePrediction } from "../src/experience";
import { TradingCalendar } from "../src/calendar";
import { ExpectedBarClock } from "../src/bar-schedule";

test("prediction entry uses the first bar after decision time", () => {
  const bars = [{ symbol: "SPY", startMs: 0, intervalMs: 10, open: 10, high: 10, low: 10, close: 10, volume: 1 }, { symbol: "SPY", startMs: 20, intervalMs: 10, open: 20, high: 22, low: 19, close: 21, volume: 1 }, { symbol: "SPY", startMs: 40, intervalMs: 10, open: 30, high: 32, low: 29, close: 31, volume: 1 }];
  const result = resolvePrediction({ predictionId: "p", symbol: "SPY", featureTimestamp: 20, featureSetVersion: "fset", featureIds: ["x"], targetStateAtDecision: { status: "AVAILABLE", values: {}, featureVersions: [] }, rawProbability: 0.5, calibratedProbability: 0.5, decisionTimestamp: 30, targetVersion: "forward-close-1-v1", horizonBars: 1, probability: 0.5, decision: "HOLD", modelId: "m", modelVersion: "m", featureVersion: "f" }, bars, undefined, { barSchedule: new ExpectedBarClock(new TradingCalendar({ timeZone: "UTC", sessionOpenHour: 0, sessionOpenMinute: 0, sessionCloseHour: 23, sessionCloseMinute: 59 }), 10), calendarSpecVersion: "test-calendar-v1", calendarSpecHash: "test-hash" });
  assert.equal(result?.resolved.entryTimestamp, 40); assert.equal(result?.resolved.entryPrice, 30);
});
