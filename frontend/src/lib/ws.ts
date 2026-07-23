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
  private candleSymbol: string | null = null;

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
    if (this.candleSymbol) {
      this.send({ type: "SUBSCRIBE_CANDLE", symbol: this.candleSymbol, interval: "1m" });
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

  subscribeCandle(symbol: string) {
    this.candleSymbol = symbol;
    this.send({ type: "SUBSCRIBE_CANDLE", symbol, interval: "1m" });
  }

  unsubscribeCandle(symbol: string) {
    if (this.candleSymbol === symbol) {
      this.candleSymbol = null;
    }
    this.send({ type: "UNSUBSCRIBE_CANDLE", symbol, interval: "1m" });
  }

  requestBalance() {
    this.send({ type: "GET_BALANCE" });
  }
}

export const orbitWs = new OrbitWebSocket();
