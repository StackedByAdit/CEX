import { LOAD_TEST, MATCHING_CORE_ORDERS_PER_SEC } from "../../content/benchmark";

const HOOKS = [
  { value: "100%", label: "Success rate", detail: "Zero dropped orders", tone: "text-orbit-green" },
  { value: LOAD_TEST.matchingLatencyLabel, label: "Matching latency", detail: "In-memory B-tree core", tone: "text-white" },
  { value: "2.2 ms", label: "Zero-Auth WS P50", detail: "Handshake-authenticated", tone: "text-white" },
  { value: "~6,000", label: "Peak TPS burst", detail: "Zero-Auth WS (50 bots)", tone: "text-white" },
];

export default function LoadTestPanel() {
  return (
    <figure className="border border-white/10 bg-orbit-panel/80">
      <figcaption className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-orbit-secondary">Load test</span>
        <span className="text-[10px] text-orbit-secondary">1,350 / 1,350 accepted · Zero dropped</span>
      </figcaption>
      <div className="grid grid-cols-2 lg:grid-cols-4">
        {HOOKS.map((hook) => (
          <div key={hook.label} className="border-b border-white/10 px-4 py-4 lg:border-b-0 lg:border-r lg:last:border-r-0">
            <p className={`font-mono text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl ${hook.tone}`}>{hook.value}</p>
            <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-orbit-secondary">{hook.label}</p>
            <p className="mt-1 text-xs text-orbit-secondary">{hook.detail}</p>
          </div>
        ))}
      </div>
      <p className="border-t border-white/10 px-4 py-3 text-xs text-orbit-secondary">
        Matching core{" "}
        <span className="font-mono text-sm text-white">~{Math.round(MATCHING_CORE_ORDERS_PER_SEC / 1000)}K</span>{" "}
        orders/sec. Zero-Auth WebSocket reaches{" "}
        <span className="font-mono text-sm text-white">~6,000</span> orders/sec; HTTP REST sustains{" "}
        <span className="font-mono text-sm text-white">~204</span> orders/sec.
      </p>
    </figure>
  );
}
