/**
 * Learnable channel competing with stationary noise. Not part of CI.
 *
 *   npm run compete
 *
 * Seeds 1–200, 400 steps, shipped temperature. Pattern minus matched noise.
 * Writes bench/compete/compete.json, compete.csv, and compete-gap.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  PATTERN_CHANNEL_OPEN,
  PATTERN_CHANNEL_THIRD,
  patternChannelCensus,
} from "../src/lib/kernel/family.ts";
import {
  type CompeteArm,
  type CompeteLevel,
  type CompeteRequest,
  type CompeteResult,
} from "../src/lib/kernel/compete-run.ts";
import {
  competeSummary,
  competeVerdict,
  greaterCall,
  MIN_ROOM_STEPS,
  rhoGapBand,
  SHIPPED_POLICY_TEMPERATURE,
  type Call,
  type CompeteMixed,
  type CompeteSummary,
  type RhoGapBand,
} from "../src/lib/kernel/noise.ts";
import { instrumentDelta, phaseCellClass } from "../src/lib/kernel/phase-diagram.ts";
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

const LEVELS: CompeteLevel[] = ["third", "all"];

function fmt(ci: { mean: number; lo: number; hi: number }) {
  return `${ci.mean.toFixed(4)} [${ci.lo.toFixed(4)}, ${ci.hi.toFixed(4)}]`;
}

function keyOf(id: ExplorerId, level: CompeteLevel | "noise", arm: CompeteArm, seed: number) {
  return `${id}|${arm === "noise" ? "noise" : level}|${arm}|${seed}`;
}

type GapRow = Interval & { call: Call };
type Placed = Interval & { band: RhoGapBand };

type Report = {
  temperature: number;
  steps: number;
  seeds: number;
  openCells: number;
  keptThird: number;
  keptAll: number;
  summary: CompeteSummary;
  verdict: Call;
  delta: number | null;
  thirdClass: CompeteMixed;
  excess: Record<CompeteLevel, Record<ExplorerId, GapRow>>;
  rectified: Record<CompeteLevel, Placed>;
  surprise: Record<CompeteLevel, Record<ExplorerId, Interval>>;
  fraction: {
    noise: Record<ExplorerId, Interval>;
    pattern: Record<CompeteLevel, Record<ExplorerId, Interval>>;
  };
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

type Bar = { level: CompeteLevel; id: ExplorerId; mean: number; lo: number; hi: number };

function drawGaps(bars: Bar[]) {
  const width = 880;
  const height = 460;
  const rgba = blank(width, height);
  drawText(rgba, width, 8, 8, "pattern channel minus matched noise", [30, 30, 30]);
  drawText(rgba, width, 8, 22, "shipped temperature", [90, 60, 120]);
  const left = 168;
  const right = width - 28;
  const top = 52;
  const bottom = height - 36;
  let xMin = 0;
  let xMax = 0;
  for (const bar of bars) {
    xMin = Math.min(xMin, bar.lo, bar.mean);
    xMax = Math.max(xMax, bar.hi, bar.mean);
  }
  const pad = Math.max(0.002, (xMax - xMin) * 0.12);
  xMin -= pad;
  xMax += pad;
  const xOf = (value: number) => left + ((value - xMin) / (xMax - xMin || 1)) * (right - left);
  vline(rgba, width, xOf(0), top, bottom, [170, 170, 170]);
  drawText(rgba, width, Math.round(xOf(0)) - 4, top - 14, "0", [80, 80, 80]);
  const order: ExplorerId[] = ["random", "count", "surprise", "rnd", "rho"];
  LEVELS.forEach((level, group) => {
    const head = top + group * 190;
    drawText(rgba, width, 16, head, level === "all" ? "all cells" : "third", [30, 30, 30]);
    order.forEach((id, i) => {
      const bar = bars.find((row) => row.level === level && row.id === id);
      if (!bar) return;
      const y = head + 18 + i * 32;
      const color = COLOR[id];
      drawText(rgba, width, 16, y - 2, id, [30, 30, 30]);
      const x0 = Math.round(xOf(bar.lo));
      const x1 = Math.round(xOf(bar.hi));
      fillRect(rgba, width, Math.min(x0, x1), y + 6, Math.max(2, Math.abs(x1 - x0)), 4, color);
      fillRect(rgba, width, Math.round(xOf(bar.mean)) - 3, y, 6, 16, color);
    });
  });
  const scaled = scaleNearest(rgba, width, height, 2);
  return writePng(scaled.width, scaled.height, scaled.rgba);
}

function writeOutputs(report: Report) {
  mkdirSync("bench/compete", { recursive: true });
  writeFileSync("bench/compete/compete.json", JSON.stringify(report, null, 2));
  const lines = ["level,explorer,mean,lo,hi,n,call"];
  for (const level of LEVELS) {
    for (const explorer of EXPLORERS) {
      const row = report.excess[level][explorer.id];
      lines.push([level, explorer.id, row.mean, row.lo, row.hi, row.n, row.call].join(","));
    }
  }
  writeFileSync("bench/compete/compete.csv", `${lines.join("\n")}\n`);
  const bars: Bar[] = [];
  for (const level of LEVELS) {
    for (const explorer of EXPLORERS) {
      const row = report.excess[level][explorer.id];
      bars.push({ level, id: explorer.id, mean: row.mean, lo: row.lo, hi: row.hi });
    }
  }
  writeFileSync("bench/compete/compete-gap.png", drawGaps(bars));
}

function rowAt(index: Map<string, CompeteResult>, id: ExplorerId, level: CompeteLevel | "noise", arm: CompeteArm, seed: number) {
  const row = index.get(keyOf(id, level, arm, seed));
  if (!row) throw new Error(`missing ${id} ${level} ${arm} seed ${seed}`);
  return row;
}

async function main() {
  if (process.argv.includes("--figure-only")) {
    const saved = JSON.parse(readFileSync("bench/compete/compete.json", "utf8")) as Report;
    writeOutputs(saved);
    return;
  }
  const third = patternChannelCensus("third");
  const all = patternChannelCensus("all");
  if (third.open !== PATTERN_CHANNEL_OPEN || all.open !== PATTERN_CHANNEL_OPEN) {
    throw new Error(`open cells ${third.open}/${all.open} are not ${PATTERN_CHANNEL_OPEN}`);
  }
  if (third.kept !== PATTERN_CHANNEL_THIRD) throw new Error(`third keeps ${third.kept}, not ${PATTERN_CHANNEL_THIRD}`);
  if (all.kept !== PATTERN_CHANNEL_OPEN) throw new Error(`all keeps ${all.kept}, not ${PATTERN_CHANNEL_OPEN}`);

  const seedsN = Math.max(1, Number(arg("seeds", "200")));
  const steps = Math.max(1, Number(arg("steps", "400")));
  const workers = workerCount(Number(arg("workers", "0")));
  const seeds = Array.from({ length: seedsN }, (_, i) => i + 1);
  const jobs: CompeteRequest[] = [];
  let id = 0;
  for (const seed of seeds) {
    for (const explorer of EXPLORERS) {
      jobs.push({
        id: id++,
        seed,
        signal: explorer.signal as CuriositySignal,
        steps,
        level: "third",
        arm: "noise",
      });
      for (const level of LEVELS) {
        jobs.push({
          id: id++,
          seed,
          signal: explorer.signal as CuriositySignal,
          steps,
          level,
          arm: "pattern",
        });
      }
    }
  }
  console.error(
    `compete ${jobs.length} episodes, ${workers} workers, ${steps} steps, temperature ${SHIPPED_POLICY_TEMPERATURE}`,
  );
  const t0 = Date.now();
  const rows = await runPool<CompeteRequest, CompeteResult>(jobs, new URL("./compete-worker.ts", import.meta.url), workers);
  const elapsedSec = (Date.now() - t0) / 1000;
  console.error(`batch finished in ${elapsedSec.toFixed(1)}s`);
  if (rows.length !== jobs.length) throw new Error(`expected ${jobs.length} rows, got ${rows.length}`);

  const index = new Map<string, CompeteResult>();
  for (const row of rows) {
    const key = keyOf(row.signal as ExplorerId, row.level, row.arm, row.seed);
    if (index.has(key)) throw new Error(`duplicate ${key}`);
    index.set(key, row);
  }

  for (const level of LEVELS) {
    for (const seed of seeds) {
      const pattern = rowAt(index, "random", level, "pattern", seed);
      const noise = rowAt(index, "random", "noise", "noise", seed);
      if (
        pattern.path !== noise.path ||
        pattern.distractorFrac !== noise.distractorFrac ||
        pattern.foods !== noise.foods ||
        pattern.lives !== noise.lives
      ) {
        throw new Error(`random walk diverged at ${level} seed ${seed}`);
      }
    }
  }

  const excess = {} as Report["excess"];
  const surprise = {} as Report["surprise"];
  const rectified = {} as Report["rectified"];
  const fraction: Report["fraction"] = { noise: {} as Record<ExplorerId, Interval>, pattern: { third: {} as Record<ExplorerId, Interval>, all: {} as Record<ExplorerId, Interval> } };

  for (const explorer of EXPLORERS) {
    const explorerIndex = EXPLORERS.findIndex((row) => row.id === explorer.id);
    const noiseFrac: number[] = [];
    for (const seed of seeds) noiseFrac.push(rowAt(index, explorer.id, "noise", "noise", seed).distractorFrac);
    fraction.noise[explorer.id] = bootstrapMeanCI(noiseFrac, 2000, 0.05, 24300 + 2 * explorerIndex);
  }

  for (const level of LEVELS) {
    const levelIndex = level === "third" ? 0 : 1;
    excess[level] = {} as Record<ExplorerId, GapRow>;
    surprise[level] = {} as Record<ExplorerId, Interval>;
    for (const explorer of EXPLORERS) {
      const explorerIndex = EXPLORERS.findIndex((row) => row.id === explorer.id);
      const occ: number[] = [];
      const sur: number[] = [];
      const patternFrac: number[] = [];
      for (const seed of seeds) {
        const pattern = rowAt(index, explorer.id, level, "pattern", seed);
        const noise = rowAt(index, explorer.id, "noise", "noise", seed);
        occ.push(pattern.distractorFrac - noise.distractorFrac);
        patternFrac.push(pattern.distractorFrac);
        if (pattern.targetSurprise != null && noise.targetSurprise != null) {
          sur.push(pattern.targetSurprise - noise.targetSurprise);
        }
      }
      const ci = bootstrapMeanCI(occ, 2000, 0.05, 24000 + 10 * levelIndex + explorerIndex);
      excess[level][explorer.id] = { ...ci, call: greaterCall(ci) };
      surprise[level][explorer.id] = bootstrapMeanCI(sur, 2000, 0.05, 24200 + 10 * levelIndex + explorerIndex);
      fraction.pattern[level][explorer.id] = bootstrapMeanCI(
        patternFrac,
        2000,
        0.05,
        24300 + 20 * levelIndex + 2 * explorerIndex + 1,
      );
    }
    const rectValues: number[] = [];
    for (const seed of seeds) {
      const pattern = rowAt(index, "rho", level, "pattern", seed);
      const noise = rowAt(index, "rho", "noise", "noise", seed);
      if (pattern.east.n < MIN_ROOM_STEPS || noise.east.n < MIN_ROOM_STEPS) continue;
      rectValues.push(pattern.east.rectifiedMean - noise.east.rectifiedMean);
    }
    const rectCi = bootstrapMeanCI(rectValues, 2000, 0.05, 24100 + 10 * levelIndex + 4);
    rectified[level] = { ...rectCi, band: rhoGapBand(rectCi, seedsN, rectValues.length) };
  }

  const pure = excess.all.rho;
  const delta = instrumentDelta(pure.call, pure.lo);
  const thirdClass = phaseCellClass(excess.third.rho, delta) as CompeteMixed;
  const randomExcludes = LEVELS.some((level) => excess[level].random.call !== "inconclusive");
  const summary = competeSummary(randomExcludes, pure.call, thirdClass);
  const verdict = competeVerdict(summary, pure.call);
  const report: Report = {
    temperature: SHIPPED_POLICY_TEMPERATURE,
    steps,
    seeds: seedsN,
    openCells: PATTERN_CHANNEL_OPEN,
    keptThird: PATTERN_CHANNEL_THIRD,
    keptAll: PATTERN_CHANNEL_OPEN,
    summary,
    verdict,
    delta,
    thirdClass,
    excess,
    rectified,
    surprise,
    fraction,
    harnessOk: true,
    elapsedSec,
    workers,
  };
  writeOutputs(report);
  console.error(`summary ${summary} verdict ${verdict} third ${thirdClass} delta ${delta}`);
  for (const level of LEVELS) {
    console.error(`${level} rho ${fmt(excess[level].rho)} ${excess[level].rho.call}`);
    for (const explorer of EXPLORERS) {
      if (explorer.id === "rho") continue;
      const row = excess[level][explorer.id];
      console.error(`  ${explorer.id} ${fmt(row)} ${row.call}`);
    }
    console.error(`  rectified ${fmt(rectified[level])} ${rectified[level].band} n=${rectified[level].n}`);
    console.error(`  surprise rho ${fmt(surprise[level].rho)} n=${surprise[level].rho.n}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
