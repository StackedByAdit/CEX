import { getToken } from "./auth";
import type {
  Balance,
  Candle,
  CandleInterval,
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
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
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
  return request<{ message: string; token: string }>("/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
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
    `/orderbook/${symbol}`,
  );
}

export async function fetchOrders(status?: string) {
  const query = status ? `?status=${status}` : "";
  const data = await request<{ orders: Order[] }>(`/orders${query}`);
  return data.orders;
}

export async function fetchTrades(symbol: string) {
  const data = await request<{ fills: Fill[] }>(`/trades/${symbol}`);
  return data.fills;
}

export async function fetchTicker(symbol: string) {
  return request<{
    price: number | null;
    change24h: number;
    high24h: number | null;
    low24h: number | null;
    volume24h: number;
  }>(`/ticker/${symbol}`);
}

export async function fetchCandles(symbol: string, interval: CandleInterval) {
  return request<{ candles: Candle[]; current: Candle | null }>(
    `/candles/${symbol}/${interval}`,
  );
}

export async function placeOrder(payload: PlaceOrderPayload) {
  return request<PlaceOrderResponse>("/order", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelOrder(orderId: string) {
  return request<{ message: string }>(`/order/${orderId}`, { method: "DELETE" });
}

export { ApiError };
