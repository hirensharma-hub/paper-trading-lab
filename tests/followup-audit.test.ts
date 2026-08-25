import test from "node:test";
import assert from "node:assert/strict";
import { calendarProvenanceMatches, exchangeCalendarSpec, TradingCalendar } from "../src/calendar";
import { LogisticRegression, PlattCalibrator } from "../src/ml";
import { approximatePeriodsPerYear, resampleEquityCurveWithQuality } from "../src/metrics";
import { ExpectedBarClock } from "../src/bar-schedule";
import { resolvePrediction, TripleBarrierResolver } from "../src/experience";
import { TargetRegistry } from "../src/targets";
import { assessEvidence, isReportAvailableAt, validateReportAvailability } from "../src/evidence";
import { PaperBroker } from "../src/broker";
import { DecisionEngine, resolveDecisionGatePolicy } from "../src/decision";
import { ExperimentRunner, testDecisionPopulation } from "../src/experiment";
import { IntegratedPaperResearchEngine } from "../src/integrated-engine";
import { IntelligenceEngine } from "../src/intelligence";
import { RiskManager } from "../src/risk";

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
  assert.throws(() => resolvePrediction(prediction, bars, registry), /TARGET_SCHEDULE_REQUIRED/);
  assert.ok((result?.resolved?.plannedTargetEndTimestamp ?? 0) > friday + 20 * 60_000, "planned horizon must use eligible trading bars");
});

test("early-close calendar is shared by session checks and bar scheduling", () => {
  const calendar = new TradingCalendar({ timeZone: "America/New_York", earlyCloses: { "2026-11-27": 13 * 60 } });
  const close = calendar.sessionBounds(Date.parse("2026-11-27T17:00:00Z"));
  assert.equal(new Date(close.closeMs).toISOString(), "2026-11-27T18:00:00.000Z");
  assert.equal(calendar.isRegularSession(close.closeMs - 60_000), true);
  assert.equal(calendar.isRegularSession(close.closeMs), false);
  const schedule = new ExpectedBarClock(calendar, 60_000);
  assert.equal(calendar.sessionKey(schedule.nextBarStart(close.closeMs - 60_000)), "2026-11-30");
});

test("calendar provenance rejects a frozen runtime that drops a manifest holiday", () => {
  const manifestCalendar = exchangeCalendarSpec({ timeZone: "America/New_York", holidays: ["2026-01-19"] });
  assert.equal(calendarProvenanceMatches({ calendarId: manifestCalendar.calendarId, calendarSpecVersion: manifestCalendar.version, calendarSpecHash: manifestCalendar.contentHash }, manifestCalendar.config), true);
  assert.equal(calendarProvenanceMatches({ calendarId: manifestCalendar.calendarId, calendarSpecVersion: manifestCalendar.version, calendarSpecHash: manifestCalendar.contentHash }, { timeZone: "America/New_York" }), false);
});

test("same-timestamp replay opening marks are primed for every symbol before pending risk", () => {
  const broker = new PaperBroker({ initialCash: 10_000, feeBps: 0, slippageBps: 0 });
  const engine = new IntegratedPaperResearchEngine(new IntelligenceEngine(), new DecisionEngine(), broker, new RiskManager({ maxPositionValue: 10_000, maxGrossExposure: 20_000, maxDailyLoss: 10_000, maxDrawdown: 10_000, maxOrdersPerMinute: 100, feeBps: 0 }), "test", "1", new TradingCalendar({ timeZone: "UTC", sessionOpenHour: 0, sessionOpenMinute: 0, sessionCloseHour: 23, sessionCloseMinute: 59 }));
  engine.primeOpeningMarks([
    { bar: bar(10, 50), quote: { symbol: "SPY", ts: 60_010, bid: 49, ask: 50, last: 50 } },
    { bar: { ...bar(10, 500), symbol: "QQQ" }, quote: { symbol: "QQQ", ts: 60_010, bid: 499, ask: 500, last: 500 } },
  ]);
  assert.deepEqual(engine.portfolioSnapshot(10).marks, { SPY: 50, QQQ: 500 });
});

test("new-session baseline is established from opening marks before the completed-bar close", () => {
  const broker = new PaperBroker({ initialCash: 10_000, feeBps: 0, slippageBps: 0 });
  broker.submit({ id: "overnight", symbol: "QQQ", side: "BUY", type: "MARKET", quantity: 10, strategyId: "test", strategyVersion: "1", reason: "seed", submittedAt: 1, status: "NEW", fills: [] });
  broker.onQuote({ symbol: "QQQ", ts: 2, bid: 500, ask: 500, last: 500 });
  const engine = new IntegratedPaperResearchEngine(new IntelligenceEngine(), new DecisionEngine(), broker, new RiskManager({ maxPositionValue: 10_000, maxGrossExposure: 20_000, maxDailyLoss: 1_000, maxDrawdown: 1_000, maxOrdersPerMinute: 100, feeBps: 0 }), "test", "1", new TradingCalendar({ timeZone: "UTC", sessionOpenHour: 0, sessionOpenMinute: 0, sessionCloseHour: 23, sessionCloseMinute: 59 }));
  engine.primeOpeningMarks([{ bar: { ...bar(86_400_000, 450), symbol: "QQQ" }, quote: { symbol: "QQQ", ts: 86_460_000, bid: 449, ask: 450, last: 450 } }]);
  const result = engine.onBar({ ...bar(86_400_000, 100), symbol: "SPY", close: 110, high: 110, low: 100 }, { symbol: "SPY", ts: 86_460_000, bid: 109, ask: 110, last: 110 });
  assert.equal(result.snapshot.timestamp, 86_460_000);
  assert.equal(engine.portfolioSnapshot(86_460_000).dayStartEquity, 9_500);
});

test("TEST population keeps excluded TIMEOUT and AMBIGUOUS rows for replay", () => {
  const observations = [
    { observationId: "up", split: "TEST" as const, modelLabel: 1 as const, rawTargetLabel: "UP" as const },
    { observationId: "down", split: "TEST" as const, modelLabel: 0 as const, rawTargetLabel: "DOWN" as const },
    { observationId: "timeout", split: "TEST" as const, rawTargetLabel: "TIMEOUT" as const },
    { observationId: "ambiguous", split: "TEST" as const, rawTargetLabel: "AMBIGUOUS" as const },
  ];
  const populations = testDecisionPopulation(observations, ["up", "down", "timeout", "ambiguous"]);
  assert.equal(populations.allTestDecisionCount, 4);
  assert.equal(populations.binaryEligibleTestDecisionCount, 2);
  assert.equal(populations.excludedTimeoutCount, 1);
  assert.equal(populations.excludedAmbiguousCount, 1);
  assert.equal(populations.matchesReplay, true);
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

test("training and calibration reject single-class binary samples", () => {
  const rows = [{ symbol: "SPY", decisionTimestamp: 1, features: [1], label: 1 as const, split: "TRAIN" as const }];
  assert.throws(() => new LogisticRegression().fit({ role: "TRAIN", rows }), /TRAIN_SINGLE_CLASS/);
  assert.throws(() => new PlattCalibrator().fit({ role: "CALIBRATION", rows: [{ ...rows[0], split: "CALIBRATION" as const }] }, [.8]), /CALIBRATION_SINGLE_CLASS/);
});

test("annualisation uses the configured frequency", () => {
  assert.equal(approximatePeriodsPerYear("1m"), 252 * 390);
  assert.equal(approximatePeriodsPerYear("5m"), 252 * 78);
  assert.equal(approximatePeriodsPerYear("15m"), 252 * 26);
  assert.equal(approximatePeriodsPerYear("1h"), 252 * 6.5);
  assert.equal(approximatePeriodsPerYear("1d"), 252);
});

test("hourly session resampling explicitly excludes the partial close bucket", () => {
  const calendar = new TradingCalendar();
  const bounds = calendar.sessionBounds(Date.parse("2026-01-12T15:00:00Z"));
  const points = Array.from({ length: 7 }, (_, index) => ({ ts: bounds.openMs + index * 60 * 60_000, value: 100 + index }));
  const sampled = resampleEquityCurveWithQuality(points, "1h", calendar, "REJECT_UNEXPECTED_GAP");
  assert.equal(sampled.quality.partialBucketPolicy, "EXCLUDE_PARTIAL_BUCKETS");
  assert.equal(sampled.quality.partialBucketCount, 1);
  assert.equal(sampled.points.length, 6);
  assert.equal(sampled.quality.complete, true);
});

test("runtime mode governance keeps paper deployment behind current OOS evidence", () => {
  const calibration = { reportId: "cal", status: "PASSED" as const, sampleSize: 100, modelId: "m", modelVersion: "1", experimentId: "e", generatedAt: 120, availableAtTimestamp: 120 };
  const input = { sampleSize: 100, decisionTimestamp: 130, context: { modelId: "m", modelVersion: "1", experimentId: "e", calibrationReport: calibration }, expectedProvenance: { modelId: "m", modelVersion: "1", experimentId: "e" } };
  assert.equal(assessEvidence({ ...input, required: { requireOutOfSample: true } }).gatesPassed, false);
  assert.equal(assessEvidence({ ...input, required: {} }).gatesPassed, true);
});

test("runtime gate policy permits untouched-test research evaluation without OOS while paper deployment blocks", () => {
  const snapshot = { symbol: "SPY", decisionTimestamp: 130, features: {}, targetState: { status: "AVAILABLE", values: {}, featureVersions: [] }, prediction: { predictionId: "p", modelId: "m", modelVersion: "1", featureSetVersion: "f", featureIds: [], targetVersion: "t", rawProbability: .9, calibratedProbability: .9, probability: .9, ood: { status: "IN_DISTRIBUTION", maxAbsZ: 0 } }, evidence: { quality: "WEAK", score: .35, gatesPassed: true, components: {}, provenance: {}, ruleVersion: "evidence-rules-v2" }, expectedValue: .1, expectedValueEstimate: { value: .1, unit: "RETURN", methodVersion: "t", referencePrice: 100, referenceMethod: "QUOTE_MID", grossExpectedValue: .2, executionCost: .1, netExpectedValue: .1 } } as any;
  const research = new DecisionEngine(resolveDecisionGatePolicy("RESEARCH_EVALUATION", undefined));
  const paper = new DecisionEngine(resolveDecisionGatePolicy("PAPER_DEPLOYMENT", undefined));
  assert.equal(research.decide({ analysis: snapshot }).action, "BUY");
  assert.deepEqual(research.decide({ analysis: snapshot }).reasonCodes, ["ENTRY_THRESHOLD_MET"]);
  assert.equal(paper.decide({ analysis: snapshot }).action, "NO_TRADE");
});

test("synthetic research-policy fixture uses the research gate without synthetic bypass", () => {
  const report = new ExperimentRunner().trustedPolicySyntheticSmoke();
  assert.equal(report.status, "COMPLETED");
  assert.equal(report.sourceDataKind, "SYNTHETIC_FIXTURE");
  assert.equal(report.config?.unsafeSyntheticBypassResearchGates, false);
  assert.equal(report.config?.decisionPolicy?.unsafeSyntheticBypassResearchGates, false);
  assert.ok((report.integratedReplay?.actionCounts?.BUY ?? 0) > 0);
  assert.equal(report.historicalReadiness?.checks.targetTradingBarHorizon, true);
  assert.equal(report.historicalReadiness?.checks.trainScalerIsolation, true);
  assert.equal(report.historicalReadiness?.checks.calibrationIsolation, true);
  assert.equal(report.historicalReadiness?.checks.sourceIsHistoricalMarketData, false);
  assert.equal(report.historicalReadiness?.checks.allTestDecisionPopulationMatchesReplay, true);
  assert.equal(report.historicalReadiness?.checks.settlementPolicyVersioned, true);
  assert.equal(report.historicalReadiness?.checks.intentLifecycleReconciles, true);
});

test("multi-symbol settlement uses each symbol's latest trusted quote", () => {
  const broker = new PaperBroker({ initialCash: 100_000, feeBps: 0, slippageBps: 0 });
  broker.submit({ id: "seed-spy", symbol: "SPY", side: "BUY", type: "MARKET", quantity: 10, strategyId: "test", strategyVersion: "1", reason: "seed", submittedAt: 1, status: "NEW", fills: [] });
  broker.onQuote({ symbol: "SPY", ts: 2, bid: 99, ask: 100, last: 100 });
  broker.submit({ id: "seed-qqq", symbol: "QQQ", side: "BUY", type: "MARKET", quantity: 10, strategyId: "test", strategyVersion: "1", reason: "seed", submittedAt: 3, status: "NEW", fills: [] });
  broker.onQuote({ symbol: "QQQ", ts: 4, bid: 499, ask: 500, last: 500 });
  const engine = new IntegratedPaperResearchEngine(new IntelligenceEngine(), new DecisionEngine(), broker, new RiskManager({ maxPositionValue: 10_000, maxGrossExposure: 20_000, maxDailyLoss: 10_000, maxDrawdown: 10_000, maxOrdersPerMinute: 100, feeBps: 0 }), "test", "1", new TradingCalendar({ timeZone: "UTC", sessionOpenHour: 0, sessionOpenMinute: 0, sessionCloseHour: 23, sessionCloseMinute: 59 }));
  engine.onBar({ symbol: "SPY", startMs: 10, intervalMs: 60_000, open: 100, high: 100, low: 100, close: 100, volume: 1 }, { symbol: "SPY", ts: 60_010, bid: 99, ask: 100, last: 100 });
  engine.onBar({ symbol: "QQQ", startMs: 10, intervalMs: 60_000, open: 500, high: 500, low: 500, close: 500, volume: 1 }, { symbol: "QQQ", ts: 60_010, bid: 499, ask: 500, last: 500 });
  engine.flattenAt({ symbol: "QQQ", startMs: 20, intervalMs: 60_000, open: 500, high: 500, low: 500, close: 500, volume: 1 }, { symbol: "QQQ", ts: 120_020, bid: 499, ask: 500, last: 500 });
  assert.deepEqual(broker.allFills.slice(-2).map((fill) => [broker.allOrders.find((order) => order.id === fill.orderId)?.symbol, fill.price]), [["SPY", 99], ["QQQ", 499]]);
  assert.equal(broker.openPositions.length, 0);
  assert.equal(broker.balance, 100_000 - 10 * 100 - 10 * 500 + 10 * 99 + 10 * 499);
});
