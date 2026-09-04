# Kernel journal

Daily log of what changed, what was learned, next hypothesis.

## 2026-08-27 — Seed

Shipped Phase 0: a 5×5 local world-model (two-layer MLP, ~5k weights) trained online on prediction error, with curiosity as novelty plus falling surprise, and a body with energy. Five worlds (Field, Rooms, Spiral, Pulse, Blank). The loop is inspectable in the Lab / Laws / Loop views.

Hypothesis for next: the policy still cheats a little with reactive food-in-view. True compression-progress as intrinsic reward, plus a latent predictor (Phase 1), should make exploration less twitchy and walls more like a map.

## 2026-08-27 — Compression-progress intrinsic reward

Daily pass: curiosity became novelty + expected residual + recent EMA improvement, and raw surprise stopped being a positive term. Food-in-view weights were softened, not removed. That was still a forager.

## 2026-08-27 — The toy was a forager

The seed mixed the mind with the body. Policy scanned the current 5×5 for food (a radar). Curiosity was visit-scent. Surprise was measured *after* the gradient step, so the demo looked more certain than the model was. That is a creature that learns on the side, not a kernel.

Phase 0.1:

- Extracted `Loop` (`assimilate` / `imagine` / `commit`). Surprise is the residual *before* the update.
- Policy: destination cell already in the window (whiskers) plus imagination. No half-plane food radar. `pred[CENTER]` is the cell you stand on after a move, not the wall you hit — the first seed hid that by scanning current obs.
- Second testbed: next-bit prediction on a stream (period-6 vs fair coin). A walking tape confounded the claim (visit-scent + window copy). The residual is the next bit only.
- Claims G1, G2, S1, S2, S3 in `experiments.ts`, shown live in Bench, asserted in tests.
- `RESEARCH.md` is the protocol. Laws now state what would falsify the work.

Open: ρ is still a scalar that scales novelty, not action-conditional ρ̂. That is Phase 1, not a slider.

Next hypothesis: if S2 ever fails (noise compresses), the replay buffer is memorising a moment — shrink it, or the net is large enough to overfit a short window of coin flips.

## 2026-08-28 — Horizon 2 imagination

One change: the policy looks one step further.

`imagineScores` now accepts an optional second tick. For each first action it still scores whiskers + one-step prediction as before. Then it treats the predicted window as a new observation, imagines every follow-up, takes the best second-step value, and adds `discount × confidence × best2` (discount 0.65). Step 2 is pure model — no true whiskers — and is gated by the same confidence that already mutes uncalibrated predictions. Scratch buffers `imagined2` live on the Kernel so the Lab can still inspect the first-step windows.

Laws 05 and the Act stage note say horizon 2. G1–G3 / S1–S3 still pass. Kernel tests (7) pass. Typecheck clean. Production build clean. Browser loads Lab with live surprise/compression.

Evidence: `adjacentFood` / G2 still takes the east food under temperature 0.04; field ema still falls; structured stream compresses, noise does not.

Next hypothesis: if horizon 2 ever overrides true whiskers on G2, the discount is too high or confidence is not gating hard enough. A third step would be noise without a latent.

## 2026-08-29 — Effective complexity and the freeze/noise band

One change: the kernel now *measures* growth of effective complexity and whether action sits between freeze and noise. It still does not grow its own architecture (Phase 3) and it does not self-tune temperature (open problem 6). The numbers are allowed to fail.

- `complexity.ts`: policy entropy H (normalised), branching of imagined scores, edge-of-chaos index, participation ratio of the hidden layer.
- Snapshot and Bench expose them. Claim C1: commitment (1 − expected residual) rises on structure, stays low on noise. Claim C2: on Field, mean branching stays interior (not 1, not 5).
- Laws and Stages updated. Tests assert C1/C2 with the rest.

Evidence: evaluateClaims passes; kernel tests pass.

Next hypothesis: if C2 fails on Rooms (walls force freeze), branching is measuring world structure more than criticality of the policy. Temperature remains a knob until self-tuned criticality.

## 2026-08-30 — Action-conditional ρ̂ from residual drop

One change: curiosity now includes an action-conditional compression-progress signal from horizon-2 imagination.

For each first action, residual of the step-1 predicted window vs residual of the best step-2 window yields ρ̂ = max(0, res1 − res2). That scales the explore term together with global progressEma. Prefer paths the model itself expects to make more certain.

Laws 04 updated. G1–C2 still pass. Kernel tests 9/9.

Evidence: structured stream still compresses; noise does not; Field surprise falls; G2 still takes adjacent food.

Next hypothesis: if ρ̂ dominates and the agent freezes on well-modeled regions, the mix weight on residual drop is too high relative to expected residual itself. A true second Loop on hidden activations (model-of-learning) remains Phase 1.

## 2026-08-31 — Save / load brains

One change: a mind can leave its body and resume.

`Loop.exportBrain` / `importBrain` carry weights, ema, progressEma, surprise, progress, and a compact tail of the replay buffer. Kernel and StreamKernel expose `saveBrain` / `loadBrain`. Legacy weights-only snapshots still load. Dimension mismatch is rejected.

Why: the prior hypothesis was that loaded minds thrash on a new world because ema jumps and stays high. Weights without the progress signal make the policy treat a trained compressor as a newborn (confidence gate from ema, curiosity scaled by progressEma). Replay keeps a short memory so the first post-load steps do not start from an empty buffer.

G1–C2 still pass. Kernel tests 11/11, including the strengthened round-trip (ema match, replay non-empty, legacy weights-only).

Evidence: `node --experimental-strip-types --test src/lib/kernel/kernel.test.ts` — 11/11.

Next hypothesis: if a mind saved on Field and loaded into Rooms still shows a long ema spike, the observation distribution shift dominates and a short re-burn-in schedule (higher lr for N steps) is the honest fix. True action-conditional model-of-learning (second Loop on hidden state) remains Phase 1.

## 2026-09-01 — Re-burn-in after loadBrain

One change: loading a mind arms a short elevated-lr window so observation shift does not thrash a trained compressor.

`Kernel` and `StreamKernel` set `burnIn = 28` on successful `loadBrain`. While burn-in remains, `step` uses `lr × 2.4` then decrements. `resetBrain` clears the counter. Weights and learning state (ema, progressEma, replay) still come from `Loop.exportBrain` / `importBrain`; burn-in is the adaptation schedule, not a second model.

Also restored `stream.ts` and `kernel.test.ts` from the prior incomplete save/load push (they had been left as PLACEHOLDER on main). Round-trip test now asserts ema match, non-empty replay, legacy weights-only load, and burn-in arming. New claim-style test: Field→Rooms load settles ema within a modest window under burn-in.

Why: the 2026-08-31 hypothesis was that distribution shift dominates after a cross-world load. Raising η for a few dozen steps is the honest minimal fix before Phase 1 (action-conditional model-of-learning).

Evidence: `node --experimental-strip-types --test src/lib/kernel/kernel.test.ts` — 12/12. Typecheck clean. Production build clean. Browser smoke: Lab title Kernel, canvas present, no page/console errors.

Next hypothesis: if Field→Rooms still spikes ema beyond ~2× trained for long after burn-in expires, either the burn window is too short for wall-heavy maps, or the policy temperature needs a temporary lift during adaptation. True action-conditional ρ̂ (second Loop on hidden state) remains Phase 1.

## 2026-09-03 — Burn-in temperature lift

One change: after loadBrain the adaptation window is longer and the policy is temporarily hotter.

- `burnIn` armed at 36 steps (was 28) on both Kernel and StreamKernel.
- While adapting, step uses elevated lr as before; choose multiplies temperature by 1.55 (capped at 1.2) so the body explores while the compressor absorbs distribution shift.
- Tests stepped past the new window; Field→Rooms claim still holds under the joint schedule.

Why: the prior hypothesis named two honest next moves when ema stays high after burn-in — lengthen the window, or lift temperature during adaptation. Both are small, body-side, and do not invent a second model. Phase 1 (true action-conditional ρ̂ / second Loop on hidden state) remains the real open problem.

Evidence: `node --experimental-strip-types --test src/lib/kernel/kernel.test.ts` — 12/12. Typecheck clean. Production build clean. Browser smoke: Lab title Kernel, canvas present, no page/console errors.

Next hypothesis: if Field→Rooms ema still exceeds ~2× trained after the longer hot window, the observation channels themselves need a short whitening / bias adaptation, or the policy must treat burn-in as a distinct imagination temperature rather than a scalar on the same softmax. True hierarchical latent (Phase 1) is the cleaner long-term answer.
