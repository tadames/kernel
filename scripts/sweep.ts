/**
 * Seed sweep across curiosity signals.
 *
 *   npm run sweep
 *   npm run sweep -- --seeds 20 --envs field,rooms --signals random,count,surprise,rnd,rho
 *
 * Writes bench/sweep.json, bench/sweep.csv, and bench/sweep.md.
 * Probe error is lower-better. Coverage and food are higher-better.
 * Pairwise rows are paired differences on identical seeds.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { CURIOSITY_SIGNALS, isCuriositySignal, type CuriositySignal } from "../src/lib/kernel/signals.ts";
import type { EpisodeRequest, EpisodeResult, MeasuredEnv } from "../src/lib/kernel/measure.ts";
import { g1Baseline } from "../src/lib/kernel/experiments.ts";
import { bootstrapMeanCI, pairedDifference, type Interval } from "../src/lib/kernel/stats.ts";
import { runPool, workerCount } from "./pool.ts";

const METRICS = ["probeLate", "skill", "onPolicyLate", "distinctCells", "stateEntropy", "foods"] as const;
type Metric = (typeof METRICS)[number];

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) return fallback;
  return process.argv[i + 1]!;
}

function parseSignals(text: string): CuriositySignal[] {
  const parts = text.split(",").map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (!isCuriositySignal(part)) throw new Error(`unknown signal ${part}`);
  }
  return parts as CuriositySignal[];
}

function parseEnvs(text: string): MeasuredEnv[] {
  const parts = text.split(",").map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (part !== "field" && part !== "rooms") throw new Error(`unknown env ${part}`);
  }
  return parts as MeasuredEnv[];
}

function fmt(ci: Interval, digits = 3) {
  return `${ci.mean.toFixed(digits)} [${ci.lo.toFixed(digits)}, ${ci.hi.toFixed(digits)}]`;
}

function pick(row: EpisodeResult, metric: Metric) {
  return row[metric];
}

async function main() {
  const nSeeds = Math.max(1, Number(arg("seeds", "20")));
  const steps = Math.max(1, Number(arg("steps", "280")));
  const workers = workerCount(Number(arg("workers", "0")));
  const signals = parseSignals(arg("signals", CURIOSITY_SIGNALS.join(",")));
  const envs = parseEnvs(arg("envs", "field,rooms"));
  const seeds = Array.from({ length: nSeeds }, (_, i) => i + 1);
  const jobs: EpisodeRequest[] = [];
  let id = 0;
  for (const env of envs) {
    for (const signal of signals) {
      for (const seed of seeds) {
        jobs.push({ id: id++, env, seed, steps, signal });
      }
    }
  }
  console.error(`sweep ${jobs.length} episodes, ${workers} workers, ${steps} steps`);
  const t0 = Date.now();
  const rows = await runPool<EpisodeRequest, EpisodeResult>(
    jobs,
    new URL("./episode-worker.ts", import.meta.url),
    workers,
  );
  console.error(`sweep finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const summary = [];
  for (const env of envs) {
    for (const signal of signals) {
      const group = rows.filter((row) => row.env === env && row.signal === signal);
      const cell = (metric: Metric) => bootstrapMeanCI(group.map((row) => pick(row, metric)), 2000, 0.05, 11);
      const g1 = group.filter((row) => row.g1).length;
      summary.push({
        env,
        signal,
        n: group.length,
        probeLate: cell("probeLate"),
        probeEarly: bootstrapMeanCI(group.map((row) => row.probeEarly), 2000, 0.05, 12),
        onPolicyLate: cell("onPolicyLate"),
        onPolicyEarly: bootstrapMeanCI(group.map((row) => row.onPolicyEarly), 2000, 0.05, 13),
        distinctCells: cell("distinctCells"),
        stateEntropy: cell("stateEntropy"),
        foods: cell("foods"),
        lives: bootstrapMeanCI(group.map((row) => row.lives), 2000, 0.05, 14),
        skill: cell("skill"),
        g1: `${g1}/${group.length}`,
        meanFloor: g1Baseline(env).meanFloor,
        shiftCeiling: g1Baseline(env).shiftCeiling,
      });
    }
  }

  const pairwise = [];
  for (const env of envs) {
    for (let i = 0; i < signals.length; i++) {
      for (let j = i + 1; j < signals.length; j++) {
        const a = signals[i]!;
        const b = signals[j]!;
        const left = rows.filter((row) => row.env === env && row.signal === a).sort((x, y) => x.seed - y.seed);
        const right = rows.filter((row) => row.env === env && row.signal === b).sort((x, y) => x.seed - y.seed);
        for (const metric of METRICS) {
          const diff = pairedDifference(
            left.map((row) => pick(row, metric)),
            right.map((row) => pick(row, metric)),
            20 + i * 10 + j,
          );
          pairwise.push({ env, metric, a, b, diff: a + " − " + b, mean: diff.mean, lo: diff.lo, hi: diff.hi, excludesZero: diff.excludesZero });
        }
      }
    }
  }

  const report = {
    date: new Date().toISOString(),
    seeds,
    steps,
    probeEvery: 40,
    signals,
    envs,
    note: "probeLate is held-out prediction error (lower is better). G1 passes when late < the per-cell-mean floor and late < 0.85 × early. skill is (meanFloor − late) / (meanFloor − shiftCeiling). onPolicyLate is the legacy ema. Maps are canonical; seeds reseed weights and policy noise.",
    summary,
    pairwise,
    rows,
  };

  mkdirSync("bench", { recursive: true });
  writeFileSync("bench/sweep.json", `${JSON.stringify(report, null, 2)}\n`);

  const csvHeader = [
    "env",
    "signal",
    "seed",
    "probe_early",
    "probe_late",
    "on_policy_early",
    "on_policy_late",
    "distinct_cells",
    "state_entropy",
    "foods",
    "lives",
    "skill",
    "g1",
  ];
  const csv = [csvHeader.join(",")];
  for (const row of rows) {
    csv.push(
      [
        row.env,
        row.signal,
        row.seed,
        row.probeEarly,
        row.probeLate,
        row.onPolicyEarly,
        row.onPolicyLate,
        row.distinctCells,
        row.stateEntropy.toFixed(6),
        row.foods,
        row.lives,
        row.skill.toFixed(6),
        row.g1 ? 1 : 0,
      ].join(","),
    );
  }
  writeFileSync("bench/sweep.csv", `${csv.join("\n")}\n`);

  const md: string[] = [];
  md.push(`# Curiosity sweep`);
  md.push("");
  md.push(`${seeds.length} seeds, ${steps} steps. Probe error is lower-better. Intervals are 95% bootstrap CIs.`);
  md.push("");
  for (const env of envs) {
    md.push(`## ${env}`);
    md.push("");
    md.push("| signal | probe early | probe late | skill | on-policy ema | distinct cells | state entropy | foods | G1 |");
    md.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
    for (const row of summary.filter((item) => item.env === env)) {
      md.push(
        `| ${row.signal} | ${fmt(row.probeEarly)} | ${fmt(row.probeLate)} | ${fmt(row.skill, 3)} | ${fmt(row.onPolicyLate)} | ${fmt(row.distinctCells, 2)} | ${fmt(row.stateEntropy, 2)} | ${fmt(row.foods, 2)} | ${row.g1} |`,
      );
    }
    md.push("");
    md.push(`Paired differences on ${env} probe late (a − b). Negative means a has lower error.`);
    md.push("");
    md.push("| a | b | probe late a−b | excludes 0 |");
    md.push("|---|---|---:|---|");
    for (const pair of pairwise.filter((item) => item.env === env && item.metric === "probeLate")) {
      md.push(
        `| ${pair.a} | ${pair.b} | ${pair.mean.toFixed(4)} [${pair.lo.toFixed(4)}, ${pair.hi.toFixed(4)}] | ${pair.excludesZero ? "yes" : "no"} |`,
      );
    }
    md.push("");
  }
  writeFileSync("bench/sweep.md", `${md.join("\n")}\n`);
  console.log(md.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
