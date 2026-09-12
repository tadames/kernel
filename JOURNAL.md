# Journal

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
