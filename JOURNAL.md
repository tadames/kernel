# Journal

## 2026-10-08 evening (America/New_York)

### What changed
One improvement: the second slow step is gated on `slowEma < 0.12`, the same line as horizon 3. `slowWindow2RhoHat` still pays only when the first window treats the move as a wall, and a collapsed second code still does not pay. An uncalibrated slow code (ema at or above 0.12) now returns 0 and does not write `slowWindow2`. Law 04 / 05, the Phase 1 note, and the act stage name the gate. Auth off. UI untouched.

### Evidence
`node --import jiti/register --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 14/14 pass (prior novelty, streak, ρ̂, horizon-3 gate, latent, encoder, action-conditional latent, slow code, wake, one-step window, second step past a wall, plus "slow window 2 stays shut until slowEma is under 0.12"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200. Browser smoke: desktop and mobile 200, canvas present, no console errors. Auth warnings empty.

### Next hypothesis
The second step can no longer fund ρ̂ before the slow code has earned the horizon-3 line. If Field late ema does not fall faster than the one-step window alone, the gated second step is still decoration — keep the trace, drop it from the progress bonus. If Field falls, let the follow-up be the action that also lowers the level-1 residual, so the second step cannot pick a code the latent loop would refuse.


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

## 2026-10-02 evening (America/New_York)

### What changed
The latent projection was a fixed random matrix, so the second loop could not choose what to compress. It is now a slow encoder. The target code is stop-grad: the predictor is scored against a detached copy and cannot move that target. The encoder steps only after `latentEma < 0.2` and latent progress is positive — the same gate as curiosity — and writes a clipped covariance update, so stable channels accumulate and noise decays. Weights stay in [-1.5, 1.5]. The projection is saved and loaded with the brain. Law 04 / 05 name the stop-grad encoder. Auth off. UI untouched.

### Evidence
`node --import jiti/register --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 8/8 pass (prior novelty, streak, ρ̂, horizon-3 gate, latent separation, plus "stop-grad encoder moves on structure and stays put on noise" and "stop-grad encoder prefers structured channels over noise"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200. Browser smoke: desktop and mobile 200, canvas present, no console errors. Auth warnings empty.

### Next hypothesis
The encoder now prefers structured channels in a toy window. If Field late ema does not fall faster than the fixed-projection seed, the covariance step is still decoration — keep it as a Bench trace and drop it from curiosity. If Field falls, condition the latent predictor on the action so ρ̂ can score imagined codes, not only cells.

## 2026-10-03 evening (America/New_York)

### What changed
The latent predictor was action-blind, so ρ̂ could not score a move. It now conditions on the action one-hot in the committed input, plus a clipped per-action bias so the imagined code can leave ½. ρ̂ for a move is the drop from latent ema to that action's own prediction error, and only after `latentEma < 0.2` and the drop clears 0.01. A collapsed code still floors at 0.25, so a constant hidden does not pay. Choose adds `latentRhoHat(a)` to the progress bonus. Bias and per-action ema save and load. Law 04 / 05 and the Phase 1 note name the conditioning. Auth off. UI untouched.

### Evidence
`node --import jiti/register --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 9/9 pass (prior novelty, streak, ρ̂, horizon-3 gate, latent separation, stop-grad encoder, plus "action-conditional latent ρ̂ pays for the move that predicts a sharper code"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200. Browser smoke: desktop and mobile 200, canvas present, no console errors. Auth warnings empty.

### Next hypothesis
The action channel is live in a toy window. If Field late ema does not fall faster than the action-blind latent, the bias is decoration — keep the trace, drop it from the progress bonus. If Field falls, stack a slower code on this one: predict the latent, not the cells, one level up.

## 2026-10-04 evening (America/New_York)

### What changed
One improvement: a slower code one level up. It predicts a low-passed copy of the latent, not the cells, and only after the level-1 code is already compressing (`latentEma < 0.2`). Learning rate is 0.12 against the latent predictor's 0.4. Progress and the per-move drop pay only after both codes are compressing, and a 0.001 floor drops flicker. Choose mixes `slowRho` into the progress bonus and adds `slowRhoHat(a)`. Weights, bias, per-action ema, and the slow code save and load. Law 04 / 05 and the Phase 1 note name the stack. Auth off. UI untouched.

### Evidence
`node --import jiti/register --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 10/10 pass (prior novelty, streak, ρ̂, horizon-3 gate, latent separation, stop-grad encoder, action-conditional latent, plus "slow code predicts the latent, not cells, and stays shut on noise"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200. Browser smoke: desktop and mobile 200, canvas present, no console errors. Auth warnings empty.

### Next hypothesis
The slow code compresses a toy latent. If Field late ema does not fall faster than the level-1 loop alone, the mix is decoration — keep the trace, drop it from the progress bonus. If Field falls, let a level-1 residual wake the slow step so a surprise downstairs can still move the slower code.

## 2026-10-05 evening (America/New_York)

### What changed
One improvement: a level-1 residual can wake the slower code. `commitSlow` still trains after `latentEma < 0.2`. If the latent residual exceeds its ema by 0.06 while that gate is shut, one slow step still runs, at half rate, and counts as `slowWakes`. A wake moves weights and bias only. It does not write slow progress or lower slow ema, so it cannot fund ρ or ρ̂. While the gate is open, the same excess scales the slow rate up to 2×, so a downstairs surprise moves the slower code harder than a quiet step. `slowWakes` saves and loads. Law 04 / 05 and the Phase 1 note name the wake. Auth off. UI untouched.

### Evidence
`node --import jiti/register --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 11/11 pass (prior novelty, streak, ρ̂, horizon-3 gate, latent separation, stop-grad encoder, action-conditional latent, slow code, plus "level-1 residual wakes the slow step and does not pay"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200. Browser smoke: desktop and mobile 200, canvas present, no auth copy.

### Next hypothesis
The wake moves a toy code after a regime shift and does not pay. If Field late ema does not fall faster than the gated slow code alone, the wake is decoration — keep the counter, drop the closed-gate step. If Field falls, let the slow code imagine one step of the latent, so ρ̂ can score a slower window and not only the current code.


## 2026-10-06 evening (America/New_York)

### What changed
One improvement: the slow code imagines one latent step. `slowWindowRhoHat` scores the drop from the residual of the code already in hand to the residual of the low-passed next code under that imagined latent, using the same 0.85/0.15 mix as `commitSlow`. It pays only after both codes are compressing, floors flicker at 0.001, and refuses a collapsed imagined code. It does not write slow progress. Choose adds it beside the current-code `slowRhoHat`. The last paying drop saves and loads as `slowWindow`. Law 04 / 05 and the act stage name the window. Auth off. UI untouched.

### Evidence
`node --import jiti/register --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 12/12 pass (prior novelty, streak, ρ̂, horizon-3 gate, latent, encoder, action-conditional latent, slow code, wake, plus "slow window scores one imagined latent step, not only the current code"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200. Browser smoke: desktop and mobile 200, canvas present, no console errors. Auth warnings empty.

### Next hypothesis
The window pays on a toy latent when the imagined next code is closer to the slow prediction than the code in hand. If Field late ema does not fall faster than the current-code slow ρ̂ alone, the window is decoration — keep the trace, drop it from the progress bonus. If Field falls, let the slow code imagine a second latent step so ρ̂ can score past a regime the first window still treats as a wall.

## 2026-10-07 evening (America/New_York)

### What changed
One improvement: the slow code imagines a second latent step. `slowWindow2RhoHat` scores the drop from the residual of the one-step low-passed code to the residual of a second low-passed code, under the same slow prediction. The follow-up is the legal action whose imagined code is closest. It pays only when the first window treats the move as a wall — no drop, or a collapsed one-step code — and a collapsed second code does not pay. It does not write slow progress. Choose adds it beside `slowWindowRhoHat`. The last paying drop saves and loads as `slowWindow2`. Law 04 / 05 and the act stage name the wall gate. Auth off. UI untouched.

### Evidence
`node --import jiti/register --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 13/13 pass (prior novelty, streak, ρ̂, horizon-3 gate, latent, encoder, action-conditional latent, slow code, wake, one-step window, plus "slow window scores a second latent step past a wall the first window refuses"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200. Browser smoke: desktop and mobile 200, canvas present, no console errors. Auth warnings empty.

### Next hypothesis
The second step pays on a toy wall when a follow-up code is closer to the slow prediction than the refused first step. If Field late ema does not fall faster than the one-step window alone, the second step is decoration — keep the trace, drop it from the progress bonus. If Field falls, gate the second step on `slowEma < 0.12` the way horizon 3 is gated, so an uncalibrated slow code cannot imagine past a wall it has not earned.
