export type Side = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT";
export type OrderStatus = "NEW" | "WORKING" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED" | "REJECTED";

export interface Bar {
  symbol: string;
  startMs: number;
  intervalMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Quote {
  symbol: string;
  ts: number;
  bid: number;
  ask: number;
  bidSize?: number;
  askSize?: number;
  last?: number;
}

export interface EquityObservation { ts: number; value: number; }

export interface MarketMark { symbol: string; price: number; ts: number; }

export interface DataEntitlement {
  dataset: string;
  use: "display" | "non-display-internal";
  realtime: boolean;
  redistribution: boolean;
}

export interface FeatureVector {
  ts: number;
  symbol: string;
  close: number;
  currentHigh?: number;
  currentLow?: number;
  ret1: number;
  ret5: number;
  emaFast: number;
  emaSlow: number;
  emaFastDistance: number;
  emaSlowDistance: number;
  rsi14: number;
  realisedVol20: number;
  volumeZ: number;
  spreadBps?: number;
  bookImbalance?: number;
}

export type Signal =
  | { action: "HOLD"; reason: string }
  | { action: "ENTER_LONG"; stopPrice?: number; reason: string }
  | { action: "EXIT"; reason: string };

export interface Position {
  symbol: string;
  quantity: number;
  averagePrice: number;
  realisedPnl: number;
  entryFees: number;
  entryTimestamp?: number;
  entryModelProbability?: number;
  entryRegime?: string;
  entryPatterns?: readonly string[];
}

export interface Fill {
  id: string;
  orderId: string;
  ts: number;
  quantity: number;
  price: number;
  fee: number;
}

export interface PaperOrder {
  id: string;
  symbol: string;
  side: Side;
  type: OrderType;
  quantity: number;
  limitPrice?: number;
  status: OrderStatus;
  strategyId: string;
  strategyVersion: string;
  reason: string;
  submittedAt?: number;
  fills: Fill[];
  rejectionReason?: string;
}

export interface OrderIntent {
  symbol: string;
  side: Side;
  type: OrderType;
  quantity: number;
  limitPrice?: number;
  strategyId: string;
  strategyVersion: string;
  reason: string;
  submittedAt: number;
}

export interface PortfolioSnapshot {
  ts: number;
  cash: number;
  equity: number;
  marks: Readonly<Record<string, number>>;
  grossExposure: number;
  drawdown: number;
  dayStartEquity: number;
  highWaterMark: number;
}

export interface ClosedTrade {
  tradeId: string;
  symbol: string;
  strategyId: string;
  strategyVersion: string;
  entryTimestamp: number;
  exitTimestamp: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  grossPnl: number;
  entryFees: number;
  exitFees: number;
  netPnl: number;
  holdingPeriodMs: number;
  entryRegime?: string;
  exitRegime?: string;
  entryPatterns?: readonly string[];
  exitPatterns?: readonly string[];
  mfePerShare?: number;
  maePerShare?: number;
}

export type DataQualityIssueCode = "INVALID_OHLC" | "INVALID_VOLUME" | "INVALID_TIMESTAMP" | "DUPLICATE_BAR" | "TIME_GAP" | "MISSING_FIELD" | "INVALID_INTERVAL";
export interface DataQualityIssue { row: number; code: DataQualityIssueCode; message: string; }
export interface DataQualityReport { totalRows: number; acceptedRows: number; rejectedRows: number; duplicates: number; timeGaps: number; invalidOhlc: number; invalidVolume: number; invalidTimestampRows: number; invalidIntervalRows: number; missingFieldRows: number; globalStart?: number; globalEnd?: number; start?: number; end?: number; symbols: readonly string[]; issues: readonly DataQualityIssue[]; }
