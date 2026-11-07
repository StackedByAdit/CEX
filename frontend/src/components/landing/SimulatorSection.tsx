import { useState } from "react";

const MODES = [
  {
    id: "passive",
    label: "Passive",
    detail: "About 5% of decisions try to cross the spread. The rest rest on the book as limit orders.",
  },
  {
    id: "mixed",
    label: "Mixed",
    detail: "About 30% of decisions try to cross. This is the default mode.",
  },
  {
    id: "aggressive",
    label: "Aggressive",
    detail: "About 70% of decisions try to cross. If that side of the book is empty, the bot places a limit order instead.",
  },
] as const;

type ModeId = (typeof MODES)[number]["id"];

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80";

export default function SimulatorSection() {
  const [mode, setMode] = useState<ModeId>("mixed");
  const selected = MODES.find((item) => item.id === mode) ?? MODES[1];

  return (
    <section id="simulator" className="scroll-mt-16 border-t border-white/8">
      <div className="mx-auto grid max-w-6xl items-start gap-12 px-5 py-20 md:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-orbit-secondary">Simulator</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Bots that trade the book you are running.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-orbit-secondary sm:text-base">
            The simulator creates bot accounts, signs them in, and credits test INR and stock.
            Each bot reads the order book and posts limit or market orders on an interval you set. It records orders placed, fills, errors, active bots, and a short orders-per-second history.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-orbit-secondary">
            It is a way to generate controlled activity and watch the matcher work. It is not a market forecast, a strategy, or a recommendation.
          </p>
        </div>

        <div className="rounded border border-orbit-border bg-orbit-panel p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-orbit-secondary">Interface preview</p>
            <p className="text-[10px] text-orbit-secondary">Does not start bots</p>
          </div>

          <div className="mt-5" role="group" aria-label="Aggression modes">
            <p className="text-[10px] uppercase tracking-wider text-orbit-secondary">Aggression</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {MODES.map((item) => {
                const active = item.id === mode;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setMode(item.id)}
                    className={`rounded border px-2 py-2 text-xs font-medium transition ${focusRing} ${
                      active
                        ? "border-white/30 bg-white/10 text-white"
                        : "border-white/10 text-orbit-secondary hover:text-white"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 min-h-12 text-xs leading-relaxed text-orbit-secondary">{selected.detail}</p>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded border border-white/10 bg-white/10">
            {[
              ["Orders placed", "—"],
              ["Fills", "—"],
              ["Errors", "—"],
              ["Active bots", "—"],
            ].map(([label, value]) => (
              <div key={label} className="bg-orbit-panel px-3 py-3">
                <dt className="text-[10px] uppercase tracking-wider text-orbit-secondary">{label}</dt>
                <dd className="mt-1 font-mono text-lg tabular-nums text-white">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[10px] leading-relaxed text-orbit-secondary">
            Counters stay blank here. They fill only after you start a session.
          </p>
        </div>
      </div>
    </section>
  );
}
