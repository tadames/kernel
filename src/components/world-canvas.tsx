import { useEffect, useRef } from "react";
import { DIRS, SIZE, type Snapshot } from "@/lib/kernel/kernel";
import { useLab } from "@/lib/lab-store";
import { cn } from "@/lib/utils";

function readColor(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function WorldCanvas({
  snap,
  className,
  interactive = true,
}: {
  snap: Snapshot;
  className?: string;
  interactive?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const paint = useLab((s) => s.paint);
  const paintAt = useLab((s) => s.paintAt);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      const size = Math.max(1, Math.floor(rect.width));
      if (size < 2) return;
      canvas.width = Math.floor(size * dpr);
      canvas.height = Math.floor(size * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const empty = readColor("--color-world-empty", "#101012");
      const wall = readColor("--color-world-wall", "#3c3c44");
      const food = readColor("--color-world-food", "#8fad9a");
      const agent = readColor("--color-world-agent", "#e8e6dc");
      const scentC = readColor("--color-world-scent", "#243040");
      const line = readColor("--color-line", "#26262b");
      const bg = readColor("--color-surface", "#121214");

      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);

      const pad = Math.max(6, size * 0.025);
      const inner = size - pad * 2;
      const cell = inner / snap.size;

      ctx.fillStyle = empty;
      ctx.fillRect(pad, pad, inner, inner);

      for (let y = 0; y < snap.size; y++) {
        for (let x = 0; x < snap.size; x++) {
          const i = y * snap.size + x;
          const px = pad + x * cell;
          const py = pad + y * cell;
          const sc = snap.scent[i];
          if (sc > 0.04) {
            ctx.globalAlpha = Math.min(0.55, sc * 0.7);
            ctx.fillStyle = scentC;
            ctx.fillRect(px, py, cell + 0.5, cell + 0.5);
            ctx.globalAlpha = 1;
          }
          const kind = snap.cells[i];
          if (kind === 1) {
            ctx.fillStyle = wall;
            const inset = Math.max(1, cell * 0.08);
            ctx.fillRect(px + inset, py + inset, cell - inset * 2, cell - inset * 2);
          } else if (kind === 2) {
            ctx.fillStyle = food;
            const r = cell * 0.22;
            ctx.beginPath();
            ctx.arc(px + cell / 2, py + cell / 2, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      ctx.strokeStyle = line;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= snap.size; i++) {
        const p = pad + i * cell;
        ctx.moveTo(pad, p);
        ctx.lineTo(pad + inner, p);
        ctx.moveTo(p, pad);
        ctx.lineTo(p, pad + inner);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      const ax = pad + (snap.ax + 0.5) * cell;
      const ay = pad + (snap.ay + 0.5) * cell;
      const rad = cell * 0.32;
      ctx.fillStyle = agent;
      ctx.beginPath();
      ctx.arc(ax, ay, rad, 0, Math.PI * 2);
      ctx.fill();

      const d = DIRS[snap.facing] ?? DIRS[4];
      if (d.x !== 0 || d.y !== 0) {
        ctx.strokeStyle = bg;
        ctx.lineWidth = Math.max(1.5, cell * 0.08);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + d.x * rad * 1.15, ay + d.y * rad * 1.15);
        ctx.stroke();
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [snap]);

  function onPointer(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!interactive || paint === "none") return;
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const size = rect.width;
    const pad = Math.max(6, size * 0.025);
    const inner = size - pad * 2;
    const cell = inner / SIZE;
    const x = Math.floor((e.clientX - rect.left - pad) / cell);
    const y = Math.floor((e.clientY - rect.top - pad) / cell);
    if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) paintAt(x, y);
  }

  return (
    <canvas
      ref={ref}
      className={cn("absolute inset-0 block h-full w-full touch-none", className)}
      onPointerDown={onPointer}
      style={{ cursor: paint === "none" ? "default" : "crosshair" }}
      aria-label="The world the kernel inhabits"
    />
  );
}
