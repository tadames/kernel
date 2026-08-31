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

Next hypothesis: two ticks is still myopic. Either (a) a short rollout with a value head on the latent (true multi-step credit), or (b) action-conditional ρ̂ via a second Loop on hidden activations — Phase 1. If horizon 2 makes the agent freeze near walls once the model is confident, confidence gating is too strong or wall cost in `readPred` is wrong; log it.

## 2026-08-28 — Horizon 2 actually wired

Prior commits added optional second-step scoring in `imagineScores` and updated Laws/Act copy, but `Kernel.choose` never passed `predictFrom` / `readPred` / `imagined2`. The agent was still one-step.

One change: wire horizon 2 into the live policy.

- `imagined2` scratch buffers on Kernel (Lab still inspects step-1 windows via `imagined`).
- `predictFrom`: treat the first predicted window as a new observation, encode + action, forward.
- `readPred`: pure model — destination cell and scent taken from the predicted window only (no true whiskers). Discount 0.65 × confidence already inside `imagineScores`.

G1–S3 still pass. Kernel tests (7) pass, including the G2 regression that adjacent food is taken under temperature 0.04. Typecheck clean. Production build clean. Preview serves Lab with live surprise/compression.

Evidence: `adjacentFood` still goes east; field ema still falls; structured stream compresses, noise does not. Horizon 2 no longer a paper claim.

Next hypothesis: two ticks is still myopic. Either (a) a short rollout with a value head on the latent (true multi-step credit), or (b) action-conditional ρ̂ via a second Loop on hidden activations — Phase 1. If the agent freezes near walls once confidence is high, confidence gating or wall cost in `readPred` is wrong; log it.

## 2026-08-29 — Expected residual as compression-progress curiosity

One change: curiosity is no longer mostly visit-scent. The intrinsic term is primarily the model's own expected residual — Bernoulli variance of the predicted window (`p(1-p)`, high when sigmoid outputs sit near ½) — mixed lightly with scent (0.7 / 0.3) and still scaled by recent progress ρ. When the compressor has stalled, uncertain regions are treated as noise and curiosity collapses.

Why: Law 04 and Schmidhuber both say reward the derivative, not raw novelty. Visit-scent was a stand-in. Expected residual is action-conditional through the imagined window (horizon 1 and 2), without a second Loop yet. Fully action-conditional ρ̂ on hidden activations remains Phase 1.

- `expectedResidual` exported from `policy.ts`; used inside `valueOf`.
- Laws 04 copy updated.
- Unit test: residual peaks at 0.5, falls at 0/1.
- G1–S3 still pass. Kernel tests (8) pass. Horizon-2 G2 still takes adjacent food under temperature 0.04.

Evidence: `node --experimental-strip-types --test src/lib/kernel/kernel.test.ts` — 8/8. Claims G1–S3 green. Field ema still falls; structured stream compresses, noise does not.

Next hypothesis: if the agent now loiters in regions the model is merely unconfident about (early life, every cell near 0.5), confidence gating or the residual weight is too strong relative to whiskers. Or: expected residual is still not ρ̂ — a second Loop on hidden state would predict *how much* δ falls after the update. That is the real Phase 1 move.

## 2026-08-29 — Complexity trace (commitment + edge band)

One change: the kernel now *measures* growth of effective complexity and whether action sits between freeze and noise. It still does not grow its own architecture (Phase 3) and it does not self-tune temperature (open problem 6). The numbers are allowed to fail.

- `complexity.ts`: policy entropy H (normalised), branching of imagined scores, hidden participation, edge index 4H(1−H).
- Loop `commitment` = 1 − expectedResidual(lastPred). Polarization of the guess.
- Kernel records H, branching, edge on every choose. Snapshot / Lab / Loop / Bench show them.
- Law 07. Claims C1 (commitment rises on the period-6 stream and not on a coin) and C2 (Field branching stays interior, not 1 and not 5).
- `rebuildWorld` alias so the Lab store matches Kernel.setWorld.

Evidence: probe on Field seeds 1,3,7,11,22 — late branching ~3.2–3.5, H ~0.73–0.93. Stream commitment structured 0.15 → 0.78; noise stays ~0.06–0.11.

Next hypothesis: if C2 ever fails by freeze, temperature 0.45 is too low once the model is confident, or wall cost in `readPred` dominates. If C1 flickers, the 60-step late window is too short. A controller that moves T to keep branching interior would be the first honest criticality loop — not this commit.

## 2026-08-30 — Action-conditional residual-drop ρ̂ (horizon 2)

One change: curiosity now uses a cheap action-conditional compression-progress signal extracted from the existing horizon-2 imagination.

For each first action the policy already predicts a window, then the best follow-up window. Expected residual (Bernoulli variance) on those two windows yields ρ̂ = max(0, res₁ − res₂). Moves the model itself expects to make more certain get a higher explore scale, mixed with the global progress EMA. Visit-scent remains a light prior. No second Loop, no extra weights — the signal is free from the planner that was already there.

- `valueOf` accepts `rhoHat`; `imagineScores` computes residual drop on the best second-step path.
- Laws 04 and Act stage note updated. RESEARCH open problem 1 narrowed.
- G1–S3 / C1–C2 still pass. Kernel tests (10) pass.

Evidence: `node --experimental-strip-types --test src/lib/kernel/kernel.test.ts` — 10/10. Claims green. Adjacent food still taken under temperature 0.04; field ema falls; structured stream compresses, noise does not.

Next hypothesis: residual drop can be near zero while the model is still uncalibrated (both windows near ½), so early life may still lean on global ρ and scent. Or: a true model-of-learning (second Loop on hidden activations) would predict *how much* δ falls after the real update, not only the imaginary residual drop. That is still Phase 1. If C2 freezes, the extra prog term may be sharpening scores too hard — log branching.
