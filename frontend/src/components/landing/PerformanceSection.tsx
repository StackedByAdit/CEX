import { useEffect, useState } from "react";
import { LOAD_TEST, MATCHING_CORE_ORDERS_PER_SEC } from "../../content/benchmark";
import LoadTestPanel from "./LoadTestPanel";

const NOTES = [
  {
    title: "In-memory match",
    body: "The B-tree book is O(log N) to find a price. Matching itself stays under 1 ms in memory. That is a different clock from the network round trip.",
  },
  {
    title: "Zero-Auth WebSocket ingress",
    body: "Authenticating once during the WS connection handshake eliminates per-request crypto overhead. Bursts reach nearly 6,000 orders/sec with median ingress latency under 3 ms.",
  },
  {
    title: "Write-behind and fan-out",
    body: "Order, fill, and balance writes coalesce on a 500 ms buffer before Postgres. Redis pub/sub carries book, trade, candle, and balance events out over WebSocket in under 15 ms.",
  },
];

function formatThousands(value: number) {
  return `~${Math.round(value / 1000)}K`;
}

export default function PerformanceSection() {
  const target = MATCHING_CORE_ORDERS_PER_SEC;
  const [shown, setShown] = useState(target);
  const [mode, setMode] = useState<"ws" | "http">("ws");

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) {
      setShown(target);
      return;
    }

    const from = Math.round(target * 0.72);
    const start = performance.now();
    const duration = 800;
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setShown(Math.round(from + (target - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    setShown(from);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  const stages = mode === "ws" ? LOAD_TEST.wsStages : LOAD_TEST.stages;

  return (
    <section id="performance" className="scroll-mt-16 border-t border-white/8">
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-orbit-secondary">Performance</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          The matcher is the fast path. Ingress tells the rest of the story.
        </h2>

        <div className="mt-12 border-y border-white/10 py-10">
          <p className="text-[11px] uppercase tracking-[0.18em] text-orbit-secondary">
            Matching engine
          </p>
          <p className="mt-3 font-mono text-6xl font-semibold tracking-tight tabular-nums sm:text-8xl">
            <span className="sr-only">Approximately 670,000 orders per second</span>
            <span aria-hidden="true">{formatThousands(shown)}</span>
          </p>
          <p className="mt-3 text-sm text-orbit-secondary sm:text-base">
            orders per second in memory · under 1 ms each
          </p>
        </div>

        <div className="mt-10">
          <LoadTestPanel />
        </div>

        <div className="mt-12">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <h3 className="text-sm font-semibold tracking-tight">Ingress Benchmarks</h3>
              <p className="mt-1 text-xs text-orbit-secondary">
                {mode === "ws"
                  ? "Zero-Auth WebSocket: Handshake-authenticated connection with instant order dispatch."
                  : "HTTP REST API: Authenticated POST /order with in-memory balance pre-lock."}
              </p>
            </div>
            <div className="flex rounded border border-white/15 bg-white/5 p-0.5">
              <button
                type="button"
                onClick={() => setMode("ws")}
                className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                  mode === "ws"
                    ? "bg-white text-black shadow-sm"
                    : "text-orbit-secondary hover:text-white"
                }`}
              >
                Zero-Auth WebSocket (5,999 TPS)
              </button>
              <button
                type="button"
                onClick={() => setMode("http")}
                className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                  mode === "http"
                    ? "bg-white text-black shadow-sm"
                    : "text-orbit-secondary hover:text-white"
                }`}
              >
                HTTP REST (204 TPS)
              </button>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <caption className="mb-4 text-left text-xs text-orbit-secondary">
                {mode === "ws"
                  ? "Four stages across 1,350 pre-authenticated WebSocket orders, 50 parallel connections, sub-6ms latency, zero errors."
                  : "Four stages from bot/loadtester.ts. 1,350 authenticated HTTP orders, 50 parallel traders, zero errors."}
              </caption>
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.14em] text-orbit-secondary">
                  <th className="py-3 pr-4 font-medium">Stage</th>
                  <th className="py-3 pr-4 font-medium">Parallel</th>
                  <th className="py-3 pr-4 font-medium">Orders</th>
                  <th className="py-3 pr-4 font-medium">Duration</th>
                  <th className="py-3 pr-4 font-medium">TPS</th>
                  <th className="py-3 pr-4 font-medium">P50</th>
                  <th className="py-3 pr-4 font-medium">P90</th>
                  <th className="py-3 font-medium">P99</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((stage) => (
                  <tr key={stage.name} className="border-b border-white/8 font-mono text-xs tabular-nums">
                    <th className="py-3 pr-4 text-left font-sans text-sm font-medium text-white">{stage.name}</th>
                    <td className="py-3 pr-4 text-orbit-secondary">{stage.concurrency}</td>
                    <td className="py-3 pr-4 text-orbit-secondary">{stage.orders}</td>
                    <td className="py-3 pr-4 text-orbit-secondary">{stage.duration}</td>
                    <td className="py-3 pr-4 font-semibold text-orbit-green">{stage.tps}</td>
                    <td className="py-3 pr-4 text-orbit-secondary">{stage.p50}</td>
                    <td className="py-3 pr-4 text-orbit-secondary">{stage.p90}</td>
                    <td className="py-3 text-orbit-secondary">{stage.p99}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <ul className="mt-12 grid gap-8 md:grid-cols-3">
          {NOTES.map((item) => (
            <li key={item.title}>
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-orbit-secondary">{item.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
