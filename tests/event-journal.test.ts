import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryEventRepository } from "../src/research-ledger";
import { IntegratedPaperResearchEngine } from "../src/integrated-engine";
import { IntelligenceEngine } from "../src/intelligence";
import { DecisionEngine } from "../src/decision";
import { PaperBroker } from "../src/broker";
import { RiskManager } from "../src/risk";
import { TradingCalendar } from "../src/calendar";

test("integrated engine emits an append-only market/decision journal", () => { const journal = new InMemoryEventRepository(); const engine = new IntegratedPaperResearchEngine(new IntelligenceEngine(), new DecisionEngine(), new PaperBroker({ initialCash: 1_000, feeBps: 0, slippageBps: 0 }), new RiskManager({ maxPositionValue: 100, maxGrossExposure: 100, maxDailyLoss: 100, maxDrawdown: 100, maxOrdersPerMinute: 5, feeBps: 0 }), "s", "1", new TradingCalendar({ timeZone: "UTC", sessionOpenHour: 0, sessionCloseHour: 23, sessionCloseMinute: 59 }), undefined, journal); engine.onBar({ symbol: "SPY", startMs: 3_600_000, intervalMs: 60_000, open: 100, high: 101, low: 99, close: 100, volume: 1 }, { symbol: "SPY", ts: 3_660_001, bid: 99, ask: 100 }); assert.equal(journal.byType("MARKET_BAR_ACCEPTED").length, 1); assert.equal(journal.byType("DECISION_CREATED").length, 1); });
