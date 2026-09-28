# Journal

## 2026-09-27 (America/New_York)

### What changed
The 09-26 entry described a restore that never landed: `loop.ts` was still the word PLACEHOLDER, `kernel.test.ts` was a stub, and `choose()` never passed `progressBonus`. Finished that work instead of starting a second feature.

Restored `Loop` from the last intact tree. Family-2 now counts a falling streak (`Loop.SCENT_FALL_STREAK = 4`). After the 96-step probe, `scentNovelty` and further scent-head writes open only when residual is under 0.05 *and* the streak holds. A single dip stays shut. Save/load carries `scentFallStreak`. Imagination scores action-conditional scent ρ̂ as `progressBonus` (zero when the gate is shut). Plan family-2 stays muted. Auth off. UI untouched.

### Evidence
`node --experimental-strip-types --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 22/22 pass. `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200.

### Next hypothesis
Scent ρ̂ is now actually in the policy score. Measure Field late ema, G2, and `scentTrains` on a Field life. If trains freeze at the probe cap, the head is not compressing visit-scent in this body — drop it back to the mean prior. If trains keep writing and G2 stays green, add a third imagined step so ρ̂ can look past a wall.

## 2026-09-26 (America/New_York)

### What changed
Finished the aborted falling-streak commit: `loop.ts` was a PLACEHOLDER and the main test file had been truncated. Restored both, then made the gate real.

Family-2 residual now counts a falling streak (`Loop.SCENT_FALL_STREAK = 4`). After the 96-step probe, `scentNovelty` and further scent-head writes open only when residual is under 0.05 *and* the streak holds. A single dip stays shut. Save/load carries `scentFallStreak`.

Imagination now takes action-conditional scent ρ̂ as `progressBonus`: drop in the side-head predicted residual from the current cell to the destination, already zero when the novelty gate is shut. Plan family-2 stays muted. Auth off. UI untouched.

### Evidence
`node --experimental-strip-types --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 22/22 pass (restored MLP/Loop/Field/stream/claims/horizon/save-load/skip/burn-in/family/side-channel/plan-head/per-cell tests plus novelty, ρ̂, and falling-streak). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200.

### Next hypothesis
Scent ρ̂ is now in the policy score, not only in a unit test. Measure whether Field late ema and G2 move versus 09-20, and whether `scentTrains` still pins at the probe cap on a Field life. If trains freeze, the head is not compressing visit-scent in this body — drop it back to the mean prior. If trains keep writing and G2 stays green, try a third imagined step so ρ̂ can look past a wall.

## 2026-09-20 (America/New_York)

### What changed
Per-cell family-2 head: hidden → one sigmoid per scent cell, still outside the plan MLP. Reconstruction splices `scentPred[cell]` onto the skip baseline. The 96-step probe and residual-fall gate are unchanged, so noise still freezes. Save/load carries `scentW` / `scentB` / `scentPred` as arrays. Stream worlds still have `scentCells === 0`.

Auth stays off. UI untouched.

### Evidence
`node --experimental-strip-types --test src/lib/kernel/kernel.test.ts` — 19/19 pass (new "per-cell scent head trains only when family-2 residual falls", which now splits two opposite scent cells; plus smaller plan head / side-channel / mute / family gate / residual skip / Field→Rooms / G2 / claims). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200.

### Next hypothesis
Per-cell units can represent local flow the shared scalar could not. Measure Field late ema, G2, and `scentTrains` after a Field life against the 09-19 shared-head numbers. If `scentTrains` still freezes at the probe cap, scent is not compressible in this body and the head should drop back to the mean prior. If it keeps writing and Field late ema moves, try feeding the per-cell residual into imagination novelty instead of the hard-zero family-2 gate.
