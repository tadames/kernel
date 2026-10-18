/**
 * Policy-temperature ablation. Not part of CI.
 *
 *   npm run sharp
 *
 * Rho at the PR #11 place bonus of 0.0169, temperature 0.15 against 0.45.
 * Field probe, lives, G2, and C2 are the safety arms. Writes
 * bench/sharp/sharp.json and excess-vs-temperature.png.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { PUBLISHED_RANDOM_FRACTION, type BoostRequest, type BoostResult } from "../src/lib/kernel/boost-run.ts";
import { adjacentFood, g2Pass } from "../src/lib/kernel/experiments.ts";
import { greaterCall, SHARP_POLICY_TEMPERATURE, SHIPPED_POLICY_TEMPERATURE, sharpVerdict } from "../src/lib/kernel/noise.ts";
import type { EpisodeRequest, EpisodeResult } from "../src/lib/kernel/measure.ts";
import { bootstrapMeanCI } from "../src/lib/kernel/stats.ts";
import { drawText, fillRect, scaleNearest, writePng } from "./png.ts";
import { runPool, workerCount } from "./pool.ts";

const GAIN_SALT = 7001;
const SHIPPED_SALT = 7002;
const SHARP_SALT = 7003;
const SCORE_SALT = 7004;
const PROBE_SALT = 7011;
const LIVES_SALT = 7012;
const FOODS_SALT = 7013;
const DOSE = 0.0169;
const FIELD_SEEDS = 20;
const FIELD_STEPS = 280;

function fmt(ci: { mean: number; lo: number; hi: number }) {
  return `${ci.mean.toFixed(4)} [${ci.lo.toFixed(4)}, ${ci.hi.toFixed(4)}]`;
}

function meanOf(xs: number[]) {
  let s = 0;
  for (const x of xs) s += x;
  return xs.length ? s / xs.length : 0;
}

type RGB = [number, number, number];

function drawBars(rows: { label: string; mean: number; lo: number; hi: number; color: RGB }[]) {
  const width = 720;
  const height = 420;
  const rgba = new Uint8Array(width * height * 4);
  rgba.fill(255);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  drawText(rgba, width, 8, 8, "rho excess at 0.0169", [30, 30, 30]);
  const left = 78;
  const right = width - 24;
  const top = 46;
  const bottom = height - 64;
  let yMin = 0;
  let yMax = 0.02;
  for (const row of rows) {
    yMin = Math.min(yMin, row.lo, row.mean);
    yMax = Math.max(yMax, row.hi, row.mean);
  }
  const pad = Math.max(0.005, (yMax - yMin) * 0.16);
  yMin -= pad;
  yMax += pad;
  const yOf = (value: number) => bottom - ((value - yMin) / (yMax - yMin)) * (bottom - top);
  const zero = yOf(0);
  for (let x = left; x <= right; x += 3) {
    const i = (Math.round(zero) * width + x) * 4;
    if (i < 0 || i + 3 >= rgba.length) continue;
    rgba[i] = 180;
    rgba[i + 1] = 180;
    rgba[i + 2] = 180;
    rgba[i + 3] = 255;
  }
  drawText(rgba, width, 8, Math.round(zero) - 3, "0", [80, 80, 80]);
  const slot = (right - left) / rows.length;
  rows.forEach((row, index) => {
    const cx = Math.round(left + slot * index + slot / 2);
    const yLo = Math.round(yOf(row.lo));
    const yHi = Math.round(yOf(row.hi));
    const yMean = Math.round(yOf(row.mean));
    for (let y = Math.min(yLo, yHi); y <= Math.max(yLo, yHi); y++) {
      const i = (y * width + cx) * 4;
      if (i < 0 || i + 3 >= rgba.length) continue;
      rgba[i] = row.color[0];
      rgba[i + 1] = row.color[1];
      rgba[i + 2] = row.color[2];
      rgba[i + 3] = 255;
    }
    fillRect(rgba, width, cx - 22, yHi - 1, 44, 2, row.color);
    fillRect(rgba, width, cx - 22, yLo - 1, 44, 2, row.color);
    fillRect(rgba, width, cx - 5, yMean - 5, 10, 10, row.color);
    drawText(rgba, width, cx - row.label.length * 3, bottom + 12, row.label, [30, 30, 30]);
    const text = row.mean.toFixed(3);
    drawText(rgba, width, cx - text.length * 3, bottom + 28, text, [30, 30, 30]);
  });
  const scaled = scaleNearest(rgba, width, height, 2);
  return writePng(scaled.width, scaled.height, scaled.rgba);
}

async function main() {
  const seedsN = 200;
  const steps = 400;
  const workers = workerCount(0);
  const seeds = Array.from({ length: seedsN }, (_, i) => i + 1);
  const temps = [SHIPPED_POLICY_TEMPERATURE, SHARP_POLICY_TEMPERATURE];
  const jobs: BoostRequest[] = [];
  let id = 0;
  for (const policyTemperature of temps) {
    for (const seed of seeds) {
      jobs.push({ id: id++, seed, signal: "random", steps, add: 0, policyTemperature });
      for (const add of [0, DOSE]) {
        jobs.push({ id: id++, seed, signal: "rho", steps, add, policyTemperature });
      }
    }
  }
  console.error(`sharp ${jobs.length} room episodes, ${workers} workers`);
  const t0 = Date.now();
  const rows = await runPool<BoostRequest, BoostResult>(jobs, new URL("./boost-worker.ts", import.meta.url), workers);
  if (rows.length !== jobs.length) throw new Error(`expected ${jobs.length} rows, got ${rows.length}`);
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (byId.size !== rows.length) throw new Error("duplicate boost ids");
  const jobAt = (signal: "random" | "rho", seed: number, add: number, temperature: number) => {
    const job = jobs.find((item) => item.signal === signal && item.seed === seed && item.add === add && item.policyTemperature === temperature);
    if (!job) throw new Error(`missing job ${signal} ${seed} ${add} ${temperature}`);
    const row = byId.get(job.id);
    if (!row) throw new Error(`missing row ${job.id}`);
    return row;
  };

  for (const seed of seeds) {
    const shipped = jobAt("random", seed, 0, SHIPPED_POLICY_TEMPERATURE);
    const sharp = jobAt("random", seed, 0, SHARP_POLICY_TEMPERATURE);
    if (shipped.distractorFrac !== sharp.distractorFrac || shipped.foods !== sharp.foods || shipped.lives !== sharp.lives) {
      throw new Error(`random walk diverged at seed ${seed}`);
    }
  }
  const randomMean = meanOf(seeds.map((seed) => jobAt("random", seed, 0, SHIPPED_POLICY_TEMPERATURE).distractorFrac));
  if (Math.abs(randomMean - PUBLISHED_RANDOM_FRACTION) > 1e-12) {
    throw new Error(`random fraction ${randomMean} is not the PR #11 walk ${PUBLISHED_RANDOM_FRACTION}`);
  }

  const excessAt = (temperature: number) =>
    seeds.map((seed) => {
      const boosted = jobAt("rho", seed, DOSE, temperature);
      const control = jobAt("rho", seed, 0, temperature);
      return boosted.distractorFrac - control.distractorFrac;
    });
  const scoreAt = (temperature: number) =>
    seeds.map((seed) => {
      const boosted = jobAt("rho", seed, DOSE, temperature);
      const control = jobAt("rho", seed, 0, temperature);
      return boosted.scoreGap - control.scoreGap;
    });
  const shippedExcess = excessAt(SHIPPED_POLICY_TEMPERATURE);
  const sharpExcess = excessAt(SHARP_POLICY_TEMPERATURE);
  const gain = sharpExcess.map((value, i) => value - shippedExcess[i]!);
  const scoreGain = scoreAt(SHARP_POLICY_TEMPERATURE).map((value, i) => value - scoreAt(SHIPPED_POLICY_TEMPERATURE)[i]!);
  const shippedCi = bootstrapMeanCI(shippedExcess, 2000, 0.05, SHIPPED_SALT);
  const sharpCi = bootstrapMeanCI(sharpExcess, 2000, 0.05, SHARP_SALT);
  const gainCi = bootstrapMeanCI(gain, 2000, 0.05, GAIN_SALT);
  const scoreCi = bootstrapMeanCI(scoreGain, 2000, 0.05, SCORE_SALT);

  const fieldSeeds = Array.from({ length: FIELD_SEEDS }, (_, i) => i + 1);
  const fieldJobs: EpisodeRequest[] = [];
  let fieldId = 0;
  for (const policyTemperature of temps) {
    for (const seed of fieldSeeds) {
      fieldJobs.push({
        id: fieldId++,
        env: "field",
        seed,
        steps: FIELD_STEPS,
        signal: "rho",
        policyTemperature,
      });
    }
  }
  console.error(`sharp ${fieldJobs.length} field episodes`);
  const fieldRows = await runPool<EpisodeRequest, EpisodeResult>(
    fieldJobs,
    new URL("./episode-worker.ts", import.meta.url),
    workers,
  );
  const fieldAt = (seed: number, temperature: number) => {
    const job = fieldJobs.find((item) => item.seed === seed && item.policyTemperature === temperature);
    if (!job) throw new Error(`missing field job ${seed}`);
    const row = fieldRows.find((item) => item.id === job.id);
    if (!row) throw new Error(`missing field row ${job.id}`);
    return row;
  };
  const probeDelta = fieldSeeds.map((seed) => fieldAt(seed, SHARP_POLICY_TEMPERATURE).probeLate - fieldAt(seed, SHIPPED_POLICY_TEMPERATURE).probeLate);
  const livesDelta = fieldSeeds.map((seed) => fieldAt(seed, SHARP_POLICY_TEMPERATURE).lives - fieldAt(seed, SHIPPED_POLICY_TEMPERATURE).lives);
  const foodsDelta = fieldSeeds.map((seed) => fieldAt(seed, SHARP_POLICY_TEMPERATURE).foods - fieldAt(seed, SHIPPED_POLICY_TEMPERATURE).foods);
  const probeCi = bootstrapMeanCI(probeDelta, 2000, 0.05, PROBE_SALT);
  const livesCi = bootstrapMeanCI(livesDelta, 2000, 0.05, LIVES_SALT);
  const foodsCi = bootstrapMeanCI(foodsDelta, 2000, 0.05, FOODS_SALT);
  const g2Shipped = fieldSeeds.map((seed) => {
    const food = adjacentFood(seed, undefined, SHIPPED_POLICY_TEMPERATURE);
    return g2Pass(food.action, food.foods, food.x);
  });
  const g2Sharp = fieldSeeds.map((seed) => {
    const food = adjacentFood(seed, undefined, SHARP_POLICY_TEMPERATURE);
    return g2Pass(food.action, food.foods, food.x);
  });
  const c2Shipped = fieldSeeds.map((seed) => fieldAt(seed, SHIPPED_POLICY_TEMPERATURE).c2);
  const c2Sharp = fieldSeeds.map((seed) => fieldAt(seed, SHARP_POLICY_TEMPERATURE).c2);
  const verdict = sharpVerdict({
    excessGain: gainCi,
    probeDelta: probeCi,
    livesDelta: livesCi,
    g2Shipped,
    g2Sharp,
    c2Shipped,
    c2Sharp,
  });
  const elapsedSec = (Date.now() - t0) / 1000;
  const count = (flags: boolean[]) => flags.filter(Boolean).length;
  const report = {
    date: new Date().toISOString(),
    elapsedSec,
    steps,
    seeds: seedsN,
    dose: DOSE,
    shippedTemperature: SHIPPED_POLICY_TEMPERATURE,
    sharpTemperature: SHARP_POLICY_TEMPERATURE,
    randomFraction: randomMean,
    salts: { gain: GAIN_SALT, shipped: SHIPPED_SALT, sharp: SHARP_SALT, score: SCORE_SALT, probe: PROBE_SALT, lives: LIVES_SALT, foods: FOODS_SALT },
    shippedExcess: { ...shippedCi, call: greaterCall(shippedCi) },
    sharpExcess: { ...sharpCi, call: greaterCall(sharpCi) },
    gain: { ...gainCi, call: greaterCall(gainCi) },
    scoreGain: { ...scoreCi, call: greaterCall(scoreCi) },
    field: {
      seeds: FIELD_SEEDS,
      steps: FIELD_STEPS,
      probe: { ...probeCi, call: greaterCall(probeCi) },
      lives: { ...livesCi, call: greaterCall(livesCi) },
      foods: { ...foodsCi, call: greaterCall(foodsCi) },
      g2Shipped: count(g2Shipped),
      g2Sharp: count(g2Sharp),
      c2Shipped: count(c2Shipped),
      c2Sharp: count(c2Sharp),
      meanBShipped: meanOf(fieldSeeds.map((seed) => fieldAt(seed, SHIPPED_POLICY_TEMPERATURE).meanB)),
      meanBSharp: meanOf(fieldSeeds.map((seed) => fieldAt(seed, SHARP_POLICY_TEMPERATURE).meanB)),
      probeLateShipped: meanOf(fieldSeeds.map((seed) => fieldAt(seed, SHIPPED_POLICY_TEMPERATURE).probeLate)),
      probeLateSharp: meanOf(fieldSeeds.map((seed) => fieldAt(seed, SHARP_POLICY_TEMPERATURE).probeLate)),
    },
    verdict,
  };
  mkdirSync("bench/sharp", { recursive: true });
  writeFileSync("bench/sharp/sharp.json", `${JSON.stringify(report)}\n`);
  writeFileSync(
    "bench/sharp/excess-vs-temperature.png",
    drawBars([
      { label: "0.45", mean: shippedCi.mean, lo: shippedCi.lo, hi: shippedCi.hi, color: [140, 60, 180] },
      { label: "0.15", mean: sharpCi.mean, lo: sharpCi.lo, hi: sharpCi.hi, color: [186, 42, 58] },
      { label: "gain", mean: gainCi.mean, lo: gainCi.lo, hi: gainCi.hi, color: [36, 104, 196] },
    ]),
  );
  const csv = [
    "arm,mean,lo,hi,call",
    ["shipped", shippedCi.mean, shippedCi.lo, shippedCi.hi, greaterCall(shippedCi)].join(","),
    ["sharp", sharpCi.mean, sharpCi.lo, sharpCi.hi, greaterCall(sharpCi)].join(","),
    ["gain", gainCi.mean, gainCi.lo, gainCi.hi, greaterCall(gainCi)].join(","),
    ["scoreGain", scoreCi.mean, scoreCi.lo, scoreCi.hi, greaterCall(scoreCi)].join(","),
    ["probe", probeCi.mean, probeCi.lo, probeCi.hi, greaterCall(probeCi)].join(","),
    ["lives", livesCi.mean, livesCi.lo, livesCi.hi, greaterCall(livesCi)].join(","),
  ];
  writeFileSync("bench/sharp/sharp.csv", `${csv.join("\n")}\n`);
  console.log(JSON.stringify({ elapsedSec, randomFraction: randomMean, shipped: fmt(shippedCi), sharp: fmt(sharpCi), gain: fmt(gainCi), score: fmt(scoreCi), probe: fmt(probeCi), lives: fmt(livesCi), foods: fmt(foodsCi), g2: `${count(g2Sharp)}/${count(g2Shipped)}`, c2: `${count(c2Sharp)}/${count(c2Shipped)}`, verdict }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
