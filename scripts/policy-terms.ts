/**
 * Horizon residual-drop and uncertainty ablation. Not part of CI.
 *
 *   npm run policy-terms
 *
 * Joint arm first: shipped rho, progress-only rho, random.
 * If that call is confirmed, the same seeds ablate each term alone.
 *
 * Writes bench/policy/policy.json, policy.csv, excess-by-arm.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { LEARNABILITY_GRID } from "../src/lib/kernel/family.ts";
import { policySplitCall, policyTermsCall, type Call, type SplitCall } from "../src/lib/kernel/noise.ts";
import {
  curiosityScoreForArm,
  type NoiseRequest,
  type NoiseResult,
  type PolicyArm,
} from "../src/lib/kernel/noise-run.ts";
import { SHIPPED_PROGRESS_WINDOW } from "../src/lib/kernel/progress.ts";
import type { CuriositySignal } from "../src/lib/kernel/signals.ts";
import { bootstrapMeanCI, pairedDifference, type Interval, type Paired } from "../src/lib/kernel/stats.ts";
import { drawText, fillRect, scaleNearest, writePng } from "./png.ts";
import { runPool, workerCount } from "./pool.ts";

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) return fallback;
  return process.argv[i + 1]!;
}

type RGB = [number, number, number];

const ARM_LABEL: Record<PolicyArm, string> = {
  shipped: "shipped",
  progress: "progress",
  "no-horizon": "no drop",
  "no-uncertainty": "no unc",
};

const ARM_COLOR: Record<PolicyArm, RGB> = {
  shipped: [186, 42, 58],
  progress: [36, 104, 196],
  "no-horizon": [196, 122, 36],
  "no-uncertainty": [36, 140, 90],
};

function fmt(ci: { mean: number; lo: number; hi: number }) {
  return `${ci.mean.toFixed(4)} [${ci.lo.toFixed(4)}, ${ci.hi.toFixed(4)}]`;
}

function learnKey(value: number) {
  return Math.round(value * 1e6) / 1e6;
}

function keyOf(arm: PolicyArm, signal: CuriositySignal, seed: number, learnability: number) {
  return `${arm}|${signal}|${seed}|${learnKey(learnability)}`;
}

function series(
  index: Map<string, NoiseResult>,
  arm: PolicyArm,
  signal: CuriositySignal,
  seeds: number[],
  learns: readonly number[],
) {
  return seeds.map((seed) => {
    let sum = 0;
    for (const learn of learns) {
      const row = index.get(keyOf(arm, signal, seed, learn));
      if (!row) throw new Error(`missing ${arm} ${signal} seed ${seed} learn ${learn}`);
      sum += row.distractorFrac;
    }
    return sum / learns.length;
  });
}

function oneLearn(
  index: Map<string, NoiseResult>,
  arm: PolicyArm,
  signal: CuriositySignal,
  seeds: number[],
  learnability: number,
) {
  return series(index, arm, signal, seeds, [learnability]);
}

/**
 * Shipped rho and random must be the noise-study episodes. The csv stores
 * six decimals, so a step of 1/400 still matches.
 */
function assertMatchesNoiseCsv(rows: NoiseResult[]) {
  const text = readFileSync("bench/noise/noise.csv", "utf8").trim().split("\n");
  const header = text[0]!.split(",");
  const col = Object.fromEntries(header.map((name, i) => [name, i]));
  const stored = new Map<string, number>();
  for (const line of text.slice(1)) {
    const cell = line.split(",");
    if (cell[col.window!] !== "50" || cell[col.mode!] !== "ema") continue;
    if (cell[col.amplitude!] !== "1" || cell[col.relevance!] !== "0") continue;
    const signal = cell[col.signal!];
    if (signal !== "rho" && signal !== "random") continue;
    const learn = learnKey(Number(cell[col.learnability!]));
    stored.set(`${signal}|${cell[col.seed!]}|${learn}`, Number(cell[col.distractor_frac!]));
  }
  let n = 0;
  const bad: string[] = [];
  for (const row of rows) {
    if (row.policyArm !== "shipped") continue;
    if (row.signal !== "rho" && row.signal !== "random") continue;
    const prev = stored.get(`${row.signal}|${row.seed}|${learnKey(row.learnability)}`);
    if (prev == null) continue;
    n += 1;
    if (Math.abs(prev - row.distractorFrac) > 5e-7) {
      bad.push(`${row.signal} seed ${row.seed} learn ${row.learnability}: ${row.distractorFrac} vs ${prev}`);
    }
  }
  if (n === 0) throw new Error("noise.csv has no shipped rows to check");
  if (bad.length) {
    throw new Error(`shipped episodes diverged from bench/noise/noise.csv\n${bad.slice(0, 8).join("\n")}`);
  }
  console.error(`shipped episodes match noise.csv (${n})`);
}

type ArmPoint = { arm: PolicyArm; mean: number; lo: number; hi: number };

function drawBars(points: ArmPoint[]) {
  const width = 640;
  const height = 420;
  const rgba = new Uint8Array(width * height * 4);
  rgba.fill(255);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  const left = 58;
  const right = width - 24;
  const top = 36;
  const bottom = height - 48;
  drawText(rgba, width, 8, 8, "excess east time", [30, 30, 30]);
  let yMin = 0;
  let yMax = 0.02;
  for (const point of points) {
    yMin = Math.min(yMin, point.lo, point.mean);
    yMax = Math.max(yMax, point.hi, point.mean);
  }
  const pad = Math.max(0.01, (yMax - yMin) * 0.18);
  yMin -= pad;
  yMax += pad;
  const yOf = (value: number) => bottom - ((value - yMin) / (yMax - yMin)) * (bottom - top);
  const zero = yOf(0);
  for (let x = left; x <= right; x += 4) {
    const i = (Math.round(zero) * width + x) * 4;
    if (i < 0 || i + 3 >= rgba.length) continue;
    rgba[i] = 180;
    rgba[i + 1] = 180;
    rgba[i + 2] = 180;
    rgba[i + 3] = 255;
  }
  drawText(rgba, width, 8, zero - 3, "0", [80, 80, 80]);
  const slot = (right - left) / points.length;
  points.forEach((point, i) => {
    const cx = left + slot * (i + 0.5);
    const yMean = yOf(point.mean);
    const yLo = yOf(point.lo);
    const yHi = yOf(point.hi);
    const color = ARM_COLOR[point.arm];
    const barW = Math.min(46, slot * 0.55);
    const topY = Math.min(yMean, zero);
    const barH = Math.max(1, Math.abs(yMean - zero));
    fillRect(rgba, width, cx - barW / 2, topY, barW, barH, color);
    const xLine = Math.round(cx);
    for (let y = Math.round(Math.min(yLo, yHi)); y <= Math.round(Math.max(yLo, yHi)); y++) {
      const pi = (y * width + xLine) * 4;
      if (pi < 0 || pi + 3 >= rgba.length) continue;
      rgba[pi] = 30;
      rgba[pi + 1] = 30;
      rgba[pi + 2] = 30;
      rgba[pi + 3] = 255;
    }
    fillRect(rgba, width, cx - 6, yHi - 1, 12, 2, [30, 30, 30]);
    fillRect(rgba, width, cx - 6, yLo - 1, 12, 2, [30, 30, 30]);
    drawText(rgba, width, cx - 24, bottom + 10, ARM_LABEL[point.arm], [30, 30, 30]);
    drawText(rgba, width, cx - 24, top + 8, point.mean.toFixed(3), color);
  });
  const scaled = scaleNearest(rgba, width, height, 2);
  return writePng(scaled.width, scaled.height, scaled.rgba);
}

function pushJobs(
  jobs: NoiseRequest[],
  learns: readonly number[],
  seeds: number,
  steps: number,
  arms: { signal: CuriositySignal; policyArm: PolicyArm }[],
) {
  let id = jobs.length;
  for (const learnability of learns) {
    for (let seed = 1; seed <= seeds; seed++) {
      for (const arm of arms) {
        jobs.push({
          id: id++,
          seed,
          signal: arm.signal,
          steps,
          learnability,
          driftRate: 0,
          distractorRelevance: 0,
          progressWindow: SHIPPED_PROGRESS_WINDOW,
          progressMode: "ema",
          noiseAmplitude: 1,
          traceHist: false,
          policyArm: arm.policyArm,
        });
      }
    }
  }
}

async function runJobs(jobs: NoiseRequest[], workers: number) {
  console.error(`policy-terms ${jobs.length} episodes, ${workers} workers, ${jobs[0]?.steps ?? 0} steps`);
  const t0 = Date.now();
  const rows = await runPool<NoiseRequest, NoiseResult>(jobs, new URL("./noise-worker.ts", import.meta.url), workers);
  console.error(`batch finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return rows;
}

type Contrast = {
  label: string;
  interval: Paired | Interval;
  call?: Call;
};

function perLearnTable(
  index: Map<string, NoiseResult>,
  seeds: number[],
  learns: readonly number[],
  arm: PolicyArm,
  salt0: number,
) {
  const random = (learn: number) => oneLearn(index, "shipped", "random", seeds, learn);
  const shipped = (learn: number) => oneLearn(index, "shipped", "rho", seeds, learn);
  const ablated = (learn: number) => oneLearn(index, arm, "rho", seeds, learn);
  return learns.map((learnability, i) => ({
    learnability,
    shippedMinusRandom: pairedDifference(shipped(learnability), random(learnability), salt0 + i),
    armMinusRandom: pairedDifference(ablated(learnability), random(learnability), salt0 + 10 + i),
    shippedMinusArm: pairedDifference(shipped(learnability), ablated(learnability), salt0 + 20 + i),
  }));
}

async function main() {
  const seedsN = Math.max(1, Number(arg("seeds", "200")));
  const steps = Math.max(1, Number(arg("steps", "400")));
  const workers = workerCount(Number(arg("workers", "0")));
  const learns = [...LEARNABILITY_GRID];
  const seeds = Array.from({ length: seedsN }, (_, i) => i + 1);
  const t0 = Date.now();

  const primaryJobs: NoiseRequest[] = [];
  pushJobs(primaryJobs, learns, seedsN, steps, [
    { signal: "random", policyArm: "shipped" },
    { signal: "rho", policyArm: "shipped" },
    { signal: "rho", policyArm: "progress" },
  ]);
  const primaryRows = await runJobs(primaryJobs, workers);
  if (seedsN >= 200 && steps === 400) assertMatchesNoiseCsv(primaryRows);

  const index = new Map(primaryRows.map((row) => [keyOf(row.policyArm, row.signal, row.seed, row.learnability), row]));
  const random = series(index, "shipped", "random", seeds, learns);
  const shipped = series(index, "shipped", "rho", seeds, learns);
  const progress = series(index, "progress", "rho", seeds, learns);
  const shippedMinusRandom = pairedDifference(shipped, random, 2101);
  const progressMinusRandom = pairedDifference(progress, random, 2102);
  const shippedMinusProgress = pairedDifference(shipped, progress, 2103);
  const joint = policyTermsCall(shippedMinusRandom, progressMinusRandom, shippedMinusProgress);
  console.error(`(j) ${joint}`);
  console.error(`shipped - random ${fmt(shippedMinusRandom)}`);
  console.error(`progress - random ${fmt(progressMinusRandom)}`);
  console.error(`shipped - progress ${fmt(shippedMinusProgress)}`);

  const fractions: { arm: string; interval: Interval }[] = [
    { arm: "random", interval: bootstrapMeanCI(random, 2000, 0.05, 2301) },
    { arm: "shipped", interval: bootstrapMeanCI(shipped, 2000, 0.05, 2302) },
    { arm: "progress", interval: bootstrapMeanCI(progress, 2000, 0.05, 2303) },
  ];

  let splitRows: NoiseResult[] = [];
  let split: SplitCall | null = null;
  let horizonCall: Call | null = null;
  let uncertaintyCall: Call | null = null;
  let noHorizonMinusRandom: Paired | null = null;
  let shippedMinusNoHorizon: Paired | null = null;
  let noUncertaintyMinusRandom: Paired | null = null;
  let shippedMinusNoUncertainty: Paired | null = null;
  let noHorizon: number[] | null = null;
  let noUncertainty: number[] | null = null;

  if (joint === "confirmed") {
    const splitJobs: NoiseRequest[] = [];
    pushJobs(splitJobs, learns, seedsN, steps, [
      { signal: "rho", policyArm: "no-horizon" },
      { signal: "rho", policyArm: "no-uncertainty" },
    ]);
    splitRows = await runJobs(splitJobs, workers);
    for (const row of splitRows) index.set(keyOf(row.policyArm, row.signal, row.seed, row.learnability), row);
    noHorizon = series(index, "no-horizon", "rho", seeds, learns);
    noUncertainty = series(index, "no-uncertainty", "rho", seeds, learns);
    noHorizonMinusRandom = pairedDifference(noHorizon, random, 2201);
    shippedMinusNoHorizon = pairedDifference(shipped, noHorizon, 2202);
    noUncertaintyMinusRandom = pairedDifference(noUncertainty, random, 2203);
    shippedMinusNoUncertainty = pairedDifference(shipped, noUncertainty, 2204);
    horizonCall = policyTermsCall(shippedMinusRandom, noHorizonMinusRandom, shippedMinusNoHorizon);
    uncertaintyCall = policyTermsCall(shippedMinusRandom, noUncertaintyMinusRandom, shippedMinusNoUncertainty);
    split = policySplitCall(horizonCall, uncertaintyCall);
    fractions.push(
      { arm: "no-horizon", interval: bootstrapMeanCI(noHorizon, 2000, 0.05, 2304) },
      { arm: "no-uncertainty", interval: bootstrapMeanCI(noUncertainty, 2000, 0.05, 2305) },
    );
    console.error(`(split) ${split} horizon ${horizonCall} uncertainty ${uncertaintyCall}`);
    console.error(`no-horizon - random ${fmt(noHorizonMinusRandom)}`);
    console.error(`shipped - no-horizon ${fmt(shippedMinusNoHorizon)}`);
    console.error(`no-uncertainty - random ${fmt(noUncertaintyMinusRandom)}`);
    console.error(`shipped - no-uncertainty ${fmt(shippedMinusNoUncertainty)}`);
  } else {
    console.error("split not run");
  }

  const points: ArmPoint[] = [
    { arm: "shipped", ...shippedMinusRandom },
    { arm: "progress", ...progressMinusRandom },
  ];
  if (noHorizonMinusRandom) points.push({ arm: "no-horizon", ...noHorizonMinusRandom });
  if (noUncertaintyMinusRandom) points.push({ arm: "no-uncertainty", ...noUncertaintyMinusRandom });

  const perLearnability = {
    progress: perLearnTable(index, seeds, learns, "progress", 2110),
    noHorizon: noHorizon ? perLearnTable(index, seeds, learns, "no-horizon", 2210) : null,
    noUncertainty: noUncertainty ? perLearnTable(index, seeds, learns, "no-uncertainty", 2250) : null,
  };

  const elapsedSec = (Date.now() - t0) / 1000;
  const report = {
    date: new Date().toISOString(),
    elapsedSec,
    steps,
    seeds: seedsN,
    learnability: learns,
    driftRate: 0,
    distractorRelevance: 0,
    progressWindow: SHIPPED_PROGRESS_WINDOW,
    progressMode: "ema",
    noiseAmplitude: 1,
    score: {
      shipped: curiosityScoreForArm("shipped"),
      progress: curiosityScoreForArm("progress"),
      noHorizon: curiosityScoreForArm("no-horizon"),
      noUncertainty: curiosityScoreForArm("no-uncertainty"),
    },
    salts: {
      shippedMinusRandom: 2101,
      progressMinusRandom: 2102,
      shippedMinusProgress: 2103,
      noHorizonMinusRandom: 2201,
      shippedMinusNoHorizon: 2202,
      noUncertaintyMinusRandom: 2203,
      shippedMinusNoUncertainty: 2204,
    },
    calls: { joint, split, horizon: horizonCall, uncertainty: uncertaintyCall },
    primary: {
      shippedMinusRandom,
      progressMinusRandom,
      shippedMinusProgress,
    },
    splitArms: {
      noHorizonMinusRandom,
      shippedMinusNoHorizon,
      noUncertaintyMinusRandom,
      shippedMinusNoUncertainty,
    },
    fractions,
    perLearnability,
    excessBySeed: {
      random,
      shipped,
      progress,
      noHorizon,
      noUncertainty,
    },
  };

  mkdirSync("bench/policy", { recursive: true });
  writeFileSync("bench/policy/policy.json", `${JSON.stringify(report)}\n`);
  writeFileSync("bench/policy/excess-by-arm.png", drawBars(points));
  const csv = ["arm,mean,lo,hi,call"];
  const lines: Contrast[] = [
    { label: "shipped-random", interval: shippedMinusRandom, call: joint },
    { label: "progress-random", interval: progressMinusRandom },
    { label: "shipped-progress", interval: shippedMinusProgress },
  ];
  if (noHorizonMinusRandom && shippedMinusNoHorizon && horizonCall) {
    lines.push(
      { label: "no-horizon-random", interval: noHorizonMinusRandom, call: horizonCall },
      { label: "shipped-no-horizon", interval: shippedMinusNoHorizon },
    );
  }
  if (noUncertaintyMinusRandom && shippedMinusNoUncertainty && uncertaintyCall) {
    lines.push(
      { label: "no-uncertainty-random", interval: noUncertaintyMinusRandom, call: uncertaintyCall },
      { label: "shipped-no-uncertainty", interval: shippedMinusNoUncertainty },
    );
  }
  for (const line of lines) {
    csv.push([line.label, line.interval.mean, line.interval.lo, line.interval.hi, line.call ?? ""].join(","));
  }
  writeFileSync("bench/policy/policy.csv", `${csv.join("\n")}\n`);
  console.log(JSON.stringify({ elapsedSec, calls: report.calls, primary: {
    shippedMinusRandom: fmt(shippedMinusRandom),
    progressMinusRandom: fmt(progressMinusRandom),
    shippedMinusProgress: fmt(shippedMinusProgress),
  }, split: split ? {
    split,
    noHorizonMinusRandom: noHorizonMinusRandom ? fmt(noHorizonMinusRandom) : null,
    shippedMinusNoHorizon: shippedMinusNoHorizon ? fmt(shippedMinusNoHorizon) : null,
    noUncertaintyMinusRandom: noUncertaintyMinusRandom ? fmt(noUncertaintyMinusRandom) : null,
    shippedMinusNoUncertainty: shippedMinusNoUncertainty ? fmt(shippedMinusNoUncertainty) : null,
  } : null, fractions: fractions.map((row) => ({ arm: row.arm, frac: fmt(row.interval) })) }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
