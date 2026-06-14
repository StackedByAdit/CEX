import { useState } from "react";
import type { Balance, Fill, Order, Stock } from "../../types";
import { cancelOrder } from "../../lib/api";

type Tab = "open" | "history" | "trades" | "funds";

interface OrdersPanelProps {
  orders: Order[];
  trades: Fill[];
  balances: Record<string, Balance>;
  stocks: Stock[];
  onRefresh: () => void;
}

function toNum(v: string | number | null | undefined) {
  if (v === null || v === undefined) return 0;
  return typeof v === "string" ? parseFloat(v) : v;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function OrdersPanel({
  orders,
  trades,
  balances,
  stocks,
  onRefresh,
}: OrdersPanelProps) {
  const [tab, setTab] = useState<Tab>("open");
  const [cancelling, setCancelling] = useState<string | null>(null);

  const openOrders = orders.filter(
    (o) => o.status === "PENDING" || o.status === "PARTIALLY_FILLED",
  );
  const historyOrders = orders.filter(
    (o) => o.status === "FILLED" || o.status === "CANCELLED",
  );

  async function handleCancel(orderId: string) {
    setCancelling(orderId);
    try {
      await cancelOrder(orderId);
      onRefresh();
    } catch {
      /* ignore */
    } finally {
      setCancelling(null);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "open", label: "Open Orders" },
    { id: "history", label: "Order History" },
    { id: "trades", label: "Trade History" },
    { id: "funds", label: "Funds" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-orbit-panel">
      <div className="flex shrink-0 border-b border-orbit-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider transition ${
              tab === t.id
                ? "border-b-2 border-white text-white"
                : "text-orbit-muted hover:text-orbit-secondary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "open" && (
          <OrdersTable
            orders={openOrders}
            showCancel
            onCancel={handleCancel}
            cancelling={cancelling}
            stocks={stocks}
          />
        )}
        {tab === "history" && <OrdersTable orders={historyOrders} stocks={stocks} />}
        {tab === "trades" && <TradesTable trades={trades} />}
        {tab === "funds" && <FundsTable balances={balances} stocks={stocks} />}
      </div>
    </div>
  );
}

function OrdersTable({
  orders,
  showCancel,
  onCancel,
  cancelling,
  stocks,
}: {
  orders: Order[];
  showCancel?: boolean;
  onCancel?: (id: string) => void;
  cancelling?: string | null;
  stocks: Stock[];
}) {
  const stockMap = Object.fromEntries(stocks.map((s) => [s.id, s.symbol]));

  if (orders.length === 0) {
    return <EmptyState message="No orders" />;
  }

  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-orbit-panel text-[10px] uppercase tracking-wider text-orbit-muted">
        <tr className="border-b border-orbit-border">
          <th className="px-3 py-2 text-left font-medium">Time</th>
          <th className="px-3 py-2 text-left font-medium">Pair</th>
          <th className="px-3 py-2 text-left font-medium">Type</th>
          <th className="px-3 py-2 text-left font-medium">Side</th>
          <th className="px-3 py-2 text-right font-medium">Price</th>
          <th className="px-3 py-2 text-right font-medium">Amount</th>
          <th className="px-3 py-2 text-right font-medium">Filled</th>
          {showCancel && <th className="px-3 py-2 text-right font-medium">Action</th>}
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => {
          const qty = toNum(order.quantity);
          const filled = toNum(order.filledQuantity);
          const pct = qty > 0 ? ((filled / qty) * 100).toFixed(1) : "0";
          const pair = stockMap[order.stockId] ?? "—";

          return (
            <tr key={order.id} className="border-b border-orbit-border/50 hover:bg-orbit-elevated/30">
              <td className="px-3 py-2 text-orbit-secondary">{formatTime(order.createdAt)}</td>
              <td className="px-3 py-2">{pair}/INR</td>
              <td className="px-3 py-2 text-orbit-secondary">{order.type}</td>
              <td className={`px-3 py-2 ${order.side === "BUY" ? "text-orbit-green" : "text-orbit-red"}`}>
                {order.side}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {order.price ? toNum(order.price).toFixed(2) : "—"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{qty.toFixed(4)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{pct}%</td>
              {showCancel && onCancel && (
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => onCancel(order.id)}
                    disabled={cancelling === order.id}
                    className="text-orbit-red hover:underline disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TradesTable({ trades }: { trades: Fill[] }) {
  if (trades.length === 0) {
    return <EmptyState message="No trades yet" />;
  }

  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-orbit-panel text-[10px] uppercase tracking-wider text-orbit-muted">
        <tr className="border-b border-orbit-border">
          <th className="px-3 py-2 text-left font-medium">Time</th>
          <th className="px-3 py-2 text-right font-medium">Price</th>
          <th className="px-3 py-2 text-right font-medium">Quantity</th>
        </tr>
      </thead>
      <tbody>
        {trades.map((t) => (
          <tr key={t.id} className="border-b border-orbit-border/50 hover:bg-orbit-elevated/30">
            <td className="px-3 py-2 text-orbit-secondary">{formatTime(t.createdAt)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{toNum(t.price).toFixed(2)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{toNum(t.quantity).toFixed(4)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FundsTable({
  balances,
  stocks,
}: {
  balances: Record<string, Balance>;
  stocks: Stock[];
}) {
  const rows = [
    { symbol: "INR", title: "Indian Rupee", ...balances.INR },
    ...stocks.map((s) => ({ symbol: s.symbol, title: s.title, ...balances[s.symbol] })),
  ].filter((r) => r.available !== undefined || r.locked !== undefined);

  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-orbit-panel text-[10px] uppercase tracking-wider text-orbit-muted">
        <tr className="border-b border-orbit-border">
          <th className="px-3 py-2 text-left font-medium">Asset</th>
          <th className="px-3 py-2 text-right font-medium">Available</th>
          <th className="px-3 py-2 text-right font-medium">Locked</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.symbol} className="border-b border-orbit-border/50 hover:bg-orbit-elevated/30">
            <td className="px-3 py-2">
              <div className="font-medium">{row.symbol}</div>
              <div className="text-[10px] text-orbit-muted">{row.title}</div>
            </td>
            <td className="px-3 py-2 text-right tabular-nums">
              {(row.available ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 4 })}
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-orbit-secondary">
              {(row.locked ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 4 })}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-32 items-center justify-center text-sm text-orbit-muted">{message}</div>
  );
}
