import { useState, useMemo } from "react";
import type { Balance, Stock } from "../../types";
import { Wallet, ArrowDownLeft, ArrowUpRight, ShieldCheck, CreditCard, RefreshCw, Sparkles } from "lucide-react";

interface WalletViewProps {
  balances: Record<string, Balance>;
  stocks: Stock[];
  onRefresh: () => void;
}

export default function WalletView({ balances, stocks, onRefresh }: WalletViewProps) {
  const [depositAmount, setDepositAmount] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<"overview" | "deposit" | "withdraw">("overview");

  const inrAvailable = balances["INR"]?.available ?? 0;
  const inrLocked = balances["INR"]?.locked ?? 0;
  const inrTotal = inrAvailable + inrLocked;

  // Combine balances with stock metadata
  const assetRows = useMemo(() => {
    const list = [
      {
        symbol: "INR",
        title: "Indian Rupee",
        available: inrAvailable,
        locked: inrLocked,
        total: inrTotal,
      },
      ...stocks.map((s) => {
        const bal = balances[s.symbol];
        const avail = bal?.available ?? 0;
        const lock = bal?.locked ?? 0;
        return {
          symbol: s.symbol,
          title: s.title,
          available: avail,
          locked: lock,
          total: avail + lock,
        };
      }),
    ];
    return list;
  }, [balances, stocks, inrAvailable, inrLocked, inrTotal]);

  const handleDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(depositAmount);
    if (!amt || amt <= 0) return;
    setToast(`Deposit request of ₹${amt.toLocaleString("en-IN")} received! (Feature in demo mode)`);
    setDepositAmount("");
    setTimeout(() => setToast(null), 4000);
  };

  const setPreset = (amt: number) => {
    setDepositAmount(amt.toString());
  };

  return (
    <div className="flex flex-1 flex-col min-h-0 bg-[#0a0a0a] text-white p-4 md:p-6 overflow-hidden">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 shrink-0">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2 tracking-tight">
            <Wallet className="text-indigo-400" size={24} />
            Wallet & Assets Management
          </h1>
          <p className="text-xs text-orbit-secondary mt-1">
            Manage your fiat balances, crypto assets, deposits, and withdrawal funds.
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="flex items-center gap-2 self-start md:self-auto px-3.5 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs font-medium hover:bg-white/10 transition active:scale-95"
        >
          <RefreshCw size={14} />
          Refresh Balances
        </button>
      </div>

      {/* Main KPI Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 shrink-0">
        {/* Net Worth Card */}
        <div className="p-5 rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-900/20 via-orbit-panel to-orbit-panel backdrop-blur-md relative overflow-hidden group">
          <div className="absolute right-3 top-3 p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
            <Sparkles size={20} />
          </div>
          <div className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">
            Total Net Worth
          </div>
          <div className="text-3xl font-bold mt-2 text-white tabular-nums tracking-tight">
            ₹{inrTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/5 text-xs text-orbit-secondary">
            <div>
              <span className="text-orbit-muted">Available: </span>
              <span className="font-semibold text-white">₹{inrAvailable.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
            </div>
            <div>
              <span className="text-orbit-muted">In Orders: </span>
              <span className="font-semibold text-white">₹{inrLocked.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {/* Quick Deposit Card */}
        <div className="p-5 rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-900/10 via-orbit-panel to-orbit-panel backdrop-blur-md relative">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
              Quick Add INR
            </div>
            <CreditCard size={18} className="text-emerald-400" />
          </div>
          <p className="text-xs text-orbit-secondary mb-3">
            Instantly add funds to your wallet balance for trading.
          </p>
          <div className="flex gap-2">
            {[1000, 5000, 10000].map((amt) => (
              <button
                key={amt}
                onClick={() => setPreset(amt)}
                className="flex-1 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/20 transition"
              >
                +₹{amt >= 1000 ? `${amt / 1000}k` : amt}
              </button>
            ))}
          </div>
        </div>

        {/* Security / Status Card */}
        <div className="p-5 rounded-2xl border border-white/5 bg-orbit-panel/80 backdrop-blur-md flex flex-col justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <ShieldCheck size={20} />
            </div>
            <div>
              <div className="text-xs font-bold text-white">Account Security</div>
              <div className="text-[11px] text-emerald-400 font-medium">Level 2 Verified</div>
            </div>
          </div>
          <div className="text-xs text-orbit-secondary mt-3">
            Instant 0% fee deposit available via UPI & Net Banking.
          </div>
        </div>
      </div>

      {/* Main Glass Panel */}
      <div className="flex flex-1 flex-col min-h-0 rounded-2xl border border-white/5 bg-orbit-panel/80 backdrop-blur-md overflow-hidden">
        {/* Navigation Sub-Tabs */}
        <div className="flex items-center justify-between p-3 border-b border-white/5 bg-black/20 shrink-0">
          <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl">
            <button
              onClick={() => setActiveSubTab("overview")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeSubTab === "overview"
                  ? "bg-indigo-600 text-white shadow-md"
                  : "text-orbit-secondary hover:text-white hover:bg-white/5"
              }`}
            >
              Assets Overview
            </button>
            <button
              onClick={() => setActiveSubTab("deposit")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeSubTab === "deposit"
                  ? "bg-indigo-600 text-white shadow-md"
                  : "text-orbit-secondary hover:text-white hover:bg-white/5"
              }`}
            >
              Deposit Funds
            </button>
            <button
              onClick={() => setActiveSubTab("withdraw")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeSubTab === "withdraw"
                  ? "bg-indigo-600 text-white shadow-md"
                  : "text-orbit-secondary hover:text-white hover:bg-white/5"
              }`}
            >
              Withdraw Funds
            </button>
          </div>
        </div>

        {/* Container Content */}
        <div className="flex-1 min-h-0 overflow-auto p-4">
          {activeSubTab === "overview" && (
            <div className="w-full h-full min-h-0 overflow-auto">
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="sticky top-0 bg-black/80 backdrop-blur-md text-[10px] uppercase tracking-wider text-orbit-secondary z-10 border-b border-white/5">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Asset Name</th>
                    <th className="px-5 py-3 text-right font-semibold">Available Balance</th>
                    <th className="px-5 py-3 text-right font-semibold">Locked in Orders</th>
                    <th className="px-5 py-3 text-right font-semibold">Total Balance</th>
                    <th className="px-5 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {assetRows.map((asset) => (
                    <tr key={asset.symbol} className="hover:bg-white/3 transition-colors">
                      <td className="px-5 py-4 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center text-xs font-bold border border-white/10">
                          {asset.symbol[0]}
                        </div>
                        <div>
                          <div className="font-bold text-sm text-white">{asset.symbol}</div>
                          <div className="text-xs text-orbit-secondary">{asset.title}</div>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-right tabular-nums text-sm font-medium text-white">
                        {asset.available.toLocaleString("en-IN", { maximumFractionDigits: 4 })}
                      </td>

                      <td className="px-5 py-4 text-right tabular-nums text-orbit-secondary text-sm">
                        {asset.locked.toLocaleString("en-IN", { maximumFractionDigits: 4 })}
                      </td>

                      <td className="px-5 py-4 text-right tabular-nums text-sm font-bold text-indigo-400">
                        {asset.total.toLocaleString("en-IN", { maximumFractionDigits: 4 })}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setActiveSubTab("deposit")}
                            className="px-3 py-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition"
                          >
                            Deposit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeSubTab === "deposit" && (
            <div className="max-w-xl mx-auto py-4">
              <div className="p-6 rounded-2xl border border-white/5 bg-white/3 backdrop-blur-md">
                <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
                  <ArrowDownLeft className="text-emerald-400" size={20} />
                  Deposit INR Funds
                </h2>
                <p className="text-xs text-orbit-secondary mb-6">
                  Add INR to your wallet using Instant UPI or Bank Transfer.
                </p>

                <form onSubmit={handleDeposit} className="space-y-4">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-orbit-secondary mb-2 font-medium">
                      Deposit Amount (INR)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-2.5 text-orbit-secondary font-bold text-sm">₹</span>
                      <input
                        type="number"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        placeholder="Enter amount (e.g. 5000)"
                        className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-white/10 bg-black/40 text-sm font-semibold text-white placeholder-orbit-muted outline-none focus:border-indigo-500 transition"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {[500, 2000, 5000, 10000, 50000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setPreset(amt)}
                        className="flex-1 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs font-semibold hover:border-indigo-500 hover:text-indigo-400 transition"
                      >
                        ₹{amt >= 1000 ? `${amt / 1000}k` : amt}
                      </button>
                    ))}
                  </div>

                  {toast && (
                    <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-medium">
                      {toast}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm shadow-lg hover:opacity-90 active:scale-[0.99] transition"
                  >
                    Confirm Deposit
                  </button>
                </form>
              </div>
            </div>
          )}

          {activeSubTab === "withdraw" && (
            <div className="max-w-xl mx-auto py-4">
              <div className="p-6 rounded-2xl border border-white/5 bg-white/3 backdrop-blur-md text-center">
                <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-3 text-indigo-400">
                  <ArrowUpRight size={24} />
                </div>
                <h2 className="text-lg font-bold mb-1">Withdraw Funds</h2>
                <p className="text-xs text-orbit-secondary mb-6">
                  Direct transfer to verified bank account (24-7 processing).
                </p>

                <div className="p-4 rounded-xl border border-white/5 bg-black/30 text-xs text-orbit-secondary mb-4">
                  Available for withdrawal: <span className="font-bold text-white">₹{inrAvailable.toLocaleString("en-IN")} INR</span>
                </div>

                <button
                  onClick={() => alert("Withdrawals enabled in live production environment.")}
                  className="px-6 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold hover:bg-white/10 transition"
                >
                  Initiate Withdrawal
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
