import { useMemo, useState } from "react";
import type { Balance, OrderSide, OrderType } from "../../types";
import { ApiError, placeOrder } from "../../lib/api";
import { toPrice } from "../../lib/format";

interface OrderFormProps {
  symbol: string;
  lastPrice: number | null;
  balances: Record<string, Balance>;
  onOrderPlaced: () => void;
}

const PERCENTAGES = [25, 50, 75, 100] as const;

export default function OrderForm({
  symbol,
  lastPrice,
  balances,
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

  const total = useMemo(() => {
    const p = parseFloat(price) || 0;
    const q = parseFloat(quantity) || 0;
    return p * q;
  }, [price, quantity]);

  function applyPercentage(pct: number) {
    if (side === "BUY") {
      const p = parseFloat(price) || toPrice(lastPrice) || 0;
      if (p <= 0) return;
      const maxQty = inrAvailable / p;
      setQuantity(((maxQty * pct) / 100).toFixed(4));
    } else {
      setQuantity(((stockAvailable * pct) / 100).toFixed(4));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const qty = parseFloat(quantity);
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

    try {
      const result = await placeOrder({
        side,
        type: orderType,
        symbol,
        quantity: qty,
        ...(orderType === "LIMIT" ? { price: pr } : {}),
      });

      setSuccess(`Order ${result.status.toLowerCase().replace("_", " ")}`);
      setQuantity("");
      onOrderPlaced();
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

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-2 border-b border-orbit-border">
        <button
          type="button"
          onClick={() => setSide("BUY")}
          className={`py-3 text-sm font-semibold transition ${
            isBuy ? "bg-white/10 text-white" : "text-orbit-secondary hover:text-white"
          }`}
        >
          Buy
        </button>
        <button
          type="button"
          onClick={() => setSide("SELL")}
          className={`py-3 text-sm font-semibold transition ${
            !isBuy ? "bg-white/10 text-white" : "text-orbit-secondary hover:text-white"
          }`}
        >
          Sell
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-1 flex-col p-4">
        <div className="mb-4 flex gap-1">
          {(["LIMIT", "MARKET"] as OrderType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setOrderType(t)}
              className={`flex-1 rounded py-1.5 text-[10px] font-medium uppercase tracking-wider transition ${
                orderType === t
                  ? "bg-orbit-elevated text-white"
                  : "text-orbit-muted hover:text-orbit-secondary"
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

        <Field
          label={`Amount (${symbol})`}
          value={quantity}
          onChange={setQuantity}
          placeholder="0.0000"
        />

        {orderType === "LIMIT" && (
          <div className="mb-4">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-orbit-muted">
              Total (INR)
            </div>
            <div className="rounded bg-orbit-elevated px-3 py-2.5 text-sm tabular-nums text-orbit-secondary">
              {total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        )}

        <div className="mb-4 grid grid-cols-4 gap-1">
          {PERCENTAGES.map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => applyPercentage(pct)}
              className="rounded border border-orbit-border py-1 text-[10px] text-orbit-secondary transition hover:border-orbit-muted hover:text-white"
            >
              {pct}%
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-3 rounded border border-orbit-red/30 bg-orbit-red/10 px-3 py-2 text-xs text-orbit-red">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-3 rounded border border-orbit-green/30 bg-orbit-green/10 px-3 py-2 text-xs text-orbit-green">
            {success}
          </div>
        )}

        <div className="mt-auto space-y-3 border-t border-orbit-border pt-4">
          <div className="flex justify-between text-xs">
            <span className="text-orbit-muted">Available</span>
            <span className="tabular-nums text-orbit-secondary">
              {isBuy
                ? `${inrAvailable.toLocaleString("en-IN", { maximumFractionDigits: 2 })} INR`
                : `${stockAvailable.toLocaleString("en-IN", { maximumFractionDigits: 4 })} ${symbol}`}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-orbit-muted">Fee</span>
            <span className="text-orbit-secondary">0.10%</span>
          </div>

          <button
            type="submit"
            disabled={loading || orderType === "MARKET"}
            className="w-full rounded bg-white py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading
              ? "Placing..."
              : orderType === "MARKET"
                ? "Market orders unavailable"
                : `Place ${side === "BUY" ? "Buy" : "Sell"} Order`}
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
        className="w-full rounded bg-orbit-elevated px-3 py-2.5 text-sm tabular-nums outline-none ring-white/20 transition focus:ring-2"
      />
    </div>
  );
}
