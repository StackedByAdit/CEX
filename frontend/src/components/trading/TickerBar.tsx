import type { Stock } from "../../types";

interface TickerBarProps {
  symbol: string;
  stocks: Stock[];
  lastPrice: number | null;
  change24h: number;
  high24h: number | null;
  low24h: number | null;
  volume24h: number;
  onSymbolChange: (symbol: string) => void;
}

function formatPrice(value: number | null) {
  if (value === null) return "—";
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatVolume(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}

export default function TickerBar({
  symbol,
  stocks,
  lastPrice,
  change24h,
  high24h,
  low24h,
  volume24h,
  onSymbolChange,
}: TickerBarProps) {
  const isPositive = change24h >= 0;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-b border-orbit-border px-4 py-3">
      <div className="flex items-center gap-2">
        <select
          value={symbol}
          onChange={(e) => onSymbolChange(e.target.value)}
          className="cursor-pointer rounded bg-transparent text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-white/20"
        >
          {stocks.map((s) => (
            <option key={s.symbol} value={s.symbol} className="bg-orbit-panel">
              {s.symbol}/INR
            </option>
          ))}
        </select>
      </div>

      <Stat label="Last Price" value={formatPrice(lastPrice)} large />
      <Stat
        label="24h Change"
        value={`${isPositive ? "+" : ""}${change24h.toFixed(2)}%`}
        color={isPositive ? "text-orbit-green" : "text-orbit-red"}
      />
      <Stat label="24h High" value={formatPrice(high24h)} />
      <Stat label="24h Low" value={formatPrice(low24h)} />
      <Stat label="24h Volume" value={formatVolume(volume24h)} />
    </div>
  );
}

function Stat({
  label,
  value,
  large,
  color = "text-white",
}: {
  label: string;
  value: string;
  large?: boolean;
  color?: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-orbit-muted">{label}</div>
      <div className={`${large ? "text-base font-semibold" : "text-sm"} ${color}`}>
        {value}
      </div>
    </div>
  );
}
