export interface ExecutionCostModelConfig { spreadBps: number; entrySlippageBps: number; exitSlippageBps: number; entryFeeBps: number; exitFeeBps: number; }
export class ExecutionCostModel {
  constructor(readonly config: ExecutionCostModelConfig) { if (Object.values(config).some((value) => !Number.isFinite(value) || value < 0)) throw new Error("Execution costs must be finite and non-negative"); }
  roundTripCost(price: number): number { return price * (this.config.spreadBps / 10_000 + (this.config.entrySlippageBps + this.config.exitSlippageBps + this.config.entryFeeBps + this.config.exitFeeBps) / 10_000); }
  estimateEntry(mid: number, side: "BUY" | "SELL") { return mid * (1 + (side === "BUY" ? 1 : -1) * (this.config.spreadBps / 20_000 + this.config.entrySlippageBps / 10_000)); }
  estimateExit(mid: number, side: "BUY" | "SELL") { return mid * (1 + (side === "BUY" ? 1 : -1) * (this.config.spreadBps / 20_000 + this.config.exitSlippageBps / 10_000)); }
  estimateRoundTrip(mid: number, notional: number, side: "BUY" | "SELL" = "BUY"): { currency: number; returnUnits: number; entryPrice: number; exitPrice: number } { if (!Number.isFinite(mid) || !Number.isFinite(notional) || mid <= 0 || notional <= 0) throw new Error("Cost estimate requires positive price and notional"); const entryPrice = this.estimateEntry(mid, side); const exitPrice = this.estimateExit(mid, side === "BUY" ? "SELL" : "BUY"); const currency = notional * (this.config.spreadBps + this.config.entrySlippageBps + this.config.exitSlippageBps + this.config.entryFeeBps + this.config.exitFeeBps) / 10_000; return { currency, returnUnits: currency / notional, entryPrice, exitPrice }; }
  estimate(mid: number, notional: number, side: "BUY" | "SELL" = "BUY") { return this.estimateRoundTrip(mid, notional, side); }
  entryPrice(mid: number, side: "BUY" | "SELL") { return this.estimateEntry(mid, side); }
}
