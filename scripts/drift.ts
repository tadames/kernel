/**
 * Drift at the learner's adaptation timescale, against a held pattern.
 * Not part of CI.
 *
 *   npm run timescale -- --out bench/drift/timescale.json
 *   npm run drift-room
 *
 * The drifting room redraws one low-frequency pattern. The held room is
 * that pattern frozen, and it burns the same coin. Seeds 1–200, 400 steps,
 * learnability 1, relevance 0. Writes bench/drift/drift.json, drift.csv,
 * excess-vs-rate.png, and probe-vs-rate.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { closestRate, driftRatesFromTau } from "../src/lib/kernel/family.ts";
import { LOCKED_DRIFT_TAU, type DriftArm, type DriftRequest, type DriftResult } from "../src/lib/kernel/drift-run.ts";
import { driftShapeCall, driftSummary, greaterCall, type Call, type DriftShapeCall, type DriftSummary } from "../src/lib/kernel/noise.ts";
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

const DIRECTED: ExplorerId[] = ["count", "surprise", "rnd"];

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

function excessSalt(explorer: number, rate: number) {
  return 5100 + explorer * 10 + rate;
}
function slowSalt(explorer: number) {
  return 5200 + explorer;
}
function fastSalt(explorer: number) {
  return 5300 + explorer;
}
function probeSalt(explorer: number, rate: number) {
  return 5400 + explorer * 10 + rate;
}
function currentSalt(explorer: number, rate: number) {
  return 5500 + explorer * 10 + rate;
}
function worldSalt(explorer: number, rate: number) {
  return 5600 + explorer * 10 + rate;
}
function driftFracSalt(explorer: number, rate: number) {
  return 5700 + explorer * 10 + rate;
}
function heldFracSalt(explorer: number, rate: number) {
  return 5800 + explorer * 10 + rate;
}
function progressSalt(explorer: number, rate: number) {
  return 5900 + explorer * 10 + rate;
}

function fmt(ci: { mean: number; lo: number; hi: number }) {
  return `${ci.mean.toFixed(4)} [${ci.lo.toFixed(4)}, ${ci.hi.toFixed(4)}]`;
}

function keyOf(id: ExplorerId, arm: DriftArm, seed: number, rate: number) {
  return `${id}|${arm}|${seed}|${rate}`;
}

type Point = { id: ExplorerId; rate: number; mean: number; lo: number; hi: number };

function drawLines(title: string, points: Point[], rates: number[], critical: number) {
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
  const logs = rates.map((rate) => Math.log(rate));
  const logLo = Math.min(...logs);
  const logHi = Math.max(...logs);
  const xOf = (rate: number) => left + ((Math.log(rate) - logLo) / (logHi - logLo || 1)) * (right - left);
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
    const label = value.toFixed(2);
    const y = Math.round(yOf(value));
    drawText(rgba, width, 8, y - 3, label, [90, 90, 90]);
  }
  const xCrit = Math.round(xOf(critical));
  for (let y = top; y <= bottom; y += 4) {
    const i = (y * width + xCrit) * 4;
    if (i < 0 || i + 3 >= rgba.length) continue;
    rgba[i] = 170;
    rgba[i + 1] = 140;
    rgba[i + 2] = 40;
    rgba[i + 3] = 255;
  }
  drawText(rgba, width, xCrit - 10, top - 14, "tau", [140, 110, 20]);
  for (const explorer of EXPLORERS) {
    const series = rates.map((rate) => points.find((point) => point.id === explorer.id && point.rate === rate));
    const color = COLOR[explorer.id];
    for (let i = 0; i < series.length; i++) {
      const point = series[i];
      if (!point) continue;
      const x = Math.round(xOf(point.rate));
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
      const x0 = Math.round(xOf(prev.rate));
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
  rates.forEach((rate) => {
    const label = rate.toPrecision(3);
    const x = Math.round(xOf(rate)) - (label.length * 6) / 2;
    drawText(rgba, width, x, bottom + 14, label, [40, 40, 40]);
  });
  drawText(rgba, width, left, bottom + 32, "drift rate", [40, 40, 40]);
  const scaled = scaleNearest(rgba, width, height, 2);
  return writePng(scaled.width, scaled.height, scaled.rgba);
}

function ratesOf() {
  const all = driftRatesFromTau(LOCKED_DRIFT_TAU);
  const rates = all.filter((rate) => rate > 0);
  const critical = closestRate(rates, 1 / LOCKED_DRIFT_TAU);
  return { rates, critical, slow: rates[0]!, fast: rates[rates.length - 1]! };
}

function redraw() {
  const report = JSON.parse(readFileSync("bench/drift/drift.json", "utf8")) as {
    rates: number[];
    critical: number;
    excess: Record<ExplorerId, { rate: number; mean: number; lo: number; hi: number }[]>;
    probeInitial: Record<ExplorerId, { rate: number; mean: number; lo: number; hi: number }[]>;
  };
  const excess: Point[] = [];
  const probe: Point[] = [];
  for (const explorer of EXPLORERS) {
    for (const row of report.excess[explorer.id]) excess.push({ id: explorer.id, ...row });
    for (const row of report.probeInitial[explorer.id]) probe.push({ id: explorer.id, ...row });
  }
  mkdirSync("bench/drift", { recursive: true });
  writeFileSync("bench/drift/excess-vs-rate.png", drawLines("drift minus held", excess, report.rates, report.critical));
  writeFileSync("bench/drift/probe-vs-rate.png", drawLines("probe initial, drift minus held", probe, report.rates, report.critical));
}

async function main() {
  if (process.argv.includes("--figure-only")) {
    redraw();
    return;
  }
  const { rates, critical, slow, fast } = ratesOf();
  const seedsN = Math.max(1, Number(arg("seeds", "200")));
  const steps = Math.max(1, Number(arg("steps", "400")));
  const workers = workerCount(Number(arg("workers", "0")));
  const seeds = Array.from({ length: seedsN }, (_, i) => i + 1);
  const jobs: DriftRequest[] = [];
  let id = 0;
  for (const driftRate of rates) {
    for (const seed of seeds) {
      for (const arm of ["drift", "held"] as const) {
        for (const explorer of EXPLORERS) {
          jobs.push({
            id: id++,
            seed,
            signal: explorer.signal as CuriositySignal,
            steps,
            driftRate,
            arm,
          });
        }
      }
    }
  }
  console.error(
    `drift-room ${jobs.length} episodes, ${workers} workers, ${steps} steps, tau ${LOCKED_DRIFT_TAU}, critical ${critical}`,
  );
  const t0 = Date.now();
  const rows = await runPool<DriftRequest, DriftResult>(jobs, new URL("./drift-worker.ts", import.meta.url), workers);
  const elapsedSec = (Date.now() - t0) / 1000;
  console.error(`batch finished in ${elapsedSec.toFixed(1)}s`);
  if (rows.length !== jobs.length) throw new Error(`expected ${jobs.length} rows, got ${rows.length}`);

  const index = new Map<string, DriftResult>();
  for (const row of rows) {
    const key = keyOf(row.signal as ExplorerId, row.arm, row.seed, row.driftRate);
    if (index.has(key)) throw new Error(`duplicate ${key}`);
    index.set(key, row);
  }
  for (const driftRate of rates) {
    for (const seed of seeds) {
      const drift = index.get(keyOf("random", "drift", seed, driftRate));
      const held = index.get(keyOf("random", "held", seed, driftRate));
      if (!drift || !held) throw new Error(`missing random seed ${seed} rate ${driftRate}`);
      if (drift.distractorFrac !== held.distractorFrac || drift.foods !== held.foods || drift.lives !== held.lives) {
        throw new Error(`random walk diverged at seed ${seed} rate ${driftRate}`);
      }
    }
  }

  const diffAt = (explorer: ExplorerId, rate: number, pick: (row: DriftResult) => number) =>
    seeds.map((seed) => {
      const drift = index.get(keyOf(explorer, "drift", seed, rate));
      const held = index.get(keyOf(explorer, "held", seed, rate));
      if (!drift || !held) throw new Error(`missing ${explorer} seed ${seed} rate ${rate}`);
      return pick(drift) - pick(held);
    });

  const band = (
    explorerIndex: number,
    explorer: ExplorerId,
    saltFor: (explorerIndex: number, rateIndex: number) => number,
    pick: (row: DriftResult) => number,
  ) =>
    rates.map((rate, rateIndex) => {
      const values = diffAt(explorer, rate, pick);
      const ci = bootstrapMeanCI(values, 2000, 0.05, saltFor(explorerIndex, rateIndex));
      return { rate, values, ...ci, call: greaterCall(ci) as Call };
    });

  const excess: Record<ExplorerId, { rate: number; mean: number; lo: number; hi: number; n: number; call: Call }[]> = {} as never;
  const probeInitial: typeof excess = {} as never;
  const probeCurrent: typeof excess = {} as never;
  const probeWorld: typeof excess = {} as never;
  const shapes: Record<ExplorerId, DriftShapeCall> = {} as never;
  const shapeDetail: Record<
    ExplorerId,
    { peak: Interval; peakMinusSlow: Interval & { call: Call }; peakMinusFast: Interval & { call: Call }; call: DriftShapeCall }
  > = {} as never;

  for (const [explorerIndex, explorer] of EXPLORERS.entries()) {
    excess[explorer.id] = band(explorerIndex, explorer.id, excessSalt, (row) => row.distractorFrac).map(
      ({ values: _values, ...rest }) => rest,
    );
    probeInitial[explorer.id] = band(explorerIndex, explorer.id, probeSalt, (row) => row.probeInitial).map(
      ({ values: _values, ...rest }) => rest,
    );
    probeCurrent[explorer.id] = band(explorerIndex, explorer.id, currentSalt, (row) => row.probeCurrent).map(
      ({ values: _values, ...rest }) => rest,
    );
    probeWorld[explorer.id] = band(explorerIndex, explorer.id, worldSalt, (row) => row.probeWorld).map(
      ({ values: _values, ...rest }) => rest,
    );
    const peakValues = diffAt(explorer.id, critical, (row) => row.distractorFrac);
    const slowValues = diffAt(explorer.id, slow, (row) => row.distractorFrac);
    const fastValues = diffAt(explorer.id, fast, (row) => row.distractorFrac);
    const peak = bootstrapMeanCI(peakValues, 2000, 0.05, excessSalt(explorerIndex, rates.indexOf(critical)));
    const peakMinusSlow = bootstrapMeanCI(
      peakValues.map((value, i) => value - slowValues[i]!),
      2000,
      0.05,
      slowSalt(explorerIndex),
    );
    const peakMinusFast = bootstrapMeanCI(
      peakValues.map((value, i) => value - fastValues[i]!),
      2000,
      0.05,
      fastSalt(explorerIndex),
    );
    const call = driftShapeCall(peak, peakMinusSlow, peakMinusFast);
    shapes[explorer.id] = call;
    shapeDetail[explorer.id] = {
      peak,
      peakMinusSlow: { ...peakMinusSlow, call: greaterCall(peakMinusSlow) },
      peakMinusFast: { ...peakMinusFast, call: greaterCall(peakMinusFast) },
      call,
    };
    console.error(
      `${explorer.id} shape ${call} peak ${fmt(peak)} slow-gap ${fmt(peakMinusSlow)} fast-gap ${fmt(peakMinusFast)}`,
    );
  }

  const rhoProbe = probeInitial.rho.find((row) => row.rate === critical);
  if (!rhoProbe) throw new Error("missing rho probe at the critical rate");
  let randomExcludesZero = false;
  for (const row of excess.random) {
    if (row.lo > 0 || row.hi < 0) randomExcludesZero = true;
  }
  const summary: DriftSummary = driftSummary(
    randomExcludesZero,
    shapes.rho,
    rhoProbe.call,
    DIRECTED.map((id) => shapes[id]),
  );
  console.error(`summary ${summary} rhoProbe ${rhoProbe.call} ${fmt(rhoProbe)} randomExcludesZero ${randomExcludesZero}`);

  const fractions = [];
  for (const [explorerIndex, explorer] of EXPLORERS.entries()) {
    for (const [rateIndex, rate] of rates.entries()) {
      for (const arm of ["drift", "held"] as const) {
        const values = seeds.map((seed) => {
          const row = index.get(keyOf(explorer.id, arm, seed, rate));
          if (!row) throw new Error(`missing fraction ${explorer.id}`);
          return row.distractorFrac;
        });
        const salt = arm === "drift" ? driftFracSalt(explorerIndex, rateIndex) : heldFracSalt(explorerIndex, rateIndex);
        fractions.push({ id: explorer.id, arm, rate, ...bootstrapMeanCI(values, 2000, 0.05, salt) });
      }
    }
  }

  const progress = [];
  for (const [explorerIndex, explorer] of EXPLORERS.entries()) {
    for (const [rateIndex, rate] of rates.entries()) {
      const values: number[] = [];
      for (const seed of seeds) {
        const drift = index.get(keyOf(explorer.id, "drift", seed, rate));
        const held = index.get(keyOf(explorer.id, "held", seed, rate));
        if (!drift || !held) throw new Error(`missing progress ${explorer.id}`);
        if (drift.targetProgressPos == null || held.targetProgressPos == null) continue;
        values.push(drift.targetProgressPos - held.targetProgressPos);
      }
      const ci = bootstrapMeanCI(values, 2000, 0.05, progressSalt(explorerIndex, rateIndex));
      progress.push({ id: explorer.id, rate, ...ci, call: greaterCall(ci) });
    }
  }

  const excessPoints: Point[] = [];
  const probePoints: Point[] = [];
  for (const explorer of EXPLORERS) {
    for (const row of excess[explorer.id]) excessPoints.push({ id: explorer.id, rate: row.rate, mean: row.mean, lo: row.lo, hi: row.hi });
    for (const row of probeInitial[explorer.id]) {
      probePoints.push({ id: explorer.id, rate: row.rate, mean: row.mean, lo: row.lo, hi: row.hi });
    }
  }

  const report = {
    date: new Date().toISOString(),
    elapsedSec,
    steps,
    seeds: seedsN,
    learnability: 1,
    distractorRelevance: 0,
    tau: LOCKED_DRIFT_TAU,
    rates,
    critical,
    slow,
    fast,
    salts: {
      excess: "5100 + explorer*10 + rate",
      peakMinusSlow: "5200 + explorer",
      peakMinusFast: "5300 + explorer",
      probeInitial: "5400 + explorer*10 + rate",
      probeCurrent: "5500 + explorer*10 + rate",
      probeWorld: "5600 + explorer*10 + rate",
      driftFrac: "5700 + explorer*10 + rate",
      heldFrac: "5800 + explorer*10 + rate",
      progress: "5900 + explorer*10 + rate",
    },
    summary,
    randomExcludesZero,
    rhoProbeCall: rhoProbe.call,
    shapes,
    shapeDetail,
    excess,
    probeInitial,
    probeCurrent,
    probeWorld,
    fractions,
    progress,
    rows: rows.map((row) => ({
      seed: row.seed,
      signal: row.signal,
      arm: row.arm,
      rate: row.driftRate,
      frac: row.distractorFrac,
      probeInitial: row.probeInitial,
      probeCurrent: row.probeCurrent,
      probeWorld: row.probeWorld,
      foods: row.foods,
      lives: row.lives,
      progressPos: row.targetProgressPos,
    })),
  };

  mkdirSync("bench/drift", { recursive: true });
  writeFileSync("bench/drift/drift.json", `${JSON.stringify(report)}\n`);
  writeFileSync("bench/drift/excess-vs-rate.png", drawLines("drift minus held", excessPoints, rates, critical));
  writeFileSync("bench/drift/probe-vs-rate.png", drawLines("probe initial, drift minus held", probePoints, rates, critical));
  const csv = [
    "explorer,rate,excess_mean,excess_lo,excess_hi,excess_call,probe_mean,probe_lo,probe_hi,probe_call,current_mean,current_lo,current_hi,world_mean,world_lo,world_hi",
  ];
  for (const explorer of EXPLORERS) {
    for (const [rateIndex, rate] of rates.entries()) {
      const ex = excess[explorer.id][rateIndex]!;
      const pr = probeInitial[explorer.id][rateIndex]!;
      const cu = probeCurrent[explorer.id][rateIndex]!;
      const wo = probeWorld[explorer.id][rateIndex]!;
      csv.push(
        [
          explorer.id,
          rate,
          ex.mean,
          ex.lo,
          ex.hi,
          ex.call,
          pr.mean,
          pr.lo,
          pr.hi,
          pr.call,
          cu.mean,
          cu.lo,
          cu.hi,
          wo.mean,
          wo.lo,
          wo.hi,
        ].join(","),
      );
    }
  }
  writeFileSync("bench/drift/drift.csv", `${csv.join("\n")}\n`);
  console.log(
    JSON.stringify(
      {
        elapsedSec,
        summary,
        randomExcludesZero,
        shapes,
        rhoProbe: { call: rhoProbe.call, text: fmt(rhoProbe) },
        excess: Object.fromEntries(
          EXPLORERS.map((explorer) => [explorer.id, excess[explorer.id].map((row) => ({ rate: row.rate, text: fmt(row), call: row.call }))]),
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
