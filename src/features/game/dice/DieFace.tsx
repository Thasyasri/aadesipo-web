const PIP_LAYOUTS: Record<number, readonly number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

interface DieFaceProps {
  value: number;
  size?: number;
}

export function DieFace({ value, size = 56 }: DieFaceProps) {
  const pips = PIP_LAYOUTS[value] ?? PIP_LAYOUTS[1]!;

  return (
    <div
      className="grid grid-cols-3 grid-rows-3 gap-1 rounded-lg bg-white p-2 shadow-[var(--shadow-e2)]"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Die showing ${value}`}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className="rounded-full"
          style={{ backgroundColor: pips.includes(i) ? "#0F1222" : "transparent" }}
        />
      ))}
    </div>
  );
}
