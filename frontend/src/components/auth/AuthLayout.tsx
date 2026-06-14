import { Link } from "react-router-dom";

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
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
  return (
    <div className="flex min-h-full flex-col bg-orbit-bg">
      <header className="flex items-center justify-between border-b border-orbit-border px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-orbit-border bg-orbit-panel">
            <span className="text-xs font-bold tracking-widest">O</span>
          </div>
          <span className="text-sm font-semibold tracking-[0.2em]">ORBIT</span>
        </Link>
        <span className="text-xs text-orbit-secondary">EXCHANGE</span>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm text-orbit-secondary">{subtitle}</p>
          </div>

          <div className="rounded border border-orbit-border bg-orbit-panel p-8">
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

      <footer className="border-t border-orbit-border px-6 py-3 text-center text-xs text-orbit-muted">
        © 2026 ORBIT EXCHANGE · Terms · Privacy · API Docs
      </footer>
    </div>
  );
}
