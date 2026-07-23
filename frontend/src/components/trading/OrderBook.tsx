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

  const lowestAsk = asks.length > 0 ? asks[0].price : null;
  const highestBid = bids.length > 0 ? bids[0].price : null;
  const spread = lowestAsk && highestBid ? lowestAsk - highestBid : null;
  const spreadPercent = lowestAsk && highestBid ? (spread! / highestBid) * 100 : null;

  return (
    <div className="flex h-full min-h-0 flex-col border border-white/5 rounded glass-panel">
      <div className="px-3 py-2 text-sm font-semibold border-b border-white/5 flex items-center justify-between">
        Order Book
      </div>
      <div className="grid grid-cols-3 gap-2 border-b border-white/5 px-3 py-2 text-[10px] uppercase tracking-wider text-orbit-muted">
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

        <div className="border-y border-white/5 py-2 text-center flex flex-col items-center bg-black/20">
          <div className="text-xl font-bold tabular-nums bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">
            {lastPrice !== null ? formatNum(lastPrice) : "—"}
          </div>
          <div className="text-[10px] text-orbit-muted flex items-center gap-2 mt-1">
            <span>INR</span>
            {spread !== null && (
              <span className="text-orbit-secondary">
                Spread: {formatNum(spread)} ({spreadPercent?.toFixed(2)}%)
              </span>
            )}
          </div>
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
    <div className="relative grid grid-cols-3 gap-2 px-3 py-[3px] text-xs tabular-nums hover:bg-white/5 transition-colors group cursor-pointer">
      <div
        className="absolute inset-y-0 right-0 z-0 opacity-50 group-hover:opacity-80 transition-opacity"
        style={{
          width: `${depth}%`,
          background: isAsk 
            ? "linear-gradient(90deg, rgba(239, 68, 68, 0) 0%, rgba(239, 68, 68, 0.25) 100%)" 
            : "linear-gradient(90deg, rgba(34, 197, 94, 0) 0%, rgba(34, 197, 94, 0.25) 100%)",
        }}
      />
      <span className={`relative z-10 ${isAsk ? "text-orbit-red" : "text-orbit-green"} font-medium`}>
        {formatNum(level.price)}
      </span>
      <span className="relative z-10 text-right text-orbit-secondary">
        {formatNum(level.amount, 4)}
      </span>
      <span className="relative z-10 text-right text-orbit-muted group-hover:text-orbit-secondary transition-colors">
        {formatNum(level.total, 2)}
      </span>
    </div>
  );
}
