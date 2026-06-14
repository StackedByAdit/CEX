import type { OrderbookLevel } from "../../types";

interface OrderBookProps {
  asks: OrderbookLevel[];
  bids: OrderbookLevel[];
  lastPrice: number | null;
}

function formatNum(n: number, decimals = 2) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function OrderBook({ asks, bids, lastPrice }: OrderBookProps) {
  const maxAskTotal = Math.max(...asks.map((a) => a.total), 1);
  const maxBidTotal = Math.max(...bids.map((b) => b.total), 1);

  const displayAsks = [...asks].reverse().slice(-12);
  const displayBids = bids.slice(0, 12);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-3 gap-2 border-b border-orbit-border px-3 py-2 text-[10px] uppercase tracking-wider text-orbit-muted">
        <span>Price</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Total</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-1 flex-col justify-end overflow-y-auto">
          {displayAsks.map((level) => (
            <BookRow
              key={`ask-${level.price}`}
              level={level}
              side="ask"
              maxTotal={maxAskTotal}
            />
          ))}
        </div>

        <div className="border-y border-orbit-border bg-orbit-elevated/50 py-2 text-center">
          <div className="text-lg font-semibold tabular-nums">
            {lastPrice !== null ? formatNum(lastPrice) : "—"}
          </div>
          <div className="text-[10px] text-orbit-muted">INR</div>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto">
          {displayBids.map((level) => (
            <BookRow
              key={`bid-${level.price}`}
              level={level}
              side="bid"
              maxTotal={maxBidTotal}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function BookRow({
  level,
  side,
  maxTotal,
}: {
  level: OrderbookLevel;
  side: "ask" | "bid";
  maxTotal: number;
}) {
  const depth = (level.total / maxTotal) * 100;
  const isAsk = side === "ask";

  return (
    <div className="relative grid grid-cols-3 gap-2 px-3 py-[3px] text-xs tabular-nums">
      <div
        className="absolute inset-y-0 right-0"
        style={{
          width: `${depth}%`,
          background: isAsk ? "rgba(239, 68, 68, 0.08)" : "rgba(255, 255, 255, 0.06)",
        }}
      />
      <span className={`relative z-10 ${isAsk ? "text-orbit-red/80" : "text-white/90"}`}>
        {formatNum(level.price)}
      </span>
      <span className="relative z-10 text-right text-orbit-secondary">
        {formatNum(level.amount, 4)}
      </span>
      <span className="relative z-10 text-right text-orbit-muted">
        {formatNum(level.total, 2)}
      </span>
    </div>
  );
}
