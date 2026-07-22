import { useMemo, useState, type FormEvent } from "react";
import type { Balance, OrderSide, OrderType, OrderbookLevel, PlaceOrderResponse } from "../../types";
import { ApiError, placeOrder } from "../../lib/api";
import {
  estimateMarketBuyFromAsks,
  estimateMarketSellFromBids,
  maxMarketBuyQtyFromAsks,
} from "../../lib/marketOrder";
import { toPrice } from "../../lib/format";

interface OrderFormProps {
  symbol: string;
  lastPrice: number | null;
  balances: Record<string, Balance>;
  asks: OrderbookLevel[];
  bids: OrderbookLevel[];
  onOrderPlaced: (
    result: PlaceOrderResponse,
    meta: { symbol: string; side: OrderSide; type: OrderType; quantity: number; price?: number },
  ) => void;
}

const PERCENTAGES = [25, 50, 75, 100] as const;

export default function OrderForm({
  symbol,
  lastPrice,
  balances,
  asks,
  bids,
  onOrderPlaced,
}: OrderFormProps) {
  const [side, setSide] = useState<OrderSide>("BUY");
  const [orderType, setOrderType] = useState<OrderType>("LIMIT");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const inrAvailable = balances.INR?.available ?? 0;
  const stockAvailable = balances[symbol]?.available ?? 0;

  const parsedQty = parseFloat(quantity) || 0;

  const marketEstimate = useMemo(() => {
    if (orderType !== "MARKET" || parsedQty <= 0) return null;
    return side === "BUY"
      ? estimateMarketBuyFromAsks(asks, parsedQty)
      : estimateMarketSellFromBids(bids, parsedQty);
  }, [orderType, parsedQty, side, asks, bids]);

  const total = useMemo(() => {
    if (orderType === "MARKET") {
      return marketEstimate?.estimatedQuote ?? 0;
    }
    const p = parseFloat(price) || 0;
    return p * parsedQty;
  }, [orderType, marketEstimate, price, parsedQty]);

  function applyPercentage(pct: number) {
    if (side === "BUY") {
      if (orderType === "MARKET") {
        const maxQty = maxMarketBuyQtyFromAsks(asks, inrAvailable, toPrice(lastPrice));
        if (maxQty <= 0) return;

        setQuantity(((maxQty * pct) / 100).toFixed(4));
        return;
      }

      const p = parseFloat(price) || toPrice(lastPrice) || 0;
      if (p <= 0) return;
      const maxQty = inrAvailable / p;
      setQuantity(((maxQty * pct) / 100).toFixed(4));
    } else {
      const maxQty =
        orderType === "MARKET" && marketEstimate
          ? Math.min(stockAvailable, marketEstimate.fillableQuantity)
          : stockAvailable;
      setQuantity(((maxQty * pct) / 100).toFixed(4));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const qty = parsedQty;
    const pr = parseFloat(price);

    if (!qty || qty <= 0) {
      setError("Enter a valid quantity");
      setLoading(false);
      return;
    }

    if (orderType === "LIMIT" && (!pr || pr <= 0)) {
      setError("Enter a valid price for limit orders");
      setLoading(false);
      return;
    }

    if (orderType === "MARKET") {
      if (!marketEstimate || marketEstimate.fillableQuantity <= 0) {
        setError("Not enough liquidity for a market order");
        setLoading(false);
        return;
      }

      if (side === "BUY" && marketEstimate.estimatedQuote > inrAvailable) {
        setError("Insufficient INR for estimated market cost");
        setLoading(false);
        return;
      }

      if (side === "SELL" && qty > stockAvailable) {
        setError(`Insufficient ${symbol}`);
        setLoading(false);
        return;
      }
    }

    try {
      const result = await placeOrder({
        side,
        type: orderType,
        symbol,
        quantity: qty,
        ...(orderType === "LIMIT" ? { price: pr } : {}),
      });

      const refund =
        result.refundQuote && result.refundQuote > 0
          ? ` · refunded ${result.refundQuote.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} INR`
          : "";

      setSuccess(
        `Order ${result.status.toLowerCase().replace("_", " ")}${refund}`,
      );
      setQuantity("");
      onOrderPlaced(result, {
        symbol,
        side,
        type: orderType,
        quantity: qty,
        ...(orderType === "LIMIT" ? { price: pr } : {}),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Order failed");
    } finally {
      setLoading(false);
    }
  }

  const isBuy = side === "BUY";
  const pricePlaceholder = (() => {
    const p = toPrice(lastPrice);
    return p === null ? "0.00" : p.toFixed(2);
  })();

  const showPartialLiquidityWarning =
    orderType === "MARKET" &&
    parsedQty > 0 &&
    marketEstimate &&
    marketEstimate.fillableQuantity > 0 &&
    marketEstimate.fillableQuantity < parsedQty;

  return (
    <div className="flex h-full flex-col glass-panel rounded-lg border border-white/5">
      <div className="relative flex p-1 mx-3 mt-3 bg-black/40 rounded-lg border border-white/5">
        <div 
          className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-md transition-all duration-300 ease-out ${
            isBuy ? "left-1 bg-green-500/15" : "left-[calc(50%+3px)] bg-red-500/15"
          }`}
        />
        <button
          type="button"
          onClick={() => setSide("BUY")}
          className={`relative z-10 flex-1 py-2 text-xs font-bold transition-colors ${
            isBuy ? "text-green-400" : "text-orbit-secondary hover:text-white"
          }`}
        >
          BUY
        </button>
        <button
          type="button"
          onClick={() => setSide("SELL")}
          className={`relative z-10 flex-1 py-2 text-xs font-bold transition-colors ${
            !isBuy ? "text-red-400" : "text-orbit-secondary hover:text-white"
          }`}
        >
          SELL
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-1 flex-col p-3 mt-1">
        <div className="mb-4 relative flex p-1 bg-white/5 rounded-md border border-white/5">
          <div 
            className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white/10 rounded shadow-sm transition-all duration-300 ease-out ${
              orderType === "LIMIT" ? "left-1" : "left-[calc(50%+3px)]"
            }`}
          />
          {(["LIMIT", "MARKET"] as OrderType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setOrderType(t)}
              className={`relative z-10 flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                orderType === t ? "text-white" : "text-orbit-muted hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {orderType === "LIMIT" && (
          <Field
            label={`Price (INR)`}
            value={price}
            onChange={setPrice}
            placeholder={pricePlaceholder}
          />
        )}

        {orderType === "MARKET" && marketEstimate && marketEstimate.averagePrice > 0 && (
          <div className="mb-3 rounded bg-white/5 border border-white/5 px-3 py-2 text-xs text-orbit-secondary">
            Est. avg price{" "}
            <span className="tabular-nums text-white font-medium">
              {marketEstimate.averagePrice.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              INR
            </span>
          </div>
        )}

        <Field
          label={`Amount (${symbol})`}
          value={quantity}
          onChange={setQuantity}
          placeholder="0.0000"
        />

        <div className="mb-3">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-orbit-muted">
            {orderType === "MARKET"
              ? side === "BUY"
                ? "Est. cost (INR)"
                : "Est. proceeds (INR)"
              : "Total (INR)"}
          </div>
          <div className="rounded bg-black/20 border border-white/5 px-3 py-2 text-sm tabular-nums text-white">
            {total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        {showPartialLiquidityWarning && (
          <div className="mb-3 rounded border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs text-orange-400">
            Only {marketEstimate!.fillableQuantity.toLocaleString("en-IN", { maximumFractionDigits: 4 })}{" "}
            {symbol} available at market. Unfilled size is cancelled after execution.
          </div>
        )}

        <div className="mb-3 grid grid-cols-4 gap-2">
          {PERCENTAGES.map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => applyPercentage(pct)}
              className="rounded border border-white/8 py-1.5 text-[10px] font-medium text-orbit-secondary transition hover:border-white/20 hover:bg-white/5 hover:text-white"
            >
              {pct}%
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-3 rounded border border-orbit-red/30 bg-orbit-red/10 px-3 py-1.5 text-xs text-orbit-red">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-3 rounded border border-orbit-green/30 bg-orbit-green/10 px-3 py-1.5 text-xs text-orbit-green">
            {success}
          </div>
        )}

        <div className="mt-auto space-y-2.5 border-t border-white/5 pt-4">
          <div className="flex justify-between text-xs">
            <span className="text-orbit-muted">Available</span>
            <span className="tabular-nums text-orbit-secondary font-medium">
              {isBuy
                ? `${inrAvailable.toLocaleString("en-IN", { maximumFractionDigits: 2 })} INR`
                : `${stockAvailable.toLocaleString("en-IN", { maximumFractionDigits: 4 })} ${symbol}`}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-orbit-muted">Fee</span>
            <span className="text-orbit-secondary font-medium">0.10%</span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full rounded-lg py-3 mt-2 text-sm font-bold text-white transition hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 shadow-lg ${
              isBuy ? "bg-gradient-to-r from-green-600 to-emerald-500" : "bg-gradient-to-r from-red-600 to-rose-500"
            }`}
          >
            {loading
              ? "Placing..."
              : `Place ${side === "BUY" ? "Buy" : "Sell"} ${orderType === "MARKET" ? "Market" : ""} Order`.trim()}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-[10px] uppercase tracking-wider text-orbit-muted">
        {label}
      </label>
      <input
        type="number"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded bg-black/20 border border-white/8 px-3 py-2 text-sm tabular-nums outline-none transition focus:border-white/20 focus:ring-0"
      />
    </div>
  );
}
