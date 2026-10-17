/**
 * Rectified-progress gap at the adaptation rate, drift minus held.
 * Not part of CI.
 *
 *   npm run drift-gap
 *
 * Same matched pair as the drift sweep, seeds 1–200, 400 steps, one rate.
 * Writes bench/drift-gap/gap.json, gap.csv, gap-on-dose.png, and
 * channel-gaps.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { closestRate, driftRatesFromTau } from "../src/lib/kernel/family.ts";
import { LOCKED_DRIFT_TAU } from "../src/lib/kernel/drift-run.ts";
import { PUBLISHED_RHO_OCCUPANCY, type DriftGapRequest, type DriftGapResult } from "../src/lib/kernel/drift-gap-run.ts";
import {
  CHANNEL_DETECT_DOSE,
  dosePlacement,
  driftGapSummary,
  greaterCall,
  MIN_ROOM_STEPS,
  rhoGapBand,
  RHO_DETECT_DOSE,
  RHO_UNDETECT_DOSE,
  type DosePlacement,
  type DriftGapSummary,
  type RhoGapBand,
} from "../src/lib/kernel/noise.ts";
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

function criticalRate() {
  const rates = driftRatesFromTau(LOCKED_DRIFT_TAU).filter((rate) => rate > 0);
  return closestRate(rates, 1 / LOCKED_DRIFT_TAU);
}

function fmt(ci: { mean: number; lo: number; hi: number }) {
  return `${ci.mean.toFixed(4)} [${ci.lo.toFixed(4)}, ${ci.hi.toFixed(4)}]`;
}

function keyOf(id: ExplorerId, arm: string, seed: number) {
  return `${id}|${arm}|${seed}`;
}

type GapRow = Interval & { band?: RhoGapBand; placement: DosePlacement; sign: ReturnType<typeof greaterCall> };

function meanOrNull(sum: number, n: number) {
  return n > 0 ? sum / n : null;
}

function paired(
  index: Map<string, DriftGapResult>,
  id: ExplorerId,
  seeds: number[],
  pick: (row: DriftGapResult) => number | null,
) {
  const values: number[] = [];
  for (const seed of seeds) {
    const drift = index.get(keyOf(id, "drift", seed));
    const held = index.get(keyOf(id, "held", seed));
    if (!drift || !held) throw new Error(`missing ${id} seed ${seed}`);
    if (drift.roomSteps < MIN_ROOM_STEPS || held.roomSteps < MIN_ROOM_STEPS) continue;
    const a = pick(drift);
    const b = pick(held);
    if (a == null || b == null) continue;
    values.push(a - b);
  }
  return values;
}

function gapOf(values: number[], salt: number, placeDose: number, nSeeds: number): GapRow {
  const ci = bootstrapMeanCI(values, 2000, 0.05, salt);
  return {
    ...ci,
    placement: dosePlacement(ci, nSeeds, values.length, placeDose),
    sign: greaterCall(ci),
  };
}

type Point = { add: number; mean: number; lo: number; hi: number };

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

function vline(rgba: Uint8Array, width: number, x: number, top: number, bottom: number, rgb: RGB, step: number) {
  const px = Math.round(x);
  for (let y = top; y <= bottom; y += step) {
    const i = (y * width + px) * 4;
    if (i < 0 || i + 3 >= rgba.length) continue;
    rgba[i] = rgb[0];
    rgba[i + 1] = rgb[1];
    rgba[i + 2] = rgb[2];
    rgba[i + 3] = 255;
  }
}

function drawDose(points: Point[], gap: Interval, rate: number) {
  const width = 880;
  const height = 520;
  const rgba = blank(width, height);
  drawText(rgba, width, 8, 8, "rho occupancy excess vs dose", [30, 30, 30]);
  drawText(rgba, width, 8, 22, `drift gap at ${rate}`, [90, 60, 120]);
  const left = 78;
  const right = width - 28;
  const top = 52;
  const bottom = height - 58;
  let yMin = 0;
  let yMax = 0.05;
  for (const point of points) {
    yMin = Math.min(yMin, point.lo, point.mean);
    yMax = Math.max(yMax, point.hi, point.mean);
  }
  const pad = Math.max(0.01, (yMax - yMin) * 0.12);
  yMin -= pad;
  yMax += pad;
  const yOf = (value: number) => bottom - ((value - yMin) / (yMax - yMin)) * (bottom - top);
  const adds = points.map((point) => point.add);
  const logLo = Math.log(Math.min(...adds));
  const logHi = Math.log(Math.max(...adds));
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
  const positive = gap.lo > 0 && gap.hi > 0;
  if (positive) {
    const x0 = Math.round(xOf(Math.max(adds[0]!, gap.lo)));
    const x1 = Math.round(xOf(Math.min(adds[adds.length - 1]!, gap.hi)));
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += 2) {
      vline(rgba, width, x, top, bottom, [230, 210, 240], 2);
    }
    vline(rgba, width, xOf(Math.min(adds[adds.length - 1]!, Math.max(adds[0]!, gap.mean))), top, bottom, [140, 60, 180], 1);
    drawText(rgba, width, left, top + 4, `gap ${gap.mean.toFixed(4)}`, [140, 60, 180]);
  } else {
    drawText(rgba, width, left, top + 4, "gap is not a positive dose", [140, 60, 180]);
    drawText(rgba, width, left, top + 18, `gap ${gap.mean.toFixed(4)}`, [140, 60, 180]);
  }
  const rho: RGB = [140, 60, 180];
  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;
    const x = Math.round(xOf(point.add));
    const yLo = Math.round(yOf(point.lo));
    const yHi = Math.round(yOf(point.hi));
    for (let y = Math.min(yLo, yHi); y <= Math.max(yLo, yHi); y++) {
      const pi = (y * width + x) * 4;
      if (pi < 0 || pi + 3 >= rgba.length) continue;
      rgba[pi] = rho[0];
      rgba[pi + 1] = rho[1];
      rgba[pi + 2] = rho[2];
      rgba[pi + 3] = 255;
    }
    fillRect(rgba, width, x - 4, yHi - 1, 8, 2, rho);
    fillRect(rgba, width, x - 4, yLo - 1, 8, 2, rho);
    fillRect(rgba, width, x - 3, Math.round(yOf(point.mean)) - 3, 6, 6, rho);
    if (i === 0) continue;
    const prev = points[i - 1]!;
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
      rgba[pi] = rho[0];
      rgba[pi + 1] = rho[1];
      rgba[pi + 2] = rho[2];
      rgba[pi + 3] = 255;
    }
  }
  for (const point of points) {
    const label = point.add.toString();
    const x = Math.round(xOf(point.add)) - (label.length * 6) / 2;
    drawText(rgba, width, x, bottom + 14, label, [40, 40, 40]);
  }
  drawText(rgba, width, left, bottom + 32, "additive dose", [40, 40, 40]);
  const scaled = scaleNearest(rgba, width, height, 2);
  return writePng(scaled.width, scaled.height, scaled.rgba);
}

function drawChannels(
  rows: { id: ExplorerId; mean: number; lo: number; hi: number }[],
) {
  const width = 880;
  const height = 520;
  const rgba = blank(width, height);
  drawText(rgba, width, 8, 8, "progress-channel gap, drift minus held", [30, 30, 30]);
  const left = 120;
  const right = width - 36;
  const top = 48;
  const bottom = height - 48;
  let xMin = 0;
  let xMax = RHO_DETECT_DOSE;
  for (const row of rows) {
    xMin = Math.min(xMin, row.lo, row.mean);
    xMax = Math.max(xMax, row.hi, row.mean, RHO_DETECT_DOSE);
  }
  const pad = Math.max(0.005, (xMax - xMin) * 0.12);
  xMin -= pad;
  xMax += pad;
  const xOf = (value: number) => left + ((value - xMin) / (xMax - xMin)) * (right - left);
  vline(rgba, width, xOf(0), top, bottom, [170, 170, 170], 3);
  vline(rgba, width, xOf(RHO_UNDETECT_DOSE), top, bottom, [180, 140, 40], 4);
  vline(rgba, width, xOf(RHO_DETECT_DOSE), top, bottom, [40, 120, 70], 4);
  drawText(rgba, width, Math.round(xOf(0)) - 4, top - 16, "0", [80, 80, 80]);
  drawText(rgba, width, Math.round(xOf(RHO_UNDETECT_DOSE)) - 18, top - 16, "0.0169", [140, 100, 20]);
  drawText(rgba, width, Math.round(xOf(RHO_DETECT_DOSE)) - 12, bottom + 8, "0.05", [30, 100, 60]);
  rows.forEach((row, i) => {
    const y = top + 36 + i * 70;
    const color = COLOR[row.id];
    drawText(rgba, width, 16, y - 4, row.id, [30, 30, 30]);
    const x0 = Math.round(xOf(row.lo));
    const x1 = Math.round(xOf(row.hi));
    fillRect(rgba, width, Math.min(x0, x1), y + 8, Math.max(2, Math.abs(x1 - x0)), 4, color);
    fillRect(rgba, width, Math.round(xOf(row.mean)) - 4, y + 2, 8, 16, color);
  });
  const scaled = scaleNearest(rgba, width, height, 2);
  return writePng(scaled.width, scaled.height, scaled.rgba);
}

function loadRhoDose(): Point[] {
  const report = JSON.parse(readFileSync("bench/boost/boost.json", "utf8")) as {
    excess: { rho: Point[] };
  };
  return report.excess.rho.map((row) => ({ add: row.add, mean: row.mean, lo: row.lo, hi: row.hi }));
}

type Report = {
  rate: number;
  summary: DriftGapSummary;
  band: RhoGapBand;
  rectified: Record<ExplorerId, GapRow>;
  harnessOk: boolean;
  rhoOccupancyMean: number;
};

function redraw(report?: Report) {
  const saved = report ?? (JSON.parse(readFileSync("bench/drift-gap/gap.json", "utf8")) as Report);
  const dose = loadRhoDose();
  const rho = saved.rectified.rho;
  mkdirSync("bench/drift-gap", { recursive: true });
  writeFileSync("bench/drift-gap/gap-on-dose.png", drawDose(dose, rho, saved.rate));
  const order: ExplorerId[] = ["rho", "count", "surprise", "rnd"];
  const channels = JSON.parse(readFileSync("bench/drift-gap/gap.json", "utf8")) as {
    channel: Record<ExplorerId, GapRow>;
  };
  writeFileSync(
    "bench/drift-gap/channel-gaps.png",
    drawChannels(order.map((id) => ({ id, ...channels.channel[id] }))),
  );
}

async function main() {
  if (process.argv.includes("--figure-only")) {
    redraw();
    return;
  }
  const rate = criticalRate();
  if (rate !== 0.01877) throw new Error(`critical rate ${rate} is not the locked 0.01877 cell`);
  const seedsN = Math.max(1, Number(arg("seeds", "200")));
  const steps = Math.max(1, Number(arg("steps", "400")));
  const workers = workerCount(Number(arg("workers", "0")));
  const seeds = Array.from({ length: seedsN }, (_, i) => i + 1);
  const jobs: DriftGapRequest[] = [];
  let id = 0;
  for (const seed of seeds) {
    for (const arm of ["drift", "held"] as const) {
      for (const explorer of EXPLORERS) {
        jobs.push({
          id: id++,
          seed,
          signal: explorer.signal as CuriositySignal,
          steps,
          driftRate: rate,
          arm,
        });
      }
    }
  }
  console.error(`drift-gap ${jobs.length} episodes, ${workers} workers, ${steps} steps, rate ${rate}`);
  const t0 = Date.now();
  const rows = await runPool<DriftGapRequest, DriftGapResult>(jobs, new URL("./drift-gap-worker.ts", import.meta.url), workers);
  const elapsedSec = (Date.now() - t0) / 1000;
  console.error(`batch finished in ${elapsedSec.toFixed(1)}s`);
  if (rows.length !== jobs.length) throw new Error(`expected ${jobs.length} rows, got ${rows.length}`);

  const index = new Map<string, DriftGapResult>();
  for (const row of rows) {
    const key = keyOf(row.signal as ExplorerId, row.arm, row.seed);
    if (index.has(key)) throw new Error(`duplicate ${key}`);
    index.set(key, row);
  }
  for (const seed of seeds) {
    const drift = index.get(keyOf("random", "drift", seed));
    const held = index.get(keyOf("random", "held", seed));
    if (!drift || !held) throw new Error(`missing random seed ${seed}`);
    if (drift.distractorFrac !== held.distractorFrac || drift.foods !== held.foods || drift.lives !== held.lives) {
      throw new Error(`random walk diverged at seed ${seed}`);
    }
  }

  const occupancyValues = (id: ExplorerId) =>
    seeds.map((seed) => {
      const drift = index.get(keyOf(id, "drift", seed));
      const held = index.get(keyOf(id, "held", seed));
      if (!drift || !held) throw new Error(`missing occupancy ${id}`);
      return drift.distractorFrac - held.distractorFrac;
    });

  const rhoOccupancyMean = occupancyValues("rho").reduce((s, v) => s + v, 0) / seedsN;
  const harnessOk = Math.abs(rhoOccupancyMean - PUBLISHED_RHO_OCCUPANCY) <= 1e-12;
  if (!harnessOk) {
    console.error(
      `harness failed: rho occupancy ${rhoOccupancyMean} vs published ${PUBLISHED_RHO_OCCUPANCY}. Gap is not a call.`,
    );
  }

  const rectified = {} as Record<ExplorerId, GapRow>;
  const policy = {} as Record<ExplorerId, GapRow>;
  const channel = {} as Record<ExplorerId, GapRow>;
  const occupancy = {} as Record<ExplorerId, Interval & { sign: ReturnType<typeof greaterCall> }>;

  for (const [explorerIndex, explorer] of EXPLORERS.entries()) {
    const rectValues = paired(index, explorer.id, seeds, (row) => meanOrNull(row.rectSum, row.roomSteps));
    const policyValues = paired(index, explorer.id, seeds, (row) => meanOrNull(row.policySum, row.roomSteps));
    const channelValues = paired(index, explorer.id, seeds, (row) => meanOrNull(row.channelSum, row.roomSteps));
    rectified[explorer.id] = gapOf(rectValues, 6400 + explorerIndex, RHO_DETECT_DOSE, seedsN);
    policy[explorer.id] = gapOf(policyValues, 6500 + explorerIndex, RHO_DETECT_DOSE, seedsN);
    const detect = explorer.id === "random" ? RHO_DETECT_DOSE : CHANNEL_DETECT_DOSE[explorer.id];
    channel[explorer.id] = gapOf(channelValues, 6600 + explorerIndex, detect, seedsN);
    const occ = bootstrapMeanCI(occupancyValues(explorer.id), 2000, 0.05, 6700 + explorerIndex);
    occupancy[explorer.id] = { ...occ, sign: greaterCall(occ) };
    console.error(
      `${explorer.id} rect ${fmt(rectified[explorer.id])} n ${rectified[explorer.id].n} channel ${fmt(channel[explorer.id])} policy ${fmt(policy[explorer.id])}`,
    );
  }

  const band = rhoGapBand(rectified.rho, seedsN, rectified.rho.n);
  const summary: DriftGapSummary = harnessOk ? driftGapSummary(band) : "inconclusive";
  rectified.rho.band = band;
  const policyBand = rhoGapBand(policy.rho, seedsN, policy.rho.n);
  console.error(`summary ${summary} band ${band} policyBand ${policyBand} harness ${harnessOk}`);

  const report = {
    date: new Date().toISOString(),
    elapsedSec,
    steps,
    seeds: seedsN,
    minRoomSteps: MIN_ROOM_STEPS,
    learnability: 1,
    distractorRelevance: 0,
    tau: LOCKED_DRIFT_TAU,
    rate,
    publishedRhoOccupancy: PUBLISHED_RHO_OCCUPANCY,
    rhoOccupancyMean,
    harnessOk,
    detectDose: RHO_DETECT_DOSE,
    undetectDose: RHO_UNDETECT_DOSE,
    channelDetect: CHANNEL_DETECT_DOSE,
    salts: {
      rectified: "6400 + explorer",
      policy: "6500 + explorer",
      channel: "6600 + explorer",
      occupancy: "6700 + explorer",
    },
    summary,
    band,
    policyBand,
    rectified,
    policy,
    channel,
    occupancy,
    rows: rows.map((row) => ({
      seed: row.seed,
      signal: row.signal,
      arm: row.arm,
      frac: row.distractorFrac,
      foods: row.foods,
      lives: row.lives,
      roomSteps: row.roomSteps,
      rectMean: meanOrNull(row.rectSum, row.roomSteps),
      policyMean: meanOrNull(row.policySum, row.roomSteps),
      channelMean: meanOrNull(row.channelSum, row.roomSteps),
      progressPos: row.roomSteps ? row.progressPos / row.roomSteps : null,
    })),
  };

  mkdirSync("bench/drift-gap", { recursive: true });
  writeFileSync("bench/drift-gap/gap.json", `${JSON.stringify(report)}\n`);
  const csv = ["explorer,rect_mean,rect_lo,rect_hi,rect_n,rect_placement,channel_mean,channel_lo,channel_hi,channel_n,channel_placement,policy_mean,policy_lo,policy_hi,policy_n"];
  for (const explorer of EXPLORERS) {
    const rect = rectified[explorer.id];
    const slot = channel[explorer.id];
    const pol = policy[explorer.id];
    csv.push(
      [
        explorer.id,
        rect.mean,
        rect.lo,
        rect.hi,
        rect.n,
        rect.placement,
        slot.mean,
        slot.lo,
        slot.hi,
        slot.n,
        slot.placement,
        pol.mean,
        pol.lo,
        pol.hi,
        pol.n,
      ].join(","),
    );
  }
  writeFileSync("bench/drift-gap/gap.csv", `${csv.join("\n")}\n`);
  if (harnessOk) redraw(report);
  console.log(
    JSON.stringify(
      {
        elapsedSec,
        summary,
        band,
        policyBand,
        harnessOk,
        rhoOccupancyMean,
        rectified: Object.fromEntries(EXPLORERS.map((explorer) => [explorer.id, { text: fmt(rectified[explorer.id]), n: rectified[explorer.id].n, placement: rectified[explorer.id].placement }])),
        channel: Object.fromEntries(EXPLORERS.map((explorer) => [explorer.id, { text: fmt(channel[explorer.id]), n: channel[explorer.id].n, placement: channel[explorer.id].placement }])),
        policy: Object.fromEntries(EXPLORERS.map((explorer) => [explorer.id, { text: fmt(policy[explorer.id]), n: policy[explorer.id].n, placement: policy[explorer.id].placement }])),
      },
      null,
      2,
    ),
  );
  if (!harnessOk) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
