import { Link } from "react-router-dom";
import MarketChart from "./MarketChart";
const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80";

interface HeroSectionProps {
  authed: boolean;
}

export default function HeroSection({ authed }: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 55% 45% at 78% 18%, rgba(99,102,241,0.14), transparent 62%), radial-gradient(ellipse 40% 36% at 12% 88%, rgba(255,255,255,0.04), transparent 70%)",
        }}
      />
      <div className="landing-grid pointer-events-none absolute inset-0" aria-hidden="true" />
<div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-16 md:pb-28 md:pt-24 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-orbit-secondary">
            ORBIT Exchange
          </p>
          <h1 className="mt-4 max-w-xl text-[2.55rem] font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            The market moves.
            <span className="mt-1 block">ORBIT matches.</span>
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-orbit-secondary">
            An exchange built around an in-memory matching engine, real-time order-book updates,
            and order entry designed for precision.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {authed ? (
              <Link
                to="/trade"
                className={`rounded bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90 ${focusRing}`}
              >
                Open Exchange
              </Link>
            ) : (
              <Link
                to="/signup"
                className={`rounded bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90 ${focusRing}`}
              >
                Create account
              </Link>
            )}
            <a
              href="#performance"
              className={`rounded border border-white/15 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/5 ${focusRing}`}
            >
              See the numbers
            </a>
          </div>
        </div>

        <MarketChart />
      </div>
    </section>
  );
}
