import { useEffect, useRef, useState } from "react";
import { init, dispose } from "klinecharts";
import type { Chart, KLineData, DataLoader } from "klinecharts";
import { fetchCandles } from "../../lib/api";
import { orbitWs } from "../../lib/ws";
import type { WsMessage } from "../../types";

interface KLineChartProps {
  symbol: string;
}

const PERIODS = [
  { label: "1m", interval: "1m", type: "minute" as const, span: 1 },
  { label: "15m", interval: "15m", type: "minute" as const, span: 15 },
  { label: "1h", interval: "1h", type: "hour" as const, span: 1 },
  { label: "4h", interval: "4h", type: "hour" as const, span: 4 },
  { label: "1D", interval: "1d", type: "day" as const, span: 1 },
] as const;

type PeriodInterval = (typeof PERIODS)[number]["interval"];

const INTERVAL_MS: Record<PeriodInterval, number> = {
  "1m": 60_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

function applyYAxisConfig(chart: Chart) {
  chart.overrideYAxis({
    paneId: "candle_pane", // Target ONLY the main candle chart pane's Y-axis
    scrollZoomEnabled: false, // Disable Y-axis zooming via scroll wheel/trackpad on the main chart
    gap: {
      top: 0.15, // 15% top padding to prevent candles from touching the top edge
      bottom: 0.15, // 15% bottom padding to prevent candles from touching the bottom edge
    },
    createRange: (params) => {
      const { defaultRange } = params;
      let from = defaultRange.realFrom;
      let to = defaultRange.realTo;
      const diff = to - from;

      // Calculate a minimum span of 2% of the price to prevent extreme vertical stretching on flat periods
      const center = (from + to) / 2;
      const minSpan = Math.max(0.0001, center * 0.02); // 2% of the average price

      if (diff < minSpan) {
        from = center - minSpan / 2;
        to = center + minSpan / 2;
      }

      return {
        from,
        to,
        range: to - from,
        realFrom: from,
        realTo: to,
        realRange: to - from,
        displayFrom: from,
        displayTo: to,
        displayRange: to - from,
      };
    },
  });
}

export default function KLineChart({ symbol }: KLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const symbolRef = useRef(symbol);
  const periodRef = useRef<PeriodInterval>("15m");
  const barCallbackRef = useRef<((data: KLineData) => void) | null>(null);
  const [activePeriod, setActivePeriod] = useState<PeriodInterval>("15m");
  const [pillStyle, setPillStyle] = useState({ left: 3, width: 44 });
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const activeIndex = PERIODS.findIndex((p) => p.interval === activePeriod);
    const tab = tabsRef.current[activeIndex];
    if (tab) {
      setPillStyle({
        left: tab.offsetLeft,
        width: tab.offsetWidth,
      });
    }
  }, [activePeriod]);

  useEffect(() => {
    symbolRef.current = symbol;
  }, [symbol]);

  // Single init effect — chart creation, datafeed, symbol, and WS subscription all in one pass.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = init(el, {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      layout: {
        yAxis: {
          scrollZoomEnabled: false,
        },
      },
      styles: {
        grid: {
          show: true,
          horizontal: { show: true, size: 1, color: "#1a1a1a", style: "dashed", dashedValue: [4, 2] },
          vertical: { show: true, size: 1, color: "#1a1a1a", style: "dashed", dashedValue: [4, 2] },
        },
        candle: {
          type: "candle_solid",
          bar: {
            upColor: "#2ebd85",
            downColor: "#f6465d",
            noChangeColor: "#888888",
            upBorderColor: "#2ebd85",
            downBorderColor: "#f6465d",
            noChangeBorderColor: "#888888",
            upWickColor: "#2ebd85",
            downWickColor: "#f6465d",
            noChangeWickColor: "#888888",
          },
          priceMark: {
            show: true,
            high: { show: true, color: "#888888", textOffset: 5, textSize: 10, textFamily: "Inter, sans-serif", textWeight: "normal" },
            low: { show: true, color: "#888888", textOffset: 5, textSize: 10, textFamily: "Inter, sans-serif", textWeight: "normal" },
            last: {
              show: true,
              upColor: "#2ebd85",
              downColor: "#f6465d",
              noChangeColor: "#888888",
              line: { show: true, style: "dashed", dashedValue: [4, 2], size: 1 },
              text: {
                show: true,
                style: "fill",
                size: 11,
                paddingLeft: 4,
                paddingTop: 2,
                paddingRight: 4,
                paddingBottom: 2,
                borderRadius: 2,
                color: "#ffffff",
                family: "Inter, sans-serif",
                weight: "normal",
                borderStyle: "solid",
                borderSize: 0,
                borderColor: "transparent",
              },
            },
          },
          tooltip: {
            showRule: "always",
            showType: "standard",
            offsetLeft: 8,
            offsetTop: 8,
            offsetRight: 8,
            offsetBottom: 8,
            features: [],
          },
        },
        indicator: {
          ohlc: {
            upColor: "#2ebd85",
            downColor: "#f6465d",
            noChangeColor: "#888888",
          },
          bars: [
            {
              style: "fill",
              borderStyle: "solid",
              borderSize: 1,
              borderDashedValue: [2, 2],
              upColor: "rgba(46, 189, 133, 0.6)",
              downColor: "rgba(246, 70, 93, 0.6)",
              noChangeColor: "#888888",
            },
          ],
        },
        xAxis: {
          show: true,
          size: "auto",
          axisLine: { show: true, color: "#262626", size: 1 },
          tickLine: { show: true, size: 1, length: 3, color: "#262626" },
          tickText: { show: true, color: "#555555", family: "Inter, sans-serif", weight: "normal", size: 11, marginStart: 4, marginEnd: 4 },
        },
        yAxis: {
          show: true,
          size: "auto",
          axisLine: { show: true, color: "#262626", size: 1 },
          tickLine: { show: true, size: 1, length: 3, color: "#262626" },
          tickText: { show: true, color: "#555555", family: "Inter, sans-serif", weight: "normal", size: 11, marginStart: 4, marginEnd: 4 },
        },
        separator: {
          size: 1,
          color: "#262626",
          fill: true,
          activeBackgroundColor: "rgba(255, 255, 255, 0.08)",
        },
        crosshair: {
          show: true,
          horizontal: {
            show: true,
            line: { show: true, style: "dashed", dashedValue: [4, 2], size: 1, color: "#555555" },
            text: {
              show: true,
              style: "fill",
              color: "#cccccc",
              size: 11,
              family: "Inter, sans-serif",
              weight: "normal",
              borderRadius: 2,
              paddingLeft: 4,
              paddingRight: 4,
              paddingTop: 3,
              paddingBottom: 3,
              borderStyle: "solid",
              borderSize: 1,
              borderColor: "#555555",
              backgroundColor: "#262626",
            },
            features: [],
          },
          vertical: {
            show: true,
            line: { show: true, style: "dashed", dashedValue: [4, 2], size: 1, color: "#555555" },
            text: {
              show: true,
              style: "fill",
              color: "#cccccc",
              size: 11,
              family: "Inter, sans-serif",
              weight: "normal",
              borderRadius: 2,
              paddingLeft: 4,
              paddingRight: 4,
              paddingTop: 3,
              paddingBottom: 3,
              borderStyle: "solid",
              borderSize: 1,
              borderColor: "#555555",
              backgroundColor: "#262626",
            },
          },
        },
      },
    });

    if (!chart) return;

    chartRef.current = chart;

    // Add volume indicator in a sub-pane below the candle pane.
    chart.createIndicator("VOL");

    // Wire up the datafeed — getBars fetches from our backend HTTP API.
    const dataLoader: DataLoader = {
      getBars: async ({ symbol: sym, period, callback }) => {
        const matched = PERIODS.find((p) => p.type === period.type && p.span === period.span);
        const interval: PeriodInterval = matched ? matched.interval : "15m";
        try {
          const bars = await fetchCandles(sym.ticker, interval);
          callback(bars as KLineData[], false);
        } catch {
          callback([], false);
        }
      },
      subscribeBar: ({ callback }) => {
        barCallbackRef.current = callback;
      },
      unsubscribeBar: () => {
        barCallbackRef.current = null;
      },
    };

    chart.setDataLoader(dataLoader);

    const initial = PERIODS.find((p) => p.interval === periodRef.current) ?? PERIODS[1]!;
    chart.setSymbol({ ticker: symbol });
    chart.setPeriod({ type: initial.type, span: initial.span });

    applyYAxisConfig(chart);

    // Forward live 1m candle pushes from WS into the subscribeBar callback,
    // bucketing to the currently active period so derived intervals update too.
    const unsub = orbitWs.subscribe((msg: WsMessage) => {
      if (
        msg.type === "CANDLE_UPDATE" &&
        msg.symbol === symbolRef.current &&
        barCallbackRef.current
      ) {
        const intervalMs = INTERVAL_MS[periodRef.current];
        const bucketStart = Math.floor(msg.startTime / intervalMs) * intervalMs;
        barCallbackRef.current({
          timestamp: bucketStart,
          open: msg.open,
          high: msg.high,
          low: msg.low,
          close: msg.close,
          volume: msg.volume,
        });
      }
    });

    // Resize observer keeps canvas dimensions in sync with container.
    const observer = new ResizeObserver(() => {
      chart.resize();
    });
    observer.observe(el);

    return () => {
      unsub();
      observer.disconnect();
      barCallbackRef.current = null;
      dispose(el);
      chartRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When symbol changes, update symbol on the existing chart instance.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setSymbol({ ticker: symbol });
    applyYAxisConfig(chart);
  }, [symbol]);

  function handlePeriodChange(interval: PeriodInterval) {
    const chart = chartRef.current;
    if (!chart) return;
    periodRef.current = interval;
    setActivePeriod(interval);
    const period = PERIODS.find((p) => p.interval === interval) ?? PERIODS[1]!;
    chart.setPeriod({ type: period.type, span: period.span });
    applyYAxisConfig(chart);
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-transparent glass-panel rounded border border-white/5">
      <div className="flex items-center gap-1 border-b border-white/5 p-2 shrink-0 bg-black/20">
        <div style={{ position: "relative", background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: 3, display: "flex", gap: 2 }}>
          <span
            style={{
              position: "absolute",
              top: 3,
              bottom: 3,
              left: pillStyle.left,
              width: pillStyle.width,
              background: "rgba(255,255,255,0.12)",
              borderRadius: 6,
              transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
              zIndex: 0,
            }}
          />
          {PERIODS.map((p, idx) => (
            <button
              key={p.interval}
              ref={(el) => { tabsRef.current[idx] = el; }}
              type="button"
              onClick={() => handlePeriodChange(p.interval)}
              style={{
                position: "relative",
                zIndex: 1,
                padding: "4px 12px",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.08em",
                borderRadius: 6,
                transition: "all 0.25s cubic-bezier(0.4,0,0.2,1)",
                color: activePeriod === p.interval ? "#ffffff" : "#666666",
                cursor: "pointer",
                background: "transparent",
                border: "none",
              }}
              onMouseEnter={(e) => {
                if (activePeriod !== p.interval) e.currentTarget.style.color = "#aaaaaa";
              }}
              onMouseLeave={(e) => {
                if (activePeriod !== p.interval) e.currentTarget.style.color = "#666666";
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={containerRef}
        style={{ flex: 1, minHeight: 0, width: "100%", background: "transparent" }}
      />
    </div>
  );
}
