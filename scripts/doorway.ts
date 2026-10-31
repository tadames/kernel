/**
 * Doorway score at the adaptation rate and at the fast rate, drift minus held.
 * Not part of CI.
 *
 *   npm run doorway
 *
 * Temperature 0.15, seeds 1–200, 400 steps, the matched drift pair.
 * Writes bench/doorway/doorway.json, doorway.csv, and doorway-gap.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { closestRate, driftRatesFromTau } from "../src/lib/kernel/family.ts";
import { LOCKED_DRIFT_TAU } from "../src/lib/kernel/drift-run.ts";
import { type DoorwayRequest, type DoorwayResult } from "../src/lib/kernel/doorway-run.ts";
import { doorwaySummary, repulsionCall, SHARP_POLICY_TEMPERATURE, type Call, type DoorwaySummary } from "../src/lib/kernel/noise.ts";
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

const RATES = ["adaptation", "fast"] as const;
type RateId = (typeof RATES)[number];

function lockedRates() {
  const grid = driftRatesFromTau(LOCKED_DRIFT_TAU);
  const adaptation = closestRate(grid, 1 / LOCKED_DRIFT_TAU);
  const fast = grid[grid.length - 1] ?? 0;
  if (adaptation !== 0.01877) throw new Error(`adaptation rate ${adaptation} is not the locked 0.01877 cell`);
  if (fast !== 0.3003) throw new Error(`fast rate ${fast} is not the locked 0.3003 cell`);
  return { adaptation, fast } as const;
}

function fmt(ci: { mean: number; lo: number; hi: number }) {
  return `${ci.mean.toFixed(4)} [${ci.lo.toFixed(4)}, ${ci.hi.toFixed(4)}]`;
}

function keyOf(id: ExplorerId, rate: RateId, arm: string, seed: number) {
  return `${id}|${rate}|${arm}|${seed}`;
}

type GapRow = Interval & { call: Call };

function paired(
  index: Map<string, DoorwayResult>,
  id: ExplorerId,
  rate: RateId,
  seeds: number[],
  pick: (row: DoorwayResult) => number,
  requireScore: boolean,
) {
  const values: number[] = [];
  for (const seed of seeds) {
    const drift = index.get(keyOf(id, rate, "drift", seed));
    const held = index.get(keyOf(id, rate, "held", seed));
    if (!drift || !held) throw new Error(`missing ${id} ${rate} seed ${seed}`);
    if (requireScore && (drift.scoreSteps < 1 || held.scoreSteps < 1)) continue;
    values.push(pick(drift) - pick(held));
  }
  return values;
}

function gapOf(values: number[], salt: number, nSeeds: number): GapRow {
  const ci = bootstrapMeanCI(values, 2000, 0.05, salt);
  const call = ci.n * 2 > nSeeds ? repulsionCall(ci) : "inconclusive";
  return { ...ci, call };
}

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

type Bar = { rate: RateId; id: ExplorerId; mean: number; lo: number; hi: number };

function drawGaps(bars: Bar[]) {
  const width = 880;
  const height = 460;
  const rgba = blank(width, height);
  drawText(rgba, width, 8, 8, "doorway score, drift minus held", [30, 30, 30]);
  drawText(rgba, width, 8, 22, "temperature 0.15", [90, 60, 120]);
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
  RATES.forEach((rate, group) => {
    const head = top + group * 190;
    drawText(rgba, width, 16, head, rate, [30, 30, 30]);
    order.forEach((id, i) => {
      const bar = bars.find((row) => row.rate === rate && row.id === id);
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

type Report = {
  temperature: number;
  steps: number;
  seeds: number;
  tau: number;
  rates: { adaptation: number; fast: number };
  summary: DoorwaySummary;
  doorway: Record<RateId, Record<ExplorerId, GapRow>>;
  occupancy: Record<RateId, Record<ExplorerId, Interval>>;
  meanScoreSteps: Record<RateId, Record<ExplorerId, number>>;
  harnessOk: boolean;
  elapsedSec: number;
  workers: number;
};

function writeOutputs(report: Report) {
  mkdirSync("bench/doorway", { recursive: true });
  writeFileSync("bench/doorway/doorway.json", JSON.stringify(report, null, 2));
  const lines = ["rate,explorer,mean,lo,hi,n,call"];
  for (const rate of RATES) {
    for (const explorer of EXPLORERS) {
      const row = report.doorway[rate][explorer.id];
      lines.push([rate, explorer.id, row.mean, row.lo, row.hi, row.n, row.call].join(","));
    }
  }
  writeFileSync("bench/doorway/doorway.csv", `${lines.join("\n")}\n`);
  const bars: Bar[] = [];
  for (const rate of RATES) {
    for (const explorer of EXPLORERS) {
      const row = report.doorway[rate][explorer.id];
      bars.push({ rate, id: explorer.id, mean: row.mean, lo: row.lo, hi: row.hi });
    }
  }
  writeFileSync("bench/doorway/doorway-gap.png", drawGaps(bars));
}

function redraw() {
  const saved = JSON.parse(readFileSync("bench/doorway/doorway.json", "utf8")) as Report;
  writeOutputs(saved);
}

async function main() {
  if (process.argv.includes("--figure-only")) {
    redraw();
    return;
  }
  const rates = lockedRates();
  const seedsN = Math.max(1, Number(arg("seeds", "200")));
  const steps = Math.max(1, Number(arg("steps", "400")));
  if (steps % 2 !== 0) throw new Error("episode length must be even so half the ticks sample");
  const workers = workerCount(Number(arg("workers", "0")));
  const temperature = SHARP_POLICY_TEMPERATURE;
  const seeds = Array.from({ length: seedsN }, (_, i) => i + 1);
  const jobs: DoorwayRequest[] = [];
  let id = 0;
  for (const seed of seeds) {
    for (const rate of RATES) {
      for (const arm of ["drift", "held"] as const) {
        for (const explorer of EXPLORERS) {
          jobs.push({
            id: id++,
            seed,
            signal: explorer.signal as CuriositySignal,
            steps,
            driftRate: rates[rate],
            arm,
            policyTemperature: temperature,
          });
        }
      }
    }
  }
  console.error(
    `doorway ${jobs.length} episodes, ${workers} workers, ${steps} steps, temperature ${temperature}, rates ${rates.adaptation} and ${rates.fast}`,
  );
  const t0 = Date.now();
  const rows = await runPool<DoorwayRequest, DoorwayResult>(jobs, new URL("./doorway-worker.ts", import.meta.url), workers);
  const elapsedSec = (Date.now() - t0) / 1000;
  console.error(`batch finished in ${elapsedSec.toFixed(1)}s`);
  if (rows.length !== jobs.length) throw new Error(`expected ${jobs.length} rows, got ${rows.length}`);

  const index = new Map<string, DoorwayResult>();
  for (const row of rows) {
    const rate = row.driftRate === rates.adaptation ? "adaptation" : row.driftRate === rates.fast ? "fast" : "";
    if (rate !== "adaptation" && rate !== "fast") throw new Error(`unexpected rate ${row.driftRate}`);
    const key = keyOf(row.signal as ExplorerId, rate, row.arm, row.seed);
    if (index.has(key)) throw new Error(`duplicate ${key}`);
    index.set(key, row);
    if (row.samples !== steps / 2) {
      throw new Error(`${key} sampled ${row.samples}, expected ${steps / 2}`);
    }
  }
  for (const rate of RATES) {
    for (const seed of seeds) {
      const drift = index.get(keyOf("random", rate, "drift", seed));
      const held = index.get(keyOf("random", rate, "held", seed));
      if (!drift || !held) throw new Error(`missing random ${rate} seed ${seed}`);
      if (
        drift.path !== held.path ||
        drift.distractorFrac !== held.distractorFrac ||
        drift.foods !== held.foods ||
        drift.lives !== held.lives
      ) {
        throw new Error(`random walk diverged at ${rate} seed ${seed}`);
      }
    }
  }

  const doorway = {} as Report["doorway"];
  const occupancy = {} as Report["occupancy"];
  const meanScoreSteps = {} as Report["meanScoreSteps"];
  for (const rate of RATES) {
    doorway[rate] = {} as Record<ExplorerId, GapRow>;
    occupancy[rate] = {} as Record<ExplorerId, Interval>;
    meanScoreSteps[rate] = {} as Record<ExplorerId, number>;
    const rateIndex = rate === "adaptation" ? 0 : 1;
    for (const explorer of EXPLORERS) {
      const id = explorer.id;
      const explorerIndex = EXPLORERS.findIndex((row) => row.id === id);
      doorway[rate][id] = gapOf(paired(index, id, rate, seeds, (row) => row.scoreGap, true), 22000 + 10 * rateIndex + explorerIndex, seedsN);
      occupancy[rate][id] = bootstrapMeanCI(
        paired(index, id, rate, seeds, (row) => row.distractorFrac, false),
        2000,
        0.05,
        23000 + 10 * rateIndex + explorerIndex,
      );
      let stepSum = 0;
      for (const seed of seeds) {
        const drift = index.get(keyOf(id, rate, "drift", seed));
        const held = index.get(keyOf(id, rate, "held", seed));
        stepSum += (drift?.scoreSteps ?? 0) + (held?.scoreSteps ?? 0);
      }
      meanScoreSteps[rate][id] = stepSum / (seedsN * 2);
    }
  }

  const randomExcludes = RATES.some((rate) => doorway[rate].random.call !== "inconclusive");
  if (randomExcludes) throw new Error("random doorway gap excludes 0");

  const summary = doorwaySummary(doorway.adaptation.rho.call, doorway.fast.rho.call);
  const report: Report = {
    temperature,
    steps,
    seeds: seedsN,
    tau: LOCKED_DRIFT_TAU,
    rates,
    summary,
    doorway,
    occupancy,
    meanScoreSteps,
    harnessOk: true,
    elapsedSec,
    workers,
  };
  writeOutputs(report);
  console.error(`summary ${summary}`);
  for (const rate of RATES) {
    console.error(`${rate} rho doorway ${fmt(doorway[rate].rho)} ${doorway[rate].rho.call} n=${doorway[rate].rho.n}`);
    for (const explorer of EXPLORERS) {
      if (explorer.id === "rho") continue;
      const row = doorway[rate][explorer.id];
      console.error(`  ${explorer.id} ${fmt(row)} ${row.call}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
