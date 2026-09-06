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

`imagineScores` now accepts an optional second tick. For each first action it still scores whiskers + one-step prediction as before. Then it treats the predicted window as a new observation, imagines every follow-up, takes the best second-step value, and blends a fraction into the first-action score. Horizon 2 is a search over the model’s own predictions, not a second network.

Wiring: `Kernel.choose` fills `imagined2` and passes `predictFrom` / `readPred` into the scorer. G2 (adjacent food) still holds — whiskers dominate when food is already in view.

Evidence: evaluateClaims passes; kernel tests pass.

Next hypothesis: if C2 fails on Rooms (walls force freeze), branching is measuring world structure more than criticality of the policy. Temperature remains a knob until self-tuned criticality.

## 2026-08-30 — Action-conditional ρ̂ from residual drop

One change: curiosity now includes an action-conditional residual-drop term across horizon-2 imagination. Prefer moves the model expects to make more certain. Global ρ still scales. A second loop on hidden activations remains Phase 1.

## 2026-09-04 — Finish incomplete burn-in restore

Prior commits (0423c81 and the "Restore" follow-ups) deleted `kernel.ts` / `stream.ts` / `kernel.test.ts` and left PLACEHOLDER stubs on main. The journal claimed burnIn=36 + temperature lift, but the source was empty.

One change: restore the real files from the last good base (058811b / a7e2612 / 87dd1bc) and apply the intended adaptation schedule:

- `burnIn = 36` on successful `loadBrain` (Kernel and StreamKernel).
- While `burnIn > 0`, `choose` multiplies policy temperature by 1.55 (capped at 1.2) so the body explores while the compressor absorbs shift; elevated lr unchanged.
- Tests step past the longer window (50 / 55 steps); Field→Rooms claim still holds.

No new feature beyond finishing the prior day's incomplete push. Auth still off. UI untouched.

Evidence: `node --experimental-strip-types --test src/lib/kernel/kernel.test.ts` — 12/12. Typecheck clean. Production build clean. Browser smoke: Lab title Kernel, canvas present, no page errors.

Next hypothesis: if Field→Rooms ema still exceeds ~2× trained after the longer hot window, try a short observation whitening / bias adaptation during burn-in, or a distinct imagination temperature rather than a scalar on the same softmax. True hierarchical latent (Phase 1) remains the cleaner long-term answer.

## 2026-09-05 — Fix incomplete restore + observation centering on burn-in

Prior "restore" commits left `setWorld` assigning `g.cells` when `generateWorld` returns the `Uint8Array` itself, and dropped the Kernel convenience getters (`ema`, `surprise`, …) and `Loop.weightEnergy`. Tests were red on main.

One change beyond the fix: during burn-in, the model input is lightly centered against a running observation-channel mean (EMA 0.04). Field→Rooms is largely a mean shift on the wall channel; removing ~45% of (mean − 0.2) and clamping lets the existing weights absorb the residual faster. Mean is tracked every step; centering applies only while `burnIn > 0`. Whiskers and the assimilate target stay raw.

Evidence: `node --experimental-strip-types --test src/lib/kernel/kernel.test.ts` — 12/12. Auth still off. UI untouched.

Next hypothesis: if cross-world ema after the joint schedule (hot lr + hot temp + input centering) still sits near the 2.2× ceiling, the honest next step is a true hierarchical latent (Phase 1): a second small Loop whose observations are the first Loop’s hidden activations, so ρ̂ becomes a learned model of learning rather than a residual-drop heuristic.
