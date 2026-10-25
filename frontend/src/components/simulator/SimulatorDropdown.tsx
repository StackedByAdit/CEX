import { useEffect, useState } from "react";
import type { Stock } from "../../types";
import { useSimulator } from "../../lib/simulator/useSimulator";
import type { Speed, Aggression } from "../../lib/simulator/simulatorService";
import {
  Activity,
  Bot,
  ExternalLink,
  Play,
  Square,
  X,
  Zap,
} from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onOpenFullScreen: () => void;
  stocks: Stock[];
}

export default function SimulatorDropdown({
  isOpen,
  onClose,
  onOpenFullScreen,
  stocks,
}: Props) {
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
  } = useSimulator();

  const [, setTick] = useState(0);

  // Keep stats fresh
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  if (!isOpen) return null;

  const currentTps = stats.tpsHistory[stats.tpsHistory.length - 1] ?? 0;

  return (
    <div className="fixed top-14 right-4 z-[90] w-[400px] max-w-[calc(100vw-32px)] rounded-2xl border border-white/10 bg-[#10131c]/95 backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.85),0_0_30px_rgba(99,102,241,0.2)] text-white overflow-hidden animate-in fade-in slide-in-from-top-3 duration-200">
      {/* ── Dropdown Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Zap size={14} />
          </div>
          <span className="text-xs font-bold tracking-tight">Market Simulator</span>
          {isRunning ? (
            <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2 py-0.2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              LIVE
            </span>
          ) : (
            <span className="text-[10px] text-orbit-secondary bg-white/5 border border-white/10 rounded-full px-2 py-0.2">
              OFF
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onOpenFullScreen}
            title="Expand to Full Screen"
            className="flex items-center gap-1 p-1.5 rounded-lg text-orbit-secondary hover:text-white hover:bg-white/5 transition text-[11px] cursor-pointer"
          >
            <ExternalLink size={13} />
            <span className="hidden sm:inline">Fullscreen</span>
          </button>
          <button
            onClick={onClose}
            title="Close panel"
            className="p-1.5 rounded-lg text-orbit-secondary hover:text-white hover:bg-white/5 transition cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Body Content ── */}
      <div className="p-4 space-y-4 max-h-[calc(100vh-120px)] overflow-y-auto">
        {/* Trader Slider */}
        <div className="space-y-1.5 bg-white/[0.02] border border-white/5 rounded-xl p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-orbit-secondary flex items-center gap-1.5">
              <Bot size={13} className="text-indigo-400" />
              Simultaneous Traders
            </span>
            <span className="font-bold text-indigo-400 tabular-nums">
              {botCount} <span className="text-[10px] text-orbit-secondary font-normal">bots</span>
            </span>
          </div>

          <input
            type="range"
            min={2}
            max={50}
            step={1}
            value={botCount}
            disabled={isRunning}
            onChange={(e) => setBotCount(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 bg-white/10 accent-indigo-500"
          />

          <div className="flex items-center justify-between text-[10px] text-orbit-secondary pt-0.5">
            <span>2</span>
            <div className="flex items-center gap-1">
              {[5, 10, 20, 40].map((num) => (
                <button
                  key={num}
                  disabled={isRunning}
                  onClick={() => setBotCount(num)}
                  className={`px-1.5 py-0.2 rounded text-[10px] transition cursor-pointer disabled:opacity-30 ${
                    botCount === num
                      ? "bg-indigo-500 text-white font-semibold"
                      : "bg-white/5 text-orbit-secondary hover:text-white"
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
            <span>50</span>
          </div>
        </div>

        {/* Configuration Row */}
        <div className="grid grid-cols-3 gap-2">
          {/* Symbol */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide text-orbit-secondary block">
              Pair
            </label>
            <select
              value={symbol}
              disabled={isRunning}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none disabled:opacity-40 cursor-pointer"
            >
              {stocks.length === 0 ? (
                <option value={symbol}>{symbol}</option>
              ) : (
                stocks.map((s) => (
                  <option key={s.symbol} value={s.symbol} className="bg-[#12141d] text-white">
                    {s.symbol}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Speed */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide text-orbit-secondary block">
              Speed
            </label>
            <div className="flex rounded-lg overflow-hidden border border-white/10 bg-white/5 p-0.5">
              {(["slow", "normal", "fast"] as Speed[]).map((s) => (
                <button
                  key={s}
                  disabled={isRunning}
                  onClick={() => setSpeed(s)}
                  className={`flex-1 py-1 text-[10px] font-medium capitalize rounded transition-colors cursor-pointer disabled:cursor-not-allowed ${
                    speed === s
                      ? "bg-indigo-500 text-white font-semibold"
                      : "text-orbit-secondary hover:text-white disabled:opacity-40"
                  }`}
                >
                  {s[0]?.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Aggression */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide text-orbit-secondary block">
              Mode
            </label>
            <div className="flex rounded-lg overflow-hidden border border-white/10 bg-white/5 p-0.5">
              {(["passive", "mixed", "aggressive"] as Aggression[]).map((a) => (
                <button
                  key={a}
                  disabled={isRunning}
                  onClick={() => setAggression(a)}
                  className={`flex-1 py-1 text-[10px] font-medium capitalize rounded transition-colors cursor-pointer disabled:cursor-not-allowed ${
                    aggression === a
                      ? "bg-indigo-500 text-white font-semibold"
                      : "text-orbit-secondary hover:text-white disabled:opacity-40"
                  }`}
                >
                  {a === "passive" ? "Pas" : a === "mixed" ? "Mix" : "Agr"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Start / Stop Button */}
        <div>
          {!isRunning ? (
            <button
              onClick={() => void start()}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-500/25 transition-all cursor-pointer"
            >
              <Play size={14} fill="currentColor" />
              <span>Start Simulator ({botCount} Traders)</span>
            </button>
          ) : (
            <button
              onClick={stop}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-red-500/25 transition-all cursor-pointer"
            >
              <Square size={14} fill="currentColor" />
              <span>Stop Simulator</span>
            </button>
          )}
        </div>

        {/* Metrics Bar */}
        <div className="grid grid-cols-4 gap-2 bg-white/[0.02] border border-white/5 rounded-xl p-2.5 text-center">
          <div>
            <span className="text-[9px] uppercase tracking-wider text-orbit-secondary block">TPS</span>
            <span className="text-sm font-bold text-emerald-400 tabular-nums">{isRunning ? currentTps : 0}</span>
          </div>
          <div>
            <span className="text-[9px] uppercase tracking-wider text-orbit-secondary block">Orders</span>
            <span className="text-sm font-bold text-white tabular-nums">{stats.ordersPlaced}</span>
          </div>
          <div>
            <span className="text-[9px] uppercase tracking-wider text-orbit-secondary block">Fills</span>
            <span className="text-sm font-bold text-purple-400 tabular-nums">{stats.fills}</span>
          </div>
          <div>
            <span className="text-[9px] uppercase tracking-wider text-orbit-secondary block">Bots</span>
            <span className="text-sm font-bold text-indigo-400 tabular-nums">{isRunning ? stats.activeBots : 0}</span>
          </div>
        </div>

        {/* ── Simplified 1-Sentence Status Bar ── */}
        <div
          className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs border transition-all duration-200 ${
            !isRunning
              ? "bg-white/[0.03] border-white/10 text-orbit-secondary"
              : stats.activeBots === 0
              ? "bg-amber-500/10 border-amber-500/25 text-amber-300"
              : stats.ordersPlaced === 0
              ? "bg-blue-500/10 border-blue-500/25 text-blue-300"
              : "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
          }`}
        >
          {/* Status Indicator Icon */}
          <div className="shrink-0 flex items-center justify-center w-2.5 h-2.5">
            {!isRunning ? (
              <span className="w-2 h-2 rounded-full bg-white/30 block" />
            ) : stats.activeBots === 0 ? (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping block" />
            ) : stats.ordersPlaced === 0 ? (
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse block" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse block" />
            )}
          </div>

          {/* 1-Sentence Status Text */}
          <div className="flex-1 min-w-0 leading-tight">
            <span className="font-semibold uppercase tracking-wider text-[10px] mr-1.5 opacity-80">
              {!isRunning
                ? "Standby:"
                : stats.activeBots === 0
                ? "Initializing:"
                : stats.ordersPlaced === 0
                ? "Warming Up:"
                : "Live:"}
            </span>
            <span className="text-[11px]">
              {!isRunning
                ? `Choose trader count and press Start to launch ${botCount} bots.`
                : stats.activeBots === 0
                ? `Authenticating & funding ${botCount} trader accounts... please wait.`
                : stats.ordersPlaced === 0
                ? `${stats.activeBots} bots ready — seeding orderbook liquidity...`
                : `${stats.activeBots} bots actively trading ${symbol} at ${currentTps} TPS.`}
            </span>
          </div>
        </div>

        {/* Mini Live Ticker (Last 3 orders) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-orbit-secondary">
            <span className="flex items-center gap-1 uppercase tracking-wide">
              <Activity size={11} className="text-indigo-400" />
              Live Trade Stream
            </span>
            <span>{logs.length} trades</span>
          </div>

          <div className="rounded-xl bg-[#06080e] border border-white/5 p-2 font-mono text-[11px] space-y-1 max-h-24 overflow-y-auto">
            {logs.length === 0 ? (
              <div className="text-center py-2 text-orbit-secondary/40 text-[10px]">
                {isRunning ? "Running bot trades…" : "Start simulation to observe trades"}
              </div>
            ) : (
              logs.slice(0, 4).map((entry, idx) => (
                <div key={idx} className="flex items-center gap-2 truncate text-white/70">
                  <span className="text-white/30 text-[10px]">[{entry.time}]</span>
                  <span className="text-indigo-300 font-semibold text-[10px]">b-{entry.botId}</span>
                  <span
                    className={`text-[10px] font-bold ${
                      entry.action.includes("BUY") ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {entry.action.split(" ")[0]}
                  </span>
                  <span className="truncate flex-1 text-white/60 text-[10px]">{entry.detail}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
