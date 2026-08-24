export interface ExecutionCostModelConfig { spreadBps: number; entrySlippageBps: number; exitSlippageBps: number; entryFeeBps: number; exitFeeBps: number; }
export class ExecutionCostModel {
  constructor(readonly config: ExecutionCostModelConfig) { if (Object.values(config).some((value) => !Number.isFinite(value) || value < 0)) throw new Error("Execution costs must be finite and non-negative"); }
  roundTripCost(price: number): number { return price * (this.config.spreadBps / 10_000 + (this.config.entrySlippageBps + this.config.exitSlippageBps + this.config.entryFeeBps + this.config.exitFeeBps) / 10_000); }
  entryPrice(mid: number, side: "BUY" | "SELL") { return mid * (1 + (side === "BUY" ? 1 : -1) * (this.config.spreadBps / 20_000 + this.config.entrySlippageBps / 10_000)); }
}
