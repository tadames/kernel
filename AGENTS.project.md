# Nightly research contract

This file is the job description for the autonomous research run. `AGENTS.md` says to follow it. The run is one experiment on the kernel in `src/lib/kernel/loop.ts`. It is not an App Builder preview.

Skip, every run: dev server, `startup.sh`, browser smoke, brand assets, PWA, og cards, auth, and database. Do not push to `main`.

## One run, one experiment

1. Read the newest entry under `# Journal` in `JOURNAL.md`. The **Next hypothesis** is the only experiment this run is allowed to start.
2. Run `npm run bench:json` first, on fixed seeds **1, 2, 3, 4, 5**, before writing a new mechanism. That command records every `Loop` feature flag (on vs off, same seeds, same weight init) on the canonical Field and Rooms maps. It does **not** decide whether a flag stays. The old 5% on-policy ema rule is retired.
3. Preregister before any mechanism run. In `JOURNAL.md`, above the results, write `### Preregister <flag>` with `hypothesis`, `metric: probeLate`, `direction: lower`, and `threshold`. The metric is late held-out probe error on Field. Lower is better. The threshold is a paired 95% bootstrap CI, not a 5% ema cut.
4. Run `npm run gate -- --flag <name> --seeds 20` (more seeds are allowed). The gate exits 0 only when, on identical seeds:
   - probe late error is lower with the flag on, and the paired CI of (off − on) lies entirely above zero
   - G2 and C2 do not lose a majority they held with the flag off
   - Field lives do not rise (the paired CI of on − off does not lie entirely above zero)
5. A flag that fails is reverted: default it off, leave the code, and journal the failure. A failed mechanism is a journal entry, not a fixture. Do not add a second mechanism in the same run.
6. Do not commit when any of these are true. Write the failure in the journal instead, and stop:
   - `src/lib/kernel/loop.ts` is under 2 KB
   - `npm test` fails
   - `npm run bench:json` exits non-zero
   - the preregistered gate was required and exits non-zero
   - a hard claim (G2, S1, S2, S3, C1, C2) loses a majority of seeds
7. Journal the run or do not claim it happened. The new entry is the first `##` block under the `# Journal` heading (newest first). It includes the preregistration, then a numbers table. No numbers, no entry. Columns that matter: Field probe early, Field probe late, Field on-policy ema, Field foods, Field lives, Rooms foods, Rooms lives, and G1 G2 S1 S2 S3 C1 C2. G1 is the probe claim. The on-policy ema is comparison only.
8. One commit. Author `Kernel Daily <kernel-daily@users.noreply.github.com>`. Branch `daily/YYYY-MM-DD`. Open one PR to `main`. The PR body has the hypothesis, the results table, what was kept and removed, and a link to the trend in `bench/history.csv`.
9. If seven daily rows show no drop in Field probe late error and no gain on G2 or lives, stop stacking curiosity terms. Take the next open problem in `RESEARCH.md` and say so in the journal.

## Bench

`npm run bench:json` writes `bench/latest.json` and appends `bench/history.csv` (date, sha, config, on-policy metrics, pass flags). Seeds are 1..5. They reseed weights and policy noise. The Field and Rooms **maps** are canonical (`layoutSeed` 1000 and 2000) so the held-out probe is the same environment the agent learns. Field and Rooms run 280 steps. Streams run 220. Weight init is reseeded per episode so a flag flip is the only change.

G1 is scored on the **probe**, not the on-policy ema. Late probe error must be **under that environment's per-cell-mean floor and** `< 0.85 ×` early probe error. The absolute `0.14` arm is retired: it sat between the sigmoid prior (0.250) and the mean floor (0.098 on Field, 0.114 on Rooms), so clearing it only showed that the net had left 0.5. Normalized skill is `(meanFloor − late) / (meanFloor − shiftCeiling)` and is reported beside the pass bit. Do not bring `0.14` back and do not lower the mean floor. The on-policy ema is stored beside the probe as `fieldEarly` / `fieldLate` and is not the claim. The bench exits non-zero when G2, S1, S2, S3, C1, or C2 loses a majority of seeds, or when `loop.ts` is under 2 KB. G1 is printed and stored either way.

The 5-seed table is descriptive. It does not keep or remove a flag. That decision is `npm run gate`.

`npm run sweep` runs the curiosity signals (`random`, `count`, `surprise`, `rnd`, `rho`) on identical seeds and writes `bench/sweep.json`, `bench/sweep.csv`, and `bench/sweep.md` with means, 95% bootstrap CIs, and paired differences. Default is 20 seeds. `--seeds` can be raised into the thousands. Workers default to the machine's cores.

`npm run bench:json -- --baseline-all` writes the fully-on stack to `bench/stack-ablation.json` and does not replace `latest.json`.

## Probes

`bench/probes/field.json` and `bench/probes/rooms.json` are generated once from probe seed `20261015`. Each file holds uniform-random-policy rollouts and uniformly sampled states. Checkpoints every 40 steps score them with frozen weights. A unit test fails if the files drift from the generator.

## Signals

`Kernel` takes `signal` in its options: `random`, `count` (1/√n), `surprise` (imagined forward error), `rnd` (frozen random target plus a predictor), `rho` (compression progress, the default). The world model is the same learner. Only the intrinsic term changes. `EnvSpec.params` is `learnability`, `driftRate`, and `distractorRelevance`. On the `distractor` map those parameters are live: learnability is the fraction of west cells with a fixed pattern, drift 0 is stationary white noise in the east room, and a positive drift is the probability per step that the east pattern is redrawn. Relevance 0 is not food; relevance 1 is edible. A positive drift on a static map, with no family memory, still throws. The phase sweep is `npm run phase` and is not part of CI. Rho's progress baseline is an EMA with time constant 50 steps. `npm run noise` reruns the stationary-noise cell and varies that window. It is not part of CI.

## Flags

`Loop` takes `features` as its fifth argument. `Kernel` takes the same object as its third, and options as its fourth. Defaults live in `DEFAULT_LOOP_FEATURES`. A term that is off does not enter the progress bonus. Learning-side flags (`encoder`, `slowEncoder`, `encoderMix`, `wake`, `discard`) skip that update. `transition` is also learning-side: it commits the pre-move window and steps the cell net at `TRANSITION_LR`, so the loss matches the probe. It does not enter the bonus. `discard` is learning-side too: after 40 training steps it drops a non-scent channel from the cell loss when the model's residual is not below that channel's running mean. It does not enter the bonus and defaults off. `decode` is learning-side and off by default: the first layer matches a stop-grad code of the next window, the second layer decodes the hidden to cells so the probe can score it, and the encoder is trained so that readout can decode the code. It does not enter the bonus. `option` is action-side and on by default: the sampled direction is executed again on the next tick, and the second tick does not sample. The probe gate kept it (seeds 1–20 and seeds 1–200). The off path draws no extra random number. It does not enter the bonus. `rollout` is action-side and off by default: the option's second tick executes the horizon-2 follow-up imagined at the commitment instead of repeating the primitive. Seeds 1–20, off minus on was −0.0130 [−0.0234, −0.0018], and lives on minus off were 0.65 [0.40, 0.85]. The flag stays off. It does not enter the bonus. The off path is the shipped option. `revise` is learning-side and off by default: the cell step is a gain on the passed rate, starting at 1, multiplied by 1.05 when progress is positive and divided by 1.05 when it is negative, clipped to `[1/TRANSITION_LR, TRANSITION_LR]`. Seeds 1–20, off minus on was −0.0090 [−0.0195, 0.0034]. The interval includes zero. Lives on minus off were 0.00 [−0.25, 0.30]. The flag stays off. It does not enter the bonus. The off path steps at the passed rate. Calling the rho-hat method directly still runs the trace, so a unit test can opt in.

## Claims

| ID | Pass |
|---|---|
| G1 | Field probe late is under the per-cell-mean floor **and** `< 0.85 ×` probe early. Skill is reported. On-policy ema is not the claim. |
| G2 | Adjacent food is taken (action east, a meal, or x = 6) |
| S1 | Structured stream late `< 0.05` or `< 0.25 ×` early |
| S2 | Noise late `> 0.15` |
| S3 | Structured late `< 0.35 ×` noise late |
| C1 | Structured commitment grows; noise commitment stays low |
| C2 | Field branching after burn-in is between 1.6 and 4.6 |

S1–S3 and C1 stay on the exogenous streams. The agent does not choose those bits, so they are not dark-room scores. G1 is the grid compression claim and uses the probe.

## CI

`.github/workflows/ci.yml` runs install, typecheck, `npm test`, and `npm run bench:json` on push and pull request. It also fails if `loop.ts` is under 2 KB. Pull requests that touch a kernel mechanism file (`loop.ts`, `policy.ts`, `signals.ts`, `kernel.ts`, `scent-rho-hat.ts`, `horizon.ts`) run `npm run gate -- --ci`: every flag that still defaults on must already be preregistered and must pass the probe gate on 20 seeds. If no flag defaults on, that job passes. The nightly run uses the same gate on the proposed flag before commit. `npm test` is the TypeScript suite: kernel claims, probe, stats, auth, app-data. `npm run test:platform` is the App Builder script suite; several of those cases read the gitignored `.grok/` tree and are not the nightly gate. Branch protection on `main` that requires this check is a repository setting. This file cannot turn that on.
