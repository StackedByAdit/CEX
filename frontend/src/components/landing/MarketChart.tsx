import { useId } from "react";

const CLOSES = [
  132, 136, 133, 141, 138, 129, 122, 126, 134, 143, 151, 147, 156, 152, 163,
  171, 166, 176, 185, 181, 192, 201, 196, 206, 216, 210, 221, 230,
];

function buildCandles() {
  return CLOSES.map((close, index) => {
    const open = index === 0 ? close - 5 : CLOSES[index - 1]!;
    const up = close >= open;
    const high = Math.max(open, close) + (up ? 5 : 3);
    const low = Math.min(open, close) - (up ? 3 : 6);
    const body = Math.abs(close - open);
    return { open, close, high, low, up, volume: 18 + body * 4 + (index % 5) * 6 };
  });
}

const CANDLES = buildCandles();
const MIN = Math.min(...CANDLES.map((candle) => candle.low)) - 4;
const MAX = Math.max(...CANDLES.map((candle) => candle.high)) + 6;
const LAST = CANDLES[CANDLES.length - 1]!;

function yFor(price: number, top: number, height: number) {
  return top + ((MAX - price) / (MAX - MIN)) * height;
}

export default function MarketChart() {
  const rawId = useId().replace(/:/g, "");
  const fillId = `chart-fill-${rawId}`;
  const glowId = `chart-glow-${rawId}`;
  const plot = { left: 12, right: 568, top: 18, bottom: 248 };
  const width = plot.right - plot.left;
  const height = plot.bottom - plot.top;
  const slot = width / CANDLES.length;
  const maxVolume = Math.max(...CANDLES.map((candle) => candle.volume));

  const line = CANDLES.map((candle, index) => {
    const x = plot.left + slot * index + slot / 2;
    const y = yFor(candle.close, plot.top, height);
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  const area = `${line} L${(plot.left + width - slot / 2).toFixed(1)},${plot.bottom} L${(plot.left + slot / 2).toFixed(1)},${plot.bottom} Z`;
  const lastX = plot.left + slot * (CANDLES.length - 1) + slot / 2;
  const lastY = yFor(LAST.close, plot.top, height);
  const ticks = [MAX - 6, (MAX + MIN) / 2, MIN + 6];

  return (
    <figure className="relative overflow-hidden border border-white/10 bg-[#0e0e0e] shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-orbit-green/10 blur-3xl"
        aria-hidden="true"
      />
      <figcaption className="relative flex items-end justify-between gap-4 px-4 pb-2 pt-4 sm:px-5">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-orbit-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-orbit-green" />
            AXIS
            <span className="text-orbit-muted">sample chart</span>
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="font-mono text-3xl font-semibold tabular-nums tracking-tight">1,842.50</span>
            <span className="font-mono text-sm tabular-nums text-orbit-green">+12.40</span>
            <span className="rounded bg-orbit-green/15 px-1.5 py-0.5 font-mono text-xs tabular-nums text-orbit-green">
              +0.68%
            </span>
          </div>
        </div>
        <div className="hidden gap-4 pb-1 text-right sm:flex">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-orbit-secondary">Bid</div>
            <div className="font-mono text-sm tabular-nums text-orbit-green">1,842.40</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-orbit-secondary">Ask</div>
            <div className="font-mono text-sm tabular-nums text-orbit-red">1,843.10</div>
          </div>
        </div>
      </figcaption>

      <svg viewBox="0 0 640 320" className="relative h-64 w-full sm:h-80" role="img" aria-label="Illustrative candlestick chart rising from a pullback into a higher close">
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
          </linearGradient>
          <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {ticks.map((tick) => {
          const y = yFor(tick, plot.top, height);
          return (
            <g key={tick}>
              <line x1={plot.left} x2={plot.right} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" />
              <text x="628" y={y + 4} textAnchor="end" fill="#888888" fontSize="11" fontFamily="ui-monospace, monospace">
                {tick.toFixed(0)}
              </text>
            </g>
          );
        })}

        <path d={area} fill={`url(#${fillId})`} />
        <path d={line} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.25" className="chart-trace" />

        {CANDLES.map((candle, index) => {
          const x = plot.left + slot * index + slot / 2;
          const color = candle.up ? "#22c55e" : "#ef4444";
          const bodyTop = yFor(Math.max(candle.open, candle.close), plot.top, height);
          const bodyBottom = yFor(Math.min(candle.open, candle.close), plot.top, height);
          const bodyHeight = Math.max(1.5, bodyBottom - bodyTop);
          const volHeight = (candle.volume / maxVolume) * 42;
          return (
            <g key={index} className="candle-rise" style={{ animationDelay: `${index * 28}ms` }}>
              <rect
                x={x - slot * 0.22}
                y={292 - volHeight}
                width={slot * 0.44}
                height={volHeight}
                fill={color}
                opacity="0.28"
              />
              <line x1={x} x2={x} y1={yFor(candle.high, plot.top, height)} y2={yFor(candle.low, plot.top, height)} stroke={color} strokeWidth="1" />
              <rect x={x - slot * 0.28} y={bodyTop} width={slot * 0.56} height={bodyHeight} fill={color} />
            </g>
          );
        })}

        <line x1={plot.left} x2={plot.right} y1={lastY} y2={lastY} stroke="#22c55e" strokeOpacity="0.45" strokeDasharray="3 4" />
        <circle cx={lastX} cy={lastY} r="3.5" fill="#22c55e" filter={`url(#${glowId})`} />
      </svg>
    </figure>
  );
}