import { ImaginedRow, SenseGrid } from "@/components/sense-grid";
import { Sparkline } from "@/components/sparkline";
import { DIR_NAMES, type Snapshot } from "@/lib/kernel/kernel";

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">{label}</div>
      <div className="mt-1 font-mono text-lg tabular-nums leading-none text-fg">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

function fmt(n: number, d = 3) {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(d);
}

export function MindPanel({ snap }: { snap: Snapshot }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
        <Stat label="Age" value={snap.age.toLocaleString()} hint="steps lived" />
        <Stat label="Surprise" value={fmt(snap.ema, 3)} hint="prediction error" />
        <Stat
          label="Compression"
          value={fmt(snap.compression, 3)}
          hint="1 / (1 + 8δ̄)"
        />
        <Stat label="Energy" value={Math.max(0, snap.energy).toFixed(0)} hint="body" />
        <Stat label="Food" value={String(snap.foods)} hint="meals found" />
        <Stat label="Lives" value={String(snap.lives)} hint="the model kept" />
        <Stat
          label="Commit"
          value={fmt(snap.commitment, 2)}
          hint="predictions left ½"
        />
        <Stat
          label="Entropy"
          value={fmt(snap.policyEntropy, 2)}
          hint="0 freeze · 1 coin"
        />
        <Stat
          label="Branch"
          value={snap.branching.toFixed(0)}
          hint={`edge ${fmt(snap.edge, 2)}`}
        />
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">
            Surprise over time
          </div>
          <div className="font-mono text-[10px] tabular-nums text-muted">
            {DIR_NAMES[snap.lastAction]}
          </div>
        </div>
        <Sparkline values={snap.history} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SenseGrid data={snap.obs} label="Seen" />
        <SenseGrid data={snap.pred} label="Predicted" />
      </div>

      <div>
        <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">
          Imagined moves
        </div>
        <ImaginedRow imagined={snap.imagined} scores={snap.scores} action={snap.lastAction} />
      </div>

      <div className="rounded-[var(--radius-lg)] bg-surface-2 px-4 py-4 sm:px-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">Thought</div>
        <p className="font-display mt-2 text-xl leading-snug text-fg italic">{snap.thought}</p>
        <ol className="mt-4 space-y-2">
          {snap.thoughts.slice(1, 6).map((t) => (
            <li key={t.t} className="flex gap-3 text-sm text-muted">
              <span className="font-mono tabular-nums text-subtle">{t.t}</span>
              <span>{t.text}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
