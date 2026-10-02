# Journal

## 2026-09-27 evening (America/New_York)

### What changed
`loop.ts` on main was a 9-byte stub (`see-local0`) after the claimed restore. Finished that work first: restored Loop from the last intact tree, then the falling-streak gate (`SCENT_FALL_STREAK = 4`, persist `scentFallStreak`) and the truncated `kernel.test.ts` suite.

One improvement: horizon 3. Imagination now takes a third predicted window from the best step-2 state. ρ̂ adds the residual drop step-2→step-3 so a wall can hide compressible structure one step later and still pay. Scores add `γ² · confidence · best3`. Law 04 / 05 and the act stage note the extra step. Auth off. UI untouched.

### Evidence
`node --experimental-strip-types --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 23/23 pass (restored suite + novelty/ρ̂/streak + "horizon 3 scores a residual drop two steps past a wall"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200.

### Next hypothesis
Horizon 3 multiplies model error. Measure Field late ema, G2, and lives versus horizon 2 on the same seed. If G2 drops or lives rise, the third window is noise — gate it behind `ema < 0.12`. If G2 holds and foods rise in Rooms, try a cheap latent: predict hidden, not cells.

## 2026-09-28 evening (America/New_York)

### What changed
`loop.ts` on main was again the 9-byte stub. Finished that first: restored Loop from the last intact tree (c612dbb), then the falling-streak gate (`SCENT_FALL_STREAK = 4`, persist `scentFallStreak`).

One improvement: gate horizon 3. Imagination still scores two predicted windows always; the third window and its residual drop now run only when `ema < 0.12`. Kernel wires `imagined3`. Law 05 / act stage note the gate. Auth off. UI untouched.

### Evidence
`node --experimental-strip-types --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 5/5 pass (restored novelty/ρ̂/streak + "horizon 3 stays off until ema is under the gate"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200.

### Next hypothesis
The gate stops early noise but does not prove the third window helps once calibrated. Compare Field late ema, G2, lives, and Rooms foods with the gate on vs horizon 2 only on the same seed. If G2 holds and foods rise, try a cheap latent: predict hidden, not cells.

## 2026-09-29 evening (America/New_York)

### What changed
`loop.ts` on main was again the 9-byte stub (`see-local`). Finished that first: restored Loop from `4f59a14` (last intact tree), then the falling-streak gate (`SCENT_FALL_STREAK = 4`, persist `scentFallStreak` on save/load).

One improvement: the live policy now actually runs the gated third window. `imagineScores` already knew `imagined3` + `horizon3Ema`, but `Kernel.choose` never passed the buffers — horizon 3 was a test-only path. Choose now allocates `imagined3`, wires it, and sets `horizon3Ema: 0.12`. Law 05 names the gate. Auth off. UI untouched.

### Evidence
`node --experimental-strip-types --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 5/5 pass (novelty/ρ̂/streak + "horizon 3 stays off until ema is under the gate"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200.

### Next hypothesis
The third window is now on the body, not only in tests. Compare Field late ema, G2, lives, and Rooms foods with the gate on vs horizon 2 only on the same seed. If G2 holds and foods rise, try a cheap latent: predict hidden, not cells.

## 2026-09-30 evening (America/New_York)

### What changed
`loop.ts` on main was again the 9-byte stub (`see-local`). Finished that first: restored Loop from `5a43946` (last intact tree), then the falling-streak gate (`SCENT_FALL_STREAK = 4`, persist `scentFallStreak` on save/load).

One improvement: the live policy now actually runs the gated third window. `imagineScores` already knew `imagined3` + `horizon3Ema`, but `Kernel.choose` never passed the buffers — horizon 3 was a test-only path. Choose now allocates `imagined3`, wires it, and sets `horizon3Ema: 0.12`. Law 05 names the gate. Auth off. UI untouched.

### Evidence
`node --experimental-strip-types --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 5/5 pass (novelty/ρ̂/streak + "horizon 3 stays off until ema is under the gate"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200.

### Next hypothesis
The third window is now on the body, not only in tests. Compare Field late ema, G2, lives, and Rooms foods with the gate on vs horizon 2 only on the same seed. If G2 holds and foods rise, try a cheap latent: predict hidden, not cells.

## 2026-10-01 evening (America/New_York)

### What changed
`loop.ts` on main was the 9-byte `see-local` stub again. Finished that first: restored Loop (plan surprise muted on family 2, scent side head, falling-streak gate `SCENT_FALL_STREAK = 4`, persist `scentFallStreak` on save/load) and wired the gated third window in `Kernel.choose` (`imagined3`, `horizon3Ema: 0.12`).

One improvement: Phase 1 seed. A second loop predicts a fixed random projection of the next observation — a latent, not cells. Cell prediction stays so the body can still imagine a window. Latent progress is measured before the latent update, and curiosity mixes it in only after `latentEma < 0.2`. Law 04 / 05 and the Phase 1 note name the seed. Auth off. UI untouched.

### Evidence
`node --import jiti/register --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 6/6 pass (novelty, streak, ρ̂, horizon-3 gate, "latent loop compresses hidden state on structure and refuses noise", brain save/load keeps the streak and latent ema). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200. The production bundle was dropping the scent side-effect import, so `scentRhoHat` now lives on Loop itself.

### Next hypothesis
The latent is a fixed projection, so it cannot yet invent the features it predicts. If Field late ema does not fall faster than the cell loop alone, the mix is noise — drop it from curiosity and keep the latent as a Bench trace only. If it falls, make the projection slow-learned (stop-grad encoder) so the second loop can choose what to compress.
