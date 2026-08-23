export type FeatureCategory = "RETURNS" | "TREND" | "MOMENTUM" | "VOLATILITY" | "VOLUME" | "MICROSTRUCTURE" | "STRUCTURE";
export interface FeatureMetadata { id: string; name: string; version: string; category: FeatureCategory; description: string; lookback: number; parameters: Readonly<Record<string, number | string | boolean>>; requiredInputs: readonly string[]; units: string; }
export const featureRegistry: readonly FeatureMetadata[] = [
  { id: "return-1", name: "One-bar log return", version: "1.0.0", category: "RETURNS", description: "Log return between the latest close and the previous close.", lookback: 2, parameters: {}, requiredInputs: ["close"], units: "log-return" },
  { id: "ema-distance-fast", name: "Fast EMA distance", version: "1.0.0", category: "TREND", description: "Relative distance between close and the fast EMA.", lookback: 5, parameters: { period: 5 }, requiredInputs: ["close"], units: "ratio" },
  { id: "rsi-14", name: "RSI", version: "1.0.0", category: "MOMENTUM", description: "Wilder-style relative strength index over 14 observations.", lookback: 15, parameters: { period: 14 }, requiredInputs: ["close"], units: "0-100" },
  { id: "realised-volatility-20", name: "Realised volatility", version: "1.0.0", category: "VOLATILITY", description: "Annualised standard deviation of recent log returns using the configured interval.", lookback: 21, parameters: { period: 20 }, requiredInputs: ["close", "intervalMs"], units: "annualised-ratio" },
  { id: "volume-z-20", name: "Volume z-score", version: "1.0.0", category: "VOLUME", description: "Latest volume relative to its recent rolling mean and standard deviation.", lookback: 20, parameters: { period: 20 }, requiredInputs: ["volume"], units: "z-score" },
  { id: "spread-bps", name: "Quoted spread", version: "1.0.0", category: "MICROSTRUCTURE", description: "Bid/ask spread expressed in basis points of the midpoint.", lookback: 1, parameters: {}, requiredInputs: ["bid", "ask"], units: "basis-points" },
  { id: "book-imbalance", name: "Top-of-book imbalance", version: "1.0.0", category: "MICROSTRUCTURE", description: "Bid size minus ask size divided by total displayed size.", lookback: 1, parameters: {}, requiredInputs: ["bidSize", "askSize"], units: "-1-to-1" }
];
export function getFeatureMetadata(id: string) { return featureRegistry.find((feature) => feature.id === id); }
