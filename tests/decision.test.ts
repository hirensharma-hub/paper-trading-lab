import test from "node:test";
import assert from "node:assert/strict";
import { DecisionEngine } from "../src/decision";
import { ExitPolicy } from "../src/exit-policy";

test("decision engine keeps an existing position on HOLD and uses exit policy for SELL", () => {
  const analysis = { symbol: "SPY", barCloseTimestamp: 1, decisionTimestamp: 1, timestamp: 1, features: {} as never, structure: null, regime: null, patterns: [], prediction: { probability: 0.9, rawProbability: 0.9, calibratedProbability: 0.9 }, evidence: { quality: "STRONG" as const, score: 1, components: {} }, expectedValue: 1 };
  assert.equal(new DecisionEngine().decide({ analysis, position: { symbol: "SPY", quantity: 1, averagePrice: 100, realisedPnl: 0, entryFees: 0 } }).action, "HOLD");
  assert.equal(new DecisionEngine({ exitPolicy: new ExitPolicy({ maxHoldMs: 1 }) }).decide({ analysis, position: { symbol: "SPY", quantity: 1, averagePrice: 100, realisedPnl: 0, entryFees: 0, entryTimestamp: 1 }, exitPolicyState: { now: 2, entryTimestamp: 1 } }).action, "SELL");
});
