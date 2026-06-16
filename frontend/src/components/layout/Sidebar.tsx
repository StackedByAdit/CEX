import { History, Layers, LineChart, TrendingUp, Wallet } from "lucide-react";

const navItems = [
  { icon: TrendingUp, label: "Spot", active: true },
  { icon: LineChart, label: "Futures", active: false },
  { icon: Layers, label: "Options", active: false },
  { icon: Wallet, label: "Staking", active: false },
  { icon: History, label: "History", active: false },
];

export default function Sidebar() {
  return (
    <aside className="hidden w-14 shrink-0 flex-col border-r border-orbit-border bg-orbit-bg lg:flex">
      {navItems.map(({ icon: Icon, label, active }) => (
        <button
          key={label}
          title={label}
          className={`flex h-14 w-full items-center justify-center transition ${
            active
              ? "border-l-2 border-white bg-orbit-panel text-white"
              : "text-orbit-secondary hover:bg-orbit-panel hover:text-white"
          }`}
        >
          <Icon size={18} strokeWidth={1.5} />
        </button>
      ))}
    </aside>
  );
}
