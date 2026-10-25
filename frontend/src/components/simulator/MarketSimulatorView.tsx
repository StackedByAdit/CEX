import { useEffect, useRef, useState } from "react";
import type { Stock } from "../../types";
import MarketSimulator from "../../lib/simulator/marketSimulator";
import type { LogEntry, SimulatorStats } from "../../lib/simulator/marketSimulator";

interface Props {
  symbol: string;
  stocks: Stock[];
}

type Speed = "slow" | "normal" | "fast";
type Aggression = "passive" | "mixed" | "aggressive";

const SPEED_MAP: Record<Speed, number> = {
  slow: 3000,
  normal: 1500,
  fast: 500,
};

const DEFAULT_STATS: SimulatorStats = {
  ordersPlaced: 0,
  fills: 0,
  errors: 0,
  startedAt: 0,
  tpsHistory: new Array(30).fill(0),
  activeBots: 0,
};

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

export default function MarketSimulatorView({ symbol, stocks }: Props) {
  const [isRunning, setIsRunning] = useState(false);
  const [botCount, setBotCount] = useState(5);
  const [speed, setSpeed] = useState<Speed>("normal");
  const [aggression, setAggression] = useState<Aggression>("mixed");
  const [stats, setStats] = useState<SimulatorStats>(DEFAULT_STATS);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [, setTick] = useState(0); // for uptime re-render

  const simulatorRef = useRef<MarketSimulator | null>(null);
  const [activeSymbol, setActiveSymbol] = useState(symbol);

  // Uptime ticker
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      simulatorRef.current?.stop();
    };
  }, []);

  const handleStart = async () => {
    if (simulatorRef.current) simulatorRef.current.stop();

    const sim = new MarketSimulator(
      {
        botCount,
        symbol: activeSymbol,
        intervalMs: SPEED_MAP[speed],
        aggression,
      },
      (entry: LogEntry) => {
        setLogs((prev) => [entry, ...prev].slice(0, 200));
      },
      (s: SimulatorStats) => {
        setStats({ ...s });
      },
    );

    simulatorRef.current = sim;
    setIsRunning(true);
    setLogs([]);
    setStats(DEFAULT_STATS);
    await sim.start();
  };

  const handleStop = () => {
    simulatorRef.current?.stop();
    simulatorRef.current = null;
    setIsRunning(false);
  };

  const fillRate =
    stats.ordersPlaced > 0
      ? ((stats.fills / stats.ordersPlaced) * 100).toFixed(1) + "%"
      : "—";

  const currentTps = stats.tpsHistory[stats.tpsHistory.length - 1] ?? 0;
  const maxTps = Math.max(...stats.tpsHistory, 1);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0f1117] text-white">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold tracking-tight">⚡ Market Simulator</span>
            {isRunning ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2.5 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LIVE
              </span>
            ) : (
              <span className="text-xs font-medium text-orbit-secondary bg-white/5 border border-white/10 rounded-full px-2.5 py-0.5">
                OFF
              </span>
            )}
          </div>
          <p className="text-xs text-orbit-secondary mt-0.5">
            Stress-test the exchange with simultaneous bot traders
          </p>
        </div>

        {/* Warning badge */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-yellow-400/80 bg-yellow-400/5 border border-yellow-400/15 rounded-lg px-3 py-1.5">
          <span>⚠️</span>
          <span>Creates real bot accounts &amp; places real orders</span>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="px-6 py-4 border-b border-white/10 shrink-0 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Trader count */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-orbit-secondary uppercase tracking-wide">
                Traders
              </label>
              <span className="text-sm font-semibold text-white tabular-nums">{botCount}</span>
            </div>
            <input
              type="range"
              min={2}
              max={50}
              step={1}
              value={botCount}
              disabled={isRunning}
              onChange={(e) => setBotCount(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-40
                bg-white/10 accent-indigo-400"
            />
            <div className="flex justify-between text-[10px] text-orbit-secondary">
              <span>2</span>
              <span>50</span>
            </div>
          </div>

          {/* Symbol */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-orbit-secondary uppercase tracking-wide block">
              Symbol
            </label>
            <select
              value={activeSymbol}
              disabled={isRunning}
              onChange={(e) => setActiveSymbol(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white
                focus:outline-none focus:border-indigo-400/50 disabled:opacity-40 disabled:cursor-not-allowed
                cursor-pointer"
            >
              {stocks.length === 0 ? (
                <option value={symbol}>{symbol}</option>
              ) : (
                stocks.map((s) => (
                  <option key={s.symbol} value={s.symbol}>
                    {s.symbol}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Speed */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-orbit-secondary uppercase tracking-wide block">
              Speed
            </label>
            <div className="flex rounded-lg overflow-hidden border border-white/10">
              {(["slow", "normal", "fast"] as Speed[]).map((s) => (
                <button
                  key={s}
                  disabled={isRunning}
                  onClick={() => setSpeed(s)}
                  className={`flex-1 py-2 text-xs font-medium capitalize transition-colors disabled:cursor-not-allowed
                    ${speed === s
                      ? "bg-indigo-500/20 text-indigo-300 border-indigo-400/30"
                      : "text-orbit-secondary hover:bg-white/5 hover:text-white disabled:opacity-40"
                    }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Aggression */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-orbit-secondary uppercase tracking-wide block">
              Aggression
            </label>
            <div className="flex rounded-lg overflow-hidden border border-white/10">
              {(["passive", "mixed", "aggressive"] as Aggression[]).map((a) => (
                <button
                  key={a}
                  disabled={isRunning}
                  onClick={() => setAggression(a)}
                  className={`flex-1 py-2 text-xs font-medium capitalize transition-colors disabled:cursor-not-allowed
                    ${aggression === a
                      ? a === "aggressive"
                        ? "bg-red-500/20 text-red-300"
                        : a === "mixed"
                        ? "bg-yellow-500/20 text-yellow-300"
                        : "bg-emerald-500/20 text-emerald-300"
                      : "text-orbit-secondary hover:bg-white/5 hover:text-white disabled:opacity-40"
                    }`}
                >
                  {a === "passive" ? "Pasv" : a === "mixed" ? "Mix" : "Aggr"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Start / Stop */}
        <div className="flex gap-3">
          {!isRunning ? (
            <button
              onClick={handleStart}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500
                text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <span>▶</span> Start Simulation
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-600/80 hover:bg-red-600
                text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <span>■</span> Stop Simulation
            </button>
          )}
        </div>
      </div>

      {/* ── Stats Grid ── */}
      <div className="px-6 py-4 border-b border-white/10 shrink-0">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { label: "Active Bots", value: isRunning ? stats.activeBots : "—" },
            { label: "Orders/sec", value: isRunning ? currentTps : "—" },
            { label: "Total Orders", value: stats.ordersPlaced },
            { label: "Fill Rate", value: fillRate },
            { label: "Errors", value: stats.errors, warn: stats.errors > 0 },
            { label: "Uptime", value: isRunning ? formatUptime(stats.startedAt) : "—" },
          ].map((item) => (
            <div
              key={item.label}
              className="bg-white/[0.03] border border-white/8 rounded-xl px-3 py-3 flex flex-col gap-1"
            >
              <span className="text-[10px] font-medium text-orbit-secondary uppercase tracking-wide">
                {item.label}
              </span>
              <span
                className={`text-lg font-bold tabular-nums ${
                  item.warn ? "text-red-400" : "text-white"
                }`}
              >
                {item.value}
              </span>
            </div>
          ))}
        </div>

        {/* TPS Sparkline */}
        <div className="mt-3">
          <div className="text-[10px] text-orbit-secondary uppercase tracking-wide mb-1.5">
            Orders/sec — last 30s
          </div>
          <div className="flex items-end gap-px h-10">
            {stats.tpsHistory.map((val, i) => {
              const h = Math.max(2, Math.round((val / maxTps) * 40));
              return (
                <div
                  key={i}
                  style={{ height: `${h}px` }}
                  className="flex-1 rounded-sm bg-indigo-500/60 transition-all duration-300"
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Activity Log ── */}
      <div className="flex flex-col flex-1 min-h-0 px-6 py-4">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <span className="text-[10px] font-medium text-orbit-secondary uppercase tracking-wide">
            Activity Log
          </span>
          {logs.length > 0 && (
            <button
              onClick={() => setLogs([])}
              className="text-[10px] text-orbit-secondary hover:text-white transition-colors cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto rounded-xl bg-[#080a0f] border border-white/8 p-3 font-mono text-xs space-y-0.5">
          {logs.length === 0 ? (
            <div className="text-orbit-secondary/50 text-center py-8">
              {isRunning ? "Waiting for bot activity…" : "Start the simulation to see activity"}
            </div>
          ) : (
            logs.map((entry, i) => (
              <div
                key={i}
                className={`flex gap-2 leading-5 ${
                  entry.ok ? "text-emerald-400/90" : "text-red-400/90"
                }`}
              >
                <span className="text-white/30 shrink-0">[{entry.time}]</span>
                <span className="text-indigo-400/80 shrink-0">
                  bot-{String(entry.botId).padStart(2, "0")}
                </span>
                <span className={`shrink-0 font-semibold ${entry.ok ? "text-emerald-300" : "text-red-300"}`}>
                  {entry.action}
                </span>
                <span className="text-white/60 truncate">{entry.detail}</span>
                <span className="shrink-0">{entry.ok ? "✓" : "✗"}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
