import { useState, useRef, useEffect } from "react";
import { Bell, LogOut, Wallet, ChevronDown } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { clearAuth, getUsername } from "../../lib/auth";
import { logout } from "../../lib/api";

interface NavbarProps {
  onSelectTab?: (tab: "spot" | "wallet" | "history") => void;
}

export default function Navbar({ onSelectTab }: NavbarProps) {
  const navigate = useNavigate();
  const username = getUsername();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  async function handleLogout() {
    setDropdownOpen(false);
    try {
      await logout();
    } catch {
      /* clear local state even if cookie clear fails */
    }
    clearAuth();
    navigate("/login");
  }

  function handleWalletClick() {
    setDropdownOpen(false);
    if (onSelectTab) {
      onSelectTab("wallet");
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const initials = username ? username.slice(0, 2).toUpperCase() : "U";

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/5 bg-orbit-bg/90 backdrop-blur-md px-4 relative z-[100]">
      <div className="flex items-center gap-8">
        <Link to="/trade" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5">
            <span className="text-[10px] font-bold tracking-widest text-white">O</span>
          </div>
          <span className="text-sm font-semibold tracking-[0.18em] bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">
            ORBIT
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {["Markets", "Trade", "Dashboard", "Institutions"].map((item) => (
            <button
              key={item}
              onClick={() => {
                if (item === "Trade") onSelectTab?.("spot");
              }}
              className={`text-xs font-medium tracking-wide transition cursor-pointer ${
                item === "Trade"
                  ? "text-white"
                  : "text-orbit-secondary hover:text-white"
              }`}
            >
              {item}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <button className="rounded p-1.5 text-orbit-secondary transition hover:bg-white/5 hover:text-white cursor-pointer">
          <Bell size={16} />
        </button>

        {/* User avatar + dropdown */}
        <div ref={dropdownRef} className="relative z-[100]">
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 transition hover:bg-white/5 group cursor-pointer"
          >
            {/* Avatar circle */}
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-[11px] font-bold text-white shadow-lg ring-2 ring-white/10">
              {initials}
            </div>
            {username && (
              <span className="hidden text-xs font-medium text-orbit-secondary group-hover:text-white transition sm:inline">
                {username}
              </span>
            )}
            <ChevronDown
              size={12}
              className={`text-orbit-secondary transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`}
            />
          </button>

          {/* Dropdown menu */}
          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-white/10 bg-[#121212]/95 backdrop-blur-2xl shadow-[0_16px_50px_rgba(0,0,0,0.9),0_0_25px_rgba(99,102,241,0.2)] overflow-hidden z-[100]">
              {/* Profile header with Username & Signed in status */}
              <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-sm font-bold text-white shadow ring-2 ring-indigo-500/20">
                    {initials}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold text-white truncate">
                      {username ?? "User"}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400 mt-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                      Signed in
                    </span>
                  </div>
                </div>
              </div>

              {/* Menu items: Wallet, Divider, Log out */}
              <div className="py-1">
                <button
                  onClick={handleWalletClick}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-orbit-secondary transition hover:bg-white/5 hover:text-white cursor-pointer"
                >
                  <Wallet size={15} className="text-indigo-400" />
                  <span>Wallet</span>
                </button>

                <div className="mx-3 my-1 border-t border-white/5" />

                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-orbit-red transition hover:bg-red-500/10 hover:text-red-400 cursor-pointer"
                >
                  <LogOut size={15} />
                  <span>Log Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
