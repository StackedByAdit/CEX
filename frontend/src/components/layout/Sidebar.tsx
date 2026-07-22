import { History, Layers, LineChart, TrendingUp, Wallet } from "lucide-react";
import type { Balance, Stock } from "../../types";

interface SidebarProps {
  activeTab: "spot" | "wallet" | "history";
  onSelectTab: (tab: "spot" | "wallet" | "history") => void;
  balances?: Record<string, Balance>;
  stocks?: Stock[];
}

export default function Sidebar({
  activeTab,
  onSelectTab,
}: SidebarProps) {
  return (
    <aside className="hidden w-14 shrink-0 flex-col bg-orbit-panel/80 backdrop-blur-md border-r border-white/5 lg:flex relative z-40">
      {/* Spot / Trading */}
      <button
        title="Spot Trading"
        onClick={() => onSelectTab("spot")}
        className={`flex h-14 w-full flex-col items-center justify-center gap-1 transition-all duration-200 ${
          activeTab === "spot"
            ? "text-white border-l-2 border-indigo-400 bg-white/5"
            : "text-orbit-secondary hover:bg-white/5 hover:text-white"
        }`}
      >
        <TrendingUp size={20} strokeWidth={1.5} />
      </button>

      {/* Futures - Coming Soon */}
      <button
        title="Futures · Coming in v2"
        className="relative flex h-14 w-full flex-col items-center justify-center gap-1 transition-all duration-200 text-orbit-secondary hover:bg-white/5 hover:text-white"
      >
        <LineChart size={20} strokeWidth={1.5} />
        <span className="absolute top-3 right-3 w-1.5 h-1.5 bg-yellow-400 rounded-full" />
      </button>

      {/* Options - Coming Soon */}
      <button
        title="Options · Coming in v2"
        className="relative flex h-14 w-full flex-col items-center justify-center gap-1 transition-all duration-200 text-orbit-secondary hover:bg-white/5 hover:text-white"
      >
        <Layers size={20} strokeWidth={1.5} />
        <span className="absolute top-3 right-3 w-1.5 h-1.5 bg-yellow-400 rounded-full" />
      </button>

      {/* Wallet - Switches View on Main Screen */}
      <button
        title="Wallet & Assets"
        onClick={() => onSelectTab("wallet")}
        className={`flex h-14 w-full flex-col items-center justify-center gap-1 transition-all duration-200 ${
          activeTab === "wallet"
            ? "text-white border-l-2 border-indigo-400 bg-white/5"
            : "text-orbit-secondary hover:bg-white/5 hover:text-white"
        }`}
      >
        <Wallet size={20} strokeWidth={1.5} />
      </button>

      {/* History - Switches View on Main Screen */}
      <button
        title="Trade & Order History"
        onClick={() => onSelectTab("history")}
        className={`flex h-14 w-full flex-col items-center justify-center gap-1 transition-all duration-200 ${
          activeTab === "history"
            ? "text-white border-l-2 border-indigo-400 bg-white/5"
            : "text-orbit-secondary hover:bg-white/5 hover:text-white"
        }`}
      >
        <History size={20} strokeWidth={1.5} />
      </button>
    </aside>
  );
}
