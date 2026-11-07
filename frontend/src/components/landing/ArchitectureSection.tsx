const STEPS = [
  {
    index: "01",
    title: "Request",
    body: "A signed-in client posts a limit or market order. The API checks the shape of the order before anything is reserved.",
  },
  {
    index: "02",
    title: "Reserve",
    body: "INR or stock is locked in the in-memory balance map. A market buy estimates the quote it may spend. A market sell checks that the book can take size.",
  },
  {
    index: "03",
    title: "Queue",
    body: "The order is pushed onto a Redis list. The HTTP handler then waits, up to five seconds, for that order’s result.",
  },
  {
    index: "04",
    title: "Match",
    body: "A worker pops the queue and matches against the in-memory book. Asks walk upward, bids walk downward. Unfilled limit quantity rests on the book.",
  },
  {
    index: "05",
    title: "Persist",
    body: "Fills, order status, and balance changes are queued and flushed on a short timer. The comparison itself does not wait on Postgres.",
  },
];

const EVENTS = [
  { title: "Order book", body: "Snapshot on subscribe, then updates when the book changes." },
  { title: "Trades", body: "Each fill is published for the symbol’s subscribers." },
  { title: "Candles", body: "One-minute candles are published. Other intervals are derived." },
  { title: "Balances", body: "The signed-in socket receives that account’s balance map." },
];

export default function ArchitectureSection() {
  return (
    <section id="architecture" className="scroll-mt-16 border-t border-white/8">
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-24">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-orbit-secondary">Architecture</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Match in memory. Write behind the trade.
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-orbit-secondary sm:text-base">
          The matching step walks an in-memory book, so a comparison does not take a database round trip.
          Admission, the queue, and later persistence still depend on Redis and Postgres. The buffer is not a promise of zero data loss.
        </p>

        <ol className="mt-12 grid gap-px overflow-hidden rounded border border-white/10 bg-white/10 md:grid-cols-5">
          {STEPS.map((step) => (
            <li key={step.index} className="bg-orbit-bg px-4 py-5">
              <span className="font-mono text-[11px] tracking-[0.16em] text-orbit-accent">{step.index}</span>
              <h3 className="mt-3 text-sm font-semibold">{step.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-orbit-secondary">{step.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-14">
          <h3 className="text-sm font-semibold tracking-tight">What the socket receives</h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-orbit-secondary">
            Redis pub/sub carries market and account events to the WebSocket server. The exchange can update without a full page reload while that connection is up.
          </p>
          <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {EVENTS.map((event) => (
              <li key={event.title} className="border-t border-white/10 pt-4">
                <h4 className="text-sm font-medium">{event.title}</h4>
                <p className="mt-2 text-xs leading-relaxed text-orbit-secondary">{event.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
