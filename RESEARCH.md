# Kernel — research notes

A public attempt at the smallest *process* from which autonomous learning can grow.

This is not a paper, and it is not AGI. It is a specification, two testbeds, and a list of claims that are allowed to fail. The Lab is an instrument. The kernel is `src/lib/kernel/loop.ts`.

## Claim

Intelligence, at minimum, is a closed loop:

```
observe     x
predict     x̂ = M(x₋, a₋)
surprise    δ = ‖x − x̂‖²          # residual of the current model
compress    M ← M − η ∇δ
progress    ρ = δ̄ − δ             # improvement, not surprise
act         a ← π(M, ρ, goal)
```

Four statements follow:

1. A mind is a process, not a pile of parameters.
2. Prediction is compression. The incomputable ceiling is AIXI (Hutter 2005): the shortest program consistent with the observation history, acting to maximise reward in that program.
3. Curiosity is *compression progress* (Schmidhuber 1991, 2008), not raw surprise. Noise is infinitely surprising and infinitely useless.
4. The loop must be domain-general. If it only works inside one video-game body, it is a toy.

## What we are not claiming

- That this approximates AIXI in any formal sense. Solomonoff induction is uncomputable; SGD on a two-layer net is a compressor of a different kind.
- That reward is enough (Sutton et al. 2021) *or* that prediction is enough. The kernel uses both: an extrinsic goal channel when the environment provides one, and ρ when it does not.
- That a 5×5 window and ~5k weights are a path to general intelligence. They are a path to *watching the loop be wrong*.
- That one-step imagination is planning. It is not. Hierarchy and latent prediction are Phase 1.

## Related work (the actual lineage)

| Idea | Who | What we take |
|---|---|---|
| Universal induction + AIXI | Solomonoff; Hutter 2000/2005 | The ceiling: shortest world-model, then act |
| Compression progress | Schmidhuber 1991, 2008, 2010 | Intrinsic reward is *improvement* of the compressor |
| Free-energy / active inference | Friston | Surprise as the training signal; action to make the model better |
| Reward is enough | Silver, Singh, Precup, Sutton 2021 | Extrinsic goal is a first-class input to π, not a special case |
| World models / JEPA | Ha & Schmidhuber 2018; LeCun 2022 | Act in imagination; predict latents, not pixels (Phase 1) |
| ICM / RND | Pathak 2017; Burda 2018 | Practical curiosity. We do not copy them: ICM rewards δ, which loves noise |
| Bitter lesson | Sutton 2019 | Search + learning, scaled. Here the search is tiny on purpose |

The first seed of this repository mixed a world-model with a hand-coded food radar and a visit-scent policy. That is a forager with a learning sidecar. It is not a kernel. Phase 0.1 (this document) splits them.

## Architecture

```
Loop            domain-general assimilate / imagine / commit
MLP             the compressor (online SGD, tanh → sigmoid)
policy          one-step imagination; scores from predicted obs only
Kernel            grid testbed (body, energy, food, walls)
StreamKernel      next-bit testbed (period-6 vs fair coin)
complexity      commitment, policy entropy, branching, 4H(1−H)
experiments       claims G1, G2, S1, S2, S3, C1, C2
```

The policy may not scan the current observation for food over a half-plane. It may use the destination cell already visible in the window (whiskers — that is sensing). It also reads predicted wall / food from `M(obs, action)`. Early in life the model is uncalibrated (sigmoid outputs near ½); predicted terms are gated by a confidence that rises as δ̄ falls.

## Experimental protocol

Run `npm test` (the kernel file), `npm run bench:json` (seeds 1..5, probe plus on-policy ema), `npm run sweep` (curiosity signals, default 20 seeds), or open **Bench**. The nightly contract is `AGENTS.project.md`. G1 is held-out probe error on Field. Late error must beat that map's per-cell-mean floor and fall below 85% of the early probe. The absolute 0.14 arm is retired. Do not bring it back.

| ID | Claim | Falsifier |
|---|---|---|
| G1 | On Field, held-out probe error beats the per-cell mean and falls | probe late ≥ the mean floor, or probe late ≥ 85% of probe early |
| G2 | Hungry body takes adjacent food | action is not east / no meal |
| S1 | A repeating bit stream compresses | structured late not near 0 |
| S2 | A fair coin does not compress | noise late collapses toward 0 |
| S3 | Structure is much cheaper than noise | structured late ≥ 35% of noise late |
| C1 | Effective complexity grows on structure | structured commitment does not rise, or noise polarizes |
| C2 | Policy stays between freeze and a coin | mean branching after burn-in is 1 or 5 |

S2 is the load-bearing test. Measuring surprise on a sliding window would cheat (7 of 8 bits are a copy). We predict the **next bit only**. A system that drives that residual to zero on a fair coin is overfitting a moment, not finding a regularity.

Seeds are fixed. If a claim flickers, that is a result: the kernel is too noisy, or the threshold is theatre. Either way, log it in `JOURNAL.md`. It is not a license to loosen the test until it passes.

## Measurement priorities

Closed on 2026-10-22. Open problem 1 was already the shipped score: expected residual, the horizon-2 residual drop, and global ρ. It was not re-gated. The probe-scorable half of open problem 2 drops a channel the model is not beating its own running mean on. That mask, flag `discard`, raised Field probe late by 0.0162 [0.0070, 0.0256] against its absence (the gate's off − on interval is −0.0162 [−0.0256, −0.0070]) and raised lives by 0.25 [0.10, 0.45]. Seeds 1–20. The flag stays off. The remainder, flag `decode`, trains the hidden to match a stop-grad code of the next window and decodes that hidden to cells. Seeds 1–20, off minus on −0.0011 [−0.0100, 0.0078]. The interval includes zero. Lives on minus off −0.15 [−0.45, 0.15]. The flag stays off. The occupancy summary stays closed, and so does the late-return thread. Open problem 3's option, flag `option`, holds the sampled direction for a second tick. Seeds 1–20, off minus on 0.0107 [0.0032, 0.0179]. Seeds 1–200, off minus on 0.0048 [0.0022, 0.0076]. Lives on minus off at 200 seeds were −0.105 [−0.205, −0.005]. G2 and C2 stayed 200/200 on both arms. The flag is on. The roll-out, flag `rollout`, executes the imagined horizon-2 follow-up on that second tick. Seeds 1–20, off minus on −0.0130 [−0.0234, −0.0018]. Lives on minus off were 0.65 [0.40, 0.85]. G2 and C2 stayed 20/20 on both arms. The flag stays off.

## Open problems (ordered)

1. **Action-conditional ρ̂.** Curiosity uses expected residual plus the residual *drop* across horizon-2 imagination (prefer moves the model expects to make more certain). Global ρ still scales. Shipped: that is the default rho score. A true model-of-learning — a second kernel whose observations are the first kernel’s hidden state — remains Phase 1.
2. **Latent prediction.** Reconstructing cells is the wrong objective for anything richer than this grid (LeCun). Predict in a latent, discard incompressible bits. The cell-loss mask was tested on 2026-10-20 and made the probe worse. It stays off. A latent target that still decodes to cells was tested on 2026-10-22. The probe interval includes zero. It stays off. This probe cannot score a target that no longer decodes to cells.
3. **Credit assignment longer than one step.** Horizon 2 and horizon 3 are the shipped imagination. An option holds the sampled direction for a second tick. That flag is on: seeds 1–200, the paired probe interval of off minus on lay above zero, and lives did not rise. A roll-out, executing the imagined horizon-2 follow-up on that second tick rather than the same primitive, was tested on 2026-10-23. Seeds 1–20, the paired probe interval of off minus on lay entirely below zero, and lives rose. The flag stays off. This probe's named roll-out is closed. The option remains the credit assignment that beat sampling every tick.
4. **Self-revision.** Learning rate, curiosity, even architecture as part of the world the loop can model (Phase 3). That is when complexity is allowed to grow in the *shape* of the mind, not only in commitment of its predictions.
5. **Grounded language.** Tokens as a compression of *this* agent’s stream, not a scrape of the web (Phase 2).
6. **Self-tuned criticality.** C2 is a band-check, not a controller. Temperature and learning rate are still knobs. A true edge-of-chaos kernel would move η and T so branching stays interior without a human.

## How to work on this

One change that makes a claim sharper, or an open problem smaller. Tests must still pass — or the journal must record the failure and the hypothesis. Push to `tadames/kernel`. The daily job exists so the loop, the research one, does not die when a person gets bored.

## License

MIT. Fork the loop.
