import { useCallback, useEffect, useRef, useState } from "react";
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
import {
  applyLiveCandleUpdate,
  candleSeriesKey,
  CandleSeriesCache,
  mergeSeriesSnapshots,
  normalizeCandleFetchResponse,
  startTimeToMs,
  type CandleSeriesSnapshot,
} from "../lib/candles";
import { levelsFromWsBook } from "../lib/orderbook";
import { toPrice } from "../lib/format";
import type {
  Balance,
  Candle,
  CandleInterval,
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
  const [candleInterval, setCandleInterval] = useState<CandleInterval>("15m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [currentCandle, setCurrentCandle] = useState<Candle | null>(null);
  const [asks, setAsks] = useState<OrderbookLevel[]>([]);
  const [bids, setBids] = useState<OrderbookLevel[]>([]);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [change24h, setChange24h] = useState(0);
  const [high24h, setHigh24h] = useState<number | null>(null);
  const [low24h, setLow24h] = useState<number | null>(null);
  const [volume24h, setVolume24h] = useState(0);
  const [balances, setBalances] = useState<Record<string, Balance>>({});
  const [orders, setOrders] = useState<Order[]>([]);
  const [trades, setTrades] = useState<Fill[]>([]);
  const tradeRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickerRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const candleCacheRef = useRef(new CandleSeriesCache());
  const activeCandleKeyRef = useRef(candleSeriesKey(symbol, candleInterval));
  const candleFetchGenRef = useRef(0);
  const candleFetchReadyRef = useRef(new Set<string>());

  const publishCandleSnapshot = useCallback((key: string, snapshot: CandleSeriesSnapshot) => {
    candleCacheRef.current.set(key, snapshot);
    if (activeCandleKeyRef.current === key) {
      setCandles(snapshot.candles);
      setCurrentCandle(snapshot.current);
    }
  }, []);

  const applyCandleView = useCallback((sym: string, int: CandleInterval) => {
    const key = candleSeriesKey(sym, int);
    activeCandleKeyRef.current = key;
    const cached = candleCacheRef.current.get(key);
    setCandles(cached?.candles ?? []);
    setCurrentCandle(cached?.current ?? null);
  }, []);

  const handleIntervalChange = useCallback(
    (int: CandleInterval) => {
      applyCandleView(symbol, int);
      setCandleInterval(int);
    },
    [applyCandleView, symbol],
  );

  const handleSymbolChange = useCallback(
    (sym: string) => {
      applyCandleView(sym, candleInterval);
      setSymbol(sym);
    },
    [applyCandleView, candleInterval],
  );

  const mergeFetchedWithCache = useCallback(
    (key: string, candles: Candle[], current: Candle | null): CandleSeriesSnapshot => {
      const fetched = normalizeCandleFetchResponse(candles, current);
      const cached = candleCacheRef.current.get(key);
      return cached ? mergeSeriesSnapshots(cached, fetched) : fetched;
    },
    [],
  );

  const loadOrderbook = useCallback(async (sym: string) => {
    try {
      const data = await fetchOrderbook(sym);
      setAsks(buildLevels(data.asks, true));
      setBids(buildLevels(data.bids, false));
    } catch {
      /* keep existing orderbook on transient errors */
    }
  }, []);

  const loadCandles = useCallback(
    async (sym: string, int: CandleInterval) => {
      const key = candleSeriesKey(sym, int);
      const gen = ++candleFetchGenRef.current;

      try {
        const data = await fetchCandles(sym, int);
        if (gen !== candleFetchGenRef.current || activeCandleKeyRef.current !== key) return;

        const snapshot = mergeFetchedWithCache(key, data.candles, data.current);
        candleFetchReadyRef.current.add(key);
        publishCandleSnapshot(key, snapshot);
      } catch {
        /* keep cached candles on transient errors */
      }
    },
    [mergeFetchedWithCache, publishCandleSnapshot],
  );

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
    applyCandleView(symbol, candleInterval);

    loadOrderbook(symbol);
    loadCandles(symbol, candleInterval);
    refreshOrders();
    refreshTrades(symbol);
    refreshBalances();

    loadTicker(symbol);

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
    loadTicker,
    applyCandleView,
  ]);

  useEffect(() => {
    const unsub = orbitWs.subscribe((msg: WsMessage) => {
      if (msg.type === "TRADE" && msg.symbol === symbol) {
        setLastPrice(toPrice(msg.price));

        if (tradeRefreshTimer.current) clearTimeout(tradeRefreshTimer.current);
        tradeRefreshTimer.current = setTimeout(() => {
          refreshTrades(symbol);
        }, 100);

        if (tickerRefreshTimer.current) clearTimeout(tickerRefreshTimer.current);
        tickerRefreshTimer.current = setTimeout(() => {
          loadTicker(symbol);
        }, 250);
      }

      if (
        (msg.type === "ORDERBOOK_SNAPSHOT" || msg.type === "ORDERBOOK_UPDATE") &&
        msg.symbol === symbol
      ) {
        const { bids, asks } = levelsFromWsBook(msg.bids, msg.asks);
        setBids(bids);
        setAsks(asks);
      }

      if (msg.type === "CANDLE_SNAPSHOT") {
        const key = candleSeriesKey(msg.symbol, msg.interval);
        const snapshot = normalizeCandleFetchResponse(msg.candles, msg.current);
        candleFetchReadyRef.current.add(key);
        publishCandleSnapshot(key, snapshot);
        return;
      }

      if (msg.type === "CANDLE_UPDATE") {
        const key = candleSeriesKey(msg.symbol, msg.interval);
        if (!candleFetchReadyRef.current.has(key)) return;

        const nextCandle: Candle = {
          symbol: msg.symbol,
          interval: msg.interval as CandleInterval,
          open: msg.open,
          high: msg.high,
          low: msg.low,
          close: msg.close,
          volume: msg.volume,
          startTime: msg.startTime,
        };

        const snapshot = candleCacheRef.current.update(key, (prev) => {
          const rollForward =
            prev.current !== null &&
            startTimeToMs(prev.current.startTime) !== startTimeToMs(nextCandle.startTime);

          return applyLiveCandleUpdate(prev, nextCandle, rollForward);
        });

        if (activeCandleKeyRef.current === key) {
          setCandles(snapshot.candles);
          setCurrentCandle(snapshot.current);
        }
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
  }, [symbol, candleInterval, refreshTrades, loadTicker]);

  const handleOrderPlaced = useCallback(
    (
      result: PlaceOrderResponse,
      meta: { symbol: string; side: OrderSide; type: OrderType; quantity: number; price?: number },
    ) => {
      const stock = stocks.find((s) => s.symbol === meta.symbol);
      const now = new Date().toISOString();

      setOrders((prev) => [
        {
          id: result.orderId,
          userId: "",
          stockId: stock?.id ?? "",
          side: meta.side,
          type: meta.type,
          status: result.status,
          price: meta.type === "LIMIT" ? (meta.price ?? null) : null,
          quantity: meta.quantity,
          filledQuantity: result.filledQuantity,
          createdAt: now,
          updatedAt: now,
        },
        ...prev,
      ]);
    },
    [stocks],
  );

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
            change24h={change24h}
            high24h={high24h}
            low24h={low24h}
            volume24h={volume24h}
            onSymbolChange={handleSymbolChange}
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
                    onIntervalChange={handleIntervalChange}
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
                asks={asks}
                bids={bids}
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
                loadOrderbook(symbol);
              }}
              onOrderCancelled={(orderId) => {
                setOrders((prev) =>
                  prev.map((order) =>
                    order.id === orderId ? { ...order, status: "CANCELLED" } : order,
                  ),
                );
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
          asks={asks}
          bids={bids}
          onOrderPlaced={handleOrderPlaced}
        />
      </div>

      <Footer />
    </div>
  );
}
