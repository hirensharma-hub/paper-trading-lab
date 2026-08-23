import test from "node:test";
import assert from "node:assert/strict";
import { ema, rsi, buildFeatures } from "../src/features";
import { appendBar, validateQuote } from "../src/data";
import { PaperBroker } from "../src/broker";
import { RiskManager } from "../src/risk";
import { maximumDrawdown, performanceMetrics } from "../src/metrics";
import { chronologicalSplit, forwardReturnTarget } from "../src/research";
import { EmaCrossStrategy } from "../src/strategy";
import { ResearchEngine } from "../src/engine";

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
  const base = { equity: 100, dayStartEquity: 100, highWaterMark: 100, openPositions: [], ordersInLastMinute: 0, killSwitch: false };
  const intent = { ...order("x"), submittedAt: 1 };
  assert.deepEqual(risk.size(intent, 10, base), { allowed: true, quantity: 10 });
  assert.equal(risk.size(intent, 10, { ...base, equity: 89 }).allowed, false);
  assert.equal(risk.size(intent, 10, { ...base, killSwitch: true }).allowed, false);
  assert.equal(risk.size({ ...intent, side: "SELL" }, 10, { ...base, openPositions: [{ symbol: "SPY", quantity: 10, averagePrice: 10, realisedPnl: 0 }] }).allowed, true);
});

test("metrics and leakage-safe targets use chronological data", () => {
  assert.equal(maximumDrawdown([100, 110, 99]), 0.1);
  const metrics = performanceMetrics([100, 110, 99], [10, -11]);
  assert.ok(Math.abs(metrics.totalReturn + 0.01) < 1e-12);
  assert.equal(metrics.tradeCount, 2);
  const bars = [bar("SPY", 0, 100), bar("SPY", 1, 101), bar("SPY", 2, 110)];
  const target = forwardReturnTarget(bars, 0, 2, 0.02)!;
  assert.equal(target.decisionTs, 60_000);
  assert.equal(target.label, "LONG");
  const split = chronologicalSplit(10);
  assert.deepEqual(split.train.at(-1), 5);
  assert.deepEqual(split.test.at(0), 8);
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
