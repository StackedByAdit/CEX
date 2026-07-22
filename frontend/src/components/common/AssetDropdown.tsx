import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Sparkles } from "lucide-react";
import type { Stock } from "../../types";

interface AssetDropdownProps {
  symbol: string;
  stocks: Stock[];
  onSymbolChange: (symbol: string) => void;
  size?: "sm" | "md" | "lg";
  showAllOption?: boolean;
}

export default function AssetDropdown({
  symbol,
  stocks,
  onSymbolChange,
  size = "md",
  showAllOption = false,
}: AssetDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedStock = stocks.find((s) => s.symbol === symbol);
  const displayTitle = symbol === "ALL" ? "All Pairs" : symbol;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative inline-block text-left select-none">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`group relative flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-lg transition-all duration-200 hover:bg-white/10 hover:border-indigo-500/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 active:scale-[0.98] ${
          isOpen ? "border-indigo-500/60 bg-indigo-500/10 shadow-[0_0_20px_rgba(99,102,241,0.2)]" : ""
        } ${
          size === "lg"
            ? "px-4 py-2 text-base"
            : size === "sm"
            ? "px-2.5 py-1 text-xs"
            : "px-3.5 py-1.5 text-sm"
        }`}
      >
        <div className="flex items-center gap-2.5">
          {/* Symbol Badge Avatar */}
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500/30 to-purple-600/30 border border-white/15 flex items-center justify-center font-bold text-xs text-indigo-200 shadow-inner group-hover:scale-105 transition-transform">
            {displayTitle[0]}
          </div>

          <div className="flex flex-col text-left">
            <div className="flex items-center gap-1 font-bold tracking-wide text-white">
              <span>{displayTitle}</span>
              {symbol !== "ALL" && (
                <span className="text-[11px] font-normal text-orbit-secondary">/INR</span>
              )}
            </div>
            {selectedStock?.title && (
              <span className="text-[9px] text-orbit-muted truncate max-w-[100px]">
                {selectedStock.title}
              </span>
            )}
          </div>
        </div>

        <ChevronDown
          size={16}
          className={`text-orbit-secondary group-hover:text-white transition-transform duration-300 ${
            isOpen ? "rotate-180 text-indigo-400" : ""
          }`}
        />
      </button>

      {/* Glassmorphic Dropdown Popover */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-[100] w-56 rounded-2xl border border-white/15 bg-[#121212]/95 backdrop-blur-3xl shadow-[0_16px_50px_rgba(0,0,0,0.9),0_0_25px_rgba(99,102,241,0.25)] p-1.5 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-white/5 mb-1 flex items-center justify-between text-[10px] uppercase font-bold text-orbit-muted tracking-wider">
            <span>Select Asset Pair</span>
            <Sparkles size={10} className="text-indigo-400" />
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1 pr-0.5">
            {showAllOption && (
              <button
                type="button"
                onClick={() => {
                  onSymbolChange("ALL");
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 group cursor-pointer ${
                  symbol === "ALL"
                    ? "bg-indigo-600/25 border border-indigo-500/40 text-white shadow-[0_0_12px_rgba(99,102,241,0.2)]"
                    : "text-orbit-secondary hover:text-white hover:bg-white/10 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center font-bold text-[10px] bg-white/5 border border-white/10 text-orbit-secondary">
                    *
                  </div>
                  <span className="font-bold text-white tracking-wide">All Pairs</span>
                </div>
                {symbol === "ALL" && <Check size={14} className="text-indigo-400 shrink-0" />}
              </button>
            )}

            {stocks.map((stock) => {
              const isSelected = stock.symbol === symbol;
              return (
                <button
                  key={stock.symbol}
                  type="button"
                  onClick={() => {
                    onSymbolChange(stock.symbol);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 group cursor-pointer ${
                    isSelected
                      ? "bg-indigo-600/25 border border-indigo-500/40 text-white shadow-[0_0_12px_rgba(99,102,241,0.2)]"
                      : "text-orbit-secondary hover:text-white hover:bg-white/10 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-[10px] border transition-colors ${
                        isSelected
                          ? "bg-indigo-500 text-white border-indigo-400/50"
                          : "bg-white/5 text-orbit-secondary border-white/10 group-hover:bg-white/10 group-hover:text-white"
                      }`}
                    >
                      {stock.symbol[0]}
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="font-bold text-white tracking-wide">
                        {stock.symbol}<span className="text-[10px] font-normal text-orbit-muted">/INR</span>
                      </span>
                      {stock.title && (
                        <span className="text-[9px] text-orbit-muted group-hover:text-orbit-secondary">
                          {stock.title}
                        </span>
                      )}
                    </div>
                  </div>

                  {isSelected && (
                    <Check size={14} className="text-indigo-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
