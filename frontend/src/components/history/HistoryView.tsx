import { useState, useMemo } from "react";
import type { Fill, Order, Stock, Balance } from "../../types";
import { Search, History, ArrowUpRight, ArrowDownRight, RefreshCw } from "lucide-react";
import AssetDropdown from "../common/AssetDropdown";

interface HistoryViewProps {
  orders: Order[];
  trades: Fill[];
  stocks: Stock[];
  balances: Record<string, Balance>;
  onRefresh: () => void;
}

type MainTab = "trades" | "orders" | "funds";
type OrderStatusFilter = "ALL" | "FILLED" | "CANCELLED" | "PENDING";
type SideFilter = "ALL" | "BUY" | "SELL";

function toNum(v: string | number | null | undefined) {
  if (v === null || v === undefined) return 0;
  return typeof v === "string" ? parseFloat(v) : v;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    year: "numeric",
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
    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${style}`}>
      {status}
    </span>
  );
}

function SideBadge({ side }: { side: string }) {
  const isBuy = side === "BUY";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
        isBuy
          ? "bg-green-500/10 text-green-400 border-green-500/20"
          : "bg-red-500/10 text-red-400 border-red-500/20"
      }`}
    >
      {isBuy ? <ArrowDownRight size={10} /> : <ArrowUpRight size={10} />}
      {side}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-semibold border bg-white/5 text-orbit-secondary border-white/10">
      {type}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
        role === "Maker"
          ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
          : "bg-orange-500/10 text-orange-400 border-orange-500/20"
      }`}
    >
      {role}
    </span>
  );
}

export default function HistoryView({
  orders,
  trades,
  stocks,
  balances,
  onRefresh,
}: HistoryViewProps) {
  const [activeTab, setActiveTab] = useState<MainTab>("trades");
  const [symbolFilter, setSymbolFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>("ALL");
  const [sideFilter, setSideFilter] = useState<SideFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const stockMap = useMemo(
    () => Object.fromEntries(stocks.map((s) => [s.id, s.symbol])),
    [stocks],
  );

  // Statistics
  const stats = useMemo(() => {
    let totalVolume = 0;
    let totalFees = 0;
    trades.forEach((t) => {
      const price = toNum(t.price);
      const qty = toNum(t.quantity);
      const val = price * qty;
      totalVolume += val;
      totalFees += val * 0.001; // 0.1% fee
    });
    return {
      totalOrders: orders.length,
      totalTrades: trades.length,
      totalVolume,
      totalFees,
    };
  }, [orders, trades]);

  // Filtered Trades
  const filteredTrades = useMemo(() => {
    return trades
      .filter((t) => {
        const sym = t.symbol ?? "—";
        if (symbolFilter !== "ALL" && sym !== symbolFilter) return false;
        const side = t.side ?? "BUY";
        if (sideFilter !== "ALL" && side !== sideFilter) return false;
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          if (!sym.toLowerCase().includes(query) && !t.id.toLowerCase().includes(query)) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [trades, symbolFilter, sideFilter, searchQuery]);

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders
      .filter((o) => {
        const pair = stockMap[o.stockId] ?? "—";
        if (symbolFilter !== "ALL" && pair !== symbolFilter) return false;
        if (statusFilter !== "ALL" && o.status !== statusFilter) return false;
        if (sideFilter !== "ALL" && o.side !== sideFilter) return false;
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          if (!pair.toLowerCase().includes(query) && !o.id.toLowerCase().includes(query)) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, stockMap, symbolFilter, statusFilter, sideFilter, searchQuery]);

  return (
    <div className="flex flex-1 flex-col min-h-0 bg-[#0a0a0a] text-white p-4 md:p-6 overflow-hidden">
      {/* Header & Stats bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 shrink-0">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2 tracking-tight">
            <History className="text-indigo-400" size={24} />
            Account Activity & History
          </h1>
          <p className="text-xs text-orbit-secondary mt-1">
            Complete record of your past executions, limit orders, and transaction history.
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="flex items-center gap-2 self-start md:self-auto px-3.5 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs font-medium hover:bg-white/10 transition active:scale-95"
        >
          <RefreshCw size={14} />
          Refresh Data
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 shrink-0">
        <div className="p-4 rounded-xl border border-white/5 bg-white/3 backdrop-blur-md">
          <div className="text-[11px] text-orbit-secondary uppercase tracking-wider font-medium">
            Total Trades
          </div>
          <div className="text-2xl font-bold mt-1 text-indigo-400 tabular-nums">
            {stats.totalTrades}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-white/5 bg-white/3 backdrop-blur-md">
          <div className="text-[11px] text-orbit-secondary uppercase tracking-wider font-medium">
            Total Orders Placed
          </div>
          <div className="text-2xl font-bold mt-1 text-white tabular-nums">
            {stats.totalOrders}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-white/5 bg-white/3 backdrop-blur-md">
          <div className="text-[11px] text-orbit-secondary uppercase tracking-wider font-medium">
            Executed Volume
          </div>
          <div className="text-2xl font-bold mt-1 text-emerald-400 tabular-nums">
            ₹{stats.totalVolume.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-white/5 bg-white/3 backdrop-blur-md">
          <div className="text-[11px] text-orbit-secondary uppercase tracking-wider font-medium">
            Total Fees Paid (0.1%)
          </div>
          <div className="text-2xl font-bold mt-1 text-purple-400 tabular-nums">
            ₹{stats.totalFees.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Main Content Box with Glass Border */}
      <div className="flex flex-1 flex-col min-h-0 rounded-2xl border border-white/5 bg-orbit-panel/80 backdrop-blur-md overflow-hidden">
        {/* Navigation Tabs & Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 border-b border-white/5 bg-black/20 shrink-0">
          {/* Main Sub-Tabs */}
          <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl">
            {(["trades", "orders", "funds"] as MainTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                  activeTab === tab
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-orbit-secondary hover:text-white hover:bg-white/5"
                }`}
              >
                {tab === "trades" ? "Trade History" : tab === "orders" ? "Order History" : "Asset Balances"}
              </button>
            ))}
          </div>

          {/* Filter Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-orbit-secondary" />
              <input
                type="text"
                placeholder="Search Pair / ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg border border-white/10 bg-black/40 text-xs text-white placeholder-orbit-muted outline-none focus:border-indigo-500 transition w-36 md:w-48"
              />
            </div>

            {/* Pair Selector */}
            <AssetDropdown
              symbol={symbolFilter}
              stocks={stocks}
              onSymbolChange={setSymbolFilter}
              size="sm"
              showAllOption
            />

            {/* Side Selector */}
            <div className="flex items-center gap-1 border border-white/10 rounded-lg px-2 py-1.5 bg-black/40 text-xs">
              <select
                value={sideFilter}
                onChange={(e) => setSideFilter(e.target.value as SideFilter)}
                className="bg-transparent text-white outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-orbit-panel">All Sides</option>
                <option value="BUY" className="bg-orbit-panel">Buy Only</option>
                <option value="SELL" className="bg-orbit-panel">Sell Only</option>
              </select>
            </div>

            {/* Status Selector (For Orders) */}
            {activeTab === "orders" && (
              <div className="flex items-center gap-1 border border-white/10 rounded-lg px-2 py-1.5 bg-black/40 text-xs">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as OrderStatusFilter)}
                  className="bg-transparent text-white outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-orbit-panel">All Statuses</option>
                  <option value="FILLED" className="bg-orbit-panel">Fulfilled</option>
                  <option value="PENDING" className="bg-orbit-panel">Pending</option>
                  <option value="CANCELLED" className="bg-orbit-panel">Cancelled</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Scrollable Data Table Container */}
        <div className="flex-1 min-h-0 overflow-auto">
          {activeTab === "trades" && (
            <TradesHistoryTable trades={filteredTrades} />
          )}

          {activeTab === "orders" && (
            <OrdersHistoryTable orders={filteredOrders} stockMap={stockMap} />
          )}

          {activeTab === "funds" && (
            <FundsHistoryTable balances={balances} stocks={stocks} />
          )}
        </div>
      </div>
    </div>
  );
}

function TradesHistoryTable({ trades }: { trades: Fill[] }) {
  if (trades.length === 0) {
    return <EmptyState message="No trade records match your filters" />;
  }

  return (
    <div className="w-full h-full min-h-0 overflow-auto">
      <table className="w-full text-xs text-left whitespace-nowrap">
        <thead className="sticky top-0 bg-black/80 backdrop-blur-md text-[10px] uppercase tracking-wider text-orbit-secondary z-10 border-b border-white/5">
          <tr>
            <th className="px-5 py-3 font-semibold">Date & Time</th>
            <th className="px-5 py-3 font-semibold">Trading Pair</th>
            <th className="px-5 py-3 font-semibold">Order Type</th>
            <th className="px-5 py-3 font-semibold">Side</th>
            <th className="px-5 py-3 font-semibold">Role</th>
            <th className="px-5 py-3 text-right font-semibold">Price (INR)</th>
            <th className="px-5 py-3 text-right font-semibold">Executed Qty</th>
            <th className="px-5 py-3 text-right font-semibold">Trading Fee (INR)</th>
            <th className="px-5 py-3 text-right font-semibold">Total Value (INR)</th>
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
              <tr key={t.id} className="hover:bg-white/3 transition-colors">
                <td className="px-5 py-3.5 text-orbit-secondary font-mono text-[11px]">
                  {formatTime(t.createdAt)}
                </td>
                <td className="px-5 py-3.5 font-bold text-sm">{symbol}/INR</td>
                <td className="px-5 py-3.5"><TypeBadge type={orderType} /></td>
                <td className="px-5 py-3.5"><SideBadge side={side} /></td>
                <td className="px-5 py-3.5"><RoleBadge role={role} /></td>
                <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-white">
                  ₹{price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-5 py-3.5 text-right tabular-nums text-orbit-secondary">
                  {qty.toFixed(4)}
                </td>
                <td className="px-5 py-3.5 text-right tabular-nums text-purple-400 font-mono text-[11px]">
                  ₹{fee.toFixed(4)}
                </td>
                <td className="px-5 py-3.5 text-right tabular-nums font-bold text-emerald-400">
                  ₹{total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OrdersHistoryTable({
  orders,
  stockMap,
}: {
  orders: Order[];
  stockMap: Record<string, string>;
}) {
  if (orders.length === 0) {
    return <EmptyState message="No order records match your filters" />;
  }

  return (
    <div className="w-full h-full min-h-0 overflow-auto">
      <table className="w-full text-xs text-left whitespace-nowrap">
        <thead className="sticky top-0 bg-black/80 backdrop-blur-md text-[10px] uppercase tracking-wider text-orbit-secondary z-10 border-b border-white/5">
          <tr>
            <th className="px-5 py-3 font-semibold">Date & Time</th>
            <th className="px-5 py-3 font-semibold">Pair</th>
            <th className="px-5 py-3 font-semibold">Type</th>
            <th className="px-5 py-3 font-semibold">Side</th>
            <th className="px-5 py-3 text-right font-semibold">Order Price</th>
            <th className="px-5 py-3 text-right font-semibold">Order Amount</th>
            <th className="px-5 py-3 text-right font-semibold">Filled Qty</th>
            <th className="px-5 py-3 text-right font-semibold">Fill %</th>
            <th className="px-5 py-3 font-semibold">Status</th>
            <th className="px-5 py-3 text-right font-semibold">Total Est. (INR)</th>
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
              <tr key={order.id} className="hover:bg-white/3 transition-colors">
                <td className="px-5 py-3.5 text-orbit-secondary font-mono text-[11px]">
                  {formatTime(order.createdAt)}
                </td>
                <td className="px-5 py-3.5 font-bold text-sm">{pair}/INR</td>
                <td className="px-5 py-3.5"><TypeBadge type={order.type} /></td>
                <td className="px-5 py-3.5"><SideBadge side={order.side} /></td>
                <td className="px-5 py-3.5 text-right tabular-nums font-semibold">
                  {price > 0
                    ? `₹${price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : "Market Price"}
                </td>
                <td className="px-5 py-3.5 text-right tabular-nums">{qty.toFixed(4)}</td>
                <td className="px-5 py-3.5 text-right tabular-nums text-orbit-secondary">
                  {filled.toFixed(4)}
                </td>
                <td className="px-5 py-3.5 text-right tabular-nums font-mono text-[11px] text-indigo-400">
                  {pct}%
                </td>
                <td className="px-5 py-3.5"><StatusBadge status={order.status} /></td>
                <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-white">
                  {total > 0
                    ? `₹${total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FundsHistoryTable({
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
    <div className="w-full h-full min-h-0 overflow-auto p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map((row) => {
          const available = row.available ?? 0;
          const locked = row.locked ?? 0;
          const total = available + locked;

          return (
            <div
              key={row.symbol}
              className="p-5 rounded-2xl border border-white/5 bg-white/3 hover:bg-white/5 transition flex flex-col justify-between"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center text-sm font-bold border border-white/10">
                  {row.symbol[0]}
                </div>
                <div>
                  <h3 className="font-bold text-base">{row.symbol}</h3>
                  <p className="text-xs text-orbit-secondary">{row.title}</p>
                </div>
              </div>

              <div className="space-y-2 pt-3 border-t border-white/5 text-xs">
                <div className="flex justify-between">
                  <span className="text-orbit-secondary">Available Balance</span>
                  <span className="font-semibold tabular-nums text-white">
                    {available.toLocaleString("en-IN", { maximumFractionDigits: 4 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-orbit-secondary">Locked in Orders</span>
                  <span className="tabular-nums text-orbit-secondary">
                    {locked.toLocaleString("en-IN", { maximumFractionDigits: 4 })}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-white/5 text-sm font-bold">
                  <span className="text-indigo-400">Total Asset Value</span>
                  <span className="tabular-nums text-white">
                    {total.toLocaleString("en-IN", { maximumFractionDigits: 4 })} {row.symbol}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-64 items-center justify-center text-orbit-secondary italic text-xs">
      {message}
    </div>
  );
}
