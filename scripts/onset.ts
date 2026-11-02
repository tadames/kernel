/**
 * Is the expected-error inversion a saturation effect?
 * Not part of CI.
 *
 *   npm run onset
 *
 * Seeds 1–800, 400 steps, shipped temperature. Pattern minus matched noise.
 * Open is exposure at most 2. Late is exposure above 32.
 * The episode-average expected-error drop is the source row.
 * Writes bench/onset/onset.json, onset.csv, and onset-gap.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PATTERN_CHANNEL_OPEN, patternChannelCensus } from "../src/lib/kernel/family.ts";
import {
  REACH_ROOM_DROP2_HI,
  REACH_ROOM_DROP2_LO,
  REACH_ROOM_DROP2_MEAN,
  REACH_ROOM_DROP2_N,
  REACH_ROOM_DROP2_SALT,
} from "../src/lib/kernel/invert-run.ts";
import {
  INVERT_RES1_HI,
  INVERT_RES1_LO,
  INVERT_RES1_MEAN,
  INVERT_RES1_N,
  INVERT_RES1_SALT,
  INVERT_SIGNED_HI,
  INVERT_SIGNED_LO,
  INVERT_SIGNED_MEAN,
  INVERT_SIGNED_N,
  INVERT_SIGNED_SALT,
  SOURCE_ERR1_SALT,
  SOURCE_ERROR_DELTA,
  SOURCE_ERROR_SALT,
} from "../src/lib/kernel/source-run.ts";
import {
  ONSET_BIN_ERR1_SALT,
  ONSET_BIN_SALT,
  ONSET_LATE,
  ONSET_OPEN,
  SOURCE_ERR1_HI,
  SOURCE_ERR1_LO,
  SOURCE_ERR1_MEAN,
  SOURCE_ERR1_N,
  SOURCE_ERROR_HI,
  SOURCE_ERROR_LO,
  SOURCE_ERROR_MEAN,
  SOURCE_ERROR_N,
  type OnsetArm,
  type OnsetRequest,
  type OnsetResult,
} from "../src/lib/kernel/onset-run.ts";
import {
  CREDIT_RHO_CONTENT_MEAN,
  CREDIT_RHO_CONTENT_N,
  CREDIT_RHO_OCCUPANCY,
  CREDIT_RHO_RECT_N,
  CREDIT_RHO_RECTIFIED,
} from "../src/lib/kernel/chain-run.ts";
import {
  creditContentClass,
  greaterCall,
  MIN_ROOM_STEPS,
  onsetSummary,
  onsetVerdict,
  SHIPPED_POLICY_TEMPERATURE,
  type Call,
  type CreditClass,
  type OnsetLink,
} from "../src/lib/kernel/noise.ts";
import type { CuriositySignal } from "../src/lib/kernel/signals.ts";
import { bootstrapMeanCI, meanOf, type Interval } from "../src/lib/kernel/stats.ts";
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

const BIN_LABEL = ["exposure 1-2", "exposure 3-8", "exposure 9-16", "exposure 17-32", "exposure 33+"] as const;

const COLOR: RGB = [140, 60, 180];

const ARMS: OnsetArm[] = ["pattern", "noise"];

function fmt(ci: { mean: number; lo: number; hi: number }) {
  return `${ci.mean.toFixed(4)} [${ci.lo.toFixed(4)}, ${ci.hi.toFixed(4)}]`;
}

function keyOf(id: ExplorerId, arm: OnsetArm, seed: number) {
  return `${id}|${arm}|${seed}`;
}

type PieceRow = Interval & { klass: CreditClass };

type Report = {
  temperature: number;
  steps: number;
  seeds: number;
  errorDelta: number;
  openExposure: number;
  lateExposure: number;
  summary: OnsetLink;
  verdict: Call;
  errorAll: PieceRow;
  err1All: PieceRow;
  errorOpen: PieceRow;
  err1Open: PieceRow;
  errorLate: PieceRow;
  err1Late: PieceRow;
  bins: { label: string; error: PieceRow; err1: PieceRow; meanSteps: { pattern: number; noise: number } }[];
  rectified: Interval;
  occupancy: Interval;
  meanRoomSteps: { pattern: number; noise: number };
  harnessOk: boolean;
  elapsedSec: number;
  workers: number;
};

function blank(width: number, height: number) {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 255;
    rgba[i + 1] = 255;
    rgba[i + 2] = 255;
    rgba[i + 3] = 255;
  }
  return rgba;
}

function vline(rgba: Uint8Array, width: number, x: number, top: number, bottom: number, rgb: RGB) {
  const px = Math.round(x);
  for (let y = top; y <= bottom; y++) {
    const i = (y * width + px) * 4;
    if (i < 0 || i + 3 >= rgba.length) continue;
    rgba[i] = rgb[0];
    rgba[i + 1] = rgb[1];
    rgba[i + 2] = rgb[2];
    rgba[i + 3] = 255;
  }
}

type Bar = { name: string; mean: number; lo: number; hi: number };

function drawPanel(rgba: Uint8Array, width: number, bars: Bar[], title: string, top: number, delta: number) {
  drawText(rgba, width, 16, top, title, [30, 30, 30]);
  const left = 220;
  const right = width - 28;
  const plotTop = top + 22;
  const plotBottom = top + 16 + bars.length * 36;
  let xMin = -delta;
  let xMax = delta;
  for (const bar of bars) {
    xMin = Math.min(xMin, bar.lo, bar.mean);
    xMax = Math.max(xMax, bar.hi, bar.mean);
  }
  const pad = Math.max(0.002, (xMax - xMin) * 0.12);
  xMin -= pad;
  xMax += pad;
  const xOf = (value: number) => left + ((value - xMin) / (xMax - xMin || 1)) * (right - left);
  vline(rgba, width, xOf(0), plotTop, plotBottom, [170, 170, 170]);
  vline(rgba, width, xOf(delta), plotTop, plotBottom, [210, 180, 80]);
  vline(rgba, width, xOf(-delta), plotTop, plotBottom, [210, 180, 80]);
  bars.forEach((bar, i) => {
    const y = plotTop + 6 + i * 36;
    drawText(rgba, width, 16, y - 2, bar.name, [30, 30, 30]);
    const x0 = Math.round(xOf(bar.lo));
    const x1 = Math.round(xOf(bar.hi));
    fillRect(rgba, width, Math.min(x0, x1), y + 6, Math.max(2, Math.abs(x1 - x0)), 4, COLOR);
    fillRect(rgba, width, Math.round(xOf(bar.mean)) - 3, y, 6, 16, COLOR);
  });
  return plotBottom;
}

function drawGaps(report: Report) {
  const width = 980;
  const height = 620;
  const rgba = blank(width, height);
  drawText(rgba, width, 8, 8, "expected error by exposure, pattern minus noise", [30, 30, 30]);
  drawText(rgba, width, 8, 22, "rho, shipped temperature. gold lines are the squared-error delta", [90, 60, 120]);
  const drop: Bar[] = [
    { name: "all samples", ...report.errorAll },
    ...report.bins.map((bin) => ({ name: bin.label, mean: bin.error.mean, lo: bin.error.lo, hi: bin.error.hi })),
  ];
  const level: Bar[] = [
    { name: "all samples", ...report.err1All },
    ...report.bins.map((bin) => ({ name: bin.label, mean: bin.err1.mean, lo: bin.err1.lo, hi: bin.err1.hi })),
  ];
  const bottom = drawPanel(rgba, width, drop, "expected-error drop", 48, report.errorDelta);
  drawPanel(rgba, width, level, "first-window expected error", bottom + 28, report.errorDelta);
  const scaled = scaleNearest(rgba, width, height, 2);
  return writePng(scaled.width, scaled.height, scaled.rgba);
}

function writeOutputs(report: Report) {
  mkdirSync("bench/onset", { recursive: true });
  writeFileSync("bench/onset/onset.json", JSON.stringify(report, null, 2));
  const lines = ["quantity,mean,lo,hi,n,class"];
  const push = (name: string, row: PieceRow) => {
    lines.push([name, row.mean, row.lo, row.hi, row.n, row.klass].join(","));
  };
  push("errorAll", report.errorAll);
  push("err1All", report.err1All);
  push("errorOpen", report.errorOpen);
  push("err1Open", report.err1Open);
  push("errorLate", report.errorLate);
  push("err1Late", report.err1Late);
  for (const bin of report.bins) {
    push(`error ${bin.label}`, bin.error);
    push(`err1 ${bin.label}`, bin.err1);
  }
  writeFileSync("bench/onset/onset.csv", `${lines.join("\n")}\n`);
  writeFileSync("bench/onset/onset-gap.png", drawGaps(report));
}

function rowAt(index: Map<string, OnsetResult>, id: ExplorerId, arm: OnsetArm, seed: number) {
  const row = index.get(keyOf(id, arm, seed));
  if (!row) throw new Error(`missing ${id} ${arm} seed ${seed}`);
  return row;
}

function matches(ci: Interval, mean: number, lo: number, hi: number, n: number, label: string) {
  if (ci.n !== n) throw new Error(`${label} n is ${ci.n}, not ${n}`);
  if (Math.abs(ci.mean - mean) > 1e-12) throw new Error(`${label} mean is ${ci.mean}, not ${mean}`);
  if (Math.abs(ci.lo - lo) > 1e-12 || Math.abs(ci.hi - hi) > 1e-12) {
    throw new Error(`${label} interval ${fmt(ci)} does not match`);
  }
}

function gapOf(
  index: Map<string, OnsetResult>,
  seeds: number[],
  pick: (row: OnsetResult) => number | null,
) {
  const gap: number[] = [];
  for (const seed of seeds) {
    const pattern = pick(rowAt(index, "rho", "pattern", seed));
    const noise = pick(rowAt(index, "rho", "noise", seed));
    if (pattern == null || noise == null) continue;
    gap.push(pattern - noise);
  }
  return gap;
}

async function main() {
  if (process.argv.includes("--figure-only")) {
    const saved = JSON.parse(readFileSync("bench/onset/onset.json", "utf8")) as Report;
    writeOutputs(saved);
    return;
  }
  const census = patternChannelCensus("all");
  if (census.open !== PATTERN_CHANNEL_OPEN || census.kept !== PATTERN_CHANNEL_OPEN) {
    throw new Error(`pattern census ${census.open}/${census.kept} is not ${PATTERN_CHANNEL_OPEN}`);
  }

  const debug = process.argv.includes("--debug");
  const seedsN = Math.max(1, Number(arg("seeds", "800")));
  const steps = Math.max(1, Number(arg("steps", "400")));
  if (!debug && (seedsN !== 800 || steps !== 400)) {
    throw new Error(`the locked run is 800 seeds and 400 steps, got ${seedsN} and ${steps}`);
  }
  const workers = workerCount(Number(arg("workers", "0")));
  const seeds = Array.from({ length: seedsN }, (_, i) => i + 1);
  const jobs: OnsetRequest[] = [];
  let id = 0;
  for (const seed of seeds) {
    for (const explorer of EXPLORERS) {
      for (const arm of ARMS) {
        jobs.push({
          id: id++,
          seed,
          signal: explorer.signal as CuriositySignal,
          steps,
          arm,
        });
      }
    }
  }
  console.error(
    `onset ${jobs.length} episodes, ${workers} workers, ${steps} steps, temperature ${SHIPPED_POLICY_TEMPERATURE}`,
  );
  const t0 = Date.now();
  const rows = await runPool<OnsetRequest, OnsetResult>(jobs, new URL("./onset-worker.ts", import.meta.url), workers);
  const elapsedSec = (Date.now() - t0) / 1000;
  console.error(`batch finished in ${elapsedSec.toFixed(1)}s`);
  if (rows.length !== jobs.length) throw new Error(`expected ${jobs.length} rows, got ${rows.length}`);

  const index = new Map<string, OnsetResult>();
  for (const row of rows) {
    const key = keyOf(row.signal as ExplorerId, row.arm, row.seed);
    if (index.has(key)) throw new Error(`duplicate ${key}`);
    index.set(key, row);
  }

  for (const seed of seeds) {
    const pattern = rowAt(index, "random", "pattern", seed);
    const noise = rowAt(index, "random", "noise", seed);
    if (
      pattern.path !== noise.path ||
      pattern.distractorFrac !== noise.distractorFrac ||
      pattern.foods !== noise.foods ||
      pattern.lives !== noise.lives
    ) {
      throw new Error(`random walk diverged at seed ${seed}`);
    }
  }

  const occ: number[] = [];
  for (const seed of seeds) {
    const pattern = rowAt(index, "rho", "pattern", seed);
    const noise = rowAt(index, "rho", "noise", seed);
    occ.push(pattern.distractorFrac - noise.distractorFrac);
  }
  const occMean = meanOf(occ);
  if (!debug && Math.abs(occMean - CREDIT_RHO_OCCUPANCY) > 1e-12) {
    throw new Error(`rho occupancy is ${occMean}, not the credit mean`);
  }

  const rectValues: number[] = [];
  for (const seed of seeds) {
    const pattern = rowAt(index, "rho", "pattern", seed);
    const noise = rowAt(index, "rho", "noise", seed);
    if (pattern.east.n < MIN_ROOM_STEPS || noise.east.n < MIN_ROOM_STEPS) continue;
    rectValues.push(pattern.east.rectifiedMean - noise.east.rectifiedMean);
  }
  if (!debug && rectValues.length !== CREDIT_RHO_RECT_N) {
    throw new Error(`rectified n is ${rectValues.length}, not ${CREDIT_RHO_RECT_N}`);
  }
  const rectMean = meanOf(rectValues);
  if (!debug && Math.abs(rectMean - CREDIT_RHO_RECTIFIED) > 1e-12) {
    throw new Error(`rectified mean is ${rectMean}, not the credit mean`);
  }

  const contentValues: number[] = [];
  for (const seed of seeds) {
    const pattern = rowAt(index, "rho", "pattern", seed);
    const noise = rowAt(index, "rho", "noise", seed);
    if (pattern.scoreSteps >= 1 && noise.scoreSteps >= 1) contentValues.push(pattern.scoreGap - noise.scoreGap);
  }
  if (!debug && contentValues.length !== CREDIT_RHO_CONTENT_N) {
    throw new Error(`doorway n is ${contentValues.length}, not ${CREDIT_RHO_CONTENT_N}`);
  }
  const contentMean = meanOf(contentValues);
  if (!debug && Math.abs(contentMean - CREDIT_RHO_CONTENT_MEAN) > 1e-12) {
    throw new Error(`doorway mean is ${contentMean}, not the credit mean`);
  }

  const present = (band: number) => (row: OnsetResult) => (row.binSteps[band]! >= 1 ? row.binError[band]! : null);
  const presentErr = (band: number) => (row: OnsetResult) => (row.binSteps[band]! >= 1 ? row.binErr1[band]! : null);
  const allError = (row: OnsetResult) => (row.roomSteps >= 1 ? row.error : null);
  const allErr1 = (row: OnsetResult) => (row.roomSteps >= 1 ? row.err1 : null);

  const classGap = (gap: number[], salt: number) => {
    const ci = bootstrapMeanCI(gap, 2000, 0.05, salt);
    return { ...ci, klass: creditContentClass(ci, ci.n, seedsN, SOURCE_ERROR_DELTA) };
  };

  const errorAll = classGap(gapOf(index, seeds, allError), SOURCE_ERROR_SALT);
  const err1All = classGap(gapOf(index, seeds, allErr1), SOURCE_ERR1_SALT);
  const bins = BIN_LABEL.map((label, band) => {
    const error = classGap(gapOf(index, seeds, present(band)), ONSET_BIN_SALT[band]!);
    const err1 = classGap(gapOf(index, seeds, presentErr(band)), ONSET_BIN_ERR1_SALT[band]!);
    let patternSteps = 0;
    let noiseSteps = 0;
    for (const seed of seeds) {
      patternSteps += rowAt(index, "rho", "pattern", seed).binSteps[band]!;
      noiseSteps += rowAt(index, "rho", "noise", seed).binSteps[band]!;
    }
    return {
      label,
      error,
      err1,
      meanSteps: { pattern: patternSteps / seedsN, noise: noiseSteps / seedsN },
    };
  });
  const errorOpen = bins[0]!.error;
  const err1Open = bins[0]!.err1;
  const errorLate = bins[4]!.error;
  const err1Late = bins[4]!.err1;

  const randomCall = (pick: (row: OnsetResult) => number | null, salt: number, label: string) => {
    const gap: number[] = [];
    for (const seed of seeds) {
      const pattern = pick(rowAt(index, "random", "pattern", seed));
      const noise = pick(rowAt(index, "random", "noise", seed));
      if (pattern == null || noise == null) continue;
      gap.push(pattern - noise);
    }
    if (gap.length * 2 <= seedsN) throw new Error(`random kept too few seeds for ${label}`);
    if (meanOf(gap) !== 0) throw new Error(`random ${label} mean is ${meanOf(gap)}`);
    const ci = bootstrapMeanCI(gap, 2000, 0.05, salt);
    if (greaterCall(ci) !== "inconclusive") throw new Error(`random ${label} excluded 0`);
  };
  randomCall(allError, 29501, "error");
  randomCall(allErr1, 29502, "err1");
  randomCall(present(0), 29503, "error open");
  randomCall(presentErr(0), 29504, "err1 open");
  randomCall(present(4), 29505, "error late");
  randomCall(presentErr(4), 29506, "err1 late");

  const randomDrop: number[] = [];
  for (const seed of seeds) {
    const pattern = rowAt(index, "random", "pattern", seed);
    const noise = rowAt(index, "random", "noise", seed);
    if (pattern.roomSteps >= 1 && noise.roomSteps >= 1) randomDrop.push(pattern.drop2 - noise.drop2);
  }
  if (randomDrop.length * 2 <= seedsN) throw new Error("random kept too few in-room seeds");
  if (meanOf(randomDrop) !== 0) throw new Error(`random shipped drop mean is ${meanOf(randomDrop)}`);
  if (greaterCall(bootstrapMeanCI(randomDrop, 2000, 0.05, 28500)) !== "inconclusive") {
    throw new Error("random shipped drop excluded 0");
  }

  for (const explorer of EXPLORERS) {
    if (explorer.id === "rho") continue;
    for (const seed of seeds) {
      for (const arm of ARMS) {
        const row = rowAt(index, explorer.id, arm, seed);
        if (row.roomSteps >= 1 && row.drop2 !== 0) {
          throw new Error(`${explorer.id} ${arm} seed ${seed} wrote a horizon drop`);
        }
        if (row.error !== 0 || row.err1 !== 0) {
          throw new Error(`${explorer.id} ${arm} seed ${seed} wrote an expected error`);
        }
      }
    }
  }

  const dropGap: number[] = [];
  const signedGap: number[] = [];
  const resGap: number[] = [];
  for (const seed of seeds) {
    const pattern = rowAt(index, "rho", "pattern", seed);
    const noise = rowAt(index, "rho", "noise", seed);
    if (pattern.roomSteps < 1 || noise.roomSteps < 1) continue;
    dropGap.push(pattern.drop2 - noise.drop2);
    signedGap.push(pattern.signed - noise.signed);
    resGap.push(pattern.res1 - noise.res1);
  }
  const dropCi = bootstrapMeanCI(dropGap, 2000, 0.05, REACH_ROOM_DROP2_SALT);
  const signedCi = bootstrapMeanCI(signedGap, 2000, 0.05, INVERT_SIGNED_SALT);
  const resCi = bootstrapMeanCI(resGap, 2000, 0.05, INVERT_RES1_SALT);
  if (!debug) {
    matches(errorAll, SOURCE_ERROR_MEAN, SOURCE_ERROR_LO, SOURCE_ERROR_HI, SOURCE_ERROR_N, "error");
    matches(err1All, SOURCE_ERR1_MEAN, SOURCE_ERR1_LO, SOURCE_ERR1_HI, SOURCE_ERR1_N, "err1");
    matches(dropCi, REACH_ROOM_DROP2_MEAN, REACH_ROOM_DROP2_LO, REACH_ROOM_DROP2_HI, REACH_ROOM_DROP2_N, "drop");
    matches(signedCi, INVERT_SIGNED_MEAN, INVERT_SIGNED_LO, INVERT_SIGNED_HI, INVERT_SIGNED_N, "signed");
    matches(resCi, INVERT_RES1_MEAN, INVERT_RES1_LO, INVERT_RES1_HI, INVERT_RES1_N, "res1");
  }

  const summary = onsetSummary(
    false,
    errorAll.klass,
    err1All.klass,
    errorOpen.klass,
    err1Open.klass,
    errorLate.klass,
    err1Late.klass,
  );
  const verdict = onsetVerdict(summary);

  const meanRoom = (arm: OnsetArm) => {
    let s = 0;
    for (const seed of seeds) s += rowAt(index, "rho", arm, seed).roomSteps;
    return s / seedsN;
  };
  const rectified = bootstrapMeanCI(rectValues, 2000, 0.05, 26304);
  if (
    !debug &&
    (Math.abs(rectified.lo - 0.020584800349733586) > 1e-12 || Math.abs(rectified.hi - 0.022222900562580226) > 1e-12)
  ) {
    throw new Error(`rectified interval ${fmt(rectified)} is not the credit interval`);
  }
  const occupancy = bootstrapMeanCI(occ, 2000, 0.05, 26204);
  if (
    !debug &&
    (Math.abs(occupancy.lo - -0.008018749999999995) > 1e-12 || Math.abs(occupancy.hi - 0.012543750000000003) > 1e-12)
  ) {
    throw new Error(`occupancy interval ${fmt(occupancy)} is not the credit interval`);
  }

  const report: Report = {
    temperature: SHIPPED_POLICY_TEMPERATURE,
    steps,
    seeds: seedsN,
    errorDelta: SOURCE_ERROR_DELTA,
    openExposure: ONSET_OPEN,
    lateExposure: ONSET_LATE,
    summary,
    verdict,
    errorAll,
    err1All,
    errorOpen,
    err1Open,
    errorLate,
    err1Late,
    bins,
    rectified,
    occupancy,
    meanRoomSteps: { pattern: meanRoom("pattern"), noise: meanRoom("noise") },
    harnessOk: true,
    elapsedSec,
    workers,
  };
  writeOutputs(report);
  const lines = [
    `summary ${summary}`,
    `verdict ${verdict}`,
    `errorDelta ${SOURCE_ERROR_DELTA}`,
    `errorAll ${fmt(errorAll)} n=${errorAll.n} ${errorAll.klass}`,
    `err1All ${fmt(err1All)} n=${err1All.n} ${err1All.klass}`,
    `errorOpen ${fmt(errorOpen)} n=${errorOpen.n} ${errorOpen.klass}`,
    `err1Open ${fmt(err1Open)} n=${err1Open.n} ${err1Open.klass}`,
    `errorLate ${fmt(errorLate)} n=${errorLate.n} ${errorLate.klass}`,
    `err1Late ${fmt(err1Late)} n=${err1Late.n} ${err1Late.klass}`,
    ...bins.map(
      (bin) =>
        `${bin.label} error ${fmt(bin.error)} n=${bin.error.n} ${bin.error.klass} err1 ${fmt(bin.err1)} n=${bin.err1.n} ${bin.err1.klass} steps ${bin.meanSteps.pattern.toFixed(2)}/${bin.meanSteps.noise.toFixed(2)}`,
    ),
    `rectified ${fmt(rectified)} n=${rectified.n}`,
    `occupancy ${fmt(occupancy)} n=${occupancy.n}`,
    `room steps ${report.meanRoomSteps.pattern.toFixed(2)}/${report.meanRoomSteps.noise.toFixed(2)}`,
    `elapsed ${elapsedSec.toFixed(1)}s`,
  ];
  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
