/**
 * Geometry-matched control for the stationary-noise room. Not part of CI.
 *
 *   npm run matched-room
 *
 * The target room is region 1. Noise redraws it every step. Static freezes
 * one fair-bit picture of the same cells. The mirror puts that room on the
 * west. Seeds, learnability, and the episode length match the noise study.
 *
 * Writes bench/matched/matched.json, matched.csv, excess-by-explorer.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { LEARNABILITY_GRID } from "../src/lib/kernel/family.ts";
import { matchedContentCall, matchedSummary, type Call, type MatchedSummary } from "../src/lib/kernel/noise.ts";
import { type NoiseRequest, type NoiseResult, type PolicyArm } from "../src/lib/kernel/noise-run.ts";
import { SHIPPED_PROGRESS_WINDOW } from "../src/lib/kernel/progress.ts";
import type { CuriositySignal } from "../src/lib/kernel/signals.ts";
import { bootstrapMeanCI, type Interval } from "../src/lib/kernel/stats.ts";
import { drawText, fillRect, scaleNearest, writePng } from "./png.ts";
import { runPool, workerCount } from "./pool.ts";

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) return fallback;
  return process.argv[i + 1]!;
}

type RGB = [number, number, number];

const EXPLORERS = [
  { id: "random", signal: "random", policyArm: "shipped" },
  { id: "count", signal: "count", policyArm: "shipped" },
  { id: "surprise", signal: "surprise", policyArm: "shipped" },
  { id: "rnd", signal: "rnd", policyArm: "shipped" },
  { id: "rho", signal: "rho", policyArm: "shipped" },
  { id: "progress", signal: "rho", policyArm: "progress" },
] as const;

type ExplorerId = (typeof EXPLORERS)[number]["id"];

const DIRECTED: ExplorerId[] = ["count", "surprise", "rnd", "rho", "progress"];

/** Locked in the preregistration. Do not renumber after the sweep. */
const TEST_SALT: Record<ExplorerId, number> = {
  random: 3101,
  count: 3102,
  surprise: 3103,
  rnd: 3104,
  rho: 3105,
  progress: 3106,
};
const EAST_SALT: Record<ExplorerId, number> = {
  random: 3111,
  count: 3112,
  surprise: 3113,
  rnd: 3114,
  rho: 3115,
  progress: 3116,
};
const WEST_SALT: Record<ExplorerId, number> = {
  random: 3121,
  count: 3122,
  surprise: 3123,
  rnd: 3124,
  rho: 3125,
  progress: 3126,
};
const SURPRISE_SALT = 3501;

const LABEL: Record<ExplorerId, string> = {
  random: "rand",
  count: "count",
  surprise: "surp",
  rnd: "rnd",
  rho: "rho",
  progress: "pure",
};

const SERIES: { name: "east" | "west" | "mean"; color: RGB }[] = [
  { name: "east", color: [186, 42, 58] },
  { name: "west", color: [36, 104, 196] },
  { name: "mean", color: [40, 40, 40] },
];

function fmt(ci: { mean: number; lo: number; hi: number }) {
  return `${ci.mean.toFixed(4)} [${ci.lo.toFixed(4)}, ${ci.hi.toFixed(4)}]`;
}

function learnSalt(explorer: number, learn: number) {
  return 3200 + explorer * 10 + learn;
}

function keyOf(id: ExplorerId, content: "noise" | "static", mirror: boolean, seed: number, learnability: number) {
  return `${id}|${content}|${mirror ? 1 : 0}|${seed}|${learnability}`;
}

function explorerOf(row: NoiseResult): ExplorerId {
  if (row.signal === "rho" && row.policyArm === "progress") return "progress";
  return row.signal as ExplorerId;
}

type Bar = { id: ExplorerId; series: "east" | "west" | "mean"; mean: number; lo: number; hi: number };

function drawBars(points: Bar[]) {
  const width = 820;
  const height = 460;
  const rgba = new Uint8Array(width * height * 4);
  rgba.fill(255);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  const left = 92;
  const right = width - 18;
  const top = 48;
  const bottom = height - 52;
  drawText(rgba, width, 8, 8, "noise minus static", [30, 30, 30]);
  SERIES.forEach((series, i) => {
    const x = 220 + i * 90;
    fillRect(rgba, width, x, 8, 12, 8, series.color);
    drawText(rgba, width, x + 16, 8, series.name, [30, 30, 30]);
  });
  let yMin = 0;
  let yMax = 0.02;
  for (const point of points) {
    yMin = Math.min(yMin, point.lo, point.mean);
    yMax = Math.max(yMax, point.hi, point.mean);
  }
  const pad = Math.max(0.008, (yMax - yMin) * 0.16);
  yMin -= pad;
  yMax += pad;
  const yOf = (value: number) => bottom - ((value - yMin) / (yMax - yMin)) * (bottom - top);
  const zero = yOf(0);
  for (let x = left; x <= right; x += 4) {
    const i = (Math.round(zero) * width + x) * 4;
    if (i < 0 || i + 3 >= rgba.length) continue;
    rgba[i] = 170;
    rgba[i + 1] = 170;
    rgba[i + 2] = 170;
    rgba[i + 3] = 255;
  }
  const zeroLabel = "0";
  drawText(rgba, width, left - 8 - zeroLabel.length * 6, Math.round(zero) - 3, zeroLabel, [80, 80, 80]);
  for (let tick = 0; tick <= 4; tick++) {
    const value = yMin + ((yMax - yMin) * tick) / 4;
    if (Math.abs(value) < (yMax - yMin) * 0.08) continue;
    const label = value.toFixed(2);
    const y = Math.round(yOf(value));
    drawText(rgba, width, left - 8 - label.length * 6, y - 3, label, [90, 90, 90]);
  }
  const groups = EXPLORERS.length;
  const slot = (right - left) / groups;
  for (let g = 0; g < groups; g++) {
    const id = EXPLORERS[g]!.id;
    const cx = left + slot * (g + 0.5);
    const bars = SERIES.map((series) => points.find((point) => point.id === id && point.series === series.name));
    bars.forEach((point, s) => {
      if (!point) return;
      const color = SERIES[s]!.color;
      const x = cx - 28 + s * 20;
      const yMean = yOf(point.mean);
      const yLo = yOf(point.lo);
      const yHi = yOf(point.hi);
      const topY = Math.min(yMean, zero);
      const barH = Math.max(1, Math.abs(yMean - zero));
      fillRect(rgba, width, x, topY, 14, barH, color);
      const xLine = Math.round(x + 7);
      for (let y = Math.round(Math.min(yLo, yHi)); y <= Math.round(Math.max(yLo, yHi)); y++) {
        const pi = (y * width + xLine) * 4;
        if (pi < 0 || pi + 3 >= rgba.length) continue;
        rgba[pi] = 20;
        rgba[pi + 1] = 20;
        rgba[pi + 2] = 20;
        rgba[pi + 3] = 255;
      }
      fillRect(rgba, width, xLine - 5, yHi - 1, 10, 2, [20, 20, 20]);
      fillRect(rgba, width, xLine - 5, yLo - 1, 10, 2, [20, 20, 20]);
    });
    drawText(rgba, width, cx - 16, bottom + 12, LABEL[id], [30, 30, 30]);
  }
  const scaled = scaleNearest(rgba, width, height, 2);
  return writePng(scaled.width, scaled.height, scaled.rgba);
}

function redraw() {
  const report = JSON.parse(readFileSync("bench/matched/matched.json", "utf8")) as {
    intervals: Record<ExplorerId, { east: Interval; west: Interval; mean: Interval }>;
  };
  const bars: Bar[] = [];
  for (const explorer of EXPLORERS) {
    for (const series of SERIES) {
      const ci = report.intervals[explorer.id][series.name];
      bars.push({ id: explorer.id, series: series.name, mean: ci.mean, lo: ci.lo, hi: ci.hi });
    }
  }
  mkdirSync("bench/matched", { recursive: true });
  writeFileSync("bench/matched/excess-by-explorer.png", drawBars(bars));
}

async function main() {
  if (process.argv.includes("--figure-only")) {
    redraw();
    return;
  }
  const seedsN = Math.max(1, Number(arg("seeds", "200")));
  const steps = Math.max(1, Number(arg("steps", "400")));
  const workers = workerCount(Number(arg("workers", "0")));
  const learns = [...LEARNABILITY_GRID];
  const seeds = Array.from({ length: seedsN }, (_, i) => i + 1);
  const jobs: NoiseRequest[] = [];
  let id = 0;
  for (const learnability of learns) {
    for (const seed of seeds) {
      for (const mirror of [false, true]) {
        for (const content of ["noise", "static"] as const) {
          for (const explorer of EXPLORERS) {
            jobs.push({
              id: id++,
              seed,
              signal: explorer.signal as CuriositySignal,
              steps,
              learnability,
              driftRate: 0,
              distractorRelevance: 0,
              progressWindow: SHIPPED_PROGRESS_WINDOW,
              progressMode: "ema",
              noiseAmplitude: 1,
              traceHist: false,
              policyArm: explorer.policyArm as PolicyArm,
              content,
              mirror,
            });
          }
        }
      }
    }
  }
  console.error(`matched-room ${jobs.length} episodes, ${workers} workers, ${steps} steps`);
  const t0 = Date.now();
  const rows = await runPool<NoiseRequest, NoiseResult>(jobs, new URL("./noise-worker.ts", import.meta.url), workers);
  const elapsedSec = (Date.now() - t0) / 1000;
  console.error(`batch finished in ${elapsedSec.toFixed(1)}s`);
  if (rows.length !== jobs.length) throw new Error(`expected ${jobs.length} rows, got ${rows.length}`);

  const index = new Map<string, NoiseResult>();
  for (const row of rows) {
    const key = keyOf(explorerOf(row), row.content, row.mirror, row.seed, row.learnability);
    if (index.has(key)) throw new Error(`duplicate ${key}`);
    index.set(key, row);
  }

  const excessAt = (explorer: ExplorerId, mirror: boolean) =>
    seeds.map((seed) => {
      let sum = 0;
      for (const learn of learns) {
        const noise = index.get(keyOf(explorer, "noise", mirror, seed, learn));
        const stat = index.get(keyOf(explorer, "static", mirror, seed, learn));
        if (!noise || !stat) throw new Error(`missing ${explorer} seed ${seed} learn ${learn} mirror ${mirror}`);
        sum += noise.distractorFrac - stat.distractorFrac;
      }
      return sum / learns.length;
    });

  const orient: Record<ExplorerId, { east: number[]; west: number[]; mean: number[] }> = {
    random: { east: [], west: [], mean: [] },
    count: { east: [], west: [], mean: [] },
    surprise: { east: [], west: [], mean: [] },
    rnd: { east: [], west: [], mean: [] },
    rho: { east: [], west: [], mean: [] },
    progress: { east: [], west: [], mean: [] },
  };
  const calls: Record<ExplorerId, { east: Call; west: Call; mean: Call }> = {
    random: { east: "inconclusive", west: "inconclusive", mean: "inconclusive" },
    count: { east: "inconclusive", west: "inconclusive", mean: "inconclusive" },
    surprise: { east: "inconclusive", west: "inconclusive", mean: "inconclusive" },
    rnd: { east: "inconclusive", west: "inconclusive", mean: "inconclusive" },
    rho: { east: "inconclusive", west: "inconclusive", mean: "inconclusive" },
    progress: { east: "inconclusive", west: "inconclusive", mean: "inconclusive" },
  };
  const intervals: Record<ExplorerId, { east: Interval; west: Interval; mean: Interval }> = {} as Record<
    ExplorerId,
    { east: Interval; west: Interval; mean: Interval }
  >;

  for (const explorer of EXPLORERS) {
    const east = excessAt(explorer.id, false);
    const west = excessAt(explorer.id, true);
    const mean = east.map((value, i) => (value + west[i]!) / 2);
    orient[explorer.id] = { east, west, mean };
    const eastCi = bootstrapMeanCI(east, 2000, 0.05, EAST_SALT[explorer.id]);
    const westCi = bootstrapMeanCI(west, 2000, 0.05, WEST_SALT[explorer.id]);
    const meanCi = bootstrapMeanCI(mean, 2000, 0.05, TEST_SALT[explorer.id]);
    intervals[explorer.id] = { east: eastCi, west: westCi, mean: meanCi };
    calls[explorer.id] = {
      east: matchedContentCall(eastCi),
      west: matchedContentCall(westCi),
      mean: matchedContentCall(meanCi),
    };
    console.error(
      `${explorer.id} mean ${fmt(meanCi)} ${calls[explorer.id].mean}  east ${fmt(eastCi)}  west ${fmt(westCi)}`,
    );
  }

  const randomExcludesZero = intervals.random.mean.lo > 0 || intervals.random.mean.hi < 0;
  const summary: MatchedSummary = matchedSummary(
    randomExcludesZero,
    DIRECTED.map((id) => calls[id].mean),
  );
  console.error(`summary ${summary} randomExcludesZero ${randomExcludesZero}`);

  const perLearnability = EXPLORERS.map((explorer, explorerIndex) => ({
    id: explorer.id,
    rows: learns.map((learnability, learnIndex) => {
      const values = seeds.map((seed) => {
        let sum = 0;
        for (const mirror of [false, true]) {
          const noise = index.get(keyOf(explorer.id, "noise", mirror, seed, learnability));
          const stat = index.get(keyOf(explorer.id, "static", mirror, seed, learnability));
          if (!noise || !stat) throw new Error(`missing learn split ${explorer.id}`);
          sum += noise.distractorFrac - stat.distractorFrac;
        }
        return sum / 2;
      });
      const ci = bootstrapMeanCI(values, 2000, 0.05, learnSalt(explorerIndex, learnIndex));
      return { learnability, ...ci, call: matchedContentCall(ci) };
    }),
  }));

  const surpriseValues: number[] = [];
  for (const seed of seeds) {
    const parts: number[] = [];
    for (const mirror of [false, true]) {
      for (const learn of learns) {
        const noise = index.get(keyOf("rho", "noise", mirror, seed, learn));
        const stat = index.get(keyOf("rho", "static", mirror, seed, learn));
        if (!noise || !stat) throw new Error(`missing surprise ${seed}`);
        if (noise.targetSurprise == null || stat.targetSurprise == null) continue;
        parts.push(noise.targetSurprise - stat.targetSurprise);
      }
    }
    if (parts.length === 0) continue;
    let sum = 0;
    for (const part of parts) sum += part;
    surpriseValues.push(sum / parts.length);
  }
  const surpriseGap = bootstrapMeanCI(surpriseValues, 2000, 0.05, SURPRISE_SALT);
  console.error(`rho surprise gap n=${surpriseValues.length} ${fmt(surpriseGap)}`);

  let fractionSalt = 3401;
  const fractions = [];
  for (const explorer of EXPLORERS) {
    for (const content of ["noise", "static"] as const) {
      for (const mirror of [false, true]) {
        const values = seeds.map((seed) => {
          let sum = 0;
          for (const learn of learns) {
            const row = index.get(keyOf(explorer.id, content, mirror, seed, learn));
            if (!row) throw new Error(`missing fraction ${explorer.id}`);
            sum += row.distractorFrac;
          }
          return sum / learns.length;
        });
        fractions.push({
          id: explorer.id,
          content,
          mirror: mirror ? "west" : "east",
          ...bootstrapMeanCI(values, 2000, 0.05, fractionSalt),
        });
        fractionSalt += 1;
      }
    }
  }

  const bars: Bar[] = [];
  for (const explorer of EXPLORERS) {
    for (const series of SERIES) {
      const ci = intervals[explorer.id][series.name];
      bars.push({ id: explorer.id, series: series.name, mean: ci.mean, lo: ci.lo, hi: ci.hi });
    }
  }

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
    staticDrawSalt: 0x5a17,
    salts: { test: TEST_SALT, east: EAST_SALT, west: WEST_SALT, surprise: SURPRISE_SALT },
    summary,
    randomExcludesZero,
    calls,
    intervals,
    perLearnability,
    surpriseGap: { ...surpriseGap, n: surpriseValues.length },
    fractions,
    excessBySeed: orient,
    rows: rows.map((row) => ({
      seed: row.seed,
      signal: row.signal,
      arm: row.policyArm,
      content: row.content,
      mirror: row.mirror,
      learnability: row.learnability,
      frac: row.distractorFrac,
      surprise: row.targetSurprise,
    })),
  };

  mkdirSync("bench/matched", { recursive: true });
  writeFileSync("bench/matched/matched.json", `${JSON.stringify(report)}\n`);
  writeFileSync("bench/matched/excess-by-explorer.png", drawBars(bars));
  const csv = ["explorer,orientation,mean,lo,hi,call"];
  for (const explorer of EXPLORERS) {
    for (const series of ["east", "west", "mean"] as const) {
      const ci = intervals[explorer.id][series];
      csv.push([explorer.id, series, ci.mean, ci.lo, ci.hi, calls[explorer.id][series]].join(","));
    }
  }
  writeFileSync("bench/matched/matched.csv", `${csv.join("\n")}\n`);
  console.log(
    JSON.stringify(
      {
        elapsedSec,
        summary,
        randomExcludesZero,
        calls: Object.fromEntries(EXPLORERS.map((explorer) => [explorer.id, calls[explorer.id].mean])),
        intervals: Object.fromEntries(EXPLORERS.map((explorer) => [explorer.id, fmt(intervals[explorer.id].mean)])),
        surpriseGap: { n: surpriseValues.length, text: fmt(surpriseGap) },
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
