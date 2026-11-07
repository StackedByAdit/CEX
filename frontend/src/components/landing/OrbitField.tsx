const RINGS = [
  {
    size: "h-[34rem] w-[34rem]",
    place: "-right-28 -top-16",
    duration: "68s",
    reverse: false,
    border: "border-white/10",
    dot: "left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 bg-white/80",
  },
  {
    size: "h-[22rem] w-[22rem]",
    place: "-left-24 bottom-[-4rem]",
    duration: "44s",
    reverse: true,
    border: "border-white/[0.14]",
    dot: "right-8 top-12 h-1.5 w-1.5 bg-white/55",
  },
  {
    size: "h-52 w-52",
    place: "-right-16 bottom-8",
    duration: "26s",
    reverse: false,
    border: "border-white/20",
    dot: "left-1/2 top-0 h-1 w-1 -translate-x-1/2 bg-white/70",
  },
];

export default function OrbitField() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      {RINGS.map((ring) => (
        <div
          key={ring.size + ring.place}
          className={`orbit-ring absolute rounded-full border ${ring.size} ${ring.place} ${ring.border} ${ring.reverse ? "orbit-ring-reverse" : ""}`}
          style={{ animationDuration: ring.duration }}
        >
          <span className={`absolute rounded-full ${ring.dot}`} />
        </div>
      ))}
    </div>
  );
}