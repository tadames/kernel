/**
 * Why the in-room horizon-2 drop inverts retrospective progress.
 * Not part of CI.
 *
 *   npm run invert
 *
 * Seeds 1–800, 400 steps, shipped temperature. Pattern minus matched noise.
 * The shipped in-room drop is the reach row. The corrections are the call.
 * Writes bench/invert/invert.json, invert.csv, and invert-gap.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PATTERN_CHANNEL_OPEN, patternChannelCensus } from "../src/lib/kernel/family.ts";
import {
  REACH_ROOM_DROP2_HI,
  REACH_ROOM_DROP2_LO,
  REACH_ROOM_DROP2_MEAN,
  REACH_ROOM_DROP2_N,
  REACH_ROOM_DROP2_SALT,
  type InvertArm,
  type InvertRequest,
  type InvertResult,
} from "../src/lib/kernel/invert-run.ts";
import {
  CHAIN_RHO_HAT_DELTA,
  CREDIT_RHO_CONTENT_MEAN,
  CREDIT_RHO_CONTENT_N,
  CREDIT_RHO_OCCUPANCY,
  CREDIT_RHO_RECT_N,
  CREDIT_RHO_RECTIFIED,
} from "../src/lib/kernel/chain-run.ts";
import {
  creditContentClass,
  greaterCall,
  invertSummary,
  invertVerdict,
  MIN_ROOM_STEPS,
  SHIPPED_POLICY_TEMPERATURE,
  type Call,
  type CreditClass,
  type InvertLink,
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

const CALLS = ["rect", "signed", "mean", "scale", "early"] as const;
type CallName = (typeof CALLS)[number];

const EXTRA = ["meanRect", "order", "spread", "res1", "late", "step", "ema"] as const;
type ExtraName = (typeof EXTRA)[number];

const QUANTITIES = [...CALLS, ...EXTRA] as const;
type Quantity = (typeof QUANTITIES)[number];

const COLOR: RGB = [140, 60, 180];

const ARMS: InvertArm[] = ["pattern", "noise"];

function fmt(ci: { mean: number; lo: number; hi: number }) {
  return `${ci.mean.toFixed(4)} [${ci.lo.toFixed(4)}, ${ci.hi.toFixed(4)}]`;
}

function keyOf(id: ExplorerId, arm: InvertArm, seed: number) {
  return `${id}|${arm}|${seed}`;
}

type PieceRow = Interval & { klass: CreditClass };

type Report = {
  temperature: number;
  steps: number;
  seeds: number;
  delta: number;
  summary: InvertLink;
  verdict: Call;
  pieces: Record<Quantity, PieceRow>;
  rectified: Interval;
  occupancy: Interval;
  meanRoomSteps: { pattern: number; noise: number };
  meanEarlySteps: { pattern: number; noise: number };
  meanLateSteps: { pattern: number; noise: number };
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

const LABEL: Record<Quantity, string> = {
  rect: "shipped rectified drop",
  signed: "signed score-selected",
  mean: "mean follow-up, signed",
  scale: "drop / first residual",
  early: "early half, shipped drop",
  meanRect: "mean follow-up, rectified",
  order: "order statistic drop",
  spread: "follow-up residual range",
  res1: "first-window residual",
  late: "late half, shipped drop",
  step: "one-step progress",
  ema: "50-step progress",
};

type Bar = { name: Quantity; mean: number; lo: number; hi: number };

function drawPanel(
  rgba: Uint8Array,
  width: number,
  bars: Bar[],
  title: string,
  top: number,
  delta: number | null,
) {
  drawText(rgba, width, 16, top, title, [30, 30, 30]);
  const left = 250;
  const right = width - 28;
  const plotTop = top + 22;
  const plotBottom = top + 16 + bars.length * 36;
  let xMin = delta == null ? 0 : -delta;
  let xMax = delta == null ? 0 : delta;
  for (const bar of bars) {
    xMin = Math.min(xMin, bar.lo, bar.mean);
    xMax = Math.max(xMax, bar.hi, bar.mean);
  }
  const pad = Math.max(0.002, (xMax - xMin) * 0.12);
  xMin -= pad;
  xMax += pad;
  const xOf = (value: number) => left + ((value - xMin) / (xMax - xMin || 1)) * (right - left);
  vline(rgba, width, xOf(0), plotTop, plotBottom, [170, 170, 170]);
  if (delta != null) {
    vline(rgba, width, xOf(delta), plotTop, plotBottom, [210, 180, 80]);
    vline(rgba, width, xOf(-delta), plotTop, plotBottom, [210, 180, 80]);
  }
  bars.forEach((bar, i) => {
    const y = plotTop + 6 + i * 36;
    drawText(rgba, width, 16, y - 2, LABEL[bar.name], [30, 30, 30]);
    const x0 = Math.round(xOf(bar.lo));
    const x1 = Math.round(xOf(bar.hi));
    fillRect(rgba, width, Math.min(x0, x1), y + 6, Math.max(2, Math.abs(x1 - x0)), 4, COLOR);
    fillRect(rgba, width, Math.round(xOf(bar.mean)) - 3, y, 6, 16, COLOR);
  });
  return plotBottom;
}

function drawGaps(bars: Bar[], delta: number) {
  const width = 920;
  const height = 600;
  const rgba = blank(width, height);
  drawText(rgba, width, 8, 8, "in-room horizon-2 drop, pattern minus noise", [30, 30, 30]);
  drawText(rgba, width, 8, 22, "rho, shipped temperature. gold lines are delta, drop panel only", [90, 60, 120]);
  const drops: Quantity[] = ["rect", "signed", "mean", "order", "early", "late"];
  const levels: Quantity[] = ["res1", "spread"];
  const progress: Quantity[] = ["scale", "step", "ema"];
  const pick = (names: Quantity[]) =>
    names.map((name) => {
      const bar = bars.find((row) => row.name === name);
      if (!bar) throw new Error(`missing bar ${name}`);
      return bar;
    });
  let bottom = drawPanel(rgba, width, pick(drops), "forward drop, residual units", 48, delta);
  bottom = drawPanel(rgba, width, pick(levels), "residual level and range", bottom + 28, null);
  drawPanel(rgba, width, pick(progress), "scaled drop and retrospective progress", bottom + 28, null);
  const scaled = scaleNearest(rgba, width, height, 2);
  return writePng(scaled.width, scaled.height, scaled.rgba);
}

function writeOutputs(report: Report) {
  mkdirSync("bench/invert", { recursive: true });
  writeFileSync("bench/invert/invert.json", JSON.stringify(report, null, 2));
  const lines = ["quantity,mean,lo,hi,n,class"];
  for (const name of QUANTITIES) {
    const row = report.pieces[name];
    lines.push([name, row.mean, row.lo, row.hi, row.n, row.klass].join(","));
  }
  writeFileSync("bench/invert/invert.csv", `${lines.join("\n")}\n`);
  const bars: Bar[] = QUANTITIES.filter((name) => name !== "meanRect").map((name) => {
    const row = report.pieces[name];
    return { name, mean: row.mean, lo: row.lo, hi: row.hi };
  });
  writeFileSync("bench/invert/invert-gap.png", drawGaps(bars, report.delta));
}

function rowAt(index: Map<string, InvertResult>, id: ExplorerId, arm: InvertArm, seed: number) {
  const row = index.get(keyOf(id, arm, seed));
  if (!row) throw new Error(`missing ${id} ${arm} seed ${seed}`);
  return row;
}

function valueOf(row: InvertResult, name: Quantity) {
  if (name === "rect") return row.drop2;
  if (name === "signed") return row.signed;
  if (name === "mean") return row.mean;
  if (name === "scale") return row.scale;
  if (name === "early") return row.early;
  if (name === "meanRect") return row.meanRect;
  if (name === "order") return row.order;
  if (name === "spread") return row.spread;
  if (name === "res1") return row.res1;
  if (name === "late") return row.late;
  if (name === "step") return row.stepProg;
  return row.emaProg;
}

function kept(pattern: InvertResult, noise: InvertResult, name: Quantity) {
  if (name === "early") return pattern.earlySteps >= 1 && noise.earlySteps >= 1;
  if (name === "late") return pattern.lateSteps >= 1 && noise.lateSteps >= 1;
  return pattern.roomSteps >= 1 && noise.roomSteps >= 1;
}

const SALT: Record<Quantity, number> = {
  rect: REACH_ROOM_DROP2_SALT,
  signed: 29201,
  mean: 29202,
  scale: 29203,
  early: 29204,
  late: 29205,
  order: 29206,
  spread: 29207,
  res1: 29208,
  step: 29209,
  ema: 29210,
  meanRect: 29211,
};

async function main() {
  if (process.argv.includes("--figure-only")) {
    const saved = JSON.parse(readFileSync("bench/invert/invert.json", "utf8")) as Report;
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
  const jobs: InvertRequest[] = [];
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
    `invert ${jobs.length} episodes, ${workers} workers, ${steps} steps, temperature ${SHIPPED_POLICY_TEMPERATURE}`,
  );
  const t0 = Date.now();
  const rows = await runPool<InvertRequest, InvertResult>(jobs, new URL("./invert-worker.ts", import.meta.url), workers);
  const elapsedSec = (Date.now() - t0) / 1000;
  console.error(`batch finished in ${elapsedSec.toFixed(1)}s`);
  if (rows.length !== jobs.length) throw new Error(`expected ${jobs.length} rows, got ${rows.length}`);

  const index = new Map<string, InvertResult>();
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

  const pieces = {} as Record<Quantity, PieceRow>;
  for (const name of QUANTITIES) {
    const gap: number[] = [];
    for (const seed of seeds) {
      const pattern = rowAt(index, "rho", "pattern", seed);
      const noise = rowAt(index, "rho", "noise", seed);
      if (kept(pattern, noise, name)) gap.push(valueOf(pattern, name) - valueOf(noise, name));
    }
    const ci = bootstrapMeanCI(gap, 2000, 0.05, SALT[name]);
    pieces[name] = { ...ci, klass: creditContentClass(ci, ci.n, seedsN, CHAIN_RHO_HAT_DELTA) };
  }

  const randomGap: number[] = [];
  for (const seed of seeds) {
    const pattern = rowAt(index, "random", "pattern", seed);
    const noise = rowAt(index, "random", "noise", seed);
    if (pattern.roomSteps >= 1 && noise.roomSteps >= 1) randomGap.push(pattern.drop2 - noise.drop2);
  }
  const randomRect = bootstrapMeanCI(randomGap, 2000, 0.05, 28500);
  if (randomRect.n * 2 <= seedsN) throw new Error(`random kept too few in-room seeds`);
  if (randomRect.mean !== 0) throw new Error(`random shipped drop mean is ${randomRect.mean}`);
  if (greaterCall(randomRect) !== "inconclusive") throw new Error("random shipped drop excluded 0");
  for (const name of ["signed", "mean", "scale", "order", "spread", "res1"] as const) {
    const gap: number[] = [];
    for (const seed of seeds) {
      const pattern = rowAt(index, "random", "pattern", seed);
      const noise = rowAt(index, "random", "noise", seed);
      if (pattern.roomSteps >= 1 && noise.roomSteps >= 1) gap.push(valueOf(pattern, name) - valueOf(noise, name));
    }
    if (meanOf(gap) !== 0) throw new Error(`random ${name} mean is ${meanOf(gap)}`);
  }

  for (const explorer of EXPLORERS) {
    if (explorer.id === "rho") continue;
    for (const seed of seeds) {
      for (const arm of ARMS) {
        const row = rowAt(index, explorer.id, arm, seed);
        if (row.roomSteps >= 1 && row.drop2 !== 0) {
          throw new Error(`${explorer.id} ${arm} seed ${seed} wrote a horizon drop`);
        }
      }
    }
  }

  if (!debug) {
    const drop = pieces.rect;
    if (drop.n !== REACH_ROOM_DROP2_N) throw new Error(`drop n is ${drop.n}, not ${REACH_ROOM_DROP2_N}`);
    if (Math.abs(drop.mean - REACH_ROOM_DROP2_MEAN) > 1e-12) {
      throw new Error(`drop mean is ${drop.mean}, not the reach mean`);
    }
    if (Math.abs(drop.lo - REACH_ROOM_DROP2_LO) > 1e-12 || Math.abs(drop.hi - REACH_ROOM_DROP2_HI) > 1e-12) {
      throw new Error(`drop interval ${fmt(drop)} is not the reach interval`);
    }
  }

  const summary = invertSummary(
    false,
    pieces.rect.klass,
    pieces.signed.klass,
    pieces.mean.klass,
    pieces.scale.klass,
    pieces.early.klass,
    pieces.spread.klass,
    pieces.step.klass,
    pieces.ema.klass,
  );
  const verdict = invertVerdict(summary);

  const meanRoom = (arm: InvertArm) => {
    let s = 0;
    for (const seed of seeds) s += rowAt(index, "rho", arm, seed).roomSteps;
    return s / seedsN;
  };
  const meanEarly = (arm: InvertArm) => {
    let s = 0;
    for (const seed of seeds) s += rowAt(index, "rho", arm, seed).earlySteps;
    return s / seedsN;
  };
  const meanLate = (arm: InvertArm) => {
    let s = 0;
    for (const seed of seeds) s += rowAt(index, "rho", arm, seed).lateSteps;
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
    delta: CHAIN_RHO_HAT_DELTA,
    summary,
    verdict,
    pieces,
    rectified,
    occupancy,
    meanRoomSteps: { pattern: meanRoom("pattern"), noise: meanRoom("noise") },
    meanEarlySteps: { pattern: meanEarly("pattern"), noise: meanEarly("noise") },
    meanLateSteps: { pattern: meanLate("pattern"), noise: meanLate("noise") },
    harnessOk: true,
    elapsedSec,
    workers,
  };
  writeOutputs(report);
  const lines = [
    `summary ${summary}`,
    `verdict ${verdict}`,
    `delta ${CHAIN_RHO_HAT_DELTA}`,
    ...QUANTITIES.map((name) => {
      const row = pieces[name];
      return `${name} ${fmt(row)} n=${row.n} ${row.klass}`;
    }),
    `rectified ${fmt(rectified)} n=${rectified.n}`,
    `occupancy rho ${fmt(occupancy)}`,
    `room steps rho pattern ${report.meanRoomSteps.pattern.toFixed(2)} noise ${report.meanRoomSteps.noise.toFixed(2)}`,
    `early steps rho pattern ${report.meanEarlySteps.pattern.toFixed(2)} noise ${report.meanEarlySteps.noise.toFixed(2)}`,
    `late steps rho pattern ${report.meanLateSteps.pattern.toFixed(2)} noise ${report.meanLateSteps.noise.toFixed(2)}`,
  ];
  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
