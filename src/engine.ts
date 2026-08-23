import { buildFeatures } from "./features";
import type { Bar, PortfolioSnapshot, Quote, Signal } from "./domain";
import { appendBar, validateQuote } from "./data";
import { PaperBroker } from "./broker";
import { RiskManager, type RiskState } from "./risk";
import type { Strategy } from "./strategy";
import { TradingCalendar } from "./calendar";

export class ResearchEngine {
  private readonly histories = new Map<string, Bar[]>();
  private readonly marks = new Map<string, number>();
  private readonly orderTimes: number[] = [];
  private orderSequence = 0;
  private paused = false;
  private killSwitch = false;
  private operationalNowMs?: number;
  private lastQuoteTs = new Map<string, number>();
  private dayKey = "";
  private dayStartEquity: number;
  private highWaterMark: number;

  constructor(readonly strategy: Strategy, readonly broker: PaperBroker, private readonly risk: RiskManager, private readonly calendar = new TradingCalendar(), private readonly maxQuoteAgeMs = 120_000) { if (!Number.isFinite(maxQuoteAgeMs) || maxQuoteAgeMs <= 0) throw new Error("maxQuoteAgeMs must be positive"); this.dayStartEquity = broker.balance; this.highWaterMark = broker.balance; }

  onBar(bar: Bar, quote?: Quote): Signal {
    if (quote) validateQuote(quote);
    if (quote && (bar.symbol !== quote.symbol || quote.ts < bar.startMs + bar.intervalMs)) return { action: "HOLD", reason: "Quote is not aligned to completed bar" };
    if (quote && this.operationalNowMs !== undefined && quote.ts > this.operationalNowMs + 1_000) return { action: "HOLD", reason: "Quote is from the future" };
    if (quote && this.operationalNowMs !== undefined && this.operationalNowMs - quote.ts > this.maxQuoteAgeMs) return { action: "HOLD", reason: "Market data is stale" };
    const history = this.histories.get(bar.symbol) ?? [];
    this.histories.set(bar.symbol, appendBar(history, bar));
    if (quote) { this.marks.set(quote.symbol, quote.last ?? (quote.bid + quote.ask) / 2); this.lastQuoteTs.set(quote.symbol, quote.ts); }
    const now = bar.startMs + bar.intervalMs; const equity = this.markToMarket(); this.updateSession(now, equity);
    if (!quote) return { action: "HOLD", reason: "Quote required for execution" };
    if (this.paused || this.killSwitch) return { action: "HOLD", reason: this.killSwitch ? "Kill switch is active" : "Engine is paused" };
    const features = buildFeatures(this.histories.get(bar.symbol)!, quote, { decisionTimestamp: quote.ts });
    if (!features) return { action: "HOLD", reason: "Warming up" };
    const position = this.broker.openPositions.find((p) => p.symbol === bar.symbol) ?? null;
    const signal = this.strategy.evaluate({ now: features.ts, features, position });
    if (signal.action === "HOLD") return signal;
    const decisionTime = Math.max(now, quote.ts); const intent = signal.action === "EXIT"
      ? { symbol: bar.symbol, side: "SELL" as const, type: "MARKET" as const, quantity: position?.quantity ?? 0, strategyId: this.strategy.id, strategyVersion: this.strategy.version, reason: signal.reason, submittedAt: decisionTime }
      : { symbol: bar.symbol, side: "BUY" as const, type: "MARKET" as const, quantity: Math.floor(10_000 / quote.ask), strategyId: this.strategy.id, strategyVersion: this.strategy.version, reason: signal.reason, submittedAt: decisionTime };
    if (intent.quantity <= 0) return { action: "HOLD", reason: "No executable quantity" };
    this.orderTimes.splice(0, this.orderTimes.length, ...this.orderTimes.filter((ts) => decisionTime - ts < 60_000));
    const state: RiskState = { equity: this.markToMarket(), dayStartEquity: this.dayStartEquity, highWaterMark: this.highWaterMark, openPositions: this.broker.openPositions, ordersInLastMinute: this.orderTimes.length, killSwitch: this.paused || this.killSwitch, marks: Object.fromEntries(this.marks) };
    const decision = this.risk.size(intent, quote.ask, state);
    if (!decision.allowed) return { action: "HOLD", reason: `Risk rejected: ${decision.reason}` };
    this.broker.submit({ ...intent, quantity: decision.quantity, id: `order-${now}-${this.orderSequence++}`, status: "NEW", fills: [] });
    this.orderTimes.push(decisionTime); this.broker.onQuote(quote); return signal;
  }

  portfolioSnapshot(ts: number): PortfolioSnapshot { const equity = this.markToMarket(); return { ts, cash: this.broker.balance, equity, marks: Object.fromEntries(this.marks), grossExposure: this.broker.openPositions.reduce((sum, p) => sum + Math.abs(p.quantity * (this.marks.get(p.symbol) ?? p.averagePrice)), 0), drawdown: this.highWaterMark ? (this.highWaterMark - equity) / this.highWaterMark : 0, dayStartEquity: this.dayStartEquity, highWaterMark: this.highWaterMark }; }
  private markToMarket() { return this.broker.markToMarket(Object.fromEntries(this.marks)); }
  private updateSession(ts: number, equity: number) { if (this.calendar.isRegularSession(ts)) { const key = this.calendar.sessionKey(ts); if (key !== this.dayKey) { this.dayKey = key; this.dayStartEquity = equity; } } this.highWaterMark = Math.max(this.highWaterMark, equity); }
  setOperationalNow(ts: number) { if (!Number.isFinite(ts)) throw new Error("Operational clock must be finite"); this.operationalNowMs = ts; }
  pause() { this.paused = true; }
  resume() { if (!this.killSwitch) this.paused = false; }
  activateKillSwitch() { this.killSwitch = true; this.paused = true; }
  resetKillSwitch() { this.killSwitch = false; }
  get health() { const now = this.operationalNowMs; const quoteTimestamps = Object.fromEntries(this.lastQuoteTs); const staleSymbols = now === undefined ? [] : [...this.lastQuoteTs.entries()].filter(([, ts]) => now - ts > this.maxQuoteAgeMs).map(([symbol]) => symbol); return { paused: this.paused || this.killSwitch, killSwitch: this.killSwitch, dataFresh: this.lastQuoteTs.size > 0 && staleSymbols.length === 0, staleSymbols, lastQuoteTs: quoteTimestamps, symbols: [...this.histories.keys()], bars: [...this.histories.values()].reduce((sum, h) => sum + h.length, 0), balance: this.broker.balance, positions: this.broker.openPositions }; }
}
