/**
 * Does the pure pattern reach the doorway score?
 * Not part of CI.
 *
 *   npm run credit
 *
 * Seeds 1–800, 400 steps, shipped temperature. Pattern minus matched noise,
 * and a planted bonus of 0.0169 on that pattern minus the same pattern.
 * Writes bench/credit/credit.json, credit.csv, and credit-gap.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PATTERN_CHANNEL_OPEN, patternChannelCensus } from "../src/lib/kernel/family.ts";
import {
  COMPETE_RHO_ALL_OCCUPANCY,
  COMPETE_RHO_ALL_RECT_N,
  COMPETE_RHO_ALL_RECTIFIED,
  CREDIT_DOSE,
  type CreditArm,
  type CreditRequest,
  type CreditResult,
} from "../src/lib/kernel/credit-run.ts";
import {
  CREDIT_POWER_DELTA,
  creditContentClass,
  creditInstrumentCall,
  creditSummary,
  creditVerdict,
  greaterCall,
  MIN_ROOM_STEPS,
  SHIPPED_POLICY_TEMPERATURE,
  type Call,
  type CreditClass,
  type CreditSummary,
} from "../src/lib/kernel/noise.ts";
import { instrumentDelta } from "../src/lib/kernel/phase-diagram.ts";
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

const COLOR: Record<ExplorerId, RGB> = {
  random: [120, 120, 120],
  count: [36, 104, 196],
  surprise: [186, 42, 58],
  rnd: [40, 140, 90],
  rho: [140, 60, 180],
};

const ARMS: CreditArm[] = ["pattern", "noise", "boost"];
const CONTRASTS = ["planted", "pattern"] as const;
type Contrast = (typeof CONTRASTS)[number];

function fmt(ci: { mean: number; lo: number; hi: number }) {
  return `${ci.mean.toFixed(4)} [${ci.lo.toFixed(4)}, ${ci.hi.toFixed(4)}]`;
}

function keyOf(id: ExplorerId, arm: CreditArm, seed: number) {
  return `${id}|${arm}|${seed}`;
}

type ScoreRow = Interval & { call: Call; klass: CreditClass };

type Report = {
  temperature: number;
  dose: number;
  steps: number;
  seeds: number;
  powerDelta: number;
  powerHolds: boolean;
  summary: CreditSummary;
  verdict: Call;
  delta: number | null;
  instrument: Record<ExplorerId, ScoreRow>;
  content: Record<ExplorerId, ScoreRow>;
  rectified: Interval;
  surprise: Record<ExplorerId, Interval>;
  occupancy: Record<ExplorerId, Interval>;
  fraction: Record<CreditArm, Record<ExplorerId, Interval>>;
  meanScoreSteps: { pattern: number; noise: number; boost: number };
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

type Bar = { contrast: Contrast; id: ExplorerId; mean: number; lo: number; hi: number };

function drawGaps(bars: Bar[], delta: number | null) {
  const width = 880;
  const height = 460;
  const rgba = blank(width, height);
  drawText(rgba, width, 8, 8, "doorway score, shipped temperature", [30, 30, 30]);
  drawText(rgba, width, 8, 22, "planted bonus and pattern minus noise", [90, 60, 120]);
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
  if (delta != null) {
    xMin = Math.min(xMin, -delta);
    xMax = Math.max(xMax, delta);
  }
  const pad = Math.max(0.002, (xMax - xMin) * 0.12);
  xMin -= pad;
  xMax += pad;
  const xOf = (value: number) => left + ((value - xMin) / (xMax - xMin || 1)) * (right - left);
  vline(rgba, width, xOf(0), top, bottom, [170, 170, 170]);
  drawText(rgba, width, Math.round(xOf(0)) - 4, top - 14, "0", [80, 80, 80]);
  if (delta != null) {
    vline(rgba, width, xOf(delta), top, bottom, [210, 180, 80]);
    vline(rgba, width, xOf(-delta), top, bottom, [210, 180, 80]);
  }
  const order: ExplorerId[] = ["random", "count", "surprise", "rnd", "rho"];
  CONTRASTS.forEach((contrast, group) => {
    const head = top + group * 190;
    drawText(rgba, width, 16, head, contrast === "planted" ? "planted 0.0169" : "pattern - noise", [30, 30, 30]);
    order.forEach((id, i) => {
      const bar = bars.find((row) => row.contrast === contrast && row.id === id);
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
  mkdirSync("bench/credit", { recursive: true });
  writeFileSync("bench/credit/credit.json", JSON.stringify(report, null, 2));
  const lines = ["contrast,explorer,mean,lo,hi,n,call,class"];
  for (const explorer of EXPLORERS) {
    const planted = report.instrument[explorer.id];
    const content = report.content[explorer.id];
    lines.push(
      ["planted", explorer.id, planted.mean, planted.lo, planted.hi, planted.n, planted.call, planted.klass].join(","),
    );
    lines.push(
      ["pattern", explorer.id, content.mean, content.lo, content.hi, content.n, content.call, content.klass].join(","),
    );
  }
  writeFileSync("bench/credit/credit.csv", `${lines.join("\n")}\n`);
  const bars: Bar[] = [];
  for (const explorer of EXPLORERS) {
    const planted = report.instrument[explorer.id];
    const content = report.content[explorer.id];
    bars.push({ contrast: "planted", id: explorer.id, mean: planted.mean, lo: planted.lo, hi: planted.hi });
    bars.push({ contrast: "pattern", id: explorer.id, mean: content.mean, lo: content.lo, hi: content.hi });
  }
  writeFileSync("bench/credit/credit-gap.png", drawGaps(bars, report.delta));
}

function rowAt(index: Map<string, CreditResult>, id: ExplorerId, arm: CreditArm, seed: number) {
  const row = index.get(keyOf(id, arm, seed));
  if (!row) throw new Error(`missing ${id} ${arm} seed ${seed}`);
  return row;
}

function excludesZero(row: Interval) {
  return greaterCall(row) !== "inconclusive";
}

async function main() {
  if (process.argv.includes("--figure-only")) {
    const saved = JSON.parse(readFileSync("bench/credit/credit.json", "utf8")) as Report;
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
  const jobs: CreditRequest[] = [];
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
    `credit ${jobs.length} episodes, ${workers} workers, ${steps} steps, temperature ${SHIPPED_POLICY_TEMPERATURE}, dose ${CREDIT_DOSE}`,
  );
  const t0 = Date.now();
  const rows = await runPool<CreditRequest, CreditResult>(jobs, new URL("./credit-worker.ts", import.meta.url), workers);
  const elapsedSec = (Date.now() - t0) / 1000;
  console.error(`batch finished in ${elapsedSec.toFixed(1)}s`);
  if (rows.length !== jobs.length) throw new Error(`expected ${jobs.length} rows, got ${rows.length}`);

  const index = new Map<string, CreditResult>();
  for (const row of rows) {
    const key = keyOf(row.signal as ExplorerId, row.arm, row.seed);
    if (index.has(key)) throw new Error(`duplicate ${key}`);
    index.set(key, row);
  }

  for (const seed of seeds) {
    const pattern = rowAt(index, "random", "pattern", seed);
    const noise = rowAt(index, "random", "noise", seed);
    const boost = rowAt(index, "random", "boost", seed);
    if (
      pattern.path !== noise.path ||
      pattern.path !== boost.path ||
      pattern.distractorFrac !== noise.distractorFrac ||
      pattern.distractorFrac !== boost.distractorFrac ||
      pattern.foods !== noise.foods ||
      pattern.foods !== boost.foods ||
      pattern.lives !== noise.lives ||
      pattern.lives !== boost.lives
    ) {
      throw new Error(`random walk diverged at seed ${seed}`);
    }
  }

  const published: number[] = [];
  for (let seed = 1; seed <= 200; seed++) {
    const pattern = rowAt(index, "rho", "pattern", seed);
    const noise = rowAt(index, "rho", "noise", seed);
    published.push(pattern.distractorFrac - noise.distractorFrac);
  }
  const publishedMean = meanOf(published);
  if (Math.abs(publishedMean - COMPETE_RHO_ALL_OCCUPANCY) > 1e-12) {
    throw new Error(`rho occupancy on seeds 1-200 is ${publishedMean}, not the compete mean`);
  }
  const rect200: number[] = [];
  for (let seed = 1; seed <= 200; seed++) {
    const pattern = rowAt(index, "rho", "pattern", seed);
    const noise = rowAt(index, "rho", "noise", seed);
    if (pattern.east.n < MIN_ROOM_STEPS || noise.east.n < MIN_ROOM_STEPS) continue;
    rect200.push(pattern.east.rectifiedMean - noise.east.rectifiedMean);
  }
  if (rect200.length !== COMPETE_RHO_ALL_RECT_N) {
    throw new Error(`rectified n on seeds 1-200 is ${rect200.length}, not ${COMPETE_RHO_ALL_RECT_N}`);
  }
  const rect200Mean = meanOf(rect200);
  if (Math.abs(rect200Mean - COMPETE_RHO_ALL_RECTIFIED) > 1e-12) {
    throw new Error(`rectified mean on seeds 1-200 is ${rect200Mean}, not the compete mean`);
  }

  const instrument = {} as Report["instrument"];
  const content = {} as Report["content"];
  const surprise = {} as Report["surprise"];
  const occupancy = {} as Report["occupancy"];
  const fraction = {
    pattern: {} as Record<ExplorerId, Interval>,
    noise: {} as Record<ExplorerId, Interval>,
    boost: {} as Record<ExplorerId, Interval>,
  };

  for (const explorer of EXPLORERS) {
    const explorerIndex = EXPLORERS.findIndex((row) => row.id === explorer.id);
    const planted: number[] = [];
    const gap: number[] = [];
    const occ: number[] = [];
    const sur: number[] = [];
    const patternFrac: number[] = [];
    const noiseFrac: number[] = [];
    const boostFrac: number[] = [];
    for (const seed of seeds) {
      const pattern = rowAt(index, explorer.id, "pattern", seed);
      const noise = rowAt(index, explorer.id, "noise", seed);
      const boost = rowAt(index, explorer.id, "boost", seed);
      patternFrac.push(pattern.distractorFrac);
      noiseFrac.push(noise.distractorFrac);
      boostFrac.push(boost.distractorFrac);
      occ.push(pattern.distractorFrac - noise.distractorFrac);
      if (pattern.scoreSteps >= 1 && boost.scoreSteps >= 1) planted.push(boost.scoreGap - pattern.scoreGap);
      if (pattern.scoreSteps >= 1 && noise.scoreSteps >= 1) gap.push(pattern.scoreGap - noise.scoreGap);
      if (pattern.targetSurprise != null && noise.targetSurprise != null) {
        sur.push(pattern.targetSurprise - noise.targetSurprise);
      }
    }
    const plantedCi = bootstrapMeanCI(planted, 2000, 0.05, 26000 + explorerIndex);
    const contentCi = bootstrapMeanCI(gap, 2000, 0.05, 26100 + explorerIndex);
    instrument[explorer.id] = {
      ...plantedCi,
      call: creditInstrumentCall(plantedCi, plantedCi.n, seedsN),
      klass: "inconclusive",
    };
    content[explorer.id] = {
      ...contentCi,
      call: "inconclusive",
      klass: "inconclusive",
    };
    surprise[explorer.id] = bootstrapMeanCI(sur, 2000, 0.05, 26400 + explorerIndex);
    occupancy[explorer.id] = bootstrapMeanCI(occ, 2000, 0.05, 26200 + explorerIndex);
    fraction.pattern[explorer.id] = bootstrapMeanCI(patternFrac, 2000, 0.05, 26500 + explorerIndex);
    fraction.noise[explorer.id] = bootstrapMeanCI(noiseFrac, 2000, 0.05, 26510 + explorerIndex);
    fraction.boost[explorer.id] = bootstrapMeanCI(boostFrac, 2000, 0.05, 26520 + explorerIndex);
  }

  if (instrument.random.n * 2 <= seedsN || content.random.n * 2 <= seedsN) {
    throw new Error("random kept too few doorway seeds");
  }
  if (excludesZero(instrument.random) || excludesZero(content.random)) {
    throw new Error("random doorway gap excluded 0");
  }

  const delta = instrumentDelta(instrument.rho.call, instrument.rho.lo);
  for (const explorer of EXPLORERS) {
    const row = content[explorer.id]!;
    row.klass = creditContentClass(row, row.n, seedsN, delta);
    row.call = row.klass === "attracted" ? "confirmed" : row.klass === "repelled" ? "refuted" : "inconclusive";
    instrument[explorer.id]!.klass = creditContentClass(instrument[explorer.id]!, instrument[explorer.id]!.n, seedsN, delta);
  }

  const summary = creditSummary(false, instrument.rho.call, content.rho.klass);
  const verdict = creditVerdict(summary);
  const powerHolds = instrument.rho.call === "confirmed" && instrument.rho.lo >= CREDIT_POWER_DELTA;

  const meanSteps = (arm: CreditArm) => {
    let s = 0;
    for (const seed of seeds) s += rowAt(index, "rho", arm, seed).scoreSteps;
    return s / seedsN;
  };

  const rectValues: number[] = [];
  for (const seed of seeds) {
    const pattern = rowAt(index, "rho", "pattern", seed);
    const noise = rowAt(index, "rho", "noise", seed);
    if (pattern.east.n < MIN_ROOM_STEPS || noise.east.n < MIN_ROOM_STEPS) continue;
    rectValues.push(pattern.east.rectifiedMean - noise.east.rectifiedMean);
  }
  const rectified = bootstrapMeanCI(rectValues, 2000, 0.05, 26304);

  const report: Report = {
    temperature: SHIPPED_POLICY_TEMPERATURE,
    dose: CREDIT_DOSE,
    steps,
    seeds: seedsN,
    powerDelta: CREDIT_POWER_DELTA,
    powerHolds,
    summary,
    verdict,
    delta,
    instrument,
    content,
    rectified,
    surprise,
    occupancy,
    fraction,
    meanScoreSteps: { pattern: meanSteps("pattern"), noise: meanSteps("noise"), boost: meanSteps("boost") },
    harnessOk: true,
    elapsedSec,
    workers,
  };
  writeOutputs(report);
  console.log(
    [
      `summary ${summary}`,
      `verdict ${verdict}`,
      `power ${powerHolds ? "holds" : "failed"}`,
      `delta ${delta == null ? "none" : delta.toFixed(4)}`,
      `planted rho ${fmt(instrument.rho)} n=${instrument.rho.n} ${instrument.rho.call}`,
      `pattern rho ${fmt(content.rho)} n=${content.rho.n} ${content.rho.klass}`,
      `rectified ${fmt(rectified)} n=${rectified.n}`,
      `occupancy rho ${fmt(occupancy.rho)}`,
      `score steps rho pattern ${report.meanScoreSteps.pattern.toFixed(2)} noise ${report.meanScoreSteps.noise.toFixed(2)} boost ${report.meanScoreSteps.boost.toFixed(2)}`,
    ].join("\n"),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
