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
