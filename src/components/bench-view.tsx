import { Sparkline } from "@/components/sparkline";
import { evaluateClaims, type Claim } from "@/lib/kernel/experiments";
import { StreamKernel, type StreamSnapshot } from "@/lib/kernel/stream";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

function BitStrip({ snap }: { snap: StreamSnapshot }) {
  return (
    <div className="flex h-10 w-full overflow-hidden rounded-[var(--radius-sm)] bg-line">
      {snap.bits.map((b, i) => {
        const last = i === snap.bits.length - 1;
        return (
          <div
            key={i}
            className={cn("relative h-full flex-1", last && "outline outline-1 outline-fg")}
            style={{
              background: b > 0.5 ? "var(--color-world-food)" : "var(--color-world-empty)",
            }}
          />
        );
      })}
    </div>
  );
}

function StreamCard({
  title,
  blurb,
  snap,
}: {
  title: string;
  blurb: string;
  snap: StreamSnapshot | null;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-xl tracking-[-0.02em]">{title}</h3>
        <span className="font-mono text-xs tabular-nums text-signal">
          {snap ? `δ̄ ${snap.ema.toFixed(3)}` : "—"}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">{blurb}</p>
      <div className="mt-4">{snap ? <BitStrip snap={snap} /> : <div className="h-10 rounded bg-surface-2" />}</div>
      <div className="mt-3 flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">
        <span>guess {snap ? snap.pred.toFixed(2) : "—"}</span>
        <span>bit {snap ? snap.actual : "—"}</span>
      </div>
      <div className="mt-3">{snap ? <Sparkline values={snap.history} /> : <div className="h-12 rounded bg-surface-2" />}</div>
    </div>
  );
}

export function BenchView() {
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [structured, setStructured] = useState<StreamSnapshot | null>(null);
  const [noise, setNoise] = useState<StreamSnapshot | null>(null);
  const live = useRef<{ s: StreamKernel; n: StreamKernel } | null>(null);

  useEffect(() => {
    setClaims(evaluateClaims());
    const s = new StreamKernel("structured", 11);
    const n = new StreamKernel("noise", 11);
    live.current = { s, n };
    let raf = 0;
    let acc = 0;
    let last = performance.now();
    let pushAt = 0;
    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(80, ts - last);
      last = ts;
      acc += dt;
      const pair = live.current;
      if (!pair) return;
      while (acc >= 40) {
        pair.s.step();
        pair.n.step();
        acc -= 40;
      }
      if (ts - pushAt > 80) {
        pushAt = ts;
        setStructured(pair.s.snapshot());
        setNoise(pair.n.snapshot());
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <article className="mx-auto w-full max-w-2xl pb-16">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-subtle">The bench</p>
      <h1 className="font-display mt-3 text-4xl leading-[1.15] tracking-[-0.03em] text-fg sm:text-5xl">
        Same loop. Two streams. Claims that can fail.
      </h1>
      <p className="mt-6 text-lg leading-relaxed text-muted">
        The grid in the Lab is a body. This is the compressor under test: guess the next bit from the last
        eight. A period-6 rhythm is a regularity. A fair coin is not. If surprise falls on both, we are
        overfitting a moment, not compressing.
      </p>

      <div className="mt-10 grid gap-4">
        <StreamCard
          title="Structured"
          blurb="001011, repeating. After a few dozen bits the next one is determined."
          snap={structured}
        />
        <StreamCard
          title="Noise"
          blurb="A fresh fair bit every step. The residual should sit near ¼ — predicting ½, squared."
          snap={noise}
        />
      </div>

      <section className="mt-12">
        <h2 className="font-display text-2xl tracking-[-0.02em]">Claims</h2>
        <p className="mt-2 text-sm text-muted">
          Evaluated in this browser when you opened the bench. The same suite runs in the repository tests.
        </p>
        <ol className="mt-6 divide-y divide-line border-y border-line">
          {(claims ?? []).map((c) => (
            <li key={c.id} className="grid gap-2 py-5 sm:grid-cols-[3rem_1fr]">
              <div className={cn("font-mono text-sm tabular-nums", c.pass ? "text-signal" : "text-danger")}>
                {c.pass ? "pass" : "fail"}
              </div>
              <div>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-[10px] text-subtle">{c.id}</span>
                  <span className="text-sm text-fg">{c.claim}</span>
                </div>
                <div className="mt-1 font-mono text-xs tabular-nums text-muted">{c.detail}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
