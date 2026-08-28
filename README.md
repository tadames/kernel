# Kernel

The smallest mind that can grow.

A public kernel of autonomous intelligence: a loop, a compressor, two testbeds, and claims that are allowed to fail. No account. No API key. No teacher.

```
observe     x
predict     x̂ = M(x₋, a₋)
surprise    δ = ‖x − x̂‖²          before the update
compress    M ← M − η ∇δ
progress    ρ = δ̄ − δ
act         a ← π(M, ρ, goal)
```

The kernel is [`src/lib/kernel/loop.ts`](src/lib/kernel/loop.ts). The grid in the Lab is one body. The bit stream in the Bench is another. If the loop cannot leave the body it was born in, it was never a kernel.

## Why this exists

Large models are useful compressors of human text. They do not start from nothing, they do not live in a world, and they are not yours.

The kernel is what remains when you strip everything that is not necessary for a system to *become* more intelligent over time, on its own. It approximates, in a form you can watch and *falsify*, the same idea in AIXI (Hutter), active inference (Friston), compression progress (Schmidhuber), and world models (LeCun).

The first version of this repository was a forager with a learning sidecar — a food radar over the current window, novelty as visit-scent, surprise measured after the update. That was a toy. This is the split: loop vs body, imagination vs radar, structure vs noise.

Intelligence should be a commons. This seed is small enough to understand, fork, and run on a phone.

## What to read

- [RESEARCH.md](RESEARCH.md) — claim, lineage, protocol, open problems
- [JOURNAL.md](JOURNAL.md) — daily log
- **Bench** in the app — the same claims, running in the browser

## Research program

| Phase | What |
|---|---|
| 0 Seed | Domain-general loop, two testbeds, falsifiable claims. This repository. |
| 1 Hierarchy | Predict in latent space; action-conditional ρ̂ |
| 2 Language | A vocabulary grounded in what this agent has seen |
| 3 Self-revision | The learning rules become part of the world it can model |
| 4 Commons | The seed runs anywhere. No gatekeepers on the means of mind |

## License

MIT. Fork it.
