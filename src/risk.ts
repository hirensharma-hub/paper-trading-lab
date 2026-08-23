import type { OrderIntent, Position } from "./domain";

export interface RiskConfig {
  maxPositionValue: number;
  maxGrossExposure: number;
  maxDailyLoss: number;
  maxDrawdown: number;
  maxOrdersPerMinute: number;
  feeBps: number;
}

export interface RiskState {
  equity: number;
  dayStartEquity: number;
  highWaterMark: number;
  openPositions: readonly Position[];
  ordersInLastMinute: number;
  killSwitch: boolean;
  marks: Readonly<Record<string, number>>;
}

export type RiskDecision = { allowed: true; quantity: number } | { allowed: false; reason: string };

export class RiskManager {
  constructor(private readonly config: RiskConfig) {}

  size(intent: OrderIntent, referencePrice: number, state: RiskState): RiskDecision {
    if (state.killSwitch) return { allowed: false, reason: "Kill switch is active" };
    if (state.ordersInLastMinute >= this.config.maxOrdersPerMinute) return { allowed: false, reason: "Order-rate limit exceeded" };
    if (state.dayStartEquity - state.equity >= this.config.maxDailyLoss) return { allowed: false, reason: "Daily loss limit exceeded" };
    if (state.highWaterMark - state.equity >= this.config.maxDrawdown) return { allowed: false, reason: "Drawdown limit exceeded" };
    if (!Number.isFinite(referencePrice) || referencePrice <= 0) return { allowed: false, reason: "Invalid reference price" };
    const marks = { ...state.marks, [intent.symbol]: state.marks[intent.symbol] ?? referencePrice };
    const missingMark = state.openPositions.find((p) => !Number.isFinite(marks[p.symbol]) || marks[p.symbol] <= 0);
    if (missingMark) return { allowed: false, reason: `Missing mark for ${missingMark.symbol}` };
    const currentGross = state.openPositions.reduce((sum, p) => sum + Math.abs(p.quantity * marks[p.symbol]), 0);
    const reducingQuantity = intent.side === "SELL"
      ? state.openPositions.find((p) => p.symbol === intent.symbol)?.quantity ?? 0
      : 0;
    // Closing an existing long must remain possible even when exposure is at its cap.
    const headroom = Math.min(this.config.maxPositionValue, Math.max(0, this.config.maxGrossExposure - currentGross) + reducingQuantity * marks[intent.symbol]);
    const quantity = Math.floor(Math.min(intent.quantity, headroom / referencePrice, reducingQuantity || Number.POSITIVE_INFINITY));
    return quantity > 0 ? { allowed: true, quantity } : { allowed: false, reason: "Exposure limit leaves no order capacity" };
  }
}
