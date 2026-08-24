import test from "node:test";
import assert from "node:assert/strict";
import { ema, rsi, buildFeatures } from "../src/features";
import { appendBar, validateQuote } from "../src/data";
import { PaperBroker } from "../src/broker";
import { RiskManager } from "../src/risk";
import { maximumDrawdown, performanceMetrics } from "../src/metrics";
import { chronologicalSplit, forwardReturnTarget, purgedChronologicalSplit, assertNoLookahead } from "../src/research";
import { EmaCrossStrategy } from "../src/strategy";
import { ResearchEngine } from "../src/engine";
import { ConfiguredHolidayProvider, TradingCalendar } from "../src/calendar";
import { parseCsvBars } from "../src/market-data";
import { detectMarketStructure } from "../src/structure";
import { classifyRegime } from "../src/regime";
import { detectPatterns } from "../src/patterns";
import { InMemoryEventRepository, InMemoryExperimentRepository } from "../src/research-ledger";
import { replay } from "../src/backtest";
import { generateWalkForwardSplits, tripleBarrierTarget } from "../src/research";
import { correlation, expectedValue, mean, quantile, standardDeviation } from "../src/statistics";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonExperimentRepository, JsonlEventRepository, JsonlTradeRepository } from "../src/persistence";
import { LocalPaperEngineService } from "../src/local-service";
import { IntegratedPaperResearchEngine, replayIntegrated } from "../src/integrated-engine";
import { featureRegistry, getFeatureMetadata } from "../src/feature-registry";
import { conditionalTradeStatistics } from "../src/conditional";
import { StandardScaler, LogisticRegression, prepareDataset, classificationMetrics, calibrationBins, fitOodProfile, assessOod } from "../src/ml";
import { nearestAnalogues } from "../src/analogues";
import { assessEvidence } from "../src/evidence";
import { TradeLedger } from "../src/trades";
import { IntelligenceEngine, type MarketAnalysisSnapshot } from "../src/intelligence";
import { resolvePrediction } from "../src/experience";
import { ModelRegistry } from "../src/model-registry";
import { PredictionQueue } from "../src/experience";
import { PredictiveModelBundle, type ModelArtifact } from "../src/ml";
import { namedFeatures } from "../src/feature-schema";
import { DecisionEngine } from "../src/decision";
import { TargetRegistry } from "../src/targets";
import { JsonlExperienceRepository, JsonModelArtifactRepository, JsonPredictionQueueRepository } from "../src/persistence";
import { ExitPolicy } from "../src/exit-policy";

const bar = (symbol: string, i: number, close = 100 + i) => ({ symbol, startMs: i * 60_000, intervalMs: 60_000, open: close, high: close + 1, low: close - 1, close, volume: 100 + i });
const predictionState = { featureTimestamp: 1, modelId: "m", featureSetVersion: "fset", featureIds: ["x"], rawProbability: 0.5, calibratedProbability: 0.5, targetStateAtDecision: { status: "AVAILABLE" as const, values: {}, featureVersions: [] } };
const triplePredictionState = { ...predictionState, targetStateAtDecision: { status: "AVAILABLE" as const, values: { atrAtDecision: 1 }, featureVersions: ["atr14-v1"] } };
const order = (id: string, side: "BUY" | "SELL" = "BUY", quantity = 10, limitPrice?: number) => ({ id, symbol: "SPY", side, type: limitPrice === undefined ? "MARKET" as const : "LIMIT" as const, quantity, limitPrice, status: "NEW" as const, strategyId: "test", strategyVersion: "1", reason: "unit test", fills: [] });

class FixedDecisionEngine extends DecisionEngine {
  constructor(private readonly fixedAction: "BUY" | "SELL" | "HOLD" | "NO_TRADE") { super(); }
  override decide(snapshot: MarketAnalysisSnapshot) { return { action: this.fixedAction, symbol: snapshot.symbol, timestamp: snapshot.timestamp, allowed: true, reason: "test action" }; }
}

class FixedIntelligenceEngine extends IntelligenceEngine {
  constructor(private readonly fixedSnapshot: MarketAnalysisSnapshot) { super(); }
  override analyze() { return this.fixedSnapshot; }
}

class SequenceDecisionEngine extends DecisionEngine {
  private index = 0;
  constructor(private readonly actions: readonly ("BUY" | "SELL" | "HOLD" | "NO_TRADE")[]) { super(); }
  override decide(snapshot: MarketAnalysisSnapshot) { const action = this.actions[Math.min(this.index++, this.actions.length - 1)] ?? "NO_TRADE"; return { action, symbol: snapshot.symbol, timestamp: snapshot.timestamp, allowed: true, reason: "sequence" }; }
}

test("indicator calculations use known values and warm up", () => {
  assert.equal(ema([1, 2, 3, 4], 2), 3.5);
  assert.equal(rsi(Array.from({ length: 16 }, (_, i) => i + 1)), 100);
  assert.equal(buildFeatures([bar("SPY", 0)]), null);
  assert.throws(() => buildFeatures([bar("SPY", 0), bar("QQQ", 1)]));
});

test("data validation rejects crossed quotes and mixed/non-monotonic bars", () => {
  assert.throws(() => validateQuote({ symbol: "SPY", ts: 1, bid: 101, ask: 100 }));
  const first = [bar("SPY", 0)];
  assert.throws(() => appendBar(first, bar("SPY", 0)));
  assert.throws(() => appendBar(first, bar("QQQ", 1)));
});

test("broker respects cash, quote size, duplicate timestamps and limit prices", () => {
  const broker = new PaperBroker({ initialCash: 100, feeBps: 0, slippageBps: 0 });
  broker.submit(order("buy", "BUY", 10));
  const quote = { symbol: "SPY", ts: 1, bid: 9.9, ask: 10, askSize: 3, bidSize: 3 };
  assert.equal(broker.onQuote(quote).at(0)?.quantity, 3);
  assert.equal(broker.onQuote(quote).length, 0);
  assert.equal(broker.onQuote({ ...quote, ts: 2, askSize: 20 }).at(0)?.quantity, 7);
  assert.equal(broker.balance, 0);
  const limitBroker = new PaperBroker({ initialCash: 1000, feeBps: 0, slippageBps: 1000 });
  limitBroker.submit(order("limit", "BUY", 1, 10));
  const fill = limitBroker.onQuote({ symbol: "SPY", ts: 1, bid: 9, ask: 9.5 });
  assert.equal(fill[0].price, 9.5);
  assert.equal(limitBroker.openPositions[0].averagePrice, 9.5);
});

test("risk manager enforces kill switch, losses, exposure and allows a close", () => {
  const risk = new RiskManager({ maxPositionValue: 100, maxGrossExposure: 100, maxDailyLoss: 10, maxDrawdown: 20, maxOrdersPerMinute: 2, feeBps: 0 });
  const base = { equity: 100, dayStartEquity: 100, highWaterMark: 100, openPositions: [], ordersInLastMinute: 0, killSwitch: false, marks: {} };
  const intent = { ...order("x"), submittedAt: 1 };
  assert.deepEqual(risk.size(intent, 10, base), { allowed: true, quantity: 10 });
  assert.equal(risk.size(intent, 10, { ...base, equity: 89 }).allowed, false);
  assert.equal(risk.size(intent, 10, { ...base, killSwitch: true }).allowed, false);
  assert.equal(risk.size({ ...intent, side: "SELL" }, 10, { ...base, openPositions: [{ symbol: "SPY", quantity: 10, averagePrice: 10, realisedPnl: 0, entryFees: 0 }] }).allowed, true);
});

test("metrics and leakage-safe targets use chronological data", () => {
  assert.equal(maximumDrawdown([100, 110, 99]), 0.1);
  const metrics = performanceMetrics([100, 110, 99], [10, -11]);
  assert.ok(Math.abs(metrics.totalReturn + 0.01) < 1e-12);
  assert.equal(metrics.tradeCount, 2);
  const bars = [bar("SPY", 0, 100), bar("SPY", 1, 101), bar("SPY", 2, 110)];
  const target = forwardReturnTarget(bars, 0, 2, 0.02)!;
  assert.equal(target.decisionTimestamp, 60_000);
  assert.equal(target.label, "LONG");
  const split = chronologicalSplit(10);
  assert.deepEqual(split.train.at(-1), 5);
  assert.deepEqual(split.test.at(0), 8);
  const purged = purgedChronologicalSplit(20, 3);
  assert.ok(!purged.train.some((i) => i + 3 >= (purged.validation[0] ?? 20)));
  assert.ok(!purged.validation.some((i) => i + 3 >= (purged.test[0] ?? 20)));
  assert.doesNotThrow(() => assertNoLookahead(60_000, target));
  assert.throws(() => assertNoLookahead(0, target));
});

test("risk uses the mark for each symbol rather than one current price", () => {
  const risk = new RiskManager({ maxPositionValue: 20_000, maxGrossExposure: 9_000, maxDailyLoss: 1_000, maxDrawdown: 1_000, maxOrdersPerMinute: 10, feeBps: 0 });
  const state = { equity: 20_000, dayStartEquity: 20_000, highWaterMark: 20_000, openPositions: [{ symbol: "SPY", quantity: 10, averagePrice: 500, realisedPnl: 0, entryFees: 0 }, { symbol: "AAPL", quantity: 20, averagePrice: 200, realisedPnl: 0, entryFees: 0 }], ordersInLastMinute: 0, killSwitch: false, marks: { SPY: 500, AAPL: 200 } };
  const result = risk.size({ ...order("risk"), quantity: 1, submittedAt: 1 }, 200, state);
  assert.equal(result.allowed, false);
  if (!result.allowed) assert.match(result.reason, /Exposure/);
});

test("broker enforces long-only selling and reconciles round-trip fees", () => {
  const broker = new PaperBroker({ initialCash: 1_000, feeBps: 10, slippageBps: 0 });
  broker.submit(order("sell-first", "SELL", 1));
  assert.equal(broker.onQuote({ symbol: "SPY", ts: 1, bid: 100, ask: 101 }).length, 0);
  assert.equal(broker.allOrders[0].status, "REJECTED");
  broker.submit(order("buy", "BUY", 5));
  broker.onQuote({ symbol: "SPY", ts: 2, bid: 99, ask: 100 });
  broker.submit(order("sell", "SELL", 5));
  broker.onQuote({ symbol: "SPY", ts: 3, bid: 110, ask: 111 });
  assert.equal(broker.openPositions.length, 0);
  assert.ok(Math.abs(broker.feesPaid - 1.05) < 1e-9);
  assert.ok(Math.abs(broker.balance - 1_048.95) < 1e-9);
});

test("broker affordability includes extreme market slippage and risk caps final symbol value", () => {
  const broker = new PaperBroker({ initialCash: 1_000, feeBps: 10, slippageBps: 2_000 });
  broker.submit(order("slipped-buy", "BUY", 20));
  broker.onQuote({ symbol: "SPY", ts: 1, bid: 99, ask: 100 });
  assert.equal(broker.openPositions[0].quantity, 8);
  assert.ok(broker.balance >= 0);
  const risk = new RiskManager({ maxPositionValue: 10_000, maxGrossExposure: 50_000, maxDailyLoss: 1_000, maxDrawdown: 1_000, maxOrdersPerMinute: 10, feeBps: 0 });
  const existing = { symbol: "SPY", quantity: 90, averagePrice: 100, realisedPnl: 0, entryFees: 0 };
  const buy = risk.size({ ...order("cap"), quantity: 20, submittedAt: 1 }, 100, { equity: 50_000, dayStartEquity: 50_000, highWaterMark: 50_000, openPositions: [existing], ordersInLastMinute: 0, killSwitch: false, marks: { SPY: 100 } });
  assert.deepEqual(buy, { allowed: true, quantity: 10 });
  const close = risk.size({ ...order("close", "SELL", 90), submittedAt: 1 }, 100, { equity: 50_000, dayStartEquity: 50_000, highWaterMark: 50_000, openPositions: [{ ...existing, quantity: 120 }], ordersInLastMinute: 0, killSwitch: false, marks: { SPY: 100 } });
  assert.deepEqual(close, { allowed: true, quantity: 90 });
});

test("engine keeps independent symbol histories and per-symbol marks", () => {
  const broker = new PaperBroker({ initialCash: 10_000, feeBps: 0, slippageBps: 0 });
  const engine = new ResearchEngine(new EmaCrossStrategy(), broker, new RiskManager({ maxPositionValue: 1_000, maxGrossExposure: 2_000, maxDailyLoss: 1_000, maxDrawdown: 1_000, maxOrdersPerMinute: 10, feeBps: 0 }));
  for (let i = 0; i < 20; i++) {
    engine.onBar(bar("SPY", i), { symbol: "SPY", ts: (i + 1) * 60_000, bid: 100 + i, ask: 100.1 + i, last: 100.05 + i });
    engine.onBar(bar("QQQ", i, 200 + i), { symbol: "QQQ", ts: (i + 1) * 60_000, bid: 200 + i, ask: 200.1 + i, last: 200.05 + i });
  }
  assert.deepEqual(engine.health.symbols.sort(), ["QQQ", "SPY"]);
  assert.equal(engine.health.bars, 40);
  assert.equal(engine.portfolioSnapshot(1).marks.SPY, 119.05);
  assert.equal(engine.portfolioSnapshot(1).marks.QQQ, 219.05);
});

test("session calendar handles regular hours and CSV quality reporting", () => {
  const calendar = new TradingCalendar();
  assert.equal(calendar.isRegularSession(Date.parse("2026-01-05T14:30:00Z")), true);
  assert.equal(calendar.isRegularSession(Date.parse("2026-01-05T21:00:00Z")), false);
  assert.equal(calendar.isRegularSession(Date.parse("2026-01-10T15:00:00Z")), false);
  const csv = "symbol,timestamp,open,high,low,close,volume\nSPY,2026-01-05T14:30:00Z,100,101,99,100.5,1000\nSPY,2026-01-05T14:30:00Z,100,101,99,100.5,1000\nSPY,2026-01-05T14:31:00Z,100,99,98,98.5,1000";
  const parsed = parseCsvBars(csv);
  assert.equal(parsed.report.acceptedRows, 1);
  assert.equal(parsed.report.duplicates, 1);
  assert.equal(parsed.report.rejectedRows, 2);
});

test("calendar holiday/early-close provider and research modules are deterministic", () => {
  const holidays = new ConfiguredHolidayProvider(["2026-07-03"], { "2026-11-27": 13 * 60 });
  const calendar = new TradingCalendar({}, holidays);
  assert.equal(calendar.isTradingDay(Date.parse("2026-07-03T15:00:00Z")), false);
  assert.equal(calendar.sessionClose(Date.parse("2026-11-27T15:00:00Z")), 780);
  const bars = Array.from({ length: 25 }, (_, i) => bar("SPY", i, 100 + Math.sin(i / 2) * 3 + i * 0.1));
  const structure = detectMarketStructure(bars, { pivotRadius: 1 });
  assert.ok(structure);
  const features = buildFeatures(bars, { symbol: "SPY", ts: 25 * 60_000, bid: 102, ask: 102.1 });
  assert.ok(features);
  const regime = classifyRegime(features!, structure);
  assert.equal(regime.symbol, "SPY");
  assert.ok(detectPatterns(features!, structure, regime).every((pattern) => pattern.symbol === "SPY"));
  const events = new InMemoryEventRepository();
  events.append({ id: "1", timestamp: 1, eventType: "MARKET_BAR_ACCEPTED", component: "test", version: "1", payload: {} });
  assert.throws(() => events.append({ id: "1", timestamp: 2, eventType: "QUOTE_ACCEPTED", component: "test", version: "1", payload: {} }));
  assert.equal(events.byType("MARKET_BAR_ACCEPTED").length, 1);
  const experiments = new InMemoryExperimentRepository();
  experiments.save({ experimentId: "exp-1", datasetId: "file", datasetVersion: "1", symbols: ["SPY"], timeframe: "1m", featureVersions: ["baseline"], strategyVersion: "ema-1", parameters: {}, costs: { feeBps: 1, slippageBps: 1 }, createdAt: 1 });
  assert.equal(experiments.all().length, 1);
});

test("triple barriers, walk-forward splits and statistical utilities are explicit", () => {
  const bars = [bar("SPY", 0, 100), { ...bar("SPY", 1, 101), high: 103, low: 99 }, { ...bar("SPY", 2, 102), high: 104, low: 100 }];
  const target = tripleBarrierTarget(bars, 0, 1, 2, 2, 2);
  assert.equal(target?.label, "UP");
  const ambiguous = tripleBarrierTarget([{ ...bar("SPY", 0, 100) }, { ...bar("SPY", 1, 101), high: 103, low: 97 }], 0, 1, 2, 2, 1);
  assert.equal(ambiguous?.label, "AMBIGUOUS");
  const folds = generateWalkForwardSplits(30, { trainBars: 10, validationBars: 5, testBars: 5, stepBars: 5, targetHorizon: 2, embargoBars: 1 });
  assert.equal(folds.length, 2);
  assert.ok(folds.every((fold) => Math.max(...fold.train) < Math.min(...fold.validation)));
  assert.equal(mean([1, 2, 3]), 2);
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.ok(Math.abs(standardDeviation([1, 2, 3]) - 1) < 1e-12);
  assert.equal(correlation([1, 2, 3], [2, 4, 6]), 1);
  assert.equal(expectedValue(0.4, 60, 20), 12);
});

test("replay produces closed trades from broker fills", () => {
  const broker = new PaperBroker({ initialCash: 10_000, feeBps: 0, slippageBps: 0 });
  const strategy = { id: "test-enter-exit", version: "1", evaluate: ({ position }: { position: unknown }) => position ? { action: "EXIT" as const, reason: "test exit" } : { action: "ENTER_LONG" as const, reason: "test entry" } };
  const engine = new ResearchEngine(strategy, broker, new RiskManager({ maxPositionValue: 1_000, maxGrossExposure: 2_000, maxDailyLoss: 1_000, maxDrawdown: 1_000, maxOrdersPerMinute: 10, feeBps: 0 }));
  const events = Array.from({ length: 22 }, (_, i) => ({ bar: bar("SPY", i, 100 + i), quote: { symbol: "SPY", ts: (i + 1) * 60_000 + 1, bid: 100 + i, ask: 100.1 + i, last: 100.05 + i } }));
  const result = replay(events, engine);
  assert.ok(result.equity.length > 1);
  assert.ok(result.trades.length >= 1);
  assert.ok(result.snapshots.every((snapshot) => Number.isFinite(snapshot.equity)));
  assert.ok(result.trades.every((trade) => trade.netPnl === trade.grossPnl - trade.entryFees - trade.exitFees));
});

test("durable repositories reload append-only events, experiments and trades", () => {
  const directory = mkdtempSync(join(tmpdir(), "paper-lab-"));
  try {
    const events = new JsonlEventRepository(join(directory, "events.jsonl"));
    events.append({ id: "event-1", timestamp: 1, eventType: "MARKET_BAR_ACCEPTED", component: "test", version: "1", payload: { symbol: "SPY" } });
    assert.equal(new JsonlEventRepository(join(directory, "events.jsonl")).all().length, 1);
    assert.throws(() => events.append({ id: "event-1", timestamp: 2, eventType: "QUOTE_ACCEPTED", component: "test", version: "1", payload: {} }));
    const experiments = new JsonExperimentRepository(join(directory, "experiments.json"));
    experiments.save({ experimentId: "e1", datasetId: "csv", datasetVersion: "1", symbols: ["SPY"], timeframe: "1m", featureVersions: ["return-1"], strategyVersion: "ema-1", parameters: {}, costs: { feeBps: 1, slippageBps: 1 }, createdAt: 1 });
    assert.equal(new JsonExperimentRepository(join(directory, "experiments.json")).get("e1")?.datasetId, "csv");
    const trades = new JsonlTradeRepository(join(directory, "trades.jsonl"));
    const closedTrade = { tradeId: "t1", symbol: "SPY", strategyId: "s", strategyVersion: "1", entryTimestamp: 1, exitTimestamp: 2, entryPrice: 100, exitPrice: 101, quantity: 1, grossPnl: 1, entryFees: 0, exitFees: 0, netPnl: 1, holdingPeriodMs: 1 };
    trades.append(closedTrade);
    assert.equal(new JsonlTradeRepository(join(directory, "trades.jsonl")).all()[0].netPnl, 1);
    assert.match(readFileSync(join(directory, "events.jsonl"), "utf8"), /MARKET_BAR_ACCEPTED/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("feature registry and conditional performance expose reproducible metadata", () => {
  assert.ok(featureRegistry.length >= 7);
  assert.equal(getFeatureMetadata("rsi-14")?.category, "MOMENTUM");
  const trades = ["UPTREND", "RANGE"].map((regime, index) => ({ tradeId: `t${index}`, symbol: "SPY", strategyId: "s", strategyVersion: "1", entryTimestamp: index, exitTimestamp: index + 1, entryPrice: 100, exitPrice: index ? 99 : 101, quantity: 1, grossPnl: index ? -1 : 1, entryFees: 0, exitFees: 0, netPnl: index ? -1 : 1, holdingPeriodMs: 1, entryRegime: regime }));
  const grouped = conditionalTradeStatistics(trades, (trade) => trade.entryRegime);
  assert.deepEqual(grouped.map((group) => group.label), ["RANGE", "UPTREND"]);
  assert.equal(grouped.every((group) => group.sampleCount === 1), true);
});

test("ML baseline fits only training data and reports calibrated/OOD diagnostics", () => {
  const rows = [-2, -1, 1, 2, 0.5, -0.5].map((value, index) => ({ symbol: "SPY", decisionTimestamp: index, features: [value], label: value > 0 ? 1 as const : 0 as const, split: index < 4 ? "TRAIN" as const : index === 4 ? "VALIDATION" as const : "TEST" as const }));
  const prepared = prepareDataset(rows);
  assert.equal(prepared.scaler.fittedRows, 4);
  assert.ok(Math.abs(prepared.validation[0].features[0]) > 0);
  const model = new LogisticRegression().fit({ role: "TRAIN", rows: prepared.train }, { epochs: 800, learningRate: 0.2, l2: 0 });
  const probabilities = prepared.train.map((row) => model.predictProbability(row.features));
  const metrics = classificationMetrics(prepared.train.map((row) => row.label), probabilities);
  assert.ok(metrics.logLoss < 0.4);
  assert.ok(calibrationBins([0, 1, 1, 0], [0.1, 0.8, 0.7, 0.2]).some((bin) => bin.count > 0));
  const profile = fitOodProfile(prepared.train.map((row) => row.features));
  assert.equal(assessOod(prepared.train[0].features, profile).status, "IN_DISTRIBUTION");
  assert.equal(assessOod([10], profile).status, "OUT_OF_DISTRIBUTION");
  assert.ok(model.metadata().weights.length === 1);
});

test("historical analogues and evidence quality expose sample size instead of fake certainty", () => {
  const observations = Array.from({ length: 25 }, (_, index) => ({ features: [index / 10], forwardReturn: index % 2 ? 0.02 : -0.01, regime: index % 2 ? "UPTREND" : "RANGE", mfe: 0.03, mae: -0.02 }));
  const result = nearestAnalogues([1.2], observations, 20, 10);
  assert.equal(result.sampleSize, 20);
  assert.equal(result.evidence, "SUFFICIENT");
  assert.ok(result.regimeDistribution.UPTREND > 0);
  assert.equal(assessEvidence({ sampleSize: 3, regimeConsistent: true }).quality, "INSUFFICIENT");
  const passed = { reportId: "r", status: "PASSED" as const };
  assert.ok(assessEvidence({ sampleSize: 100, regimeConsistent: true, context: { outOfSampleReport: passed, calibrationReport: passed, costStressReport: passed, walkForwardReport: passed, parameterStabilityReport: passed, recentStabilityReport: passed } }).score > 0.9);
});

test("correctness gates prevent look-ahead and impossible breakouts", () => {
  assert.throws(() => validateQuote({ symbol: "SPY", ts: 1, bid: 99, ask: 100, last: 0 }));
  const bars = Array.from({ length: 20 }, (_, i) => bar("SPY", i, 100 + i));
  const breakoutBars = [...bars, { ...bar("SPY", 20, 130), high: 131, low: 129 }];
  const features = buildFeatures(breakoutBars)!; const structure = detectMarketStructure(breakoutBars, { rangeLookback: 20 });
  assert.ok(structure && features && features.close > structure.rangeHigh);
  assert.ok(detectPatterns(features, structure).some((pattern) => pattern.type === "BREAKOUT"));
  assert.ok(structure!.swingHighs.every((swing) => swing.confirmedTimestamp >= swing.timestamp));
  const regime = classifyRegime({ ...features, emaFast: 100, emaSlow: 110, emaFastDistance: 0.1, emaSlowDistance: 0.2 }, structure);
  assert.notEqual(regime.trend, "UPTREND");
});

test("MFE/MAE start at the fill and risk sizing includes slippage", () => {
  const ledger = new TradeLedger(); const buy = order("entry", "BUY", 1); const sell = order("exit", "SELL", 1);
  ledger.applyFill(buy, { id: "f1", orderId: "entry", ts: 100, quantity: 1, price: 100, fee: 0 }, { high: 200, low: 1 });
  ledger.updateMark("SPY", 110, 90); ledger.applyFill(sell, { id: "f2", orderId: "exit", ts: 200, quantity: 1, price: 105, fee: 0 });
  assert.equal(ledger.all()[0].mfePerShare, 10); assert.equal(ledger.all()[0].maePerShare, -10);
  const risk = new (class extends RiskManager { constructor() { super({ maxPositionValue: 1_000, maxGrossExposure: 1_000, maxDailyLoss: 1_000, maxDrawdown: 1_000, maxOrdersPerMinute: 10, feeBps: 100, slippageBps: 100 }); } })();
  const decision = risk.size({ ...order("sizing"), submittedAt: 1 }, 100, { equity: 1_000, dayStartEquity: 1_000, highWaterMark: 1_000, openPositions: [], ordersInLastMinute: 0, killSwitch: false, marks: {} });
  assert.deepEqual(decision, { allowed: true, quantity: 9 });
});

test("metrics, intelligence, prediction resolution and model registry are integrated", () => {
  const year = 365.2425 * 24 * 60 * 60 * 1000;
  assert.ok(Math.abs(performanceMetrics([{ ts: 0, value: 100 }, { ts: year, value: 110 }]).cagr - 0.1) < 1e-9);
  const intelligence = new IntelligenceEngine();
  let snapshot: ReturnType<IntelligenceEngine["analyze"]> | undefined;
  for (let i = 0; i < 20; i++) snapshot = intelligence.analyze(bar("SPY", i));
  assert.equal(new DecisionEngine().decide({ analysis: snapshot! }).action, "NO_TRADE"); assert.equal(snapshot?.evidence, undefined);
  const prediction = resolvePrediction({ ...predictionState, predictionId: "p1", symbol: "SPY", decisionTimestamp: 20 * 60_000, horizonBars: 1, targetVersion: "forward-close-1-v1", probability: 0.7, decision: "BUY", modelVersion: "m1", featureVersion: "f1" }, [bar("SPY", 19, 100), { ...bar("SPY", 20, 105), open: 100 }]);
  assert.equal(prediction?.resolved.label, "WIN"); assert.equal(prediction?.resolved.entryPrice, 100);
  const registry = new ModelRegistry(); registry.register({ modelId: "m1", version: "1", algorithm: "logistic", featureVersion: "f1", datasetVersion: "d1", metrics: { outOfSampleScore: 0.7 }, lifecycle: "CANDIDATE", createdAt: 1, evaluation: { sampleSize: 100, brier: 0.1, logLoss: 0.2, ece: 0.1, expectedValue: 0.1, maxDrawdown: 0.1, walkForwardStatus: "PASSED", costStressStatus: "PASSED", regimeCoverage: "PASSED", parameterStability: "PASSED" } });
  assert.equal(registry.promote("m1").lifecycle, "ACTIVE");
});

test("analogue and evidence gates are time-safe and do not invent validation", () => {
  const observations = [{ features: [0, 100], forwardReturn: 0.1, decisionTimestamp: 10, targetEndTimestamp: 15, regime: "UPTREND" }, { features: [0, 1], forwardReturn: -0.1, decisionTimestamp: 30, targetEndTimestamp: 35, regime: "RANGE" }];
  const result = nearestAnalogues([0, 1], observations, 10, 1, { asOfTimestamp: 20, requiredRegime: "UPTREND", scaler: { means: [0, 50], scales: [1, 50], fittedRows: 2 } });
  assert.equal(result.sampleSize, 1); assert.equal(result.meanForwardReturn, 0.1);
  const cautious = new IntelligenceEngine();
  let snapshot: ReturnType<IntelligenceEngine["analyze"]> | undefined; for (let i = 0; i < 20; i++) snapshot = cautious.analyze(bar("SPY", i));
  assert.equal(new DecisionEngine().decide({ analysis: snapshot! }).action, "NO_TRADE"); assert.equal(snapshot?.evidence, undefined);
});

test("model bundles, decision policy, target registry, queue and durable artifacts are reproducible", () => {
  const artifact: ModelArtifact = { artifactId: "a1", modelId: "m1", modelVersion: "1", algorithm: "logistic-regression", featureVersion: "f1", featureSetVersion: "fset1", featureIds: ["x"], targetVersion: "forward-close-v1", scaler: { means: [1], scales: [2], fittedRows: 4 }, model: { weights: [1], bias: 0 }, oodProfile: { featureSetVersion: "fset1", featureIds: ["x"], means: [1], scales: [2], minimums: [0], maximums: [2] }, createdAt: 1 };
  const bundle = new PredictiveModelBundle(artifact); assert.ok(bundle.predict({ x: 3 }).probability > 0.5); assert.equal(bundle.metadata().targetVersion, "forward-close-v1");
  const decision = new DecisionEngine({ minimumEvidence: "MODERATE" }).decide({ symbol: "SPY", timestamp: 1, features: null, structure: null, regime: null, patterns: [], decision: "BUY", reason: "x", evidence: { quality: "WEAK", score: 0.2, components: {} } }); assert.equal(decision.action, "NO_TRADE");
  const targets = new TargetRegistry(); targets.register({ targetVersion: "forward-close-2-v1", kind: "FORWARD_CLOSE_RETURN", horizonBars: 2 }); assert.equal(targets.get("forward-close-2-v1")?.horizonBars, 2);
  const queue = new PredictionQueue(); queue.enqueue({ ...predictionState, predictionId: "q1", symbol: "SPY", decisionTimestamp: 20 * 60_000, horizonBars: 1, targetVersion: "forward-close-1-v1", probability: 0.7, decision: "BUY", modelVersion: "m1", featureVersion: "f1" }); assert.equal(queue.resolveAvailable([bar("SPY", 19, 100), bar("SPY", 20, 105)]).length, 1);
  const directory = mkdtempSync(join(tmpdir(), "paper-lab-artifacts-")); try { const experiences = new JsonlExperienceRepository(join(directory, "experience.jsonl")); experiences.append(resolvePrediction({ ...predictionState, predictionId: "p2", symbol: "SPY", decisionTimestamp: 20 * 60_000, horizonBars: 1, targetVersion: "forward-close-1-v1", probability: 0.5, decision: "HOLD", modelVersion: "m1", featureVersion: "f1" }, [bar("SPY", 19, 100), bar("SPY", 20, 101)])!); assert.equal(experiences.all().length, 1); const artifacts = new JsonModelArtifactRepository(join(directory, "models.jsonl")); artifacts.append(artifact); assert.equal(artifacts.all()[0].artifactId, "a1"); const pending = new JsonPredictionQueueRepository(join(directory, "pending.jsonl")); pending.append({ ...predictionState, predictionId: "q2", symbol: "SPY", decisionTimestamp: 1, horizonBars: 1, targetVersion: "forward-close-1-v1", probability: 0.5, decision: "NO_TRADE", modelVersion: "m1", featureVersion: "f1" }); assert.equal(pending.all().length, 1); } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("engine refuses stale market data and local service exposes safe controls", async () => {
  const broker = new PaperBroker({ initialCash: 10_000, feeBps: 0, slippageBps: 0 });
  const engine = new ResearchEngine(new EmaCrossStrategy(), broker, new RiskManager({ maxPositionValue: 1_000, maxGrossExposure: 2_000, maxDailyLoss: 1_000, maxDrawdown: 1_000, maxOrdersPerMinute: 10, feeBps: 0 }), undefined, 1_000);
  engine.setOperationalNow(200_000);
  const stale = engine.onBar(bar("SPY", 0), { symbol: "SPY", ts: 60_000, bid: 100, ask: 100.1 });
  assert.equal(stale.reason, "Market data is stale"); assert.equal(engine.health.dataFresh, false); assert.deepEqual(engine.health.staleSymbols, []); assert.equal(engine.health.bars, 0);
  const service = new LocalPaperEngineService(engine, { port: 0 }); await service.start();
  try {
    const address = service.address()!; const base = `http://${address.host}:${address.port}`;
    const health = await fetch(`${base}/health`).then((response) => response.json()) as { ok: boolean; safety: string; engine: { paused: boolean } };
    assert.equal(health.ok, true); assert.equal(health.safety, "PAPER_ONLY"); assert.equal(health.engine.paused, false);
    const paused = await fetch(`${base}/control/pause`, { method: "POST" }).then((response) => response.json()) as { engine: { paused: boolean } };
    assert.equal(paused.engine.paused, true);
    const killed = await fetch(`${base}/control/kill-switch`, { method: "POST" }).then((response) => response.json()) as { engine: { killSwitch: boolean } };
    assert.equal(killed.engine.killSwitch, true);
    const resumed = await fetch(`${base}/control/resume`, { method: "POST" }).then((response) => response.json()) as { engine: { paused: boolean } };
    assert.equal(resumed.engine.paused, true);
    await fetch(`${base}/control/reset-kill-switch`, { method: "POST" }); await fetch(`${base}/control/resume`, { method: "POST" });
    const finalHealth = await fetch(`${base}/health`).then((response) => response.json()) as { engine: { paused: boolean } };
    assert.equal(finalHealth.engine.paused, false);
    const invalid = await fetch(`${base}/market-event`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }); assert.equal(invalid.status, 400);
    const forbidden = await fetch(`${base}/health`, { headers: { Origin: "https://evil.example" } }); assert.equal(forbidden.status, 403);
  } finally { await service.stop(); }
});

test("critical correctness gates enforce separation, schema, costs, OOD, and shared integrated replay", () => {
  const rows = [-1, 1, -0.5, 0.5].map((value, index) => ({ symbol: "SPY", decisionTimestamp: index, features: [value], label: value > 0 ? 1 as const : 0 as const, split: index < 2 ? "TRAIN" as const : index === 2 ? "VALIDATION" as const : "TEST" as const }));
  const prepared = prepareDataset(rows); assert.throws(() => new LogisticRegression().fit([...prepared.train, ...prepared.validation]));
  const oodSnapshot = { symbol: "SPY", timestamp: 1, features: null, structure: null, regime: null, patterns: [], decision: "BUY" as const, reason: "test", evidence: { quality: "VERY_STRONG" as const, score: 1, components: {} }, prediction: { probability: 0.9, ood: { status: "OUT_OF_DISTRIBUTION" as const, maxAbsZ: 5 } } };
  assert.equal(new DecisionEngine({ minimumEvidence: "MODERATE" }).decide(oodSnapshot).action, "NO_TRADE");
  const model = { featureVersion: "wrong-schema", predictProbability: () => 0.9 }; const intelligence = new IntelligenceEngine({ model, analogues: [] }); let mismatch: ReturnType<IntelligenceEngine["analyze"]> | undefined; for (let index = 0; index < 20; index++) mismatch = intelligence.analyze(bar("SPY", index)); assert.equal(mismatch?.prediction, undefined);
  const broker = new PaperBroker({ initialCash: 10_000, feeBps: 0, slippageBps: 0 }); const integrated = new IntegratedPaperResearchEngine(new IntelligenceEngine(), new DecisionEngine(), broker, new RiskManager({ maxPositionValue: 1_000, maxGrossExposure: 2_000, maxDailyLoss: 1_000, maxDrawdown: 1_000, maxOrdersPerMinute: 10, feeBps: 0 })); const replay = replayIntegrated([{ bar: bar("SPY", 0), quote: { symbol: "SPY", ts: 60_001, bid: 99, ask: 100, last: 99.5 } }], integrated); assert.equal(replay.finalEquity, 10_000); assert.equal(replay.trades.length, 0); assert.equal(integrated.health.dataFresh, true);
  const staleIntegrated = new IntegratedPaperResearchEngine(new IntelligenceEngine(), new DecisionEngine(), new PaperBroker({ initialCash: 10_000, feeBps: 0, slippageBps: 0 }), new RiskManager({ maxPositionValue: 1_000, maxGrossExposure: 2_000, maxDailyLoss: 1_000, maxDrawdown: 1_000, maxOrdersPerMinute: 10, feeBps: 0 })); staleIntegrated.setOperationalNow(200_000); assert.equal(staleIntegrated.onBar(bar("AAPL", 0), { symbol: "AAPL", ts: 60_000, bid: 99, ask: 100 }).decision.reason, "Market data is stale"); assert.equal(staleIntegrated.health.bars, 0);
  const futureEngine = new ResearchEngine(new EmaCrossStrategy(), new PaperBroker({ initialCash: 10_000, feeBps: 0, slippageBps: 0 }), new RiskManager({ maxPositionValue: 1_000, maxGrossExposure: 2_000, maxDailyLoss: 1_000, maxDrawdown: 1_000, maxOrdersPerMinute: 10, feeBps: 0 })); futureEngine.setOperationalNow(100_000); assert.equal(futureEngine.onBar(bar("QQQ", 0), { symbol: "QQQ", ts: 101_500, bid: 99, ask: 100 }).reason, "Quote is from the future"); assert.equal(futureEngine.health.bars, 0);
  const triple = resolvePrediction({ ...triplePredictionState, predictionId: "tb", symbol: "SPY", decisionTimestamp: 60_000, horizonBars: 1, targetVersion: "triple-barrier-1-u1-d1-v1", targetParameters: { atr: 1 }, probability: 0.5, decision: "HOLD", modelVersion: "m", featureVersion: "f" }, [{ ...bar("SPY", 0, 100) }, { ...bar("SPY", 1, 100), high: 102, low: 100 }]); assert.equal(triple?.resolved.label, "WIN");
});

test("integrated engine exhaustively maps BUY, SELL, HOLD, and NO_TRADE without fall-through", () => {
  const risk = () => new RiskManager({ maxPositionValue: 1_000, maxGrossExposure: 2_000, maxDailyLoss: 1_000, maxDrawdown: 1_000, maxOrdersPerMinute: 20, feeBps: 0 });
  const quote = { symbol: "SPY", ts: 3_600_001, bid: 99, ask: 100, last: 99.5 };
  const snapshot = { symbol: "SPY", timestamp: quote.ts, features: null, structure: null, regime: null, patterns: [], decision: "HOLD" as const, reason: "valid", evidence: { quality: "STRONG" as const, score: 1, components: {} }, prediction: { probability: 0.5 }, expectedValue: 0 };
  const intelligence = new FixedIntelligenceEngine(snapshot);
  const rthTestCalendar = new TradingCalendar({ timeZone: "UTC", sessionOpenHour: 0, sessionOpenMinute: 0, sessionCloseHour: 23, sessionCloseMinute: 59 });
  const make = (action: "BUY" | "SELL" | "HOLD" | "NO_TRADE") => { const broker = new PaperBroker({ initialCash: 10_000, feeBps: 0, slippageBps: 0 }); return { broker, engine: new IntegratedPaperResearchEngine(intelligence, new FixedDecisionEngine(action), broker, risk(), "test", "1", rthTestCalendar) }; };
  const buy = make("BUY"); const buyResult = buy.engine.onBar(bar("SPY", 0), quote); assert.equal(buyResult.filled, 10); assert.equal(buy.broker.allOrders.filter((item) => item.side === "BUY").length, 1); assert.equal(buy.broker.allOrders.some((item) => item.side === "SELL"), false);
  const sell = make("SELL"); const seed = order("seed", "BUY", 5); sell.broker.submit(seed); sell.broker.onQuote({ ...quote, ts: 1 }); const sellResult = sell.engine.onBar(bar("SPY", 0), quote); assert.equal(sellResult.filled, 5); assert.equal(sell.broker.allOrders.filter((item) => item.side === "SELL").length, 1);
  for (const action of ["HOLD", "NO_TRADE"] as const) { const noTrade = make(action); const result = noTrade.engine.onBar(bar("SPY", 0), quote); assert.equal(result.filled, 0); assert.equal(result.decision.action, action); assert.equal(noTrade.broker.allOrders.length, 0); }
  const held = make("HOLD"); const heldSeed = order("held-seed", "BUY", 5); held.broker.submit(heldSeed); held.broker.onQuote({ ...quote, ts: 1 }); const before = held.broker.openPositions[0]?.quantity; held.engine.onBar(bar("SPY", 0), quote); assert.equal(held.broker.openPositions[0]?.quantity, before); assert.equal(held.broker.allOrders.length, 1);
});

test("exit policy, kill switch reductions, RTH gate, and failed breakouts are explicit", () => {
  const exit = new ExitPolicy({ maxHoldMs: 10 });
  const analysis = { symbol: "SPY", barCloseTimestamp: 1, decisionTimestamp: 1, timestamp: 1, features: {} as never, structure: null, regime: { trend: "RANGE", volatility: "NORMAL" } as never, patterns: [] };
  assert.equal(exit.evaluate(analysis, { symbol: "SPY", quantity: 1, averagePrice: 100, realisedPnl: 0, entryFees: 0 }, { now: 20, entryTimestamp: 1 }).action, "CLOSE_POSITION");
  const failedBull = detectPatterns({ ts: 1, symbol: "SPY", close: 99, currentHigh: 105, currentLow: 98, ret1: 0, ret5: 0, emaFast: 100, emaSlow: 100, emaFastDistance: 0, emaSlowDistance: 0, rsi14: 50, realisedVol20: 0.2, volumeZ: 0 }, { symbol: "SPY", timestamp: 1, swingHighs: [], swingLows: [], rangeHigh: 100, rangeLow: 90, trend: "RANGE" });
  const failedBear = detectPatterns({ ts: 1, symbol: "SPY", close: 91, currentHigh: 92, currentLow: 85, ret1: 0, ret5: 0, emaFast: 100, emaSlow: 100, emaFastDistance: 0, emaSlowDistance: 0, rsi14: 50, realisedVol20: 0.2, volumeZ: 0 }, { symbol: "SPY", timestamp: 1, swingHighs: [], swingLows: [], rangeHigh: 110, rangeLow: 90, trend: "RANGE" });
  assert.equal(failedBull.some((pattern) => pattern.type === "FAILED_BREAKOUT"), true); assert.equal(failedBear.some((pattern) => pattern.type === "FAILED_BREAKOUT"), true);
});

test("integrated portfolio marks include every symbol and replay updates MFE/MAE", () => {
  const broker = new PaperBroker({ initialCash: 10_000, feeBps: 0, slippageBps: 0 });
  broker.submit({ ...order("spy-seed", "BUY", 10), symbol: "SPY" }); broker.onQuote({ symbol: "SPY", ts: 1, bid: 99, ask: 100 });
  broker.submit({ ...order("qqq-seed", "BUY", 10), symbol: "QQQ" }); broker.onQuote({ symbol: "QQQ", ts: 2, bid: 49, ask: 50 });
  const snapshot = { symbol: "SPY", timestamp: 60_001, features: null, structure: null, regime: null, patterns: [], decision: "HOLD" as const, reason: "valid", evidence: { quality: "STRONG" as const, score: 1, components: {} }, prediction: { probability: 0.5 }, expectedValue: 0 };
  const rthTestCalendar = new TradingCalendar({ timeZone: "UTC", sessionOpenHour: 0, sessionOpenMinute: 0, sessionCloseHour: 23, sessionCloseMinute: 59 });
  const engine = new IntegratedPaperResearchEngine(new FixedIntelligenceEngine(snapshot), new FixedDecisionEngine("HOLD"), broker, new RiskManager({ maxPositionValue: 2_000, maxGrossExposure: 4_000, maxDailyLoss: 1_000, maxDrawdown: 1_000, maxOrdersPerMinute: 20, feeBps: 0 }), "test", "1", rthTestCalendar);
  const result = engine.onBar({ ...bar("SPY", 0, 105), high: 110, low: 95 }, { symbol: "SPY", ts: 3_600_001, bid: 104, ask: 105, last: 105 });
  assert.equal(result.filled, 0); assert.equal(engine.portfolioSnapshot(3_600_001).equity, 10_050);
  const replayBroker = new PaperBroker({ initialCash: 10_000, feeBps: 0, slippageBps: 0 }); const replayEngine = new IntegratedPaperResearchEngine(new FixedIntelligenceEngine(snapshot), new SequenceDecisionEngine(["BUY", "HOLD", "SELL"]), replayBroker, new RiskManager({ maxPositionValue: 1_000, maxGrossExposure: 2_000, maxDailyLoss: 1_000, maxDrawdown: 1_000, maxOrdersPerMinute: 20, feeBps: 0 }), "test", "1", rthTestCalendar); const replay = replayIntegrated([{ bar: bar("SPY", 0, 100), quote: { symbol: "SPY", ts: 3_600_001, bid: 99, ask: 100, last: 100 } }, { bar: { ...bar("SPY", 1, 101), high: 120, low: 90 }, quote: { symbol: "SPY", ts: 3_660_001, bid: 100, ask: 101, last: 101 } }, { bar: { ...bar("SPY", 2, 102), high: 130, low: 80 }, quote: { symbol: "SPY", ts: 3_720_001, bid: 101, ask: 102, last: 102 } }], replayEngine); assert.equal(replay.trades.length, 1); assert.equal(replay.trades[0]?.mfePerShare, 30); assert.equal(replay.trades[0]?.maePerShare, -20);
});

test("triple-barrier resolution preserves AMBIGUOUS and target horizon authority", () => {
  const ambiguous = resolvePrediction({ ...triplePredictionState, predictionId: "amb", symbol: "SPY", decisionTimestamp: 60_000, horizonBars: 1, targetVersion: "triple-barrier-1-u1-d1-v1", targetParameters: { atr: 1 }, probability: 0.5, decision: "HOLD", modelVersion: "m", featureVersion: "f" }, [{ ...bar("SPY", 0, 100) }, { ...bar("SPY", 1, 100), high: 102, low: 98 }]); assert.equal(ambiguous?.resolved.label, "AMBIGUOUS");
  const registry = new TargetRegistry(); registry.register({ targetVersion: "fixed-h2", kind: "FORWARD_CLOSE_RETURN", horizonBars: 2 }); assert.equal(resolvePrediction({ ...predictionState, predictionId: "wrong", symbol: "SPY", decisionTimestamp: 60_000, horizonBars: 1, targetVersion: "fixed-h2", probability: 0.5, decision: "HOLD", modelVersion: "m", featureVersion: "f" }, [bar("SPY", 0), bar("SPY", 1), bar("SPY", 2)], registry), null);
});
