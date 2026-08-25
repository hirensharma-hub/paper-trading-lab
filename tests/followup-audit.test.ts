import test from "node:test";
import assert from "node:assert/strict";
import { TradingCalendar } from "../src/calendar";
import { ExpectedBarClock } from "../src/bar-schedule";
import { resolvePrediction, TripleBarrierResolver } from "../src/experience";
import { TargetRegistry } from "../src/targets";
import { assessEvidence, isReportAvailableAt, validateReportAvailability } from "../src/evidence";
import { PaperBroker } from "../src/broker";

const bar = (startMs: number, open = 100) => ({ symbol: "SPY", startMs, intervalMs: 60_000, open, high: open + .1, low: open - .1, close: open, volume: 1 });

test("incremental target resolution uses an eligible-bar schedule across sessions", () => {
  const calendar = new TradingCalendar();
  const friday = calendar.sessionBounds(Date.parse("2026-01-16T20:55:00Z")).openMs + 385 * 60_000;
  const schedule = new ExpectedBarClock(calendar, 60_000);
  const bars = Array.from({ length: 3 }, (_, i) => bar(i === 0 ? friday : schedule.nextBarStart(i === 1 ? friday : schedule.nextBarStart(friday))));
  bars[1]!.high = 102;
  const prediction = { predictionId: "p", symbol: "SPY", featureTimestamp: friday, decisionTimestamp: friday, targetVersion: "triple", entryReferenceMethod: "NEXT_BAR_OPEN" as const, modelId: "m", modelVersion: "1", featureSetVersion: "f", featureIds: [], featureVersion: "f", rawProbability: .7, calibratedProbability: .7, probability: .7, targetStateAtDecision: { status: "AVAILABLE" as const, values: { atrAtDecision: 1 }, featureVersions: [] }, decision: "BUY" as const };
  const registry = new TargetRegistry();
  registry.register({ targetVersion: "triple", kind: "TRIPLE_BARRIER", horizonBars: 20, timeBasis: "TRADING_BARS", upperBarrierMultiple: 1, lowerBarrierMultiple: 1, ambiguityPolicy: "AMBIGUOUS" });
  registry.registerResolver(new TripleBarrierResolver());
  const result = resolvePrediction(prediction, bars, registry, { barSchedule: schedule, calendarSpecVersion: "v1" });
  assert.ok(result?.resolved);
  assert.ok((result?.resolved?.plannedTargetEndTimestamp ?? 0) > friday + 20 * 60_000, "planned horizon must use eligible trading bars");
});

test("trusted evidence rejects missing and malformed timestamps", () => {
  const report = { reportId: "r", status: "PASSED" as const, sampleSize: 30, modelId: "m", modelVersion: "1", experimentId: "e" };
  assert.equal(isReportAvailableAt(report, 100), false);
  assert.throws(() => validateReportAvailability(report, 100), /TEMPORAL_PROVENANCE_MISSING/);
  assert.equal(assessEvidence({ sampleSize: 100, context: { modelId: "m", modelVersion: "1", experimentId: "e", calibrationReport: report }, expectedProvenance: { modelId: "m", modelVersion: "1", experimentId: "e" } }).components.calibrated, "NOT_TESTED");
});

test("broker affordability uses side-specific entry fees", () => {
  const broker = new PaperBroker({ initialCash: 100, feeBps: 0, slippageBps: 0, entryFeeBps: 1_000, exitFeeBps: 0 });
  broker.submit({ id: "b", symbol: "SPY", side: "BUY", type: "MARKET", quantity: 1, strategyId: "t", strategyVersion: "1", reason: "test", submittedAt: 1, status: "NEW", fills: [] });
  assert.equal(broker.onQuote({ symbol: "SPY", ts: 2, bid: 100, ask: 100 }).length, 0);
});

test("runtime mode governance keeps paper deployment behind current OOS evidence", () => {
  const calibration = { reportId: "cal", status: "PASSED" as const, sampleSize: 100, modelId: "m", modelVersion: "1", experimentId: "e", generatedAt: 120, availableAtTimestamp: 120 };
  const input = { sampleSize: 100, decisionTimestamp: 130, context: { modelId: "m", modelVersion: "1", experimentId: "e", calibrationReport: calibration }, expectedProvenance: { modelId: "m", modelVersion: "1", experimentId: "e" } };
  assert.equal(assessEvidence({ ...input, required: { requireOutOfSample: true } }).gatesPassed, false);
  assert.equal(assessEvidence({ ...input, required: {} }).gatesPassed, true);
});
