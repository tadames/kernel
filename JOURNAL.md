# Journal

## 2026-09-17 (America/New_York)

### What changed
Plan-head target shrink inside `Loop`: when `familyCount === 3`, family 2 (scent) is an unmodeled prior. `toTarget` asks the MLP for "no residual" on those dims; `fromResidual` reconstructs them from the skip baseline, never from the head. Wall and food stay the trained plan head. Stream worlds (`familyCount === 1`) are unchanged. Training of plan families, residual EMAs, and save/load dimensions are intact.

Auth stays off. UI untouched.

### Evidence
`node --experimental-strip-types --test src/lib/kernel/kernel.test.ts` — 18/18 pass (new "plan head target drops scent: reconstruction is the baseline prior", plus side-channel / mute / family gate / residual skip / Field→Rooms / G2 / claims). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200.

### Next hypothesis
The head still *has* scent output units; they just are not in the target. A smaller MLP (`outDim` = wall+food only, reconstructed window splices the prior) would drop those weights. Measure Field late ema and G2 after this prior vs a true smaller OUT; if they match, shrinking the matrix is optional.
