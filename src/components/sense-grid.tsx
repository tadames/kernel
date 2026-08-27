import { VIEW, CH, CENTER, DIR_NAMES } from "@/lib/kernel/kernel";
import { cn } from "@/lib/utils";

export function SenseGrid({
  data,
  label,
  dim,
}: {
  data: Float32Array;
  label: string;
  dim?: boolean;
}) {
  return (
    <div className={cn("min-w-0", dim && "opacity-70")}>
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">
        {label}
      </div>
      <div
        className="grid aspect-square w-full grid-cols-5 gap-px rounded-[var(--radius-xs)] bg-line p-px"
        aria-hidden
      >
        {Array.from({ length: VIEW * VIEW }, (_, i) => {
          const wall = data[i * CH] ?? 0;
          const food = data[i * CH + 1] ?? 0;
          const scent = data[i * CH + 2] ?? 0;
          const center = i * CH === CENTER;
          let bg = "var(--color-world-empty)";
          if (wall > 0.45) bg = "var(--color-world-wall)";
          else if (food > 0.35) bg = "var(--color-world-food)";
          else if (scent > 0.2) bg = "var(--color-world-scent)";
          return (
            <div
              key={i}
              className={cn("aspect-square", center && "outline outline-1 outline-fg/40")}
              style={{ background: bg, opacity: wall > 0.45 ? 1 : 0.55 + food * 0.45 + scent * 0.3 }}
            />
          );
        })}
      </div>
    </div>
  );
}

export function ImaginedRow({
  imagined,
  scores,
  action,
}: {
  imagined: Float32Array[];
  scores: Float32Array;
  action: number;
}) {
  let max = -Infinity;
  let min = Infinity;
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] > max) max = scores[i];
    if (scores[i] < min) min = scores[i];
  }
  const span = Math.max(0.001, max - min);
  return (
    <div className="grid grid-cols-5 gap-2">
      {imagined.map((p, i) => {
        const h = ((scores[i] - min) / span) * 100;
        return (
          <div key={i} className="min-w-0">
            <SenseGrid data={p} label={DIR_NAMES[i]} dim={i !== action} />
            <div className="mt-1.5 h-px w-full bg-line">
              <div
                className="h-px bg-fg/80"
                style={{ width: `${Math.max(8, h)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
