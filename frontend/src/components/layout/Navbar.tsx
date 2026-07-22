import { useState, useRef, useEffect } from "react";
import { Bell, LogOut, User, ChevronDown } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { clearAuth, getUsername } from "../../lib/auth";
import { logout } from "../../lib/api";

export default function Navbar() {
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
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/5 bg-orbit-bg/90 backdrop-blur-md px-4 relative z-50">
      <div className="flex items-center gap-8">
        <Link to="/trade" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5">
            <span className="text-[10px] font-bold tracking-widest">O</span>
          </div>
          <span className="text-sm font-semibold tracking-[0.18em] bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">
            ORBIT
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {["Markets", "Trade", "Dashboard", "Institutions"].map((item) => (
            <button
              key={item}
              className={`text-xs font-medium tracking-wide transition ${
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
        <button className="rounded p-1.5 text-orbit-secondary transition hover:bg-white/5 hover:text-white">
          <Bell size={16} />
        </button>

        {/* User avatar + dropdown */}
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 transition hover:bg-white/5 group"
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
            <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-white/10 bg-orbit-panel/95 backdrop-blur-xl shadow-2xl overflow-hidden">
              {/* Profile header */}
              <div className="px-4 py-3 border-b border-white/5 bg-white/3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-sm font-bold text-white shadow">
                    {initials}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{username ?? "User"}</div>
                    <div className="text-[10px] text-orbit-muted">Verified Account</div>
                  </div>
                </div>
              </div>

              {/* Menu items */}
              <div className="py-1">
                <button className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-orbit-secondary transition hover:bg-white/5 hover:text-white">
                  <User size={14} />
                  Profile
                </button>
                <div className="mx-3 my-1 border-t border-white/5" />
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-orbit-red transition hover:bg-red-500/10 hover:text-red-400"
                >
                  <LogOut size={14} />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
