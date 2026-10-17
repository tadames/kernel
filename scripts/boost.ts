/**
 * Place-bonus positive control. Not part of CI.
 *
 *   npm run boost-room
 *
 * One control episode per seed and explorer (the shipped agent). Each dose
 * adds a constant to the progress channel of actions that land in region 1.
 * Seeds 1–200, 400 steps, learnability 1, relevance 0, held pattern.
 * Writes bench/boost/boost.json, boost.csv, excess-vs-boost.png, and
 * score-vs-boost.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { BOOST_ADDS, BOOST_FAR, BOOST_GAP, BOOST_SURPRISE_GAP, type BoostRequest, type BoostResult } from "../src/lib/kernel/boost-run.ts";
import { boostSummary, greaterCall, smallestDetecting, type BoostSummary, type Call } from "../src/lib/kernel/noise.ts";
import type { CuriositySignal } from "../src/lib/kernel/signals.ts";
import { bootstrapMeanCI } from "../src/lib/kernel/stats.ts";
import { drawText, fillRect, scaleNearest, writePng } from "./png.ts";
import { runPool, workerCount } from "./pool.ts";

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) return fallback;
  return process.argv[i + 1]!;
}

type RGB = [number, number, number];

const EXPLORERS = [
  { id: "random", signal: "random" },
  { id: "count", signal: "count" },
  { id: "surprise", signal: "surprise" },
  { id: "rnd", signal: "rnd" },
  { id: "rho", signal: "rho" },
] as const;

type ExplorerId = (typeof EXPLORERS)[number]["id"];

const COLOR: Record<ExplorerId, RGB> = {
  random: [120, 120, 120],
  count: [36, 104, 196],
  surprise: [186, 42, 58],
  rnd: [40, 140, 90],
  rho: [140, 60, 180],
};

const LABEL: Record<ExplorerId, string> = {
  random: "rand",
  count: "count",
  surprise: "surp",
  rnd: "rnd",
  rho: "rho",
};

function excessSalt(explorer: number, dose: number) {
  return 6000 + explorer * 10 + dose;
}
function scoreSalt(explorer: number, dose: number) {
  return 6100 + explorer * 10 + dose;
}
function boostFracSalt(explorer: number, dose: number) {
  return 6200 + explorer * 10 + dose;
}
function controlFracSalt(explorer: number, dose: number) {
  return 6300 + explorer * 10 + dose;
}

function fmt(ci: { mean: number; lo: number; hi: number }) {
  return `${ci.mean.toFixed(4)} [${ci.lo.toFixed(4)}, ${ci.hi.toFixed(4)}]`;
}

function keyOf(id: ExplorerId, seed: number, add: number) {
  return `${id}|${seed}|${add}`;
}

type Point = { id: ExplorerId; add: number; mean: number; lo: number; hi: number };

function drawLines(title: string, points: Point[], adds: number[]) {
  const width = 880;
  const height = 520;
  const rgba = new Uint8Array(width * height * 4);
  rgba.fill(255);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  drawText(rgba, width, 8, 8, title, [30, 30, 30]);
  EXPLORERS.forEach((explorer, i) => {
    const x = 280 + i * 110;
    fillRect(rgba, width, x, 8, 12, 8, COLOR[explorer.id]);
    drawText(rgba, width, x + 16, 8, LABEL[explorer.id], [30, 30, 30]);
  });
  const left = 78;
  const right = width - 24;
  const top = 46;
  const bottom = height - 58;
  let yMin = 0;
  let yMax = 0.02;
  for (const point of points) {
    yMin = Math.min(yMin, point.lo, point.mean);
    yMax = Math.max(yMax, point.hi, point.mean);
  }
  const pad = Math.max(0.005, (yMax - yMin) * 0.12);
  yMin -= pad;
  yMax += pad;
  const yOf = (value: number) => bottom - ((value - yMin) / (yMax - yMin)) * (bottom - top);
  const logs = adds.map((add) => Math.log(add));
  const logLo = Math.min(...logs);
  const logHi = Math.max(...logs);
  const xOf = (add: number) => left + ((Math.log(add) - logLo) / (logHi - logLo || 1)) * (right - left);
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
  for (let tick = 0; tick <= 4; tick++) {
    const value = yMin + ((yMax - yMin) * tick) / 4;
    if (Math.abs(value) < (yMax - yMin) * 0.06) continue;
    const y = Math.round(yOf(value));
    drawText(rgba, width, 8, y - 3, value.toFixed(2), [90, 90, 90]);
  }
  const marks = [
    { add: BOOST_SURPRISE_GAP, label: "noise" },
    { add: BOOST_GAP, label: "prog" },
  ];
  for (const mark of marks) {
    if (mark.add < Math.min(...adds) || mark.add > Math.max(...adds)) continue;
    const xMark = Math.round(xOf(mark.add));
    for (let y = top; y <= bottom; y += 4) {
      const i = (y * width + xMark) * 4;
      if (i < 0 || i + 3 >= rgba.length) continue;
      rgba[i] = 170;
      rgba[i + 1] = 140;
      rgba[i + 2] = 40;
      rgba[i + 3] = 255;
    }
    drawText(rgba, width, xMark - 12, top - 14, mark.label, [140, 110, 20]);
  }
  for (const explorer of EXPLORERS) {
    const series = adds.map((add) => points.find((point) => point.id === explorer.id && point.add === add));
    const color = COLOR[explorer.id];
    for (let i = 0; i < series.length; i++) {
      const point = series[i];
      if (!point) continue;
      const x = Math.round(xOf(point.add));
      const yLo = Math.round(yOf(point.lo));
      const yHi = Math.round(yOf(point.hi));
      for (let y = Math.min(yLo, yHi); y <= Math.max(yLo, yHi); y++) {
        const pi = (y * width + x) * 4;
        if (pi < 0 || pi + 3 >= rgba.length) continue;
        rgba[pi] = color[0];
        rgba[pi + 1] = color[1];
        rgba[pi + 2] = color[2];
        rgba[pi + 3] = 255;
      }
      fillRect(rgba, width, x - 4, yHi - 1, 8, 2, color);
      fillRect(rgba, width, x - 4, yLo - 1, 8, 2, color);
      fillRect(rgba, width, x - 3, Math.round(yOf(point.mean)) - 3, 6, 6, color);
      if (i === 0) continue;
      const prev = series[i - 1];
      if (!prev) continue;
      const x0 = Math.round(xOf(prev.add));
      const y0 = Math.round(yOf(prev.mean));
      const x1 = x;
      const y1 = Math.round(yOf(point.mean));
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let s = 0; s <= steps; s++) {
        const px = Math.round(x0 + ((x1 - x0) * s) / steps);
        const py = Math.round(y0 + ((y1 - y0) * s) / steps);
        const pi = (py * width + px) * 4;
        if (pi < 0 || pi + 3 >= rgba.length) continue;
        rgba[pi] = color[0];
        rgba[pi + 1] = color[1];
        rgba[pi + 2] = color[2];
        rgba[pi + 3] = 255;
      }
    }
  }
  adds.forEach((add) => {
    const label = add.toPrecision(2);
    const x = Math.round(xOf(add)) - (label.length * 6) / 2;
    drawText(rgba, width, x, bottom + 14, label, [40, 40, 40]);
  });
  drawText(rgba, width, left, bottom + 32, "progress-channel bonus", [40, 40, 40]);
  const scaled = scaleNearest(rgba, width, height, 2);
  return writePng(scaled.width, scaled.height, scaled.rgba);
}

function parseAdds() {
  const text = arg("adds", "");
  if (!text) return [...BOOST_ADDS];
  const adds = text.split(",").map((part) => Number(part.trim()));
  if (adds.some((add) => !(add > 0))) throw new Error(`adds must be positive: ${text}`);
  return adds;
}

function redraw(outDir: string) {
  const report = JSON.parse(readFileSync(`${outDir}/boost.json`, "utf8")) as {
    adds: number[];
    excess: Record<ExplorerId, { add: number; mean: number; lo: number; hi: number }[]>;
    scoreGap: Record<ExplorerId, { add: number; mean: number; lo: number; hi: number }[]>;
  };
  const excess: Point[] = [];
  const score: Point[] = [];
  for (const explorer of EXPLORERS) {
    for (const row of report.excess[explorer.id]) excess.push({ id: explorer.id, ...row });
    for (const row of report.scoreGap[explorer.id]) score.push({ id: explorer.id, ...row });
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/excess-vs-boost.png`, drawLines("boosted minus control", excess, report.adds));
  writeFileSync(`${outDir}/score-vs-boost.png`, drawLines("score gap, boosted minus control", score, report.adds));
}

async function main() {
  const outDir = arg("out", "bench/boost");
  if (process.argv.includes("--figure-only")) {
    redraw(outDir);
    return;
  }
  const adds = parseAdds();
  const seedsN = Math.max(1, Number(arg("seeds", "200")));
  const steps = Math.max(1, Number(arg("steps", "400")));
  const workers = workerCount(Number(arg("workers", "0")));
  const seeds = Array.from({ length: seedsN }, (_, i) => i + 1);
  const doses = [0, ...adds];
  const jobs: BoostRequest[] = [];
  let id = 0;
  for (const add of doses) {
    for (const seed of seeds) {
      for (const explorer of EXPLORERS) {
        jobs.push({
          id: id++,
          seed,
          signal: explorer.signal as CuriositySignal,
          steps,
          add,
        });
      }
    }
  }
  console.error(`boost-room ${jobs.length} episodes, ${workers} workers, ${steps} steps, doses ${adds.join(",")}`);
  const t0 = Date.now();
  const rows = await runPool<BoostRequest, BoostResult>(jobs, new URL("./boost-worker.ts", import.meta.url), workers);
  const elapsedSec = (Date.now() - t0) / 1000;
  console.error(`batch finished in ${elapsedSec.toFixed(1)}s`);
  if (rows.length !== jobs.length) throw new Error(`expected ${jobs.length} rows, got ${rows.length}`);

  const index = new Map<string, BoostResult>();
  for (const row of rows) {
    const key = keyOf(row.signal as ExplorerId, row.seed, row.add);
    if (index.has(key)) throw new Error(`duplicate ${key}`);
    index.set(key, row);
  }
  for (const add of adds) {
    for (const seed of seeds) {
      const boost = index.get(keyOf("random", seed, add));
      const control = index.get(keyOf("random", seed, 0));
      if (!boost || !control) throw new Error(`missing random seed ${seed} add ${add}`);
      if (boost.distractorFrac !== control.distractorFrac || boost.foods !== control.foods || boost.lives !== control.lives) {
        throw new Error(`random walk diverged at seed ${seed} add ${add}`);
      }
    }
  }

  const diffAt = (explorer: ExplorerId, add: number, pick: (row: BoostResult) => number) =>
    seeds.map((seed) => {
      const boost = index.get(keyOf(explorer, seed, add));
      const control = index.get(keyOf(explorer, seed, 0));
      if (!boost || !control) throw new Error(`missing ${explorer} seed ${seed} add ${add}`);
      return pick(boost) - pick(control);
    });

  type Band = { add: number; mean: number; lo: number; hi: number; n: number; call: Call };

  const band = (
    explorerIndex: number,
    explorer: ExplorerId,
    saltFor: (explorerIndex: number, doseIndex: number) => number,
    pick: (row: BoostResult) => number,
  ): Band[] =>
    adds.map((add, doseIndex) => {
      const values = diffAt(explorer, add, pick);
      const ci = bootstrapMeanCI(values, 2000, 0.05, saltFor(explorerIndex, doseIndex));
      return { add, ...ci, call: greaterCall(ci) };
    });

  const excess: Record<ExplorerId, Band[]> = {} as never;
  const scoreGap: Record<ExplorerId, Band[]> = {} as never;
  const thresholds: Record<ExplorerId, number | null> = {} as never;

  for (const [explorerIndex, explorer] of EXPLORERS.entries()) {
    excess[explorer.id] = band(explorerIndex, explorer.id, excessSalt, (row) => row.distractorFrac);
    scoreGap[explorer.id] = band(explorerIndex, explorer.id, scoreSalt, (row) => row.scoreGap);
    thresholds[explorer.id] = smallestDetecting(
      adds,
      excess[explorer.id].map((row) => row.call),
    );
  }

  const fractionRows: Record<ExplorerId, { add: number; mean: number; lo: number; hi: number; n: number }[]> = {} as never;
  for (const [explorerIndex, explorer] of EXPLORERS.entries()) {
    fractionRows[explorer.id] = doses.map((add, doseIndex) => {
      const values = seeds.map((seed) => index.get(keyOf(explorer.id, seed, add))!.distractorFrac);
      const salt = add === 0 ? controlFracSalt(explorerIndex, 0) : boostFracSalt(explorerIndex, adds.indexOf(add));
      return { add, ...bootstrapMeanCI(values, 2000, 0.05, salt) };
    });
  }

  const gapIndex = adds.indexOf(BOOST_GAP);
  const rhoAtGap: Call = gapIndex < 0 ? "inconclusive" : excess.rho[gapIndex]!.call;
  const randomExcludesZero = excess.random.some((row) => row.lo > 0 || row.hi < 0);
  const summary: BoostSummary =
    gapIndex < 0
      ? "inconclusive"
      : boostSummary(randomExcludesZero, rhoAtGap, thresholds.rho, BOOST_GAP, BOOST_FAR);

  const report = {
    date: new Date().toISOString(),
    elapsedSec,
    steps,
    seeds: seedsN,
    learnability: 1,
    distractorRelevance: 0,
    matchedPattern: "held",
    gap: BOOST_GAP,
    far: BOOST_FAR,
    surpriseGap: BOOST_SURPRISE_GAP,
    adds,
    salts: {
      excess: "6000 + explorer*10 + dose",
      scoreGap: "6100 + explorer*10 + dose",
      boostFrac: "6200 + explorer*10 + dose",
      controlFrac: "6300 + explorer*10 + dose",
    },
    summary,
    randomExcludesZero,
    rhoAtGap,
    thresholds,
    excess,
    scoreGap,
    fractions: fractionRows,
    rows: rows.map((row) => ({
      seed: row.seed,
      signal: row.signal,
      add: row.add,
      frac: row.distractorFrac,
      foods: row.foods,
      lives: row.lives,
      scoreGap: row.scoreGap,
      scoreGapSteps: row.scoreGapSteps,
    })),
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/boost.json`, `${JSON.stringify(report)}\n`);
  const excessPoints: Point[] = [];
  const scorePoints: Point[] = [];
  for (const explorer of EXPLORERS) {
    for (const row of excess[explorer.id]) excessPoints.push({ id: explorer.id, add: row.add, mean: row.mean, lo: row.lo, hi: row.hi });
    for (const row of scoreGap[explorer.id]) scorePoints.push({ id: explorer.id, add: row.add, mean: row.mean, lo: row.lo, hi: row.hi });
  }
  writeFileSync(`${outDir}/excess-vs-boost.png`, drawLines("boosted minus control", excessPoints, adds));
  writeFileSync(`${outDir}/score-vs-boost.png`, drawLines("score gap, boosted minus control", scorePoints, adds));
  const csv = [
    "explorer,add,excess_mean,excess_lo,excess_hi,excess_call,score_mean,score_lo,score_hi,score_call,frac_mean,frac_lo,frac_hi",
  ];
  for (const explorer of EXPLORERS) {
    for (const [doseIndex, add] of adds.entries()) {
      const ex = excess[explorer.id][doseIndex]!;
      const sc = scoreGap[explorer.id][doseIndex]!;
      const fr = fractionRows[explorer.id].find((row) => row.add === add)!;
      csv.push(
        [explorer.id, add, ex.mean, ex.lo, ex.hi, ex.call, sc.mean, sc.lo, sc.hi, sc.call, fr.mean, fr.lo, fr.hi].join(","),
      );
    }
  }
  writeFileSync(`${outDir}/boost.csv`, `${csv.join("\n")}\n`);
  console.log(
    JSON.stringify(
      {
        elapsedSec,
        summary,
        randomExcludesZero,
        rhoAtGap,
        thresholds,
        excess: Object.fromEntries(
          EXPLORERS.map((explorer) => [explorer.id, excess[explorer.id].map((row) => ({ add: row.add, text: fmt(row), call: row.call }))]),
        ),
        scoreGap: Object.fromEntries(
          EXPLORERS.map((explorer) => [explorer.id, scoreGap[explorer.id].map((row) => ({ add: row.add, text: fmt(row), call: row.call }))]),
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
