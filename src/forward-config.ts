import { TradingCalendar, exchangeCalendarSpec, type TradingCalendarConfig } from "./calendar";
import { ExecutionCostModel } from "./costs";

export const FORWARD_RUNTIME_MODE = "FORWARD_PAPER" as const;
export const FORWARD_SYMBOL = "AMZN" as const;
export const FORWARD_INTERVAL = "5m" as const;
export const FORWARD_INTERVAL_MS = 300_000;
export const FORWARD_FEATURE_SET_VERSION = "baseline-ohlcv-v2";
export const FORWARD_TARGET_VERSION = "forward-close-1-v1";

export interface ForwardPaperConfig {
  runtimeMode: typeof FORWARD_RUNTIME_MODE; paperOnly: true; broker: "INTERNAL_PAPER_BROKER"; externalExecutionEnabled: false;
  symbol: typeof FORWARD_SYMBOL; interval: typeof FORWARD_INTERVAL; intervalMs: number; forwardStartTimestamp?: number;
  runtimeDataDir: string; initialCash: number; apiHost: string; apiPort: number; apiToken?: string;
  minNewBinaryExperiencesForTraining: number; challengerEvaluationSessions: number; memoryWarningMb: number;
  probabilityThreshold: number; maxPositionValue: number; maxGrossExposure: number; maxDailyLoss: number; maxDrawdown: number; maxOrdersPerMinute: number;
  feeBps: number; slippageBps: number; entryFeeBps: number; exitFeeBps: number; entrySlippageBps: number; exitSlippageBps: number;
  calendar: TradingCalendar; calendarConfig: TradingCalendarConfig; calendarSpecVersion: string; calendarSpecHash: string;
}

function positive(name: string, raw: string | undefined, fallback: number): number { const value = raw === undefined || raw === "" ? fallback : Number(raw); if (!Number.isFinite(value) || value <= 0) throw new Error(`${name}_MUST_BE_POSITIVE`); return value; }
function nonNegative(name: string, raw: string | undefined, fallback: number): number { const value = raw === undefined || raw === "" ? fallback : Number(raw); if (!Number.isFinite(value) || value < 0) throw new Error(`${name}_MUST_BE_NON_NEGATIVE`); return value; }

export function loadForwardConfig(env: NodeJS.ProcessEnv = process.env, overrides: Partial<ForwardPaperConfig> = {}): ForwardPaperConfig {
  for (const forbidden of ["LIVE_TRADING", "REAL_TRADING", "EXTERNAL_EXECUTION_ENABLED", "BROKER_API_KEY", "BROKER_API_SECRET", "BROKER_URL"]) if (env[forbidden]?.trim() && env[forbidden] !== "false") throw new Error(`FORWARD_RUNTIME_FORBIDDEN_CONFIGURATION:${forbidden}`);
  const start = env.FORWARD_START_TIMESTAMP?.trim(); const forwardStartTimestamp = start ? Date.parse(start) : undefined;
  if (start && !Number.isFinite(forwardStartTimestamp)) throw new Error("FORWARD_START_TIMESTAMP_INVALID");
  const calendarConfig: TradingCalendarConfig = { timeZone: "America/New_York" };
  const spec = exchangeCalendarSpec(calendarConfig);
  const config: ForwardPaperConfig = {
    runtimeMode: FORWARD_RUNTIME_MODE, paperOnly: true, broker: "INTERNAL_PAPER_BROKER", externalExecutionEnabled: false,
    symbol: FORWARD_SYMBOL, interval: FORWARD_INTERVAL, intervalMs: FORWARD_INTERVAL_MS, forwardStartTimestamp,
    runtimeDataDir: env.PAPER_RUNTIME_DATA_DIR?.trim() || "./runtime-data", initialCash: positive("PAPER_INITIAL_CASH", env.PAPER_INITIAL_CASH, 100_000),
    apiHost: env.PAPER_API_HOST?.trim() || "127.0.0.1", apiPort: positive("PAPER_API_PORT", env.PAPER_API_PORT, 3001), apiToken: env.PAPER_API_TOKEN?.trim() || undefined,
    minNewBinaryExperiencesForTraining: positive("MIN_NEW_BINARY_EXPERIENCES_FOR_TRAINING", env.MIN_NEW_BINARY_EXPERIENCES_FOR_TRAINING, 390), challengerEvaluationSessions: positive("CHALLENGER_EVALUATION_SESSIONS", env.CHALLENGER_EVALUATION_SESSIONS, 5), memoryWarningMb: positive("PAPER_MEMORY_WARNING_MB", env.PAPER_MEMORY_WARNING_MB, 750),
    probabilityThreshold: nonNegative("PAPER_PROBABILITY_THRESHOLD", env.PAPER_PROBABILITY_THRESHOLD, 0.60), maxPositionValue: positive("PAPER_MAX_POSITION_VALUE", env.PAPER_MAX_POSITION_VALUE, 10_000), maxGrossExposure: positive("PAPER_MAX_GROSS_EXPOSURE", env.PAPER_MAX_GROSS_EXPOSURE, 10_000), maxDailyLoss: positive("PAPER_MAX_DAILY_LOSS", env.PAPER_MAX_DAILY_LOSS, 2_000), maxDrawdown: positive("PAPER_MAX_DRAWDOWN", env.PAPER_MAX_DRAWDOWN, 5_000), maxOrdersPerMinute: positive("PAPER_MAX_ORDERS_PER_MINUTE", env.PAPER_MAX_ORDERS_PER_MINUTE, 6),
    feeBps: nonNegative("PAPER_FEE_BPS", env.PAPER_FEE_BPS, 1), slippageBps: nonNegative("PAPER_SLIPPAGE_BPS", env.PAPER_SLIPPAGE_BPS, 2), entryFeeBps: nonNegative("PAPER_ENTRY_FEE_BPS", env.PAPER_ENTRY_FEE_BPS, 1), exitFeeBps: nonNegative("PAPER_EXIT_FEE_BPS", env.PAPER_EXIT_FEE_BPS, 1), entrySlippageBps: nonNegative("PAPER_ENTRY_SLIPPAGE_BPS", env.PAPER_ENTRY_SLIPPAGE_BPS, 2), exitSlippageBps: nonNegative("PAPER_EXIT_SLIPPAGE_BPS", env.PAPER_EXIT_SLIPPAGE_BPS, 2),
    calendar: new TradingCalendar(calendarConfig), calendarConfig, calendarSpecVersion: spec.version, calendarSpecHash: spec.contentHash,
  };
  return { ...config, ...overrides, runtimeMode: FORWARD_RUNTIME_MODE, paperOnly: true, broker: "INTERNAL_PAPER_BROKER", externalExecutionEnabled: false };
}

export function forwardCosts(config: ForwardPaperConfig) { return new ExecutionCostModel({ spreadBps: 2, entrySlippageBps: config.entrySlippageBps, exitSlippageBps: config.exitSlippageBps, entryFeeBps: config.entryFeeBps, exitFeeBps: config.exitFeeBps }); }
