import { buildFeatures } from "./features";
import type { Bar, Quote, Signal } from "./domain";
import { PaperBroker } from "./broker";
import { RiskManager, type RiskState } from "./risk";
import type { Strategy } from "./strategy";

export class ResearchEngine {
  private readonly bars: Bar[] = [];
  private lastEquity: number;
  private ordersInLastMinute = 0;
  private killSwitch = false;

  constructor(private readonly strategy: Strategy, private readonly broker: PaperBroker, private readonly risk: RiskManager) {
    this.lastEquity = broker.balance;
  }

  onBar(bar: Bar, quote?: Quote): Signal {
    if (bar.symbol !== quote?.symbol && quote) return { action: "HOLD", reason: "Symbol mismatch" };
    this.bars.push(bar);
    const features = buildFeatures(this.bars, quote);
    if (!features || this.killSwitch) return { action: "HOLD", reason: this.killSwitch ? "Kill switch is active" : "Warming up" };
    const position = this.broker.openPositions.find((p) => p.symbol === bar.symbol) ?? null;
    const signal = this.strategy.evaluate({ now: features.ts, features, position });
    if (signal.action === "HOLD" || !quote) return signal;
    const intent = signal.action === "EXIT"
      ? { symbol: bar.symbol, side: "SELL" as const, type: "MARKET" as const, quantity: position?.quantity ?? 0, strategyId: this.strategy.id, strategyVersion: this.strategy.version, reason: signal.reason }
      : { symbol: bar.symbol, side: "BUY" as const, type: "MARKET" as const, quantity: Math.floor(10_000 / quote.ask), strategyId: this.strategy.id, strategyVersion: this.strategy.version, reason: signal.reason };
    if (intent.quantity <= 0) return { action: "HOLD", reason: "No position or insufficient buying power" };
    const state: RiskState = { equity: this.broker.markToMarket({ [bar.symbol]: quote.last ?? quote.bid }), dayStartEquity: this.lastEquity, highWaterMark: Math.max(this.lastEquity, this.broker.markToMarket({ [bar.symbol]: quote.last ?? quote.bid })), openPositions: this.broker.openPositions, ordersInLastMinute: this.ordersInLastMinute, killSwitch: this.killSwitch };
    const decision = this.risk.size(intent, quote.ask, state);
    if (!decision.allowed) return { action: "HOLD", reason: `Risk rejected: ${decision.reason}` };
    this.broker.submit({ ...intent, quantity: decision.quantity, id: `order-${features.ts}-${this.ordersInLastMinute}`, status: "NEW", fills: [] });
    this.ordersInLastMinute++;
    this.broker.onQuote(quote);
    return signal;
  }

  pause() { this.killSwitch = true; }
  resume() { this.killSwitch = false; }
  get health() { return { paused: this.killSwitch, bars: this.bars.length, balance: this.broker.balance, positions: this.broker.openPositions }; }
}
