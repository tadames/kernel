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

Run `npm test` (the kernel file) or open **Bench**.

| ID | Claim | Falsifier |
|---|---|---|
| G1 | On Field, ema surprise falls | late ≥ 85% of early and late ≥ 0.14 |
| G2 | Hungry body takes adjacent food | action is not east / no meal |
| S1 | A repeating bit stream compresses | structured late not near 0 |
| S2 | A fair coin does not compress | noise late collapses toward 0 |
| S3 | Structure is much cheaper than noise | structured late ≥ 35% of noise late |
| C1 | Effective complexity grows on structure | structured commitment does not rise, or noise polarizes |
| C2 | Policy stays between freeze and a coin | mean branching after burn-in is 1 or 5 |

S2 is the load-bearing test. Measuring surprise on a sliding window would cheat (7 of 8 bits are a copy). We predict the **next bit only**. A system that drives that residual to zero on a fair coin is overfitting a moment, not finding a regularity.

Seeds are fixed. If a claim flickers, that is a result: the kernel is too noisy, or the threshold is theatre. Either way, log it in `JOURNAL.md`. It is not a license to loosen the test until it passes.

## Open problems (ordered)

1. **Action-conditional ρ̂.** Curiosity uses expected residual plus the residual *drop* across horizon-2 imagination (prefer moves the model expects to make more certain). Global ρ still scales. A true model-of-learning — a second kernel whose observations are the first kernel’s hidden state — remains Phase 1.
2. **Latent prediction.** Reconstructing cells is the wrong objective for anything richer than this grid (LeCun). Predict in a latent, discard incompressible bits.
3. **Credit assignment longer than one step.** Imagination is one tick. A roll-out, or an option, is the next honest increase in search.
4. **Self-revision.** Learning rate, curiosity, even architecture as part of the world the loop can model (Phase 3). That is when complexity is allowed to grow in the *shape* of the mind, not only in commitment of its predictions.
5. **Grounded language.** Tokens as a compression of *this* agent’s stream, not a scrape of the web (Phase 2).
6. **Self-tuned criticality.** C2 is a band-check, not a controller. Temperature and learning rate are still knobs. A true edge-of-chaos kernel would move η and T so branching stays interior without a human.

## How to work on this

One change that makes a claim sharper, or an open problem smaller. Tests must still pass — or the journal must record the failure and the hypothesis. Push to `tadames/kernel`. The daily job exists so the loop, the research one, does not die when a person gets bored.

## License

MIT. Fork the loop.
