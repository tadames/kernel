# Kernel journal

Daily log of what changed, what was learned, next hypothesis.

## 2026-08-27 — Seed

Shipped Phase 0: a 5×5 local world-model (two-layer MLP, ~5k weights) trained online on prediction error, with curiosity as novelty plus falling surprise, and a body with energy. Five worlds (Field, Rooms, Spiral, Pulse, Blank). The loop is inspectable in the Lab / Laws / Loop views.

Hypothesis for next: the policy still cheats a little with reactive food-in-view. True compression-progress as intrinsic reward, plus a latent predictor (Phase 1), should make exploration less twitchy and walls more like a map.

## 2026-08-27 — Compression-progress intrinsic reward

Changed the policy’s curiosity term from “novelty + raw EMA surprise” to true compression-progress:

- **novelty** (unvisited scent) still drives spatial coverage
- **expected residual** — mean squared difference between current obs and the model’s imagined next view for that action — rewards moves the model still cannot predict
- **recent progress** — `max(0, prevEma − ema)` scaled into the score — rewards the derivative of surprise (Schmidhuber), not the level
- Absolute EMA surprise is no longer a positive term (the noise trap)
- Softened reactive food-in-view weights so curiosity is not drowned

Law 04 copy updated to match. New unit test asserts positive compression-progress ticks appear while living and that scores stay finite.

Evidence: `node --experimental-strip-types --test src/lib/kernel/kernel.test.ts` → 3/3 pass; `npm run typecheck` clean; `npm run build` clean; browser-smoke on :8081 shows canvas, title “Kernel”, no console/page errors.

Next hypothesis: with progress as reward, exploration should be less twitchy, but the world model is still pixel-local. A latent / hierarchical predictor (Phase 1) — predict in hidden space, not cells — should make walls feel like a map and multi-step imagination cheaper.
