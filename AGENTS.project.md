# Nightly research contract

This file is the job description for the autonomous research run. `AGENTS.md` says to follow it. The run is one experiment on the kernel in `src/lib/kernel/loop.ts`. It is not an App Builder preview.

Skip, every run: dev server, `startup.sh`, browser smoke, brand assets, PWA, og cards, auth, and database. Do not push to `main`.

## One run, one experiment

1. Read the newest entry under `# Journal` in `JOURNAL.md`. The **Next hypothesis** is the only experiment this run is allowed to start.
2. Run `npm run bench:json` first, on fixed seeds **1, 2, 3, 4, 5**, before writing a new mechanism. That command ablates every `Loop` feature flag (on vs off, same seeds, same weight init).
3. Apply the ablation before adding anything:
   - Field late ema is better when it is **lower**.
   - A flag earns its place only when on beats off by **≥ 5%** on mean Field late ema: `(off − on) / off ≥ 0.05`, and the seed band agrees (`mean − stdev ≥ 0.05`).
   - **Remove** a term (default the flag off; keep the code) when its noise band is at or below zero, when it is a measured null (mean and spread both under half a point), when it drops the G2 pass count, or when it raises mean Field lives by ≥ 0.4. Prefer a net-negative diff over a flat one.
   - **Keep and flag** a term when the band crosses a gain but does not clear 5%, and G2 and lives are not clearly worse. Say "noisy" in the journal. Do not delete it that night.
4. Add a new mechanism only when every existing flag has a bench row. Put it behind a new boolean on `LoopFeatures`, defaulted so the ablation can turn it off, and measure it in the same run. One mechanism. No second idea.
5. Do not commit when any of these are true. Write the failure in the journal instead, and stop:
   - `src/lib/kernel/loop.ts` is under 2 KB
   - `npm test` fails
   - `npm run bench:json` exits non-zero
6. Journal the run or do not claim it happened. The new entry is the first `##` block under the `# Journal` heading (newest first). It includes a numbers table against the previous `bench/latest.json`. No numbers, no entry. Columns that matter: Field early ema, Field late ema, Field foods, Field lives, Rooms foods, Rooms lives, and G1 G2 S1 S2 S3 C1 C2.
7. One commit. Author `Kernel Daily <kernel-daily@users.noreply.github.com>`. Branch `daily/YYYY-MM-DD`. Open one PR to `main`. The PR body has the hypothesis, the results table, what was kept and removed, and a link to the trend in `bench/history.csv`.
8. If seven daily rows in `bench/history.csv` show no drop in Field late ema and no gain on G2 or lives, stop stacking curiosity terms. Take the next open problem in `RESEARCH.md` and say so in the journal.

## Bench

`npm run bench:json` writes `bench/latest.json` and appends `bench/history.csv` (date, sha, config, metrics, pass flags). Seeds are 1..5. Field and Rooms run 280 steps. Streams run 220. Weight init is reseeded per episode so a flag flip is the only change.

G1 (Field surprise falls) does **not** pass on these seeds yet: late ema sits near 0.23 against a line of `0.85 × early` or `0.14`. Record it. Do not loosen the threshold in `src/lib/kernel/experiments.ts`. The bench exits non-zero when G2, S1, S2, S3, C1, or C2 loses a majority of seeds, or when `loop.ts` is under 2 KB. G1 is printed and stored either way.

`npm run bench:json -- --baseline-all` writes the fully-on stack to `bench/stack-ablation.json` and does not replace `latest.json`.

## Flags

`Loop` takes `features` as its fifth argument. `Kernel` takes the same object as its third. Defaults live in `DEFAULT_LOOP_FEATURES`. A term that is off does not enter the progress bonus. Learning-side flags (`encoder`, `slowEncoder`, `encoderMix`, `wake`) skip that update. Calling the rho-hat method directly still runs the trace, so a unit test can opt in.

## Claims

| ID | Pass |
|---|---|
| G1 | Field late ema `< 0.85 ×` early, or late `< 0.14` |
| G2 | Adjacent food is taken (action east, a meal, or x = 6) |
| S1 | Structured stream late `< 0.05` or `< 0.25 ×` early |
| S2 | Noise late `> 0.15` |
| S3 | Structured late `< 0.35 ×` noise late |
| C1 | Structured commitment grows; noise commitment stays low |
| C2 | Field branching after burn-in is between 1.6 and 4.6 |

## CI

`.github/workflows/ci.yml` runs install, typecheck, `npm test`, and `npm run bench:json` on push and pull request. It also fails if `loop.ts` is under 2 KB. `npm test` is the TypeScript suite: kernel claims, auth, app-data. `npm run test:platform` is the App Builder script suite; several of those cases read the gitignored `.grok/` tree and are not the nightly gate. Branch protection on `main` that requires this check is a repository setting. This file cannot turn that on.
