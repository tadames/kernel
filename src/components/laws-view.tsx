import { LAWS, PHASES } from "@/lib/kernel/copy";

export function LawsView() {
  return (
    <article className="mx-auto w-full max-w-2xl pb-16">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-subtle">The plan</p>
      <h1 className="font-display mt-3 text-4xl leading-[1.15] tracking-[-0.03em] text-fg sm:text-5xl">
        The smallest mind that can grow
      </h1>
      <p className="mt-6 text-lg leading-relaxed text-muted">
        A kernel of intelligence is not a larger model. It is the fewest operations from which learning,
        curiosity, and action can arise without a teacher. This is that kernel, running here, with nothing
        hidden and no one to ask permission.
      </p>

      <ol className="mt-14 space-y-12">
        {LAWS.map((law) => (
          <li key={law.id}>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-[10px] tabular-nums text-subtle">{law.id}</span>
              <h2 className="font-display text-2xl tracking-[-0.02em] text-fg">{law.title}</h2>
            </div>
            <p className="mt-3 text-base leading-relaxed text-muted">{law.body}</p>
          </li>
        ))}
      </ol>

      <section className="mt-16">
        <h2 className="font-display text-2xl tracking-[-0.02em] text-fg">The loop</h2>
        <pre className="mt-5 overflow-x-auto rounded-[var(--radius-lg)] bg-surface-2 px-5 py-5 font-mono text-sm leading-7 text-fg">
{`observe     x  ← sense(world)
predict     x̂  ← M(x₋, a₋)
surprise    δ  ← ‖x − x̂‖²
compress    M  ← M − η ∇δ
progress    ρ  ← δ̄ − δ
act         a  ← argmax  curiosity·ρ̂ + goal·r̂`}
        </pre>
        <p className="mt-4 text-base leading-relaxed text-muted">
          That is the whole agent. The network is a few thousand weights. The body is a point with energy.
          The world is a grid you can edit. Everything else — foraging, avoiding walls, seeking the unknown —
          is what the loop does when you let it run.
        </p>
      </section>

      <section className="mt-16">
        <h2 className="font-display text-2xl tracking-[-0.02em] text-fg">Research program</h2>
        <p className="mt-3 text-base leading-relaxed text-muted">
          The work is to keep the kernel small enough to understand, then grow only what the loop itself
          requires. Not a product. A public seed.
        </p>
        <ol className="mt-8 space-y-6">
          {PHASES.map((p) => (
            <li key={p.id} className="grid grid-cols-[3rem_1fr] gap-4">
              <div className="font-mono text-sm tabular-nums text-subtle">
                {p.now ? "now" : `0${p.id}`}
              </div>
              <div>
                <h3 className="text-base font-medium text-fg">{p.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{p.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-16 border-t border-line pt-10">
        <h2 className="font-display text-2xl tracking-[-0.02em] text-fg">What to try</h2>
        <ul className="mt-4 space-y-3 text-base leading-relaxed text-muted">
          <li>Watch surprise fall. That curve is the mind writing a model of the world.</li>
          <li>Draw a wall in front of it. The error will spike. Then the guess will catch up.</li>
          <li>Set curiosity to zero and goal high. It becomes a hungry animal.</li>
          <li>Set goal to zero. It becomes a scientist — it only wants a better model.</li>
          <li>Open Pulse. The meal teleports. Intelligence here is the recovery, not the first success.</li>
        </ul>
      </section>
    </article>
  );
}
