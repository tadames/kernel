/**
 * Empty-room test. Not part of CI.
 *
 *   npm run fed-room
 *
 * The target room is region 1. Empty is the historical room. Fed adds five
 * non-edible food markers, placed like the large room's meals. Both
 * orientations. Seeds and learnability match the noise study.
 *
 * Writes bench/fed/fed.json, fed.csv, excess-by-explorer.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { LEARNABILITY_GRID } from "../src/lib/kernel/family.ts";
import { fedRoomCall, fedRoomSummary, type FedCall, type FedSummary } from "../src/lib/kernel/noise.ts";
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
type Arm = "empty" | "fed";

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
const FED_SALT: Record<ExplorerId, number> = {
  random: 4101,
  count: 4102,
  surprise: 4103,
  rnd: 4104,
  rho: 4105,
  progress: 4106,
};
const EMPTY_SALT: Record<ExplorerId, number> = {
  random: 4111,
  count: 4112,
  surprise: 4113,
  rnd: 4114,
  rho: 4115,
  progress: 4116,
};
const REDUCTION_SALT: Record<ExplorerId, number> = {
  random: 4121,
  count: 4122,
  surprise: 4123,
  rnd: 4124,
  rho: 4125,
  progress: 4126,
};
const EAST_FED_SALT: Record<ExplorerId, number> = {
  random: 4131,
  count: 4132,
  surprise: 4133,
  rnd: 4134,
  rho: 4135,
  progress: 4136,
};
const WEST_FED_SALT: Record<ExplorerId, number> = {
  random: 4141,
  count: 4142,
  surprise: 4143,
  rnd: 4144,
  rho: 4145,
  progress: 4146,
};
const EAST_EMPTY_SALT: Record<ExplorerId, number> = {
  random: 4151,
  count: 4152,
  surprise: 4153,
  rnd: 4154,
  rho: 4155,
  progress: 4156,
};
const WEST_EMPTY_SALT: Record<ExplorerId, number> = {
  random: 4161,
  count: 4162,
  surprise: 4163,
  rnd: 4164,
  rho: 4165,
  progress: 4166,
};
const RANDOM_ARM_SALT = 4501;

const LABEL: Record<ExplorerId, string> = {
  random: "rand",
  count: "count",
  surprise: "surp",
  rnd: "rnd",
  rho: "rho",
  progress: "pure",
};

const SERIES: { name: "empty" | "fed"; color: RGB }[] = [
  { name: "empty", color: [186, 42, 58] },
  { name: "fed", color: [36, 104, 196] },
];

function fmt(ci: { mean: number; lo: number; hi: number }) {
  return `${ci.mean.toFixed(4)} [${ci.lo.toFixed(4)}, ${ci.hi.toFixed(4)}]`;
}

function learnKey(value: number) {
  return Math.round(value * 1e6) / 1e6;
}

function learnSalt(explorer: number, learn: number) {
  return 4200 + explorer * 10 + learn;
}

function reductionLearnSalt(explorer: number, learn: number) {
  return 4300 + explorer * 10 + learn;
}

function keyOf(id: ExplorerId, arm: Arm, mirror: boolean, seed: number, learnability: number) {
  return `${id}|${arm}|${mirror ? 1 : 0}|${seed}|${learnability}`;
}

function explorerOf(row: NoiseResult): ExplorerId {
  if (row.signal === "rho" && row.policyArm === "progress") return "progress";
  return row.signal as ExplorerId;
}

function armOf(row: NoiseResult): Arm {
  return row.targetFoods ? "fed" : "empty";
}

type Bar = { id: ExplorerId; series: "empty" | "fed"; mean: number; lo: number; hi: number };

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
  drawText(rgba, width, 8, 8, "target minus random", [30, 30, 30]);
  SERIES.forEach((series, i) => {
    const x = 280 + i * 100;
    fillRect(rgba, width, x, 8, 12, 8, series.color);
    drawText(rgba, width, x + 16, 8, series.name, [30, 30, 30]);
  });
  let yMin = 0;
  let yMax = 0.05;
  for (const point of points) {
    yMin = Math.min(yMin, point.lo, point.mean);
    yMax = Math.max(yMax, point.hi, point.mean);
  }
  const pad = Math.max(0.01, (yMax - yMin) * 0.16);
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
  drawText(rgba, width, left - 8 - 6, Math.round(zero) - 3, "0", [80, 80, 80]);
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
      const x = cx - 18 + s * 22;
      const yMean = yOf(point.mean);
      const yLo = yOf(point.lo);
      const yHi = yOf(point.hi);
      const topY = Math.min(yMean, zero);
      const barH = Math.max(1, Math.abs(yMean - zero));
      fillRect(rgba, width, x, topY, 16, barH, color);
      const xLine = Math.round(x + 8);
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

/**
 * Unmirrored empty episodes must be the noise-study episodes.
 * The csv stores six decimals, so a step of 1/400 still matches.
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
    if (signal !== "rho" && signal !== "random" && signal !== "count" && signal !== "surprise" && signal !== "rnd") {
      continue;
    }
    const learn = learnKey(Number(cell[col.learnability!]));
    stored.set(`${signal}|${cell[col.seed!]}|${learn}`, Number(cell[col.distractor_frac!]));
  }
  let n = 0;
  const bad: string[] = [];
  for (const row of rows) {
    if (row.targetFoods || row.mirror || row.content !== "noise" || row.policyArm !== "shipped") continue;
    const prev = stored.get(`${row.signal}|${row.seed}|${learnKey(row.learnability)}`);
    n += 1;
    if (prev == null) {
      bad.push(`missing csv ${row.signal} seed ${row.seed} learn ${row.learnability}`);
      continue;
    }
    if (Math.abs(prev - row.distractorFrac) > 5e-7) {
      bad.push(`${row.signal} seed ${row.seed} learn ${row.learnability}: ${row.distractorFrac} vs ${prev}`);
    }
  }
  if (n === 0) throw new Error("noise.csv has no empty-room rows to check");
  if (bad.length) {
    throw new Error(`empty room diverged from bench/noise/noise.csv\n${bad.slice(0, 8).join("\n")}`);
  }
  console.error(`empty room matches noise.csv (${n})`);
}

function assertRandomUnmoved(index: Map<string, NoiseResult>, seeds: number[], learns: readonly number[]) {
  const bad: string[] = [];
  for (const seed of seeds) {
    for (const learn of learns) {
      for (const mirror of [false, true]) {
        const empty = index.get(keyOf("random", "empty", mirror, seed, learn));
        const fed = index.get(keyOf("random", "fed", mirror, seed, learn));
        if (!empty || !fed) throw new Error(`missing random seed ${seed}`);
        if (empty.distractorFrac !== fed.distractorFrac || empty.foods !== fed.foods || empty.lives !== fed.lives) {
          bad.push(
            `seed ${seed} learn ${learn} ${mirror ? "west" : "east"}: ${empty.distractorFrac} vs ${fed.distractorFrac}`,
          );
        }
      }
    }
  }
  if (bad.length) throw new Error(`decoys moved the random walk\n${bad.slice(0, 8).join("\n")}`);
  console.error("random walk matches across arms");
}

function redraw() {
  const report = JSON.parse(readFileSync("bench/fed/fed.json", "utf8")) as {
    intervals: Record<ExplorerId, { empty: Interval; fed: Interval }>;
  };
  const bars: Bar[] = [];
  for (const explorer of EXPLORERS) {
    for (const series of SERIES) {
      const ci = report.intervals[explorer.id][series.name];
      bars.push({ id: explorer.id, series: series.name, mean: ci.mean, lo: ci.lo, hi: ci.hi });
    }
  }
  mkdirSync("bench/fed", { recursive: true });
  writeFileSync("bench/fed/excess-by-explorer.png", drawBars(bars));
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
        for (const targetFoods of [false, true]) {
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
              content: "noise",
              mirror,
              targetFoods,
            });
          }
        }
      }
    }
  }
  console.error(`fed-room ${jobs.length} episodes, ${workers} workers, ${steps} steps`);
  const t0 = Date.now();
  const rows = await runPool<NoiseRequest, NoiseResult>(jobs, new URL("./noise-worker.ts", import.meta.url), workers);
  const elapsedSec = (Date.now() - t0) / 1000;
  console.error(`batch finished in ${elapsedSec.toFixed(1)}s`);
  if (rows.length !== jobs.length) throw new Error(`expected ${jobs.length} rows, got ${rows.length}`);
  assertMatchesNoiseCsv(rows);

  const index = new Map<string, NoiseResult>();
  for (const row of rows) {
    const key = keyOf(explorerOf(row), armOf(row), row.mirror, row.seed, row.learnability);
    if (index.has(key)) throw new Error(`duplicate ${key}`);
    index.set(key, row);
  }
  assertRandomUnmoved(index, seeds, learns);

  const at = (explorer: ExplorerId, arm: Arm, mirror: boolean, seed: number, learnability: number) => {
    const row = index.get(keyOf(explorer, arm, mirror, seed, learnability));
    if (!row) throw new Error(`missing ${explorer} ${arm} seed ${seed} learn ${learnability} mirror ${mirror}`);
    return row;
  };

  const orientMean = (explorer: ExplorerId, arm: Arm) =>
    seeds.map((seed) => {
      let sum = 0;
      let n = 0;
      for (const mirror of [false, true]) {
        for (const learn of learns) {
          sum += at(explorer, arm, mirror, seed, learn).distractorFrac;
          n += 1;
        }
      }
      return sum / n;
    });

  const sideMean = (explorer: ExplorerId, arm: Arm, mirror: boolean) =>
    seeds.map((seed) => {
      let sum = 0;
      for (const learn of learns) sum += at(explorer, arm, mirror, seed, learn).distractorFrac;
      return sum / learns.length;
    });

  const minus = (a: number[], b: number[]) => a.map((value, i) => value - b[i]!);

  const emptyFrac = Object.fromEntries(EXPLORERS.map((explorer) => [explorer.id, orientMean(explorer.id, "empty")])) as Record<
    ExplorerId,
    number[]
  >;
  const fedFrac = Object.fromEntries(EXPLORERS.map((explorer) => [explorer.id, orientMean(explorer.id, "fed")])) as Record<
    ExplorerId,
    number[]
  >;

  const intervals: Record<
    ExplorerId,
    { empty: Interval; fed: Interval; reduction: Interval; eastEmpty: Interval; westEmpty: Interval; eastFed: Interval; westFed: Interval }
  > = {} as Record<
    ExplorerId,
    { empty: Interval; fed: Interval; reduction: Interval; eastEmpty: Interval; westEmpty: Interval; eastFed: Interval; westFed: Interval }
  >;
  const calls: Record<ExplorerId, FedCall> = {
    random: "inconclusive",
    count: "inconclusive",
    surprise: "inconclusive",
    rnd: "inconclusive",
    rho: "inconclusive",
    progress: "inconclusive",
  };
  const excessBySeed: Record<ExplorerId, { empty: number[]; fed: number[]; reduction: number[] }> = {} as Record<
    ExplorerId,
    { empty: number[]; fed: number[]; reduction: number[] }
  >;

  for (const explorer of EXPLORERS) {
    const empty = minus(emptyFrac[explorer.id], emptyFrac.random);
    const fed = minus(fedFrac[explorer.id], fedFrac.random);
    const reduction = minus(empty, fed);
    const eastEmpty = minus(sideMean(explorer.id, "empty", false), sideMean("random", "empty", false));
    const westEmpty = minus(sideMean(explorer.id, "empty", true), sideMean("random", "empty", true));
    const eastFed = minus(sideMean(explorer.id, "fed", false), sideMean("random", "fed", false));
    const westFed = minus(sideMean(explorer.id, "fed", true), sideMean("random", "fed", true));
    const emptyCi = bootstrapMeanCI(empty, 2000, 0.05, EMPTY_SALT[explorer.id]);
    const fedCi = bootstrapMeanCI(fed, 2000, 0.05, FED_SALT[explorer.id]);
    const reductionCi = bootstrapMeanCI(reduction, 2000, 0.05, REDUCTION_SALT[explorer.id]);
    const eastEmptyCi = bootstrapMeanCI(eastEmpty, 2000, 0.05, EAST_EMPTY_SALT[explorer.id]);
    const westEmptyCi = bootstrapMeanCI(westEmpty, 2000, 0.05, WEST_EMPTY_SALT[explorer.id]);
    const eastFedCi = bootstrapMeanCI(eastFed, 2000, 0.05, EAST_FED_SALT[explorer.id]);
    const westFedCi = bootstrapMeanCI(westFed, 2000, 0.05, WEST_FED_SALT[explorer.id]);
    intervals[explorer.id] = {
      empty: emptyCi,
      fed: fedCi,
      reduction: reductionCi,
      eastEmpty: eastEmptyCi,
      westEmpty: westEmptyCi,
      eastFed: eastFedCi,
      westFed: westFedCi,
    };
    excessBySeed[explorer.id] = { empty, fed, reduction };
    calls[explorer.id] = fedRoomCall(emptyCi, fedCi);
    console.error(
      `${explorer.id} ${calls[explorer.id]}  empty ${fmt(emptyCi)}  fed ${fmt(fedCi)}  reduction ${fmt(reductionCi)}`,
    );
  }

  const armGap = minus(fedFrac.random, emptyFrac.random);
  const armGapCi = bootstrapMeanCI(armGap, 2000, 0.05, RANDOM_ARM_SALT);
  const randomExcludesZero = armGapCi.lo > 0 || armGapCi.hi < 0;
  const summary: FedSummary = fedRoomSummary(
    randomExcludesZero,
    DIRECTED.map((id) => calls[id]),
  );
  console.error(`summary ${summary} random arm ${fmt(armGapCi)} excludes ${randomExcludesZero}`);

  const perLearnability = EXPLORERS.map((explorer, explorerIndex) => ({
    id: explorer.id,
    rows: learns.map((learnability, learnIndex) => {
      const fedValues = seeds.map((seed) => {
        let sum = 0;
        for (const mirror of [false, true]) {
          sum +=
            at(explorer.id, "fed", mirror, seed, learnability).distractorFrac -
            at("random", "fed", mirror, seed, learnability).distractorFrac;
        }
        return sum / 2;
      });
      const reductionValues = seeds.map((seed) => {
        let sum = 0;
        for (const mirror of [false, true]) {
          const emptyGap =
            at(explorer.id, "empty", mirror, seed, learnability).distractorFrac -
            at("random", "empty", mirror, seed, learnability).distractorFrac;
          const fedGap =
            at(explorer.id, "fed", mirror, seed, learnability).distractorFrac -
            at("random", "fed", mirror, seed, learnability).distractorFrac;
          sum += emptyGap - fedGap;
        }
        return sum / 2;
      });
      const fedCi = bootstrapMeanCI(fedValues, 2000, 0.05, learnSalt(explorerIndex, learnIndex));
      const reductionCi = bootstrapMeanCI(reductionValues, 2000, 0.05, reductionLearnSalt(explorerIndex, learnIndex));
      return { learnability, fed: fedCi, reduction: reductionCi };
    }),
  }));

  let fractionSalt = 4401;
  const fractions = [];
  for (const explorer of EXPLORERS) {
    for (const arm of ["empty", "fed"] as const) {
      for (const mirror of [false, true]) {
        const values = sideMean(explorer.id, arm, mirror);
        fractions.push({
          id: explorer.id,
          arm,
          mirror: mirror ? "west" : "east",
          ...bootstrapMeanCI(values, 2000, 0.05, fractionSalt),
        });
        fractionSalt += 1;
      }
    }
  }

  const meals = EXPLORERS.map((explorer) => {
    const meanOf = (arm: Arm) => {
      let sum = 0;
      let n = 0;
      for (const seed of seeds) {
        for (const learn of learns) {
          for (const mirror of [false, true]) {
            sum += at(explorer.id, arm, mirror, seed, learn).distractorFoods;
            n += 1;
          }
        }
      }
      return sum / n;
    };
    return { id: explorer.id, empty: meanOf("empty"), fed: meanOf("fed") };
  });
  for (const row of meals) console.error(`meals ${row.id} empty ${row.empty.toFixed(3)} fed ${row.fed.toFixed(3)}`);

  const bars: Bar[] = [];
  for (const explorer of EXPLORERS) {
    bars.push({ id: explorer.id, series: "empty", ...intervals[explorer.id].empty });
    bars.push({ id: explorer.id, series: "fed", ...intervals[explorer.id].fed });
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
    targetFoods: 5,
    salts: {
      fed: FED_SALT,
      empty: EMPTY_SALT,
      reduction: REDUCTION_SALT,
      eastFed: EAST_FED_SALT,
      westFed: WEST_FED_SALT,
      eastEmpty: EAST_EMPTY_SALT,
      westEmpty: WEST_EMPTY_SALT,
      randomArm: RANDOM_ARM_SALT,
    },
    summary,
    randomExcludesZero,
    randomArm: armGapCi,
    calls,
    intervals,
    perLearnability,
    fractions,
    meals,
    excessBySeed,
    rows: rows.map((row) => ({
      seed: row.seed,
      signal: row.signal,
      arm: row.policyArm,
      foods: row.targetFoods ? "fed" : "empty",
      mirror: row.mirror,
      learnability: row.learnability,
      frac: row.distractorFrac,
      eaten: row.foods,
      targetEaten: row.distractorFoods,
    })),
  };

  mkdirSync("bench/fed", { recursive: true });
  writeFileSync("bench/fed/fed.json", `${JSON.stringify(report)}\n`);
  writeFileSync("bench/fed/excess-by-explorer.png", drawBars(bars));
  const csv = ["explorer,contrast,mean,lo,hi,call"];
  for (const explorer of EXPLORERS) {
    const row = intervals[explorer.id];
    csv.push([explorer.id, "empty", row.empty.mean, row.empty.lo, row.empty.hi, ""].join(","));
    csv.push([explorer.id, "fed", row.fed.mean, row.fed.lo, row.fed.hi, calls[explorer.id]].join(","));
    csv.push([explorer.id, "reduction", row.reduction.mean, row.reduction.lo, row.reduction.hi, ""].join(","));
  }
  writeFileSync("bench/fed/fed.csv", `${csv.join("\n")}\n`);
  console.log(
    JSON.stringify(
      {
        elapsedSec,
        summary,
        randomExcludesZero,
        randomArm: fmt(armGapCi),
        calls,
        intervals: Object.fromEntries(
          EXPLORERS.map((explorer) => [
            explorer.id,
            {
              empty: fmt(intervals[explorer.id].empty),
              fed: fmt(intervals[explorer.id].fed),
              reduction: fmt(intervals[explorer.id].reduction),
              eastFed: fmt(intervals[explorer.id].eastFed),
              westFed: fmt(intervals[explorer.id].westFed),
            },
          ]),
        ),
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
