# Journal

## 2026-10-15 noise progress (America/New_York)

Written before `npm run noise`. No outcome from that command is in this block. The results section is filled in after the run.

### Preregister noise progress

Phase diagram (a1) found that rho spends more time in a stationary white-noise east room than a random walk: rho − random = 0.0905 [0.0442, 0.1370], 20 seeds, relevance 0, mean over learnability, strongest at learnability 0 and 1. That clause had been preregistered to lie entirely below 0. It did not. This run asks why.

Hypothesis. Rho's progress is a difference of two noisy error estimates. On noise the difference has mean near zero, but the policy keeps only the positive part, so sampling variance makes progress spuriously rewarding and the agent stays. A longer window averages that variance down. The excess time in the noise room, rho minus random, should then shrink roughly as 1/sqrt(W).

The shipped estimator is unchanged at window 50. `progress = ema − surprise`, then the ema updates. The ema time constant is W = 50 steps (rate 0.02). Surprise is one step. The ema is the other estimate. The policy scales curiosity by max(0, progressEma). That outer smoother stays at rate 0.05 and is not the window under test. Confidence keeps the shipped ema at rate 0.02 even when W changes. A window other than 50 has its own baseline, updated at rate 1/W, started at the same 0.25. At W = 50 the baseline is the confidence ema, so the shipped agent is the phase-diagram agent. The map, the doorway, the 400-step episode, and the seed stream match that study.

The grid is six log-spaced windows from 4× below 50 to 8× above it: 12.5, 25, 50, 100, 200, 400.

Calls use a paired 95% percentile bootstrap, 2000 resamples, fixed salts in `scripts/noise.ts`. A mean over learnability {0, 1/3, 2/3, 1} is the primary test. Per-learnability splits are reported and are not a second chance to pick a winner. Drift is 0. Relevance is 0 unless a call says otherwise.

- (r) Replication. Seeds 1–200. Signals rho, random, count, surprise, RND. Each learnability. Window 50, ema estimator, noise amplitude 1. Primary: mean over learnability of east-room fraction, rho minus random. Confirmed if that CI lies entirely above 0. Refuted if it lies entirely below 0. A CI that includes 0 is inconclusive. The other three signals versus random are descriptive.
- (w) Window. Seeds 1–100, the same seeds as the replication, rho only. Random is the replication random walk and does not depend on W. Excess at a window is the mean over learnability of (rho − random), one number per seed. Fit OLS of log(excess) on log(W). A window whose mean excess is not positive is dropped, because the log is undefined. Confirmed if at least 4 windows remain, at least 80% of bootstrap draws can fit, and the slope CI contains −0.5 and lies entirely below 0. Refuted if that CI excludes −0.5. Inconclusive if the CI contains both −0.5 and 0, or the fit is not defined. The point estimates and their CIs are reported either way.
- (d) Reward inside the room. At learnability 1, window 50, seeds 1–200, raw progress is ema − surprise on the step the body is in that room. Rectified reward is max(0, raw progress). A seed counts only if it spent at least 8 steps in each room. If half the seeds or fewer qualify, the call is inconclusive. Confirmed if the CI of (east rectified mean − west rectified mean) lies entirely above 0: the noise room pays more positive progress than the learnable room. Refuted if that CI lies entirely below 0. Otherwise inconclusive. Mean, variance, and fraction positive of the raw difference are reported for both rooms, with CIs across seeds. The pooled histogram is the figure. The same rectified means at the other windows are descriptive, not a second slope.
- (s) Variance-corrected rho. Same episodes as the replication, seeds 1–200, but progress is a held-out split: the older W errors versus the latest W, minus one standard error of that difference of means. W = 50, so each half is 50 and the buffer is 100. The two halves share no samples. Until the buffer is full the progress is 0, and those steps count. The horizon residual drop and the uncertainty term are not rewritten. This correction removes the attraction only if the replication itself found one. Confirmed if the replication CI lies entirely above 0 and the corrected excess does not: either the corrected CI lies entirely below 0, or it is not entirely above 0 and the CI of (raw excess − corrected excess) lies entirely above 0. Refuted if the corrected CI lies entirely above 0. Inconclusive if the replication did not clear, or the corrected excess is not a reliable attraction and did not reliably shrink.
- (n) Noise amplitude. Three levels, 0.25, 0.5, and 1. Amplitude 1 is the replication. The east glow bit is scaled by the amplitude in the wall channel. West glow is not scaled. Variance of a fair bit is amplitude²/4, so the levels are 0.015625, 0.0625, and 0.25. Seeds 1–200, rho and random, each learnability, drift 0, relevance 0. Excess is again rho minus random, mean over learnability, one number per seed. Confirmed if the CI of (excess at 1 − excess at 0.25) lies entirely above 0 and the amplitude-0.5 point estimate sits between the other two. Refuted if that CI lies entirely below 0. Otherwise inconclusive.
- (a3) Edible distractor, the original positive control, redone at the same size as the replication. Count, drift 0, seeds 1–200, each learnability. Relevance 1 minus relevance 0, mean over learnability, east-room fraction. Confirmed if that CI lies entirely above 0. Refuted if it lies entirely below 0. Otherwise inconclusive. East food counts are descriptive. They are not the test.

Figures, written by the same run: `bench/noise/excess-vs-w.png` (log excess against log W, the fit, and a reference slope of −0.5) and `bench/noise/progress-hist.png` (raw progress in the noise room and in the learnable room at learnability 1). The sweep is `npm run noise`. It is not part of CI.

### Results

10800 episodes, 400 steps, 4 workers, 409 seconds. Source: `bench/noise/noise.json`. Seeds 1–20 of the shipped rho and random arms reproduce the phase-diagram contrast exactly: rho − random = 0.0905. That arm was not retuned.

#### (r) Replication. Confirmed.

200 seeds, drift 0, relevance 0, window 50, mean over learnability. Rho − random = 0.0713 [0.0564, 0.0863]. The interval lies entirely above 0.

The 200-seed estimate is lower than the 20-seed point (0.0905). The old interval [0.0442, 0.1370] contains 0.0713. The new interval does not contain 0.0905. The sign replicates. The magnitude moved.

| learnability | rho − random |
|---|---|
| 0 | 0.0761 [0.0470, 0.1050] |
| 1/3 | 0.0671 [0.0395, 0.0959] |
| 2/3 | 0.0651 [0.0394, 0.0921] |
| 1 | 0.0771 [0.0482, 0.1049] |

All four clear zero. Learnability 0 and 1 are only slightly higher. That split was not a pass bit.

East-room fraction, same average:

| signal | east fraction | minus random |
|---|---|---|
| random | 0.1457 [0.1345, 0.1566] | 0 |
| count | 0.3033 [0.2954, 0.3120] | 0.1576 [0.1425, 0.1721] |
| surprise | 0.2347 [0.2231, 0.2463] | 0.0890 [0.0736, 0.1051] |
| rnd | 0.2182 [0.2074, 0.2296] | 0.0725 [0.0583, 0.0861] |
| rho | 0.2171 [0.2061, 0.2285] | 0.0713 [0.0564, 0.0863] |

Count, surprise, and RND are also above a random walk. Rho is not the most attracted. Those three contrasts were descriptive.

#### (w) Window. Refuted.

Seeds 1–100. Slope of log(excess) on log(W) is 0.056 [−0.062, 0.165]. The interval excludes −0.5 and includes 0. All six windows had positive excess, so none were dropped. 2000 of 2000 bootstrap draws fitted.

| W | excess, seeds 1–100 |
|---|---|
| 12.5 | 0.0644 [0.0446, 0.0844] |
| 25 | 0.0544 [0.0338, 0.0742] |
| 50 | 0.0797 [0.0593, 0.0997] |
| 100 | 0.0791 [0.0587, 0.0996] |
| 200 | 0.0723 [0.0512, 0.0932] |
| 400 | 0.0715 [0.0490, 0.0949] |

The W = 50 row is seeds 1–100, so it is not the 200-seed replication number. The shortest windows are the smaller point estimates, not the larger ones. Excess time does not shrink as 1/sqrt(W).

Figure: `bench/noise/excess-vs-w.png`.

#### (d) Reward in the room. Refuted.

Learnability 1, window 50, seeds 1–200. 170 seeds spent at least 8 steps in both rooms. East rectified mean minus west rectified mean = −0.0169 [−0.0192, −0.0145]. The noise room pays less positive progress than the learnable room.

| room | seeds | mean | variance | fraction positive | rectified |
|---|---:|---|---|---|---|
| east (noise) | 170 | 0.0085 [0.0058, 0.0113] | 0.000849 [0.000791, 0.000910] | 0.597 [0.567, 0.625] | 0.0179 [0.0160, 0.0197] |
| west (learnable) | 200 | 0.0214 [0.0207, 0.0221] | 0.00312 [0.00304, 0.00320] | 0.685 [0.680, 0.689] | 0.0348 [0.0342, 0.0354] |

The noise-room mean is reliably above 0, and the fraction positive is reliably above one half, so the difference is not a symmetric mean-zero flicker. It is still the smaller of the two rooms. The preregistered claim was that the noise room pays more. It pays less.

Figure: `bench/noise/progress-hist.png`. The annotation is pooled over steps (noise room: mean 0.010, variance 0.0011, fraction positive 0.62, on 17704 steps). The table is the mean across seeds. Those are not the same average.

#### (s) Variance-corrected rho. Refuted.

Held-out halves of 50, minus one standard error. Corrected excess = 0.0602 [0.0464, 0.0741]. Raw excess minus corrected excess = 0.0112 [−0.0024, 0.0249]. The corrected agent is still reliably above a random walk. The shrinkage does not clear zero. The penalty does not remove the attraction. The horizon residual drop and the uncertainty term were left in place, as preregistered.

#### (n) Noise amplitude. Inconclusive.

| amplitude | variance | excess |
|---|---:|---|
| 0.25 | 0.015625 | 0.0790 [0.0628, 0.0956] |
| 0.5 | 0.0625 | 0.0745 [0.0595, 0.0901] |
| 1 | 0.25 | 0.0713 [0.0567, 0.0860] |

Excess at amplitude 1 minus excess at 0.25 = −0.0076 [−0.0190, 0.0042]. The point estimates fall as amplitude rises, and the middle value sits between them in that order. The interval includes 0, so the growth prediction is not confirmed and the reversal is not reliable enough to refute.

#### (a3) Edible distractor. Confirmed.

Count, drift 0, 200 seeds, relevance 1 minus relevance 0, mean over learnability: 0.0507 [0.0389, 0.0636]. The 20-seed result was 0.0309 [−0.0053, 0.0682], inconclusive. The same contrast at 200 seeds lies entirely above 0.

| learnability | relevance 1 − 0 |
|---|---|
| 0 | 0.0329 [0.0076, 0.0607] |
| 1/3 | 0.0611 [0.0363, 0.0857] |
| 2/3 | 0.0551 [0.0314, 0.0789] |
| 1 | 0.0536 [0.0306, 0.0779] |

East meals, descriptive, not the test: relevance 0 is 0.37 [0.33, 0.41], relevance 1 is 84.9 [82.3, 87.3]. Relevance 0 does not place food in the east room. A meal taken on a step that began there is still charged to that step, which is the residual 0.37. Relevance 1 is edible.

The progress-window account of why rho stays in stationary noise does not hold. Rho does stay there. So do count, surprise, and RND.

## 2026-10-15 phase diagram (America/New_York)

Written before `npm run timescale`, before `npm run phase`, and before `npm run forget`. No outcome from those commands is in this block. The G1 rescore and the two sweeps are filled in underneath after they run.

### Preregister G1

- hypothesis: The absolute 0.14 arm is not a claim about learning the map. Constant 0.5 scores 0.250. The per-cell mean scores 0.098 on Field and 0.114 on Rooms. 0.14 sits between those, so a net that has only left the sigmoid prior passes. Replace it with a baseline-relative rule, computed per environment from the frozen probe: late error is under that environment's per-cell-mean floor, and late error is under 0.85 × early. Report normalized skill `(meanFloor − late) / (meanFloor − shiftCeiling)`, where the shift ceiling is the window-shift oracle (about 0.030 on Field and 0.039 on Rooms). Re-score the existing five signals on Field and Rooms, seeds 1–20, 280 steps. The learner is not changed.
- metric: probeLate
- direction: lower
- threshold: late < mean floor of that environment AND late < 0.85 × early. Skill is reported and is not itself a pass bit. This is stricter than 0.14, not a loosening. Expectation, not a success criterion: most of the twenty-seed means sit above the mean floor, so most G1 fractions should fall. Count on Field was 0.097 against a floor of 0.098 and may be the only one close.

### Preregister where rho fails

Research question: where does learning-progress curiosity (rho) fail against random, count, surprise (ICM-style forward error), and RND?

The map is a 15×15 grid. A wall at column 9 splits a west room from an east room. The opening is seven cells tall, centered, not one cell. A one-cell door was the first sketch; a 30-step smoke, not the sweep, showed east-room entry stuck at zero for almost every episode, so time-in-room could not measure allocation. The opening was widened before the 20-seed run. The wall still marks the room. Predictions below are unchanged. The west room is the useful world: fixed walls, five foods, and a low-frequency glow. `learnability` is the fraction of non-wall west cells whose glow is that fixed pattern; the rest are iid bits, redrawn every step. The east room is the distractor, marked by the wall. `driftRate` 0 means stationary white noise: every east cell is a fresh iid bit every step, not a frozen picture. `driftRate` p > 0 means a low-frequency pattern that is fully redrawn with probability p each step, so the pattern's lifetime is 1/p steps. `distractorRelevance` 0 means those bits are not food and do not block motion. Relevance 1 means a bit of 1 is edible food. The policy's extrinsic term on this family reads true walls and true food, so a glow bit is not a meal and not a wall. Curiosity still scores the predicted window. The live probe is scored separately on west cells and on east cells. It does not train.

Adaptation timescale, measured before the sweep and then locked. τ is the e-folding time of excess live probe error on one frozen east pattern (`patternHold`, learnability 1, relevance 0). The shipped transition learner (cell learning rate 4) takes one uniform transition per step inside that room. Scent is zero, so the curve is the compressor. Excess is error minus the mean of the last 15% of a 400-step curve. τ is the OLS slope of log(excess) on step, on the prefix where excess stays above 5% of the initial excess and step < 300. If that slope is not negative, τ is the step of the half-life divided by ln 2. A curve that never halves is censored at 400. The reported τ is the mean over seeds 1–8, with a 95% bootstrap CI. The drift grid is then 0 and (1/τ)×{1/16, 1/4, 1, 4, 16}, clipped below 0.95, duplicates dropped. Forgetting half-lives are τ×{0.5, 1, 2, 4, 8}, as multiplicative weight decay λ = 1 − exp(−ln 2 / half-life) on the cell net. The learning rate stays 4.

Phase sweep, after the grid is locked: learnability {0, 1/3, 2/3, 1} × the drift grid × relevance {0, 1} × {random, count, surprise, rnd, rho} × seeds 1–20. Episodes are 400 steps. Recorded per episode: fraction of steps in the east room, west probe, east probe, useful-room coverage, foods, foods eaten in the east. Workers, not CI.

Predictions, relevance 0 unless said otherwise. Paired 95% bootstrap CIs on seeds. A mean over learnability is the primary test; the per-learnability splits are reported and are not a second chance to pick a winner.

- (a1) Stationary noise, drift 0. Surprise spends more time in the east room than rho (CI of surprise − rho entirely above 0). Rho does not: CI of rho − random lies entirely below 0. Both clauses are required. A CI that only includes zero is inconclusive for that clause, not a pass.
- (a2) Drift nearest 1/τ. Rho spends more time in the east room than random, than count, and than surprise (each CI entirely above 0), and more than rho itself spends at drift 0 (CI entirely above 0). That is the noisy TV defeating the learning-progress fix: a pattern that turns over on the learner's own clock looks like progress forever. Very fast drift should look more like noise again; that comparison is descriptive, not a third pass bit.
- (a3) Positive control, not a claim about rho. At drift 0, count spends more time in the east room when relevance is 1 than when it is 0 (CI entirely above 0), because the bits are food. If this fails, the room is not doing what the parameter says.

Forgetting. The split map has two learnable rooms, distinct fixed patterns, food on both sides, no east-room noise. No replay. The knob is weight decay, which is the forgetting rate; the two rooms are the interference. Episode length 2000 steps. Seeds 1–20. Five signals. Each step records which room the body is in. The period is the spectral peak of that series between 20 steps and half the episode, kept only when its power is at least 3× the median power in the band. Otherwise the seed has no period. For each signal, a seed that has a period at 3 or more rates contributes one OLS slope of log(period) on log(λ). The reported slope is the mean of those seed slopes, with a 95% bootstrap CI.

- (b) Rho's slope is negative and the CI lies entirely below 0: faster forgetting, shorter revisit cycles. If fewer than half the seeds (10 of 20) yield a slope, the call is inconclusive even if the remaining CI is tidy. The same fit is reported for the other four signals. If they scale the same way, the cycles are not specific to rho and (b) is not confirmed as a learning-progress result.

### Instrument lock

Measured after the preregistration above and before either sweep. Source: `bench/phase/timescale.json`. Seeds 1–8, 400 uniform transitions on a frozen east pattern.

| seed | τ | half-life | start | tail |
|---|---:|---:|---:|---:|
| 1 | 65.85 | 45.6 | 0.258 | 0.038 |
| 2 | 99.29 | 68.8 | 0.270 | 0.059 |
| 3 | 43.98 | 30.5 | 0.251 | 0.049 |
| 4 | 90.17 | 62.5 | 0.252 | 0.044 |
| 5 | 79.01 | 54.8 | 0.258 | 0.050 |
| 6 | 53.72 | 37.2 | 0.256 | 0.057 |
| 7 | 70.44 | 48.8 | 0.264 | 0.043 |
| 8 | 38.76 | 26.9 | 0.251 | 0.048 |

Mean τ = 67.65 steps, 95% bootstrap CI [53.66, 81.81]. No seed was censored. Every curve leaves the sigmoid prior and ends between 0.038 and 0.059.

τ is steps of experience on the pattern. It is the clock while the body is in the room, not a count of steps spent elsewhere.

Locked drift rates, probability per step: 0, 0.0009238, 0.003695, 0.01478, 0.05912, 0.2365. The rate nearest 1/τ is 0.01478, a pattern lifetime of about 68 steps. The neighbors are about 4× slower and 4× faster, then 16×.

Locked forgetting rates λ, half-lives τ×{0.5, 1, 2, 4, 8}: 0.02028, 0.01019, 0.00511, 0.00256, 0.00128. Those half-lives are about 34, 68, 135, 271, and 542 steps.

The phase sweep and the forgetting sweep have not been run. The five-signal G1 rescore has not been run.

### Results

G1 rescore, the phase sweep, and the forgetting sweep all ran after the blocks above. The learner was not changed. Source files: `bench/sweep.md`, `bench/phase/phase.json`, `bench/phase/forget.json`.

#### G1, baseline-relative

Same episodes as the previous sweep (seeds 1–20, 280 steps, Field and Rooms). Probe late did not move. The pass bit did. The old rule was late < 0.85 × early or late < 0.14, and that 0.14 arm was what passed. The new rule needs both late < the per-cell-mean floor and late < 0.85 × early. Skill is (meanFloor − late) / (meanFloor − shiftCeiling). Floors used here are the frozen ones: Field 0.098, Rooms 0.114. Shift ceilings: Field 0.030, Rooms 0.039. A negative skill means late error is still worse than predicting each cell's mean.

| env | signal | probe late | skill | G1 now | G1 before (0.14 arm) |
|---|---|---:|---:|---|---|
| field | random | 0.110 [0.103, 0.119] | −0.185 [−0.307, −0.078] | 3/20 | 19/20 |
| field | count | 0.097 [0.093, 0.104] | 0.007 [−0.085, 0.077] | 13/20 | 19/20 |
| field | surprise | 0.107 [0.102, 0.113] | −0.133 [−0.230, −0.059] | 4/20 | 19/20 |
| field | rnd | 0.110 [0.102, 0.119] | −0.173 [−0.305, −0.065] | 4/20 | 19/20 |
| field | rho | 0.111 [0.104, 0.120] | −0.200 [−0.327, −0.094] | 4/20 | 18/20 |
| rooms | random | 0.123 [0.115, 0.131] | −0.111 [−0.215, −0.009] | 8/20 | 16/20 |
| rooms | count | 0.098 [0.094, 0.103] | 0.212 [0.151, 0.274] | 17/20 | 20/20 |
| rooms | surprise | 0.114 [0.107, 0.120] | 0.011 [−0.078, 0.096] | 11/20 | 18/20 |
| rooms | rnd | 0.112 [0.106, 0.119] | 0.027 [−0.067, 0.116] | 11/20 | 19/20 |
| rooms | rho | 0.118 [0.111, 0.125] | −0.048 [−0.135, 0.039] | 9/20 | 19/20 |

Count is the only signal whose mean late error is under the floor, and only clearly on Rooms (skill 0.212, CI above 0). On Field the count mean is 0.097 against a floor of 0.098, skill 0.007, and the CI includes 0: 13 of 20 seeds clear both clauses, 7 do not. Rho on Field is worse than the mean (skill −0.200, CI entirely below 0) and does not beat random (probe late random − rho = −0.001, CI includes 0). No signal's mean skill reaches the shift ceiling. The 0.14 arm is not coming back.

#### Phase diagram

4800 episodes, 400 steps, 4 workers, 181 seconds. Drift grid locked from τ = 67.65 [53.66, 81.81]. Critical drift 0.01478. Relevance 0 unless noted. East-room time is the mean over learnability {0, 1/3, 2/3, 1}.

(a1) Stationary noise. **Refuted.** Surprise − rho = 0.0067 [−0.0353, 0.0487], inconclusive. Rho − random = 0.0905 [0.0442, 0.1370]: rho spends more time in the east room than a random walk, which is the clause that was required to lie entirely below 0. The per-learnability split does not rescue it. Rho − random excludes zero at learnability 0 (0.150 [0.077, 0.224]) and at learnability 1 (0.134 [0.050, 0.213]). At 1/3 and 2/3 the CIs include zero. Surprise never beats rho at a single learnability. East fractions at drift 0, learnability 0: random 0.093, count 0.306, surprise 0.199, rnd 0.302, rho 0.243. At learnability 1: 0.154, 0.325, 0.294, 0.225, 0.288.

(a2) Drift nearest 1/τ. **Refuted.** Rho − random = 0.0296 [−0.0216, 0.0785], inconclusive. Rho − count = −0.0967 [−0.1214, −0.0669]: count is higher. Rho − surprise = −0.0454 [−0.0864, −0.0044]: surprise is higher. Rho at the critical drift minus rho at drift 0 = −0.0382 [−0.0912, 0.0135], inconclusive, and the point estimate is lower, not higher. Mean east time over learnability, relevance 0:

| drift | random | count | surprise | rnd | rho |
|---|---:|---:|---:|---:|---:|
| 0 | 0.139 | 0.326 | 0.236 | 0.260 | 0.229 |
| 0.00092 | 0.167 | 0.297 | 0.273 | 0.224 | 0.210 |
| 0.0037 | 0.174 | 0.284 | 0.264 | 0.220 | 0.214 |
| 0.0148 | 0.161 | 0.287 | 0.236 | 0.205 | 0.191 |
| 0.059 | 0.162 | 0.286 | 0.235 | 0.227 | 0.205 |
| 0.24 | 0.147 | 0.294 | 0.236 | 0.221 | 0.206 |

Count sits near 0.29–0.33 at every drift. That is unvisited space, not the television. Rho sits between random and count and is not captured at 1/τ. Fast drift does not hand the room back to surprise either. West probe error, mean over learnability and drift, relevance 0: random 0.139, count 0.135, surprise 0.138, rnd 0.138, rho 0.139. The useful-world probe barely moves.

(a3) Positive control. **Inconclusive.** Count's east time at drift 0, relevance 1 minus relevance 0, is 0.0309 [−0.0053, 0.0682]. The time difference does not clear zero. The food counts do show the room is edible, and they are not the preregistered test. At relevance 0, east food is 0 for every signal. At relevance 1, averaged over learnability and drift, foods and east foods are: random 65 / 48 (east fraction 0.267), count 178 / 90 (0.368), surprise 181 / 118 (0.439), rnd 156 / 98 (0.365), rho 146 / 93 (0.344). A bit of 1 is food on every step, so the meal counts are large. That is descriptive. It does not promote (a3) to a pass.

Winner map, lowest mean west probe. Relevance 0, 24 cells: count 14, rnd 3, rho 3, random 2, surprise 2. Relevance 1: count 7, rho 7, random 5, rnd 4, surprise 1. One cell of 48 has a paired gap whose CI excludes zero (relevance 0, learnability 1, drift 0.2365, count over rnd, gap 0.0094 [0.0029, 0.0162]). The map is a ranking of means.

Heatmaps, committed with the sweep:

- `bench/phase/heatmap-time-rel0.png`
- `bench/phase/heatmap-time-rel1.png`
- `bench/phase/heatmap-winner-rel0.png`
- `bench/phase/heatmap-winner-rel1.png`

#### Forgetting cycles

500 episodes, 2000 steps, 129 seconds. Weight decay at the five locked rates. The preregistered period is the spectral peak of east-room occupancy between 20 steps and half the episode, kept when its power is at least 3× the median in that band. The slope is the mean, over seeds, of OLS of log(period) on log(λ).

| signal | seeds with a slope | slope | 95% CI | written call |
|---|---:|---:|---|---|
| random | 16/20 | −0.000 | [−0.000, −0.000] | confirmed, artifact |
| count | 20/20 | −0.018 | [−0.058, 0.029] | inconclusive |
| surprise | 18/20 | −0.011 | [−0.109, 0.081] | inconclusive |
| rnd | 18/20 | −0.004 | [−0.068, 0.067] | inconclusive |
| rho | 20/20 | −0.133 | [−0.238, −0.046] | confirmed by the sign rule |

Random's periods are identical at every λ (mean 688.6, the same 16 seeds). Forgetting does not touch a random walk. The slope is about −6×10⁻¹⁵, and the bootstrap CI of that dust sits entirely below zero, so the written rule says confirmed. It is not scaling.

Rho's spectral means, fast forgetting to slow: 540 [436, 656] (n=15), 646 [539, 754] (n=19), 656 [558, 764] (n=17), 656 [549, 773] (n=19), 716 [617, 818] (n=16). The sign matches the preregister. The exponent does not match a period that tracks the half-life: that would be a slope of −1, and −1 is outside this CI. East fraction stays between 0.31 and 0.35 at every rate.

The autocorrelation does not show a revisit cycle. On essentially every episode, of every signal, the lag of maximum autocorrelation inside the searched window is 20, the floor of that window. Occupancy is sticky. A rho series has a few dozen room switches in 2000 steps, autocorrelation at lag 20 is about 0.5–0.75, and the local peaks near the spectral period are about 0.1–0.2. About 10% of rho's detected spectral periods sit on the half-episode cap (1000). That peak is low-frequency wander, not a cycle whose period is the forgetting time.

(b) **Inconclusive.** The preregistered sign test on the spectral peak passes for rho and does not pass for count, surprise, or RND. The series do not contain the revisitation cycle the period was supposed to measure, and the slope is shallow. The prediction that forgetting regenerates progress and rho cycles at a period set by the forgetting rate is not confirmed.

## 2026-10-15 learner instrument (America/New_York)

The probe late error near 0.235 is not a result about curiosity. The blocks below were written before `npm run gate` and before the 20-seed validation. The diagnosis numbers are from `scripts/diagnose-probe.ts` on this commit's parent learner (reconstruction commit, cell lr 0.035).

### Diagnosis

Probe error is mean squared error on the wall and food channels of the next 5×5 window. Targets are 0 or 1.

| baseline | Field | Rooms |
|---|---:|---:|
| constant 0.5 (untrained sigmoid) | 0.250 | 0.250 |
| constant 0 | 0.124 | 0.187 |
| predict each cell's mean | 0.098 | 0.114 |
| copy the current window | 0.090 | 0.072 |
| shift the visible window; unseen strip uses the mean | 0.030 | 0.039 |
| untrained MLP | 0.253 | 0.253 |
| shipped learner, 280 steps, random policy, seed 1 | 0.240 | — |

0.235 is the sigmoid prior. Constant 0.5 scores 0.250 exactly, because every target is 0 or 1. The shipped mean sits about 0.015 under that and about 0.14 above predicting the mean. It has not reached the copy baseline, and it is nowhere near the shift baseline.

The shift baseline is the interesting ceiling. About 16% of scored cells are the new row or column that the egocentric window cannot see. Those cells, predicted by their mean, cost ~0.12 each. The overlapping cells are nearly deterministic (overlap MSE 0.014 on Field: the window shift, plus food being eaten). A local window cannot drive probe error to 0. It can drive it near 0.03 on Field and 0.04 on Rooms. 0.235 is not that floor.

Same architecture, offline, correct transition target (Field probe):

| data | lr | steps | probe |
|---|---:|---:|---:|
| uniform | 0.035 | 280 | 0.236 |
| uniform | 0.035 | 8000 | 0.103 |
| uniform | 1 | 280 | 0.102 |
| uniform | 1 | 8000 | 0.063 |
| uniform | 2 | 8000 | 0.058 |
| one random walk | 1 | 4000 | 0.078 |

Capacity is enough: at lr 1 the same MLP passes the mean (0.098) and heads toward the shift ceiling (0.030). The shipped rate does not. At lr 0.035 the output-bias step is about `0.035 * (2/75) * 0.25 ≈ 0.0002` logits while the prediction sits at 0.5, so 280 steps cannot leave the prior. An 8000-step run at that rate only just reaches the mean. The run length is short only relative to that rate.

The training pair was also wrong. `Kernel.step` committed the window *after* the move, so the loss reconstructed an observation already in the input. The probe, and the policy's imagination, both ask for the next window. With the rate raised and the pair left wrong (lr 1, 280 steps, seed 1): on-policy ema 0.084, probe 0.116. The ema falls by copying the input; the probe stalls near the copy baseline (0.090). With the pair corrected at the same budget: probe 0.104, ema 0.110. They match, and both are still falling at 8000 steps (probe 0.064).

An 8-seed pilot, not the gate, separated the two edits. Alignment at lr 0.035 leaves probe at ~0.233. Raising the rate without alignment drops probe and the count-versus-random interval includes zero. Both together, at cell lr 4, drop probe through the mean and the count-versus-random interval excludes zero. That is the locked flag. G1's thresholds are unchanged.

### Preregister transition

- hypothesis: On Field, seeds 1–20, rho, committing the pre-move window and stepping the cell net at lr 4 lowers late held-out probe error versus the historical commit at lr 0.035.
- metric: probeLate
- direction: lower
- threshold: paired 95% bootstrap CI of (off − on) lies entirely above zero; G2 and C2 do not lose a majority that off held; paired CI of (lives on − lives off) does not lie entirely above zero

### Preregister instrument

- hypothesis: With transition on and the cell rate fixed at 4, count-based data beats a random walk on the Field probe, and uniform data beats random-walk data. Seeds 1–20. Count versus random is the paired probe late error of the two policies. Uniform versus walk trains the same MLP from the same init: one pass over a 280-step random walk, versus one pass over 4000 uniform transitions on the canonical Field.
- metric: probeLate
- direction: lower
- threshold: paired 95% bootstrap CI of (random − count) lies entirely above zero, and paired CI of (walk − uniform) lies entirely above zero. G1 thresholds are not changed.

### Results

Gate, Field, rho, seeds 1–20, 280 steps. Source: `bench/gate.json`.

| arm | probe late | G2 | C2 | lives (on − off) |
|---|---:|---|---|---|
| transition off (reconstruct, lr 0.035) | 0.2348 | 20/20 | 20/20 | |
| transition on (next window, lr 4) | 0.1114 | 20/20 | 20/20 | −0.15 [−0.35, 0.05] |
| off − on | 0.1234 [0.1150, 0.1307] | | | |

The flag stays on. Lives did not rise. G2 and C2 stayed unanimous.

Instrument, same cell MLP, same init, Field, seeds 1–20. Walk is one pass over 280 random-walk transitions. Uniform is one pass over 4000 uniform transitions. Source: `bench/instrument.json`.

| data | probe late |
|---|---|
| random walk | 0.126 (seed mean; range 0.097–0.182) |
| uniform | 0.059 [about 0.058–0.061] |
| walk − uniform | 0.0670 [0.0553, 0.0784] |

The validation criterion passes. Count versus random is in the sweep table below: Field probe late (random − count) is 0.0130 [0.0022, 0.0236].

Five signals, the fixed learner, 20 seeds, 280 steps. Probe error is lower-better. G1 is unchanged: late < 0.85 × early, or late < 0.14. Source: `bench/sweep.md`.

| env | signal | probe early | probe late | distinct cells | foods | G1 |
|---|---|---:|---:|---:|---:|---|
| field | random | 0.131 [0.121, 0.141] | 0.110 [0.103, 0.119] | 53.5 [48.7, 58.5] | 3.85 [2.95, 4.75] | 19/20 |
| field | count | 0.123 [0.116, 0.129] | 0.097 [0.093, 0.104] | 115.8 [108.6, 122.6] | 13.25 [11.45, 15.15] | 19/20 |
| field | surprise | 0.119 [0.112, 0.127] | 0.107 [0.102, 0.113] | 84.2 [78.0, 90.0] | 8.55 [7.50, 9.60] | 19/20 |
| field | rnd | 0.123 [0.117, 0.130] | 0.110 [0.102, 0.119] | 74.3 [69.7, 78.7] | 8.80 [7.65, 9.95] | 19/20 |
| field | rho | 0.126 [0.118, 0.136] | 0.111 [0.104, 0.120] | 71.4 [66.9, 75.9] | 7.35 [6.20, 8.50] | 18/20 |
| rooms | random | 0.144 [0.138, 0.151] | 0.123 [0.115, 0.131] | 54.4 [50.5, 58.5] | 4.75 [4.10, 5.40] | 16/20 |
| rooms | count | 0.136 [0.131, 0.140] | 0.098 [0.094, 0.103] | 114.4 [106.8, 121.0] | 13.70 [11.95, 15.35] | 20/20 |
| rooms | surprise | 0.136 [0.132, 0.140] | 0.114 [0.107, 0.120] | 79.9 [73.7, 86.3] | 9.05 [7.85, 10.35] | 18/20 |
| rooms | rnd | 0.140 [0.136, 0.145] | 0.112 [0.106, 0.119] | 68.6 [64.0, 73.1] | 7.10 [6.30, 8.05] | 19/20 |
| rooms | rho | 0.140 [0.135, 0.146] | 0.118 [0.111, 0.125] | 66.2 [61.3, 70.7] | 7.05 [6.20, 7.95] | 19/20 |

Count is the only signal that beats every other signal on probe late, on both maps (every paired CI excludes zero). Rho does not beat random on Field (difference −0.001, CI includes zero). On Rooms, rho beats RND only. Coverage still ranks the same way it did when the probe was stuck: count, then surprise, then RND, then rho, then random. The probe now agrees that count's data is better.

Mean probe by checkpoint (20 seeds):

| env | signal | 40 | 80 | 120 | 160 | 200 | 240 | 280 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| field | random | 0.131 | 0.127 | 0.124 | 0.120 | 0.123 | 0.123 | 0.110 |
| field | count | 0.123 | 0.110 | 0.115 | 0.113 | 0.109 | 0.107 | 0.097 |
| field | rho | 0.126 | 0.119 | 0.115 | 0.123 | 0.119 | 0.106 | 0.111 |
| rooms | random | 0.144 | 0.150 | 0.145 | 0.132 | 0.122 | 0.120 | 0.123 |
| rooms | count | 0.136 | 0.128 | 0.126 | 0.121 | 0.111 | 0.105 | 0.098 |
| rooms | rho | 0.140 | 0.136 | 0.132 | 0.130 | 0.124 | 0.123 | 0.118 |

The curves fall. They are not monotone: a 280-step online run is still noisy. Count is the steady one.

G1, read honestly, thresholds untouched. Field rho late 0.111 is not below 0.85 × early (0.85 × 0.126 = 0.107). It is below 0.14, and that is the arm that passes 18 of 20 seeds. Field count late 0.097 is below both 0.85 × 0.123 = 0.105 and 0.14 (19/20). The 0.14 line sits between the sigmoid prior (0.250) and the predict-the-mean floor (0.098 on Field). Clearing it means the net left the prior. It does not mean the net learned the shift. The shift ceiling on Field is about 0.030. On-policy ema is no longer a copy of the probe: Field rho ema is 0.076 against a probe of 0.111, because the visited states are easier than the held-out set.

Five-seed bench, rho, transition on: probe 0.122 → 0.108, on-policy ema 0.164 → 0.070, foods 5.60, lives 0.80, rooms foods 7.00, rooms lives 0.40, G1 5/5, G2 5/5, S1–S3 C1 C2 all pass. Source: `bench/latest.json`. `npm test` and `tsc --noEmit` pass.

`EnvSpec.params` still reserves learnability, drift rate, and distractor relevance. Drift above zero still throws. That family was not built.

### Next hypothesis

The probe now moves, and it moves more when the data covers the map. Do not add another curiosity term on the strength of the old ema. The next run can gate one change — longer credit assignment, or the reserved environment family — on this same probe. If Field probe late does not fall below the predict-the-mean floor (0.098) under rho, the cell net is still only learning the marginal, and the shift of the window is the open problem.

## 2026-10-15 probe instrument (America/New_York)

The 5% on-policy ema rule is retired before this run. G1 moves to a fixed held-out probe. The blocks below are the preregistration. They were written before `npm run gate`. Results are filled in after that command, not before.

Leave-one-out from the kept defaults, Field, seeds 1–20, rho learner, canonical map, frozen probe at step 280. Other flags stay at the defaults that were on when the run started.

### Preregister encoderMix

- hypothesis: On Field, seeds 1–20, encoderMix on lowers late held-out probe error versus encoderMix off, with the other kept defaults unchanged.
- metric: probeLate
- direction: lower
- threshold: paired 95% bootstrap CI of (off − on) lies entirely above zero; G2 and C2 do not lose a majority that off held; paired CI of (lives on − lives off) does not lie entirely above zero

### Preregister wake

- hypothesis: On Field, seeds 1–20, wake on lowers late held-out probe error versus wake off, with the other kept defaults unchanged.
- metric: probeLate
- direction: lower
- threshold: paired 95% bootstrap CI of (off − on) lies entirely above zero; G2 and C2 do not lose a majority that off held; paired CI of (lives on − lives off) does not lie entirely above zero

### Preregister latentRho

- hypothesis: On Field, seeds 1–20, latentRho on lowers late held-out probe error versus latentRho off, with the other kept defaults unchanged.
- metric: probeLate
- direction: lower
- threshold: paired 95% bootstrap CI of (off − on) lies entirely above zero; G2 and C2 do not lose a majority that off held; paired CI of (lives on − lives off) does not lie entirely above zero

### Preregister slowRho

- hypothesis: On Field, seeds 1–20, slowRho on lowers late held-out probe error versus slowRho off, with the other kept defaults unchanged.
- metric: probeLate
- direction: lower
- threshold: paired 95% bootstrap CI of (off − on) lies entirely above zero; G2 and C2 do not lose a majority that off held; paired CI of (lives on − lives off) does not lie entirely above zero

### Preregister slowRhoHat

- hypothesis: On Field, seeds 1–20, slowRhoHat on lowers late held-out probe error versus slowRhoHat off, with the other kept defaults unchanged.
- metric: probeLate
- direction: lower
- threshold: paired 95% bootstrap CI of (off − on) lies entirely above zero; G2 and C2 do not lose a majority that off held; paired CI of (lives on − lives off) does not lie entirely above zero

### Preregister slowWindow2

- hypothesis: On Field, seeds 1–20, slowWindow2 on lowers late held-out probe error versus slowWindow2 off, with the other kept defaults unchanged.
- metric: probeLate
- direction: lower
- threshold: paired 95% bootstrap CI of (off − on) lies entirely above zero; G2 and C2 do not lose a majority that off held; paired CI of (lives on − lives off) does not lie entirely above zero

### Preregister slowSelfWindow

- hypothesis: On Field, seeds 1–20, slowSelfWindow on lowers late held-out probe error versus slowSelfWindow off, with the other kept defaults unchanged.
- metric: probeLate
- direction: lower
- threshold: paired 95% bootstrap CI of (off − on) lies entirely above zero; G2 and C2 do not lose a majority that off held; paired CI of (lives on − lives off) does not lie entirely above zero

### Results

The gate ran after the preregistration above, on the defaults that were on that morning (encoderMix, wake, latentRho, slowRho, slowRhoHat, slowWindow2, slowSelfWindow). Seeds 1–20, Field, canonical map, frozen probe at step 280. Positive diff would mean on has lower probe error. None did. All seven are reverted (default off, code kept). G2 was 20/20 and C2 was 20/20 on every arm. Lives did not rise. Source: `bench/gate.json`.

| flag | probe on | probe off | off − on | 95% CI | decision |
|---|---:|---:|---:|---|---|
| encoderMix | 0.2350 | 0.2350 | 0.0000 | [0.0000, 0.0000] | revert — exact tie (slowEncoder is off, so the mix does not run) |
| wake | 0.2350 | 0.2350 | 0.0000 | [0.0000, 0.0000] | revert — exact tie |
| latentRho | 0.2350 | 0.2348 | −0.0002 | [−0.0004, −0.0000] | revert — on is worse |
| slowRho | 0.2350 | 0.2349 | −0.0002 | [−0.0004, 0.0001] | revert — CI includes zero |
| slowRhoHat | 0.2350 | 0.2348 | −0.0002 | [−0.0005, −0.0000] | revert — on is worse |
| slowWindow2 | 0.2350 | 0.2350 | −0.0000 | [−0.0001, 0.0000] | revert — CI includes zero |
| slowSelfWindow | 0.2350 | 0.2350 | −0.0000 | [−0.0002, 0.0001] | revert — CI includes zero |

The five-signal sweep ran after that reversion, so rho is the cell-loop compression signal with those terms out of the bonus. 20 seeds, Field and Rooms, 280 steps. Probe error is lower-better. G1 needs probe late < 0.85 × probe early (about 0.213 here) or probe late < 0.14. Every signal is 0/20. Source: `bench/sweep.md`.

| env | signal | probe early | probe late | on-policy ema | distinct cells | state entropy | foods | G1 |
|---|---|---:|---:|---:|---:|---:|---:|---|
| field | random | 0.251 | 0.236 [0.234, 0.238] | 0.237 [0.234, 0.239] | 53.5 [48.7, 58.5] | 5.28 [5.11, 5.44] | 3.85 [2.95, 4.75] | 0/20 |
| field | count | 0.251 | 0.235 [0.233, 0.236] | 0.236 [0.233, 0.238] | 128.3 [123.5, 133.0] | 6.79 [6.70, 6.86] | 16.10 [14.45, 17.80] | 0/20 |
| field | surprise | 0.251 | 0.235 [0.233, 0.237] | 0.236 [0.234, 0.239] | 96.9 [91.0, 102.5] | 6.19 [6.08, 6.29] | 9.70 [8.55, 10.95] | 0/20 |
| field | rnd | 0.251 | 0.235 [0.233, 0.236] | 0.236 [0.234, 0.238] | 82.3 [76.2, 88.8] | 5.96 [5.84, 6.08] | 9.15 [7.65, 10.70] | 0/20 |
| field | rho | 0.251 | 0.235 [0.233, 0.237] | 0.236 [0.234, 0.239] | 72.2 [67.8, 75.8] | 5.76 [5.65, 5.84] | 6.95 [5.90, 8.05] | 0/20 |
| rooms | random | 0.252 | 0.234 [0.231, 0.237] | 0.236 [0.232, 0.239] | 54.4 [50.5, 58.5] | 5.36 [5.25, 5.47] | 4.75 [4.10, 5.40] | 0/20 |
| rooms | count | 0.252 | 0.234 [0.231, 0.237] | 0.235 [0.233, 0.238] | 128.6 [122.8, 133.5] | 6.79 [6.71, 6.86] | 15.70 [13.90, 17.40] | 0/20 |
| rooms | surprise | 0.252 | 0.234 [0.231, 0.237] | 0.235 [0.233, 0.238] | 83.1 [75.6, 90.2] | 5.94 [5.77, 6.08] | 8.70 [7.20, 10.20] | 0/20 |
| rooms | rnd | 0.252 | 0.234 [0.231, 0.237] | 0.234 [0.231, 0.237] | 73.2 [66.9, 79.8] | 5.76 [5.63, 5.89] | 7.80 [6.65, 9.15] | 0/20 |
| rooms | rho | 0.252 | 0.234 [0.231, 0.237] | 0.234 [0.232, 0.236] | 62.9 [57.3, 68.3] | 5.60 [5.46, 5.73] | 6.05 [5.25, 6.85] | 0/20 |

Rho does not beat the baselines. On Field its probe error is tied with count, surprise, and RND (every paired CI includes zero) and it only beats random, by about 0.001. On Rooms no pair separates. Count covers about twice as many cells as rho and eats about twice the food. Surprise and RND sit between them. The on-policy ema matches the probe, so this is not a dark-room fake: neither number falls through the G1 line. G1 stays open. The threshold was not loosened.

### Next hypothesis

Do not put another curiosity term on the bonus. The probe says the cell predictor is barely moving, and rho is not the reason the body eats. The next run should take open problem 3 in `RESEARCH.md` — credit assignment longer than one imagination step — behind a flag, preregister it, and gate it on probe late error over at least 20 seeds. If the CI does not clear, leave it off.

## 2026-10-15 evening (America/New_York)

### What changed
No new curiosity term. The stack added since 2026-10-01 was measured, then gated.

`Loop` now takes a `features` object. Each slow and latent term can be turned off without deleting the trace. `npm run bench:json` runs G1, G2, S1–S3, C1, C2, Field late ema, Rooms foods, and lives on seeds 1..5 for the default flags and for each single-flag flip. Same weight init on both sides. `AGENTS.project.md` is the nightly contract: one experiment, this bench first, no preview. CI runs typecheck, tests, and the bench, and fails if `loop.ts` is under 2 KB.

Leave-one-out from the fully-on stack (improvement = (ema off − ema on) / ema off; positive means the term lowers Field late ema):

| term | on late | off late | improve | spread | lives on | lives off | decision |
|---|---:|---:|---:|---:|---:|---:|---|
| encoder | 0.2362 | 0.2331 | −1.32% | 1.04 | 0.40 | 0.60 | remove — band ≤ 0 |
| slowEncoder | 0.2362 | 0.2319 | −1.87% | 1.80 | 0.40 | 0.80 | remove — band ≤ 0 |
| encoderMix | 0.2362 | 0.2325 | −1.58% | 1.67 | 0.40 | 0.80 | keep, noisy |
| wake | 0.2362 | 0.2356 | −0.25% | 1.08 | 0.40 | 0.40 | keep, noisy |
| latentRho | 0.2362 | 0.2319 | −1.86% | 1.97 | 0.40 | 0.80 | keep, noisy |
| latentRhoHat | 0.2362 | 0.2296 | −2.90% | 2.82 | 0.40 | 0.40 | remove — band ≤ 0 |
| slowRho | 0.2362 | 0.2323 | −1.70% | 1.93 | 0.40 | 0.20 | keep, noisy |
| slowRhoHat | 0.2362 | 0.2324 | −1.63% | 2.06 | 0.40 | 0.20 | keep, noisy |
| slowWindow | 0.2362 | 0.2320 | −1.84% | 1.73 | 0.40 | 0.20 | remove — band ≤ 0 |
| slowWindow2 | 0.2362 | 0.2330 | −1.36% | 1.52 | 0.40 | 0.40 | keep, noisy |
| slowWindow3 | 0.2362 | 0.2358 | −0.14% | 0.29 | 0.40 | 0.40 | remove — measured null |
| slowSelfWindow | 0.2362 | 0.2349 | −0.56% | 0.97 | 0.40 | 0.40 | keep, noisy |
| slowSelfWindow2 | 0.2362 | 0.2340 | −0.95% | 1.01 | 0.40 | 0.00 | remove — lives +0.4 |

None cleared +5%. G2 was 5/5 on every row. A term whose noise band sat at or below zero was turned off. A band that still crossed a gain was kept and flagged. `encoderMix` is the weakest keep (the band just includes zero) and does not run while `slowEncoder` is off.

### Evidence
There was no previous `bench/latest.json`. The table below is the kept defaults against the fully-on stack, seeds 1..5, paired inits. Source: `bench/latest.json` and `bench/stack-ablation.json`.

| | Field early | Field late | Field foods | Field lives | Rooms foods | Rooms lives | G1 | G2 | S1 | S2 | S3 | C1 | C2 |
|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|---|---|
| stack (all on) | 0.2493 | 0.2362 | 8.40 | 0.40 | 4.80 | 0.60 | 0/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |
| kept defaults | 0.2497 | 0.2343 | 8.60 | 0.80 | 4.60 | 0.80 | 0/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |

Field late ema is 0.8% lower with the removed terms off. That is not 5%. Lives rose on seeds 4 and 5 (one death each); seeds 1–3 were unchanged. Per seed, late ema fell on 1, 3, 4, and 5, and seed 2 was a tie (0.2310 vs 0.2309). G1 is still open: late 0.234 is above both `0.85 × early` and `0.14`. The threshold was not loosened.

`npm test` and `tsc --noEmit` pass. The bench exits 0 while G1 is open, and exits non-zero if G2, S1, S2, S3, C1, or C2 loses a majority.

### Next hypothesis
Do not add another window. G1 is the open number. The next run should take open problem 3 in `RESEARCH.md` — credit assignment longer than one imagination step — behind a flag, and bench it against these kept defaults. If it does not clear 5% on Field late ema without raising lives or dropping G2, leave it off.

## 2026-10-14 evening (America/New_York)

### What changed
One improvement: the slow encoder’s residual mix is participation-adaptive. In `projectSlow` the mix starts at 0.02 and rises toward 0.08 as the participation ratio of the latent code increases, so a high-dimensional code invents features more aggressively while an already-low-dimensional code stays closer to what the slow predictor already compresses. Identity init remains exact at mix 0. The stop-grad gate is unchanged. Law 04, the Phase 1 note, and the act stage name the adaptive mix. Auth off. UI untouched.

### Evidence
`node --import jiti/register --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 19/19 pass (prior plus the existing slow-encoder structure test still moves and steps). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200. Browser smoke: page title Kernel, Lab/Bench/Laws/Loop present, canvas present, no console errors. Auth warnings empty.

### Next hypothesis
The adaptive mix lets the hierarchy invent a lower-dimensional code only when the latent is high-participation. If Field late ema does not fall faster than the fixed 0.01 mix, the adaptation is decoration — freeze the mix at 0.02 and keep the participation trace. If Field falls, let the slow encoder choose an explicit bottleneck size (slow code length < hidden) so the hierarchy compresses one level up more aggressively.

## 2026-10-13 evening (America/New_York)

### What changed
One improvement: the slow code invents its own features. A stop-grad encoder projects the latent code into the slow space. The projection starts as identity so the prior slow code is unchanged at step 0, then a residual mix (1%) lets features accumulate. The encoder steps only when both the latent and the slow code are compressing (slowEma < 0.2, latentEma < 0.2, slowProgress > 0.001). The predictor cannot move the projection. Law 04 / 05 and the Phase 1 note name the slow encoder. Auth off. UI untouched.

### Evidence
`node --import jiti/register --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 19/19 pass (prior 18 plus "slow encoder invents features on structure and stays put on noise"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200. Browser smoke: page title Kernel, Lab/Bench/Laws/Loop present, canvas present, no console errors. Auth warnings empty.

### Next hypothesis
The residual mix is small so the encoder can invent without immediately rewriting the code the slow predictor already compresses. If Field late ema does not fall faster than the gated self-windows alone, the invented features are still decoration — keep the trace, drop the mix. If Field falls, raise the mix and let the slow encoder choose a lower-dimensional code so the hierarchy can compress one level up more aggressively.

## 2026-10-12 evening (America/New_York)

### What changed
One improvement: the slow code imagines a second self-step past a wall its own first prediction treats as a wall. `slowSelfWindow2RhoHat` scores the residual drop from the current code to a follow-up self-prediction under a different action, only when the first self-window refused. It stays shut until `slowEma < 0.12`. A collapsed follow-up does not pay. Choose adds it beside the first self-window. The last paying drop saves and loads as `slowSelfWindow2`. Law 04 / 05, the Phase 1 note, and the act stage name the second self-step. Auth off. UI untouched.

### Evidence
`node --import jiti/register --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 18/18 pass (prior novelty, streak, ρ̂, horizon-3 gate, latent, encoder, action-conditional latent, slow code, wake, one-step window, second step past a wall, slowEma gate, residual constraint, third step, self window, plus "slow self window 2 scores a second self-step past a wall the first treats as a wall"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200. Browser smoke: page title Kernel, Lab/Bench/Laws/Loop present, canvas present, no console errors. Auth warnings empty.

### Next hypothesis
The second self-step pays an incremental drop when a follow-up action's own next code is closer to its prediction than the first self-prediction that refused. If Field late ema does not fall faster than the gated first self-window alone, the second self-step is decoration — keep the trace, drop it from the progress bonus. If Field falls, let the slow code invent its own features (stop-grad encoder on the slow loop) so the hierarchy can choose what to compress one level up.

## 2026-10-11 evening (America/New_York)

### What changed
One improvement: the slow code predicts its own next step. `slowSelfWindowRhoHat` scores the residual drop from the current slow code to the code the slow predictor itself imagines under the action, under a further slow prediction. It does not use a latent-imagined code, so ρ̂ can score a window the latent predictor has not already compressed. A collapsed self-code does not pay. It stays shut until both codes are compressing. Choose adds it beside the latent windows. The last paying drop saves and loads as `slowSelfWindow`. Law 04 / 05, the Phase 1 note, and the act stage name the self-step. Auth off. UI untouched.

### Evidence
`node --import jiti/register --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 17/17 pass (prior novelty, streak, ρ̂, horizon-3 gate, latent, encoder, action-conditional latent, slow code, wake, one-step window, second step past a wall, slowEma gate, residual constraint, third step, plus "slow self window scores the slow code's own next step, not a latent-imagined code"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200. Browser smoke: page title Kernel, Lab/Bench/Laws/Loop present, no console errors. Auth warnings empty.

### Next hypothesis
The self window pays an incremental drop when the slow predictor's own next code is closer to its prediction than the code in hand. If Field late ema does not fall faster than the gated latent windows alone, the self step is decoration — keep the trace, drop it from the progress bonus. If Field falls, let the slow code imagine a second self-step so ρ̂ can score past a wall its own first prediction still treats as a wall.

## 2026-10-10 evening (America/New_York)

### What changed
One improvement: the slow code scores a third latent window. `slowWindow3RhoHat` imagines one more step from the best second step. The third follow-up must lower the level-1 residual relative to the second action, so it cannot pick a code the latent loop would refuse. It pays the incremental drop from the second code to the third. A collapsed third code does not pay. It stays shut until `slowEma < 0.12`. Choose adds it beside the other windows. The last paying drop saves and loads as `slowWindow3`. Law 04 / 05, the Phase 1 note, and the act stage name the constraint. Auth off. UI untouched.

### Evidence
`node --import jiti/register --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 16/16 pass (prior novelty, streak, ρ̂, horizon-3 gate, latent, encoder, action-conditional latent, slow code, wake, one-step window, second step past a wall, slowEma gate, residual constraint, plus "slow window 3 scores one more step under the residual constraint"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200. Browser smoke: page title Kernel, Lab/Bench/Laws/Loop present, no console errors. Auth warnings empty.

### Next hypothesis
The third step pays an incremental drop when a follow-up lowers the level-1 residual and the imagined code is closer to the slow prediction. If Field late ema does not fall faster than the gated two-step window alone, the third step is decoration — keep the trace, drop it from the progress bonus. If Field falls, let the slow code predict its own next step (not only a latent-imagined code) so ρ̂ can score a window the latent predictor has not already compressed.

## 2026-10-10 evening (America/New_York)

### What changed
One improvement: the slow code itself predicts one more step so ρ̂ can score a third latent window under the same residual constraint. `slowWindow3RhoHat` scores the incremental drop from the best second code to a follow-up whose level-1 residual is lower, and writes `slowWindow3`. It stays shut until `slowEma < 0.12`. Law 04 / 05, the Phase 1 note, and the act stage name the third window. Auth off. UI untouched.

### Evidence
`node --import jiti/register --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 16/16 pass (prior novelty, streak, ρ̂, horizon-3 gate, latent, encoder, action-conditional latent, slow code, wake, one-step window, second step past a wall, slowEma gate, residual constraint, plus "slow window 3 scores one more step under the residual constraint"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200. Browser smoke: desktop and mobile 200, canvas present, no console errors. Auth warnings empty.

### Next hypothesis
The third step can no longer fund ρ̂ with a code the latent loop would refuse, and only after the slow code has earned the horizon-3 line. If Field late ema does not fall faster than the gated two-step window alone, the third window is still decoration — keep the trace, drop it from the progress bonus. If Field falls, let the slow code invent its own features (stop-grad encoder on the slow loop) so the hierarchy can choose what to compress one level up.

## 2026-10-09 evening (America/New_York)

### What changed
One improvement: the second slow step’s follow-up must also lower the level-1 residual. In `slowWindow2RhoHat` the candidate action is still the one whose low-passed code is closest to the slow prediction, but only if its `actionLatentEma` is strictly lower than the first action’s. A follow-up the latent loop would refuse (equal or higher residual) returns 0 and does not write `slowWindow2`. Law 04 / 05, the Phase 1 note, and the act stage name the constraint. Auth off. UI untouched.

### Evidence
`node --import jiti/register --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 15/15 pass (prior novelty, streak, ρ̂, horizon-3 gate, latent, encoder, action-conditional latent, slow code, wake, one-step window, second step past a wall, slowEma gate, plus "slow window 2 follow-up must lower the level-1 residual"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200. Browser smoke: desktop and mobile 200, canvas present, no console errors. Auth warnings empty.

### Next hypothesis
The second step can no longer fund ρ̂ with a code the latent loop would refuse. If Field late ema does not fall faster than the gated one-step window alone, the residual constraint is still decoration — keep the trace, drop it from the progress bonus. If Field falls, let the slow code itself predict one more step so ρ̂ can score a third latent window under the same residual constraint.

## 2026-10-08 evening (America/New_York)

### What changed
One improvement: the second slow step is gated on `slowEma < 0.12`, the same line as horizon 3. `slowWindow2RhoHat` still pays only when the first window treats the move as a wall, and a collapsed second code still does not pay. An uncalibrated slow code (ema at or above 0.12) now returns 0 and does not write `slowWindow2`. Law 04 / 05, the Phase 1 note, and the act stage name the gate. Auth off. UI untouched.

### Evidence
`node --import jiti/register --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 14/14 pass (prior novelty, streak, ρ̂, horizon-3 gate, latent, encoder, action-conditional latent, slow code, wake, one-step window, second step past a wall, plus "slow window 2 stays shut until slowEma is under 0.12"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200. Browser smoke: desktop and mobile 200, canvas present, no console errors. Auth warnings empty.

### Next hypothesis
The second step can no longer fund ρ̂ before the slow code has earned the horizon-3 line. If Field late ema does not fall faster than the one-step window alone, the gated second step is still decoration — keep the trace, drop it from the progress bonus. If Field falls, let the follow-up be the action that also lowers the level-1 residual, so the second step cannot pick a code the latent loop would refuse.

## 2026-10-07 evening (America/New_York)

### What changed
One improvement: the slow code imagines a second latent step. `slowWindow2RhoHat` scores the drop from the residual of the one-step low-passed code to the residual of a second low-passed code, under the same slow prediction. The follow-up is the legal action whose imagined code is closest. It pays only when the first window treats the move as a wall — no drop, or a collapsed one-step code — and a collapsed second code does not pay. It does not write slow progress. Choose adds it beside `slowWindowRhoHat`. The last paying drop saves and loads as `slowWindow2`. Law 04 / 05 and the act stage name the wall gate. Auth off. UI untouched.

### Evidence
`node --import jiti/register --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 13/13 pass (prior novelty, streak, ρ̂, horizon-3 gate, latent, encoder, action-conditional latent, slow code, wake, one-step window, plus "slow window scores a second latent step past a wall the first window refuses"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200. Browser smoke: desktop and mobile 200, canvas present, no console errors. Auth warnings empty.

### Next hypothesis
The second step pays on a toy wall when a follow-up code is closer to the slow prediction than the refused first step. If Field late ema does not fall faster than the one-step window alone, the second step is decoration — keep the trace, drop it from the progress bonus. If Field falls, gate the second step on `slowEma < 0.12` the way horizon 3 is gated, so an uncalibrated slow code cannot imagine past a wall it has not earned.

## 2026-10-06 evening (America/New_York)

### What changed
One improvement: the slow code imagines one latent step. `slowWindowRhoHat` scores the drop from the residual of the code already in hand to the residual of the low-passed next code under that imagined latent, using the same 0.85/0.15 mix as `commitSlow`. It pays only after both codes are compressing, floors flicker at 0.001, and refuses a collapsed imagined code. It does not write slow progress. Choose adds it beside the current-code `slowRhoHat`. The last paying drop saves and loads as `slowWindow`. Law 04 / 05 and the act stage name the window. Auth off. UI untouched.

### Evidence
`node --import jiti/register --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 12/12 pass (prior novelty, streak, ρ̂, horizon-3 gate, latent, encoder, action-conditional latent, slow code, wake, plus "slow window scores one imagined latent step, not only the current code"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200. Browser smoke: desktop and mobile 200, canvas present, no console errors. Auth warnings empty.

### Next hypothesis
The window pays on a toy latent when the imagined next code is closer to the slow prediction than the code in hand. If Field late ema does not fall faster than the current-code slow ρ̂ alone, the window is decoration — keep the trace, drop it from the progress bonus. If Field falls, let the slow code imagine a second latent step so ρ̂ can score past a regime the first window still treats as a wall.

## 2026-10-05 evening (America/New_York)

### What changed
One improvement: a level-1 residual can wake the slower code. `commitSlow` still trains after `latentEma < 0.2`. If the latent residual exceeds its ema by 0.06 while that gate is shut, one slow step still runs, at half rate, and counts as `slowWakes`. A wake moves weights and bias only. It does not write slow progress or lower slow ema, so it cannot fund ρ or ρ̂. While the gate is open, the same excess scales the slow rate up to 2×, so a downstairs surprise moves the slower code harder than a quiet step. `slowWakes` saves and loads. Law 04 / 05 and the Phase 1 note name the wake. Auth off. UI untouched.

### Evidence
`node --import jiti/register --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 11/11 pass (prior novelty, streak, ρ̂, horizon-3 gate, latent separation, stop-grad encoder, action-conditional latent, slow code, plus "level-1 residual wakes the slow step and does not pay"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200. Browser smoke: desktop and mobile 200, canvas present, no auth copy.

### Next hypothesis
The wake moves a toy code after a regime shift and does not pay. If Field late ema does not fall faster than the gated slow code alone, the wake is decoration — keep the counter, drop the closed-gate step. If Field falls, let the slow code imagine one step of the latent, so ρ̂ can score a slower window and not only the current code.

## 2026-10-04 evening (America/New_York)

### What changed
One improvement: a slower code one level up. It predicts a low-passed copy of the latent, not the cells, and only after the level-1 code is already compressing (`latentEma < 0.2`). Learning rate is 0.12 against the latent predictor's 0.4. Progress and the per-move drop pay only after both codes are compressing, and a 0.001 floor drops flicker. Choose mixes `slowRho` into the progress bonus and adds `slowRhoHat(a)`. Weights, bias, per-action ema, and the slow code save and load. Law 04 / 05 and the Phase 1 note name the stack. Auth off. UI untouched.

### Evidence
`node --import jiti/register --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 10/10 pass (prior novelty, streak, ρ̂, horizon-3 gate, latent separation, stop-grad encoder, action-conditional latent, plus "slow code predicts the latent, not cells, and stays shut on noise"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200. Browser smoke: desktop and mobile 200, canvas present, no console errors. Auth warnings empty.

### Next hypothesis
The slow code compresses a toy latent. If Field late ema does not fall faster than the level-1 loop alone, the mix is decoration — keep the trace, drop it from the progress bonus. If Field falls, let a level-1 residual wake the slow step so a surprise downstairs can still move the slower code.

## 2026-10-03 evening (America/New_York)

### What changed
The latent predictor was action-blind, so ρ̂ could not score a move. It now conditions on the action one-hot in the committed input, plus a clipped per-action bias so the imagined code can leave ½. ρ̂ for a move is the drop from latent ema to that action's own prediction error, and only after `latentEma < 0.2` and the drop clears 0.01. A collapsed code still floors at 0.25, so a constant hidden does not pay. Choose adds `latentRhoHat(a)` to the progress bonus. Bias and per-action ema save and load. Law 04 / 05 and the Phase 1 note name the conditioning. Auth off. UI untouched.

### Evidence
`node --import jiti/register --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 9/9 pass (prior novelty, streak, ρ̂, horizon-3 gate, latent separation, stop-grad encoder, plus "action-conditional latent ρ̂ pays for the move that predicts a sharper code"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200. Browser smoke: desktop and mobile 200, canvas present, no console errors. Auth warnings empty.

### Next hypothesis
The action channel is live in a toy window. If Field late ema does not fall faster than the action-blind latent, the bias is decoration — keep the trace, drop it from the progress bonus. If Field falls, stack a slower code on this one: predict the latent, not the cells, one level up.

## 2026-10-02 evening (America/New_York)

### What changed
The latent projection was a fixed random matrix, so the second loop could not choose what to compress. It is now a slow encoder. The target code is stop-grad: the predictor is scored against a detached copy and cannot move that target. The encoder steps only after `latentEma < 0.2` and latent progress is positive — the same gate as curiosity — and writes a clipped covariance update, so stable channels accumulate and noise decays. Weights stay in [-1.5, 1.5]. The projection is saved and loaded with the brain. Law 04 / 05 name the stop-grad encoder. Auth off. UI untouched.

### Evidence
`node --import jiti/register --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 8/8 pass (prior novelty, streak, ρ̂, horizon-3 gate, latent separation, plus "stop-grad encoder moves on structure and stays put on noise" and "stop-grad encoder prefers structured channels over noise"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200. Browser smoke: desktop and mobile 200, canvas present, no console errors. Auth warnings empty.

### Next hypothesis
The encoder now prefers structured channels in a toy window. If Field late ema does not fall faster than the fixed-projection seed, the covariance step is still decoration — keep it as a Bench trace and drop it from curiosity. If Field falls, condition the latent predictor on the action so ρ̂ can score imagined codes, not only cells.

## 2026-10-01 evening (America/New_York)

### What changed
`loop.ts` on main was the 9-byte `see-local` stub again. Finished that first: restored Loop (plan surprise muted on family 2, scent side head, falling-streak gate `SCENT_FALL_STREAK = 4`, persist `scentFallStreak` on save/load) and wired the gated third window in `Kernel.choose` (`imagined3`, `horizon3Ema: 0.12`).

One improvement: Phase 1 seed. A second loop predicts a fixed random projection of the next observation — a latent, not cells. Cell prediction stays so the body can still imagine a window. Latent progress is measured before the latent update, and curiosity mixes it in only after `latentEma < 0.2`. Law 04 / 05 and the Phase 1 note name the seed. Auth off. UI untouched.

### Evidence
`node --import jiti/register --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 6/6 pass (novelty, streak, ρ̂, horizon-3 gate, "latent loop compresses hidden state on structure and refuses noise", brain save/load keeps the streak and latent ema). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200. The production bundle was dropping the scent side-effect import, so `scentRhoHat` now lives on Loop itself.

### Next hypothesis
The latent is a fixed projection, so it cannot yet invent the features it predicts. If Field late ema does not fall faster than the cell loop alone, the mix is noise — drop it from curiosity and keep the latent as a Bench trace only. If it falls, make the projection slow-learned (stop-grad encoder) so the second loop can choose what to compress.

## 2026-09-30 evening (America/New_York)

### What changed
`loop.ts` on main was again the 9-byte stub (`see-local`). Finished that first: restored Loop from `5a43946` (last intact tree), then the falling-streak gate (`SCENT_FALL_STREAK = 4`, persist `scentFallStreak` on save/load).

One improvement: the live policy now actually runs the gated third window. `imagineScores` already knew `imagined3` + `horizon3Ema`, but `Kernel.choose` never passed the buffers — horizon 3 was a test-only path. Choose now allocates `imagined3`, wires it, and sets `horizon3Ema: 0.12`. Law 05 names the gate. Auth off. UI untouched.

### Evidence
`node --experimental-strip-types --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 5/5 pass (novelty/ρ̂/streak + "horizon 3 stays off until ema is under the gate"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200.

### Next hypothesis
The third window is now on the body, not only in tests. Compare Field late ema, G2, lives, and Rooms foods with the gate on vs horizon 2 only on the same seed. If G2 holds and foods rise, try a cheap latent: predict hidden, not cells.

## 2026-09-29 evening (America/New_York)

### What changed
`loop.ts` on main was again the 9-byte stub (`see-local`). Finished that first: restored Loop from `4f59a14` (last intact tree), then the falling-streak gate (`SCENT_FALL_STREAK = 4`, persist `scentFallStreak` on save/load).

One improvement: the live policy now actually runs the gated third window. `imagineScores` already knew `imagined3` + `horizon3Ema`, but `Kernel.choose` never passed the buffers — horizon 3 was a test-only path. Choose now allocates `imagined3`, wires it, and sets `horizon3Ema: 0.12`. Law 05 names the gate. Auth off. UI untouched.

### Evidence
`node --experimental-strip-types --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 5/5 pass (novelty/ρ̂/streak + "horizon 3 stays off until ema is under the gate"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200.

### Next hypothesis
The third window is now on the body, not only in tests. Compare Field late ema, G2, lives, and Rooms foods with the gate on vs horizon 2 only on the same seed. If G2 holds and foods rise, try a cheap latent: predict hidden, not cells.

## 2026-09-28 evening (America/New_York)

### What changed
`loop.ts` on main was again the 9-byte stub. Finished that first: restored Loop from the last intact tree (c612dbb), then the falling-streak gate (`SCENT_FALL_STREAK = 4`, persist `scentFallStreak`).

One improvement: gate horizon 3. Imagination still scores two predicted windows always; the third window and its residual drop now run only when `ema < 0.12`. Kernel wires `imagined3`. Law 05 / act stage note the gate. Auth off. UI untouched.

### Evidence
`node --experimental-strip-types --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 5/5 pass (restored novelty/ρ̂/streak + "horizon 3 stays off until ema is under the gate"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200.

### Next hypothesis
The gate stops early noise but does not prove the third window helps once calibrated. Compare Field late ema, G2, lives, and Rooms foods with the gate on vs horizon 2 only on the same seed. If G2 holds and foods rise, try a cheap latent: predict hidden, not cells.

## 2026-09-27 evening (America/New_York)

### What changed
`loop.ts` on main was a 9-byte stub (`see-local0`) after the claimed restore. Finished that work first: restored Loop from the last intact tree, then the falling-streak gate (`SCENT_FALL_STREAK = 4`, persist `scentFallStreak`) and the truncated `kernel.test.ts` suite.

One improvement: horizon 3. Imagination now takes a third predicted window from the best step-2 state. ρ̂ adds the residual drop step-2→step-3 so a wall can hide compressible structure one step later and still pay. Scores add `γ² · confidence · best3`. Law 04 / 05 and the act stage note the extra step. Auth off. UI untouched.

### Evidence
`node --experimental-strip-types --test src/lib/kernel/kernel.test.ts src/lib/kernel/scent-novelty.test.ts` — 23/23 pass (restored suite + novelty/ρ̂/streak + "horizon 3 scores a residual drop two steps past a wall"). `tsc --noEmit` clean. Production build succeeded. Preview on :8081 returns 200.

### Next hypothesis
Horizon 3 multiplies model error. Measure Field late ema, G2, and lives versus horizon 2 on the same seed. If G2 drops or lives rise, the third window is noise — gate it behind `ema < 0.12`. If G2 holds and foods rise in Rooms, try a cheap latent: predict hidden, not cells.
