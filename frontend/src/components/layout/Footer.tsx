export default function Footer() {
  const now = new Date();
  const utc = now.toISOString().slice(11, 19);

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between border-t border-orbit-border bg-orbit-bg px-4 text-[10px] text-orbit-muted">
      <div className="flex items-center gap-4">
        <span>© 2026 ORBIT EXCHANGE</span>
        <span className="hidden sm:inline">Terms</span>
        <span className="hidden sm:inline">Privacy</span>
        <span className="hidden md:inline">API Docs</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-orbit-green" />
          SYSTEM STATUS: OPERATIONAL
        </span>
        <span className="font-mono">{utc} UTC</span>
      </div>
    </footer>
  );
}
