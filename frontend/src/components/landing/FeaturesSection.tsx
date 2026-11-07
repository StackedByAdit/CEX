import { BookOpen, Bot, ChartCandlestick, LayoutPanelTop, ListOrdered, Wallet } from "lucide-react";

const FEATURES = [
  {
    icon: LayoutPanelTop,
    title: "Spot trading",
    body: "Place limit and market orders beside the book, the chart, and your available balance.",
  },
  {
    icon: BookOpen,
    title: "Real-time order book",
    body: "Bids stay on the buy side and asks on the sell side, kept in memory and pushed over WebSocket as the book changes.",
  },
  {
    icon: ChartCandlestick,
    title: "Candlestick charts",
    body: "Intervals are 1m, 15m, 1h, 4h, and 1d. One-minute candles are stored. Longer intervals are derived from them, and live updates arrive as 1m candles.",
  },
  {
    icon: ListOrdered,
    title: "Orders and history",
    body: "Open orders show pending and partial fills. Resting limit orders can be cancelled. Personal fills record which side of the trade was yours.",
  },
  {
    icon: Wallet,
    title: "Balances, available and locked",
    body: "New accounts start at zero. The wallet can credit test INR or stock. A buy locks quote until it fills or is cancelled. These are test credits, not customer funds.",
  },
  {
    icon: Bot,
    title: "Market simulator",
    body: "Configurable bots sign in, take test credits, and place orders. Passive, mixed, and aggressive modes change how often they cross the spread.",
  },
];

export default function FeaturesSection() {
  return (
    <section id="platform" className="scroll-mt-16 border-t border-white/8">
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-24">
        <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-orbit-secondary"><span className="h-1.5 w-1.5 rounded-full bg-orbit-green" /><span className="h-1.5 w-1.5 rounded-full bg-orbit-red" />Platform</p>
        <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
          What you can do on the exchange
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-orbit-secondary sm:text-base">
          Prices, charts, and volume come from trades on this exchange. There is no external market feed.
          The interface needs the local API, database, Redis, and WebSocket server to show a live book.
        </p>

        <ul className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="border-t border-white/10 pt-5">
              <feature.icon size={18} aria-hidden="true" className={feature.title === "Candlestick charts" ? "text-orbit-green" : feature.title === "Real-time order book" ? "text-orbit-red" : "text-orbit-secondary"} />
              <h3 className="mt-4 text-base font-semibold tracking-tight">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-orbit-secondary">{feature.body}</p>
              {feature.title === "Real-time order book" && (
                <p className="mt-3 text-xs">
                  <span className="text-orbit-green">Bids</span>
                  <span className="text-orbit-secondary"> on one side, </span>
                  <span className="text-orbit-red">asks</span>
                  <span className="text-orbit-secondary"> on the other.</span>
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
