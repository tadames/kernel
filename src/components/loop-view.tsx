import { STAGES } from "@/lib/kernel/copy";
import { HIDDEN, IN, OUT, type Snapshot } from "@/lib/kernel/kernel";

export function LoopView({ snap }: { snap: Snapshot | null }) {
  const live: Record<string, string> = {
    observe: snap ? `window ${snap.size}² · body at ${snap.ax},${snap.ay}` : "waiting",
    predict: snap ? `${IN} → ${HIDDEN} → ${OUT} weights` : "waiting",
    surprise: snap ? snap.surprise.toFixed(4) : "—",
    compress: snap ? `η = learning rate · |w̄| ${snap.weightEnergy.toFixed(4)}` : "—",
    progress: snap ? (snap.progress >= 0 ? "+" : "") + snap.progress.toFixed(4) : "—",
    act: snap ? `energy ${snap.energy.toFixed(0)} · ${snap.foods} meals` : "—",
  };

  return (
    <article className="mx-auto w-full max-w-2xl pb-16">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-subtle">The kernel</p>
      <h1 className="font-display mt-3 text-4xl leading-[1.15] tracking-[-0.03em] text-fg sm:text-5xl">
        Six operations. Then again.
      </h1>
      <p className="mt-6 text-lg leading-relaxed text-muted">
        This is the entire mind. A compressor, a short memory of what just happened, and a body that can
        move. No pretraining. No language. No one at the other end of an API. The numbers on the right are
        live from the grid testbed. The same six lines run on the bit stream in the Bench.
      </p>

      <ol className="mt-12 divide-y divide-line border-y border-line">
        {STAGES.map((s, i) => (
          <li key={s.id} className="grid gap-3 py-8 sm:grid-cols-[2.5rem_1fr] sm:gap-6">
            <div className="font-mono text-sm tabular-nums text-subtle">{String(i + 1).padStart(2, "0")}</div>
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-base font-medium text-fg">{s.name}</h2>
                <span className="font-mono text-xs tabular-nums text-signal">{live[s.id]}</span>
              </div>
              <pre className="mt-3 overflow-x-auto font-mono text-sm text-fg">{s.code}</pre>
              <p className="mt-3 text-sm leading-relaxed text-muted">{s.note}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-10 text-base leading-relaxed text-muted">
        If you can hold these six lines, you can hold the argument: intelligence is the capacity to compress
        a stream of experience into a model that is useful for acting. Scale the compressor, deepen the
        hierarchy, ground a language in the same loop — the kernel does not change. That is why it can be
        small, and why it can be yours.
      </p>
    </article>
  );
}
