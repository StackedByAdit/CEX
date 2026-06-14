import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Footer from "../components/layout/Footer";
import Navbar from "../components/layout/Navbar";
import Sidebar from "../components/layout/Sidebar";
import CandlestickChart from "../components/trading/CandlestickChart";
import { ChartErrorBoundary } from "../components/trading/ChartErrorBoundary";
import OrderBook from "../components/trading/OrderBook";
import OrderForm from "../components/trading/OrderForm";
import OrdersPanel from "../components/trading/OrdersPanel";
import TickerBar from "../components/trading/TickerBar";
import {
  fetchBalances,
  fetchCandles,
  fetchOrderbook,
  fetchOrders,
  fetchStocks,
  fetchTicker,
  fetchTrades,
} from "../lib/api";
import { orbitWs } from "../lib/ws";
import { appendCandleIfMissing, startTimeToMs } from "../lib/candles";
import { toPrice } from "../lib/format";
import type {
  Balance,
  Candle,
  CandleInterval,
  Fill,
  Order,
  OrderbookLevel,
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
  const [candleInterval, setCandleInterval] = useState<CandleInterval>("15m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [currentCandle, setCurrentCandle] = useState<Candle | null>(null);
  const [asks, setAsks] = useState<OrderbookLevel[]>([]);
  const [bids, setBids] = useState<OrderbookLevel[]>([]);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [balances, setBalances] = useState<Record<string, Balance>>({});
  const [orders, setOrders] = useState<Order[]>([]);
  const [trades, setTrades] = useState<Fill[]>([]);
  const tradeRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orderbookRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadOrderbook = useCallback(async (sym: string) => {
    try {
      const data = await fetchOrderbook(sym);
      setAsks(buildLevels(data.asks, true));
      setBids(buildLevels(data.bids, false));
    } catch {
      /* keep existing orderbook on transient errors */
    }
  }, []);

  const loadCandles = useCallback(async (sym: string, int: CandleInterval) => {
    try {
      const data = await fetchCandles(sym, int);
      setCandles(data.candles);
      setCurrentCandle(data.current);
    } catch {
      /* keep existing candles on transient errors */
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

  const refreshTrades = useCallback(async (sym: string) => {
    try {
      const data = await fetchTrades(sym);
      setTrades(data);
    } catch {
      /* keep existing trades on transient errors */
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
    setCandles([]);
    setCurrentCandle(null);

    loadOrderbook(symbol);
    loadCandles(symbol, candleInterval);
    refreshOrders();
    refreshTrades(symbol);
    refreshBalances();

    fetchTicker(symbol)
      .then((t) => setLastPrice(toPrice(t.price)))
      .catch(() => {});

    orbitWs.subscribeOrderbook(symbol);
    orbitWs.subscribeCandle(symbol, candleInterval);

    return () => {
      orbitWs.unsubscribeOrderbook(symbol);
      orbitWs.unsubscribeCandle(symbol, candleInterval);
    };
  }, [
    symbol,
    candleInterval,
    loadOrderbook,
    loadCandles,
    refreshOrders,
    refreshTrades,
    refreshBalances,
  ]);

  useEffect(() => {
    const unsub = orbitWs.subscribe((msg: WsMessage) => {
      if (msg.type === "TRADE" && msg.symbol === symbol) {
        setLastPrice(toPrice(msg.price));

        if (tradeRefreshTimer.current) clearTimeout(tradeRefreshTimer.current);
        tradeRefreshTimer.current = setTimeout(() => {
          refreshTrades(symbol);
        }, 400);

        if (orderbookRefreshTimer.current) clearTimeout(orderbookRefreshTimer.current);
        orderbookRefreshTimer.current = setTimeout(() => {
          loadOrderbook(symbol);
        }, 400);
      }

      if (msg.type === "ORDERBOOK_UPDATE" && msg.symbol === symbol) {
        if (orderbookRefreshTimer.current) clearTimeout(orderbookRefreshTimer.current);
        orderbookRefreshTimer.current = setTimeout(() => {
          loadOrderbook(symbol);
        }, 400);
      }

      if (
        (msg.type === "CANDLE_UPDATE" || msg.type === "CANDLE_SNAPSHOT") &&
        msg.symbol === symbol &&
        msg.interval === candleInterval
      ) {
        const nextCandle: Candle = {
          symbol: msg.symbol,
          interval: msg.interval,
          open: msg.open,
          high: msg.high,
          low: msg.low,
          close: msg.close,
          volume: msg.volume,
          startTime: msg.startTime,
        };

        setCurrentCandle((prev) => {
          if (
            prev &&
            msg.type === "CANDLE_UPDATE" &&
            startTimeToMs(prev.startTime) !== startTimeToMs(nextCandle.startTime)
          ) {
            setCandles((existing) => appendCandleIfMissing(existing, prev));
          }
          return nextCandle;
        });
      }

      if (msg.type === "BALANCE_SNAPSHOT" || msg.type === "BALANCE_UPDATE") {
        setBalances(msg.balances);
      }
    });

    return () => {
      unsub();
      if (tradeRefreshTimer.current) clearTimeout(tradeRefreshTimer.current);
      if (orderbookRefreshTimer.current) clearTimeout(orderbookRefreshTimer.current);
    };
  }, [symbol, candleInterval, loadOrderbook, refreshTrades]);

  const stats24h = useMemo(() => {
    if (candles.length === 0) {
      return { change: 0, high: lastPrice, low: lastPrice, volume: 0 };
    }

    const recent = candles.slice(-Math.min(candles.length, 96));
    const first = recent[0]?.open ?? 0;
    const last = currentCandle?.close ?? recent[recent.length - 1]?.close ?? lastPrice ?? 0;
    const highs = recent.map((c) => c.high);
    const lows = recent.map((c) => c.low);
    const high = highs.length > 0 ? Math.max(...highs, last) : last;
    const low = lows.length > 0 ? Math.min(...lows, last) : last;
    const change = first > 0 ? ((last - first) / first) * 100 : 0;
    const volume = recent.reduce((sum, c) => sum + c.volume, 0);

    return { change, high, low, volume };
  }, [candles, currentCandle, lastPrice]);

  function handleOrderPlaced() {
    refreshOrders();
    refreshBalances();
    loadOrderbook(symbol);
    orbitWs.requestBalance();
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-orbit-bg">
      <Navbar />

      <div className="flex min-h-0 flex-1">
        <Sidebar />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <TickerBar
            symbol={symbol}
            stocks={stocks}
            lastPrice={lastPrice}
            change24h={stats24h.change}
            high24h={stats24h.high}
            low24h={stats24h.low}
            volume24h={stats24h.volume}
            onSymbolChange={setSymbol}
          />

          <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[1fr_auto] xl:grid-cols-[240px_1fr_280px] xl:grid-rows-1">
            <div className="hidden min-h-0 border-r border-orbit-border xl:block">
              <OrderBook asks={asks} bids={bids} lastPrice={lastPrice} />
            </div>

            <div className="flex min-h-0 min-w-0 flex-col">
              <div className="min-h-[280px] flex-1 border-b border-orbit-border xl:border-b-0">
                <ChartErrorBoundary>
                  <CandlestickChart
                    candles={candles}
                    current={currentCandle}
                    interval={candleInterval}
                    onIntervalChange={setCandleInterval}
                    lastPrice={lastPrice}
                    symbol={symbol}
                  />
                </ChartErrorBoundary>
              </div>

              <div className="h-[200px] shrink-0 xl:hidden">
                <OrderBook asks={asks} bids={bids} lastPrice={lastPrice} />
              </div>
            </div>

            <div className="hidden min-h-0 border-l border-orbit-border xl:block">
              <OrderForm
                symbol={symbol}
                lastPrice={lastPrice}
                balances={balances}
                onOrderPlaced={handleOrderPlaced}
              />
            </div>
          </div>

          <div className="h-[220px] shrink-0 border-t border-orbit-border">
            <OrdersPanel
              orders={orders}
              trades={trades}
              balances={balances}
              stocks={stocks}
              onRefresh={() => {
                refreshOrders();
                refreshBalances();
              }}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-orbit-border xl:hidden">
        <OrderForm
          symbol={symbol}
          lastPrice={lastPrice}
          balances={balances}
          onOrderPlaced={handleOrderPlaced}
        />
      </div>

      <Footer />
    </div>
  );
}
