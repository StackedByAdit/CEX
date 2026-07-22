import { useState } from "react";
import type { Balance, Fill, Order, Stock } from "../../types";
import { cancelOrder, ApiError } from "../../lib/api";

type Tab = "open" | "fulfilled" | "history" | "trades" | "funds";

interface OrdersPanelProps {
  orders: Order[];
  trades: Fill[];
  balances: Record<string, Balance>;
  stocks: Stock[];
  onRefresh: () => void;
  onOrderCancelled?: (orderId: string) => void;
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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    FILLED: "bg-green-500/10 text-green-400 border-green-500/20",
    CANCELLED: "bg-red-500/10 text-red-400 border-red-500/20",
    PENDING: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    PARTIALLY_FILLED: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  };
  const style = styles[status] || "bg-white/10 text-white border-white/20";
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${style}`}>
      {status}
    </span>
  );
}

function SideBadge({ side }: { side: string }) {
  const isBuy = side === "BUY";
  return (
    <span
      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
        isBuy
          ? "bg-green-500/10 text-green-400 border-green-500/20"
          : "bg-red-500/10 text-red-400 border-red-500/20"
      }`}
    >
      {side}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-white/5 text-orbit-secondary border-white/10">
      {type}
    </span>
  );
}

export default function OrdersPanel({
  orders,
  trades,
  balances,
  stocks,
  onRefresh,
  onOrderCancelled,
}: OrdersPanelProps) {
  const [tab, setTab] = useState<Tab>("open");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const sortByTimeDesc = <T extends { createdAt: string }>(list: T[]) =>
    [...list].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  const openOrders = sortByTimeDesc(
    orders.filter(
      (o) =>
        o.type === "LIMIT" &&
        (o.status === "PENDING" || o.status === "PARTIALLY_FILLED"),
    ),
  );
  const fulfilledOrders = sortByTimeDesc(orders.filter((o) => o.status === "FILLED"));
  const historyOrders = sortByTimeDesc(
    orders.filter((o) => o.status === "FILLED" || o.status === "CANCELLED"),
  );
  const sortedTrades = sortByTimeDesc(trades);

  async function handleCancel(orderId: string) {
    setCancelling(orderId);
    setCancelError(null);
    try {
      await cancelOrder(orderId);
      onOrderCancelled?.(orderId);
      onRefresh();
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : "Failed to cancel order");
    } finally {
      setCancelling(null);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "open", label: "Open Orders" },
    { id: "fulfilled", label: "Fulfilled Orders" },
    { id: "history", label: "Order History" },
    { id: "trades", label: "Trade History" },
    { id: "funds", label: "Funds" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-orbit-panel/80 backdrop-blur-md border-0 border-t border-white/5 overflow-hidden">
      <div className="relative flex px-2 pt-1 gap-1 border-b border-white/5 bg-black/20 shrink-0">
        {tabs.map((t) => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                isActive ? "text-white" : "text-orbit-muted hover:text-white"
              }`}
            >
              {t.label}
              {isActive && (
                <span className="absolute bottom-[-1px] left-0 w-full h-[2px] bg-indigo-400 rounded-t-full shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
              )}
            </button>
          );
        })}
      </div>

      {cancelError && (
        <div className="border-b border-orbit-border bg-orbit-red/10 px-3 py-1 text-xs text-orbit-red shrink-0">
          {cancelError}
        </div>
      )}

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
        {tab === "fulfilled" && <OrdersTable orders={fulfilledOrders} stocks={stocks} />}
        {tab === "history" && <OrdersTable orders={historyOrders} stocks={stocks} />}
        {tab === "trades" && <TradesTable trades={sortedTrades} />}
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
    return <EmptyState message="No open orders" />;
  }

  return (
    <div className="w-full h-full min-h-0 overflow-auto">
      <table className="w-full text-xs whitespace-nowrap text-left">
        <thead className="sticky top-0 bg-[#121212] backdrop-blur-md text-[10px] uppercase tracking-wider text-orbit-muted z-10 border-b border-white/5">
          <tr>
            <th className="px-3 py-1.5 font-medium">Time</th>
            <th className="px-3 py-1.5 font-medium">Pair</th>
            <th className="px-3 py-1.5 font-medium">Type</th>
            <th className="px-3 py-1.5 font-medium">Side</th>
            <th className="px-3 py-1.5 text-right font-medium">Price</th>
            <th className="px-3 py-1.5 text-right font-medium">Amount</th>
            <th className="px-3 py-1.5 text-right font-medium">Filled %</th>
            <th className="px-3 py-1.5 font-medium">Status</th>
            <th className="px-3 py-1.5 text-right font-medium">Total (INR)</th>
            {showCancel && <th className="px-3 py-1.5 text-right font-medium">Action</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {orders.map((order) => {
            const qty = toNum(order.quantity);
            const filled = toNum(order.filledQuantity);
            const pct = qty > 0 ? ((filled / qty) * 100).toFixed(1) : "0";
            const pair = stockMap[order.stockId] ?? "—";
            const price = order.price ? toNum(order.price) : 0;
            const total = price > 0 ? price * qty : 0;

            return (
              <tr key={order.id} className="hover:bg-white/5 transition-colors">
                <td className="px-3 py-1.5 text-orbit-secondary text-[11px]">
                  {formatTime(order.createdAt)}
                </td>
                <td className="px-3 py-1.5 font-medium">{pair}/INR</td>
                <td className="px-3 py-1.5"><TypeBadge type={order.type} /></td>
                <td className="px-3 py-1.5"><SideBadge side={order.side} /></td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {price > 0 ? price.toFixed(2) : "Market"}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{qty.toFixed(4)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-orbit-secondary">{pct}%</td>
                <td className="px-3 py-1.5"><StatusBadge status={order.status} /></td>
                <td className="px-3 py-1.5 text-right tabular-nums text-orbit-secondary">
                  {total > 0 ? total.toFixed(2) : "—"}
                </td>
                {showCancel && onCancel && (
                  <td className="px-3 py-1.5 text-right">
                    <button
                      onClick={() => onCancel(order.id)}
                      disabled={cancelling === order.id}
                      className="text-orbit-red hover:text-red-400 hover:underline disabled:opacity-50 transition-colors text-xs"
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
    </div>
  );
}

function TradesTable({ trades }: { trades: Fill[] }) {
  if (trades.length === 0) {
    return <EmptyState message="No trades yet" />;
  }

  return (
    <div className="w-full h-full min-h-0 overflow-auto">
      <table className="w-full text-xs whitespace-nowrap text-left">
        <thead className="sticky top-0 bg-[#121212] backdrop-blur-md text-[10px] uppercase tracking-wider text-orbit-muted z-10 border-b border-white/5">
          <tr>
            <th className="px-3 py-1.5 font-medium">Time</th>
            <th className="px-3 py-1.5 font-medium">Pair</th>
            <th className="px-3 py-1.5 font-medium">Type</th>
            <th className="px-3 py-1.5 font-medium">Side</th>
            <th className="px-3 py-1.5 font-medium">Role</th>
            <th className="px-3 py-1.5 text-right font-medium">Price</th>
            <th className="px-3 py-1.5 text-right font-medium">Quantity</th>
            <th className="px-3 py-1.5 text-right font-medium">Fee</th>
            <th className="px-3 py-1.5 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {trades.map((t) => {
            const side = t.side ?? "BUY";
            const symbol = t.symbol ?? "—";
            const price = toNum(t.price);
            const qty = toNum(t.quantity);
            const total = price * qty;
            
            const myOrder = side === "BUY" ? t.buyOrder : t.sellOrder;
            const orderType = myOrder?.type ?? "MARKET";
            const role = orderType === "LIMIT" ? "Maker" : "Taker";
            const fee = total * 0.001;

            return (
              <tr key={t.id} className="hover:bg-white/5 transition-colors">
                <td className="px-3 py-1.5 text-orbit-secondary text-[11px]">
                  {formatTime(t.createdAt)}
                </td>
                <td className="px-3 py-1.5 font-medium">{symbol}/INR</td>
                <td className="px-3 py-1.5"><TypeBadge type={orderType} /></td>
                <td className="px-3 py-1.5"><SideBadge side={side} /></td>
                <td className="px-3 py-1.5">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] border ${
                      role === "Maker"
                        ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                        : "bg-orange-500/10 text-orange-400 border-orange-500/20"
                    }`}
                  >
                    {role}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{price.toFixed(2)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{qty.toFixed(4)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-orbit-muted">{fee.toFixed(4)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium">{total.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
    <div className="w-full h-full min-h-0 overflow-auto">
      <table className="w-full text-xs text-left">
        <thead className="sticky top-0 bg-[#121212] backdrop-blur-md text-[10px] uppercase tracking-wider text-orbit-muted z-10 border-b border-white/5">
          <tr>
            <th className="px-3 py-1.5 font-medium">Asset</th>
            <th className="px-3 py-1.5 text-right font-medium">Available</th>
            <th className="px-3 py-1.5 text-right font-medium">Locked</th>
            <th className="px-3 py-1.5 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((row) => {
            const available = row.available ?? 0;
            const locked = row.locked ?? 0;
            const total = available + locked;
            return (
              <tr key={row.symbol} className="hover:bg-white/5 transition-colors">
                <td className="px-3 py-2 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">
                    {row.symbol[0]}
                  </div>
                  <div>
                    <div className="font-bold text-xs">{row.symbol}</div>
                    <div className="text-[10px] text-orbit-muted">{row.title}</div>
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-xs font-medium">
                  {available.toLocaleString("en-IN", { maximumFractionDigits: 4 })}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-orbit-secondary text-xs">
                  {locked.toLocaleString("en-IN", { maximumFractionDigits: 4 })}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-indigo-400 text-xs">
                  {total.toLocaleString("en-IN", { maximumFractionDigits: 4 })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-28 items-center justify-center text-xs text-orbit-muted italic">{message}</div>
  );
}
