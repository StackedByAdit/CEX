import { clearAuth } from "./auth";
import type {
  Balance,
  Fill,
  Order,
  PlaceOrderPayload,
  PlaceOrderResponse,
  Stock,
} from "../types";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(path, { ...options, headers, credentials: "include" });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401) {
      clearAuth();
    }
    throw new ApiError(data.message ?? data.msg ?? "Request failed", res.status);
  }

  return data as T;
}

export async function signup(username: string, password: string) {
  return request<{ message: string; userId: string }>("/signup", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function login(username: string, password: string) {
  return request<{ message: string; username: string }>("/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function logout() {
  return request<{ message: string }>("/logout", { method: "POST" });
}

export async function fetchStocks() {
  const data = await request<{ stocks: Stock[] }>("/stocks");
  return data.stocks;
}

export async function fetchBalances() {
  const data = await request<{ balances: Record<string, Balance> }>("/balance");
  return data.balances;
}

export async function fetchOrderbook(symbol: string) {
  return request<{ bids: Record<string, number>; asks: Record<string, number> }>(
    `/orderbook/${encodeURIComponent(symbol)}`,
  );
}

export async function fetchOrders(status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const data = await request<{ orders: Order[] }>(`/orders${query}`);
  return data.orders;
}

export async function fetchTrades(symbol: string) {
  const data = await request<{ fills: Fill[] }>(`/trades/${encodeURIComponent(symbol)}`);
  return data.fills;
}

export async function fetchPersonalTrades() {
  const data = await request<{ fills: Fill[] }>("/trades/personal");
  return data.fills;
}

export async function fetchTicker(symbol: string) {
  return request<{
    price: number | null;
    change24h: number;
    high24h: number | null;
    low24h: number | null;
    volume24h: number;
  }>(`/ticker/${encodeURIComponent(symbol)}`);
}

export interface CandleBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function fetchCandles(symbol: string, interval: string): Promise<CandleBar[]> {
  const data = await request<{
    candles: { open: number; high: number; low: number; close: number; volume: number; startTime: number }[];
    current: { open: number; high: number; low: number; close: number; volume: number; startTime: number } | null;
  }>(`/candles/${encodeURIComponent(symbol)}/${encodeURIComponent(interval)}`);

  const bars: CandleBar[] = data.candles.map((c) => ({
    timestamp: typeof c.startTime === "number" && c.startTime < 1_000_000_000_000
      ? c.startTime * 1000
      : c.startTime,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));

  if (data.current) {
    const c = data.current;
    const ts = typeof c.startTime === "number" && c.startTime < 1_000_000_000_000
      ? c.startTime * 1000
      : c.startTime;
    if (!bars.some((b) => b.timestamp === ts)) {
      bars.push({ timestamp: ts, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
    }
  }

  return bars.sort((a, b) => a.timestamp - b.timestamp);
}

export async function placeOrder(payload: PlaceOrderPayload) {
  return request<PlaceOrderResponse>("/order", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelOrder(orderId: string) {
  return request<{ message: string }>(`/order/${encodeURIComponent(orderId)}`, { method: "DELETE" });
}

export { ApiError };
