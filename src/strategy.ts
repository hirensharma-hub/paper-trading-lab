import type { FeatureVector, Position, Signal } from "./domain";

export interface StrategyContext {
  now: number;
  features: FeatureVector;
  position: Position | null;
}

export interface Strategy {
  readonly id: string;
  readonly version: string;
  evaluate(ctx: StrategyContext): Signal;
}

/** Auditable baseline: long-only EMA trend confirmation with a neutral warm-up. */
export class EmaCrossStrategy implements Strategy {
  readonly id = "ema-cross";
  readonly version = "1.0.0";

  evaluate({ features, position }: StrategyContext): Signal {
    if (![features.emaFast, features.emaSlow, features.rsi14].every(Number.isFinite)) {
      return { action: "HOLD", reason: "Insufficient feature history" };
    }
    if (!position && features.emaFast > features.emaSlow && features.rsi14 < 75) {
      return { action: "ENTER_LONG", confidence: 0.5, reason: "Fast EMA above slow EMA with non-extreme RSI" };
    }
    if (position && features.emaFast < features.emaSlow) {
      return { action: "EXIT", reason: "Fast EMA crossed below slow EMA" };
    }
    return { action: "HOLD", reason: "No state transition" };
  }
}
