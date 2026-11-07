import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import BrandMark from "../brand/BrandMark";
import OrbitField from "../landing/OrbitField";

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footerText: string;
  footerLink: { to: string; label: string };
}

export default function AuthLayout({
  title,
  subtitle,
  children,
  footerText,
  footerLink,
}: AuthLayoutProps) {
  useEffect(() => {
    document.documentElement.classList.add("orbit-public");
    return () => {
      document.documentElement.classList.remove("orbit-public");
    };
  }, []);

  return (
    <div className="auth-atmosphere relative flex min-h-svh flex-col">
      <OrbitField />

      <header className="relative z-10 flex items-center justify-between border-b border-white/10 bg-orbit-bg/50 px-6 py-4 backdrop-blur-md">
        <Link to="/" className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80">
          <BrandMark />
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm text-orbit-secondary">{subtitle}</p>
          </div>

          <div className="rounded border border-white/10 bg-orbit-panel/85 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-md">
            {children}
          </div>

          <p className="mt-6 text-center text-sm text-orbit-secondary">
            {footerText}{" "}
            <Link to={footerLink.to} className="text-white hover:underline">
              {footerLink.label}
            </Link>
          </p>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/10 px-6 py-3 text-center text-xs text-orbit-secondary">
        © 2026 ORBIT Exchange
      </footer>
    </div>
  );
}
