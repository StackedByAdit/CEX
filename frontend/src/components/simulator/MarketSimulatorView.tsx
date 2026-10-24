import { useEffect, useState } from "react";
import type { Stock } from "../../types";
import { useSimulator } from "../../lib/simulator/useSimulator";
import type { Speed, Aggression } from "../../lib/simulator/simulatorService";
import {
  Activity,
  Bot,
  CheckCircle2,
  Gauge,
  Play,
  RotateCcw,
  Square,
  Terminal,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";

interface Props {
  symbol: string;
  stocks: Stock[];
}

function formatUptime(startedAt: number): string {
  if (!startedAt) return "—";
  const secs = Math.floor((Date.now() - startedAt) / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function MarketSimulatorView({ symbol: defaultSymbol, stocks }: Props) {
  const {
    isRunning,
    botCount,
    symbol,
    speed,
    aggression,
    stats,
    logs,
    start,
    stop,
    setBotCount,
    setSymbol,
    setSpeed,
    setAggression,
    clearLogs,
  } = useSimulator();

  const [, setTick] = useState(0);
  const [logFilter, setLogFilter] = useState<"all" | "orders" | "fills" | "errors">("all");

  // Keep uptime fresh every second
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  // Set default symbol if not already set
  useEffect(() => {
    if (!symbol && defaultSymbol) {
      setSymbol(defaultSymbol);
    }
  }, [symbol, defaultSymbol, setSymbol]);

  const fillRate =
    stats.ordersPlaced > 0
      ? ((stats.fills / stats.ordersPlaced) * 100).toFixed(1) + "%"
      : "—";

  const currentTps = stats.tpsHistory[stats.tpsHistory.length - 1] ?? 0;
  const maxTps = Math.max(...stats.tpsHistory, 1);

  const filteredLogs = logs.filter((log) => {
    if (logFilter === "all") return true;
    if (logFilter === "fills") return log.detail.includes("FILLED") || log.action === "DEPOSIT";
    if (logFilter === "orders") return log.action.includes("LIMIT") || log.action.includes("MARKET");
    if (logFilter === "errors") return !log.ok;
    return true;
  });

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[#0a0c10] text-white">
      {/* ── Top Header Bar ── */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-white/[0.02] px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Zap size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-bold tracking-tight">Market Simulation Command Center</span>
              {isRunning ? (
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2.5 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  SIMULATION ACTIVE
                </span>
              ) : (
                <span className="text-[11px] font-medium text-orbit-secondary bg-white/5 border border-white/10 rounded-full px-2.5 py-0.5">
                  IDLE
                </span>
              )}
            </div>
            <p className="text-[11px] text-orbit-secondary">
              Stress-test the orderbook matching engine with concurrent autonomous trader bots
            </p>
          </div>
        </div>

        {/* Quick actions in header */}
        <div className="flex items-center gap-4">
          {isRunning && (
            <div className="hidden md:flex items-center gap-4 text-xs text-orbit-secondary bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5">
              <span className="flex items-center gap-1.5">
                <Bot size={13} className="text-indigo-400" />
                <span className="font-semibold text-white">{stats.activeBots}</span> bots
              </span>
              <span className="text-white/20">|</span>
              <span className="flex items-center gap-1.5">
                <Gauge size={13} className="text-emerald-400" />
                <span className="font-semibold text-white">{currentTps}</span> orders/s
              </span>
              <span className="text-white/20">|</span>
              <span>Uptime: <strong className="text-white">{formatUptime(stats.startedAt)}</strong></span>
            </div>
          )}

          {!isRunning ? (
            <button
              onClick={() => void start()}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs font-semibold rounded-lg shadow-lg shadow-indigo-500/20 transition-all cursor-pointer"
            >
              <Play size={13} fill="currentColor" />
              <span>Start Simulation</span>
            </button>
          ) : (
            <button
              onClick={stop}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-red-500/20 transition-all cursor-pointer"
            >
              <Square size={13} fill="currentColor" />
              <span>Stop Simulation</span>
            </button>
          )}
        </div>
      </header>

      {/* ── Main Two-Column Layout ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Left Column: Configuration & Metrics ── */}
        <div className="w-[52%] xl:w-[48%] flex flex-col min-h-0 border-r border-white/10 overflow-y-auto p-6 space-y-6">
          {/* Controls Card */}
          <div className="rounded-2xl border border-white/10 bg-[#10131c]/60 p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <span className="text-xs font-semibold tracking-wide uppercase text-orbit-secondary flex items-center gap-2">
                <Bot size={14} className="text-indigo-400" />
                Bot Swarm Parameters
              </span>
              <span className="text-[11px] text-yellow-400/90 bg-yellow-400/10 border border-yellow-400/20 rounded-md px-2 py-0.5">
                Liquidity-Aware Matching
              </span>
            </div>

            {/* Slider: Number of Traders */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-white block">Trader Swarm Size</span>
                  <span className="text-[11px] text-orbit-secondary">Number of concurrent bot accounts trading in parallel</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-indigo-400 tabular-nums">{botCount}</span>
                  <span className="text-xs text-orbit-secondary">traders</span>
                </div>
              </div>

              <input
                type="range"
                min={2}
                max={50}
                step={1}
                value={botCount}
                disabled={isRunning}
                onChange={(e) => setBotCount(Number(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 bg-white/10 accent-indigo-500"
              />

              <div className="flex items-center justify-between text-[10px] text-orbit-secondary pt-1">
                <span>2 bots (light test)</span>
                {/* Presets */}
                <div className="flex items-center gap-1.5">
                  {[5, 15, 30, 50].map((num) => (
                    <button
                      key={num}
                      disabled={isRunning}
                      onClick={() => setBotCount(num)}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition cursor-pointer disabled:opacity-30 ${
                        botCount === num
                          ? "bg-indigo-500 text-white"
                          : "bg-white/5 text-orbit-secondary hover:text-white"
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
                <span>50 bots (stress test)</span>
              </div>
            </div>

            {/* Configuration Row */}
            <div className="grid grid-cols-3 gap-3 pt-2">
              {/* Symbol */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-orbit-secondary uppercase tracking-wide block">
                  Asset Pair
                </label>
                <select
                  value={symbol}
                  disabled={isRunning}
                  onChange={(e) => setSymbol(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 disabled:opacity-40 cursor-pointer"
                >
                  {stocks.length === 0 ? (
                    <option value={symbol}>{symbol}</option>
                  ) : (
                    stocks.map((s) => (
                      <option key={s.symbol} value={s.symbol} className="bg-[#12141d] text-white">
                        {s.symbol} ({s.title ?? "Stock"})
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Speed */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-orbit-secondary uppercase tracking-wide block">
                  Pacing
                </label>
                <div className="flex rounded-xl overflow-hidden border border-white/10 bg-white/5 p-0.5">
                  {(["slow", "normal", "fast"] as Speed[]).map((s) => (
                    <button
                      key={s}
                      disabled={isRunning}
                      onClick={() => setSpeed(s)}
                      className={`flex-1 py-1.5 text-[11px] font-medium capitalize rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed ${
                        speed === s
                          ? "bg-indigo-500 text-white shadow-sm"
                          : "text-orbit-secondary hover:text-white disabled:opacity-40"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Aggression */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-orbit-secondary uppercase tracking-wide block">
                  Aggression
                </label>
                <div className="flex rounded-xl overflow-hidden border border-white/10 bg-white/5 p-0.5">
                  {(["passive", "mixed", "aggressive"] as Aggression[]).map((a) => (
                    <button
                      key={a}
                      disabled={isRunning}
                      onClick={() => setAggression(a)}
                      className={`flex-1 py-1.5 text-[11px] font-medium capitalize rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed ${
                        aggression === a
                          ? a === "aggressive"
                            ? "bg-red-500 text-white"
                            : a === "mixed"
                            ? "bg-indigo-500 text-white"
                            : "bg-emerald-500 text-white"
                          : "text-orbit-secondary hover:text-white disabled:opacity-40"
                      }`}
                    >
                      {a === "passive" ? "Pasv" : a === "mixed" ? "Mix" : "Aggr"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Simplified 1-Sentence Status Bar ── */}
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-xs border transition-all duration-200 ${
              !isRunning
                ? "bg-white/[0.02] border-white/10 text-orbit-secondary"
                : stats.activeBots === 0
                ? "bg-amber-500/10 border-amber-500/25 text-amber-300"
                : stats.ordersPlaced === 0
                ? "bg-blue-500/10 border-blue-500/25 text-blue-300"
                : "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
            }`}
          >
            <div className="shrink-0 flex items-center justify-center w-3 h-3">
              {!isRunning ? (
                <span className="w-2.5 h-2.5 rounded-full bg-white/30 block" />
              ) : stats.activeBots === 0 ? (
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping block" />
              ) : stats.ordersPlaced === 0 ? (
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse block" />
              ) : (
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse block" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <span className="font-bold uppercase tracking-wider text-[11px] mr-2">
                {!isRunning
                  ? "Standby:"
                  : stats.activeBots === 0
                  ? "Initializing Swarm:"
                  : stats.ordersPlaced === 0
                  ? "Warming Up:"
                  : "Live Execution:"}
              </span>
              <span className="text-xs">
                {!isRunning
                  ? `Choose trader count and settings above, then press Start Simulation to deploy ${botCount} bots.`
                  : stats.activeBots === 0
                  ? `Authenticating & funding ${botCount} trader accounts with test INR and ${symbol}... please wait.`
                  : stats.ordersPlaced === 0
                  ? `${stats.activeBots} bots authenticated — inspecting orderbook depth and placing first trades...`
                  : `${stats.activeBots} bots actively placing concurrent orders on ${symbol} at ${currentTps} orders/sec.`}
              </span>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wide uppercase text-orbit-secondary flex items-center gap-2">
                <Activity size={14} className="text-emerald-400" />
                Real-Time Exchange Throughput
              </span>
              <span className="text-[11px] text-orbit-secondary">Auto-refreshes every tick</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: "Active Bot Traders",
                  value: isRunning ? stats.activeBots : "0",
                  sub: `of ${botCount} configured`,
                  accent: "text-indigo-400",
                },
                {
                  label: "Orders / Sec (TPS)",
                  value: isRunning ? currentTps : "0",
                  sub: `Peak: ${Math.max(...stats.tpsHistory, 0)} TPS`,
                  accent: "text-emerald-400",
                },
                {
                  label: "Total Orders Placed",
                  value: stats.ordersPlaced.toLocaleString(),
                  sub: "Both limit & market",
                  accent: "text-white",
                },
                {
                  label: "Order Fill Rate",
                  value: fillRate,
                  sub: `${stats.fills.toLocaleString()} fills matched`,
                  accent: "text-purple-400",
                },
                {
                  label: "Matching Errors",
                  value: stats.errors,
                  sub: stats.errors === 0 ? "Zero errors" : "Rejections",
                  accent: stats.errors > 0 ? "text-red-400" : "text-white",
                },
                {
                  label: "Session Duration",
                  value: isRunning ? formatUptime(stats.startedAt) : "—",
                  sub: isRunning ? "Running live" : "Standby",
                  accent: "text-white",
                },
              ].map((card) => (
                <div
                  key={card.label}
                  className="rounded-2xl border border-white/8 bg-[#10131c]/50 p-4 flex flex-col justify-between"
                >
                  <span className="text-[10px] font-semibold tracking-wider uppercase text-orbit-secondary">
                    {card.label}
                  </span>
                  <div className="my-2">
                    <span className={`text-2xl font-bold tracking-tight tabular-nums ${card.accent}`}>
                      {card.value}
                    </span>
                  </div>
                  <span className="text-[11px] text-orbit-secondary truncate">{card.sub}</span>
                </div>
              ))}
            </div>
          </div>

          {/* TPS Sparkline Chart */}
          <div className="rounded-2xl border border-white/10 bg-[#10131c]/60 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp size={14} className="text-indigo-400" />
                <span className="text-xs font-semibold uppercase tracking-wide text-white">
                  Throughput Velocity (Last 30 Seconds)
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-orbit-secondary">Current: <strong className="text-white">{currentTps} TPS</strong></span>
                <span className="text-orbit-secondary">Peak: <strong className="text-indigo-400">{maxTps} TPS</strong></span>
              </div>
            </div>

            {/* Sparkline Bars */}
            <div className="flex items-end gap-1.5 h-16 pt-2">
              {stats.tpsHistory.map((val, idx) => {
                const heightPct = Math.max(8, Math.round((val / maxTps) * 100));
                return (
                  <div
                    key={idx}
                    className="flex-1 flex flex-col items-center justify-end h-full group relative"
                  >
                    <div
                      style={{ height: `${heightPct}%` }}
                      className={`w-full rounded-sm transition-all duration-300 ${
                        val > 0
                          ? "bg-gradient-to-t from-indigo-600 to-indigo-400 group-hover:from-indigo-400 group-hover:to-indigo-300"
                          : "bg-white/5"
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Right Column: Full-Height Live Activity Stream ── */}
        <div className="flex-1 flex flex-col min-h-0 bg-[#07090e] p-6">
          <div className="flex items-center justify-between pb-3 shrink-0 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <Terminal size={16} className="text-indigo-400" />
              <span className="text-sm font-semibold tracking-wide text-white">Live Activity Stream</span>
              <span className="text-[11px] text-orbit-secondary font-mono">({filteredLogs.length} events)</span>
            </div>

            {/* Filter Pills + Clear */}
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg overflow-hidden border border-white/10 bg-white/5 p-0.5 text-xs">
                {(["all", "orders", "fills", "errors"] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setLogFilter(filter)}
                    className={`px-2.5 py-1 text-[11px] font-medium capitalize rounded-md transition cursor-pointer ${
                      logFilter === filter
                        ? "bg-white/15 text-white font-semibold"
                        : "text-orbit-secondary hover:text-white"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              {logs.length > 0 && (
                <button
                  onClick={clearLogs}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-white/10 text-orbit-secondary hover:text-white hover:bg-white/5 text-xs transition cursor-pointer"
                  title="Clear Log"
                >
                  <RotateCcw size={12} />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>

          {/* Activity Terminal */}
          <div className="flex-1 min-h-0 overflow-y-auto mt-4 rounded-2xl bg-[#04060a] border border-white/10 p-4 font-mono text-xs space-y-1.5">
            {filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-orbit-secondary/40 space-y-2 py-12">
                <Terminal size={32} strokeWidth={1.5} />
                <p className="text-xs">
                  {isRunning ? "Waiting for new bot order events…" : "Start the simulation to stream live bot activity"}
                </p>
              </div>
            ) : (
              filteredLogs.map((entry, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-2.5 py-1 px-2 rounded-lg transition-colors hover:bg-white/[0.03] ${
                    entry.ok ? "text-white/80" : "text-red-400/90 bg-red-500/5"
                  }`}
                >
                  <span className="text-white/30 shrink-0 text-[11px]">[{entry.time}]</span>
                  <span className="px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-300 font-semibold text-[11px] shrink-0 border border-indigo-500/20">
                    bot-{String(entry.botId).padStart(2, "0")}
                  </span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[11px] font-bold shrink-0 ${
                      entry.action.includes("BUY")
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                        : entry.action.includes("SELL")
                        ? "bg-red-500/15 text-red-400 border border-red-500/20"
                        : "bg-white/10 text-orbit-secondary"
                    }`}
                  >
                    {entry.action}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-[11px] text-white/70">
                    {entry.detail}
                  </span>
                  <span className="shrink-0 text-xs">
                    {entry.ok ? (
                      <CheckCircle2 size={13} className="text-emerald-400" />
                    ) : (
                      <XCircle size={13} className="text-red-400" />
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
