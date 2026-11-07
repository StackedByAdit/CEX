import { Link } from "react-router-dom";
import BrandMark from "../brand/BrandMark";

const SECTIONS = [
  { href: "#platform", label: "Platform" },
  { href: "#architecture", label: "Architecture" },
  { href: "#performance", label: "Performance" },
  { href: "#simulator", label: "Simulator" },
];

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80";

interface LandingFooterProps {
  authed: boolean;
}

export default function LandingFooter({ authed }: LandingFooterProps) {
  return (
    <footer className="border-t border-white/8">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <BrandMark />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-orbit-secondary">
            A centralized exchange with an in-memory matcher and a market simulator. Balances are test credits.
          </p>
        </div>

        <div>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-orbit-secondary">On this page</h2>
          <ul className="mt-3 space-y-2">
            {SECTIONS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className={`text-sm text-orbit-secondary hover:text-white ${focusRing}`}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-orbit-secondary">Account</h2>
          <ul className="mt-3 space-y-2">
            {authed ? (
              <li>
                <Link to="/trade" className={`text-sm text-orbit-secondary hover:text-white ${focusRing}`}>
                  Open Exchange
                </Link>
              </li>
            ) : (
              <>
                <li>
                  <Link to="/login" className={`text-sm text-orbit-secondary hover:text-white ${focusRing}`}>
                    Log in
                  </Link>
                </li>
                <li>
                  <Link to="/signup" className={`text-sm text-orbit-secondary hover:text-white ${focusRing}`}>
                    Create account
                  </Link>
                </li>
              </>
            )}
            <li>
              <a
                href="https://github.com/StackedByAdit/CEX"
                className={`text-sm text-orbit-secondary hover:text-white ${focusRing}`}
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/8 px-5 py-4 text-center text-[11px] text-orbit-secondary">
        © 2026 ORBIT Exchange
      </div>
    </footer>
  );
}
