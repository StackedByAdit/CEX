import { useCallback, useEffect, useRef, useState } from "react";
import Footer from "../components/layout/Footer";
import Navbar from "../components/layout/Navbar";
import Sidebar from "../components/layout/Sidebar";
import KLineChart from "../components/trading/KLineChart";
import OrderBook from "../components/trading/OrderBook";
import OrderForm from "../components/trading/OrderForm";
import OrdersPanel from "../components/trading/OrdersPanel";
import TickerBar from "../components/trading/TickerBar";
import {
  fetchBalances,
  fetchOrderbook,
  fetchOrders,
  fetchStocks,
  fetchTicker,
  fetchPersonalTrades,
} from "../lib/api";
import { orbitWs } from "../lib/ws";
import { levelsFromWsBook } from "../lib/orderbook";
import { toPrice } from "../lib/format";
import type {
  Balance,
  Fill,
  Order,
  OrderbookLevel,
  OrderSide,
  OrderType,
  PlaceOrderResponse,
  Stock,
  WsMessage,
} from "../types";

function buildLevels(
  book: Record<string, number>,
  ascending: boolean,
): OrderbookLevel[] {
  const entries = Object.entries(book)
    .filter(([, amount]) => amount > 0)
    .map(([price, amount]) => ({
      price: parseFloat(price),
      amount,
      total: 0,
    }));

  entries.sort((a, b) => (ascending ? a.price - b.price : b.price - a.price));

  let cumulative = 0;
  return entries.map((entry) => {
    cumulative += entry.price * entry.amount;
    return { ...entry, total: cumulative };
  });
}

export default function TradePage() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [symbol, setSymbol] = useState("AXIS");
  const [asks, setAsks] = useState<OrderbookLevel[]>([]);
  const [bids, setBids] = useState<OrderbookLevel[]>([]);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [change24h, setChange24h] = useState(0);
  const [high24h, setHigh24h] = useState<number | null>(null);
  const [low24h, setLow24h] = useState<number | null>(null);
  const [volume24h, setVolume24h] = useState(0);
  const [balances, setBalances] = useState<Record<string, Balance>>({});
  const [orders, setOrders] = useState<Order[]>([]);
  const [personalTrades, setPersonalTrades] = useState<Fill[]>([]);
  const tradeRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickerRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const symbolRef = useRef(symbol);
  useEffect(() => { symbolRef.current = symbol; }, [symbol]);

  const loadOrderbook = useCallback(async (sym: string) => {
    try {
      const data = await fetchOrderbook(sym);
      setAsks(buildLevels(data.asks, true));
      setBids(buildLevels(data.bids, false));
    } catch {
      /* keep existing orderbook on transient errors */
    }
  }, []);

  const refreshOrders = useCallback(async () => {
    try {
      const data = await fetchOrders();
      setOrders(data);
    } catch {
      /* keep existing orders on transient errors */
    }
  }, []);


  const refreshPersonalTrades = useCallback(async () => {
    try {
      const data = await fetchPersonalTrades();
      setPersonalTrades(data);
    } catch {
      /* keep existing personal trades on transient errors */
    }
  }, []);

  const refreshBalances = useCallback(async () => {
    try {
      const data = await fetchBalances();
      setBalances(data);
    } catch {
      /* keep existing */
    }
  }, []);

  const loadTicker = useCallback(async (sym: string) => {
    try {
      const ticker = await fetchTicker(sym);
      setLastPrice(toPrice(ticker.price));
      setChange24h(ticker.change24h);
      setHigh24h(toPrice(ticker.high24h));
      setLow24h(toPrice(ticker.low24h));
      setVolume24h(ticker.volume24h);
    } catch {
      /* keep existing ticker on transient errors */
    }
  }, []);

  useEffect(() => {
    fetchStocks()
      .then((s) => {
        setStocks(s);
        if (s.length > 0) {
          setSymbol((current) => (s.find((x) => x.symbol === current) ? current : s[0]!.symbol));
        }
      })
      .catch(() => {});

    orbitWs.connect();
    return () => orbitWs.disconnect();
  }, []);

  useEffect(() => {
    loadOrderbook(symbol);
    refreshOrders();
    refreshPersonalTrades();
    refreshBalances();
    loadTicker(symbol);

    orbitWs.subscribeOrderbook(symbol);
    orbitWs.subscribeCandle(symbol);

    return () => {
      orbitWs.unsubscribeOrderbook(symbol);
      orbitWs.unsubscribeCandle(symbol);
    };
  }, [
    symbol,
    loadOrderbook,
    refreshOrders,
    refreshPersonalTrades,
    refreshBalances,
    loadTicker,
  ]);

  useEffect(() => {
    const unsub = orbitWs.subscribe((msg: WsMessage) => {
      if (msg.type === "TRADE" && msg.symbol === symbolRef.current) {
        setLastPrice(toPrice(msg.price));

        if (tradeRefreshTimer.current) clearTimeout(tradeRefreshTimer.current);
        tradeRefreshTimer.current = setTimeout(() => {
          refreshPersonalTrades();
          refreshOrders();
        }, 100);

        if (tickerRefreshTimer.current) clearTimeout(tickerRefreshTimer.current);
        tickerRefreshTimer.current = setTimeout(() => {
          loadTicker(symbolRef.current);
        }, 250);
      }

      if (
        (msg.type === "ORDERBOOK_SNAPSHOT" || msg.type === "ORDERBOOK_UPDATE") &&
        msg.symbol === symbolRef.current
      ) {
        const { bids, asks } = levelsFromWsBook(msg.bids, msg.asks);
        setBids(bids);
        setAsks(asks);
      }

      if (msg.type === "BALANCE_SNAPSHOT" || msg.type === "BALANCE_UPDATE") {
        setBalances(msg.balances);
      }
    });

    return () => {
      unsub();
      if (tradeRefreshTimer.current) clearTimeout(tradeRefreshTimer.current);
      if (tickerRefreshTimer.current) clearTimeout(tickerRefreshTimer.current);
    };
  }, [refreshPersonalTrades, refreshOrders, loadTicker]);

  const handleSymbolChange = useCallback((sym: string) => {
    setSymbol(sym);
  }, []);

  const handleOrderPlaced = useCallback(
    (
      _result: PlaceOrderResponse,
      meta: { symbol: string; side: OrderSide; type: OrderType; quantity: number; price?: number },
    ) => {
      void refreshOrders();
      void refreshPersonalTrades();
      void refreshBalances();
      void loadOrderbook(meta.symbol);
    },
    [refreshOrders, refreshPersonalTrades, refreshBalances, loadOrderbook],
  );

  return (
    // Full-height flex column — no overflow so inner panels scroll independently.
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "#0a0a0a" }}>
      <Navbar />

      {/* Main area: sidebar + content */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
        <Sidebar />

        {/* Content: ticker + trading grid + orders panel */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
          <TickerBar
            symbol={symbol}
            stocks={stocks}
            lastPrice={lastPrice}
            change24h={change24h}
            high24h={high24h}
            low24h={low24h}
            volume24h={volume24h}
            onSymbolChange={handleSymbolChange}
          />

          {/* 3-column trading grid: orderbook | chart | order form */}
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 260px", flex: 1, minHeight: 0, overflow: "hidden" }}>
            {/* Left: order book */}
            <div style={{ borderRight: "1px solid #262626", minHeight: 0, overflow: "hidden" }}>
              <OrderBook asks={asks} bids={bids} lastPrice={lastPrice} />
            </div>

            {/* Center: chart fills all remaining space */}
            <div style={{ minHeight: 0, minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <KLineChart symbol={symbol} />
            </div>

            {/* Right: order form */}
            <div style={{ borderLeft: "1px solid #262626", minHeight: 0, overflow: "hidden" }}>
              <OrderForm
                symbol={symbol}
                lastPrice={lastPrice}
                balances={balances}
                asks={asks}
                bids={bids}
                onOrderPlaced={handleOrderPlaced}
              />
            </div>
          </div>

          {/* Bottom: orders / trade history panel */}
          <div style={{ height: 180, flexShrink: 0, borderTop: "1px solid #262626" }}>
            <OrdersPanel
              orders={orders}
              trades={personalTrades}
              balances={balances}
              stocks={stocks}
              onRefresh={() => {
                refreshOrders();
                refreshPersonalTrades();
                refreshBalances();
                loadOrderbook(symbol);
              }}
              onOrderCancelled={(orderId) => {
                setOrders((prev) =>
                  prev.map((order) =>
                    order.id === orderId ? { ...order, status: "CANCELLED" } : order,
                  ),
                );
                refreshPersonalTrades();
              }}
            />
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
