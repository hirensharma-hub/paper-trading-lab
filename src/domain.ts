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
