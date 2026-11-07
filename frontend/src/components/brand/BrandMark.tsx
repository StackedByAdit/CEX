interface BrandMarkProps {
  showExchange?: boolean;
}

export default function BrandMark({ showExchange = true }: BrandMarkProps) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <img src="/orbit.svg" alt="" width={28} height={28} className="h-7 w-7" />
      <span className="flex items-baseline gap-2">
        <span className="text-sm font-semibold tracking-[0.18em]">ORBIT</span>
        {showExchange && (
          <span className="text-[10px] font-medium tracking-[0.16em] text-orbit-secondary">
            EXCHANGE
          </span>
        )}
      </span>
    </span>
  );
}
