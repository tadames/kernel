/**
 * Where the pattern's progress edge is lost before the doorway score.
 * Not part of CI.
 *
 *   npm run chain
 *
 * Seeds 1–800, 400 steps, shipped temperature. Pattern minus matched noise.
 * The total score is the credit content contrast. The pieces are the call.
 * Writes bench/chain/chain.json, chain.csv, and chain-gap.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PATTERN_CHANNEL_OPEN, patternChannelCensus } from "../src/lib/kernel/family.ts";
import {
  CHAIN_RHO_HAT_DELTA,
  CHAIN_SCORE_DELTA,
  CREDIT_RHO_CONTENT_MEAN,
  CREDIT_RHO_CONTENT_N,
  CREDIT_RHO_OCCUPANCY,
  CREDIT_RHO_RECT_N,
  CREDIT_RHO_RECTIFIED,
  type ChainArm,
  type ChainPartName,
  type ChainRequest,
  type ChainResult,
} from "../src/lib/kernel/chain-run.ts";
import {
  chainCarry,
  chainSummary,
  chainVerdict,
  creditContentClass,
  greaterCall,
  MIN_ROOM_STEPS,
  SHIPPED_POLICY_TEMPERATURE,
  type Call,
  type ChainLink,
  type CreditClass,
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

const PIECES = ["rho", "global", "uncertainty", "extrinsic", "follow", "rhoHat", "total"] as const;
type Piece = (typeof PIECES)[number];

const COLOR: Record<ExplorerId, RGB> = {
  random: [120, 120, 120],
  count: [36, 104, 196],
  surprise: [186, 42, 58],
  rnd: [40, 140, 90],
  rho: [140, 60, 180],
};

const ARMS: ChainArm[] = ["pattern", "noise"];

function fmt(ci: { mean: number; lo: number; hi: number }) {
  return `${ci.mean.toFixed(4)} [${ci.lo.toFixed(4)}, ${ci.hi.toFixed(4)}]`;
}

function keyOf(id: ExplorerId, arm: ChainArm, seed: number) {
  return `${id}|${arm}|${seed}`;
}

type PieceRow = Interval & { call: Call; klass: CreditClass; carry: boolean };

type Report = {
  temperature: number;
  steps: number;
  seeds: number;
  scoreDelta: number;
  rhoHatDelta: number;
  summary: ChainLink;
  verdict: Call;
  pieces: Record<Piece, Record<ExplorerId, PieceRow>>;
  rectified: Interval;
  occupancy: Interval;
  meanScoreSteps: { pattern: number; noise: number };
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

const PIECE_LABEL: Record<Piece, string> = {
  rho: "rho term",
  global: "global",
  uncertainty: "uncertainty",
  extrinsic: "extrinsic",
  follow: "follow",
  rhoHat: "raw rho-hat",
  total: "total score",
};

type Bar = { piece: Piece; mean: number; lo: number; hi: number };

function drawGaps(bars: Bar[], scoreDelta: number, rhoHatDelta: number) {
  const width = 880;
  const height = 520;
  const rgba = blank(width, height);
  drawText(rgba, width, 8, 8, "doorway pieces, pattern minus noise", [30, 30, 30]);
  drawText(rgba, width, 8, 22, "rho, shipped temperature", [90, 60, 120]);
  const left = 168;
  const right = width - 28;
  const top = 56;
  const bottom = 300;
  const scoreBars = bars.filter((bar) => bar.piece !== "rhoHat");
  let xMin = -scoreDelta;
  let xMax = scoreDelta;
  for (const bar of scoreBars) {
    xMin = Math.min(xMin, bar.lo, bar.mean);
    xMax = Math.max(xMax, bar.hi, bar.mean);
  }
  const pad = Math.max(0.002, (xMax - xMin) * 0.12);
  xMin -= pad;
  xMax += pad;
  const xOf = (value: number) => left + ((value - xMin) / (xMax - xMin || 1)) * (right - left);
  vline(rgba, width, xOf(0), top, bottom, [170, 170, 170]);
  vline(rgba, width, xOf(scoreDelta), top, bottom, [210, 180, 80]);
  vline(rgba, width, xOf(-scoreDelta), top, bottom, [210, 180, 80]);
  drawText(rgba, width, Math.round(xOf(0)) - 4, top - 14, "0", [80, 80, 80]);
  scoreBars.forEach((bar, i) => {
    const y = top + 8 + i * 36;
    drawText(rgba, width, 16, y - 2, PIECE_LABEL[bar.piece], [30, 30, 30]);
    const x0 = Math.round(xOf(bar.lo));
    const x1 = Math.round(xOf(bar.hi));
    fillRect(rgba, width, Math.min(x0, x1), y + 6, Math.max(2, Math.abs(x1 - x0)), 4, COLOR.rho);
    fillRect(rgba, width, Math.round(xOf(bar.mean)) - 3, y, 6, 16, COLOR.rho);
  });

  const hat = bars.find((bar) => bar.piece === "rhoHat");
  const hatTop = 340;
  const hatBottom = height - 36;
  drawText(rgba, width, 16, hatTop - 18, "raw rho-hat, before the explore weight", [30, 30, 30]);
  if (hat) {
    let hMin = Math.min(-rhoHatDelta, hat.lo, hat.mean);
    let hMax = Math.max(rhoHatDelta, hat.hi, hat.mean);
    const hPad = Math.max(0.002, (hMax - hMin) * 0.12);
    hMin -= hPad;
    hMax += hPad;
    const hOf = (value: number) => left + ((value - hMin) / (hMax - hMin || 1)) * (right - left);
    vline(rgba, width, hOf(0), hatTop, hatBottom, [170, 170, 170]);
    vline(rgba, width, hOf(rhoHatDelta), hatTop, hatBottom, [210, 180, 80]);
    vline(rgba, width, hOf(-rhoHatDelta), hatTop, hatBottom, [210, 180, 80]);
    const y = hatTop + 28;
    drawText(rgba, width, 16, y - 2, "raw rho-hat", [30, 30, 30]);
    const x0 = Math.round(hOf(hat.lo));
    const x1 = Math.round(hOf(hat.hi));
    fillRect(rgba, width, Math.min(x0, x1), y + 6, Math.max(2, Math.abs(x1 - x0)), 4, COLOR.rho);
    fillRect(rgba, width, Math.round(hOf(hat.mean)) - 3, y, 6, 16, COLOR.rho);
  }
  const scaled = scaleNearest(rgba, width, height, 2);
  return writePng(scaled.width, scaled.height, scaled.rgba);
}

function writeOutputs(report: Report) {
  mkdirSync("bench/chain", { recursive: true });
  writeFileSync("bench/chain/chain.json", JSON.stringify(report, null, 2));
  const lines = ["piece,explorer,mean,lo,hi,n,call,class,carry"];
  for (const piece of PIECES) {
    for (const explorer of EXPLORERS) {
      const row = report.pieces[piece][explorer.id];
      lines.push(
        [piece, explorer.id, row.mean, row.lo, row.hi, row.n, row.call, row.klass, row.carry ? 1 : 0].join(","),
      );
    }
  }
  writeFileSync("bench/chain/chain.csv", `${lines.join("\n")}\n`);
  const bars: Bar[] = PIECES.map((piece) => {
    const row = report.pieces[piece].rho;
    return { piece, mean: row.mean, lo: row.lo, hi: row.hi };
  });
  writeFileSync("bench/chain/chain-gap.png", drawGaps(bars, report.scoreDelta, report.rhoHatDelta));
}

function rowAt(index: Map<string, ChainResult>, id: ExplorerId, arm: ChainArm, seed: number) {
  const row = index.get(keyOf(id, arm, seed));
  if (!row) throw new Error(`missing ${id} ${arm} seed ${seed}`);
  return row;
}

function excludesZero(row: Interval) {
  return greaterCall(row) !== "inconclusive";
}

function gapOf(pattern: ChainResult, noise: ChainResult, piece: Piece) {
  if (piece === "total") return pattern.scoreGap - noise.scoreGap;
  return pattern[piece] - noise[piece];
}

async function main() {
  if (process.argv.includes("--figure-only")) {
    const saved = JSON.parse(readFileSync("bench/chain/chain.json", "utf8")) as Report;
    writeOutputs(saved);
    return;
  }
  const census = patternChannelCensus("all");
  if (census.open !== PATTERN_CHANNEL_OPEN || census.kept !== PATTERN_CHANNEL_OPEN) {
    throw new Error(`pattern census ${census.open}/${census.kept} is not ${PATTERN_CHANNEL_OPEN}`);
  }

  const seedsN = Math.max(1, Number(arg("seeds", "800")));
  const steps = Math.max(1, Number(arg("steps", "400")));
  if (seedsN !== 800 || steps !== 400) {
    throw new Error(`the locked run is 800 seeds and 400 steps, got ${seedsN} and ${steps}`);
  }
  const workers = workerCount(Number(arg("workers", "0")));
  const seeds = Array.from({ length: seedsN }, (_, i) => i + 1);
  const jobs: ChainRequest[] = [];
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
    `chain ${jobs.length} episodes, ${workers} workers, ${steps} steps, temperature ${SHIPPED_POLICY_TEMPERATURE}`,
  );
  const t0 = Date.now();
  const rows = await runPool<ChainRequest, ChainResult>(jobs, new URL("./chain-worker.ts", import.meta.url), workers);
  const elapsedSec = (Date.now() - t0) / 1000;
  console.error(`batch finished in ${elapsedSec.toFixed(1)}s`);
  if (rows.length !== jobs.length) throw new Error(`expected ${jobs.length} rows, got ${rows.length}`);

  const index = new Map<string, ChainResult>();
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
  if (Math.abs(occMean - CREDIT_RHO_OCCUPANCY) > 1e-12) {
    throw new Error(`rho occupancy is ${occMean}, not the credit mean`);
  }

  const rectValues: number[] = [];
  for (const seed of seeds) {
    const pattern = rowAt(index, "rho", "pattern", seed);
    const noise = rowAt(index, "rho", "noise", seed);
    if (pattern.east.n < MIN_ROOM_STEPS || noise.east.n < MIN_ROOM_STEPS) continue;
    rectValues.push(pattern.east.rectifiedMean - noise.east.rectifiedMean);
  }
  if (rectValues.length !== CREDIT_RHO_RECT_N) {
    throw new Error(`rectified n is ${rectValues.length}, not ${CREDIT_RHO_RECT_N}`);
  }
  const rectMean = meanOf(rectValues);
  if (Math.abs(rectMean - CREDIT_RHO_RECTIFIED) > 1e-12) {
    throw new Error(`rectified mean is ${rectMean}, not the credit mean`);
  }

  const contentValues: number[] = [];
  for (const seed of seeds) {
    const pattern = rowAt(index, "rho", "pattern", seed);
    const noise = rowAt(index, "rho", "noise", seed);
    if (pattern.scoreSteps >= 1 && noise.scoreSteps >= 1) contentValues.push(pattern.scoreGap - noise.scoreGap);
  }
  if (contentValues.length !== CREDIT_RHO_CONTENT_N) {
    throw new Error(`doorway n is ${contentValues.length}, not ${CREDIT_RHO_CONTENT_N}`);
  }
  const contentMean = meanOf(contentValues);
  if (Math.abs(contentMean - CREDIT_RHO_CONTENT_MEAN) > 1e-12) {
    throw new Error(`doorway mean is ${contentMean}, not the credit mean`);
  }

  const saltOf: Record<Piece, number> = {
    rho: 27000,
    global: 27100,
    uncertainty: 27200,
    extrinsic: 27300,
    follow: 27400,
    rhoHat: 27500,
    total: 27600,
  };
  const deltaOf = (piece: Piece) => (piece === "rhoHat" ? CHAIN_RHO_HAT_DELTA : CHAIN_SCORE_DELTA);

  const pieces = {} as Report["pieces"];
  for (const piece of PIECES) {
    pieces[piece] = {} as Record<ExplorerId, PieceRow>;
    for (const explorer of EXPLORERS) {
      const explorerIndex = EXPLORERS.findIndex((row) => row.id === explorer.id);
      const gap: number[] = [];
      for (const seed of seeds) {
        const pattern = rowAt(index, explorer.id, "pattern", seed);
        const noise = rowAt(index, explorer.id, "noise", seed);
        if (pattern.scoreSteps >= 1 && noise.scoreSteps >= 1) gap.push(gapOf(pattern, noise, piece));
      }
      const ci = bootstrapMeanCI(gap, 2000, 0.05, saltOf[piece] + explorerIndex);
      const klass = creditContentClass(ci, ci.n, seedsN, deltaOf(piece));
      pieces[piece][explorer.id] = {
        ...ci,
        call: klass === "attracted" ? "confirmed" : klass === "repelled" ? "refuted" : "inconclusive",
        klass,
        carry: chainCarry(ci, deltaOf(piece)),
      };
    }
  }

  for (const piece of PIECES) {
    const row = pieces[piece].random;
    if (row.n * 2 <= seedsN) throw new Error(`random kept too few doorway seeds on ${piece}`);
    if (excludesZero(row)) throw new Error(`random ${piece} gap excluded 0`);
  }

  const rho = pieces.rho.rho;
  const raw = pieces.rhoHat.rho;
  const uncertainty = pieces.uncertainty.rho;
  const global = pieces.global.rho;
  const extrinsic = pieces.extrinsic.rho;
  const follow = pieces.follow.rho;
  const summary = chainSummary(false, rho.klass, raw.klass, uncertainty.klass, global.klass, extrinsic.klass, follow.klass, {
    uncertainty: uncertainty.carry,
    global: global.carry,
    extrinsic: extrinsic.carry,
    follow: follow.carry,
  });
  const verdict = chainVerdict(summary);

  const meanSteps = (arm: ChainArm) => {
    let s = 0;
    for (const seed of seeds) s += rowAt(index, "rho", arm, seed).scoreSteps;
    return s / seedsN;
  };
  const rectified = bootstrapMeanCI(rectValues, 2000, 0.05, 26304);
  if (
    Math.abs(rectified.lo - 0.020584800349733586) > 1e-12 ||
    Math.abs(rectified.hi - 0.022222900562580226) > 1e-12
  ) {
    throw new Error(`rectified interval ${fmt(rectified)} is not the credit interval`);
  }
  const occupancy = bootstrapMeanCI(occ, 2000, 0.05, 26204);
  if (
    Math.abs(occupancy.lo - -0.008018749999999995) > 1e-12 ||
    Math.abs(occupancy.hi - 0.012543750000000003) > 1e-12
  ) {
    throw new Error(`occupancy interval ${fmt(occupancy)} is not the credit interval`);
  }

  const report: Report = {
    temperature: SHIPPED_POLICY_TEMPERATURE,
    steps,
    seeds: seedsN,
    scoreDelta: CHAIN_SCORE_DELTA,
    rhoHatDelta: CHAIN_RHO_HAT_DELTA,
    summary,
    verdict,
    pieces,
    rectified,
    occupancy,
    meanScoreSteps: { pattern: meanSteps("pattern"), noise: meanSteps("noise") },
    harnessOk: true,
    elapsedSec,
    workers,
  };
  writeOutputs(report);
  const lines = [
    `summary ${summary}`,
    `verdict ${verdict}`,
    `score delta ${CHAIN_SCORE_DELTA}`,
    `rho-hat delta ${CHAIN_RHO_HAT_DELTA}`,
    ...PIECES.map((piece) => `${piece} rho ${fmt(pieces[piece].rho)} n=${pieces[piece].rho.n} ${pieces[piece].rho.klass}`),
    `rectified ${fmt(rectified)} n=${rectified.n}`,
    `occupancy rho ${fmt(occupancy)}`,
    `score steps rho pattern ${report.meanScoreSteps.pattern.toFixed(2)} noise ${report.meanScoreSteps.noise.toFixed(2)}`,
  ];
  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
