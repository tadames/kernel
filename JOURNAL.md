# Journal

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
