/**
 * Stationary-noise study. Not part of CI.
 *
 *   npm run noise
 *
 * Replication: drift 0, relevance 0, 200 seeds, five signals.
 * Window sweep: rho, six windows, seeds 1–100.
 * Variance-corrected rho and the amplitude sweep: 200 seeds.
 * Edible-distractor control: count, relevance 1 versus 0, drift 0, 200 seeds.
 *
 * Writes bench/noise/noise.json, noise.csv, excess-vs-w.png, progress-hist.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { LEARNABILITY_GRID } from "../src/lib/kernel/family.ts";
import {
  amplitudeCall,
  greaterCall,
  logExcessSlope,
  MIN_ROOM_STEPS,
  seRemovalCall,
  spuriousCall,
  type Call,
} from "../src/lib/kernel/noise.ts";
import { type NoiseRequest, type NoiseResult } from "../src/lib/kernel/noise-run.ts";
import {
  HIST_BINS,
  HIST_HI,
  HIST_LO,
  PROGRESS_WINDOWS,
  SHIPPED_PROGRESS_WINDOW,
  type ProgressMode,
} from "../src/lib/kernel/progress.ts";
import { CURIOSITY_SIGNALS, type CuriositySignal } from "../src/lib/kernel/signals.ts";
import { bootstrapMeanCI, pairedDifference } from "../src/lib/kernel/stats.ts";
import { drawText, fillRect, scaleNearest, writePng } from "./png.ts";
import { runPool, workerCount } from "./pool.ts";

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) return fallback;
  return process.argv[i + 1]!;
}

type Query = {
  signal: CuriositySignal;
  progressWindow?: number;
  progressMode?: ProgressMode;
  noiseAmplitude?: number;
  distractorRelevance?: number;
  learnability?: number;
  maxSeed?: number;
};

function tag(row: NoiseResult) {
  return `${row.signal}|${row.seed}|${row.learnability}|${row.progressWindow}|${row.progressMode}|${row.noiseAmplitude}|${row.distractorRelevance}|${row.driftRate}`;
}

function wanted(q: Query, learnability: number, seed: number) {
  return `${q.signal}|${seed}|${learnability}|${q.progressWindow ?? SHIPPED_PROGRESS_WINDOW}|${q.progressMode ?? "ema"}|${q.noiseAmplitude ?? 1}|${q.distractorRelevance ?? 0}|0`;
}

function select(rows: NoiseResult[], q: Query) {
  const window = q.progressWindow ?? SHIPPED_PROGRESS_WINDOW;
  const mode = q.progressMode ?? "ema";
  const amp = q.noiseAmplitude ?? 1;
  const rel = q.distractorRelevance ?? 0;
  return rows.filter(
    (row) =>
      row.signal === q.signal &&
      row.progressWindow === window &&
      row.progressMode === mode &&
      row.noiseAmplitude === amp &&
      row.distractorRelevance === rel &&
      row.driftRate === 0 &&
      (q.learnability == null || Math.abs(row.learnability - q.learnability) < 1e-9) &&
      (q.maxSeed == null || row.seed <= q.maxSeed),
  );
}

function bySeed(rows: NoiseResult[], pick: (row: NoiseResult) => number) {
  const seeds = [...new Set(rows.map((row) => row.seed))].sort((a, b) => a - b);
  return seeds.map((seed) => {
    const group = rows.filter((row) => row.seed === seed);
    let s = 0;
    for (const row of group) s += pick(row);
    return group.length ? s / group.length : 0;
  });
}

function fmt(ci: { mean: number; lo: number; hi: number }) {
  return `${ci.mean.toFixed(4)} [${ci.lo.toFixed(4)}, ${ci.hi.toFixed(4)}]`;
}

function excessBySeed(index: Map<string, NoiseResult>, learns: readonly number[], seeds: number[], q: Query) {
  const randomQ: Query = { ...q, signal: "random", progressWindow: SHIPPED_PROGRESS_WINDOW, progressMode: "ema" };
  return seeds.map((seed) => {
    let s = 0;
    for (const learn of learns) {
      const rho = index.get(wanted(q, learn, seed));
      const random = index.get(wanted(randomQ, learn, seed));
      if (!rho || !random) throw new Error(`missing pair ${q.signal} seed ${seed} learn ${learn} W ${q.progressWindow}`);
      s += rho.distractorFrac - random.distractorFrac;
    }
    return s / learns.length;
  });
}

type RGB = [number, number, number];

function setPx(rgba: Uint8Array, width: number, height: number, x: number, y: number, rgb: RGB) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= width || py >= height) return;
  const i = (py * width + px) * 4;
  rgba[i] = rgb[0];
  rgba[i + 1] = rgb[1];
  rgba[i + 2] = rgb[2];
  rgba[i + 3] = 255;
}

function stroke(
  rgba: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rgb: RGB,
  dash = 0,
) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) {
    if (dash > 0 && Math.floor(i / dash) % 2 === 1) continue;
    const t = i / n;
    setPx(rgba, width, height, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, rgb);
  }
}

function blank(width: number, height: number) {
  const rgba = new Uint8Array(width * height * 4);
  rgba.fill(255);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  return rgba;
}

type ExcessPoint = { window: number; mean: number; lo: number; hi: number };

function drawExcess(points: ExcessPoint[], slope: number, intercept: number, nUsed: number) {
  const width = 640;
  const height = 420;
  const rgba = blank(width, height);
  const left = 58;
  const right = width - 16;
  const top = 36;
  const bottom = height - 42;
  drawText(rgba, width, 8, 8, "excess time in noise", [30, 30, 30]);
  const positive = points.filter((p) => p.mean > 0);
  if (positive.length === 0) {
    drawText(rgba, width, left, top + 20, "no positive excess", [120, 40, 40]);
    const scaled = scaleNearest(rgba, width, height, 2);
    return writePng(scaled.width, scaled.height, scaled.rgba);
  }
  let yMin = Infinity;
  let yMax = 0;
  for (const p of positive) {
    yMin = Math.min(yMin, p.mean, p.lo > 0 ? p.lo : p.mean);
    yMax = Math.max(yMax, p.mean, p.hi > 0 ? p.hi : p.mean);
  }
  yMin = Math.max(1e-4, yMin * 0.7);
  yMax = yMax * 1.35;
  const xMin = 12.5 / 1.35;
  const xMax = 400 * 1.35;
  const xOf = (w: number) => {
    const t = (Math.log(w) - Math.log(xMin)) / (Math.log(xMax) - Math.log(xMin));
    return left + t * (right - left);
  };
  const yOf = (y: number) => {
    const t = (Math.log(y) - Math.log(yMin)) / (Math.log(yMax) - Math.log(yMin));
    return bottom - t * (bottom - top);
  };
  stroke(rgba, width, height, left, top, left, bottom, [40, 40, 40]);
  stroke(rgba, width, height, left, bottom, right, bottom, [40, 40, 40]);
  for (const w of PROGRESS_WINDOWS) {
    const x = xOf(w);
    stroke(rgba, width, height, x, bottom, x, bottom + 4, [40, 40, 40]);
    drawText(rgba, width, x - 12, bottom + 8, String(w), [40, 40, 40]);
  }
  const yTicks = [0.02, 0.05, 0.1, 0.2, 0.4].filter((y) => y > yMin && y < yMax);
  for (const y of yTicks) {
    const py = yOf(y);
    stroke(rgba, width, height, left - 4, py, right, py, [230, 230, 230]);
    drawText(rgba, width, 4, py - 3, y.toFixed(2), [40, 40, 40]);
  }
  drawText(rgba, width, left, height - 14, "window", [40, 40, 40]);
  const anchor = positive.find((p) => p.window === SHIPPED_PROGRESS_WINDOW) ?? positive[0]!;
  const refAt = (w: number) => Math.exp(Math.log(anchor.mean) - 0.5 * (Math.log(w) - Math.log(anchor.window)));
  stroke(rgba, width, height, xOf(xMin * 1.05), yOf(refAt(xMin * 1.05)), xOf(xMax / 1.05), yOf(refAt(xMax / 1.05)), [150, 150, 150], 4);
  if (nUsed >= 4) {
    const fitAt = (w: number) => Math.exp(intercept + slope * Math.log(w));
    const x0 = Math.min(...positive.map((p) => p.window));
    const x1 = Math.max(...positive.map((p) => p.window));
    stroke(rgba, width, height, xOf(x0), yOf(fitAt(x0)), xOf(x1), yOf(fitAt(x1)), [20, 20, 20]);
  }
  for (const p of points) {
    const x = xOf(p.window);
    if (!(p.mean > 0)) {
      drawText(rgba, width, x - 18, top + 4, "dropped", [140, 40, 40]);
      continue;
    }
    const y = yOf(p.mean);
    const lo = p.lo > yMin ? yOf(p.lo) : bottom;
    const hi = p.hi > yMin ? yOf(Math.min(p.hi, yMax)) : top;
    stroke(rgba, width, height, x, lo, x, hi, [186, 42, 58]);
    fillRect(rgba, width, x - 3, y - 3, 7, 7, [186, 42, 58]);
  }
  drawText(rgba, width, right - 150, 28, "ref slope -0.5", [120, 120, 120]);
  drawText(rgba, width, right - 150, 40, `fit ${slope.toFixed(2)}`, [20, 20, 20]);
  const scaled = scaleNearest(rgba, width, height, 2);
  return writePng(scaled.width, scaled.height, scaled.rgba);
}

function drawHist(
  east: number[],
  west: number[],
  eastUnder: number,
  eastOver: number,
  westUnder: number,
  westOver: number,
  eastNote: string,
  westNote: string,
) {
  const width = 680;
  const height = 340;
  const rgba = blank(width, height);
  drawText(rgba, width, 8, 6, "rho progress", [30, 30, 30]);
  const panels = [
    { bins: east, under: eastUnder, over: eastOver, title: "noise room", note: eastNote, color: [186, 42, 58] as RGB },
    { bins: west, under: westUnder, over: westOver, title: "learnable room", note: westNote, color: [36, 104, 196] as RGB },
  ];
  panels.forEach((panel, p) => {
    const left = 36 + p * 330;
    const top = 36;
    const plotW = 280;
    const plotH = 200;
    const bottom = top + plotH;
    drawText(rgba, width, left, 18, panel.title, panel.color);
    const total = panel.bins.reduce((s, n) => s + n, 0) + panel.under + panel.over;
    let max = 0.01;
    for (const n of panel.bins) max = Math.max(max, total ? n / total : 0);
    stroke(rgba, width, height, left, top, left, bottom, [40, 40, 40]);
    stroke(rgba, width, height, left, bottom, left + plotW, bottom, [40, 40, 40]);
    const zeroT = (0 - HIST_LO) / (HIST_HI - HIST_LO);
    stroke(rgba, width, height, left + zeroT * plotW, top, left + zeroT * plotW, bottom, [180, 180, 180]);
    const barW = plotW / HIST_BINS;
    panel.bins.forEach((n, i) => {
      const frac = total ? n / total : 0;
      const h = (frac / max) * (plotH - 8);
      fillRect(rgba, width, left + i * barW, bottom - h, Math.max(1, barW - 0.4), h, panel.color);
    });
    drawText(rgba, width, left, bottom + 8, "-0.15", [40, 40, 40]);
    drawText(rgba, width, left + plotW / 2 - 6, bottom + 8, "0", [40, 40, 40]);
    drawText(rgba, width, left + plotW - 24, bottom + 8, "0.15", [40, 40, 40]);
    drawText(rgba, width, left, bottom + 22, panel.note, [40, 40, 40]);
    drawText(rgba, width, left, bottom + 34, `tails ${panel.under} ${panel.over}`, [90, 90, 90]);
  });
  const scaled = scaleNearest(rgba, width, height, 2);
  return writePng(scaled.width, scaled.height, scaled.rgba);
}

function pooled(rows: NoiseResult[], side: "east" | "west") {
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  let pos = 0;
  let rect = 0;
  for (const row of rows) {
    const room = row[side];
    if (room.n <= 0) continue;
    const roomSum = room.mean * room.n;
    const roomSq = room.n > 1 ? room.variance * (room.n - 1) + (roomSum * roomSum) / room.n : roomSum * roomSum;
    n += room.n;
    sum += roomSum;
    sumSq += roomSq;
    pos += room.fracPositive * room.n;
    rect += room.rectifiedMean * room.n;
  }
  const mean = n ? sum / n : 0;
  const variance = n > 1 ? (sumSq - (sum * sum) / n) / (n - 1) : 0;
  return {
    n,
    mean,
    variance: Math.max(0, variance),
    fracPositive: n ? pos / n : 0,
    rectifiedMean: n ? rect / n : 0,
  };
}

function addBins(rows: NoiseResult[], side: "eastHist" | "westHist") {
  const bins = new Array<number>(HIST_BINS).fill(0);
  let under = 0;
  let over = 0;
  for (const row of rows) {
    const hist = row[side];
    if (!hist) continue;
    for (let i = 0; i < HIST_BINS; i++) bins[i] = (bins[i] ?? 0) + (hist.bins[i] ?? 0);
    under += hist.under;
    over += hist.over;
  }
  return { bins, under, over };
}

async function main() {
  if (process.argv.includes("--plots-only")) {
    const saved = JSON.parse(readFileSync("bench/noise/noise.json", "utf8")) as {
      figure: {
        excess: ExcessPoint[];
        slope: number;
        intercept: number;
        nUsed: number;
        eastBins: number[];
        westBins: number[];
        eastUnder: number;
        eastOver: number;
        westUnder: number;
        westOver: number;
        eastNote: string;
        westNote: string;
      };
    };
    mkdirSync("bench/noise", { recursive: true });
    const fig = saved.figure;
    writeFileSync("bench/noise/excess-vs-w.png", drawExcess(fig.excess, fig.slope, fig.intercept, fig.nUsed));
    writeFileSync(
      "bench/noise/progress-hist.png",
      drawHist(fig.eastBins, fig.westBins, fig.eastUnder, fig.eastOver, fig.westUnder, fig.westOver, fig.eastNote, fig.westNote),
    );
    console.log("rewrote noise figures");
    return;
  }

  const replicationSeeds = Math.max(1, Number(arg("seeds", "200")));
  const windowSeeds = Math.max(1, Number(arg("window-seeds", "100")));
  const steps = Math.max(1, Number(arg("steps", "400")));
  const workers = workerCount(Number(arg("workers", "0")));
  const learns = [...LEARNABILITY_GRID];
  const windows = [...PROGRESS_WINDOWS];
  const amplitudes = [0.25, 0.5, 1];
  const jobs: NoiseRequest[] = [];
  let id = 0;
  const push = (
    partial: Omit<NoiseRequest, "id" | "steps" | "driftRate" | "traceHist"> & {
      driftRate?: number;
      traceHist?: boolean;
    },
  ) => {
    jobs.push({
      id: id++,
      steps,
      driftRate: 0,
      traceHist: false,
      ...partial,
    });
  };

  for (const learnability of learns) {
    for (const signal of CURIOSITY_SIGNALS) {
      for (let seed = 1; seed <= replicationSeeds; seed++) {
        push({
          seed,
          signal,
          learnability,
          distractorRelevance: 0,
          progressWindow: SHIPPED_PROGRESS_WINDOW,
          progressMode: "ema",
          noiseAmplitude: 1,
          traceHist: signal === "rho" && learnability === 1,
        });
      }
    }
    for (const window of windows) {
      if (window === SHIPPED_PROGRESS_WINDOW) continue;
      for (let seed = 1; seed <= windowSeeds; seed++) {
        push({
          seed,
          signal: "rho",
          learnability,
          distractorRelevance: 0,
          progressWindow: window,
          progressMode: "ema",
          noiseAmplitude: 1,
        });
      }
    }
    for (let seed = 1; seed <= replicationSeeds; seed++) {
      push({
        seed,
        signal: "rho",
        learnability,
        distractorRelevance: 0,
        progressWindow: SHIPPED_PROGRESS_WINDOW,
        progressMode: "se",
        noiseAmplitude: 1,
      });
    }
    for (const noiseAmplitude of amplitudes) {
      if (noiseAmplitude === 1) continue;
      for (const signal of ["rho", "random"] as const) {
        for (let seed = 1; seed <= replicationSeeds; seed++) {
          push({
            seed,
            signal,
            learnability,
            distractorRelevance: 0,
            progressWindow: SHIPPED_PROGRESS_WINDOW,
            progressMode: "ema",
            noiseAmplitude,
          });
        }
      }
    }
    for (let seed = 1; seed <= replicationSeeds; seed++) {
      push({
        seed,
        signal: "count",
        learnability,
        distractorRelevance: 1,
        progressWindow: SHIPPED_PROGRESS_WINDOW,
        progressMode: "ema",
        noiseAmplitude: 1,
      });
    }
  }

  console.error(`noise ${jobs.length} episodes, ${workers} workers, ${steps} steps`);
  const t0 = Date.now();
  const rows = await runPool<NoiseRequest, NoiseResult>(jobs, new URL("./noise-worker.ts", import.meta.url), workers);
  const elapsedSec = (Date.now() - t0) / 1000;
  console.error(`noise finished in ${elapsedSec.toFixed(1)}s`);

  const index = new Map(rows.map((row) => [tag(row), row]));
  const slopeSeeds = Array.from({ length: Math.min(windowSeeds, replicationSeeds) }, (_, i) => i + 1);
  const repSeeds = Array.from({ length: replicationSeeds }, (_, i) => i + 1);

  let salt = 1100;
  const signalTable = CURIOSITY_SIGNALS.map((signal) => {
    const vec = bySeed(select(rows, { signal }), (row) => row.distractorFrac);
    const random = bySeed(select(rows, { signal: "random" }), (row) => row.distractorFrac);
    return {
      signal,
      distractorFrac: bootstrapMeanCI(vec, 2000, 0.05, salt++),
      minusRandom: pairedDifference(vec, random, salt++),
    };
  });
  const rhoMinusRandom = signalTable.find((row) => row.signal === "rho")!.minusRandom;
  const replicationCall = greaterCall(rhoMinusRandom);
  const perLearnability = learns.map((learnability) => {
    const rho = bySeed(select(rows, { signal: "rho", learnability }), (row) => row.distractorFrac);
    const random = bySeed(select(rows, { signal: "random", learnability }), (row) => row.distractorFrac);
    return { learnability, rhoMinusRandom: pairedDifference(rho, random, salt++) };
  });

  const excessByWindow = windows.map((window) =>
    excessBySeed(index, learns, slopeSeeds, { signal: "rho", progressWindow: window }),
  );
  const slope = logExcessSlope(windows, excessByWindow, 2000, 1907);
  const excessPoints: ExcessPoint[] = windows.map((window, i) => {
    const ci = bootstrapMeanCI(excessByWindow[i] ?? [], 2000, 0.05, 1800 + i);
    return { window, mean: ci.mean, lo: ci.lo, hi: ci.hi };
  });

  const rawExcess = excessBySeed(index, learns, repSeeds, { signal: "rho", progressWindow: SHIPPED_PROGRESS_WINDOW });
  const seExcess = excessBySeed(index, learns, repSeeds, {
    signal: "rho",
    progressWindow: SHIPPED_PROGRESS_WINDOW,
    progressMode: "se",
  });
  const zeros = new Array(repSeeds.length).fill(0);
  const seMinusRandom = pairedDifference(seExcess, zeros, 1201);
  const reduction = pairedDifference(rawExcess, seExcess, 1202);
  const seCall = seRemovalCall(rhoMinusRandom, seMinusRandom, reduction);

  const ampExcess = amplitudes.map((noiseAmplitude) =>
    excessBySeed(index, learns, repSeeds, { signal: "rho", noiseAmplitude }),
  );
  const ampIntervals = ampExcess.map((xs, i) => bootstrapMeanCI(xs, 2000, 0.05, 1310 + i));
  const highMinusLow = pairedDifference(ampExcess[2] ?? [], ampExcess[0] ?? [], 1301);
  const ampCall = amplitudeCall(
    ampIntervals[0]?.mean ?? 0,
    ampIntervals[1]?.mean ?? 0,
    ampIntervals[2]?.mean ?? 0,
    highMinusLow,
  );

  const distRows = select(rows, { signal: "rho", learnability: 1 });
  const eligible = distRows.filter((row) => row.east.n >= MIN_ROOM_STEPS && row.west.n >= MIN_ROOM_STEPS);
  eligible.sort((a, b) => a.seed - b.seed);
  const eastRect = eligible.map((row) => row.east.rectifiedMean);
  const westRect = eligible.map((row) => row.west.rectifiedMean);
  const eastMinusWest = pairedDifference(eastRect, westRect, 1501);
  const distributionCall: Call = spuriousCall(eastMinusWest, replicationSeeds, eligible.length);

  const roomStat = (side: "east" | "west", pick: (row: NoiseResult) => number, minSide: "east" | "west", seedN: number) => {
    const group = distRows.filter((row) => row[minSide].n >= MIN_ROOM_STEPS);
    group.sort((a, b) => a.seed - b.seed);
    return { ...bootstrapMeanCI(group.map(pick), 2000, 0.05, seedN), nSeeds: group.length };
  };

  const eastPooled = pooled(distRows, "east");
  const westPooled = pooled(distRows, "west");
  const eastHist = addBins(distRows, "eastHist");
  const westHist = addBins(distRows, "westHist");
  const eastNote = `mean ${eastPooled.mean.toFixed(3)} var ${eastPooled.variance.toFixed(4)} pos ${eastPooled.fracPositive.toFixed(2)}`;
  const westNote = `mean ${westPooled.mean.toFixed(3)} var ${westPooled.variance.toFixed(4)} pos ${westPooled.fracPositive.toFixed(2)}`;

  const countRel1 = bySeed(select(rows, { signal: "count", distractorRelevance: 1 }), (row) => row.distractorFrac);
  const countRel0 = bySeed(select(rows, { signal: "count", distractorRelevance: 0 }), (row) => row.distractorFrac);
  const countRelevance = pairedDifference(countRel1, countRel0, 1401);
  const a3Call = greaterCall(countRelevance);
  const a3PerLearn = learns.map((learnability, i) => {
    const on = bySeed(select(rows, { signal: "count", distractorRelevance: 1, learnability }), (row) => row.distractorFrac);
    const off = bySeed(select(rows, { signal: "count", distractorRelevance: 0, learnability }), (row) => row.distractorFrac);
    return { learnability, rel1MinusRel0: pairedDifference(on, off, 1410 + i) };
  });
  const foods = (rel: number) => bootstrapMeanCI(bySeed(select(rows, { signal: "count", distractorRelevance: rel }), (row) => row.distractorFoods), 2000, 0.05, 1420 + rel);

  const windowReward = windows.map((window) => {
    const group = select(rows, { signal: "rho", learnability: 1, progressWindow: window, maxSeed: windowSeeds });
    const entered = group.filter((row) => row.east.n >= MIN_ROOM_STEPS);
    return {
      window,
      eastRectified: bootstrapMeanCI(entered.map((row) => row.east.rectifiedMean), 2000, 0.05, 1600 + window),
      eastFracPositive: bootstrapMeanCI(entered.map((row) => row.east.fracPositive), 2000, 0.05, 1700 + window),
      nSeeds: entered.length,
    };
  });

  const figure = {
    excess: excessPoints,
    slope: slope.slope,
    intercept: slope.intercept,
    nUsed: slope.nWindows,
    eastBins: eastHist.bins,
    westBins: westHist.bins,
    eastUnder: eastHist.under,
    eastOver: eastHist.over,
    westUnder: westHist.under,
    westOver: westHist.over,
    eastNote,
    westNote,
  };

  const report = {
    date: new Date().toISOString(),
    elapsedSec,
    steps,
    replicationSeeds,
    windowSeeds,
    learnability: learns,
    windows,
    amplitudes,
    minRoomSteps: MIN_ROOM_STEPS,
    calls: {
      replication: replicationCall,
      slope: slope.call,
      se: seCall,
      amplitude: ampCall,
      distribution: distributionCall,
      a3: a3Call,
    },
    replication: {
      rhoMinusRandom,
      perLearnability,
      signals: signalTable,
    },
    slope: {
      ...slope,
      perWindow: excessPoints,
      excessByWindow,
    },
    se: {
      correctedMinusRandom: seMinusRandom,
      reduction,
      rawMinusRandom: rhoMinusRandom,
    },
    amplitude: {
      levels: amplitudes.map((amplitude, i) => ({
        amplitude,
        variance: (amplitude * amplitude) / 4,
        excess: ampIntervals[i],
      })),
      highMinusLow,
    },
    distribution: {
      eastMinusWest,
      nEligible: eligible.length,
      nSeeds: replicationSeeds,
      east: {
        mean: roomStat("east", (row) => row.east.mean, "east", 1521),
        variance: roomStat("east", (row) => row.east.variance, "east", 1522),
        fracPositive: roomStat("east", (row) => row.east.fracPositive, "east", 1523),
        rectified: roomStat("east", (row) => row.east.rectifiedMean, "east", 1524),
        policy: roomStat("east", (row) => row.east.policyMean, "east", 1525),
      },
      west: {
        mean: roomStat("west", (row) => row.west.mean, "west", 1531),
        variance: roomStat("west", (row) => row.west.variance, "west", 1532),
        fracPositive: roomStat("west", (row) => row.west.fracPositive, "west", 1533),
        rectified: roomStat("west", (row) => row.west.rectifiedMean, "west", 1534),
        policy: roomStat("west", (row) => row.west.policyMean, "west", 1535),
      },
      pooled: { east: eastPooled, west: westPooled },
      perLearnability: learns.map((learnability, i) => {
        const group = select(rows, { signal: "rho", learnability }).filter(
          (row) => row.east.n >= MIN_ROOM_STEPS && row.west.n >= MIN_ROOM_STEPS,
        );
        group.sort((a, b) => a.seed - b.seed);
        return {
          learnability,
          nEligible: group.length,
          eastMinusWestRectified: pairedDifference(
            group.map((row) => row.east.rectifiedMean),
            group.map((row) => row.west.rectifiedMean),
            1550 + i,
          ),
        };
      }),
    },
    windowReward,
    a3: {
      countRel1MinusRel0: countRelevance,
      perLearnability: a3PerLearn,
      eastFoodsRel0: foods(0),
      eastFoodsRel1: foods(1),
    },
    figure,
  };

  mkdirSync("bench/noise", { recursive: true });
  writeFileSync("bench/noise/noise.json", `${JSON.stringify(report)}\n`);
  writeFileSync("bench/noise/excess-vs-w.png", drawExcess(excessPoints, slope.slope, slope.intercept, slope.nWindows));
  writeFileSync(
    "bench/noise/progress-hist.png",
    drawHist(eastHist.bins, westHist.bins, eastHist.under, eastHist.over, westHist.under, westHist.over, eastNote, westNote),
  );

  const header = [
    "learnability",
    "signal",
    "seed",
    "window",
    "mode",
    "amplitude",
    "relevance",
    "distractor_frac",
    "foods",
    "distractor_foods",
    "lives",
    "east_n",
    "east_mean",
    "east_var",
    "east_pos",
    "east_rect",
    "west_n",
    "west_mean",
    "west_var",
    "west_pos",
    "west_rect",
  ];
  const csv = [header.join(",")];
  for (const row of rows) {
    csv.push(
      [
        row.learnability,
        row.signal,
        row.seed,
        row.progressWindow,
        row.progressMode,
        row.noiseAmplitude,
        row.distractorRelevance,
        row.distractorFrac.toFixed(6),
        row.foods,
        row.distractorFoods,
        row.lives,
        row.east.n,
        row.east.mean.toFixed(6),
        row.east.variance.toFixed(6),
        row.east.fracPositive.toFixed(6),
        row.east.rectifiedMean.toFixed(6),
        row.west.n,
        row.west.mean.toFixed(6),
        row.west.variance.toFixed(6),
        row.west.fracPositive.toFixed(6),
        row.west.rectifiedMean.toFixed(6),
      ].join(","),
    );
  }
  writeFileSync("bench/noise/noise.csv", `${csv.join("\n")}\n`);

  const brief = {
    elapsedSec: Number(elapsedSec.toFixed(1)),
    calls: report.calls,
    replication: fmt(rhoMinusRandom),
    perLearnability: perLearnability.map((row) => ({
      learnability: row.learnability,
      rhoMinusRandom: fmt(row.rhoMinusRandom),
    })),
    signals: signalTable.map((row) => ({
      signal: row.signal,
      frac: fmt(row.distractorFrac),
      minusRandom: fmt(row.minusRandom),
    })),
    slope: {
      slope: slope.slope,
      lo: slope.lo,
      hi: slope.hi,
      call: slope.call,
      used: slope.used,
      dropped: slope.dropped,
      perWindow: excessPoints.map((p) => ({ window: p.window, excess: fmt(p) })),
    },
    se: { corrected: fmt(seMinusRandom), reduction: fmt(reduction) },
    amplitude: {
      levels: report.amplitude.levels.map((row) => ({
        amplitude: row.amplitude,
        excess: row.excess ? fmt(row.excess) : "",
      })),
      highMinusLow: fmt(highMinusLow),
    },
    distribution: {
      eastMinusWest: fmt(eastMinusWest),
      nEligible: eligible.length,
      east: report.distribution.east,
      west: report.distribution.west,
    },
    a3: { count: fmt(countRelevance), perLearnability: a3PerLearn.map((row) => fmt(row.rel1MinusRel0)) },
  };
  console.log(JSON.stringify(brief, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
