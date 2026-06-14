export type OrderSide = "BUY" | "SELL";
export type OrderType = "LIMIT" | "MARKET";
export type OrderStatus = "PENDING" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED";
export type CandleInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export const CANDLE_INTERVALS: CandleInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

export interface Stock {
  id: string;
  title: string;
  symbol: string;
}

export interface Balance {
  available: number;
  locked: number;
  balanceId?: string;
}

export interface Order {
  id: string;
  userId: string;
  stockId: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  price: string | number | null;
  quantity: string | number;
  filledQuantity: string | number;
  createdAt: string;
  updatedAt: string;
}

export interface Fill {
  id: string;
  stockId: string;
  buyOrderId: string;
  sellOrderId: string;
  price: string | number;
  quantity: string | number;
  createdAt: string;
}

export interface Candle {
  symbol: string;
  interval: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  startTime: number | string;
}

export interface OrderbookLevel {
  price: number;
  amount: number;
  total: number;
}

export interface PlaceOrderPayload {
  side: OrderSide;
  type: OrderType;
  symbol: string;
  price?: number;
  quantity: number;
}

export interface PlaceOrderResponse {
  orderId: string;
  status: OrderStatus;
  filledQuantity: number;
  remainingQuantity: number;
  fills: unknown[];
}

export type WsMessage =
  | { type: "ORDERBOOK_SNAPSHOT"; symbol: string; bids: Record<string, MemoryOrder[]>; asks: Record<string, MemoryOrder[]> }
  | { type: "ORDERBOOK_UPDATE"; symbol: string; side: "bid" | "ask"; price: number; action: "add" | "remove" | "update"; quantity?: number }
  | { type: "TRADE"; symbol: string; price: number; quantity: number; timestamp: number }
  | { type: "BALANCE_SNAPSHOT"; balances: Record<string, Balance> }
  | { type: "BALANCE_UPDATE"; balances: Record<string, Balance> }
  | { type: "CANDLE_SNAPSHOT"; symbol: string; interval: string; open: number; high: number; low: number; close: number; volume: number; startTime: number }
  | { type: "CANDLE_UPDATE"; symbol: string; interval: string; open: number; high: number; low: number; close: number; volume: number; startTime: number }
  | { type: "ERROR"; message: string };

export interface MemoryOrder {
  id: string;
  userId: string;
  side: OrderSide;
  type: OrderType;
  symbol: string;
  price?: number;
  quantity: number;
  filledQuantity: number;
  status: OrderStatus;
}
