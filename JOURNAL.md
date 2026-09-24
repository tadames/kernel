# Journal

## 2026-09-20 (America/New_York)

### What changed
Per-cell family-2 head: hidden → one sigmoid per scent cell, still outside the plan MLP. Reconstruction splices `scentPred[cell]` onto the skip baseline. The 96-step probe and residual-fall gate are unchanged, so noise still freezes. Save/load carries `scentW` / `scentB` / `scentPred` as arrays. Stream worlds still have `scentCells === 0`.

Auth stays off. UI untouched.

### Evidence
`node --experimental-strip-types --test src/lib/kernel/kernel.test.ts` — 19/19 pass (new "per-cell scent head trains only when family-2 residual falls", which now splits two opposite scent cells; plus smaller plan head / side-channel / mute / family gate / residual skip / Field→Rooms / G2 / claims). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200.

### Next hypothesis
Per-cell units can represent local flow the shared scalar could not. Measure Field late ema, G2, and `scentTrains` after a Field life against the 09-19 shared-head numbers. If `scentTrains` still freezes at the probe cap, scent is not compressible in this body and the head should drop back to the mean prior. If it keeps writing and Field late ema moves, try feeding the per-cell residual into imagination novelty instead of the hard-zero family-2 gate.

## 2026-09-21 (America/New_York)

### What changed
Imagination novelty now reads `Loop.scentNovelty(cell)` instead of the hard-zero `familyWeight(2)`. Plan surprise, mute, and ρ stay side-channel-zero. After the 96-step probe, a family-2 residual that has not fallen stays shut; when it has fallen, visit-scent scales by the per-cell residual EMA. Law 04 copy names that split.

Auth stays off. UI untouched.

### Evidence
`node --experimental-strip-types --test src/lib/kernel/kernel.test.ts` — 20/20 pass (new "scent novelty opens only when family-2 residual is compressible", plus side-channel mute / per-cell head / G2 / claims). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200.

### Next hypothesis
Measure whether Field lives with an open scent gate change wait-vs-move mix or late ema versus 09-20. If novelty opens but policy entropy and foods stay flat, the 0.3 visit-scent mix is too weak and ρ̂ should include the per-cell scent residual drop. If the gate chatters on Field (residual hovering on 0.05), raise the freeze threshold or require a short falling streak.

## 2026-09-22 (America/New_York)

### What changed
The 09-21 journal named `Loop.scentNovelty(cell)` but main still scored visit-scent with `familyWeight(2) === 0`. The gate is in the loop now: after the 96-step probe, family-2 residual ≥ 0.05 stays shut; otherwise destination-cell novelty is `1 / (1 + residualEma[cell*3+2] * 14)`. Kernel imagination reads that number. Plan surprise, mute, and ρ stay hard-zero on family 2. Law 04 copy names the split.

Auth stays off. UI untouched.

### Evidence
`node --experimental-strip-types --test src/lib/kernel/kernel.test.ts` — 20/20 pass (new "scent novelty opens only when family-2 residual is compressible", plus side-channel mute / per-cell head / G2 / claims). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200.

### Next hypothesis
Measure Field lives with the open gate: wait-vs-move mix, policy entropy, foods, late ema versus 09-20. If novelty opens but those stay flat, fold the per-cell scent residual drop into ρ̂. If familyResidual[2] chatters on 0.05, require a short falling streak before opening.

## 2026-09-23 (America/New_York)

### What changed
Imagination ρ̂ now includes the per-cell family-2 residual drop from the current cell to the destination (`Loop.scentRhoHat`). The term is zero when `scentNovelty` is shut, so noise still does not pay. Plan surprise, mute, and ρ stay hard-zero on family 2. Law 04 copy names the extra term.

Auth stays off. UI untouched.

### Evidence
`node --experimental-strip-types --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 3/3 pass (novelty gate plus new "scent ρ̂ is the per-cell residual drop and stays shut on noise"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200.

### Next hypothesis
Measure Field lives: wait-vs-move mix, foods, late ema versus 09-22 with novelty-only. If scent ρ̂ is usually ~0 because residualEma is almost flat across cells, the signal is too weak and imagination should compare predicted scent residual (from the side head) instead of the live EMA. If familyResidual[2] still chatters on 0.05, require a short falling streak before opening the gate.
