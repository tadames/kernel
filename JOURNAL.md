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
