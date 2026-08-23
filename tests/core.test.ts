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

const bar = (symbol: string, i: number, close = 100 + i) => ({ symbol, startMs: i * 60_000, intervalMs: 60_000, open: close, high: close + 1, low: close - 1, close, volume: 100 + i });
const order = (id: string, side: "BUY" | "SELL" = "BUY", quantity = 10, limitPrice?: number) => ({ id, symbol: "SPY", side, type: limitPrice === undefined ? "MARKET" as const : "LIMIT" as const, quantity, limitPrice, status: "NEW" as const, strategyId: "test", strategyVersion: "1", reason: "unit test", fills: [] });

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
