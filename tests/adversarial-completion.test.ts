import test from "node:test";
import assert from "node:assert/strict";
import { canonicalDatasetHash, parseTimestampStrict } from "../src/data";
import { buildFeatures } from "../src/features";
import { IntegratedPaperResearchEngine, replayIntegrated } from "../src/integrated-engine";
import { DecisionEngine } from "../src/decision";
import { PaperBroker } from "../src/broker";
import { RiskManager } from "../src/risk";
import { TargetRegistry } from "../src/targets";
import { TradingCalendar } from "../src/calendar";
import { ExperimentRunner } from "../src/experiment";

const bar = (symbol: string, startMs: number, open: number, close: number) => ({ symbol, startMs, intervalMs: 60_000, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 100 });
const quote = (b: ReturnType<typeof bar>) => ({ symbol: b.symbol, ts: b.startMs + b.intervalMs, bid: b.close - 0.01, ask: b.close + 0.01, last: b.close });

test("canonical dataset hash is order invariant but value sensitive", () => {
  const rows = [bar("AAA", 0, 50, 51), bar("BBB", 0, 500, 501)];
  assert.equal(canonicalDatasetHash(rows), canonicalDatasetHash([...rows].reverse()));
  assert.notEqual(canonicalDatasetHash(rows), canonicalDatasetHash([{ ...rows[0], close: 52 }, rows[1]]));
  assert.notEqual(canonicalDatasetHash(rows), canonicalDatasetHash([{ ...rows[0], volume: 101 }, rows[1]]));
  assert.notEqual(canonicalDatasetHash(rows), canonicalDatasetHash([{ ...rows[0], startMs: 60_000 }, rows[1]]));
  assert.notEqual(canonicalDatasetHash(rows), canonicalDatasetHash([{ ...rows[0], symbol: "CCC" }, rows[1]]));
});

test("strict timestamps reject timezone-less input", () => {
  assert.equal(parseTimestampStrict("2026-01-05T14:30:00.000Z"), Date.parse("2026-01-05T14:30:00.000Z"));
  assert.equal(parseTimestampStrict("2026-01-05T09:30:00-05:00"), Date.parse("2026-01-05T14:30:00.000Z"));
  assert.throws(() => parseTimestampStrict("2026-01-05 09:30:00"), /TIMESTAMP_FORMAT_REJECTED/);
});

test("realisedVol20 is unavailable at 20 bars and uses 20 returns at 21 bars", () => {
  const rows = Array.from({ length: 21 }, (_, i) => bar("AAA", i * 60_000, 100, 100));
  assert.equal(buildFeatures(rows.slice(0, 20)), null);
  const features = buildFeatures(rows);
  assert.ok(features);
  const returns = rows.slice(1).map((row, i) => Math.log(row.close / rows[i]!.close));
  assert.equal(returns.length, 20);
  assert.equal(features!.realisedVol20, 0);
});

function runPermutation(events: readonly { bar: ReturnType<typeof bar>; quote: ReturnType<typeof quote> }[], replayOptions: Parameters<typeof replayIntegrated>[2] = { decisionWindowStart: 0, decisionWindowEnd: 120_000, outcomeDataEnd: 180_000, closeAtEnd: true }) {
  const targetRegistry = new TargetRegistry();
  targetRegistry.register({ targetVersion: "test-v1", kind: "TRIPLE_BARRIER", horizonBars: 3, upperBarrierMultiple: 1, lowerBarrierMultiple: 1, ambiguityPolicy: "AMBIGUOUS" });
  const fakeIntelligence = { analyze: (b: ReturnType<typeof bar>) => ({ symbol: b.symbol, barCloseTimestamp: b.startMs + b.intervalMs, decisionTimestamp: b.startMs + b.intervalMs, timestamp: b.startMs + b.intervalMs, features: { ts: b.startMs + b.intervalMs, symbol: b.symbol, close: b.close, currentHigh: b.high, currentLow: b.low, ret1: 0, ret5: 0, emaFast: b.close, emaSlow: b.close, emaFastDistance: 0, emaSlowDistance: 0, rsi14: 50, realisedVol20: 0, volumeZ: 0 }, structure: null, regime: null, patterns: [], targetState: { status: "AVAILABLE", values: { atrAtDecision: 1 }, featureVersions: ["atr14-v1"] }, prediction: { predictionId: `p-${b.symbol}-${b.startMs}`, modelId: "test-model", modelVersion: "1", featureSetVersion: "baseline-ohlcv-v2", featureIds: ["ret1"], rawProbability: 1, calibratedProbability: 1, probability: 1, ood: { status: "IN_DISTRIBUTION", maxAbsZ: 0 } }, analogues: { sampleSize: 1, evidence: "SUFFICIENT", distances: [], targetVersion: "test-v1", targetKind: "TRIPLE_BARRIER", regimeCounts: {}, barrier: { upRate: 1, downRate: 0, timeoutRate: 0, ambiguousRate: 0 } }, evidence: { quality: "VERY_STRONG" }, expectedValue: 1, expectedValueEstimate: { value: 1, unit: "RETURN", methodVersion: "test", referencePrice: b.close, referenceMethod: "BAR_CLOSE", grossExpectedValue: 1, executionCost: 0, netExpectedValue: 1 }, dataQuality: { ok: true, issues: [] } }) } as any;
  const calendar = new TradingCalendar({ timeZone: "UTC", sessionOpenHour: 0, sessionOpenMinute: 0, sessionCloseHour: 23, sessionCloseMinute: 59 });
  const engine = new IntegratedPaperResearchEngine(fakeIntelligence, new DecisionEngine({ minimumEvidence: "WEAK", entryProbability: 0 }), new PaperBroker({ initialCash: 100_000, feeBps: 0, slippageBps: 0 }), new RiskManager({ maxPositionValue: 20_000, maxGrossExposure: 20_000, maxDailyLoss: 100_000, maxDrawdown: 100_000, maxOrdersPerMinute: 100, feeBps: 0, slippageBps: 0 }), "test", "1", calendar, undefined, undefined, undefined, targetRegistry, { version: "test", entryMethod: "NEXT_BAR_OPEN", exitMethod: "NEXT_BAR_OPEN" });
  return replayIntegrated(events, engine, replayOptions);
}

test("same-timestamp replay is permutation invariant and emits one portfolio point", () => {
  const first = [bar("AAA", 0, 50, 51), bar("BBB", 0, 500, 501), bar("AAA", 60_000, 50, 1_000), bar("BBB", 60_000, 500, 499), bar("AAA", 120_000, 51, 52), bar("BBB", 120_000, 499, 498)].map((b) => ({ bar: b, quote: quote(b) }));
  const second = [first[1]!, first[0]!, first[3]!, first[2]!, first[5]!, first[4]!];
  const left = runPermutation(first); const right = runPermutation(second);
  assert.deepEqual(left.orders, right.orders);
  assert.deepEqual(left.fills, right.fills);
  assert.deepEqual(left.trades, right.trades);
  assert.deepEqual(left.actionCounts, right.actionCounts);
  assert.equal(left.portfolioSnapshotCount, left.uniquePortfolioTimestampCount);
  assert.equal(right.portfolioSnapshotCount, right.uniquePortfolioTimestampCount);
  assert.deepEqual(left.portfolioSnapshots?.map((snapshot) => snapshot.ts), right.portfolioSnapshots?.map((snapshot) => snapshot.ts));
  assert.equal(left.timestampBatchPolicyVersion, "atomic-open-execution-close-decision-v1");
  assert.equal(left.settlementAudits?.length, left.settlementResult?.forcedFlattenCount);
  assert.equal(left.settlementMissingQuoteSymbols?.length, 0);
});

test("pending next-open intents expire at the outcome boundary", () => {
  const event = { bar: bar("AAA", 0, 50, 51), quote: quote(bar("AAA", 0, 50, 51)) };
  const result = runPermutation([event], { decisionWindowStart: 0, decisionWindowEnd: 60_000, outcomeDataEnd: 60_000 });
  assert.equal(result.intentExpiredCount, 1);
  assert.equal(result.currentPendingCount, 0);
  assert.equal(result.intentLifecycleExact, true);
});

test("candidate benchmark reports actual replay trades and costs", () => {
  const report = new ExperimentRunner().syntheticSmoke("benchmark-evidence-test");
  assert.ok(report.integratedReplay);
  assert.ok(report.benchmarks);
  assert.equal(report.benchmarks!.logisticCandidate.endingEquity, report.integratedReplay!.decisionWindowEndEquity);
  assert.equal(report.benchmarks!.logisticCandidate.orderCount, report.integratedReplay!.orderCount);
  assert.equal(report.benchmarks!.logisticCandidate.tradeCount, report.integratedReplay!.decisionWindowResult?.metrics.tradeCount);
  assert.ok(report.benchmarks!.logisticCandidate.feesPaid > 0);
  assert.ok(report.benchmarks!.logisticCandidate.estimatedSlippage > 0);
});
