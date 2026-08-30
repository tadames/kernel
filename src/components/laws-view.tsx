import { LAWS, PHASES } from "@/lib/kernel/copy";

export function LawsView() {
  return (
    <article className="mx-auto w-full max-w-2xl pb-16">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-subtle">The plan</p>
      <h1 className="font-display mt-3 text-4xl leading-[1.15] tracking-[-0.03em] text-fg sm:text-5xl">
        The smallest mind that can grow
      </h1>
      <p className="mt-6 text-lg leading-relaxed text-muted">
        A kernel of intelligence is not a larger model, and it is not a clever forager. It is the fewest
        operations from which learning, curiosity, and action arise without a teacher — operations that still
        work when you change the world. This is that kernel, with a body you can watch, a second world that
        is not a grid, and tests that are allowed to fail.
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
surprise    δ  ← ‖x − x̂‖²     before the update
compress    M  ← M − η ∇δ
progress    ρ  ← δ̄ − δ
act         a  ← π(M, ρ, goal)`}
        </pre>
        <p className="mt-4 text-base leading-relaxed text-muted">
          The network is a few thousand weights because a compressor you cannot hold in your head is not a kernel
          you can fork. The grid, the energy, the food, the stream — those are environments. Everything else is
          what the loop does when you let it run.
        </p>
      </section>

      <section className="mt-16">
        <h2 className="font-display text-2xl tracking-[-0.02em] text-fg">What this is not</h2>
        <ul className="mt-4 space-y-3 text-base leading-relaxed text-muted">
          <li>Not AIXI. AIXI is the incomputable ceiling. This is a gradient approximation you can run.</li>
          <li>Not a language model, and not a claim that next-token prediction is enough.</li>
          <li>Not an agent with a food radar. The first seed scanned the window. The body may use the adjacent cell it already sees. It may not pool food over a half-plane.</li>
          <li>Not AGI. A 5k-weight net in a 15-cell window will not leave this page and write a novel.</li>
        </ul>
      </section>

      <section className="mt-16">
        <h2 className="font-display text-2xl tracking-[-0.02em] text-fg">What would falsify this</h2>
        <ul className="mt-4 space-y-3 text-base leading-relaxed text-muted">
          <li>Surprise falls on a fair coin as fast as on a repeating stream. Then we are not compressing — we are fitting a moment.</li>
          <li>A hungry body ignores food in the adjacent cell. Then the sensors are not wired to action.</li>
          <li>The stream requires a different learning rule than the grid. Then this is not a kernel, it is two toys.</li>
          <li>Predictions never leave ½ on a repeating stream, or they polarize on a coin. Then effective complexity is not growing where it should.</li>
          <li>Imagined actions collapse to one move, or all five stay tied. Then the body is frozen or a coin — not at the edge where a small input can still matter.</li>
        </ul>
        <p className="mt-4 text-base leading-relaxed text-muted">
          Those three claims run in the Bench, and in the repository tests. If they fail, the journal says so.
        </p>
      </section>

      <section className="mt-16">
        <h2 className="font-display text-2xl tracking-[-0.02em] text-fg">Research program</h2>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Keep the kernel small enough to understand. Grow only what the loop itself requires. Not a product.
          A public seed.
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
          <li>Open Bench. One stream is a rhythm. The other is a coin. Only one should get cheaper to predict.</li>
          <li>Set curiosity to zero and goal high. It becomes a hungry animal — once the model can see food.</li>
          <li>Set goal to zero. It becomes a scientist. It only wants a better model.</li>
        </ul>
      </section>
    </article>
  );
}
