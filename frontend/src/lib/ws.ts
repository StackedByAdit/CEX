import { isAuthenticated } from "./auth";
import type { WsMessage } from "../types";

function getWsUrl(): string {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

type MessageHandler = (msg: WsMessage) => void;

export class OrbitWebSocket {
  private ws: WebSocket | null = null;
  private handlers = new Set<MessageHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  private orderbookSymbol: string | null = null;
  private candleSub: { symbol: string; interval: string } | null = null;

  connect() {
    if (!isAuthenticated()) return;

    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    this.shouldReconnect = true;
    this.ws = new WebSocket(getWsUrl());

    this.ws.onopen = () => {
      this.send({ type: "GET_BALANCE" });
      this.resubscribe();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsMessage;
        this.handlers.forEach((h) => h(msg));
      } catch {
        /* ignore malformed */
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => this.connect(), 2000);
      }
    };
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private resubscribe() {
    if (this.orderbookSymbol) {
      this.send({ type: "SUBSCRIBE_ORDERBOOK", symbol: this.orderbookSymbol });
    }
    if (this.candleSub) {
      this.send({
        type: "SUBSCRIBE_CANDLE",
        symbol: this.candleSub.symbol,
        interval: this.candleSub.interval,
      });
    }
  }

  subscribe(handler: MessageHandler) {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  send(data: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  subscribeOrderbook(symbol: string) {
    this.orderbookSymbol = symbol;
    this.send({ type: "SUBSCRIBE_ORDERBOOK", symbol });
  }

  unsubscribeOrderbook(symbol: string) {
    if (this.orderbookSymbol === symbol) {
      this.orderbookSymbol = null;
    }
    this.send({ type: "UNSUBSCRIBE_ORDERBOOK", symbol });
  }

  subscribeCandle(symbol: string, interval: string) {
    this.candleSub = { symbol, interval };
    this.send({ type: "SUBSCRIBE_CANDLE", symbol, interval });
  }

  unsubscribeCandle(symbol: string, interval: string) {
    if (this.candleSub?.symbol === symbol && this.candleSub.interval === interval) {
      this.candleSub = null;
    }
    this.send({ type: "UNSUBSCRIBE_CANDLE", symbol, interval });
  }

  requestBalance() {
    this.send({ type: "GET_BALANCE" });
  }
}

export const orbitWs = new OrbitWebSocket();
