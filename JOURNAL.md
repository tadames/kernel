# Journal

## 2026-10-23 option (America/New_York)

Written before `npm run gate -- --flag option --seeds 20`. No probe contrast from that command is in the preregistration. The five-seed numbers in this block are the parent learner, seeds 1–5, sha `f95a475`, and are not this claim.

`discard` stays off. `decode` stays off. Neither is rerun. Horizon 2 and horizon 3 stay the shipped imagination. This is not another imagined window. Open problem 3's unread part is an option: one primitive direction, executed for more than one tick. The cell loss does not change. The progress bonus does not change.

### Preregister option

Hypothesis. On Field, holding the sampled direction for a second tick gives the transition learner two consecutive windows under that same action. Late held-out probe error falls relative to sampling a new action every tick. The comparison is the flag absent.

Instrument. Flag `option`, default off. Rho, transition still on, every other flag at its default, including `discard` off and `decode` off. Field, canonical map, frozen probe, 280 steps. Seeds 1–20. The same seeds on both arms. Weight init is reseeded per episode. The flag is action-side. It does not enter the progress bonus. Surprise and the cell step still run on every tick, including a held tick.

Rule, locked here. The span is 2. It is not searched. Actions are north, east, south, west, and wait. Wait is a direction in this set and can be held. On the commitment tick the policy samples as it does today, with one `softmaxSample` draw. The next tick executes that same action and does not sample. The counter is then zero, and the following tick samples again. A wall does not cancel the hold. A death does not cancel it. There is no termination probability, so the on path draws no extra policy noise to decide when to stop. On a held tick the scores, the entropy, and the branching stay at the commitment step's values, because the policy was not consulted. Learning still commits `(window, held action)` before the body moves.

The off path calls `choose` on every tick. The hold counter is not read. The constructor draws no extra `Math.random`. An explicit `option: false` is the same learner as the default.

`optionHeld` is the fraction of steps that repeated a committed direction. It is 0 when the flag is off. It is not a cutoff. On an even-length episode with this span it is 1/2 when every option runs its second tick.

This is one map. There is no room contrast, so the matched-room control is not a cell of this run. The control is the same Field, the same seeds, the flag absent.

- hypothesis: On Field, seeds 1–20, rho, with the other defaults unchanged, option on lowers late held-out probe error versus option off.
- metric: probeLate
- direction: lower
- threshold: paired 95% bootstrap CI of (off − on) lies entirely above zero; G2 and C2 do not lose a majority that off held; paired CI of (lives on − lives off) does not lie entirely above zero

The decision is that gate, 20 seeds. A pass at 20 is not a headline until seeds 1–200 give a paired interval of the same sign that also excludes zero, with no G2, C2, or lives regression on those seeds. A fail at 20 does not go on to 200. The flag then stays off, and the code stays. No second mechanism is added in this run. No second span is run.

Parent bench, seeds 1–5, before this flag existed. Field probe early 0.1222, Field probe late 0.1079, Field on-policy ema 0.1641 → 0.0704, Field foods 5.60, Field lives 0.80, Rooms foods 7.00, Rooms lives 0.40. G1 2/5, G2 5/5, S1 4/5, S2 5/5, S3 5/5, C1 5/5, C2 5/5. G1 stays on the baseline-relative probe rule and is not this claim. Source: `bench/latest.json` at sha `f95a475`.

### Results

The prediction is confirmed. Late probe error is lower with the hold on. The paired interval lies entirely above zero at 20 seeds and again at 200. G2 and C2 keep the majority they held with the flag off. Lives do not rise. The flag stays on.

Decision gate, seeds 1–20. 40 episodes, 4 workers, 2.4 seconds. Source: `bench/option/gate-20.json`.

| arm | probe late | option held |
|---|---:|---:|
| option off | 0.1114 | 0.000 |
| option on | 0.1008 | 0.500 |

Off minus on is 0.0107 [0.0032, 0.0179]. The interval lies entirely above zero. The hold was not idle: half the steps repeated the committed direction, and the off arm repeated none. G2 was 20/20 on both arms. C2 was 20/20 on both arms. Lives on minus lives off is −0.10 [−0.40, 0.20]. That interval includes zero, so deaths did not rise. The threshold was not loosened.

Headline, seeds 1–200. The 20-seed pass is not the headline. 400 episodes, 4 workers, 17.2 seconds. Source: `bench/gate.json`, copied at `bench/option/gate-200.json`.

| arm | probe late | option held |
|---|---:|---:|
| option off | 0.1081 | 0.000 |
| option on | 0.1033 | 0.500 |

Off minus on is 0.0048 [0.0022, 0.0076]. The interval lies entirely above zero, same sign as the decision gate. G2 was 200/200 on both arms. C2 was 200/200 on both arms. Lives on minus lives off is −0.105 [−0.205, −0.005]. That interval lies entirely below zero, so deaths fell. The preregistered bar was that deaths do not rise. They did not. The drop was not a separate prediction.

Figure: `bench/option/option-ci.png`. The bar is the 200-seed paired interval of off minus on. Zero is the vertical line. The bar sits entirely to the right of it.

`option` is now default on. It does not enter the progress bonus. The span stays 2. `discard` stays off. `decode` stays off. `transition` stays on. With both default-on flags in one gate, seeds 1–20, transition off minus on is 0.1347 [0.1255, 0.1416] and option repeats the decision interval above. No occupancy grid was rerun. No second span was run.

Kept learner after the flag was turned on, seeds 1–5, sha `f95a475`. Field probe early 0.1157, Field probe late 0.1102, Field on-policy ema 0.1654 → 0.0726, Field foods 8.20, Field lives 0.40, Rooms foods 7.40, Rooms lives 0.40. G1 1/5, G2 5/5, S1 4/5, S2 5/5, S3 5/5, C1 5/5, C2 5/5. G1 stays on the baseline-relative probe rule and is not this claim. The five-seed flip is not the decision: on 0.1102, off 0.1079, so off minus on is −0.0022 on those five seeds, the other sign from the paired gates. Lives on that row are 0.40 versus 0.80. The off-option row matches the parent bench on every stored mean: probe early 0.1222, probe late 0.1079, on-policy ema 0.1641 → 0.0704, foods 5.60, lives 0.80, Rooms foods 7.00, Rooms lives 0.40, and the same claim counts. Source: `bench/latest.json`. Trend: `bench/history.csv`.

### Next hypothesis

Do not turn `option` off, and do not rerun it at another span. The span was locked at 2 before the run, and both preregistered intervals cleared. Do not rerun `discard` or `decode`. The unread remainder of open problem 3 is a roll-out: on the second tick, execute the imagined follow-up when that follow-up is a different action, instead of repeating the primitive. It has to ship behind a flag, off unless it beats this option learner on the probe, and it must not raise lives.

## 2026-10-22 latent target (America/New_York)

Written before `npm run gate -- --flag decode --seeds 20`. No probe contrast from that command is in the preregistration. The five-seed numbers in this block are the parent learner, seeds 1–5, sha `dc60f55`, and are not this claim.

`discard` stays off. It is not rerun. This is not a second loss mask. Open problem 2's remainder is a training target in a latent that still decodes to cells, so the frozen probe can score cell error. The curiosity latent flags stay off. They score ρ̂. They do not change the cell loss. Horizon 2 and horizon 3 stay the shipped imagination. An option is not this run.

### Preregister decode

Hypothesis. On Field, the cell net's first layer is trained to match a stop-grad code of the next window, and the second layer decodes the hidden code to cells. Late held-out probe error falls relative to the same learner trained on the cells. The comparison is the flag absent.

Instrument. Flag `decode`, default off. Rho, transition still on, every other flag at its default, including `discard` off. Field, canonical map, frozen probe, 280 steps. Seeds 1–20. The same seeds on both arms. Weight init is reseeded per episode. The flag is learning-side. It does not enter the progress bonus. Surprise and progress read the real cell residual from the forward, before the step.

Rule, locked here. The code width is the hidden width. No narrower bottleneck is searched. The encoder is a linear map plus tanh and a bias. It is initialized as a copy of the existing projection, so the constructor draws no extra `Math.random`, and the off path is the same learner. Bias starts at 0. Its input is the cell training target with family 2 zeroed. Family 2 stays out of the plan the way `cellTrainTarget` already replaces it, and the encoder takes no gradient on those channels.

Three updates read the weights from before the step. The step size is the `lr` passed to assimilate, which is `TRANSITION_LR` on the grid. The mean-square scale is `2` over the width, the same factor the cell step uses.

1. Predictor. The hidden from the forward that scored surprise is matched to a detached code. Only the first layer moves. The tanh derivative multiplies.
2. Decoder. The second layer maps that same hidden, detached, onto the cell training target. The residual is the float32 forward output, the same value the cell step subtracts. The first layer does not receive this gradient. `imagine` is still that forward, so the probe reads these cells.
3. Encoder. The code is trained so the current readout decodes it: sigmoid of the detached second layer applied to the code, against the cell target, family 2 zeroed. Only the encoder moves. Each encoder weight and the bias are clipped to ±1.5, the same clip as the curiosity encoder.

`decodeResidual` is the mean squared gap of the hidden and the code on the last training step. It is 0 when the flag is off. It is not a cutoff. The off arm is 0.

- hypothesis: On Field, seeds 1–20, rho, with the other defaults unchanged, decode on lowers late held-out probe error versus decode off.
- metric: probeLate
- direction: lower
- threshold: paired 95% bootstrap CI of (off − on) lies entirely above zero; G2 and C2 do not lose a majority that off held; paired CI of (lives on − lives off) does not lie entirely above zero

The decision is that gate, 20 seeds. A pass at 20 is not a headline until seeds 1–200 give a paired interval of the same sign that also excludes zero, with no G2, C2, or lives regression on those seeds. A fail at 20 does not go on to 200. The flag then stays off, and the code stays. No second mechanism is added in this run.

Parent bench, seeds 1–5, before this flag existed. Field probe early 0.1222, Field probe late 0.1079, Field on-policy ema 0.1641 → 0.0704, Field foods 5.60, Field lives 0.80, Rooms foods 7.00, Rooms lives 0.40. G1 2/5, G2 5/5, S1 4/5, S2 5/5, S3 5/5, C1 5/5, C2 5/5. G1 stays on the baseline-relative probe rule and is not this claim. Source: `bench/latest.json` at sha `dc60f55`.

### Results

The prediction is inconclusive. The paired interval includes zero. The flag stays off. The code stays. No 200-seed run: the 20-seed rule said a fail stops there. The fail is that off minus on does not lie entirely above zero. It also does not lie entirely below zero, so this is not a measured regression.

40 episodes, 4 workers, 2.0 seconds. Source: `bench/gate.json`.

| arm | probe late | decode residual |
|---|---:|---:|
| decode off | 0.1114 | 0.000 |
| decode on | 0.1125 | 0.0981 |

Off minus on is −0.0011 [−0.0100, 0.0078]. The interval includes zero. On is not lower. The latent target was not idle: the last-step gap from the hidden to the code, on the on arm, is 0.0981. G2 was 20/20 on both arms. C2 was 20/20 on both arms. Lives on minus lives off is −0.15 [−0.45, 0.15]. That interval includes zero, so deaths did not rise. The threshold was not loosened.

Figure: `bench/decode/decode-ci.png`. The bar is the paired interval of off minus on. Zero is the vertical line. The bar crosses it.

`decode` remains default off. It does not enter the progress bonus. `discard` stays off. `transition` stays the only default-on flag. `horizonRho` stays on for rho. No occupancy grid was rerun.

Kept defaults after the flag was added, seeds 1–5, sha `dc60f55`. The row matches the parent. Field probe early 0.1222, Field probe late 0.1079, Field on-policy ema 0.1641 → 0.0704, Field foods 5.60, Field lives 0.80, Rooms foods 7.00, Rooms lives 0.40. G1 2/5, G2 5/5, S1 4/5, S2 5/5, S3 5/5, C1 5/5, C2 5/5. G1 stays on the baseline-relative probe rule and is not this claim. The five-seed flip of `decode` is not the decision: on 0.1054, off 0.1079, lives 0.40 versus 0.80. That sign is the other way from the 20-seed point estimate, and the 20-seed interval includes zero. Source: `bench/latest.json`. Trend: `bench/history.csv`.

### Next hypothesis

Do not turn `decode` on, and do not rerun it with more seeds or a narrower code. Twenty seeds already put zero inside the interval, and a second width would be a new mechanism aimed at a question this sample did not settle as a loss. The cell mask made the probe worse. A latent target that decodes to cells did not beat the cell loss. Open problem 2 is closed on this probe. The next experiment is the unread part of open problem 3: an option, a direction held for more than one tick. Horizon 2 and horizon 3 stay the shipped imagination. An option has to ship behind a flag, off unless it beats its absence on the probe, and it must not raise lives.

## 2026-10-20 incompressible bits (America/New_York)

Written before `npm run gate -- --flag discard --seeds 20`. No probe contrast from that command is in the preregistration. The five-seed numbers in that block are the parent learner, seeds 1–5, sha `5d9b7e1`, and are not this claim.

Open problem 1 in `RESEARCH.md` is not a new mechanism. The text says curiosity uses expected residual plus the residual drop across horizon-2 imagination, and that global ρ still scales. That is the shipped score in `imagineScores`: Bernoulli expected residual in the explore mix, `max(0, res1 − bestRes2)` added to ρ̂ when `horizonRho` is on, and `progressEma` still scaling. `horizonRho` defaults on for rho. The same paragraph says a second kernel whose observations are the first kernel's hidden state remains Phase 1, so that half is not this experiment. The copy in the progress law that still called action-conditional ρ̂ an open problem was stale. It now matches the act law. The horizon drop is not put behind a new flag, and it is not turned off. The occupancy grid is not rerun.

The next open problem is latent prediction. The latent curiosity flags already failed the probe gate and stay off. A pure latent objective that stops emitting cells cannot be scored by this probe, because the probe is cell error. The piece the probe can score is the second sentence: discard incompressible bits. `discard` is that piece. It is learning-side. It does not enter the progress bonus.

### Preregister discard

Hypothesis. On Field, a channel the model is not predicting better than that channel's own running mean is incompressible to this learner. Dropping it from the cell loss, after a short warmup, leaves the hidden state for the bits that are compressing, and late held-out probe error falls. The comparison is the same learner with the mask absent.

Instrument. Flag `discard`, default off. Rho, transition still on, every other flag at its default. Field, canonical map, frozen probe, 280 steps. Seeds 1–20. The same seeds on both arms. Weight init is reseeded per episode. The mask is not a curiosity term.

Rule, locked here. Family 2 is already out of the cell loss. For every other output, a running mean of the target starts at 0.5 and a running marginal error starts at 0.25. Both use rate 0.1, the same rate as the model residual EMA. The marginal error on a step is the squared distance from the target to the mean before that target is folded in. The model residual EMA is updated first, from the real target, as it is today. Surprise and progress read that real residual. They do not read the mask. After 40 training updates have completed, a non-scent channel whose model residual EMA is greater than or equal to its marginal EMA is copied from the prediction into the training target. That gradient is zero. The first kernel step does not train, so the mask begins on the 42nd kernel step. The early probe at step 40 is still the unmasked learner. A tie with the mean is dropped. A channel the model is strictly beating is kept. Once dropped, a channel can stay dropped, because its residual is no longer driven down.

- hypothesis: On Field, seeds 1–20, rho, with the other defaults unchanged, discard on lowers late held-out probe error versus discard off.
- metric: probeLate
- direction: lower
- threshold: paired 95% bootstrap CI of (off − on) lies entirely above zero; G2 and C2 do not lose a majority that off held; paired CI of (lives on − lives off) does not lie entirely above zero

The decision is that gate, 20 seeds. A pass at 20 is not a headline until seeds 1–200 give a paired interval of the same sign that also excludes zero, with no G2, C2, or lives regression on those seeds. A fail at 20 does not go on to 200. The flag then stays off, and the code stays. The mean fraction of non-scent outputs dropped on the last training step is reported for both arms. It is not a cutoff. The off arm is 0.

Parent bench, seeds 1–5, before this flag existed. Field probe early 0.1222, Field probe late 0.1079, Field on-policy ema 0.1641 → 0.0704, Field foods 5.60, Field lives 0.80, Rooms foods 7.00, Rooms lives 0.40. G1 2/5, G2 5/5, S1 4/5, S2 5/5, S3 5/5, C1 5/5, C2 5/5. G1 stays on the baseline-relative probe rule and is not this claim. Source: `bench/latest.json` at sha `5d9b7e1`.

### Results

The prediction is refuted. Discard on is worse than discard off, and lives rise. The flag stays off. The code stays. No 200-seed run: the 20-seed rule said a fail stops there.

40 episodes, 4 workers, 3.8 seconds. Source: `bench/gate.json`.

| arm | probe late | last-step mask |
|---|---:|---:|
| discard off | 0.1114 | 0.000 |
| discard on | 0.1276 | 0.741 |

Off minus on is −0.0162 [−0.0256, −0.0070]. The interval lies entirely below zero. On is higher probe error. The mask was not idle: at the last step it had dropped 0.741 of the non-scent outputs. G2 was 20/20 on both arms. C2 was 20/20 on both arms. Lives on minus lives off is 0.25 [0.10, 0.45]. That interval lies entirely above zero, so deaths rose. Both failures are the preregistered ones. The threshold was not loosened.

Figure: `bench/discard/discard-ci.png`. The bar is the paired interval of off minus on. Zero is the vertical line. The bar sits entirely to the left of it.

`discard` remains default off. It does not enter the progress bonus. `transition` stays the only default-on flag. `horizonRho` stays on for rho. No occupancy grid was rerun.

Kept defaults after the flag was added, seeds 1–5, sha `5d9b7e1`. The row matches the parent. Field probe early 0.1222, Field probe late 0.1079, Field on-policy ema 0.1641 → 0.0704, Field foods 5.60, Field lives 0.80, Rooms foods 7.00, Rooms lives 0.40. G1 2/5, G2 5/5, S1 4/5, S2 5/5, S3 5/5, C1 5/5, C2 5/5. G1 stays on the baseline-relative probe rule and is not this claim. The five-seed flip of `discard` agrees in sign and is not the decision: on 0.1222, off 0.1079, lives 1.00 versus 0.80. Source: `bench/latest.json`. Trend: `bench/history.csv`.

### Next hypothesis

Do not turn `discard` on, and do not rerun the mask with more seeds. The interval already excludes zero on the wrong side, and lives move with it. Do not add a second loss mask in the next run. The remainder of open problem 2 is a latent training target that still decodes to cells, so this probe can score it. It has to ship behind a flag, off unless it beats its absence, and it must not raise lives. Horizon 2 and horizon 3 are already the shipped imagination, so open problem 3's "one tick" sentence is not an unbuilt mechanism. An option, a direction held for more than one tick, is the unread part of that problem and comes after the decoder.

## 2026-10-19 phase diagram (America/New_York)

Written before `npm run phase-diagram`. No occupancy contrast from that command is in this block. The results section is filled in after the run. The five-seed bench is descriptive and is not this claim.

The previous entry closed the late-return thread. On fresh seeds and a 27-cycle episode the half-contrast included 0 at every window from 25 to 100, and no onset was located. Stationary noise and matched drift had already shown no attraction for rho against the same baselines. This run is the summary those entries named. It adds no curiosity term. The default temperature stays 0.45. `forgettingRate` stays 0. `progressWindow` stays 50. `periodicBoost` stays off. The cycle, the window track, the orientation average, and the learnability grid are not reopened. They appear here only as cells of one occupancy contrast.

### Preregister phase diagram

Hypothesis. On one instrument, rho's occupancy does not move toward a stationary-noise room, a room that drifts near the learner's adaptation time, or a room whose weights are forgotten near that time. The headline is the classification of every cell, not a new peak. A null map is a result. It is not a reason to add a term.

Instrument. Layout seed 3000, the wide door, region 1 on the east, learnability 1, relevance 0, no food markers, no mirror. Temperature 0.15, the sensitivity setting, passed only inside this sweep. Episodes are 400 steps, the length on which dose 0.0085 moved rho at that temperature. Seeds 1–200. The weight stream is `seed * 10007 + 18101`. It is not a stream used by the noise, drift, boost, or forgetting episodes. Explorers are random, count, surprise, RND, and rho. No explorer is retuned. The default agent stays window-50 rho with both curiosity terms on. This is not a Loop flag. No probe gate is required to keep a default, because the default does not change. Field probe late from `npm run bench:json`, seeds 1–5, is reported in the results and is not a pass bit. G1 stays on the baseline-relative probe rule and is not this claim.

Metric. Target-room fraction, the fraction of steps that began in region 1. Excess is the manipulated arm minus the matched control, one number per seed. Paired 95% percentile bootstrap, 2000 resamples.

Axes. Three separate sweeps. A cell changes one axis and leaves the others off. Zero is the manipulation off. The three nonzero levels are the coarse grid. There is no factorial.

Noise. Stationary white noise versus one frozen fair-bit picture of the same room, glow scaled by the same amplitude on both arms. Amplitudes 0, 1/3, 2/3, and 1. Amplitude 1 is the historical bit. The frozen picture uses `staticSeed` equal to the episode seed. Drift is 0. Forgetting is 0. There is no matched-pattern flag and no learnability average.

Drift. The matched pattern pair. The drifting arm redraws `EAST_HOLD_LATENT`. The held arm keeps it and burns the coin. Rates are the locked `driftRatesFromTau` cells at 0, 16× below 1/τ, 1/τ, and 16× above 1/τ, on τ = 53.28471423768756. The numbers are 0, 0.001173, 0.01877, and 0.3003. The two interior rates from the earlier sweep are not cells. Forgetting is 0. Amplitude is 1.

Forgetting. The held pattern, drift 0. The target arm decays the cell net after each update. The control arm does not. Rates are 0, half-life 4τ, half-life τ, and half-life τ/2, from `forgettingRatesFromTau` on the same τ. The numbers are 0, 0.003246809718565169, 0.012924125031568812, and 0.025681217055306127. The middle positive rate is the λ whose room-probe half-recovery was about 86 steps. This cell is an occupancy level, not a phase, an onset, or a half-contrast.

Positive control. One planted bonus, not a fourth axis. Dose 0.0085 on the progress channel of actions whose real destination is region 1. The world is the held pattern, drift 0, forgetting 0, the zero world of the drift and forgetting axes. The flat arm omits the bonus. Imagined follow-ups do not receive it. The same five explorers are planted. Random is still the negative control.

Calls. Explorer index is random 0, count 1, surprise 2, RND 3, rho 4. Axis index is noise 0, drift 1, forget 2. Level index is 0..3 in the order above.

- Excess at each cell uses salt `19000 + 100 × axis + 10 × level + explorer`.
- The positive control uses salt `21000 + explorer`.
- Rho minus a baseline uses salt `20000 + 100 × axis + 10 × level + baseline` on the grid, and salt `21100 + baseline` on the bonus. Baseline index stops at RND.

`greaterCall` on rho's bonus is the instrument. Confirmed when that CI lies entirely above 0, refuted when it lies entirely below 0, otherwise inconclusive. The detection threshold δ is the lower end of that CI, and only when the instrument is confirmed. Otherwise δ is unavailable and no cell may be labeled null-with-sensitivity.

Class, `phaseCellClass`, for rho. Attracted when the CI lies entirely above 0. Repelled when it lies entirely below 0. Null-with-sensitivity when δ is available and the CI lies strictly inside (−δ, δ), so the interval excludes effects at least as large as the planted bonus produced. Otherwise inconclusive. Sign comes before the null. A small interval that excludes 0 is attracted or repelled even when its magnitude is under δ.

Primary prediction, `notAttractedCall`, on three cells only. Noise at amplitude 1. Drift at 0.01877. Forgetting at 0.012924125031568812. Confirmed when rho's class is repelled or null-with-sensitivity. Refuted when the class is attracted. Inconclusive when the class is inconclusive. A cell whose random CI excludes 0 is confounded, and the prediction is then inconclusive. The class is still printed. The other nine cells are the map. A repulsion or an attraction off the primary cell does not confirm or refute these three calls, and it does not reopen the cycle or the shape test.

Rho against the baselines is a paired contrast of the two excesses, same seed. `rho-higher` when that CI lies entirely above 0, `rho-lower` when it lies entirely below 0, `no-difference` when it includes 0. It is not a pass bit. It does not change a class.

Harness. The sweep aborts before any call if a random walk's target-room fraction, meal count, or life count differs across the two arms of any cell, including the bonus. Level 0 aborts if any explorer's two arms differ on any seed: the manipulation is off, so the arms are one episode. A miss is a broken instrument. The classes are not issued.

The held room at drift 0, the forgetting control, and the unboosted bonus are one option set and one episode. The forgetting level-0 target is that same episode. The other arms are not assumed equal. They are run.

Decision, locked before the run. No outcome changes the default temperature, the window, the forgetting rate, or the place bonus. No term is added. Instrument not confirmed: the map is still drawn, and a sensitive null is not claimed. A primary attraction: that cell is reported as attracted, and the next measurement is that cell on this same instrument. It is not a license for a mechanism in this run. Three confirmed primary calls: rho is not attracted at the three historical points on this instrument, and the rest of the grid is the map of where that does and does not extend.

Figure: `bench/phase-diagram/phase-diagram.png`. Color is the paired excess. It saturates at ±0.06. A pale cell has a CI that includes 0. A dark edge means the CI excludes 0. Rho's class is printed in the cell. Source: `bench/phase-diagram/phase.json`. Tables: `bench/phase-diagram/phase.csv` and `bench/phase-diagram/contrasts.csv`. The sweep is `npm run phase-diagram`. It is not part of CI.

### Results

The instrument was confirmed. Rho is not attracted in any cell. Eight of the nine nonzero cells are inconclusive, and the slow-drift cell is a sensitive null. The three primary predictions are inconclusive. No term was added.

20000 episodes, 400 steps, 4 workers, 885 seconds. The random walk matched on every cell, meals and lives included, so no cell is confounded. Level 0 is an exact zero for every explorer. Source: `bench/phase-diagram/phase.json`.

#### Instrument. Confirmed.

Temperature 0.15, held pattern, drift 0, forgetting 0, dose 0.0085. Excess is boosted minus flat. δ is rho's lower end, 0.0167.

| explorer | excess |
|---|---|
| random | 0.0000 [0.0000, 0.0000] |
| count | −0.0052 [−0.0205, 0.0095] |
| surprise | 0.0440 [0.0246, 0.0642] |
| rnd | 0.0392 [0.0212, 0.0597] |
| rho | 0.0360 [0.0167, 0.0552] |

Rho's interval lies entirely above 0. Surprise and RND do too. Count includes 0. Rho minus random is 0.0360 [0.0166, 0.0544], and rho minus count is 0.0413 [0.0167, 0.0673]. Both lie entirely above 0. Rho minus surprise is −0.0079 [−0.0357, 0.0204], and rho minus RND is −0.0032 [−0.0304, 0.0241]. Those two include 0. The planted dose moves rho, and it does not move rho more than surprise or RND.

#### Map. No attraction for rho.

Excess is the manipulated room minus the matched control. δ = 0.0167. A sensitive null has to sit strictly inside that band. An upper end under δ is not enough when the lower end still reaches a repulsion of that size.

| axis | level | rho | class |
|---|---|---|---|
| noise | 0 | 0.0000 [0.0000, 0.0000] | null-with-sensitivity |
| noise | 1/3 | −0.0100 [−0.0337, 0.0145] | inconclusive |
| noise | 2/3 | −0.0108 [−0.0352, 0.0140] | inconclusive |
| noise | 1 | −0.0119 [−0.0350, 0.0111] | inconclusive |
| drift | 0 | 0.0000 [0.0000, 0.0000] | null-with-sensitivity |
| drift | below | −0.0021 [−0.0118, 0.0071] | null-with-sensitivity |
| drift | at | −0.0192 [−0.0408, 0.0029] | inconclusive |
| drift | above | −0.0069 [−0.0290, 0.0161] | inconclusive |
| forget | 0 | 0.0000 [0.0000, 0.0000] | null-with-sensitivity |
| forget | slow | 0.0027 [−0.0188, 0.0228] | inconclusive |
| forget | at | 0.0050 [−0.0194, 0.0282] | inconclusive |
| forget | fast | 0.0018 [−0.0239, 0.0253] | inconclusive |

Of the nine nonzero cells, none is attracted and none is repelled. One is null-with-sensitivity: drift at 0.001173, sixteen times below 1/τ. The other eight include 0 and also include an effect at least as large as δ. The three zero cells are the identity check. They are sensitive nulls because they are exactly 0.

The primary cells rule out an attraction the size of δ and do not rule out a repulsion that size. Noise at amplitude 1 has upper end 0.0111. Drift at 0.01877 has upper end 0.0029. Both lower ends, −0.0350 and −0.0408, pass −δ. Forgetting at λ has both ends outside the band. The point estimates at full noise and at the adaptation rate are negative. They are not repulsions.

| axis | level | random | count | surprise | rnd |
|---|---|---|---|---|---|
| noise | 1/3 | 0.0000 [0.0000, 0.0000] | 0.0109 [−0.0064, 0.0289] | 0.0128 [−0.0121, 0.0359] | −0.0004 [−0.0184, 0.0178] |
| noise | 2/3 | 0.0000 [0.0000, 0.0000] | −0.0017 [−0.0182, 0.0158] | 0.0066 [−0.0185, 0.0306] | 0.0010 [−0.0231, 0.0253] |
| noise | 1 | 0.0000 [0.0000, 0.0000] | 0.0204 [0.0036, 0.0362] | 0.0036 [−0.0196, 0.0288] | 0.0004 [−0.0235, 0.0242] |
| drift | below | 0.0000 [0.0000, 0.0000] | −0.0011 [−0.0074, 0.0052] | −0.0036 [−0.0137, 0.0062] | −0.0040 [−0.0132, 0.0056] |
| drift | at | 0.0000 [0.0000, 0.0000] | −0.0059 [−0.0221, 0.0099] | −0.0031 [−0.0250, 0.0184] | −0.0023 [−0.0202, 0.0163] |
| drift | above | 0.0000 [0.0000, 0.0000] | 0.0063 [−0.0090, 0.0212] | 0.0107 [−0.0126, 0.0345] | −0.0038 [−0.0261, 0.0192] |
| forget | slow | 0.0000 [0.0000, 0.0000] | −0.0129 [−0.0297, 0.0043] | 0.0110 [−0.0118, 0.0357] | −0.0089 [−0.0282, 0.0107] |
| forget | at | 0.0000 [0.0000, 0.0000] | −0.0196 [−0.0370, −0.0020] | −0.0242 [−0.0505, 0.0044] | −0.0016 [−0.0252, 0.0227] |
| forget | fast | 0.0000 [0.0000, 0.0000] | −0.0173 [−0.0347, −0.0012] | −0.0320 [−0.0597, −0.0039] | −0.0112 [−0.0336, 0.0126] |

Count is attracted to full-amplitude noise, 0.0204 [0.0036, 0.0362]. Count is repelled by forgetting at λ and at the fast rate. Surprise is repelled by the fast rate. Those signs are not rho's. Rho's paired contrast against each baseline includes 0 in every nonzero cell except one: at noise amplitude 1, rho minus count is −0.0323 [−0.0618, −0.0035]. Rho spends less excess time in that noise room than count does. The other 35 nonzero contrasts include 0.

#### Predictions.

| call | result |
|---|---|
| instrument, dose 0.0085 | confirmed |
| noise at amplitude 1, not attracted | inconclusive |
| drift at 0.01877, not attracted | inconclusive |
| forgetting at λ, not attracted | inconclusive |

None of the three is refuted. None is a sensitive null, and none is a repulsion, so none is confirmed. The hypothesis, that rho's occupancy does not move toward those rooms, is not established as a sensitive null and is not contradicted by an attraction.

Figure: `bench/phase-diagram/phase-diagram.png`. Tables: `bench/phase-diagram/phase.csv` and `bench/phase-diagram/contrasts.csv`.

No mechanism was added. `policyTemperature` omitted is still 0.45. `forgettingRate` stays 0. `progressWindow` omitted is still 50. `periodicBoost` stays off. The place bonus stays off outside this control. No Loop flag was added, and none was turned on. Five-seed bench, seeds 1–5, sha `7d5a2bc`, rho, transition still the only default-on flag. Field probe early 0.1222, Field probe late 0.1079, Field on-policy ema 0.1641 → 0.0704, Field foods 5.60, Field lives 0.80, Rooms foods 7.00, Rooms lives 0.40. G1 2/5, G2 5/5, S1 4/5, S2 5/5, S3 5/5, C1 5/5, C2 5/5. G1 stays on the baseline-relative probe rule and is not this claim. Source: `bench/latest.json`. Trend: `bench/history.csv`.

### Next hypothesis

Do not add a curiosity term, and do not rerun this grid with more seeds or a longer episode. The three historical cells include 0. Their upper ends sit under the planted effect, and their lower ends do not, so a longer run would be a second look at a closed question. Rho is not attracted anywhere on the map. The one cell where rho differs from a baseline is full-amplitude noise, where count is attracted and rho is lower than count. That is not a learning-progress attraction. Field probe late is still 0.1079, and it has not moved across the daily rows. Stop stacking occupancy measurements. The next experiment is open problem 1 in `RESEARCH.md`, action-conditional ρ̂, and it has to beat its own absence on the probe.

## 2026-10-19 window track (America/New_York)

Written before `npm run window-track`. No peak, onset, or half-contrast from that command is in this block. The results section is filled in after the run. The five-seed bench is descriptive and is not this claim.

The previous entry left the late-return hunch inconclusive. The progress peak moved with the window, 60.0, 91.8, and 133.4 steps at windows 25, 50, and 100. The occupancy onset was located only at 50, at 93.66 steps, and the half-contrast was negative only there. The onset intervals at 25 and 100 were wider than half a period. The 80-step bout used by the earlier progress measurement ends before the uncapped peak at window 50. This run asks whether that late return is a window-tracked effect once the bout and the episode can see it, or an artifact of the shipped window. It adds no curiosity term. The default temperature stays 0.45. `forgettingRate` stays 0. `progressWindow` stays 50. `periodicBoost` stays off.

### Preregister window track

Hypothesis. Rho's occupancy onset and half-contrast track the progress window. The estimator's peak moves later as the window grows, and the return follows that peak. The half-contrast is the first half of the forgetting period minus the second half. A later onset makes that contrast more negative only while the onset is still approaching half a period. Once the onset passes half a period, a later onset makes the contrast less negative, because the high half wraps into the first half of the clock. The previous sweep assumed the first direction at every step. That assumption has the wrong sign between a peak near 92 and a peak near 133. This run predicts each contrast step from the square-wave template of the measured peak.

Alternative. The late pattern exists only at the shipped window 50, or it does not replicate on fresh seeds once the onset is given a longer episode. A single-setting bump, or a bump that disappears, closes the thread. It is not a learning-progress lag.

World. The previous entry's. Wide-door distractor, layout seed 3000, learnability 1, relevance 0, drift 0, no food, no metabolism. λ = 0.012924125031568812. Temperature 0.15. Seeds 1–200. The curve uses the historical stream `seed * 10007 + 9201` and salts 8001–8005. It is a harness, not a claim seed. `curveDecision` is the previous rule. If it is not `run`, no episode is run and the hypothesis is not confirmed and not refuted.

Harness. The curve's learn drop, the decay-minus-held endpoint, the half-recovery, and the locked period must match `bench/phase-profile/profile.json` within 1e-9, and the decision must be `run`. A miss aborts. The progress peaks and the occupancy use fresh streams and are not required to match the previous numbers.

Bout. The body is held still. Learn region 1 for 200 steps with decay off, the same transition seed as the curve. Checkpoints stay 0, 43, 86, 129, 172, 258, 344, 400. At each one the learned brain is restored, the cell net is decayed that many steps, and the baseline the progress formula reads is set to the learned probe. The bout is 400 steps. That is the away endpoint, and it is longer than twice the longest window, so a peak near twice the window is not forced onto the last sample. The call is the argmax at the 400-step checkpoint. A peak that is not positive is censored. A peak on the final step is right-censored. A window is censored when the uncensored seeds are not a majority. A pair drops a seed that is censored on either window, and the pair is censored when the kept seeds are not a majority of 200. `peak80` is the argmax inside the first 80 steps. It is reported and is not the call. Seed stream `seed * 10007 + 16101`.

Windows. 25, 35, 50, 70, and 100. The two interior points are this run's choice, so a smooth slope can be told from a bump that exists only at 50. Rho is scored at all five. Count, surprise, RND, and random are scored at all five as well. A unit test already locks that those four do not read the window. Running them here asks whether a late pattern appears in a matched room under the longer episode.

`boutPrediction` is `chainPrediction` on the four adjacent peak differences, longer minus shorter. Salts 17620 through 17623, in window order. `scales` when every difference lies entirely above 0. `fixed` when every difference includes 0. `reversed` when any lies entirely below 0. `partial` when the steps disagree without a reversal. `censored` when any window or any pair is censored. The ratio of adjacent mean peaks is reported, salts 17650 through 17653, and is not a cutoff.

Positive control, before an onset is a where-claim. Same world, decay off, temperature 0.15, seeds 1–200, the locked period, the new episode length. Seed stream `seed * 10007 + 16201`. Dose 0.05 only. The on-half is `floor(P/2)` steps at offsets 0, round(P/4), twice that, and three times that. Rho is planted at each window and all four offsets. The flat arm omits the bonus and is separate for each window, because the window changes rho's policy. Projection salt is 17700 plus 10 times the window index plus the offset index. Lag salt is 17800 on the same index. `offsetCall` is the previous rule. A window's instrument is `phaseInstrumentCall` on its four offsets. The sweep's instrument is confirmed only when all five windows are confirmed. It is refuted when all five are refuted. Otherwise inconclusive. This is the check that the longer episode still recovers a planted wave. The historical 1600-step lags are not the target.

Episode length. `trackEpisodeSteps`. The longest multiple of the period that is at most 27 cycles and at most 4800 steps, and at least 8 cycles. For period 172 that is 27 × 172 = 4644 steps. The previous occupancy episode was 1600 steps, nine complete cycles. Twenty-seven cycles is three times that count. The onset was censored when its interval was wider than half a period. More cycles per seed is how this run makes a real onset locatable. It does not assign a phase to a zero vector.

Forgetting occupancy. Explorers random, count, surprise, RND, and rho, at every window. The forget arm sets `forgettingRate` to λ. The held arm omits it. Seed stream `seed * 10007 + 16301`. Window index is 0 for 25, 1 for 35, 2 for 50, 3 for 70, 4 for 100. Explorer index is the curiosity-signal order, and rho's index is 4. Half-contrast salt is 17000 plus 100 times the window index plus the explorer index. Half-period salt is 17100 on that index. East salt is 17200. Bin salt is 17300 plus 100 times the window index plus 10 times the explorer index plus the bin. Onset salt is 17400. Held-out salt is 17500. Sign is `signCall` on the half-contrast, decay minus held. Location is `locationCall` on the onset of the mean vector. Held-out projection freezes the angle on seeds 1–100 and scores seeds 101–200. Existence is a negative sign or a held-out interval entirely above 0. `latePattern` is the previous rule.

Onset chain. The number is the longer window's onset minus the shorter one's, wrapped into (−P/2, P/2]. The bootstrap draws one seed index and uses it on both windows. Salts 17600 through 17603. A pair is scorable only when both locations are resolved. The chain is censored when any pair is not scorable or the instrument is not confirmed. `onsetPrediction` is `chainPrediction`.

Contrast chain. The template is `squareHalfContrast` of that window's mean uncensored peak. The observed number is the longer window's half-contrast minus the shorter one's, paired on the seed. Salts 17610 through 17613. `templateStep` uses a flat threshold of 0.05. A template step inside ±0.05 is predicted flat, and an observed interval that excludes 0 is then a mismatch. A larger template step matches when the observed interval lies entirely on that side, mismatches when it lies entirely on the other side, and is unresolved when it includes 0. `contrastTrack` is `tracks` when every informative step matches, `reversed` when any step mismatches, `flat` when every step is predicted flat, and `partial` otherwise. The contrast chain is not censored by the instrument.

Specificity. The shipped window uses `specificityCall`: confounded when random's sign is not null, shared when count, surprise, or RND exists, specific otherwise. `gridSpecificity` also calls the run confounded when random's sign is not null at two or more windows, and shared when any one of those three explorers is late at two or more windows. One off-window miss is reported and does not flip a specific shipped window. That repeat rule is this run's choice. It keeps a single noisy window from closing a real track, and it still catches a pattern that is not rho's.

Verdict, `trackReason`. `inconclusive` when the curve is not `run`, the instrument is not confirmed, or the bout is censored. The occupancy numbers are still reported, and the hypothesis is not closed. `confirmed` when the bout scales, the onset scales, the contrast tracks, and the specificity is specific. `refuted` otherwise. A pattern that is late only at window 50, a pattern that is absent at window 50, an onset chain that stays censored after the longer episode, a contrast that does not follow the peak, a shared pattern, or a random confound is a refutation. The previous sweep stayed inconclusive because a censored onset blocked the call. Here that censor, once the bout outlasts the peak and the episode is three times as long, is a failure of the window-tracked account.

No policy retune and no new term in any of these. No window replaces the shipped default of 50. If the verdict is refuted, the late-return thread is closed in this journal and in the research priorities, and the next measurement is a phase-diagram summary of where rho fails against the baselines under noise, drift, and forgetting. If the verdict is confirmed, decay stays off and the next measurement is the count of returns that begin after the room probe has risen. If the verdict is inconclusive, that count stays the next measurement and the late-return thread stays open.

The sweep aborts before any call if a cycle-world episode records a meal or a death, if a random-walk checksum differs across arms that share a tag, a length, a period, and a seed, or if the curve harness misses.

Figures: `bench/window-track/forget-curve.png`, `bench/window-track/peak-vs-window.png`, `bench/window-track/progress-trace.png`, `bench/window-track/positive-onset.png`, `bench/window-track/half-contrast.png`, `bench/window-track/onset-vs-window.png`, `bench/window-track/phase-by-window.png`, and `bench/window-track/baseline-contrast.png`. Source: `bench/window-track/window.json`. The sweep is `npm run window-track`. It is not part of CI.

### Results

The curve reproduced. The planted wave was recovered at every window on the longer episode. The progress peak still moves later as the window grows. The occupancy onset was not located at any window, including the shipped 50, and every half-contrast includes 0. The verdict is refuted. The late-return thread is closed. No term was added. The window stays 50.

200 curve seeds, 1000 progress bouts, and 15000 episodes, 4 workers, 15329 seconds. The bouts were 60 seconds. The episodes were 15262 seconds. Source: `bench/window-track/window.json`.

#### Curve. Reproduced.

λ = 0.012924125031568812. Half-recovery 86.15 [85.45, 86.85], 200 of 200 uncensored. P = 172. The historical episode is 1600 steps. This run's episode is 4644 steps, 27 cycles. `curveDecision` is `run`. These intervals match the previous entry.

| check | value | call |
|---|---|---|
| learns | 0.1558 [0.1547, 0.1569] | confirmed |
| consolidates | 0.0519 [0.0513, 0.0526] | confirmed |
| forgets, decay minus held | 0.1490 [0.1485, 0.1494] | confirmed |
| interference minus held, not a gate | 0.0099 [0.0093, 0.0106] | confirmed |

Figure: `bench/window-track/forget-curve.png`.

#### Progress peak. Scales. The absolute step is not the previous stream's step.

The call is the argmax over the 400-step bout after 400 steps of decay. A peak on the final step is dropped. One seed at window 50, and two seeds at 70 and at 100, are dropped. The other peaks are inside the bout.

| window | peak step | inside the first 80, not the call |
|---|---|---|
| 25 | 78.99 [68.45, 91.45] | 44.71 [43.15, 46.44] |
| 35 | 94.78 [83.19, 107.34] | 50.21 [48.46, 51.98] |
| 50 | 131.36 [117.67, 145.27], 199 seeds | 55.33 [53.45, 57.17] |
| 70 | 176.62 [161.63, 191.23], 198 seeds | 58.06 [56.25, 59.85] |
| 100 | 239.90 [224.55, 254.58], 198 seeds | 59.30 [57.41, 61.01] |

35 minus 25 is 15.79 [5.96, 26.55]. 50 minus 35 is 37.13 [26.16, 50.07], 199 pairs. 70 minus 50 is 44.84 [33.09, 57.38], 198 pairs. 100 minus 70 is 63.28 [48.65, 77.94], 198 pairs. All four lie entirely above 0. `boutPrediction` is scales.

The 80-step column at window 50 is 55.33 [53.45, 57.17]. The previous entry, on the historical progress stream, was 55.26 [53.52, 57.10]. The first 80 steps agree across streams. The uncapped peak does not. This stream puts window 50 at 131.36. The previous stream put it at 91.82 inside a 240-step bout. The call is the ordering. The absolute step is a property of the weight stream.

The ratios of adjacent mean peaks are 1.20 [1.07, 1.36], 1.39 [1.26, 1.56], 1.34 [1.24, 1.46], and 1.36 [1.27, 1.47]. They are reported and are not a cutoff. A 400-step bout holds every window. The longest peak, 239.90, is inside the bout.

Figure: `bench/window-track/peak-vs-window.png`. The trace of the mean progress at the 400-step checkpoint is `bench/window-track/progress-trace.png`.

#### Positive control. Instrument confirmed at every window.

Temperature 0.15, decay off, period 172, dose 0.05, episode 4644. The lag is recovered onset minus the planted offset. Every offset at every window is delayed: the projection lies entirely above 0, and the lag lies entirely above 0 and inside a quarter period. The sweep's instrument is confirmed. The longer episode still recovers a planted wave.

| window | offset 0 | offset 43 | offset 86 | offset 129 |
|---|---|---|---|---|
| 25 | 21.54 [19.25, 23.82] | 21.99 [19.87, 24.28] | 20.91 [18.87, 22.79] | 21.96 [19.88, 23.93] |
| 35 | 20.01 [17.99, 22.04] | 20.74 [18.76, 22.80] | 20.49 [18.23, 22.74] | 21.00 [18.85, 23.28] |
| 50 | 20.64 [18.78, 22.58] | 19.47 [17.37, 21.64] | 20.86 [18.74, 23.04] | 21.01 [19.03, 23.05] |
| 70 | 18.91 [16.97, 20.92] | 20.51 [18.56, 22.43] | 20.55 [18.50, 22.58] | 21.71 [19.55, 23.70] |
| 100 | 20.69 [18.68, 22.65] | 22.24 [20.51, 23.96] | 20.42 [18.76, 22.09] | 18.85 [16.74, 20.98] |

The planted lag stays between 19 and 22 steps. It does not grow with the progress window. The response delay of a dose-0.05 wave is not the estimator's time constant.

Figure: `bench/window-track/positive-onset.png`.

#### Occupancy. The late return is absent at every window.

Temperature 0.15, fresh seeds, decay minus held, 27 cycles. Rho's half-contrast includes 0 at all five windows. Every onset interval is wider than half a period, so every location is unresolved and every `latePattern` is absent. `onsetPrediction` is censored. `contrastPrediction` is partial. The 25-to-35 template step sits inside the flat band of 0.05, and that observed interval includes 0. The other three observed intervals include 0.

| window | half-contrast | onset | location | late pattern |
|---|---|---|---|---|
| 25 | −0.0020 [−0.0105, 0.0061] | 51.45, width 133.1 | unresolved | absent |
| 35 | −0.0048 [−0.0136, 0.0030] | 91.71, width 125.6 | unresolved | absent |
| 50 | 0.0012 [−0.0065, 0.0086] | 148.86, width 155.8 | unresolved | absent |
| 70 | −0.0018 [−0.0091, 0.0058] | 87.59, width 139.3 | unresolved | absent |
| 100 | 0.0015 [−0.0060, 0.0090] | 37.07, width 133.2 | unresolved | absent |

The previous episode, 1600 steps on the historical occupancy stream, had window 50 at −0.0177 [−0.0301, −0.0051] with onset 93.66 [75.45, 114.73]. That row is absent here. The point estimate at window 50 has the other sign, and the interval is about half as wide.

East fraction, not a call. Window 70 is 0.0170 [0.0015, 0.0328]. The other four include 0: window 25 is 0.0072 [−0.0089, 0.0235], window 35 is 0.0142 [−0.0016, 0.0291], window 50 is 0.0067 [−0.0104, 0.0227], and window 100 is 0.0066 [−0.0096, 0.0226]. The previous level shift, about 0.04 to 0.05 at every window, is absent from this episode except for that one window.

Figure: `bench/window-track/half-contrast.png`, `bench/window-track/onset-vs-window.png`, and `bench/window-track/phase-by-window.png`.

#### Baselines. Specific.

Same fresh seeds, same long episode, all five windows. Random is a point mass at 0. Count, surprise, and RND include 0 on the half-contrast at every window, and none is late. `randomNonNull` is 0. The late counts are 0, 0, 0. `gridSpecificity` is specific.

| explorer | half-contrast at 50 | east fraction at 50 |
|---|---|---|
| random | 0.0000 [0.0000, 0.0000] | 0.0000 [0.0000, 0.0000] |
| count | 0.0027 [−0.0069, 0.0125] | −0.0354 [−0.0443, −0.0268] |
| surprise | 0.0036 [−0.0042, 0.0117] | 0.0308 [0.0069, 0.0552] |
| rnd | −0.0037 [−0.0116, 0.0041] | −0.0327 [−0.0486, −0.0161] |

Count's east fraction is negative at every window, and surprise's is positive at every window. RND's is negative at every window. The four non-rho rows agree across windows to the third digit, which is the unit-test fact that they do not read the progress window. Those level shifts are not phase-locked. They are not the late-return claim.

Figure: `bench/window-track/baseline-contrast.png`.

#### Verdict. Refuted.

`boutPrediction` is scales. `onsetPrediction` is censored. `contrastPrediction` is partial. The instrument is confirmed. Specificity is specific. `trackReason` is refuted, reason `onset-not-scaling`. The progress peak moves later when the window is longer, on a fresh weight stream, and the 400-step bout holds it. The occupancy onset does not follow that peak. The late pattern is absent at 25, 35, 50, 70, and 100. It is not a bump that exists only at the shipped window and survives a finer grid. A fresh stream and 27 cycles remove it, including at window 50. The planted control shows that the longer episode can still locate a real wave of dose 0.05.

`forgettingRate` stays 0. `progressWindow` omitted is still 50. `policyTemperature` omitted is still 0.45. `periodicBoost` stays off. No Loop flag was added, and none was turned on. The window was not retuned. Five-seed bench, seeds 1–5, sha `50c95db`, rho, transition still the only default-on flag. Field probe early 0.1222, Field probe late 0.1079, Field on-policy ema 0.1641 → 0.0704, Field foods 5.60, Field lives 0.80, Rooms foods 7.00, Rooms lives 0.40. G1 2/5, G2 5/5, S1 4/5, S2 5/5, S3 5/5, C1 5/5, C2 5/5. G1 stays on the baseline-relative probe rule and is not this claim. Source: `bench/latest.json`. Trend: `bench/history.csv`.

### Next hypothesis

Do not turn decay on, do not retune the progress window, and do not add a curiosity term. The late return under forgetting is closed. On fresh seeds and a 27-cycle episode the half-contrast includes 0 at every window from 25 to 100, and no onset is located. The progress peak still scales with the window. The next measurement is a phase-diagram summary of where rho fails against random, count, surprise, and RND under stationary noise, matched drift, and forgetting. The summary is descriptive. It adds no term. Field probe late is still 0.1079. A new term still has to beat its own absence on that probe.

## 2026-10-19 progress window (America/New_York)

Written before `npm run window-sweep`. No peak, onset, or half-contrast from that command is in this block. The results section is filled in after the run. The five-seed bench is descriptive and is not this claim.

The previous entry's next measurement was a count of returns that begin after the room probe has risen. That count is not this run. The phase profile left rho's occupancy onset at 93.66 steps and the within-bout progress peak at 55.26 steps, both near the shipped 50-step progress window, and the peak did not grow when the forgetting half-life doubled. This run tests that hunch. It adds no curiosity term. The default temperature stays 0.45. `forgettingRate` stays 0. `progressWindow` already exists and stays 50. `periodicBoost` stays off unless a measurement passes it.

### Preregister progress window

Hypothesis. Rho's late return under forgetting is the lag of its own learning-progress estimator, not a lag of the room's forgetting. The estimator is an EMA of surprise with time constant W. The shipped W is 50. The sweep is W = 25, 50, and 100, the half, the shipped window, and twice that window. If the hunch holds, the within-bout progress-peak lag and the occupancy onset both move later as W grows, and the half-contrast moves with them: a shorter window puts relatively more of the excess into the first half. If the peak and the onset stay put, the lag belongs to the learner or the room, not to this window.

The world is the previous entry's. Wide-door distractor, layout seed 3000, learnability 1, relevance 0, drift 0, no food, no metabolism. λ = 0.012924125031568812. Temperature 0.15. Seeds 1–200. The curve uses seed stream `seed * 10007 + 9201` and salts 8001–8005. `curveDecision` is the previous rule. If it is not `run`, no episode is run and the hunch is not confirmed and not refuted.

Harness, before a lag is a claim. The curve's learn drop, the decay-minus-held endpoint, the half-recovery, and the locked period must match `bench/phase-profile/profile.json` within 1e-9. Window 50's progress peak inside the first 80 bout steps, and the positive sum over those 80 steps at 400 steps of decay, must match that file's primary progress endpoint within 1e-9. Window 50's planted lags and projections at dose 0.05, and window 50's forgetting half-contrast and onset, must match the same file within 1e-9, and the offset calls, the sign, and the location must match exactly. A miss aborts. The runner is not the previous episode, and the sweep is not a result. The 80-step numbers are the replication. The claim uses the longer bout below.

Bout. The body is held still. Learn region 1 for 200 steps with decay off, the same transition seed as the curve. Checkpoints stay 0, 43, 86, 129, 172, 258, 344, 400. At each one the learned brain is restored, the cell net is decayed that many steps, and the baseline the progress formula actually reads is set to the learned probe. For W = 50 that baseline is `ema`. For any other W it is `progressBaseline`, which a restored brain does not carry. The bout is 240 steps, twice the longest window plus a margin, so a peak near 2W is not forced onto the last sample. Progress is the shipped update, baseline minus surprise. `peak` is the step of the largest sample. It is censored when that sample is not positive, and it is right-censored when the largest sample is the final step. A window is censored when the uncensored seeds are not a majority. The paired difference drops a seed that is censored on either window, and the pair is censored when the kept seeds are not a majority of 200. `peak80` is the same argmax restricted to the first 80 steps, with no right-censor, so it can be compared with the previous bout. It is not the call.

The call uses the 400-step checkpoint. The difference is the longer window's peak minus the shorter one's, paired on the seed. Salt 13100 is W50 minus W25. Salt 13101 is W100 minus W50. The full-bout peak interval uses salt 13000 plus the window index, 0 for 25, 1 for 50, 2 for 100. The 80-step peak at W50 uses salt 8370, the previous entry's salt. The other two 80-step peaks use salt 13020 plus the window index. The 80-step positive sums at W50 use salts 8500 plus the checkpoint index. The other windows use 14300 plus 10 times the window index plus the checkpoint index.

`boutPrediction`, from `scalePrediction`. `scales` when both differences lie entirely above 0. `fixed` when both include 0. `reversed` when either lies entirely below 0. `partial` when one lies entirely above 0 and the other includes 0. `censored` when either window or either pair is censored. The ratio of the two means, longer over shorter, is a percentile bootstrap of the paired peaks, salts 13110 and 13111. It is reported and is not a cutoff. A ratio that excludes 2 does not flip `scales`.

Positive control, before an onset is a where-claim. Same world, decay off, temperature 0.15, seeds 1–200, the locked period and episode length. Seed stream `seed * 10007 + 9501`. Dose 0.05 only. The on-half is `floor(P/2)` steps at offsets 0, round(P/4), 2× that, and 3× that. Rho is planted at each window and all four offsets. The flat arm omits the bonus and is separate for each window, because the window changes rho's policy. The other explorers are not planted again. The gate in the previous entry was rho's four offsets at this dose. Projection and lag use the previous definitions. W50 keeps salts 10040 plus the offset index for the projection and 10140 plus that index for the lag. W25 and W100 use projection salt 14000 plus 10 times the window index plus the offset index, and lag salt 14100 on the same index. `offsetCall` is the previous rule. A window's instrument is `phaseInstrumentCall` on its four offsets. The sweep's instrument is confirmed only when all three windows are confirmed. It is refuted when all three are refuted. Otherwise inconclusive.

Forgetting occupancy. Explorers random, count, surprise, RND, and rho. Rho runs at all three windows. The other four run at W50 only. A unit test locks that those four do not read the window: their occupancy checksum is identical at 25, 50, and 100. The forget arm sets `forgettingRate` to λ. The held arm omits it. Seed stream `seed * 10007 + 9401` at every window, so W50 is the previous episode and the other windows are paired with it. W50, including the baselines, keeps the previous salts: half-contrast 11000 plus the explorer index, half-period 11200 plus that index, east 11800 plus that index, bins 11600 plus 10 times the index plus the bin, onset 11400 plus the index, held-out 12000 plus the index. Rho's index is 4. W25 and W100 use half-contrast 13300 plus the window index, half-period 13500 plus the index, east 13600 plus the index, bins 13700 plus 10 times the index plus the bin, onset 13800 plus the index, held-out 13900 plus the index.

Sign is `signCall` on the half-contrast, decay minus held. Location is `locationCall` on the onset of the mean vector. Held-out projection is the previous split, seeds 1–100 freeze the angle and seeds 101–200 are scored. Existence is a negative sign or a held-out interval entirely above 0. It is how specificity is scored. It is not a second location rule.

Onset difference. The number is the longer window's onset minus the shorter one's, wrapped into (−P/2, P/2]. The bootstrap draws one seed index and uses it on both windows. Salt 13200 is W50 minus W25. Salt 13201 is W100 minus W50. The onset prediction is available only when the sweep's instrument is confirmed and no rho location is unresolved. Otherwise it is censored. `onsetPrediction` uses the same `scalePrediction` labels. `later` means the longer window's onset is later.

Half-contrast difference. The number is the shorter window's half-contrast minus the longer one's, paired on the seed. A later return makes the longer window more negative, so this difference is positive when the contrast moves with the lag. Salt 13400 is W25 minus W50. Salt 13401 is W50 minus W100. `contrastPrediction` uses `scalePrediction` and is not censored by the instrument. The half-period contrast and the east fraction are reported and are not calls.

Specificity, `specificityCall`. `confounded` when random's sign at W50 is not null. `shared` when count, surprise, or RND exists. `specific` otherwise. It does not flip the verdict. A confirmed hunch that is shared is not a learning-progress result, and the results say so.

Late pattern, per window, `latePattern`. `late` when the sign is negative and the location is delayed or half-cycle. `absent` when the sign is not negative. `unlocated` when the sign is negative and the onset is unresolved. `shifted` when the sign is negative and the location is prompt or other. Removing the late-return pattern means a window that is not `late`. That report is not a fourth prediction. The hunch can be confirmed while every window stays late, if the onset moves and remains inside the late band.

Verdict, `hunchVerdict`. `inconclusive` when the instrument is not confirmed. `confirmed` when the bout, the onset, and the contrast all scale. `refuted` when the bout and the onset are both fixed: the lag did not move with the window. `split` when the bout and the onset disagree, or when both scale and the contrast does not. Any censored, reversed, or partial prediction that is not those cases is `inconclusive`.

The sweep aborts before any call if a cycle-world episode records a meal or a death, if a random-walk checksum differs across arms that share a tag, a length, and a period, or if the harness misses.

Decision, locked before the run. Curve not `run`: report the curve and do not claim a lag. Instrument not confirmed: the planted offsets were not recovered at every window, and the verdict stays inconclusive; the bout and the contrast are still reported. `confirmed`: the peak, the onset, and the half-contrast move with the window. `refuted`: the peak and the onset stay put, so the lag is not this estimator. `split`: the progress signal and the occupancy do not move together. `inconclusive`: a censor, a reversal, or a partial step blocks the call. No policy retune and no new term in any of these. No window replaces the shipped default of 50.

Figures: `bench/window-sweep/forget-curve.png`, `bench/window-sweep/peak-vs-window.png`, `bench/window-sweep/progress-trace.png`, `bench/window-sweep/positive-onset.png`, `bench/window-sweep/half-contrast.png`, and `bench/window-sweep/phase-by-window.png`. Source: `bench/window-sweep/window.json`. The sweep is `npm run window-sweep`. It is not part of CI.

### Results

The curve and the shipped window reproduced. The planted offsets were recovered at all three windows. The progress peak moves later as the window grows. The occupancy onset does not: it is located only at the shipped window, and the half-contrast step from 50 to 100 includes 0. The verdict is inconclusive. No term was added. The window stays 50.

200 curve seeds, 600 progress bouts, and 5800 episodes, 4 workers, 1348 seconds. The bouts were 24 seconds. The episodes were 1318 seconds. Source: `bench/window-sweep/window.json`.

#### Curve. Reproduced.

λ = 0.012924125031568812. Half-recovery 86.15 [85.45, 86.85], 200 of 200 uncensored. P = 172. The episode is 1600 steps. `curveDecision` is `run`. These are the previous entry's intervals.

| check | value | call |
|---|---|---|
| learns | 0.1558 [0.1547, 0.1569] | confirmed |
| consolidates | 0.0519 [0.0513, 0.0526] | confirmed |
| forgets, decay minus held | 0.1490 [0.1485, 0.1494] | confirmed |
| interference minus held, not a gate | 0.0099 [0.0093, 0.0106] | confirmed |

Figure: `bench/window-sweep/forget-curve.png`.

#### Progress peak. Scales. Not in proportion to the window.

The call is the argmax over the 240-step bout after 400 steps of decay. A peak on the final step is dropped. One seed at W = 100 is right-censored. The other 599 peaks are inside the bout.

| window | peak step | inside the first 80, not the call |
|---|---|---|
| 25 | 60.04 [54.81, 65.73] | 44.58 [42.86, 46.28] |
| 50 | 91.82 [84.93, 99.39] | 55.26 [53.52, 57.10] |
| 100 | 133.42 [125.35, 141.69], 199 seeds | 59.13 [57.36, 60.96] |

W50 minus W25 is 31.78 [24.31, 39.54]. W100 minus W50 is 41.36 [33.12, 50.09], 199 pairs. Both lie entirely above 0. `boutPrediction` is scales.

The 80-step column at W50 is the previous entry's 55.26 [53.52, 57.10]. The harness matched it, and it matched the positive sum 1.0449. That number is the highest sample inside a bout that ends at step 79. The highest sample in the longer bout is at 91.82. The previous bout was cut before the peak. At W100 the 80-step column only moves to 59.13, while the uncapped peak is at 133. An 80-step bout cannot see this sweep.

The ratio of the means is not 2. W50 / W25 is 1.53 [1.39, 1.69]. W100 / W50 is 1.45 [1.35, 1.58]. Both exclude 2. The peak grows more slowly than the window. The preregistration does not use the ratio as a cutoff, and it does not flip `scales`.

The 80-step positive sum is still largest before any decay, at every window. At W50 the eight checkpoints are the previous entry's, from 1.5875 at 0 steps to 1.0449 at 400. At W25 they run from 1.4644 to 1.3434. At W100 they run from 1.7076 to 0.6632. That curve is not the call.

Figure: `bench/window-sweep/peak-vs-window.png`. The trace of the mean progress at the 400-step checkpoint is `bench/window-sweep/progress-trace.png`.

#### Positive control. Instrument confirmed at every window.

Temperature 0.15, decay off, period 172, dose 0.05. The lag is recovered onset minus the planted offset. Every offset at every window is delayed: the projection lies entirely above 0, and the lag lies entirely above 0 and inside a quarter period. The sweep's instrument is confirmed. W50 matches the previous entry's four lags.

| window | offset 0 | offset 43 | offset 86 | offset 129 |
|---|---|---|---|---|
| 25 | 26.93 [23.64, 30.54] | 24.67 [21.35, 28.01] | 22.83 [19.87, 25.83] | 20.71 [17.88, 23.81] |
| 50 | 25.87 [22.90, 28.91] | 22.46 [19.50, 25.43] | 20.97 [17.95, 24.20] | 22.43 [19.01, 25.88] |
| 100 | 25.03 [21.68, 28.29] | 22.33 [19.35, 25.43] | 20.42 [17.03, 23.82] | 24.53 [20.96, 28.15] |

The planted lag stays between 21 and 27 steps. It does not grow with the progress window. The response delay of a dose-0.05 wave is not the estimator's time constant. The gate is these twelve offsets. Dose 0.0085 was not re-run.

Figure: `bench/window-sweep/positive-onset.png`.

#### Occupancy. The late return stays at the shipped window only. The onset does not scale.

Temperature 0.15, decay minus held. W50 is the previous episode. Rho's half-contrast is −0.0177 [−0.0301, −0.0051]. The onset is 93.66, arc [75.45, 114.73]. The location is delayed. The held-out projection is 0.0080 [0.0009, 0.0151]. The sign is negative. `latePattern` is late. This is the previous entry's row.

| window | half-contrast | onset | location | late pattern |
|---|---|---|---|---|
| 25 | −0.0010 [−0.0137, 0.0118] | 130.55, width 142.1 | unresolved | absent |
| 50 | −0.0177 [−0.0301, −0.0051] | 93.66 [75.45, 114.73] | delayed | late |
| 100 | −0.0069 [−0.0196, 0.0052] | 80.26, width 134.8 | unresolved | absent |

W25 and W100 include 0 on the half-contrast, and their onset intervals are wider than half a period, so the onset prediction is censored. The point onsets, 130.55 then 93.66 then 80.26, do not move later as the window grows. That sequence is not a located result. `onsetPrediction` is censored.

The half-contrast does one of the two predicted steps. W25 minus W50 is 0.0167 [0.0018, 0.0319], entirely above 0. W50 minus W100 is −0.0108 [−0.0242, 0.0019], which includes 0. `contrastPrediction` is partial.

Every bin of rho's excess lies entirely above 0 at all three windows. The level shift is not the late pattern. East fraction, not a call: W25 is 0.0415 [0.0192, 0.0641], W50 is 0.0464 [0.0245, 0.0666], W100 is 0.0537 [0.0339, 0.0737]. Decay adds east-room time at every window. At W50 the eight bin means rise from 0.034 to a peak of 0.064 in the bin covering steps 129 through 150, the previous entry's profile. At W25 they sit between 0.034 and 0.047. At W100 they sit between 0.045 and 0.059. The late bump is the shipped window's.

W25 and W100 are not late. The negative half-contrast and the located late onset are gone at both. The extra east time is not. No window setting removed the occupancy increase. Two of the three removed the late-return pattern.

Half-period contrast, not a call, includes 0 at every window. W50 is −0.0067 [−0.0143, 0.0012].

Figure: `bench/window-sweep/half-contrast.png` and `bench/window-sweep/phase-by-window.png`.

#### Baselines. Specific.

Same seeds, shipped window. Random is a point mass at 0. Count, surprise, and RND include 0, and none exists on the held-out projection. `specificityCall` is specific. The intervals are the previous entry's.

| explorer | half-contrast | sign |
|---|---|---|
| random | 0.0000 [0.0000, 0.0000] | null |
| count | −0.0029 [−0.0220, 0.0152] | null |
| surprise | 0.0014 [−0.0134, 0.0170] | null |
| rnd | −0.0013 [−0.0142, 0.0106] | null |

Surprise's east fraction is still the large level shift, 0.0950 [0.0732, 0.1170], with a null half-contrast. RND's east fraction is 0.0380 [0.0170, 0.0587]. Count's east fraction includes 0, 0.0081 [−0.0020, 0.0184].

#### Verdict. Inconclusive.

`boutPrediction` is scales. `onsetPrediction` is censored. `contrastPrediction` is partial. The instrument is confirmed. `hunchVerdict` is inconclusive. The progress peak is a property of the estimator: it moves later when the window is longer, and an 80-step bout was cutting it off. The occupancy onset was not shown to follow that peak. The late-return pattern remains at W = 50, which is rho's, and it is absent at 25 and 100 without a located onset to say where the excess went. The ratios exclude a doubling. That is reported and is not a second cutoff.

`forgettingRate` stays 0. `progressWindow` omitted is still 50. `policyTemperature` omitted is still 0.45. `periodicBoost` stays off. No Loop flag was added, and none was turned on. The window is an existing option. It was not retuned. Five-seed bench, seeds 1–5, sha `3311785`, rho, transition still the only default-on flag. Field probe early 0.1222, Field probe late 0.1079, Field on-policy ema 0.1641 → 0.0704, Field foods 5.60, Field lives 0.80, Rooms foods 7.00, Rooms lives 0.40. G1 2/5, G2 5/5, S1 4/5, S2 5/5, S3 5/5, C1 5/5, C2 5/5. G1 stays on the baseline-relative probe rule and is not this claim. Source: `bench/latest.json`. Trend: `bench/history.csv`.

### Next hypothesis

Do not turn decay on, do not retune the progress window, and do not add a curiosity term. The estimator's peak moves with its window, from 60 steps at W = 25 to 92 at W = 50 to 133 at W = 100, and the growth is slower than the window. Rho's late half-contrast does not. It is present at the shipped window and absent at the two neighbours, while the east-room level shift is present at all three. The open measurement is still the count of returns that begin after the room probe has risen, decay minus held, at temperature 0.15, in the same no-food world. The doorway score at r* and at 0.3003 stays open and is not the next measurement. Field probe late is still 0.1079. A new term still has to beat its own absence on that probe.

## 2026-10-18 phase profile (America/New_York)

Written before `npm run phase-profile`. No onset, sign, or progress number from that command is in this block. The results section is filled in after the run. The five-seed bench is descriptive and is not this claim.

The previous entry's next hypothesis was a count of returns that begin after the room probe has risen. That count is not this run. The phase contrast there was rho −0.0172 [−0.0300, −0.0041] at temperature 0.15: the first half of each period of 172 was the low half. Count, surprise, RND, and random included 0. This run asks where in the period that excess sits. It adds no curiosity term. The default temperature stays 0.45. `forgettingRate` stays 0. `periodicBoost` stays off. An offset on that boost is measurement only and defaults to 0, which is the old first-half clock.

### Preregister phase profile

Hypothesis. Rho's negative half-contrast is a late return to the forgotten room, not a rejection of periodicity and not a delay shared with the other explorers. A late return has its high half starting after the first quarter of the period. The matched arm is still decay against the same rooms and the same patterns with the decay constant omitted. Count, surprise, and RND are scored with the same profile. Random is the confound check. A second, slower forgetting rate asks whether the lag is a fraction of the forgetting period or a fixed number of steps. The progress signal during a forced return is measured against decay time. That measurement tests the hunch that the signal peaks only after partial decay. It is not assumed, and it does not enter the policy.

The world, the primary decay constant, and the curve are the previous entry's. λ = 0.012924125031568812. The slow rate has twice the half-life, λ_slow = 1 − exp(−ln 2 / (2τ)), with the same τ. Seeds 1–200. The primary curve uses seed stream `seed * 10007 + 9201` and the previous salts, so it has to reproduce. The slow curve uses the same stream, so the learned weights match, and only the decay constant changes. Slow forgets uses salt 8021, slow half-recovery salt 8022, slow consolidation salt 8023. Learns and interference keep salts 8001 and 8004. `curveDecision` is the previous rule. If the primary decision is not `run`, no episode is run. The sign and the location are then not claims. If the slow decision is not `run`, the scaling call is `unavailable` and the slow occupancy is not run.

Estimator. Occupancy is the region-1 bit, taken before the move. Only complete periods are scored. Eight bins split each period. Bin b is the steps whose position inside the period falls in `[b/8, (b+1)/8)`. The Fourier coefficients C and S are the mean of the mean-centered series against cos(2πt/P) and sin(2πt/P). The peak step is atan2(S, C) × P / (2π). The onset is that peak minus P/4, wrapped into [0, P). A 50% square whose on-half starts at offset δ has onset δ. A zero vector has onset 0 and amplitude 0, and the location call treats it as unresolved. The arm difference is per seed, on the coefficients and on the bins, before the mean. The onset is the onset of the mean vector, not the mean of the onsets. Its 95% interval is a percentile bootstrap of the wrapped deviation from that onset, 2000 resamples. The signed onset wraps the same number into (−P/2, P/2].

Checked on synthetic series, as a unit test, not as the claim. A square of period 160 at offsets 0, 40, 80, and 120 recovers its onset within one step. The same square's first four bins are 1 and its last four are 0. Offset 86 of period 172 turns the first half off and the second half on. A constant has coefficients under 1e−12.

Positive control, before the location is a claim. Same world, decay off, temperature 0.15, seeds 1–200, the locked primary P and episode length. Seed stream `seed * 10007 + 9501`. The on-half is `floor(P/2)` steps starting at a planted offset. Offsets are 0, round(P/4), 2× that, and 3× that. Dose 0.05 is the gate. Dose 0.0085 is sensitivity and is not the gate. Rho is planted at both doses and all four offsets. The other explorers are planted at dose 0.05 and offset 0 only. The flat arm omits the bonus and is shared across offsets and doses. Imagined follow-ups do not receive the bonus.

For one offset, the projection is the Fourier vector dotted with the unit vector at the planted peak, which sits P/4 after the planted onset. The lag is the recovered onset minus the planted offset, wrapped into (−P/2, P/2]. Projection salt is 10000 + 10×explorer + offset index + 40×dose index. Lag salt is 10100 plus the same index. Dose index is 0 for 0.05 and 1 for 0.0085. Offset index follows the list above. Explorer index is random 0, count 1, surprise 2, RND 3, rho 4. `offsetCall` is `flipped` when the projection interval lies entirely below 0, `missed` when it does not lie entirely above 0, `distorted` when it does and the lag interval lies entirely outside ±floor(P/4), `delayed` when the lag interval lies entirely above 0, `early` when it lies entirely below 0, and `tracked` when the lag interval includes 0. `phaseInstrumentCall` is confirmed when all four rho offsets at dose 0.05 are tracked, delayed, or early. It is refuted when all four are flipped. Otherwise inconclusive.

Forgetting occupancy. Temperature 0.15. Explorers random, count, surprise, RND, rho. The forget arm sets `forgettingRate` to the rate under test. The held arm omits it. Primary seed stream `seed * 10007 + 9401`. Slow seed stream `seed * 10007 + 9701`, and only if the slow curve decision is `run`. A rho-only planted wave at dose 0.05 and offset 0, on the slow period, uses seed stream `seed * 10007 + 9801`. Its projection salt is 10300 and its lag salt is 10301.

Sign, `signCall`. The number is the first-half contrast, decay minus held, the same contrast as the previous entry. Salt 11000 + 100×rate + explorer. Rate index is 0 for the primary rate and 1 for the slow rate. Confirmed replication is an interval entirely below 0. An interval entirely above 0 is `positive`. An interval that includes 0 is `null`. The half-period contrast uses salt 11200 + 100×rate + explorer and is not a call. East fraction uses salt 11800 + 100×rate + explorer and is not a call. Bin means use salt 11600 + 100×rate + 10×explorer + bin and are the profile. Onset bootstrap salt is 11400 + 100×rate + explorer.

Held-out existence. Seeds 1–100 freeze the peak angle. Seeds 101–200 are projected onto that angle. Salt 12000 + 100×rate + explorer. The held-out interval lying entirely above 0 is existence without using the half-contrast. A run with no confirmation seed does not clear it.

Location, `locationCall`, only as a claim when the instrument is confirmed. The arc is the onset interval. `unresolved` when the amplitude is 0 or the interval is at least P/2 wide. `half-cycle` when the whole arc lies within P/8 of P/2. `delayed` when the whole arc lies within P/4 of P/2 and it is not a half-cycle. `prompt` when the whole arc lies within P/8 of 0. Otherwise `other`.

Existence for an explorer is a negative sign or a held-out interval entirely above 0.

Summary, `profileSummary`. `no-period` when the primary curve does not run. `instrument-blind` when the offset ladder is not confirmed: the sign is still reported, and the onset is not a where-claim. `confounded` when random's sign is not null. `sign-reversed` when rho's sign is positive and the held-out does not clear. `sign-null` when rho's sign is null and the held-out does not clear. `shared` when rho exists and at least one of count, surprise, and RND exists. Otherwise `replicated-half`, `replicated-delayed`, `replicated-prompt`, or `replicated-other` when the sign is negative, and the same four with the prefix `heldout` when only the held-out projection cleared. `unresolved` location is reported as `other`.

Scaling, `scaleCall`. Available only when the instrument is confirmed, the slow occupancy ran, both rho locations are not unresolved, and both rates exist. The phase difference is the slow signed-onset fraction minus the primary fraction, wrapped into (−1/2, 1/2]. The step difference is the slow signed onset minus the primary signed onset. Salt 12200. `timescale` when the phase interval includes 0 and the step interval lies entirely above 0. `fixed-lag` when the step interval includes 0 and the phase interval does not. `indistinguishable` when both include 0. `incompatible` when both exclude 0. Otherwise `unavailable`.

Excess, `excessCall`. The number is the forgetting signed onset minus the signed onset of the dose-0.05 offset-0 control on that same period. Primary salt 12300. Slow salt 12310. Certified only when the instrument is confirmed, that rate exists, its location is not unresolved, and that control offset was tracked, delayed, or early. `beyond-response` when the interval lies entirely above 0. `sooner` when it lies entirely below 0. `same-as-response` when it includes 0. Otherwise `uncertified`.

Progress hunch. Seed stream `seed * 10007 + 9601`. Learn region 1 for 200 steps with decay off, the same transition seed as the curve. Checkpoints are 0, 43, 86, 129, 172, 258, 344, 400. At each one the learned brain is restored, the cell net is decayed that many steps, and the ema is set to the learned probe. An 80-step bout then trains region 1 with no further decay. Progress is ema minus surprise, the shipped update. `positiveSum` adds the positive samples. `drop20` is the probe before the bout minus the probe after 20 steps. The peak step is censored when the largest sample is not positive. The call uses `positiveSum`. Primary salts: marginal sums 8500+index, drops 8600+index, probes 8700+index, endpoint minus start 8301, each middle checkpoint minus start 8310+index, each middle minus the endpoint 8340+index, peak step at the last checkpoint 8370. Slow salts are 8800, 8900, 9000, 8401, 8410, 8440, 8470 in that same order. `hunchCall` is `intermediate` when a middle checkpoint's interval lies entirely above both ends, `grows` when the endpoint lies entirely above the start and no middle lies entirely above the endpoint, `falls` when the endpoint lies entirely below the start and no middle lies entirely above the start, `flat` when the endpoint interval includes 0 and neither of those clearances happens, and `other` otherwise. `boutCall` at the last checkpoint is `silent` unless a majority of seeds have a positive peak, `lagged` when that peak-step interval lies entirely above 20, `immediate` when it lies entirely below 10, and `mid` otherwise.

Match, `matchCall`. Applicable only when the instrument is confirmed, the primary hunch is `intermediate`, rho exists, and the location is not unresolved. H* is the checkpoint with the highest mean positive sum. The difference is rho's signed onset minus H*, salt 12400 on the onset. `matches` when that interval includes 0. `differs` when it does not. Otherwise `not-applicable`.

The sweep aborts before any call if a cycle-world episode records a meal or a death, or if any random-walk occupancy checksum differs across arms that share a tag, a length, and a period.

Decision, locked before the run. Primary curve not `run`: report the curve and do not claim a phase. `instrument-blind`: the planted offsets were not recovered, and the where-question stays unanswered; a negative sign on the fresh seeds is still a replication of the previous contrast. `replicated-delayed` or `replicated-half`: rho's fresh-seed contrast is negative, the other directed explorers do not show it, and the high half starts late. `replicated-prompt`: the contrast is negative but the onset is the first half, so the profile is not a late square. `replicated-other`: the contrast is negative and the onset is neither late nor prompt. `heldout-*`: the half-contrast does not replicate and the held-out projection does. `shared`: the pattern is not specific to learning progress. `sign-null` or `sign-reversed`: this run does not reproduce the negative contrast. `confounded`: random moved. Scaling and the hunch are reported beside that summary and do not flip it. No policy retune and no new term in any of these.

Figures: `bench/phase-profile/forget-curve.png`, `bench/phase-profile/positive-onset.png`, `bench/phase-profile/phase-profile.png`, `bench/phase-profile/progress-decay.png`, and `bench/phase-profile/phase-profile-slow.png` only if the slow occupancy runs. Source: `bench/phase-profile/profile.json`. The sweep is `npm run phase-profile`. It is not part of CI.

### Results

The curve reproduced. The planted offsets were recovered, so the location is a claim. Rho's fresh-seed half-contrast is negative, and the fitted onset is late. The summary is replicated-delayed. The slower rate did not locate an onset, so scaling is unavailable. The progress signal is largest before any decay, so the partial-decay hunch falls. No term was added. Decay stays off.

400 curve seeds, 400 progress bouts, and 7800 episodes, 4 workers, 2961 seconds. The episode pool was 2949 seconds. Source: `bench/phase-profile/profile.json`.

#### Curve. Reproduced. The slow rate locks a longer period.

Primary λ = 0.012924125031568812. Half-recovery 86.15 [85.45, 86.85], 200 of 200 uncensored. P = 172. The episode is 1600 steps. These are the previous entry's intervals. `curveDecision` is `run`.

| check | value | call |
|---|---|---|
| learns | 0.1558 [0.1547, 0.1569] | confirmed |
| consolidates | 0.0519 [0.0513, 0.0526] | confirmed |
| forgets, decay minus held | 0.1490 [0.1485, 0.1494] | confirmed |
| interference minus held, not a gate | 0.0099 [0.0093, 0.0106] | confirmed |

Slow λ = 0.0064830776637817555, twice the half-life. The learned weights match the primary curve on every seed. Half-recovery 166.95 [166.00, 168.00], 200 of 200 uncensored. The locked half is 167. P = 334. The episode is 2672 steps. Forgets 0.1432 [0.1427, 0.1437], confirmed. Consolidation 0.0640 [0.0634, 0.0646], confirmed. `curveDecision` is `run`. The half-recovery grew by 166.95 / 86.15 = 1.94, against a half-life factor of 2.

Figure: `bench/phase-profile/forget-curve.png`.

#### Positive control. Instrument confirmed.

Temperature 0.15, decay off, period 172. The lag is recovered onset minus the planted offset. Rho at dose 0.05 is the gate. Every offset is delayed: the projection lies entirely above 0, and the lag lies entirely above 0 and inside a quarter period. `phaseInstrumentCall` is confirmed. The four lags sit between 21 and 26 steps.

| offset | projection | lag | call |
|---|---|---|---|
| 0 | 0.0248 [0.0197, 0.0296] | 25.87 [22.90, 28.91] | delayed |
| 43 | 0.0313 [0.0266, 0.0361] | 22.46 [19.50, 25.43] | delayed |
| 86 | 0.0291 [0.0240, 0.0342] | 20.97 [17.95, 24.20] | delayed |
| 129 | 0.0255 [0.0207, 0.0303] | 22.43 [19.01, 25.88] | delayed |

Dose 0.0085 is not the gate. Rho's projection clears 0 at all four offsets there too, and every lag is delayed. The lags are 24.59 [10.45, 40.71], 19.20 [6.81, 30.39], 22.28 [12.46, 31.86], and 25.32 [9.48, 40.46]. Phase recovery works at the dose the half-contrast instrument could just see. The intervals are wider than at 0.05.

At dose 0.05 and offset 0, count, surprise, and RND are delayed as well. Their lags are 18.14 [12.64, 23.26], 21.44 [17.69, 24.96], and 22.91 [19.80, 26.01]. Random's projection is a point mass at 0, so its offset is missed. The wave is on the shared progress channel. The gate is rho's four offsets.

Figure: `bench/phase-profile/positive-onset.png`.

#### Occupancy. Replicated, and the onset is late.

Temperature 0.15, fresh seeds, decay minus held. Rho's half-contrast is −0.0177 [−0.0301, −0.0051]. The sign is negative. The previous entry, on a different seed stream, was −0.0172 [−0.0300, −0.0041]. The half-period contrast includes 0, −0.0067 [−0.0143, 0.0012]. The held-out projection also clears 0, 0.0080 [0.0009, 0.0151]. Existence holds on both tests.

The onset is 93.66 steps. The deviation interval is [−18.21, 21.07], so the arc is [75.45, 114.73]. P/2 is 86. The arc includes the midpoint and runs past P/8 of it, and the whole arc stays inside P/4 of the midpoint. The location is delayed, not half-cycle and not prompt. Amplitude of the mean vector is 0.0070.

Every bin of rho's excess lies entirely above 0. The means are 0.034, 0.036, 0.036, 0.036, 0.040, 0.055, 0.064, 0.055. The highest mean is the bin covering steps 129 through 150, 0.064 [0.039, 0.090]. The first bin is 0.034 [0.010, 0.056]. The late onset is a peak on a positive level. It is not a square that is low in the first half and high in the second. Decay adds east-room time at every phase, and more of it late.

| explorer | half-contrast | onset | location | sign |
|---|---|---|---|---|
| random | 0.0000 [0.0000, 0.0000] | — | unresolved | null |
| count | −0.0029 [−0.0220, 0.0152] | width 158.8 | unresolved | null |
| surprise | 0.0014 [−0.0134, 0.0170] | width 111.3 | unresolved | null |
| rnd | −0.0013 [−0.0142, 0.0106] | 124.79, width 47.2 | other | null |
| rho | −0.0177 [−0.0301, −0.0051] | 93.66 [75.45, 114.73] | delayed | negative |

Count, surprise, and RND do not exist on either test. Random is a point mass at 0. The summary is not shared and not confounded. `profileSummary` is replicated-delayed.

East fraction, not a call. Rho 0.0464 [0.0245, 0.0666]. Surprise 0.0950 [0.0732, 0.1170]. RND 0.0380 [0.0170, 0.0587]. Count includes 0, 0.0081 [−0.0020, 0.0184]. Surprise's eight bins are all above 0 and flat, which is why its half-contrast includes 0. The level shift is real for surprise and is not phase-locked. Rho's level is smaller and it rises toward the end of the period.

The response lag at offset 0 and dose 0.05 is 25.87 [22.90, 28.91]. Rho's onset arc starts at 75.45. The two intervals do not overlap. The preregistered excess wraps the onset into (−P/2, P/2]. The point onset 93.66 is past 86, so the signed onset is −78.34, and the bootstrap straddles the cut. The excess interval is −104.21 [−111.56, 59.67]. It includes 0. The call is same-as-response. That interval is the wrap, not a measurement of 93.66 minus 25.87. The excess call does not say the forgetting peak arrives with the planted-wave delay.

Figure: `bench/phase-profile/phase-profile.png`.

#### Slow rate. The phase does not clear. Scaling is unavailable.

Temperature 0.15, period 334. Rho's half-contrast includes 0, −0.0105 [−0.0281, 0.0063]. The held-out projection includes 0, 0.0044 [−0.0042, 0.0127]. The onset point is 139.10 and the deviation interval is [−91.44, 68.51], width 159.9. The location is other. Rho does not exist on this rate, so scaling is unavailable. The printed phase difference is −0.128 [−0.416, 0.155] and the step difference is 217 [−208, 241]. Both include 0. They are not a call.

Count, surprise, and RND are null. Random is a point mass at 0. East fraction, not a call, still rises for rho, 0.0549 [0.0389, 0.0716], and for surprise, 0.1073 [0.0888, 0.1247]. The level shift survived the slower decay. The phase lock did not clear.

The slow planted wave at dose 0.05 and offset 0 is delayed. Projection 0.0430 [0.0372, 0.0488]. Lag 43.44 [38.43, 48.75]. The response lag grew with the period, from 26 steps at period 172 to 43 steps at period 334. The slow excess is uncertified because rho's slow location is not a claim. Its interval includes 0.

Figure: `bench/phase-profile/phase-profile-slow.png`.

#### Progress hunch. Falls. The within-bout peak is late at both rates.

`positiveSum` is the rectified shipped progress, ema minus surprise, over an 80-step forced return. The ema starts at the learned probe at every checkpoint. Primary:

| decay steps | positive sum |
|---|---|
| 0 | 1.5875 [1.5621, 1.6115] |
| 43 | 1.0625 [1.0412, 1.0847] |
| 86 | 0.8865 [0.8674, 0.9056] |
| 129 | 0.7983 [0.7803, 0.8169] |
| 172 | 0.8030 [0.7824, 0.8235] |
| 258 | 0.8952 [0.8752, 0.9150] |
| 344 | 0.9963 [0.9753, 1.0173] |
| 400 | 1.0449 [1.0250, 1.0647] |

The endpoint lies entirely below the start, and no middle checkpoint lies entirely above the start. `hunchCall` is falls. The signal does not peak after partial decay. It is largest when the room has not decayed. The slow rate is falls as well, and its maximum is also at 0. The match to the occupancy onset is not-applicable.

The bout at 400 steps of decay is lagged. All 200 seeds have a positive peak. The peak step is 55.26 [53.52, 57.10]. At the slow rate it is 52.45 [50.12, 54.72], also lagged, 200 of 200. The within-visit delay sits on the 50-step progress window and does not grow when the forgetting half-life doubles.

The 20-step probe drop is not the call. It is 0.0010 [0.0005, 0.0015] at 0 steps of decay, 0.1055 [0.1051, 0.1060] at 172, and 0.0606 [0.0597, 0.0616] at 400. The weight-level error reduction is small on a room that was just learned, larger after a period of decay, and smaller again at 400. That curve is not a confirmation of the hunch. The hunch was the progress signal, and the signal falls.

Figure: `bench/phase-profile/progress-decay.png`.

`cycleWorld` and `periodicBoost` stay off. The offset on that boost defaults to 0. `forgettingRate` stays 0. `policyTemperature` omitted is still 0.45. No Loop flag was added, and none was turned on. The phase profile is computed after the episode. It does not enter the score. Five-seed bench, seeds 1–5, sha `9a4efa9`, rho, transition still the only default-on flag. Field probe early 0.1222, Field probe late 0.1079, Field on-policy ema 0.1641 → 0.0704, Field foods 5.60, Field lives 0.80, Rooms foods 7.00, Rooms lives 0.40. G1 2/5, G2 5/5, S1 4/5, S2 5/5, S3 5/5, C1 5/5, C2 5/5. G1 stays on the baseline-relative probe rule and is not this claim. Source: `bench/latest.json`. Trend: `bench/history.csv`.

### Next hypothesis

Do not turn decay on, and do not add a curiosity term. The fresh seeds replicate rho's negative half-contrast, and the fitted onset is late, on a level that is already positive in the first bin. The slower forgetting rate did not clear a phase, so the lag is not shown to scale, and it is not shown to be a fixed number of steps. The shipped progress signal falls as the room decays, and the within-visit peak sits near 55 steps at both rates. The open measurement is the count of returns that begin after the room probe has risen, decay minus held, at temperature 0.15, in the same no-food world. The doorway score at r* and at 0.3003 stays open and is not the next measurement. Field probe late is still 0.1079. A new term still has to beat its own absence on that probe.

## 2026-10-18 phase-locked cycles (America/New_York)

Written before `npm run cycle-phase`. No phase contrast from that command is in this block. The results section is filled in after the run. The five-seed bench is descriptive and is not this claim.

The previous entry's next hypothesis was a count of returns that begin after the room probe has risen. That count is not this run. The cycle question was left inconclusive because the instrument failed its positive control, not because decay was shown to be arrhythmic. This run is the second pass on that instrument. It adds no curiosity term. The default temperature stays 0.45. `forgettingRate` stays 0 unless a measurement passes it. `periodicBoost` stays off unless a measurement passes it.

### Preregister phase contrast

Hypothesis. The autocorrelation shape failed because a slow occupancy change is positive at every lag inside an episode, including the opposite phase. A cycle at the forgetting period is a difference between the two halves of that period. The matched arm is still decay against the same rooms and the same patterns with the decay constant omitted. Count, surprise, and RND are scored with the same shape. Random is the confound check.

Checked before this registration, on synthetic series, not as the claim. `acfAt` already subtracts the series mean, so a constant level does not move it. A ramp from 0.1 to 0.5 across nine periods of length 172 has autocorrelation above 0.5 at lag 172 and at lag 86. The same ramp's phase contrasts both sit inside ±0.05. A 50% square wave of period 172 has on-half contrast 1 and half-period contrast 0. A square wave of period 86 swaps those two numbers. Linear detrending removes a pure ramp and does not separate a level change of a sticky series from a cycle: both lags stay positive. Subtracting each period's own mean turns the ramp into a sawtooth that passes the old shape test. That estimator is rejected. The instrument is the phase contrast.

The world, the decay constant, the curve, and the period lock are the previous entry's. λ = 0.012924125031568812. Seeds 1–200. Curve seed stream `seed * 10007 + 9201`. The same four curve calls, the same salts 8001–8005, and the same `curveDecision`. If the decision is not `run`, the sweep stops. The prediction that rho cycles is then not confirmed and not refuted. No curiosity term is added to manufacture a cycle.

Instrument. Occupancy is the region-1 bit, taken before the move. The fundamental contrast is the mean of that bit on the planted on-half minus the mean on the off-half. The on-half is the first half of each period, the same clock as `periodicBoostOn`. Only complete periods are scored. A tail shorter than one period is dropped, so an unfinished cycle cannot move the contrast. The half-period contrast uses the same prefix. It is high on the first and third quarters of the planted clock and low on the second and fourth. A 50% square wave of period P is orthogonal to that template. Its half-period contrast is 0, not negative. The old shape test asked for a negative autocorrelation at lag P/2. A square wave has that negative lag correlation, and the agent's series did not, because the slow component dominated the lag. This test does not ask the half-period template to go negative.

Shape, `phaseShapeCall`. The number is the arm difference, paired on the seed. Confirmed when the fundamental interval lies entirely above 0 and the half-period interval does not. Refuted when the fundamental interval lies entirely below 0. Otherwise inconclusive. An interval that lies entirely above 0 at both templates is the failure this instrument exists to avoid. It does not confirm.

Positive control, before any decay episode. Same world, decay off, temperature 0.15, seeds 1–200, the locked P and the locked episode length. Seed stream `seed * 10007 + 9301`. Doses 0.0085, 0.0169, 0.05, 0.15, 0.5. The bonus is added to the progress channel of actions whose real destination is region 1, during the on-half, and nowhere during the off-half. The flat arm omits the option. Explorers random, count, surprise, RND, rho. Shape is boosted minus flat. Fundamental salts are 8800 + 10 × explorer + dose. Half-period salts are 8900 + 10 × explorer + dose. Dose index follows the ladder above, 0 through 4. Explorer index is random 0, count 1, surprise 2, RND 3, rho 4. East-room fraction uses salt 9000 + 10 × explorer + dose and is not a call. Autocorrelation at P and at P/2 is reported with salts 7600 and 7700 on the same index and is not a call. `instrumentCall` is confirmed when rho's phase shape is confirmed at one or more doses. The smallest such dose is the detection threshold. The fundamental contrast at that dose is the sensitivity, in the same units as the forgetting contrast. It is the bar a forgetting interval has to clear in the sense that an interval which includes 0 did not pass the test the ladder used. It is not a second cutoff taken from that dose's mean.

`instrumentCall` refuted, or inconclusive, stops the sweep. The summary is instrument-blind. Rho's cycle is not confirmed and not refuted. The occupancy comparison is not run.

Forgetting occupancy runs only when the instrument is confirmed. Explorers, seeds, steps, and P are the locked ones. Temperature 0.15 is the call. The forget arm sets `forgettingRate` to λ. The held arm omits it. Seed stream `seed * 10007 + 9101`. Fundamental salt 9600 + explorer. Half salt 9700 + explorer. East fraction uses salt 8700 + explorer and is not a call. Autocorrelation uses salts 8100 and 8200 and is not a call. The same seeds at temperature 0.45 use fundamental salt 9800 + explorer, half salt 9900 + explorer, east salt 8710 + explorer, autocorrelation salts 8500 and 8600. Temperature 0.45 cannot confirm, refute, confound, or blind the summary.

Summary, from `cycleSummary`, after the occupancy run. Instrument-blind when the positive control is not confirmed. Confounded when random's phase shape is confirmed or refuted. Confirmed when rho's phase shape is confirmed and count, surprise, and RND are not. Shared when rho's shape is confirmed and at least one of those three is confirmed. Refuted when rho's phase shape is refuted. Otherwise inconclusive. The call is that shape. A forgetting contrast smaller than the detecting dose's contrast, whose interval still lies entirely above 0 and whose half-period interval does not, is confirmed: it cleared the same test. The two contrasts are reported side by side.

The sweep aborts before any call if a cycle-world episode records a meal or a death, or if any random-walk occupancy checksum, meal count, or life count differs across the forget and held arms, or across the flat arm and a dose.

Decision, locked before the run. Curve not `run`: report the curve and do not claim a cycle. `instrument-blind`: the planted wave was not seen, and the cycle question stays unanswered. `confirmed`: rho cycles at the forgetting period and the other directed explorers do not. `shared`: the cycle is there and it is not a learning-progress result. `refuted`: decay lowers the planted-phase contrast. `inconclusive` or `confounded`: the occupancy test does not answer it. No policy retune and no new term in any of these.

Figures: `bench/cycle-phase/forget-curve.png`, `bench/cycle-phase/positive-phase.png`, and, only if the instrument passes, `bench/cycle-phase/phase-by-explorer.png`. Source: `bench/cycle-phase/cycle.json`. The sweep is `npm run cycle-phase`. It is not part of CI.

### Results

The curve reproduced. The planted wave passed the phase shape at every dose, so the occupancy run was allowed. Rho's decay-minus-held contrast lies entirely below 0. The summary is refuted. Decay stays off. No term was added.

10200 episodes, 4 workers, 2094 seconds. The curve was 7.0 seconds. The planted wave was 6000 episodes and 1255 seconds. The forgetting comparison was 4000 episodes and 831 seconds. Source: `bench/cycle-phase/cycle.json`.

#### Curve. Reproduced.

λ = 0.012924125031568812. Half-recovery 86.15 [85.45, 86.85], 200 of 200 uncensored. P = 172. The episode is 1600 steps. Phase contrasts use the first 1548, nine complete periods. `curveDecision` is `run`.

| check | value | call |
|---|---|---|
| learns | 0.1558 [0.1547, 0.1569] | confirmed |
| consolidates | 0.0519 [0.0513, 0.0526] | confirmed |
| forgets, decay minus held | 0.1490 [0.1485, 0.1494] | confirmed |
| interference minus held, not a gate | 0.0099 [0.0093, 0.0106] | confirmed |

These are the previous entry's intervals, same salts. Figure: `bench/cycle-phase/forget-curve.png`.

#### Positive control. Instrument confirmed. Threshold 0.0085.

Temperature 0.15, decay off, period 172. Excess is the square wave minus the flat arm. Rho's phase shape is confirmed at all five doses. The half-period interval includes 0 at every dose, so the wave is not also an in-phase cycle at P/2. `instrumentCall` is confirmed. The detection threshold is 0.0085. The sensitivity at that dose is 0.0146 [0.0038, 0.0246].

| dose | phase excess | half excess | shape | autocorrelation at P, not a call |
|---|---|---|---|---|
| 0.0085 | 0.0146 [0.0038, 0.0246] | 0.0013 [−0.0063, 0.0086] | confirmed | 0.0067 [−0.0147, 0.0281] |
| 0.0169 | 0.0268 [0.0143, 0.0392] | 0.0044 [−0.0026, 0.0115] | confirmed | 0.0141 [−0.0097, 0.0381] |
| 0.05 | 0.0668 [0.0529, 0.0812] | 0.0048 [−0.0030, 0.0127] | confirmed | 0.0732 [0.0471, 0.1000] |
| 0.15 | 0.1025 [0.0879, 0.1166] | 0.0043 [−0.0038, 0.0120] | confirmed | 0.0872 [0.0606, 0.1127] |
| 0.5 | 0.1080 [0.0941, 0.1216] | 0.0049 [−0.0029, 0.0124] | confirmed | 0.0894 [0.0591, 0.1203] |

The autocorrelation means at 0.05 and 0.15 are the previous entry's, 0.0732 and 0.0539, then 0.0872 and 0.0669. Both lags are still positive there, so the old shape is still inconclusive on the episodes where the phase shape is confirmed. At 0.0085 the autocorrelation interval includes 0 at both lags. The phase contrast does not.

Random is a point mass at 0 on every dose. Count, surprise, and RND confirm the phase shape at 0.05 and at 0.15. The wave is on the shared progress channel. Surprise at 0.5 is the one directed row whose half-period interval lies entirely above 0, 0.0110 [0.0010, 0.0208], so that shape is inconclusive: a large dose can write the second harmonic. Rho's half interval never does. East fraction, not a call, rises with dose. Rho is 0.1323 [0.1130, 0.1516] at 0.05 and 0.2056 [0.1832, 0.2292] at 0.15. The level is larger than the phase contrast. The contrast is what the shape uses.

Figure: `bench/cycle-phase/positive-phase.png`.

#### Occupancy. Refuted.

Temperature 0.15 is the call. Excess is decay minus held. Rho's phase interval lies entirely below 0. The half-period interval includes 0. The shape is refuted. Count, surprise, and RND include 0. Random is a point mass at 0, so the summary is not confounded. `cycleSummary` is refuted.

| explorer | phase excess | half excess | shape |
|---|---|---|---|
| random | 0.0000 [0.0000, 0.0000] | 0.0000 [0.0000, 0.0000] | inconclusive |
| count | 0.0096 [−0.0082, 0.0280] | 0.0007 [−0.0104, 0.0119] | inconclusive |
| surprise | −0.0088 [−0.0252, 0.0080] | −0.0037 [−0.0130, 0.0053] | inconclusive |
| rnd | −0.0013 [−0.0134, 0.0110] | 0.0004 [−0.0066, 0.0075] | inconclusive |
| rho | −0.0172 [−0.0300, −0.0041] | −0.0005 [−0.0080, 0.0068] | refuted |

The threshold dose produced +0.0146 [0.0038, 0.0246]. Rho's forgetting contrast is −0.0172 [−0.0300, −0.0041]. The interval lies entirely below 0, and the absolute mean is larger than the smallest planted effect the instrument confirmed. This is not a miss under the bar. The sign is the opposite of the planted on-half.

East fraction, not a call, reproduces the previous entry. Rho 0.0548 [0.0352, 0.0753], surprise 0.1096 [0.0860, 0.1323], count 0.0202 [0.0107, 0.0290], RND 0.0180 [−0.0025, 0.0400]. A linear rise of 0.0548 across 1600 steps shifts the on-half against the off-half by about −0.0548 × 86 / 1600 = −0.0029. The contrast is −0.0172. A ramp of that level does not account for it. The half-period contrast includes 0, so the negative fundamental is not a cycle at P/2. It is more east time in the second half of each period of 172 than in the first. The locked rule calls that refuted: the first half is not the high half. The autocorrelation shape on these same episodes is still inconclusive for rho, −0.0186 [−0.0476, 0.0113] at P and −0.0022 [−0.0313, 0.0286] at P/2, the previous entry's intervals.

Temperature 0.45 is not the call. Rho's phase excess includes 0, −0.0016 [−0.0114, 0.0077]. Rho's east fraction includes 0, 0.0124 [−0.0052, 0.0317]. RND's phase excess lies entirely below 0, −0.0114 [−0.0208, −0.0021], and its half excess does too, −0.0064 [−0.0124, −0.0011]. That shape is refuted and cannot change the summary.

Figure: `bench/cycle-phase/phase-by-explorer.png`.

`cycleWorld` and `periodicBoost` stay off unless a measurement passes them. `forgettingRate` stays 0. `policyTemperature` omitted is still 0.45. No Loop flag was added, and none was turned on. The phase contrast is computed after the episode. It does not enter the score. Five-seed bench, seeds 1–5, sha `66152a2`, rho, transition still the only default-on flag. Field probe early 0.1222, Field probe late 0.1079, Field on-policy ema 0.1641 → 0.0704, Field foods 5.60, Field lives 0.80, Rooms foods 7.00, Rooms lives 0.40. G1 2/5, G2 5/5, S1 4/5, S2 5/5, S3 5/5, C1 5/5, C2 5/5. G1 stays on the baseline-relative probe rule and is not this claim. Source: `bench/latest.json`. Trend: `bench/history.csv`.

### Next hypothesis

Do not turn decay on, and do not add a curiosity term. The phase-locked contrast refutes a cycle whose high half is the first half of each period of 172. Flipping the template is not a second look at that claim. The open measurement is the count of returns that begin after the room probe has risen, decay minus held, at temperature 0.15, in the same no-food world. The doorway score at r* and at 0.3003 stays open and is not the next measurement. Field probe late is still 0.1079. A new term still has to beat its own absence on that probe.

## 2026-10-18 forgetting cycles (America/New_York)

Written before `npm run cycle`. No probe, half-recovery, or autocorrelation from that command is in this block. The results section is filled in after the run. The five-seed bench is descriptive and is not this claim.

The temperature entry's next hypothesis was the doorway score at r* and at 0.3003. That comparison is not this run. Priorities 1 and 2 are done: the drift gap sits on the dose curve, and temperature 0.15 is the instrument. This run is priority 3, the forgetting-driven revisitation question those entries left open. It adds no curiosity term. The default temperature stays 0.45. `forgettingRate` stays 0 unless a measurement passes it.

The 2026-10-15 forgetting sweep is not evidence about cycles. It put food in both rooms, decayed weights on every step, and took the spectral peak anywhere between 20 steps and half the episode. Occupancy was sticky. The autocorrelation peak sat on the lag floor. The periods were low-frequency wander. There was no matched arm with forgetting removed, and no planted period to show the metric could see a cycle. This run changes that design. It does not repeat the slope test.

### Preregister forgetting cycles

Hypothesis. Once a room is learned, rho's progress falls and rho leaves. If the cell net forgets that room while the body is away, progress is available again on return, and rho's occupancy cycles at the forgetting period. The matched arm is the same rooms, the same patterns, and the same novelty, with the decay constant omitted. Count, surprise, and RND are scored with the same shape. Random is the confound check. A cycle that those three also show is not specific to learning progress.

The world is the wide-door distractor, layout seed 3000, learnability 1, relevance 0, drift 0. West is the fixed stripe pattern. East is a block pattern, latent 256, so the two rooms are not the same stripes shifted by a cell. `cycleWorld` is measurement only. It places no food, does not eat, and does not drain energy. A death every hundred steps, or a meal that respawns, would impose its own period. Omitted, the historical maps are unchanged. Both arms use this world. The option is not a Loop flag. The default agent does not change, so the probe gate is not the keep rule.

The decay constant is locked from the wide-door adaptation time, τ = 53.28471423768756. λ = 1 − exp(−ln 2 / τ) = 0.012924125031568812. One half-life of absence is one adaptation time. No other rate is run.

Instrument, before any occupancy episode. Seeds 1–200. The seed stream is `seed * 10007 + 9201`. Scent is zero. The body does not move. Each step is one uniform transition, cell learning rate 4, the same pair the adaptation curve uses. The probe is region 1, 24 states, probe seed 20261018, wall and food channels only. Age stays 0, so the states do not move.

Learn for 200 steps on region 1 with decay off. Away for 400 steps. The away probe is recorded at steps 0, 10, 20, …, 400. Three away arms fork from the learned weights:

- held: no training, no decay
- decay: no training, multiply the cell-net weights by 1 − λ each step
- interference: train only on region 0, no decay

A fourth run learns region 1 for 200 steps with decay on, from the same initial weights and the same transitions as the decay-off learn. That is the consolidation check. It is not an away arm.

Calls. Paired 95% percentile bootstrap, 2000 resamples. `learns` is probe at step 0 minus probe at step 200 with decay off, salt 8001. Confirmed when the interval lies entirely above 0. `consolidates` is the per-seed midpoint (step 0 + step 200, decay off) / 2, minus the decay-on endpoint, salt 8002. Confirmed when that interval lies entirely above 0: decay during learning still finishes in the better half of the drop. `forgets` is the decay-away endpoint minus the held-away endpoint, salt 8003. Confirmed when the interval lies entirely above 0. Interference uses the same subtraction against held, salt 8004. It is reported and is not a gate. The λ = 0 policy still trains whichever room it stands in.

Half-recovery. On one seed, the target is half the learn drop, 0.5 × (probe at 0 − probe at 200). A target below 0.01 is censored. H is the first probed away step where the decay probe minus the held probe reaches that target. A seed that never reaches it inside 400 steps is censored. A majority must be uncensored. The locked half-period is round(mean H). It has to sit in [20, 400]. 20 is the old lag floor and is shorter than a crossing of this map. The period P is twice that half. The episode is min(4800, max(1600, 8P)) steps, and it has to cover at least 4P. Otherwise the period is censored.

`curveDecision` stops before any occupancy episode when learning is not confirmed (`no-learning`), consolidation is not confirmed (`no-consolidation`), forgetting is not confirmed (`no-forgetting`), or the period is censored (`period-censored`). The forgetting curve is the result in those four cases. The prediction that rho cycles is then not confirmed, and it is not refuted by an occupancy test the learner could not have fed. No curiosity term is added to manufacture a cycle.

Occupancy, only when the decision is `run`. Seeds 1–200. Explorers random, count, surprise, RND, rho. Steps and P are the locked ones. Temperature 0.15. The forget arm sets `forgettingRate` to λ. The held arm omits it. The seed stream is `seed * 10007 + 9101`. The same seeds at temperature 0.45 are reported and are not this call.

Primary metric. Autocorrelation of the region-1 bit, one bit per step, taken before the move, at lag P and at lag P/2. The definition is the sum of mean-centered products over n − lag, divided by the sum of squared deviations of the whole series. A flat series is 0. The period excess is forget minus held. The half excess is the same at P/2. Salts 8100 + explorer and 8200 + explorer. Explorer index is random 0, count 1, surprise 2, RND 3, rho 4.

Shape, `cycleShapeCall`. Confirmed when the period excess lies entirely above 0 and the half excess lies entirely below 0. That is a cycle: more correlation at P, less at the opposite phase. Refuted when the period excess lies entirely below 0. Otherwise inconclusive. A high value at both lags is stickiness, and it does not confirm.

Positive control, same world, decay off, temperature 0.15, seeds 1–200, the same P and the same episode length. The seed stream is `seed * 10007 + 9301`. Doses 0.05 and 0.15, the two doses at which rho's occupancy already clears at this temperature under a constant place bonus. The bonus is added to the progress channel of actions whose real destination is region 1, during the first half of each period, and nowhere during the second half. Imagined follow-ups do not receive it. The flat arm omits the option. Shape uses the same rule, periodic minus flat. Period salts are 8300 + 10 × explorer + dose. Half salts are 8400 + 10 × explorer + dose. Dose index is 0 for 0.05 and 1 for 0.15. `instrumentCall` is confirmed when rho's shape is confirmed at either dose. The smallest such dose is the calibrated threshold in the dose list. The autocorrelation excess at that dose is the effect a planted cycle produces, in the same units as the forgetting excess. It is the sensitivity report. It is not a second bar the forgetting excess has to clear.

Summary, from `cycleSummary`, after the occupancy run. Instrument-blind when the positive control is not confirmed: a null is then the metric, not a result about rho. Confounded when random's shape is confirmed or refuted. Confirmed when rho's shape is confirmed and count, surprise, and RND are not. Shared when rho's shape is confirmed and at least one of those three is confirmed: the cycle is real and it is not specific to learning progress. Refuted when rho's shape is refuted. Otherwise inconclusive.

The sweep aborts before any call if a cycle-world episode records a meal or a death, or if any random-walk occupancy checksum, meal count, or life count differs across the forget and held arms, or across the flat arm and a dose. Checksum is the occupancy bits folded with multiplier 33.

Temperature 0.45 reuses the shape rule. Period salt 8500 + explorer. Half salt 8600 + explorer. It cannot confirm, refute, or blind the summary.

Decision, locked before the run. `no-learning`, `no-consolidation`, `no-forgetting`, or `period-censored`: report the curve and do not claim a cycle. `confirmed`: rho cycles at the forgetting period and the other directed explorers do not. `shared`: the cycle is there and it is not a learning-progress result. `refuted`: decay lowers correlation at that period. `instrument-blind` or `inconclusive` or `confounded`: the occupancy test does not answer it. No policy retune and no new term in any of these.

Figures: `bench/cycle/forget-curve.png`, `bench/cycle/acf-by-explorer.png`, `bench/cycle/positive-acf.png`. The curve is region-1 probe error against away time. The other two are the autocorrelation excesses. Source: `bench/cycle/cycle.json`. The sweep is `npm run cycle`. It is not part of CI.

### Results

The curve let the occupancy run. The planted square wave did not produce the anti-phase the shape requires, so the summary is instrument-blind. Rho's cycle is not confirmed and not refuted. The learner does forget a room it is not training, and it still consolidates while it trains. No term was added. Decay stays off.

7000 occupancy episodes and 200 curve seeds, 4 workers, 1538 seconds. The curve was 7.4 seconds. Source: `bench/cycle/cycle.json`.

#### Curve. Forgetting confirmed. Consolidation confirmed.

λ = 0.012924125031568812. Region-1 probe, 24 states, 200 seeds. The learn drop is step 0 minus step 200 with decay off. The consolidation gap is the per-seed midpoint of that drop minus the endpoint of the same 200 steps with decay on. The away gaps are the step-400 probe minus the held arm.

| check | value | call |
|---|---|---|
| learns | 0.1558 [0.1547, 0.1569] | confirmed |
| consolidates | 0.0519 [0.0513, 0.0526] | confirmed |
| forgets, decay minus held | 0.1490 [0.1485, 0.1494] | confirmed |
| interference minus held, not a gate | 0.0099 [0.0093, 0.0106] | confirmed |

Endpoints. Step 0 is 0.2566. Decay off ends at 0.1008, and the held arm is still 0.1008 after 400 steps of doing nothing. Decay on during learning ends at 0.1268, below the midpoint. Decay with no training ends at 0.2498, back at the prior. Training the other room, with no decay, ends at 0.1108. Interference is real and about fifteen times smaller than the decay rise. The λ = 0 arm does not forget the room by capacity.

Half-recovery is 86.15 steps [85.45, 86.85], 200 of 200 seeds uncensored. The locked half is 86. P = 172. The episode is 1600 steps, nine periods. `curveDecision` is `run`.

Figure: `bench/cycle/forget-curve.png`.

#### Positive control. Instrument inconclusive.

Temperature 0.15, decay off, period 172. Autocorrelation excess is the square wave minus the flat arm. Rho's period excess lies entirely above 0 at both doses. The half-period excess also lies entirely above 0. A cycle would have put the half below 0. The shape is inconclusive at both doses. `instrumentCall` is inconclusive. No dose is detected. The occupancy test does not get to confirm a cycle.

| dose | period excess | half excess | shape |
|---|---|---|---|
| 0.05 | 0.0732 [0.0466, 0.1016] | 0.0539 [0.0254, 0.0833] | inconclusive |
| 0.15 | 0.0872 [0.0590, 0.1136] | 0.0669 [0.0354, 0.0967] | inconclusive |

The other explorers match that sign. At 0.15, surprise's period excess is 0.1188 [0.0905, 0.1462] and its half excess is 0.0481 [0.0150, 0.0809]. Count's period excess is 0.0715 [0.0479, 0.0957] and its half includes 0. RND's period excess is 0.0730 [0.0406, 0.1030] and its half is 0.0735 [0.0432, 0.1027]. Random is 0 at both lags and both doses. The wave makes the series stickier. It does not alternate.

Figure: `bench/cycle/positive-acf.png`.

#### Occupancy. Instrument-blind.

Temperature 0.15 is the call. Excess is decay minus held. The summary is instrument-blind. Rho's shape is inconclusive. Surprise's period excess lies entirely below 0, so its shape is refuted, and that refutation is not the summary: the planted wave did not certify the shape. Count and RND are inconclusive. Random is a point mass at 0, so the summary is not confounded.

| explorer | period excess | half excess | shape |
|---|---|---|---|
| random | 0.0000 [0.0000, 0.0000] | 0.0000 [0.0000, 0.0000] | inconclusive |
| count | 0.0030 [−0.0195, 0.0264] | 0.0029 [−0.0196, 0.0237] | inconclusive |
| surprise | −0.0463 [−0.0730, −0.0178] | 0.0132 [−0.0189, 0.0444] | refuted |
| rnd | 0.0087 [−0.0184, 0.0368] | 0.0091 [−0.0166, 0.0364] | inconclusive |
| rho | −0.0186 [−0.0476, 0.0113] | −0.0022 [−0.0313, 0.0286] | inconclusive |

East-room fraction, decay minus held, is not a call. At 0.15, rho is 0.0548 [0.0352, 0.0753], surprise is 0.1096 [0.0860, 0.1323], and count is 0.0202 [0.0107, 0.0290]. RND includes 0, 0.0180 [−0.0025, 0.0400]. Decay moves time in the room. It does not move it periodically. The level shift is largest for surprise, which scores the error the decay creates, and rho's shift is smaller. Neither is the shape.

Temperature 0.45 is not the call. Every shape is inconclusive. Rho's period excess is 0.0135 [−0.0118, 0.0382] and its half excess is 0.0173 [−0.0073, 0.0412]. Rho's east fraction includes 0, 0.0124 [−0.0052, 0.0317]. Surprise's east fraction is 0.0219 [0.0005, 0.0440]. The colder temperature is what made rho's level shift visible. It did not make a cycle.

Figure: `bench/cycle/acf-by-explorer.png`.

`cycleWorld` and `periodicBoost` stay off unless a measurement passes them. `forgettingRate` stays 0. `policyTemperature` omitted is still 0.45. No Loop flag was added, and none was turned on. The transition probe gate was run again because `kernel.ts` is on the mechanism list. It still passes: off − on 0.1234 [0.1150, 0.1307]. It was not this claim. Five-seed bench, seeds 1–5, sha `7772b50`, rho, transition still the only default-on flag. Field probe early 0.1222, Field probe late 0.1079, Field on-policy ema 0.1641 → 0.0704, Field foods 5.60, Field lives 0.80, Rooms foods 7.00, Rooms lives 0.40. G1 2/5, G2 5/5, S1 4/5, S2 5/5, S3 5/5, C1 5/5, C2 5/5. G1 stays on the baseline-relative probe rule and is not this claim. Source: `bench/latest.json`. Trend: `bench/history.csv`.

### Next hypothesis

Do not turn decay on, and do not add a curiosity term. The cell net forgets a room it is not training, on an 86-step half-recovery, and a planted square wave of period 172 does not write an anti-phase into occupancy. Rho's autocorrelation at that period, decay minus held, includes 0. The open measurement is a count of returns that begin after the room probe has risen, decay minus held, at temperature 0.15, with the same no-food world. The doorway score at r* and at 0.3003 stays open and is not the next measurement. Field probe late is still 0.1079. A new term still has to beat its own absence on that probe.

## 2026-10-17 policy temperature (America/New_York)

Written before `npm run sharp`. No occupancy excess from that command is in this block. The results section is filled in after the run. The five-seed bench is descriptive and is not this claim.

The drift-progress entry's next hypothesis was the doorway score, drift minus held, at r* only. That comparison is not this run. PR #12 put rho's rectified-progress gap at −0.0109 [−0.0125, −0.0093], entirely below the 0.0169 dose where rho's occupancy did not move. The dose curve still says rho first moves at 0.05. Gaps of about 0.0085 to 0.017 are below the instrument. This run raises that instrument. It adds no curiosity term.

### Preregister policy temperature

Hypothesis. A colder softmax converts a progress-channel bonus of 0.0169 into more time in the boosted room than the shipped temperature does. The paired gain, rho's occupancy excess at 0.15 minus the same excess at 0.45, lies entirely above 0.

The lever is temperature, not a longer episode and not more seeds. PR #11 already separated the logits at the doses the occupancy missed. Rho's score gap, boosted minus control, was 0.0213 [0.0094, 0.0320] at 0.0085 and 0.0525 [0.0367, 0.0694] at 0.0169. Occupancy at those doses included 0. The dose that occupancy detected, 0.05, had a score gap of 0.1051, which at temperature 0.45 is a logit shift of 0.233. The 0.0169 score gap is a logit shift of 0.117 at that temperature. Dividing the temperature by 3, to 0.15, puts that shift at 0.35, above the shift that moved occupancy by 0.077. The softmax floor is 0.05, so 0.15 is three times the floor and is not the clamp.

More seeds would shrink the interval around the existing excess of 0.0126 [−0.0039, 0.0291]. The half-width is about 0.016. That can, at best, resolve an occupancy shift of a point. It does not change the softmax that failed to express a score gap the interval already put above 0. A longer episode does the same to a time average. The failure is the conversion of score into time. One temperature is the mechanism. A colder value is not a second arm in this run.

The option is `policyTemperature` on `Kernel`. Omitted, the shipped value is 0.45. It is not a Loop flag. The default agent does not change, so the probe gate is not the keep rule. Both curiosity terms stay on. The place bonus stays off except inside the dose-response. No explorer is retuned. Field probe late from `npm run bench:json`, seeds 1–5, is reported in the results and is not a pass bit. G1 stays on the baseline-relative probe rule and is not this claim.

Ablation. Rho only, on the PR #11 episode: layout seed 3000, wide door, region 1 on the east, held low-frequency pattern, learnability 1, relevance 0, drift 0, 400 steps, seeds 1–200, seed stream `seed * 10007 + 8101`. Adds 0 and 0.0169. Temperatures 0.45 and 0.15. Excess at a temperature is the boosted target-room fraction minus the control fraction, one number per seed. The gain is the 0.15 excess minus the 0.45 excess. Paired 95% percentile bootstrap, 2000 resamples, salt 7001. The shipped excess uses salt 7002 and the sharp excess uses salt 7003. They are not the keep rule. The score-gap gain, same subtraction, salt 7004, is not a call. `beats` is `greaterCall` on the occupancy gain.

Safety, Field, rho, 280 steps, seeds 1–20. The same seeds at both temperatures. Probe late and lives are sharp minus shipped. Salts 7011 and 7012. Foods use salt 7013 and are not a call. A hurt is a paired interval that lies entirely above 0: probe error rose, or lives rose. G2 is the adjacent-food scenario at the temperature under test, curiosity 0, goal 2, energy 20, food one cell east, seeds 1–20. The canonical G2 test still forces temperature 0.04 and is not this contrast. C2 is the Field branching band on those 20 seeds. G2 or C2 is hurt when the shipped temperature holds a majority and the sharp temperature does not. `sharpVerdict` keeps the instrument only when `beats` is confirmed and none of the four hurts fire. Otherwise the option stays off and parts (a) and (b) are not run.

Harness, not a call. Random does not read the temperature. On this episode its mean target-room fraction, seeds 1–200, add 0, is 0.15796249999999998 at both temperatures. A difference beyond 1e-12, or a per-seed difference, aborts before `sharpVerdict`. The sweep is `npm run sharp`. It is not part of CI.

### Preregister sharp dose response

Runs only if `sharpVerdict` keeps the temperature. The same place-bonus grid as PR #11, at temperature 0.15 instead of 0.45. Doses 0.0085, 0.0169, 0.05, 0.15, 0.5, 2. Explorers random, count, surprise, RND, rho. Seeds 1–200. Steps 400. The control arm is add 0 at temperature 0.15, not the shipped temperature. Excess salts stay `6000 + 10 × explorer + dose`. Score salts stay `6100 + 10 × explorer + dose`. Calls stay `greaterCall`. The detection threshold is `smallestDetecting`. The summary is `boostSummary` against the gap 0.0169 and the far dose 0.15.

Hypothesis. Rho's detection threshold at temperature 0.15 is at or below 0.0169. `sensitivityCall` confirms when the threshold is 0.0085 or 0.0169. It refutes when the threshold is null or greater than 0.0169. There is no third label. The other explorers' thresholds are reported and are not this call.

Harness, not a call. Random's mean target-room fraction at add 0 is still 0.15796249999999998. A difference beyond 1e-12 aborts before the call. Rho's excess at 0.0169 matches the sharp arm of the ablation within 1e-12. A larger difference means this is not that episode, the runner is fixed, and the dose-response is repeated.

Figure: `bench/boost-sharp/excess-vs-boost.png` and `bench/boost-sharp/score-vs-boost.png`. Source: `bench/boost-sharp/boost.json`. The sweep is `npm run boost-room -- --temperature 0.15 --out bench/boost-sharp`. It is not part of CI.

### Preregister sharp noise and drift

Runs only if the dose-response threshold is at or below 0.0169. Both sweeps use temperature 0.15, seeds 1–200, 400 steps, and the shipped curiosity score. The option stays off in the default agent.

Noise. The PR #7 matched pair: region 1, stationary noise versus one frozen picture, both orientations, learnability on the grid {0, 1/3, 2/3, 1}, relevance 0. The primary number is rho's orientation-averaged occupancy excess, noise minus static. The prediction is no attraction. `noAttractionCall` confirms when the lower end is at or below 0, and refutes when the interval lies entirely above 0. `greaterCall` is reported beside it so a repulsion is visible. It is not a second pass bit. Random excluding 0 is the confound check from `matchedSummary`, not the prediction.

Drift. The PR #10 pair at the locked critical rate only: layout seed 3000, wide door, learnability 1, relevance 0, `matchedPattern` drift versus held, τ = 53.28471423768756, rate 0.01877. The other four positive rates are the same sweep and are not the call. The prediction is directional, from PR #12. Rho's rectified progress in that room was lower on the drifting arm, so occupancy excess, drift minus held, is negative. `repulsionCall` confirms when the interval lies entirely below 0, refutes when it lies entirely above 0, and is otherwise inconclusive. Attraction is the refutation. An interval that includes 0 is not a quiet pass.

Figures: `bench/matched-sharp/excess-by-explorer.png`, `bench/drift-sharp/excess-vs-rate.png`. Sources: `bench/matched-sharp/matched.json`, `bench/drift-sharp/drift.json`. The sweeps are `npm run matched-room -- --temperature 0.15 --out bench/matched-sharp` and `npm run drift-room -- --temperature 0.15 --out bench/drift-sharp`. They are not part of CI.

### Results

The ablation kept the temperature. The dose-response then put rho's threshold at 0.0085, so the noise and drift sweeps ran. The random walk matched the PR #11 fraction 0.1579625 on the ablation and on the dose-response, and rho's excess at 0.0169 matched the ablation's sharp arm exactly. No harness aborted.

#### Ablation. Confirmed.

Rho, dose 0.0169, 200 seeds, 400 steps. Occupancy excess is boosted minus control. The gain is temperature 0.15 minus temperature 0.45. Source: `bench/sharp/sharp.json`. 1200 room episodes and 40 Field episodes, 48 seconds.

| arm | excess | call |
|---|---|---|
| 0.45 | 0.0126 [−0.0039, 0.0287] | inconclusive |
| 0.15 | 0.0884 [0.0662, 0.1101] | confirmed |
| gain | 0.0758 [0.0477, 0.1039] | confirmed |

The shipped arm reproduces PR #11: the point estimate is 0.0126 and the interval includes 0. The sharp arm lies entirely above 0, and the gain lies entirely above 0. `beats` is confirmed.

Safety, Field, seeds 1–20, 280 steps. None of the four hurts fired.

| check | sharp minus shipped | hurt |
|---|---|---|
| probe late | −0.0024 [−0.0115, 0.0081] | no |
| lives | 0.1000 [−0.1500, 0.3500] | no |
| foods, not a call | 3.7000 [2.1000, 5.2000] | — |
| G2 | 20/20 against 18/20 | no |
| C2 | 20/20 against 20/20 | no |

Mean branching was 3.44 at 0.45 and 3.42 at 0.15. Probe late moved from 0.1114 to 0.1090. Lives rose by a tenth and the interval includes 0, so the locked rule does not call it a hurt. Foods rose. That is the colder policy taking meals it was already scoring, not a change to the default agent.

The score-gap gain, not a call, is −0.0592 [−0.0874, −0.0314]. The time-averaged logit contrast shrank while occupancy rose. The keep rule is the occupancy gain. `sharpVerdict` is kept.

Figure: `bench/sharp/excess-vs-temperature.png`.

#### Dose response. Confirmed.

Temperature 0.15, 7000 episodes, 319 seconds. Summary `confirmed`: rho at 0.0169 lies entirely above 0, and random does not exclude 0. `sensitivityCall` is confirmed. The threshold is 0.0085, which is below 0.0169. Source: `bench/boost-sharp/boost.json`.

| explorer | 0.0085 | 0.0169 | 0.05 | threshold | was |
|---|---|---|---|---|---|
| random | 0.0000 [0.0000, 0.0000] | 0.0000 [0.0000, 0.0000] | 0.0000 [0.0000, 0.0000] | none | none |
| count | 0.0131 [−0.0013, 0.0276] | 0.0147 [−0.0009, 0.0311] | 0.0541 [0.0378, 0.0712] | 0.05 | 0.05 |
| surprise | 0.0145 [−0.0048, 0.0338] | 0.0604 [0.0361, 0.0853] | 0.1534 [0.1277, 0.1783] | 0.0169 | 0.0169 |
| rnd | 0.0508 [0.0322, 0.0708] | 0.0783 [0.0570, 0.1009] | 0.2051 [0.1786, 0.2313] | 0.0085 | 0.0169 |
| rho | 0.0360 [0.0161, 0.0555] | 0.0884 [0.0678, 0.1107] | 0.1756 [0.1472, 0.2051] | 0.0085 | 0.05 |

Rho's interval at 0.0085 lies entirely above 0. Count and surprise do not move their thresholds. RND moves from 0.0169 to 0.0085. Larger doses stay entirely above 0 for every directed explorer. The excess still peaks and then flattens: rho is 0.2498 [0.2209, 0.2796] at 0.15 and 0.2440 [0.2150, 0.2730] at 0.5.

Rho's score gap, not the call, includes 0 at 0.0085 and at 0.0169 (−0.0067 [−0.0284, 0.0140]) and clears only from 0.05. At this temperature the occupancy call is ahead of the time-averaged score gap. The score gap does not replace the threshold.

Figures: `bench/boost-sharp/excess-vs-boost.png`, `bench/boost-sharp/score-vs-boost.png`.

#### Noise. Confirmed, no attraction.

The threshold is below 0.0169, so the matched room ran. 19200 episodes, 1021 seconds. Temperature 0.15. Orientation-averaged occupancy, noise minus static. Random is a point mass at 0, so the summary is not confounded. Source: `bench/matched-sharp/matched.json`.

| explorer | mean excess | call |
|---|---|---|
| random | 0.0000 [0.0000, 0.0000] | inconclusive |
| count | 0.0013 [−0.0048, 0.0068] | inconclusive |
| surprise | 0.0029 [−0.0054, 0.0101] | inconclusive |
| rnd | 0.0065 [−0.0016, 0.0145] | inconclusive |
| rho | 0.0059 [−0.0022, 0.0141] | inconclusive |
| progress | −0.0036 [−0.0085, 0.0013] | inconclusive |

`noAttractionCall` on rho is confirmed: the lower end is below 0. The prediction of no attraction holds. `greaterCall` is inconclusive, so this is not a repulsion. `matchedSummary` is inconclusive because no directed mean excludes 0. RND's west arm alone is 0.0148 [0.0041, 0.0259], entirely above 0. The orientation average is the preregistered number, and that average includes 0.

Rho's in-room surprise gap is still positive, 0.0069 [0.0060, 0.0079]. That is under the new detection dose of 0.0085. A planted bonus of 0.0085 moved rho by 0.0360 [0.0161, 0.0555]. The noise gap is smaller than that dose, and the occupancy interval sits under that shift. The null is what the new curve predicts for a gap of 0.0069.

Figure: `bench/matched-sharp/excess-by-explorer.png`.

#### Drift. Inconclusive.

10000 episodes, 449 seconds. Temperature 0.15. The call is rho at r* = 0.01877 only. Excess is drift minus held. Source: `bench/drift-sharp/drift.json`.

Rho at r*: −0.0095 [−0.0293, 0.0118]. `repulsionCall` is inconclusive. The point estimate is negative, which is the sign PR #12 predicted, and the interval includes 0. The prediction is not confirmed and not refuted.

| explorer | excess at 0.01877 | greaterCall |
|---|---|---|
| random | 0.0000 [0.0000, 0.0000] | inconclusive |
| count | −0.0112 [−0.0278, 0.0055] | inconclusive |
| surprise | −0.0039 [−0.0272, 0.0188] | inconclusive |
| rnd | 0.0046 [−0.0145, 0.0230] | inconclusive |
| rho | −0.0095 [−0.0293, 0.0118] | inconclusive |

A planted bonus of 0.0085, smaller than the rectified gap of 0.0109, moved rho's occupancy by 0.0360 [0.0161, 0.0555]. The drift excess at r* is −0.0095 and its upper end is 0.0118. The progress deficit is not showing up as a place bonus of that size. The doorway is still where that credit would have to appear. This run did not measure it.

The other rates are not the call. Rho's only interval that lies entirely below 0 is the fastest rate, 0.3003: −0.0350 [−0.0590, −0.0111]. Count is entirely below 0 at 0.001173 and 0.004692. Surprise is entirely below 0 at 0.001173. None of those cells was the prediction.

Figure: `bench/drift-sharp/excess-vs-rate.png`. The probe figure is `bench/drift-sharp/probe-vs-rate.png`.

The option stays off. `policyTemperature` omitted is still 0.45. It is not a Loop flag, and it is not a default. Both curiosity terms stay on. The place bonus stays off outside the dose-response. No term was added. Five-seed bench, seeds 1–5, sha `ad17a17`, rho, transition still the only default-on flag. Field probe early 0.1222, Field probe late 0.1079, Field on-policy ema 0.1641 → 0.0704, Field foods 5.60, Field lives 0.80, Rooms foods 7.00, Rooms lives 0.40. G1 2/5, G2 5/5, S1 4/5, S2 5/5, S3 5/5, C1 5/5, C2 5/5. G1 stays on the baseline-relative probe rule and is not this claim. Source: `bench/latest.json`. Trend: `bench/history.csv`.

### Next hypothesis

Do not change the default temperature, and do not add a curiosity term. The instrument now sees a planted bonus of 0.0085. At that sensitivity the matched noise room still does not attract rho, and the adaptation-rate drift room still does not resolve. Rho's occupancy at the fast rate 0.3003 does resolve, and it resolves downward. The next measurement is the doorway score, drift minus held, at r* and at 0.3003 only, temperature 0.15, for rho. If the fast rate's doorway gap lies entirely below 0 and the adaptation rate's includes 0, the repulsion is offered at the choice only when turnover is much faster than τ. Field probe late is still 0.1079. A new term still has to beat its own absence on that probe.

## 2026-10-17 drift progress gap (America/New_York)

Written before `npm run drift-gap`. No rectified-progress gap from that command is in this block. The results section is filled in after the run. The five-seed bench is descriptive and is not this claim.

The policy-sensitivity entry's next hypothesis is this measurement. Rho's occupancy does not clear at an additive progress-channel bonus of 0.0169, and it does clear at 0.05. The drift study at r* = 0.01877 measured a fraction of positive-progress steps, not a progress magnitude, so that fraction cannot be placed on the dose curve. This run measures the magnitude. It adds no curiosity term and no Loop flag.

### Preregister drift progress gap

Hypothesis. On the matched drift pair, the mean rectified progress in the target room, drift minus held, at the adaptation rate lies below 0.05. That is the smallest dose at which rho's occupancy excess cleared. A gap below 0.05 is what the dose curve predicts for the drift occupancy null, so the null is informative. A gap at or above 0.05 is not a failure of action selection: a planted bonus of that size moves rho into the room, and the next experiment would be why a reward of that size is not credited to the room.

The pair is the PR #10 episode. Layout seed 3000, the wide door, region 1 on the east, learnability 1, relevance 0, `matchedPattern` drift versus held, the shared low-frequency pattern, the held arm burning the redraw coin. The rate is the locked critical cell of `driftRatesFromTau` on τ = 53.28471423768756, which is 0.01877. No other rate is run. Episodes are 400 steps. Seeds 1–200. Explorers: random, count, surprise, RND, rho. The seed stream is `seed * 10007 + 7301`, the drift episode's stream. No explorer is retuned. The default agent stays window-50 rho with both curiosity terms on. The place bonus stays off. This is not a Loop flag. No probe gate is required to keep a default, because the default does not change. Field probe late from `npm run bench:json`, seeds 1–5, is reported in the results and is not a pass bit. G1 stays on the baseline-relative probe rule and is not this claim.

Primary metric. Rectified progress is max(0, raw progress), raw progress being the shipped ema minus surprise, read after the observation in the room is assimilated. A seed's number on one arm is the mean of that quantity over steps that began in region 1. The gap is the drifting arm minus the held arm, one number per seed. A seed with fewer than 8 steps in the room on either arm is dropped. That is `MIN_ROOM_STEPS`, the same bar as the noise-progress study whose rectified gap of 0.0169 is the dose-axis unit. Paired 95% percentile bootstrap, 2000 resamples, salt 6404. Explorer index is random 0, count 1, surprise 2, RND 3, rho 4.

The dose axis is that rectified mean. PR #11 added the published gaps with coefficient 1 on the progress channel, beside max(0, progress), and rho first cleared at 0.05. The score's literal learning argument is max(0, progressEma), a slower ema of the same raw progress. That mean, drift minus held, salt 6504, is reported and is not the call. If its placement against 0.05 disagrees with the rectified call, the entry says so and the call stays on the rectified mean.

Calls. `dosePlacement` against 0.05. Below when the CI lies entirely under the dose. Above when the lower end is at or above the dose. Spans when the CI contains the dose. Too-few when the eligible seeds are not a majority. `rhoGapBand` then places a below-0.05 interval against 0.0169, the dose where rho did not clear and surprise and RND did. Entirely under 0.0169 is below-undetectable. Otherwise, still under 0.05, it is the rho-blind band. `driftGapSummary` confirms the hypothesis on below-undetectable or the rho-blind band, refutes it on at-or-above 0.05, and is otherwise inconclusive. The sign of the gap, `greaterCall` on the same interval, is not a pass bit. A negative gap is still below 0.05.

The sweep aborts before any call if any random-walk target-room fraction, meal count, or life count differs across the two arms.

Harness, not a call. Rho's mean occupancy excess, drift minus held, must match the published PR #10 value −0.0032124999999999983. A difference beyond 1e-12 means this is not that episode. The gap is not published. The runner is fixed and the sweep is repeated. Occupancy intervals use salt 6700 + explorer and are not a test.

Other channels, interpreted only when the summary is confirmed or refuted. They are not a second primary. Each is the mean, on the same target-room steps, of that explorer's own contribution to the progress channel, drift minus held, in the additive units of the doses. The action bonus enters that channel with weight 0.55, the coefficient in the shipped score. Rho's channel is the primary rectified mean, weight 1, the same coefficient PR #11 used for the published progress gap. Count is 0.55 / √(n+1) of the occupied cell at decision time, before the step. Surprise is 0.55 times the expected residual of the chosen action's imagined window, read from the prediction the policy just used. RND is 0.55 times the predictor error of the occupied cell at decision time, before the step trains. Random's channel is 0. A seed uses the same 8-step rule. Salts are 6600 + explorer. Placement uses `dosePlacement` against that explorer's published detection dose: count 0.05, surprise 0.0169, RND 0.0169, rho 0.05. Those doses are not re-estimated.

Rectified progress and the policy ema under count, surprise, RND, and random are printed. They are the same learner on those paths. They are not those explorers' channels and they are not a call. Salts 6400 + explorer and 6500 + explorer.

Decision, locked before the run. Confirmed: the drift occupancy null is what the dose curve predicts, and the null is informative at this gap. Refuted: the gap is large enough that the planted-bonus curve would have moved rho, so the null is a credit question, not an action-selection question. Inconclusive: the interval contains 0.05, or too few seeds entered the room. No policy retune and no new term in any of the three.

Figures: `bench/drift-gap/gap-on-dose.png` and `bench/drift-gap/channel-gaps.png`. The first places the rectified gap on rho's published occupancy curve. The second is the channel gaps with the two doses marked. Source: `bench/drift-gap/gap.json`. The sweep is `npm run drift-gap`. It is not part of CI.

### Results

2000 episodes, 400 steps, 4 workers, 144 seconds. Source: `bench/drift-gap/gap.json`. The random walk is the same path on both arms, meals and lives included. Rho's occupancy excess matches the published PR #10 mean, −0.0032125, so this is that episode. The harness does not fail.

#### Summary. Confirmed.

The rectified-progress gap lies entirely below 0.05, and entirely below 0.0169. The band is below-undetectable. The hypothesis is confirmed: the drift occupancy null is what the dose curve predicts. The drifting room does not pay a place-specific progress bonus rho could have followed. It pays less. The policy is not retuned. No term is added.

Rho at r* = 0.01877. Rectified progress is max(0, ema − surprise), mean over steps that began in the target room, drift minus held. 170 of 200 seeds had at least 8 steps in the room on both arms.

| quantity | gap | n | place |
|---|---|---|---|
| rectified, the call | −0.0109 [−0.0125, −0.0093] | 170 | below 0.0169 |
| policy ema, not the call | −0.0034 [−0.0048, −0.0020] | 170 | below 0.0169 |

The interval lies entirely below 0. The upper end, −0.0093, is under the dose where surprise and RND first move, and under the dose where rho moves. The absolute gap is about 0.011. A bonus of that size was not detectable for rho at 0.0169, and this gap has the wrong sign for attraction. The literal learning argument, max(0, progressEma), agrees. Its interval is also entirely below 0 and entirely below 0.0169. The two placements do not disagree.

Rectified progress under every policy, same pair, not a call. Every interval lies entirely below 0. The deficit is not rho's path.

| explorer | rectified | n |
|---|---|---|
| random | −0.0119 [−0.0132, −0.0106] | 133 |
| count | −0.0104 [−0.0117, −0.0091] | 200 |
| surprise | −0.0099 [−0.0116, −0.0081] | 174 |
| rnd | −0.0105 [−0.0119, −0.0091] | 149 |
| rho | −0.0109 [−0.0125, −0.0093] | 170 |

Own channels, interpreted because the summary is confirmed. Not a second primary. Count, surprise, and RND are in dose units: 0.55 times their action bonus. Rho's channel is the same seed gaps as the rectified call. Its interval below is the channel salt, so the ends differ from the call in the fourth digit. Both lie entirely below 0.0169.

| explorer | channel | own dose | place |
|---|---|---|---|
| count | −0.0009 [−0.0047, 0.0027] | 0.05 | below, includes 0 |
| surprise | 0.0260 [0.0212, 0.0307] | 0.0169 | above |
| rnd | 0.0103 [0.0091, 0.0116] | 0.0169 | below, entirely above 0 |
| rho | −0.0109 [−0.0125, −0.0094] | 0.05 | below 0.0169 |

Count's occupied-cell bonus does not separate the arms. RND's occupied-cell error is higher in the drifting room, and the whole interval sits under 0.0169, so the dose curve does not predict an RND occupancy shift. Surprise's imagined residual, on the action taken inside the room, is higher by 0.0260 [0.0212, 0.0307]. That interval lies entirely above 0.0169, the dose at which a planted doorway bonus moved surprise. It is not a doorway bonus. It is the residual of actions already in the room. PR #10's surprise occupancy at this rate still includes 0. This channel does not replace that null.

Figures: `bench/drift-gap/gap-on-dose.png`, `bench/drift-gap/channel-gaps.png`. The dose figure carries the gap as a number because a negative gap is not a mark on the positive dose axis. It sits to the left of 0.0085, 0.0169, and 0.05.

No mechanism was added. The place bonus stays off. The default agent is unchanged. Both curiosity terms stay on. No Loop flag was added, and none was turned on. Five-seed bench, seeds 1–5, sha `2798c95`, rho, transition still the only default-on flag. Field probe early 0.1222, Field probe late 0.1079, Field on-policy ema 0.1641 → 0.0704, Field foods 5.60, Field lives 0.80, Rooms foods 7.00, Rooms lives 0.40. G1 2/5, G2 5/5, S1 4/5, S2 5/5, S3 5/5, C1 5/5, C2 5/5. G1 stays on the baseline-relative probe rule and is not this claim. Source: `bench/latest.json`. Trend: `bench/history.csv`.

`npm test` passes. `tsc --noEmit` passes. `loop.ts` is unchanged and well above 2 KB. No kernel mechanism file changed, so the probe gate is not required.

### Next hypothesis

Do not retune the softmax, and do not add a curiosity term. The drift gap is negative and below 0.0169, so a more sensitive policy is not what this null was missing. The open measurement is the doorway. On this same pair, at r* only, the mean score of actions into region 1 minus the mean score of the others, drift minus held, for surprise and for rho. If surprise's doorway gap clears 0 and rho's does not, the residual is offered at the choice and rectified progress is not. If neither clears, the in-room surprise gap is not the bonus the dose curve planted. Forgetting-driven revisitation stays open and is not the next measurement. Field probe late is still 0.1079. A new term still has to beat its own absence on that probe.

## 2026-10-17 policy sensitivity (America/New_York)

Written before `npm run boost-room`. No occupancy excess from that command is in this block. The results section is filled in after the run. The five-seed bench is descriptive and is not this claim.

The drift entry's next hypothesis was whether rho's drop in the positive-progress fraction at the adaptation rate exceeds the random walk's drop. That comparison is not this run. The occupancy nulls against a matched room are still in force: stationary noise does not attract (PR #7), and drift near τ = 53 does not attract (PR #10, all 25 excess intervals include 0). In both studies the in-room reward did move. A policy that cannot turn an intrinsic bonus into time in a room would make those nulls uninformative. This run is that positive control. It adds no curiosity term and no Loop flag.

### Preregister policy sensitivity

Hypothesis. The shipped policy converts a place-specific intrinsic bonus of the size of the measured progress gap into occupancy. At an additive bonus of 0.0169 on the progress channel, rho's excess time in the boosted room lies entirely above 0.

The pair shares one shell. Layout seed 3000, the wide door, region 1 on the east, the held low-frequency pattern, learnability 1, relevance 0, drift 0. The control arm is the shipped agent: the boost option is omitted. The boosted arm adds a constant to the progress channel of an action whose real destination is in region 1, after `max(0, progress)`, and nowhere else. Imagined follow-ups do not receive it. They have no grid region. The bonus does not touch the world-model update, the episode RNG, or the random policy, which returns before scores are read. One control episode is shared across doses. The doses are not a second environment.

The constant is on the progress channel, which is where every explorer's intrinsic term already enters the score: `prog = max(0, progress) + bonus + 0.55 × intrinsic`. For rho the published progress gap adds here with coefficient 1. Count, surprise, and RND receive the same additive gap on that channel, on the same actions. A multiplicative factor is not an arm. The published gaps are additive.

Locked comparison gaps, not re-estimated:

- PR #7, matched room, rho training surprise, noise minus static: 0.0085 [0.0076, 0.0095].
- Noise-progress study, rectified progress, learnable room minus noise room: 0.0169 [0.0145, 0.0192]. This is the primary dose. It is not geometry-matched. It is the progress-unit gap on record.
- PR #10, rho at r* = 0.01877, fraction of target-room steps with raw progress above 0, drift minus held: −0.0709 [−0.0934, −0.0500]. That is a fraction, not a progress magnitude. The grid still brackets 0.07 so a reading of that fraction as a reward size is inside the dose response. It is not a second primary dose.

Doses, additive, locked: 0.0085, 0.0169, 0.05, 0.15, 0.5, 2. The primary dose is 0.0169. A first detection at 0.5 or 2, or no detection through 2, is far above the locked gaps. 0.05 and 0.15 are above the gap and are not far: 0.15 is about nine times 0.0169.

Episodes are 400 steps. Seeds 1–200. Explorers: random, count, surprise, RND, rho. Random is the negative control. The other four are the directed set. No explorer is retuned. The default agent stays window-50 rho with both curiosity terms on. This is not a Loop flag. No probe gate is required to keep a default, because the default does not change. Field probe late from `npm run bench:json`, seeds 1–5, is reported in the results and is not a pass bit. G1 stays on the baseline-relative probe rule and is not this claim.

Primary metric. Target-room fraction, the fraction of steps that began in region 1. Excess at a dose is the boosted arm minus the control arm, one number per seed. Paired 95% percentile bootstrap, 2000 resamples. Explorer index is random 0, count 1, surprise 2, RND 3, rho 4. Dose index is 0..5 in the order above.

Calls. Excess at each dose uses salt 6000 + 10 × explorer + dose. Confirmed if the CI lies entirely above 0, refuted if entirely below, otherwise inconclusive. The primary call is rho at dose index 1, add 0.0169. The other doses and the other explorers are the dose response. They are not a second primary.

Detection threshold, per explorer, from `smallestDetecting`. The smallest dose whose excess is confirmed. Null if none is. It is not a second pass bit. The summary reads it.

Summary, from `boostSummary`, not a second test. Confounded if any of random's six excess intervals excludes 0. Confirmed if rho at 0.0169 is confirmed. Refuted if rho at 0.0169 is refuted. Insensitive if rho at 0.0169 is inconclusive and the detection threshold is null or greater than 0.15. Above-gap if that call is inconclusive and the threshold is greater than 0.0169 and at most 0.15. Otherwise inconclusive: a smaller dose detected and the primary dose did not.

Score diagnostic, not a call. Mean over steps of (mean score of actions into region 1 minus mean score of the others), boosted minus control. A step with no action on one side is dropped. Salt 6100 + 10 × explorer + dose. It cannot rescue or overturn a call. If the score gap clears and the occupancy excess does not, the logits moved and the occupancy did not. If the score gap does not clear, the bonus did not separate the logits.

Fraction intervals use salts 6200 and 6300 and are not a test.

The sweep aborts before any call if any random-walk target-room fraction, meal count, or life count differs across the control and a dose.

Decision, locked before the run. Confirmed: the earlier matched-room nulls are informative at a progress gap of 0.0169, and this run does not change the policy. Above-gap or inconclusive: report the threshold and do not change the policy. The nulls stay informative for effects at or above the threshold. Insensitive or refuted: the nulls are not informative at the locked gaps. A second preregistration in this entry, written before that run, names one action-selection change. It is a Kernel option defaulting off. It is kept only if, on these seeds, rho's excess at 0.0169 with the option on lies entirely above rho's excess with the option off. If it does not, the option stays off and the entry records the reversion. The matched noise room and the matched drift room are re-run only after a fix that beats its absence.

Figures: `bench/boost/excess-vs-boost.png` and `bench/boost/score-vs-boost.png`. Occupancy excess and the score gap, per explorer, against the bonus, with the CIs. The marks are 0.0085 and 0.0169. Source: `bench/boost/boost.json`. The sweep is `npm run boost-room`. It is not part of CI.

### Results

7000 episodes, 400 steps, 4 workers, 318 seconds. Source: `bench/boost/boost.json`. The random walk is the same path at every dose, meals and lives included, so each random excess is a point mass at 0. The summary is not confounded.

#### Summary. Above-gap.

Rho at 0.0169 does not clear. The primary call is inconclusive. The detection threshold is 0.05, which is above the locked progress gap and not above 0.15, so the summary is above-gap. The hypothesis, that a bonus of 0.0169 produces a detectable occupancy excess for rho, is not confirmed. It is not refuted: the interval does not lie entirely below 0. The policy is not retuned. The locked rule keeps a fix for a threshold above 0.15, or for no detection at all.

Occupancy excess, boosted room minus the matched control. The threshold is the smallest dose whose interval lies entirely above 0.

| explorer | 0.0085 | 0.0169 | 0.05 | threshold |
|---|---|---|---|---|
| random | 0.0000 [0.0000, 0.0000] | 0.0000 [0.0000, 0.0000] | 0.0000 [0.0000, 0.0000] | none |
| count | 0.0078 [−0.0057, 0.0217] | 0.0071 [−0.0105, 0.0249] | 0.0362 [0.0149, 0.0565] | 0.05 |
| surprise | 0.0016 [−0.0136, 0.0170] | 0.0192 [0.0014, 0.0371] | 0.0598 [0.0375, 0.0834] | 0.0169 |
| rnd | 0.0080 [−0.0019, 0.0181] | 0.0222 [0.0075, 0.0370] | 0.0849 [0.0655, 0.1052] | 0.0169 |
| rho | 0.0053 [−0.0099, 0.0197] | 0.0126 [−0.0039, 0.0291] | 0.0770 [0.0553, 0.0998] | 0.05 |

Larger doses, same excess. Every directed interval from 0.15 up lies entirely above 0. The excess peaks at 0.5 and does not rise at 2. That shape is not a pass bit.

| explorer | 0.15 | 0.5 | 2 |
|---|---|---|---|
| random | 0.0000 [0.0000, 0.0000] | 0.0000 [0.0000, 0.0000] | 0.0000 [0.0000, 0.0000] |
| count | 0.1239 [0.0985, 0.1486] | 0.2691 [0.2428, 0.2947] | 0.2618 [0.2361, 0.2878] |
| surprise | 0.1666 [0.1403, 0.1933] | 0.2127 [0.1840, 0.2412] | 0.2075 [0.1772, 0.2353] |
| rnd | 0.1806 [0.1560, 0.2056] | 0.2051 [0.1778, 0.2322] | 0.1886 [0.1628, 0.2143] |
| rho | 0.1358 [0.1120, 0.1602] | 0.1909 [0.1663, 0.2166] | 0.1730 [0.1483, 0.1962] |

Rho's control fraction is 0.2207. The room is visited with the bonus off. At 0.05 the boosted fraction is 0.2977. At 0.0169 it is 0.2333. Random stays at 0.1580 on every arm.

Comparison with the locked gaps. The matched surprise gap is 0.0085. Rho's occupancy interval there includes 0, and the upper end is 0.0197. The rectified progress gap is 0.0169. Rho's occupancy interval there includes 0: 0.0126 [−0.0039, 0.0291]. The point estimate is positive. An occupancy shift of 0.07, the size chased against a random walk in the earlier noise studies, is outside that interval. Surprise and RND do detect at 0.0169. Count joins rho at 0.05. The drift fraction at r*, −0.0709, is not a progress magnitude. Read as one anyway, it sits between doses that both move rho: 0.05 gives 0.0770 [0.0553, 0.0998] and 0.15 gives 0.1358 [0.1120, 0.1602].

The matched-room occupancy nulls are informative for a place-specific gap of 0.05 or larger. That dose moves rho by 0.077, and the matched noise and drift intervals sit on zero with room to spare under that shift. They are not a demonstration that a gap of 0.0169 would have shown up in rho's occupancy. At that dose it did not.

Score diagnostic, not a call. Rho's score gap, boosted minus control, lies entirely above 0 at every dose, including 0.0085. The logits move at the noise-gap scale. Occupancy does not clear until 0.05.

| dose | rho score gap |
|---|---|
| 0.0085 | 0.0213 [0.0094, 0.0320] |
| 0.0169 | 0.0525 [0.0367, 0.0694] |
| 0.05 | 0.1051 [0.0843, 0.1261] |

RND's score gap clears at every dose. Surprise's clears from 0.0169. Count's score gap clears from 0.15, one dose after its occupancy clears. The score gap cannot overturn the occupancy call.

Figures: `bench/boost/excess-vs-boost.png`, `bench/boost/score-vs-boost.png`.

No mechanism was added. `intrinsicBoost` stays off unless a measurement passes a positive add. The default agent is unchanged. Both curiosity terms stay on. No Loop flag was added, and none was turned on. Five-seed bench, seeds 1–5, sha `291b98a`, rho, transition still the only default-on flag. Field probe early 0.1222, Field probe late 0.1079, Field on-policy ema 0.1641 → 0.0704, Field foods 5.60, Field lives 0.80, Rooms foods 7.00, Rooms lives 0.40. G1 2/5, G2 5/5, S1 4/5, S2 5/5, S3 5/5, C1 5/5, C2 5/5. G1 stays on the baseline-relative probe rule and is not this claim. Source: `bench/latest.json`. Trend: `bench/history.csv`.

`npm test` passes. `tsc --noEmit` passes. `loop.ts` is unchanged and well above 2 KB. `kernel.ts` and `policy.ts` are on the CI mechanism list, so the transition probe gate was run again on 20 seeds. It still passes: off − on 0.1234 [0.1150, 0.1307]. It was not this claim.

### Next hypothesis

Do not retune the softmax, the horizon, or the learning rate. Rho's occupancy does not clear at 0.0169, and it does clear at 0.05, so a fix is not licensed by the locked rule. Do not add a curiosity term. The missing number is the mean rectified progress in the target room, drift minus held, at r* = 0.01877, on the same matched pair, in the progress-channel units of this dose response. If that gap is below 0.05, the drift occupancy null is what this curve predicts, and the null is informative. If it is at or above 0.05, the null is not a failure of action selection, and the next experiment is why a reward of that size is not credited to the room. Forgetting-driven revisitation stays open and is not the next measurement: this curve has not yet been given the drift gap it was built to read. Field probe late is still 0.1079. A new term still has to beat its own absence on that probe.

## 2026-10-16 drift timescale (America/New_York)

Written before `npm run drift-room`. No target-room fraction from that command is in this block. The results section is filled in after the run. The five-seed bench is descriptive and is not this claim.

The fed-room entry's next hypothesis was to equalize the open-cell counts and measure the excess over a random walk again. That question is closed. Directed explorers beat a random walk in the small room, and neither a frozen picture nor five non-edible foods closed the gap. This run does not ask it again. It also adds no curiosity term and no Loop flag.

The phase diagram already swept drift, and it refuted attraction at 1/τ. That sweep compared east-room time with a random walk, and its drift-0 cell was stationary white noise, not a frozen copy of the drifting pattern. The matched-room entry then showed that noise-minus-static excess is about 0. The standing rule is to measure distractor attraction against a geometry- and novelty-matched control. That paired drift measurement has not been run. The forgetting-cycle sweep has been run, and it was inconclusive. This run is the paired drift measurement.

### Preregister drift timescale

Hypothesis. Rho is attracted to a pattern that turns over near the learner's adaptation timescale, where progress stays positive, and it is not attracted to the same pattern when the turnover is much slower or much faster. The attraction is drifting-room time minus held-room time, not time minus a random walk.

The pair shares one shell. Layout seed 3000, the wide door, region 1 on the east, 52 open cells there and the five meals in the large room. Learnability is 1, so the large room is fully structured. Relevance is 0. No food markers. No mirror. The side of the map is not a factor: both arms are the same room. An orientation average would spend the seed budget on a contrast the matched-room study already found does not carry content.

Both arms start on one low-frequency pattern, latent `EAST_HOLD_LATENT`. The drifting arm redraws that latent with probability `driftRate` each step. The held arm keeps the latent and still burns the coin, including the redraw draw, so the episode RNG stays aligned. Count novelty is the visit count of the same cells. The first frame is the same picture, not merely the same marginal, so a 5×5 window's first glance has the same surprise. What changes is only whether the picture turns over. `matchedPattern` defaults off. The historical noise room and the phase episodes are unchanged.

Drift is a wall-clock coin. It fires whether or not the body is in the room. τ is in-room experience on a frozen pattern. The grid is still (1/τ) times {1/16, 1/4, 1, 4, 16}, clipped below 0.95. A 400-step episode sees about 0.5 redraws at the slow end and about six at 1/τ. That is the bracket.

Instrument, measured on this map before the sweep and then locked. The narrow-door lock in `bench/phase/timescale.json` is 67.65 [53.66, 81.81]. The doorway was widened after that lock, in `c5c2a37`, and the same eight seeds on the wide door are faster. The old number is not the clock of this map. The definition is unchanged: e-folding time of excess live probe error, one uniform transition per step, scent zero, cell learning rate 4, seeds 1–8, bootstrap seed 5. Source: `bench/drift/timescale.json`.

| seed | τ | half-life | start | tail |
|---|---:|---:|---:|---:|
| 1 | 50.39 | 34.9 | 0.256 | 0.067 |
| 2 | 59.40 | 41.2 | 0.269 | 0.076 |
| 3 | 38.12 | 26.4 | 0.251 | 0.065 |
| 4 | 65.18 | 45.2 | 0.254 | 0.082 |
| 5 | 54.38 | 37.7 | 0.260 | 0.071 |
| 6 | 50.93 | 35.3 | 0.257 | 0.082 |
| 7 | 66.97 | 46.4 | 0.262 | 0.063 |
| 8 | 40.90 | 28.4 | 0.251 | 0.060 |

Mean τ = 53.28 steps, 95% bootstrap CI [46.56, 59.77]. No seed was censored. The narrow-door mean sits above this interval.

Locked positive rates, probability per step: 0.001173, 0.004692, 0.01877, 0.07507, 0.3003. The rate nearest 1/τ is 0.01877, a pattern lifetime of about 53 steps. 0.001173 is the slow extreme, about 16× below. 0.3003 is the fast extreme, about 16× above. The two rates in between are reported and are not a second chance. Drift 0 is not a cell. The held arm is the static control at every rate.

Episodes are 400 steps. Seeds 1–200. Explorers: random, count, surprise, RND, rho. Random is the negative control. The other four are the directed set. No explorer is retuned. The default agent stays window-50 rho with both curiosity terms on. This is not a Loop flag. No probe gate is required to keep a default, because the default does not change. Field probe late from `npm run bench:json`, seeds 1–5, is reported in the results and is not a pass bit. G1 stays on the baseline-relative probe rule and is not this claim.

Primary metric. Target-room fraction, the fraction of steps that began in region 1. Excess at a rate is the drifting arm minus the held arm, one number per seed. Paired 95% percentile bootstrap, 2000 resamples.

Headline probe. End-of-episode held-out error on the shared initial pattern, region 1, 40 uniform transitions, probe seed 20261015, scent blanked, drift forced off during the score. Lower is better. The paired quantity is drifting minus held. The same states are scored on the pattern present at the end (`probeCurrent`) and the large room is scored with the phase-sweep live probe (`probeWorld`). Those two are reported and are not a pass bit.

The sweep aborts before any call if any random-walk target-room fraction, meal count, or life count differs across the two arms.

Calls. Explorer index is random 0, count 1, surprise 2, RND 3, rho 4. Rate index is 0..4 in the order above. Critical index is 2.

- Excess at each rate uses salt 5100 + 10 × explorer + rate. Confirmed if the CI lies entirely above 0, refuted if entirely below, otherwise inconclusive. Only the shape below is a pass bit. A single rate is not.
- Shape, `driftShapeCall`. Let r* be 0.01877, r_slow 0.001173, r_fast 0.3003. Confirmed when all three CIs lie entirely above 0: excess at r*, excess at r* minus excess at r_slow, and excess at r* minus excess at r_fast. Refuted when the excess at r* lies entirely below 0, or when both differences lie entirely below 0. Otherwise inconclusive. The slow contrast uses salt 5200 + explorer. The fast contrast uses salt 5300 + explorer. The peak reuses the excess salt at rate index 2.
- Probe clause, rho only, at r* only. Initial-pattern probe, drift minus held, salt 5400 + 10 × 4 + 2. Confirmed if that CI lies entirely above 0: the drifting arm compresses the shared starting pattern worse than the held arm, which is the signature that the pattern was not finished. Refuted if the CI lies entirely below 0. Otherwise inconclusive. The other rates and the other explorers are not a second chance.
- Specificity. Count, surprise, and RND are scored with the same shape rule. If any of them is confirmed, rho's peak is not a learning-progress result.

Summary, from `driftSummary`, not a second test. Confounded if any of random's five excess intervals excludes 0. Otherwise refuted if rho's shape is refuted, or if rho's shape is confirmed and the probe clause is refuted. Confirmed if rho's shape is confirmed, the probe clause is confirmed, and no other directed shape is confirmed. Shared if rho's shape and probe are both confirmed and another directed shape is also confirmed: the peak is real and it is not specific to rho. Otherwise inconclusive.

Progress diagnostic, not a call. On steps that began in the target room, the fraction with raw progress above 0, drift minus held. A seed with no such step on either arm is dropped. Report n. Salt 5900 + 10 × explorer + rate. It cannot rescue or overturn a call.

Fraction intervals use salts 5700 and 5800 and are not a test. Current-pattern probe salts are 5500. Large-room probe salts are 5600.

Figures: `bench/drift/excess-vs-rate.png` and `bench/drift/probe-vs-rate.png`. Excess and the initial-pattern probe, per explorer, against drift rate, with the CIs. The vertical mark is r*. Source: `bench/drift/drift.json`. The sweep is `npm run drift-room`. It is not part of CI.

### Results

10000 episodes, 400 steps, 4 workers, 531 seconds. Source: `bench/drift/drift.json`. The random walk is the same path on both arms at every rate, meals and lives included, so each random excess is a point mass at 0. The summary is not confounded.

#### Summary. Inconclusive.

Rho's occupancy does not peak at the adaptation rate. The shape call is inconclusive, so the prediction is not confirmed. It is not refuted either: the excess at r* does not lie entirely below 0, and the peak is not a trough under both extremes. No directed shape is confirmed. The probe clause, taken alone, is confirmed, and it is confirmed for every explorer including the random walk, so it is not a learning-progress signature. The registered summary needs the shape as well. The shape did not clear.

Rho at r* = 0.01877. Excess is drifting minus held. The slow gap is that excess minus the excess at 0.001173. The fast gap uses 0.3003.

| explorer | excess at r* | slow gap | fast gap | shape |
|---|---|---|---|---|
| random | 0.0000 [0.0000, 0.0000] | 0.0000 [0.0000, 0.0000] | 0.0000 [0.0000, 0.0000] | inconclusive |
| count | 0.0028 [−0.0169, 0.0210] | 0.0080 [−0.0146, 0.0282] | 0.0185 [−0.0103, 0.0486] | inconclusive |
| surprise | −0.0083 [−0.0286, 0.0125] | −0.0171 [−0.0399, 0.0058] | −0.0128 [−0.0419, 0.0164] | inconclusive |
| rnd | −0.0057 [−0.0167, 0.0055] | −0.0046 [−0.0168, 0.0078] | 0.0004 [−0.0201, 0.0193] | inconclusive |
| rho | −0.0032 [−0.0203, 0.0151] | −0.0082 [−0.0287, 0.0119] | −0.0015 [−0.0268, 0.0246] | inconclusive |

Rho's point estimate at r* is slightly negative. The upper end is 0.0151. The effect the phase diagram was chasing against a random walk was about 0.07, and that size is outside this interval.

Excess at every rate. All 25 intervals include 0. The closest approach to a positive call is surprise at 0.001173, 0.0087 [−0.00004, 0.0181]. The lower end is below 0, so the call stays inconclusive.

| explorer | 0.001173 | 0.004692 | 0.01877 | 0.07507 | 0.3003 |
|---|---|---|---|---|---|
| random | 0.0000 [0.0000, 0.0000] | 0.0000 [0.0000, 0.0000] | 0.0000 [0.0000, 0.0000] | 0.0000 [0.0000, 0.0000] | 0.0000 [0.0000, 0.0000] |
| count | −0.0053 [−0.0138, 0.0027] | −0.0046 [−0.0194, 0.0116] | 0.0028 [−0.0169, 0.0210] | −0.0030 [−0.0237, 0.0167] | −0.0158 [−0.0383, 0.0081] |
| surprise | 0.0087 [−0.0000, 0.0181] | 0.0008 [−0.0137, 0.0155] | −0.0083 [−0.0286, 0.0125] | −0.0064 [−0.0249, 0.0116] | 0.0045 [−0.0181, 0.0268] |
| rnd | −0.0011 [−0.0061, 0.0039] | −0.0010 [−0.0124, 0.0101] | −0.0057 [−0.0167, 0.0055] | 0.0034 [−0.0152, 0.0201] | −0.0061 [−0.0241, 0.0106] |
| rho | 0.0050 [−0.0035, 0.0133] | −0.0016 [−0.0120, 0.0084] | −0.0032 [−0.0203, 0.0151] | −0.0003 [−0.0178, 0.0157] | −0.0017 [−0.0203, 0.0154] |

Rho's target-room fraction stays near 0.22 on both arms. At r* the drifting arm is 0.2258 [0.2048, 0.2482] and the held arm is 0.2290 [0.2080, 0.2515]. The room is visited. The content does not move the visit.

Probe clause, rho at r*, initial pattern, drift minus held: 0.0108 [0.0088, 0.0130]. The interval lies entirely above 0. That is the registered probe call, and it is confirmed. It does not rescue the shape. The same contrast is confirmed for random, count, surprise, and RND at every rate. Random at r* is 0.0086 [0.0072, 0.0101]. The gap rises toward the fast end. It does not peak at r*. A walk that ignores observations still compresses a young pattern worse than a pattern that never moved, because the weights only see what the body walks through. The probe is recording the age of the pattern, not a preference.

Initial-pattern probe, drift minus held. Lower would have meant the drifting arm kept the starting picture. None of these intervals include 0.

| explorer | 0.001173 | 0.01877 | 0.3003 |
|---|---|---|---|
| random | 0.0019 [0.0012, 0.0027] | 0.0086 [0.0072, 0.0101] | 0.0104 [0.0089, 0.0120] |
| count | 0.0032 [0.0019, 0.0046] | 0.0138 [0.0118, 0.0158] | 0.0145 [0.0125, 0.0167] |
| surprise | 0.0039 [0.0024, 0.0054] | 0.0119 [0.0098, 0.0141] | 0.0154 [0.0133, 0.0175] |
| rnd | 0.0031 [0.0020, 0.0042] | 0.0077 [0.0058, 0.0097] | 0.0132 [0.0107, 0.0154] |
| rho | 0.0028 [0.0015, 0.0041] | 0.0108 [0.0088, 0.0130] | 0.0136 [0.0113, 0.0161] |

The two interior rates sit between those columns for every explorer. They are in `bench/drift/drift.csv`. They are not a second chance.

Progress diagnostic, not a call. Fraction of target-room steps with raw progress above 0, drift minus held. At r*, rho is −0.0709 [−0.0934, −0.0500], n = 177 of 200. Random is −0.0814 [−0.1034, −0.0590], n = 143. The drifting room produces fewer positive-progress steps than the held room, and a random walk shows the drop too. The fraction falls as the rate rises, for every explorer. It does not single out rho, and it does not move occupancy. The prediction that progress stays positive near τ, and that rho would follow it, is not what these traces do.

Large-room live probe, rho, drift minus held, at r*: 0.0069 [0.0048, 0.0088]. The useful room is slightly harder when the other room drifts. It is the same direction as the initial-pattern probe and it is not a pass bit.

Figures: `bench/drift/excess-vs-rate.png`, `bench/drift/probe-vs-rate.png`.

No mechanism was added. `matchedPattern` stays off. The default agent is unchanged. Both curiosity terms stay on. No Loop flag was added, and none was turned on. Five-seed bench, seeds 1–5, sha `1c0757f`, rho, transition still the only default-on flag. Field probe early 0.1222, Field probe late 0.1079, Field on-policy ema 0.1641 → 0.0704, Field foods 5.60, Field lives 0.80, Rooms foods 7.00, Rooms lives 0.40. G1 2/5, G2 5/5, S1 4/5, S2 5/5, S3 5/5, C1 5/5, C2 5/5. G1 stays on the baseline-relative probe rule and is not this claim. Source: `bench/latest.json`. Trend: `bench/history.csv`.

`npm test` passes. `loop.ts` is unchanged and well above 2 KB. `kernel.ts` is on the CI mechanism list, so the transition probe gate was run again on 20 seeds. It still passes: off − on 0.1234 [0.1150, 0.1307]. It was not this claim.

### Next hypothesis

Do not add a curiosity term, and do not sweep this room against a random walk again. That contrast is closed, and this one did not replace it with a drift peak. The probe gap and the drop in positive-progress fraction are both shared with a random walk, and both grow toward fast drift instead of peaking at τ. The next preregistered comparison is whether rho's drop in positive-progress fraction at r* exceeds the random walk's drop on this same pair. If it does not, learning-progress curiosity is not differentially sensitive to drift at its own timescale. Field probe late is still 0.1079. A new term still has to beat its own absence on that probe.

## 2026-10-16 fed room (America/New_York)

Written before `npm run fed-room`. No target-room fraction from that command is in this block. The results section is filled in after the run. The five-seed bench is descriptive and is not this claim.

The matched-room entry found that the excess over a random walk survives a frozen picture of the same room, on both sides of the map. It is not the noise. This run asks whether it is the empty room. It adds no curiosity term and no Loop flag.

### Preregister fed room

Hypothesis. The excess target-room time over a random walk is the empty room. Five food-shaped markers in region 1, placed by the same rule as the large room's five meals and not edible, close that excess.

The markers are not meals. An edible meal would pay the body, clear the cell, and spend the episode RNG on a respawn. That is a second attractor, and it moves a random walk. Relevance stays 0, so the noise bits are not meals either. The claim is about the empty room, not about calories.

`targetFoods` defaults off. After the large room's five meals are placed, the same draw marks five open region-1 cells. Those meals stay on their cells. A marker is food in the observation: food channel 1, glow 0, the channels a real meal occupies. The cell stays empty. It is walkable, it is not a wall, it is not eaten, and the body reward does not see it. The noise bit on that cell is still drawn and discarded, so the episode RNG matches the empty room. The mirror reflects the markers with the shell. The split world does not use this flag.

The map otherwise matches the noise study. Layout seed 3000. Drift 0. Relevance 0. Amplitude 1. Window 50. Estimator ema. Learnability {0, 1/3, 2/3, 1}. Episodes are 400 steps. Seeds 1–200. Content is stationary noise. Both orientations, so the side of the map is not the contrast. Spawn stays in the large room.

Explorers. Random, count, surprise, RND, shipped rho, and pure-progress rho. Pure-progress rho is the policy-terms arm `progress`. Random is the negative control. The other five are the directed set. No explorer is retuned. The default agent stays window-50 rho with both curiosity terms on. This is not a Loop flag. No probe gate is required to keep a default, because the default does not change. Field probe late from `npm run bench:json`, seeds 1–5, is reported in the results and is not a pass bit. G1 stays on the probe rule and is not this claim.

Primary metric. Target-room fraction, the fraction of steps that began in region 1. For each seed, explorer, and arm, average that fraction over the four learnabilities and the two orientations. Empty excess is that number minus the random walk on the empty arm, same seed. Fed excess is the same contrast on the fed arm. Reduction is empty excess minus fed excess. Positive reduction means the foods lowered the excess. Paired 95% percentile bootstrap, 2000 resamples.

Salts are fixed in `scripts/fed.ts`. Fed excess, the test: 4101 random, 4102 count, 4103 surprise, 4104 RND, 4105 shipped rho, 4106 pure-progress. Empty excess: 4111 through 4116 in that order. Reduction: 4121 through 4126. East fed: 4131 through 4136. West fed: 4141 through 4146. East empty: 4151 through 4156. West empty: 4161 through 4166. The random arm gap, fed fraction minus empty fraction, uses salt 4501. Per-learnability fed excess uses 4200 + 10 × explorer index + learnability index. Per-learnability reduction uses 4300 + 10 × explorer index + learnability index. Explorer index follows the order above. Learnability index is 0, 1, 2, 3. Fraction intervals use salts 4401 upward, explorer then arm (empty, fed) then side (east, west), and are not a test.

Calls use `fedRoomCall`. Open if the fed excess lies entirely above 0: the room still attracts, and the foods did not close the gap. Closed if the empty excess lies entirely above 0 and the fed excess does not, including a fed interval of [0, 0]: the gap was real and it does not survive the foods. Otherwise inconclusive: there was no empty-room gap to close. The orientation-averaged fed excess is the only pass bit. East, west, the four learnabilities, and the reduction are reported and are not a second chance. A reliable shrink that leaves the fed excess entirely above 0 is still open.

Negative control. Random's fed fraction minus its empty fraction. A walk that ignores observations has nothing to prefer, and the markers do not move the episode RNG, the meals, or the walls, so the gap is zero and the CI is [0, 0]. That interval does not exclude 0. If the CI does exclude 0, the markers moved a walk that does not read them. The summary is then confounded, and no directed call is interpreted as an empty-room effect. The calls are still printed. The sweep aborts before any call if an unmirrored empty episode disagrees with `bench/noise/noise.csv`, or if any random-walk fraction, meal count, or life count differs across the two arms.

Summary label, from `fedRoomSummary`, not a second test. Confounded if the random arm CI excludes 0. Otherwise, if every directed call is closed: empty. The attractor was an empty room. If every directed call is open: not-empty. The foods did not close the gap. The next measurement equalizes the cell counts before adding another curiosity term. If every directed call is inconclusive: inconclusive. Any other mix: mixed. The per-explorer calls are the result in every case.

Figure: `bench/fed/excess-by-explorer.png`. Empty excess and fed excess, per explorer, with the CIs. Source: `bench/fed/fed.json`. The sweep is `npm run fed-room`. It is not part of CI.

### Results

19200 episodes, 400 steps, 4 workers, 1048 seconds. Source: `bench/fed/fed.json`. The unmirrored empty arm is the noise-study episode: all 4000 shipped rows match `bench/noise/noise.csv`. The random walk is the same path on both arms, meals and lives included, so the arm gap is a point mass at 0. The summary is not confounded.

#### Summary. Not-empty.

The foods did not close the gap. Every directed call is open. The empty-room hypothesis is refuted.

Fed excess, target room minus random, mean of the two orientations. Reduction is empty excess minus fed excess. It is not a pass bit.

| explorer | empty | fed | reduction | call |
|---|---|---|---|---|
| random | 0.0000 [0.0000, 0.0000] | 0.0000 [0.0000, 0.0000] | 0.0000 [0.0000, 0.0000] | inconclusive |
| count | 0.1599 [0.1502, 0.1694] | 0.1606 [0.1509, 0.1701] | −0.0007 [−0.0073, 0.0056] | open |
| surprise | 0.0937 [0.0831, 0.1039] | 0.0967 [0.0857, 0.1078] | −0.0030 [−0.0091, 0.0028] | open |
| rnd | 0.0724 [0.0624, 0.0818] | 0.0728 [0.0634, 0.0820] | −0.0004 [−0.0047, 0.0040] | open |
| rho | 0.0691 [0.0592, 0.0787] | 0.0722 [0.0628, 0.0812] | −0.0031 [−0.0076, 0.0016] | open |
| progress | 0.0572 [0.0481, 0.0665] | 0.0571 [0.0477, 0.0660] | 0.0001 [−0.0038, 0.0039] | open |

The reductions sit on zero. None of the five directed intervals excludes it. The fed excesses are the empty-room excesses. Count remains near 0.16. Rho remains near 0.07. Filling the room with five food-shaped markers did not move occupancy.

Unmirrored empty excess matches the noise-study point estimates: count 0.1576, surprise 0.0890, RND 0.0725, rho 0.0713, pure-progress 0.0514. The intervals are this run's salts. That match is a harness check, not a second pass bit.

Orientations, reported and not a pass bit. Fed excess on each side. Both sides are open for every directed explorer.

| explorer | east fed | west fed |
|---|---|---|
| random | 0.0000 [0.0000, 0.0000] | 0.0000 [0.0000, 0.0000] |
| count | 0.1584 [0.1448, 0.1722] | 0.1629 [0.1485, 0.1774] |
| surprise | 0.0939 [0.0777, 0.1102] | 0.0994 [0.0827, 0.1157] |
| rnd | 0.0734 [0.0588, 0.0881] | 0.0721 [0.0577, 0.0866] |
| rho | 0.0723 [0.0570, 0.0874] | 0.0721 [0.0593, 0.0851] |
| progress | 0.0507 [0.0366, 0.0642] | 0.0635 [0.0503, 0.0779] |

Empty excess by side, same seeds. East is the historical contrast.

| explorer | east empty | west empty |
|---|---|---|
| random | 0.0000 [0.0000, 0.0000] | 0.0000 [0.0000, 0.0000] |
| count | 0.1576 [0.1435, 0.1718] | 0.1622 [0.1481, 0.1768] |
| surprise | 0.0890 [0.0724, 0.1048] | 0.0984 [0.0828, 0.1144] |
| rnd | 0.0725 [0.0581, 0.0866] | 0.0722 [0.0587, 0.0857] |
| rho | 0.0713 [0.0552, 0.0865] | 0.0669 [0.0537, 0.0799] |
| progress | 0.0514 [0.0366, 0.0654] | 0.0630 [0.0501, 0.0767] |

Target-room fraction, mean over learnability. These are not a test. Random on the east reproduces the noise-study base rate, 0.1457, on both arms.

| explorer | empty east | fed east | empty west | fed west |
|---|---|---|---|---|
| random | 0.1457 [0.1344, 0.1571] | 0.1457 [0.1353, 0.1572] | 0.1375 [0.1267, 0.1484] | 0.1375 [0.1264, 0.1490] |
| count | 0.3033 [0.2951, 0.3119] | 0.3041 [0.2959, 0.3124] | 0.2997 [0.2914, 0.3078] | 0.3003 [0.2914, 0.3092] |
| surprise | 0.2347 [0.2226, 0.2470] | 0.2397 [0.2272, 0.2526] | 0.2359 [0.2227, 0.2486] | 0.2368 [0.2232, 0.2503] |
| rnd | 0.2182 [0.2067, 0.2302] | 0.2191 [0.2077, 0.2305] | 0.2097 [0.1964, 0.2226] | 0.2096 [0.1970, 0.2216] |
| rho | 0.2171 [0.2052, 0.2288] | 0.2180 [0.2066, 0.2295] | 0.2044 [0.1918, 0.2162] | 0.2096 [0.1972, 0.2211] |
| progress | 0.1971 [0.1854, 0.2090] | 0.1965 [0.1839, 0.2089] | 0.2005 [0.1884, 0.2122] | 0.2010 [0.1885, 0.2132] |

Per learnability, orientation-averaged, not a pass bit. All twenty directed fed intervals lie entirely above 0. Nineteen of the twenty reductions include 0. Surprise at learnability 1 is −0.0139 [−0.0263, −0.0011]: the foods raised that cell's excess. The mean is the test, and the mean does not move.

Meals begun in the target room, mean over seeds, learnabilities, and orientations. Not a call. The fed means are not higher. The markers were not eaten.

| explorer | empty | fed |
|---|---|---|
| random | 0.084 | 0.084 |
| count | 0.383 | 0.366 |
| surprise | 0.223 | 0.215 |
| rnd | 0.177 | 0.174 |
| rho | 0.171 | 0.161 |
| progress | 0.146 | 0.146 |

Figure: `bench/fed/excess-by-explorer.png`.

No mechanism was added. `targetFoods` stays off. The default agent is unchanged. Both curiosity terms stay on. No Loop flag was added, and none was turned on. Five-seed bench, seeds 1–5, sha `d2780cb`, rho, transition still the only default-on flag. Field probe early 0.1222, Field probe late 0.1079, Field on-policy ema 0.1641 → 0.0704, Field foods 5.60, Field lives 0.80, Rooms foods 7.00, Rooms lives 0.40. G1 2/5, G2 5/5, S1 4/5, S2 5/5, S3 5/5, C1 5/5, C2 5/5. G1 stays on the stricter probe rule and is not this claim. Source: `bench/latest.json`. Trend: `bench/history.csv`.

`npm test` passes. `tsc --noEmit` passes. The transition probe gate, 20 seeds, still passes: off − on 0.1234 [0.1150, 0.1307]. It was not this claim. `kernel.ts` is on the CI mechanism list, so the check was run.

### Next hypothesis

The five markers did not move the excess. On this map region 1 has 52 open cells and region 0 has 102. Equalize those counts, still with relevance 0, the five meals left in the large room, and no meals in the small room, and measure the excess over a random walk again. If equal cells close the gap, the attractor was the smaller room. If they do not, this contrast does not license another curiosity term.

## 2026-10-16 matched room (America/New_York)

Written before `npm run matched-room`. No target-room fraction from that command is in this block. The results section is filled in after the run. The five-seed bench is descriptive and is not this claim.

The policy-terms entry did not name a next hypothesis. The noise-room attraction is still measured against a random walk. This run is the geometry-matched control for that comparison. It adds no curiosity term and no Loop flag.

### Preregister matched room

The noise study, seeds 1–200, found that every directed explorer spends more time in the stationary white-noise east room than a random walk: count 0.1576, surprise 0.0890, RND 0.0725, rho 0.0713, each interval entirely above 0. The sampling-variance account was refuted. The policy-terms ablation left pure-progress rho above a random walk as well, 0.0514 [0.0366, 0.0659]. Those contrasts share a walk that does not know which room is which. The extra time could be the room: it is the small one, the far one, the one without food, and it sits on the east.

Hypothesis. The extra time is a preference for the noise. Replace the noise with one frozen fair-bit picture of the same cells, and reflect the map so the room also sits on the west. Each directed explorer still spends more time in the noise room than in that frozen room.

The frozen picture is one iid draw per seed, `mulberry32(seed ^ 0x5a17)`, written into region 1 after the shell is built and then held. The constant is `STATIC_DRAW_SALT`. The noise room keeps the shipped process: a fresh fair bit on every region-1 cell every step. The static arm still draws those bits and discards them, so the episode RNG stays aligned. A random walk ignores observations, so it walks the same path in both arms. Count novelty is the visit count of those same cells, so it matches at the first visit. An untrained predictor at one half gives the same expected error to any fair-bit window, so first-visit surprise matches in distribution. The pictures are not paired pixel for pixel. Pairing them would make the static image depend on when the agent arrived.

A low-frequency pattern was the other static room on offer. A 5×5 window sees its period, so the first glance is already easier than white noise. That mixes compressibility with stationarity. The frozen fair-bit picture keeps the single-frame marginal and changes only the time axis. If 400 steps cannot learn that picture, the contrast can come out null. That is a result this design accepts. It is not a reason to switch patterns after the run.

The two rooms of one map are not the same size. Region 1 is four interior columns. The other room is eight, with the five foods and the interior walls. The door is the same seven rows, centered. Unmirrored, the divider is x = 9 and region 1 is east. Mirrored, the divider is x = 5 and region 1 is west. Spawn stays in region 0, the large room, doorway included. The contrast does not need the two rooms to match each other. Noise and static share one room by identity, and the mirror counterbalances which side that room is on.

The map otherwise matches the noise study. Layout seed 3000. Drift 0. Relevance 0. Amplitude 1. Window 50. Estimator ema. Learnability {0, 1/3, 2/3, 1}. Episodes are 400 steps. Seeds 1–200. The other room's learnability mix is unchanged.

Explorers. Random, count, surprise, RND, shipped rho, and pure-progress rho. Pure-progress rho is the policy-terms arm `progress`: uncertainty off, horizon residual drop off, progress kept as the shipped rectified ema − surprise. Random is the negative control. The other five are the directed set. No explorer is retuned. The default agent stays window-50 rho with both curiosity terms on. This is not a Loop flag. No probe gate is required to keep a default, because the default does not change. Field probe late from `npm run bench:json`, seeds 1–5, is reported in the results and is not a pass bit. G1 stays on the probe rule and is not this claim.

Primary metric. Target-room fraction, the fraction of steps that began in region 1. For each seed, explorer, and orientation, average that fraction over the four learnabilities. Excess at an orientation is noise minus static on that seed. The test excess averages the two orientations, still one number per seed. Paired 95% percentile bootstrap, 2000 resamples. Salts are fixed in `scripts/matched.ts`: test excess 3101 random, 3102 count, 3103 surprise, 3104 RND, 3105 shipped rho, 3106 pure-progress. East salts are 3111 through 3116 in that order. West salts are 3121 through 3126. Per-learnability salts are 3200 + 10 × explorer index + learnability index, with the same explorer order and learnability index 0, 1, 2, 3. Fraction intervals use salts 3401 upward and are not a test. The surprise diagnostic uses salt 3501.

Calls use `matchedContentCall`, which is the same rule as `greaterCall`. Confirmed if the CI lies entirely above 0: the explorer prefers the noise room to the matched static room. Refuted if the CI lies entirely below 0: it prefers the static room. A CI that includes 0, including a CI of [0, 0], is inconclusive. The test excess is the only pass bit. East, west, and the four learnabilities are reported and are not a second chance. A disagreement between the two orientations does not void the average. The average is the counterbalanced estimate.

Negative control. Random's test excess. A walk that ignores observations has nothing to prefer, and the aligned RNG makes the two paths the same, so the excess is zero and the CI is [0, 0]. That interval does not exclude 0. `greaterCall` on it is inconclusive, which is the right call, and the control is not confounded. If the CI does exclude 0, content moved a walk that does not read it. The summary is then confounded, and no directed call is interpreted as a content effect. The calls are still printed.

Summary label, from `matchedSummary`, not a second test. Confounded if the random CI excludes 0. Otherwise, if every directed call is confirmed: noise. If every directed call is refuted: static. If every directed call is inconclusive: inconclusive. Any other mix: mixed. The per-explorer calls are the result in every case.

Surprise diagnostic, shipped rho only, not a call. Training surprise on steps that began in the target room. A cell with no such step on either arm is skipped. A seed's number is the mean of the remaining (noise − static) cells across both orientations and the four learnabilities. A seed with no remaining cell is dropped. The CI uses salt 3501. Report n. It cannot rescue or overturn a primary call.

Figure: `bench/matched/excess-by-explorer.png`. Both orientations and the paired average, per explorer, with the CIs. Source: `bench/matched/matched.json`. The sweep is `npm run matched-room`. It is not part of CI.

### Results

19200 episodes, 400 steps, 4 workers, 886 seconds. Source: `bench/matched/matched.json`. The unmirrored noise arm is the noise-study episode: all 4000 shipped rows match `bench/noise/noise.csv`.

#### Summary. Inconclusive.

Every directed call includes 0. The random control is a point mass at 0, so the summary is not confounded. The hypothesis, that each directed explorer still prefers the noise room, is not confirmed. It is not refuted either: no directed interval lies entirely below 0.

Test excess, noise minus static, mean of the two orientations:

| explorer | excess | call |
|---|---|---|
| random | 0.0000 [0.0000, 0.0000] | inconclusive |
| count | 0.0014 [−0.0056, 0.0085] | inconclusive |
| surprise | 0.0012 [−0.0072, 0.0099] | inconclusive |
| rnd | 0.0035 [−0.0020, 0.0093] | inconclusive |
| rho | −0.0019 [−0.0079, 0.0043] | inconclusive |
| progress | 0.0005 [−0.0029, 0.0041] | inconclusive |

The intervals sit on zero. Their upper ends are all below 0.01. The excesses versus a random walk in the noise study were 0.1576, 0.0890, 0.0725, and 0.0713, and pure-progress was 0.0514. Those gaps are not a preference for noise over the same room frozen. That comparison was not a second pass bit. It is what these intervals exclude.

Orientations, reported and not a pass bit. East is the historical side. West is the mirror.

| explorer | east | west |
|---|---|---|
| random | 0.0000 [0.0000, 0.0000] | 0.0000 [0.0000, 0.0000] |
| count | 0.0013 [−0.0090, 0.0119] | 0.0014 [−0.0093, 0.0119] |
| surprise | −0.0074 [−0.0184, 0.0037] | 0.0098 [−0.0021, 0.0213] |
| rnd | 0.0047 [−0.0042, 0.0137] | 0.0023 [−0.0063, 0.0109] |
| rho | −0.0009 [−0.0102, 0.0086] | −0.0029 [−0.0123, 0.0060] |
| progress | 0.0010 [−0.0037, 0.0057] | 0.0000 [−0.0053, 0.0057] |

Surprise is the only explorer whose two orientations point opposite ways. Both intervals include 0, and the average includes 0. The mirror did not have to agree. The average is the test.

Target-room fraction, mean over learnability. These are not a test. Random on the east reproduces the noise-study base rate, 0.1457. On the west the same walk sits at 0.1375 [0.1260, 0.1485]. The two intervals overlap. Within each side, noise and static are the same path, so the content excess is zero.

| explorer | noise east | static east | noise west | static west |
|---|---|---|---|---|
| random | 0.1457 [0.1347, 0.1572] | 0.1457 [0.1347, 0.1570] | 0.1375 [0.1260, 0.1485] | 0.1375 [0.1260, 0.1491] |
| count | 0.3033 [0.2945, 0.3115] | 0.3020 [0.2935, 0.3107] | 0.2997 [0.2914, 0.3079] | 0.2983 [0.2893, 0.3073] |
| surprise | 0.2347 [0.2229, 0.2460] | 0.2421 [0.2305, 0.2549] | 0.2359 [0.2232, 0.2490] | 0.2261 [0.2138, 0.2388] |
| rnd | 0.2182 [0.2071, 0.2299] | 0.2136 [0.2024, 0.2250] | 0.2097 [0.1957, 0.2229] | 0.2074 [0.1954, 0.2206] |
| rho | 0.2171 [0.2053, 0.2291] | 0.2179 [0.2058, 0.2302] | 0.2044 [0.1925, 0.2169] | 0.2073 [0.1948, 0.2193] |
| progress | 0.1971 [0.1851, 0.2097] | 0.1961 [0.1833, 0.2087] | 0.2005 [0.1883, 0.2125] | 0.2005 [0.1891, 0.2116] |

Count, surprise, RND, rho, and pure-progress rho all sit above the random walk in the frozen room as well as in the noise room. The gap versus the walk is the room.

Per learnability, orientation-averaged, not a pass bit. Three cells exclude zero. Count at learnability 0 is 0.0155 [0.0012, 0.0293]. Surprise at learnability 0 is −0.0164 [−0.0298, −0.0028]. Pure-progress at learnability 1/3 is −0.0084 [−0.0160, −0.0015]. The other seventeen include zero. The mean is the test, and the mean does not move.

Surprise diagnostic, shipped rho, not a call. Noise minus static, on steps that began in the target room, n = 200 of 200: 0.0085 [0.0076, 0.0095]. The noise room is reliably more surprising. The content swap is visible to the learner. It does not move occupancy.

Figure: `bench/matched/excess-by-explorer.png`.

No mechanism was added. The default agent is unchanged. Both curiosity terms stay on. No Loop flag was added, and none was turned on. Five-seed bench, seeds 1–5, sha of the preregistration commit, rho, transition still the only default-on flag. Field probe early 0.1222, Field probe late 0.1079, Field on-policy ema 0.1641 → 0.0704, Field foods 5.60, Field lives 0.80, Rooms foods 7.00, Rooms lives 0.40. G1 2/5, G2 5/5, S1 4/5, S2 5/5, S3 5/5, C1 5/5, C2 5/5. G1 stays on the stricter probe rule and is not this claim. Source: `bench/latest.json`. Trend: `bench/history.csv`.

`npm test` passes. `tsc --noEmit` passes.

### Next hypothesis

The excess over a random walk survived a frozen picture of the same room, on both sides of the map. It is not the noise. The next measurement should ask what about the room it is. The small room has no food and about half the cells. Give that room the same five foods as the large room, still with relevance 0 so the bits are not meals, and measure the excess over a random walk again. If the foods close the gap, the attractor was an empty room. If they do not, equalize the cell counts before adding another curiosity term.

## 2026-10-15 policy terms (America/New_York)

Written before `npm run policy-terms`. No east-room fraction from that command is in this block. The results section is filled in after the run. The five-seed bench is descriptive and is not this claim.

### Preregister policy terms

The noise-progress study, seeds 1–200, found that rho spends more time in the stationary white-noise east room than a random walk: rho − random = 0.0713 [0.0564, 0.0863]. The sampling-variance account was refuted. Call (s) left two non-progress terms in the curiosity score: the horizon residual drop and the uncertainty term.

Hypothesis. Stationary-noise attraction is driven by those terms, not by progress itself. Removing both from the curiosity score, and keeping progress as the shipped rectified ema − surprise, reduces or eliminates rho's excess east-room time versus random on the same distractor map.

The map matches the noise study. Drift 0. Relevance 0. Window 50. Estimator ema. Noise amplitude 1. Learnability {0, 1/3, 2/3, 1}. Episodes are 400 steps. Seeds 1–200. The seed stream is `runNoiseEpisode`, so a shipped rho episode is the noise-study episode. A mismatch against `bench/noise/noise.csv` aborts the run.

Shipped curiosity score, unchanged and still the default:

- residual = expected residual of the predicted window (Bernoulli variance, times 4). That is the uncertainty term.
- explore = 0.7 × residual + 0.3 × visit-scent novelty.
- rho-hat starts at the scent and latent bonuses. Latent flags stay off. Scent rho-hat stays as shipped and is zero when its gate is shut.
- Horizon residual drop, added only when the signal is rho: max(0, residual at step 1 − residual of the best later window), and the same drop from that window to the third when the third window runs.
- prog = max(0, progressEma) + 0.55 × max(0, rho-hat).
- curious = curiosity × (0.75 × explore × (0.35 + 12 × prog) + 0.2 × explore).

Progress is ema − surprise. The policy rectifies the smoothed value, max(0, progressEma). That line stays. Progress does not rank actions by itself. It scales explore. Goal, cost, confidence, and the discounted follow-up values stay. Horizon-2 and horizon-3 planning still run.

Joint arm `progress`. Two deletions and nothing else:

- Uncertainty off. Residual is not added to explore, so explore = 0.3 × novelty. The 0.35 floor and the 0.2 × explore term stay, and they apply only to what remains.
- Horizon drop off. The two max(0, residual drop) additions are not added to rho-hat. Planning still runs. Follow-up scores use the same uncertainty switch.

The horizon drop changes a score only by increasing prog, and prog is multiplied by explore. If novelty is shut and uncertainty is off, explore is 0 and the drop cannot move the policy. The split is still read by the rule below. It is not re-interpreted after seeing which arm moved.

This is a measurement arm, `Kernel` option `curiosityScore`. It is not a Loop feature flag. The default is both terms on. The shipped agent stays window-50 rho. No probe gate is required to keep a default, because the default does not change. Field probeLate from `npm run bench:json`, seeds 1–5, is reported in the results and is not a pass bit.

Primary metric. East-room fraction, mean over the four learnabilities, one number per seed. Excess versus random is that number minus the random walk on the same seed. Paired 95% percentile bootstrap, 2000 resamples. Salts are fixed in `scripts/policy-terms.ts`: shipped − random 2101, progress − random 2102, shipped − progress 2103. Per-learnability salts start at 2110. Split salts are 2201 through 2204, and the per-learnability split salts start at 2210 and 2250.

- (j) Joint. Shipped rho, progress-only rho, and random. Seeds 1–200. S is shipped − random. A is progress − random. D is shipped − progress. Confirmed if S lies entirely above 0 and either A does not lie entirely above 0 or D lies entirely above 0. Refuted if A lies entirely above 0 and D does not lie entirely above 0. Inconclusive if S does not lie entirely above 0. Per-learnability splits are reported and are not a second chance.
- (split) Only if (j) is confirmed. Same seeds. `no-horizon` keeps uncertainty and removes the horizon drop. `no-uncertainty` removes uncertainty and keeps the horizon drop. Each arm is judged by the same rule as (j), with shipped as the uncut agent. Both confirmed: both terms reduce the attraction. Only `no-horizon` confirmed: the horizon residual drop carries it. Only `no-uncertainty` confirmed: the uncertainty term carries it. Both refuted: neither term alone carries it, and the conjunction does. That is still this dissection, not a new mechanism. Any other mix is inconclusive for the split, and the joint call stands. If (j) is refuted or inconclusive, the split is not run.

Figure: `bench/policy/excess-by-arm.png`. Source: `bench/policy/policy.json`. The sweep is `npm run policy-terms`. It is not part of CI.

### Results

4000 episodes, 400 steps, 4 workers, 158 seconds. Source: `bench/policy/policy.json`. Shipped rho and random match `bench/noise/noise.csv` on all 1600 rows, so the shipped mean is the noise-study mean. The interval endpoints are this run's salts.

#### (j) Joint. Confirmed.

The reduction clears zero. The elimination does not. Progress-only rho is still reliably above a random walk.

| contrast | east excess |
|---|---|
| shipped − random | 0.0713 [0.0558, 0.0862] |
| progress − random | 0.0514 [0.0366, 0.0659] |
| shipped − progress | 0.0200 [0.0055, 0.0348] |

The two terms together remove a reliable slice of the excess, 0.0200 of 0.0713, and leave 0.0514 [0.0366, 0.0659]. That remainder is still an attraction. This run does not name a further mechanism for it.

East-room fraction, mean over learnability:

| arm | east fraction |
|---|---|
| random | 0.1457 [0.1346, 0.1565] |
| shipped | 0.2171 [0.2057, 0.2295] |
| progress | 0.1971 [0.1851, 0.2098] |

Per learnability, reported and not a pass bit. Shipped − random at 0, 1/3, 2/3, and 1 is 0.0761 [0.0473, 0.1051], 0.0671 [0.0387, 0.0932], 0.0651 [0.0385, 0.0914], 0.0771 [0.0483, 0.1048]. Progress − random is 0.0539 [0.0239, 0.0836], 0.0465 [0.0199, 0.0713], 0.0587 [0.0274, 0.0896], 0.0463 [0.0197, 0.0721]. Shipped − progress is 0.0221 [−0.0063, 0.0503], 0.0206 [−0.0060, 0.0476], 0.0065 [−0.0225, 0.0342], 0.0308 [0.0038, 0.0586]. Only learnability 1 clears on the reduction. The mean is the test.

#### (split) Both. Each term reduces the attraction. Neither removes it.

The joint call was confirmed, so the split ran on the same seeds.

| arm | minus random | shipped minus arm |
|---|---|---|
| no-horizon | 0.0545 [0.0394, 0.0698] | 0.0169 [0.0043, 0.0291] |
| no-uncertainty | 0.0530 [0.0386, 0.0677] | 0.0183 [0.0046, 0.0329] |

Both single deletions are confirmed by the joint rule: the excess versus random stays entirely above 0, and the gap versus shipped is entirely above 0. The written call is that both terms reduce the attraction. The two gaps, 0.0169 and 0.0183, are each close to the joint gap of 0.0200. They are not a sum. That overlap was not a separate test.

East fraction: no-horizon 0.2002 [0.1888, 0.2113], no-uncertainty 0.1987 [0.1864, 0.2113].

Per learnability, not a pass bit. Removing the horizon drop at learnability 2/3 raises the point estimate (shipped − no-horizon = −0.0216 [−0.0475, 0.0048]). The interval includes 0. The other three horizon gaps are 0.0277 [−0.0004, 0.0559], 0.0261 [0.0016, 0.0517], and 0.0353 [0.0072, 0.0609]. The uncertainty gaps are 0.0138 [−0.0146, 0.0453], 0.0203 [−0.0056, 0.0471], 0.0215 [−0.0069, 0.0507], and 0.0177 [−0.0077, 0.0439]. None of those four clears zero. The mean does.

Figure: `bench/policy/excess-by-arm.png`.

The default agent is unchanged. Both terms stay on. No Loop flag was added, and none was turned on. Five-seed bench, seeds 1–5, rho, transition still the only default-on flag. Field probe early 0.1222, Field probe late 0.1079, Field on-policy ema 0.1641 → 0.0704, Field foods 5.60, Field lives 0.80, Rooms foods 7.00, Rooms lives 0.40. G1 2/5, G2 5/5, S1 4/5, S2 5/5, S3 5/5, C1 5/5, C2 5/5. G1 stays on the stricter probe rule and is not this claim. Source: `bench/latest.json`. Trend: `bench/history.csv`.

`npm test` passes. `tsc --noEmit` passes.

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
