import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type IPaneApi,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import type { Candle, CandleInterval } from "../../types";
import { CANDLE_INTERVALS } from "../../types";

interface CandlestickChartProps {
  candles: Candle[];
  current: Candle | null;
  interval: CandleInterval;
  onIntervalChange: (interval: CandleInterval) => void;
  lastPrice?: number | null;
  symbol?: string;
}

interface MergedBar {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface LegendState {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timeLabel: string;
}

const THEME = {
  panel: "#121212",
  border: "#262626",
  grid: "#1a1a1a",
  text: "#888888",
  crosshair: "#555555",
  crosshairLabel: "#262626",
  candleUp: "#ffffff",
  candleUpBorder: "#e8e8e8",
  candleDown: "#4a4a4a",
  candleDownBorder: "#3a3a3a",
  wick: "#666666",
  volumeUp: "rgba(255, 255, 255, 0.22)",
  volumeDown: "rgba(102, 102, 102, 0.38)",
  priceLine: "#888888",
} as const;

function toChartTime(startTime: number | string): Time {
  const ms = typeof startTime === "string" ? new Date(startTime).getTime() : startTime;
  return Math.floor(ms / 1000) as Time;
}

function toMs(time: Time): number {
  return (time as number) * 1000;
}

function formatPrice(value: number) {
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatVolume(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function formatCandleTime(ms: number, interval: CandleInterval): string {
  const date = new Date(ms);
  if (interval === "1d" || interval === "4h") {
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    ...(interval === "1m" ? { second: "2-digit" } : {}),
  });
}

function mergeBars(candles: Candle[], current: Candle | null): MergedBar[] {
  const bars: MergedBar[] = candles.map((c) => ({
    time: toChartTime(c.startTime),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));

  if (!current) return bars;

  const currentBar: MergedBar = {
    time: toChartTime(current.startTime),
    open: current.open,
    high: current.high,
    low: current.low,
    close: current.close,
    volume: current.volume,
  };

  const last = bars[bars.length - 1];
  if (last && last.time === currentBar.time) {
    bars[bars.length - 1] = currentBar;
  } else {
    bars.push(currentBar);
  }

  return bars;
}

function toCandlePoint(bar: MergedBar): CandlestickData<Time> {
  return {
    time: bar.time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  };
}

function toVolumePoint(bar: MergedBar): HistogramData<Time> {
  return {
    time: bar.time,
    value: bar.volume,
    color: bar.close >= bar.open ? THEME.volumeUp : THEME.volumeDown,
  };
}

function barToLegend(bar: MergedBar, interval: CandleInterval): LegendState {
  return {
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    timeLabel: formatCandleTime(toMs(bar.time), interval),
  };
}

function setAllBarData(
  candleSeries: ISeriesApi<"Candlestick">,
  volumeSeries: ISeriesApi<"Histogram">,
  bars: MergedBar[],
  fit: boolean,
  chart: IChartApi,
) {
  candleSeries.setData(bars.map(toCandlePoint));
  volumeSeries.setData(bars.map(toVolumePoint));
  if (fit) {
    chart.timeScale().fitContent();
  }
}

function applyBarUpdate(
  candleSeries: ISeriesApi<"Candlestick">,
  volumeSeries: ISeriesApi<"Histogram">,
  bar: MergedBar,
  chart: IChartApi,
  allBars: MergedBar[],
) {
  try {
    candleSeries.update(toCandlePoint(bar));
    volumeSeries.update(toVolumePoint(bar));
  } catch (err) {
    console.warn("Chart update failed, resetting series:", err);
    setAllBarData(candleSeries, volumeSeries, allBars, false, chart);
  }
}

export default function CandlestickChart({
  candles,
  current,
  interval,
  onIntervalChange,
  lastPrice = null,
  symbol = "",
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const volumePaneRef = useRef<IPaneApi<Time> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);
  const mergedBarsRef = useRef<MergedBar[]>([]);
  const shouldFitRef = useRef(true);
  const seriesKeyRef = useRef("");
  const intervalRef = useRef(interval);

  const [legend, setLegend] = useState<LegendState | null>(null);

  const mergedBars = useMemo(() => mergeBars(candles, current), [candles, current]);

  const defaultLegend = useMemo(() => {
    const last = mergedBars[mergedBars.length - 1];
    return last ? barToLegend(last, interval) : null;
  }, [mergedBars, interval]);

  const livePrice = current?.close ?? lastPrice ?? mergedBars.at(-1)?.close ?? null;

  useEffect(() => {
    intervalRef.current = interval;
  }, [interval]);

  useEffect(() => {
    shouldFitRef.current = true;
    seriesKeyRef.current = "";
    setLegend(null);
  }, [interval, symbol]);

  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: THEME.panel },
        textColor: THEME.text,
        fontFamily: "Inter, sans-serif",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: THEME.grid },
        horzLines: { color: THEME.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: THEME.crosshair,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: THEME.crosshairLabel,
        },
        horzLine: {
          color: THEME.crosshair,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: THEME.crosshairLabel,
        },
      },
      rightPriceScale: {
        borderColor: THEME.border,
        scaleMargins: { top: 0.08, bottom: 0.05 },
      },
      timeScale: {
        borderColor: THEME.border,
        timeVisible: true,
        secondsVisible: interval === "1m",
        rightOffset: 4,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: THEME.candleUp,
      downColor: THEME.candleDown,
      borderUpColor: THEME.candleUpBorder,
      borderDownColor: THEME.candleDownBorder,
      wickUpColor: THEME.wick,
      wickDownColor: THEME.wick,
    });

    const volumePane = chart.addPane();
    volumePane.setHeight(72);
    const volumeSeries = volumePane.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    volumePaneRef.current = volumePane;
    priceLineRef.current = null;

    const onCrosshairMove = (param: MouseEventParams<Time>) => {
      if (disposed) return;

      if (!param.time) {
        const last = mergedBarsRef.current.at(-1);
        setLegend(last ? barToLegend(last, intervalRef.current) : null);
        return;
      }

      const candlePoint = param.seriesData.get(candleSeries) as CandlestickData<Time> | undefined;
      const volumePoint = param.seriesData.get(volumeSeries) as HistogramData<Time> | undefined;

      if (!candlePoint) {
        const match = mergedBarsRef.current.find((b) => b.time === param.time);
        setLegend(match ? barToLegend(match, intervalRef.current) : null);
        return;
      }

      setLegend({
        open: candlePoint.open,
        high: candlePoint.high,
        low: candlePoint.low,
        close: candlePoint.close,
        volume: volumePoint?.value ?? 0,
        timeLabel: formatCandleTime(toMs(param.time), intervalRef.current),
      });
    };

    chart.subscribeCrosshairMove(onCrosshairMove);

    const observer = new ResizeObserver((entries) => {
      if (disposed || !chartRef.current) return;

      const { width, height } = entries[0]?.contentRect ?? { width: 0, height: 0 };
      if (!width || !height) return;

      try {
        chart.applyOptions({ width, height });
        volumePane.setHeight(Math.max(56, Math.floor(height * 0.18)));
      } catch {
        /* chart may be mid-disposal */
      }
    });
    observer.observe(containerRef.current);

    return () => {
      disposed = true;
      observer.disconnect();
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      volumePaneRef.current = null;
      priceLineRef.current = null;
    };
  }, [interval]);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!chart || !candleSeries || !volumeSeries) return;

    chart.applyOptions({
      timeScale: { secondsVisible: interval === "1m" },
    });

    if (mergedBars.length === 0) {
      candleSeries.setData([]);
      volumeSeries.setData([]);
      mergedBarsRef.current = [];
      return;
    }

    const seriesKey = `${symbol}-${interval}-${String(mergedBars[0]?.time)}-${mergedBars.length}`;
    const prevBars = mergedBarsRef.current;
    const prevLast = prevBars.at(-1);
    const nextLast = mergedBars.at(-1)!;

    const isFullReload =
      shouldFitRef.current ||
      seriesKeyRef.current !== seriesKey ||
      prevBars.length === 0 ||
      (prevBars.length > 1 &&
        mergedBars.length > 1 &&
        prevBars[0]?.time !== mergedBars[0]?.time);

    if (isFullReload) {
      setAllBarData(candleSeries, volumeSeries, mergedBars, true, chart);
      shouldFitRef.current = false;
      seriesKeyRef.current = seriesKey;
    } else if (
      mergedBars.length === prevBars.length &&
      prevLast?.time === nextLast.time
    ) {
      applyBarUpdate(candleSeries, volumeSeries, nextLast, chart, mergedBars);
    } else if (
      mergedBars.length === prevBars.length + 1 &&
      prevLast?.time !== nextLast.time
    ) {
      applyBarUpdate(candleSeries, volumeSeries, nextLast, chart, mergedBars);
    } else {
      setAllBarData(candleSeries, volumeSeries, mergedBars, false, chart);
      seriesKeyRef.current = seriesKey;
    }

    mergedBarsRef.current = mergedBars;
  }, [mergedBars, interval, symbol]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries || livePrice === null) return;

    try {
      if (!priceLineRef.current) {
        priceLineRef.current = candleSeries.createPriceLine({
          price: livePrice,
          color: THEME.priceLine,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          lineVisible: true,
          title: "",
        });
        return;
      }

      priceLineRef.current.applyOptions({ price: livePrice });
    } catch {
      priceLineRef.current = null;
    }
  }, [livePrice]);

  const displayLegend = legend ?? defaultLegend;

  return (
    <div className="flex h-full min-h-0 flex-col bg-orbit-panel">
      <div className="flex shrink-0 items-center gap-0.5 border-b border-orbit-border px-3 py-2">
        {CANDLE_INTERVALS.map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => onIntervalChange(i)}
            className={`relative rounded px-2.5 py-1 text-xs font-medium uppercase tracking-wide transition ${
              interval === i
                ? "bg-white text-black"
                : "text-orbit-secondary hover:bg-orbit-elevated hover:text-white"
            }`}
          >
            {i}
            {interval === i && (
              <span className="absolute inset-x-1 -bottom-[9px] h-0.5 rounded-full bg-white" />
            )}
          </button>
        ))}
      </div>

      <div className="relative min-h-0 flex-1">
        {displayLegend && (
          <div className="pointer-events-none absolute left-3 top-2 z-10 min-w-[240px] rounded border border-orbit-border/80 bg-orbit-bg/90 px-3 py-2 backdrop-blur-sm">
            {symbol && (
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-orbit-secondary">
                {symbol}/INR · {interval}
              </div>
            )}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums">
              <LegendField label="O" value={formatPrice(displayLegend.open)} />
              <LegendField label="H" value={formatPrice(displayLegend.high)} />
              <LegendField label="L" value={formatPrice(displayLegend.low)} />
              <LegendField label="C" value={formatPrice(displayLegend.close)} />
              <LegendField label="V" value={formatVolume(displayLegend.volume)} muted />
            </div>
            <div className="mt-1 text-[10px] text-orbit-muted">{displayLegend.timeLabel}</div>
          </div>
        )}
        <div ref={containerRef} className="absolute inset-0" />
      </div>
    </div>
  );
}

function LegendField({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <span className={muted ? "text-orbit-secondary" : "text-white"}>
      <span className="mr-1 text-orbit-muted">{label}</span>
      {value}
    </span>
  );
}
