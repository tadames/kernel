# Journal

## 2026-09-16 (America/New_York)

### What changed
Hierarchical split inside `Loop`: when the observation is the grid interleave (`familyCount === 3`), families 0–1 (wall, food) are the plan head and family 2 (scent) is a side channel. `plansFamily` / `familyWeight` hard-zero scent in δ, ρ, `muteFamilies`, and policy residual scoring. Training `assimilate` still sees every channel. Stream worlds (`familyCount === 1`) plan over the whole vector.

Auth stays off. UI untouched.

### Evidence
`node --experimental-strip-types --test src/lib/kernel/kernel.test.ts` — 17/17 pass (new "scent is a side channel: plan head ignores it in surprise and mute", plus mute / family gate / residual skip / Field→Rooms / G2 / claims). `tsc --noEmit` and production build follow in this run.

### Next hypothesis
The side channel is still in `OUT` and still trained. A smaller plan head would drop scent from the MLP target entirely (OUT = wall+food only) and keep scent as an unmodeled prior. Measure Pulse late ema vs Field after this split; if they already match, shrinking OUT is optional.

## 2026-09-15 (America/New_York)

### What changed
Imagination / policy now mute high-residual families. `Loop.familyWeight` and `muteFamilies` scale those observation dims toward 0 before `encode` for `imagine` / horizon-2, and `expectedResidual` + visit-scent novelty are weighted the same way. Training `assimilate` / `commit` still see every channel. Food and wall reads stay ungated so G2 is intact.

Auth stays off. UI untouched.

### Evidence
`node --experimental-strip-types --test src/lib/kernel/kernel.test.ts` — 16/16 pass (new "high-residual family is muted in imagination input and residual scoring", plus family gate / residual skip / Field→Rooms / G2 / claims). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200.

### Next hypothesis
Muting the input of imagination is a soft zero, not a separate latent. A true hierarchical head would predict only wall+food and treat scent as a side channel the policy never plans over. Measure Pulse late ρ and foods vs Field after the mute; if Pulse ρ still tracks scent flicker, drop scent from `OUT` entirely.

## 2026-09-14 (America/New_York)

### What changed
Family-pooled residual gate: when `outDim` is a multiple of 3 (the grid's wall / food / scent interleave), `Loop` averages per-pixel residual EMA into `familyResidual` and weights δ by the *family*, not the pixel. Stream worlds (`outDim = 1`) and odd-sized heads keep the per-channel gate. Brains export `familyResidual`. Training still sees every channel.

Auth stays off. UI untouched.

### Evidence
`node --experimental-strip-types --test src/lib/kernel/kernel.test.ts` — 15/15 pass (new "family-pooled residual downweights the noisy channel family", plus prior gate / residual skip / Field→Rooms / claims). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200.

### Next hypothesis
The family gate still feeds the noisy family to the MLP. Drop the high-residual family from the *input* of imagination / policy scoring (zero those dims in `encode` or in `imagineScores` novelty), and measure whether Field late ema and food-taking (G2) stay intact while scent-heavy Pulse worlds stop taxing ρ.

## 2026-09-13 (America/New_York)

### What changed
Latent channel gate on curiosity: `Loop` now keeps a per-dimension residual EMA and scores surprise as a *weighted* window MSE. Channels whose residual stays high (scent, coin-flips) lose weight in δ and therefore in ρ. Training still sees every channel. Brains export `residualEma` + `surpriseRaw` so the gate is inspectable and round-trips.

Auth stays off. UI untouched.

### Evidence
`node --experimental-strip-types --test src/lib/kernel/kernel.test.ts` — 14/14 pass (new "incompressible channels are downweighted in surprise", residual skip, Field→Rooms, claims). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200.

### Next hypothesis
The gate is scalar per pixel-channel. A true latent would pool residual EMA by *channel family* (wall / food / scent) or drop those dims from the *input* of the progress-driven policy, not only from δ. Measure Field late ema vs a scent-ablated Field; if they match, the gate is doing the work.


## 2026-09-12 (America/New_York)

### What changed
Phase 1 latent skip inside `Loop`: a slow per-dimension `baseline` plus MLP residual.

- Fresh loops train the MLP on `obs − baseline + 0.5` and reconstruct `ŷ + baseline − 0.5` for surprise and imagination.
- Density (Field walls vs Rooms) is the skip's job. Geometry stays in the residual head.
- After `loadBrain`, `baselineRate` rises to 0.12 for the 36-step burn-in, then returns to 0.02.
- Brains now export `residual` + `baseline`. Legacy weights-only snapshots set `residual: false` so raw heads still reconstruct.
- `rebuildWorld` is an alias of `setWorld` so the lab store typechecks.

Auth stays off. UI untouched.

### Evidence
`node --experimental-strip-types --test src/lib/kernel/kernel.test.ts` — 13/13 pass (new "latent residual skip tracks observation mean", Field drop, claims, save/load, Field→Rooms). `tsc --noEmit` clean. Production build succeeded. Preview on :8081, browser-smoke 200 / canvas / no page errors.

### Next hypothesis
The skip absorbs mean shift. A true latent would drop channels whose residual EMA stays high (incompressible scent/noise) from the progress signal, so curiosity chases structure. Measure Field→Rooms late ema with residual-only surprise vs full-window mse.

## 2026-09-11 (America/New_York)

### What changed
`src/lib/kernel/kernel.ts` was an 8-byte stub (`see file`) after a failed restore. Recovered the last good body (burn-in 36, hotter policy temperature after `loadBrain`) and finished the incomplete observation-bias work:

- Restored `ema` / `surprise` / `progress` accessors so claims and tests read the loop.
- While `burnIn > 0`, keep a fast per-channel observation mean and soft-subtract a fading fraction of that mean from the observation fed to `assimilate` and `choose`. Spatial pattern stays; Field vs Rooms density is less of a surprise tax on a loaded mind.

Auth stays off. UI untouched.

### Evidence
`node --experimental-strip-types --test src/lib/kernel/kernel.test.ts` — 12/12 pass (including Field surprise drop, S1/S2/S3 via evaluateClaims, save/load, Field→Rooms burn-in). generateWorld in this tree returns a `Uint8Array`; setWorld now assigns that array (the recovered kernel.ts expected `{ cells }`).

### Next hypothesis
Centering the *input* is a first-order correction. A structural shift (different wall geometry) may still need a latent predictor that discards incompressible channels, or a short output-head re-init during burn-in. Measure Field→Rooms late ema with vs without latent residual.
