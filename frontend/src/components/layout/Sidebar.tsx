import { useState, useEffect, useRef } from "react";
import { History, Layers, LineChart, TrendingUp, Wallet, X } from "lucide-react";
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
  const [notification, setNotification] = useState<"futures" | "options" | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleIconClick = (type: "futures" | "options") => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setNotification(type);
    timerRef.current = setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  const closeNotification = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setNotification(null);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

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

      {/* Futures */}
      <div className="relative w-full">
        <button
          title="Futures"
          onClick={() => handleIconClick("futures")}
          className="relative flex h-14 w-full flex-col items-center justify-center gap-1 transition-all duration-200 text-orbit-secondary hover:bg-white/5 hover:text-white cursor-pointer"
        >
          <LineChart size={20} strokeWidth={1.5} />
          <span className="absolute top-3 right-3 w-1.5 h-1.5 bg-yellow-400 rounded-full" />
        </button>

        {notification === "futures" && (
          <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50 flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#12141d]/95 backdrop-blur-xl px-3.5 py-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.6),0_0_20px_rgba(99,102,241,0.15)] text-xs text-white whitespace-nowrap animate-in fade-in slide-in-from-left-2 duration-200">
            {/* Arrow pointing to icon */}
            <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-[#12141d] border-b border-l border-white/10 rotate-45" />
            <span className="relative z-10 flex items-center gap-2 font-medium">
              <span className="h-2 w-2 rounded-full bg-yellow-400 shrink-0" />
              <span>Futures will be launched in <span className="font-semibold text-indigo-400">v2.0.2</span></span>
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeNotification();
              }}
              className="relative z-10 ml-1 rounded p-1 text-orbit-secondary hover:bg-white/10 hover:text-white transition cursor-pointer"
              title="Close"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Options */}
      <div className="relative w-full">
        <button
          title="Options"
          onClick={() => handleIconClick("options")}
          className="relative flex h-14 w-full flex-col items-center justify-center gap-1 transition-all duration-200 text-orbit-secondary hover:bg-white/5 hover:text-white cursor-pointer"
        >
          <Layers size={20} strokeWidth={1.5} />
          <span className="absolute top-3 right-3 w-1.5 h-1.5 bg-yellow-400 rounded-full" />
        </button>

        {notification === "options" && (
          <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50 flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#12141d]/95 backdrop-blur-xl px-3.5 py-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.6),0_0_20px_rgba(99,102,241,0.15)] text-xs text-white whitespace-nowrap animate-in fade-in slide-in-from-left-2 duration-200">
            {/* Arrow pointing to icon */}
            <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-[#12141d] border-b border-l border-white/10 rotate-45" />
            <span className="relative z-10 flex items-center gap-2 font-medium">
              <span className="h-2 w-2 rounded-full bg-yellow-400 shrink-0" />
              <span>Options will be launched in <span className="font-semibold text-indigo-400">v2.0.2</span></span>
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeNotification();
              }}
              className="relative z-10 ml-1 rounded p-1 text-orbit-secondary hover:bg-white/10 hover:text-white transition cursor-pointer"
              title="Close"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

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

