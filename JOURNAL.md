# Journal

## 2026-09-18 (America/New_York)

### What changed
Restored `Loop` (main had been reduced to a placeholder) and shrank the plan-head MLP. When `familyCount === 3`, `planDim = outDim * 2/3`: wall and food are the only output units. Scent is spliced from the skip baseline in `fromResidual` and never occupies a weight row. Stream worlds stay `planDim === outDim`. Replay targets and save/load `w2` follow `planDim`. Baseline and family residual EMAs still cover the full window so the prior is inspectable.

Auth stays off. UI untouched.

### Evidence
`node --experimental-strip-types --test src/lib/kernel/kernel.test.ts` — 18/18 pass (new "plan head is smaller than the window: scent reconstruction is the baseline prior", plus side-channel / mute / family gate / residual skip / Field→Rooms / G2 / claims). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200.

### Next hypothesis
The prior is a mean, not a model of scent dynamics. A tiny family-2 predictor (one output unit per cell, or a shared scalar) trained only when residual falls would test whether scent is compressible after all. Measure Field late ema and G2 with vs without that extra head; if they match, leave scent as a mean prior.

## 2026-09-17 (America/New_York)

### What changed
Plan-head target shrink inside `Loop`: when `familyCount === 3`, family 2 (scent) is an unmodeled prior. `toTarget` asks the MLP for "no residual" on those dims; `fromResidual` reconstructs them from the skip baseline, never from the head. Wall and food stay the trained plan head. Stream worlds (`familyCount === 1`) are unchanged. Training of plan families, residual EMAs, and save/load dimensions are intact.

Auth stays off. UI untouched.

### Evidence
`node --experimental-strip-types --test src/lib/kernel/kernel.test.ts` — 18/18 pass (new "plan head target drops scent: reconstruction is the baseline prior", plus side-channel / mute / family gate / residual skip / Field→Rooms / G2 / claims). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200.

### Next hypothesis
The head still *has* scent output units; they just are not in the target. A smaller MLP (`outDim` = wall+food only, reconstructed window splices the prior) would drop those weights. Measure Field late ema and G2 after this prior vs a true smaller OUT; if they match, shrinking the matrix is optional.

## 2026-09-16 (America/New_York)

### What changed
Hierarchical split inside `Loop`: when the observation is the grid interleave (`familyCount === 3`), families 0–1 (wall, food) are the plan head and family 2 (scent) is a side channel. `plansFamily` / `familyWeight` hard-zero scent in δ, ρ, `muteFamilies`, and policy residual scoring. Training `assimilate` still sees every channel. Stream worlds (`familyCount === 1`) plan over the whole vector.

Auth stays off. UI untouched.

### Evidence
`node --experimental-strip-types --test src/lib/kernel/kernel.test.ts` — 17/17 pass (new "scent is a side channel: plan head ignores it in surprise and mute", plus mute / family gate / residual skip / Field→Rooms / G2 / claims). `tsc --noEmit` and production build follow in this run.

### Next hypothesis
The side channel is still in `OUT` and still trained. A smaller plan head would drop scent from the MLP target entirely (OUT = wall+food only) and keep scent as an unmodeled prior. Measure Pulse late ema vs Field after this split; if they already match, shrinking OUT is optional.
