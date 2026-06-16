import { Bell, LogOut, Settings } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { clearAuth, getUsername } from "../../lib/auth";
import { logout } from "../../lib/api";

export default function Navbar() {
  const navigate = useNavigate();
  const username = getUsername();

  async function handleLogout() {
    try {
      await logout();
    } catch {
      /* clear local state even if cookie clear fails */
    }
    clearAuth();
    navigate("/login");
  }

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-orbit-border bg-orbit-bg px-4">
      <div className="flex items-center gap-8">
        <Link to="/trade" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-orbit-border">
            <span className="text-[10px] font-bold tracking-widest">O</span>
          </div>
          <span className="text-sm font-semibold tracking-[0.18em]">ORBIT</span>
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
        {username && (
          <span className="hidden text-xs text-orbit-secondary sm:inline">
            {username}
          </span>
        )}
        <button className="rounded p-1.5 text-orbit-secondary transition hover:bg-orbit-panel hover:text-white">
          <Bell size={16} />
        </button>
        <button className="rounded p-1.5 text-orbit-secondary transition hover:bg-orbit-panel hover:text-white">
          <Settings size={16} />
        </button>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded border border-orbit-border px-3 py-1.5 text-xs font-medium transition hover:bg-orbit-panel"
        >
          <LogOut size={14} />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
