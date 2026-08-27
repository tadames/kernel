import { Button } from "@/components/ui/button";
import { WORLD_META, type WorldKind } from "@/lib/kernel/presets";
import { useLab, type PaintMode } from "@/lib/lab-store";
import { cn } from "@/lib/utils";
import { Eraser, Pause, Pencil, Play, RotateCcw, Sprout, StepForward } from "lucide-react";

const SPEEDS = [2, 10, 30, 60];
const WORLDS = Object.keys(WORLD_META) as WorldKind[];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">{label}</div>
      {children}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">
        <span>{label}</span>
        <span className="tabular-nums text-muted">{value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Controls() {
  const running = useLab((s) => s.running);
  const speed = useLab((s) => s.speed);
  const paint = useLab((s) => s.paint);
  const worldKind = useLab((s) => s.worldKind);
  const params = useLab((s) => s.params);
  const play = useLab((s) => s.play);
  const setSpeed = useLab((s) => s.setSpeed);
  const setPaint = useLab((s) => s.setPaint);
  const setWorld = useLab((s) => s.setWorld);
  const setParam = useLab((s) => s.setParam);
  const resetBrain = useLab((s) => s.resetBrain);
  const resetWorld = useLab((s) => s.resetWorld);
  const stepOnce = useLab((s) => s.stepOnce);

  const paints: { id: PaintMode; icon: typeof Pencil; label: string }[] = [
    { id: "wall", icon: Pencil, label: "Wall" },
    { id: "food", icon: Sprout, label: "Food" },
    { id: "erase", icon: Eraser, label: "Erase" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="solid" size="md" onClick={() => play()} aria-label={running ? "Pause" : "Run"}>
          {running ? <Pause /> : <Play />}
          {running ? "Pause" : "Run"}
        </Button>
        <Button variant="outline" size="md" onClick={stepOnce} aria-label="Step once">
          <StepForward />
          Step
        </Button>
        <Button variant="quiet" size="md" onClick={resetBrain} aria-label="Reset the mind">
          <RotateCcw />
          New mind
        </Button>
        <Button variant="quiet" size="md" onClick={resetWorld} aria-label="Rebuild the world">
          Rebuild world
        </Button>
      </div>

      <Row label="World">
        <div className="flex flex-wrap gap-1.5">
          {WORLDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setWorld(k)}
              className={cn(
                "h-9 rounded-full px-3 text-sm transition-colors",
                worldKind === k ? "bg-fg text-accent-fg" : "bg-surface-2 text-muted hover:text-fg",
              )}
            >
              {WORLD_META[k].name}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted">{WORLD_META[worldKind].blurb}</p>
      </Row>

      <Row label="Pace">
        <div className="flex flex-wrap gap-1.5">
          {SPEEDS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setSpeed(n)}
              className={cn(
                "h-9 min-w-11 rounded-full px-3 font-mono text-sm tabular-nums transition-colors",
                speed === n ? "bg-fg text-accent-fg" : "bg-surface-2 text-muted hover:text-fg",
              )}
            >
              {n}×
            </button>
          ))}
        </div>
      </Row>

      <Row label="Draw into the world">
        <div className="flex flex-wrap gap-1.5">
          {paints.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPaint(p.id)}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm transition-colors",
                paint === p.id ? "bg-fg text-accent-fg" : "bg-surface-2 text-muted hover:text-fg",
              )}
            >
              <p.icon className="size-3.5" />
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted">
          Change the world while it runs. Surprise should spike, then fall as the model rewrites itself.
        </p>
      </Row>

      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          label="Learning rate"
          value={params.lr}
          min={0.005}
          max={0.08}
          step={0.001}
          onChange={(n) => setParam("lr", n)}
        />
        <Slider
          label="Curiosity"
          value={params.curiosity}
          min={0}
          max={2}
          step={0.05}
          onChange={(n) => setParam("curiosity", n)}
        />
        <Slider
          label="Goal"
          value={params.goal}
          min={0}
          max={2}
          step={0.05}
          onChange={(n) => setParam("goal", n)}
        />
        <Slider
          label="Temperature"
          value={params.temperature}
          min={0.08}
          max={1.4}
          step={0.02}
          onChange={(n) => setParam("temperature", n)}
        />
      </div>
    </div>
  );
}
