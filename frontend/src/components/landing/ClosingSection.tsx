import { Link } from "react-router-dom";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80";

interface ClosingSectionProps {
  authed: boolean;
}

export default function ClosingSection({ authed }: ClosingSectionProps) {
  return (
    <section className="border-t border-white/8">
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-orbit-secondary">Enter</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">
          Explore the exchange behind the order book.
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-orbit-secondary sm:text-base">
          Create an account and work with test balances on the matching engine this page describes.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {authed ? (
            <Link
              to="/trade"
              className={`rounded bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90 ${focusRing}`}
            >
              Open Exchange
            </Link>
          ) : (
            <>
              <Link
                to="/signup"
                className={`rounded bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90 ${focusRing}`}
              >
                Create account
              </Link>
              <Link
                to="/login"
                className={`rounded border border-white/15 px-5 py-2.5 text-sm font-medium transition hover:bg-white/5 ${focusRing}`}
              >
                Log in
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
