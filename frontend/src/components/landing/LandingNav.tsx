import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Link } from "react-router-dom";
import BrandMark from "../brand/BrandMark";

const LINKS = [
  { href: "#platform", label: "Platform" },
  { href: "#architecture", label: "Architecture" },
  { href: "#performance", label: "Performance" },
  { href: "#simulator", label: "Simulator" },
];

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80";

interface LandingNavProps {
  authed: boolean;
}

export default function LandingNav({ authed }: LandingNavProps) {
  const [open, setOpen] = useState(false);

  function close() {
    setOpen(false);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/8 bg-orbit-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5">
        <Link to="/" className={`shrink-0 ${focusRing}`} onClick={close}>
          <BrandMark />
        </Link>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Page sections">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`text-xs font-medium tracking-wide text-orbit-secondary transition hover:text-white ${focusRing}`}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {authed ? (
            <Link
              to="/trade"
              className={`rounded bg-white px-3.5 py-1.5 text-xs font-semibold text-black transition hover:bg-white/90 ${focusRing}`}
            >
              Open Exchange
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className={`px-2 py-1.5 text-xs font-medium text-orbit-secondary transition hover:text-white ${focusRing}`}
              >
                Log in
              </Link>
              <Link
                to="/signup"
                className={`rounded bg-white px-3.5 py-1.5 text-xs font-semibold text-black transition hover:bg-white/90 ${focusRing}`}
              >
                Create account
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className={`inline-flex h-9 w-9 items-center justify-center rounded border border-white/10 text-white md:hidden ${focusRing}`}
          aria-expanded={open}
          aria-controls="landing-menu"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          {open ? <X size={16} /> : <Menu size={16} />}
        </button>
      </div>

      {open && (
        <div id="landing-menu" className="border-t border-white/8 px-5 py-4 md:hidden">
          <nav className="flex flex-col gap-1" aria-label="Page sections">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={close}
                className={`rounded px-2 py-2.5 text-sm text-orbit-secondary hover:bg-white/5 hover:text-white ${focusRing}`}
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-3 flex flex-col gap-2 border-t border-white/8 pt-3">
            {authed ? (
              <Link
                to="/trade"
                onClick={close}
                className={`rounded bg-white px-3 py-2.5 text-center text-sm font-semibold text-black ${focusRing}`}
              >
                Open Exchange
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={close}
                  className={`rounded border border-white/10 px-3 py-2.5 text-center text-sm ${focusRing}`}
                >
                  Log in
                </Link>
                <Link
                  to="/signup"
                  onClick={close}
                  className={`rounded bg-white px-3 py-2.5 text-center text-sm font-semibold text-black ${focusRing}`}
                >
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
