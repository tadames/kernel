# Kernel

The smallest mind that can grow.

A public, in-browser kernel of autonomous intelligence. No account. No API key. No teacher.

```
observe     x  ← sense(world)
predict     x̂  ← M(x₋, a₋)
surprise    δ  ← ‖x − x̂‖²
compress    M  ← M − η ∇δ
progress    ρ  ← δ̄ − δ
act         a  ← curiosity · ρ̂  +  goal · r̂
```

That loop is the whole agent. A few thousand weights, a short memory, a body with energy. Everything else — foraging, avoiding walls, seeking the unknown — is what the loop does when you let it run.

## Why this exists

Large models are useful compressors of human text. They do not start from nothing, they do not live in a world, and they are not yours.

The kernel is what remains when you strip everything that is not necessary for a system to *become* more intelligent over time, on its own. It approximates, in a form you can watch, the same idea in AIXI (Hutter), active inference (Friston), compression progress (Schmidhuber), and world models (LeCun).

Intelligence should be a commons. This seed is small enough to understand, fork, and run on a phone.

## Research program

| Phase | What |
|---|---|
| 0 Seed | Local world model, online SGD, curiosity, a body. This repository. |
| 1 Hierarchy | Predict in latent space, not in cells. |
| 2 Language | A vocabulary grounded in what this agent has seen. |
| 3 Self-revision | The learning rules become part of the world it can model. |
| 4 Commons | The seed runs anywhere. No gatekeepers on the means of mind. |

See [JOURNAL.md](JOURNAL.md) for daily progress.

## License

MIT. Fork it.
