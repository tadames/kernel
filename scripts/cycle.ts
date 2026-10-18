/**
 * Forgetting-cycle sweep. Not part of CI.
 *
 *   npm run cycle
 *
 * The curve runs first. Occupancy and the planted period run only when
 * `curveDecision` says the learner can feed a cycle. Seeds 1–200.
 * Writes bench/cycle/cycle.json and the three figures.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { type CycleJob, type CurveResult, type EpisodeResult } from "../src/lib/kernel/cycle-run.ts";
import {
  AWAY_STEPS,
  CURVE_CONSOLIDATE_SALT,
  CURVE_FORGET_SALT,
  CURVE_INTERFERENCE_SALT,
  CURVE_LEARN_SALT,
  CYCLE_LAMBDA,
  CYCLE_TAU,
  LEARN_STEPS,
  POSITIVE_DOSES,
  PRIMARY_TEMPERATURE,
  SHIPPED_TEMPERATURE,
  callOf,
  curveDecision,
  cycleShapeCall,
  cycleSummary,
  halfRecovery,
  instrumentCall,
  smallestShapeDose,
} from "../src/lib/kernel/cycle.ts";
import { CURIOSITY_SIGNALS, type CuriositySignal } from "../src/lib/kernel/signals.ts";
import { bootstrapMeanCI, meanOf, pairedDifference, type Interval } from "../src/lib/kernel/stats.ts";
import { drawText, fillRect, writePng } from "./png.ts";
import { runPool, workerCount } from "./pool.ts";

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) return fallback;
  return process.argv[i + 1]!;
}

const SEEDS = Math.max(1, Number(arg("seeds", "200")));
const OUT = arg("out", "bench/cycle");
const EXPLORERS = CURIOSITY_SIGNALS;
type RGB = [number, number, number];
const COLOR: Record<CuriositySignal, RGB> = {
  random: [120, 120, 120],
  count: [36, 104, 196],
  surprise: [186, 42, 58],
  rnd: [40, 140, 90],
  rho: [140, 60, 180],
};

function explorerIndex(signal: CuriositySignal) {
  return EXPLORERS.indexOf(signal);
}

function fmt(ci: Interval) {
  return `${ci.mean.toFixed(4)} [${ci.lo.toFixed(4)}, ${ci.hi.toFixed(4)}]`;
}

function blank(width: number, height: number) {
  const rgba = new Uint8Array(width * height * 4);
  rgba.fill(255);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  return rgba;
}

function line(rgba: Uint8Array, width: number, x0: number, y0: number, x1: number, y1: number, rgb: RGB) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n);
    const y = Math.round(y0 + ((y1 - y0) * i) / n);
    const p = (y * width + x) * 4;
    if (p < 0 || p + 3 >= rgba.length) continue;
    rgba[p] = rgb[0];
    rgba[p + 1] = rgb[1];
    rgba[p + 2] = rgb[2];
  }
}

async function main() {
  const seeds = Array.from({ length: SEEDS }, (_, i) => i + 1);
  const workers = workerCount();
  const curveJobs: CycleJob[] = seeds.map((seed, i) => ({ kind: "curve", id: i, seed }));
  console.error(`cycle curve ${curveJobs.length} seeds, ${workers} workers, learn ${LEARN_STEPS}, away ${AWAY_STEPS}`);
  const t0 = Date.now();
  const curveRows = (await runPool(curveJobs, new URL("./cycle-worker.ts", import.meta.url), workers)) as CurveResult[];
  curveRows.sort((a, b) => a.seed - b.seed);
  console.error(`curve finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const probe0 = curveRows.map((row) => row.probe0);
  const learnEnd = curveRows.map((row) => row.learnEnd);
  const mid = curveRows.map((row) => (row.probe0 + row.learnEnd) / 2);
  const decayLearn = curveRows.map((row) => row.decayLearnEnd);
  const learns = pairedDifference(probe0, learnEnd, CURVE_LEARN_SALT);
  const consolidates = pairedDifference(mid, decayLearn, CURVE_CONSOLIDATE_SALT);
  const forgets = pairedDifference(
    curveRows.map((row) => row.decayEnd),
    curveRows.map((row) => row.heldEnd),
    CURVE_FORGET_SALT,
  );
  const interference = pairedDifference(
    curveRows.map((row) => row.interEnd),
    curveRows.map((row) => row.heldEnd),
    CURVE_INTERFERENCE_SALT,
  );
  const hs: number[] = [];
  const hBySeed: (number | null)[] = [];
  for (const row of curveRows) {
    const h = halfRecovery(row.probe0, row.learnEnd, row.held, row.decay, row.times);
    hBySeed.push(h);
    if (h != null) hs.push(h);
  }
  const meanH = hs.length ? meanOf(hs) : null;
  const hInterval = bootstrapMeanCI(hs, 2000, 0.05, 8005);
  const decided = curveDecision({
    learns: callOf(learns),
    consolidates: callOf(consolidates),
    forgets: callOf(forgets),
    nSeeds: curveRows.length,
    nUncensored: hs.length,
    meanH,
  });
  console.error(
    `decision ${decided.decision} learns ${fmt(learns)} consolidates ${fmt(consolidates)} forgets ${fmt(forgets)} interference ${fmt(interference)} H ${meanH ?? "none"} n ${hs.length}`,
  );

  const times = curveRows[0]?.times ?? [];
  const meanCurve = (key: "held" | "decay" | "interference") =>
    times.map((_, i) => meanOf(curveRows.map((row) => row[key][i]!)));

  mkdirSync(OUT, { recursive: true });
  const report: Record<string, unknown> = {
    date: new Date().toISOString(),
    tau: CYCLE_TAU,
    lambda: CYCLE_LAMBDA,
    seeds,
    learnSteps: LEARN_STEPS,
    awaySteps: AWAY_STEPS,
    learns: { ...learns, call: callOf(learns) },
    consolidates: { ...consolidates, call: callOf(consolidates) },
    forgets: { ...forgets, call: callOf(forgets) },
    interference: { ...interference, call: callOf(interference) },
    nUncensored: hs.length,
    meanH,
    hInterval,
    decision: decided.decision,
    half: decided.half,
    period: decided.period,
    steps: decided.steps,
    curves: {
      times,
      held: meanCurve("held"),
      decay: meanCurve("decay"),
      interference: meanCurve("interference"),
      learnEnd: meanOf(learnEnd),
    },
    perSeed: curveRows.map((row, i) => ({
      seed: row.seed,
      probe0: row.probe0,
      learnEnd: row.learnEnd,
      decayLearnEnd: row.decayLearnEnd,
      heldEnd: row.heldEnd,
      decayEnd: row.decayEnd,
      interEnd: row.interEnd,
      h: hBySeed[i],
      held: row.held,
      decay: row.decay,
      interference: row.interference,
    })),
  };

  drawCurve(
    times,
    meanCurve("held"),
    meanCurve("decay"),
    meanCurve("interference"),
    meanOf(learnEnd),
    decided.half,
  );

  if (decided.decision !== "run" || decided.period == null || decided.steps == null) {
    report.summary = null;
    report.occupancy = null;
    writeFileSync(`${OUT}/cycle.json`, `${JSON.stringify(report, null, 2)}\n`);
    console.error(`cycle stopped at ${decided.decision}`);
    return;
  }

  const period = decided.period;
  const steps = decided.steps;
  const jobs: CycleJob[] = [];
  let id = curveRows.length;
  const queue = (partial: Omit<Extract<CycleJob, { kind: "episode" }>, "kind" | "id">) => {
    jobs.push({ kind: "episode", id: id++, ...partial });
  };
  for (const temperature of [PRIMARY_TEMPERATURE, SHIPPED_TEMPERATURE]) {
    for (const signal of EXPLORERS) {
      for (const seed of seeds) {
        queue({
          seed,
          signal,
          steps,
          period,
          forgettingRate: CYCLE_LAMBDA,
          policyTemperature: temperature,
          add: 0,
          salt: 9101,
          arm: "forget",
        });
        queue({
          seed,
          signal,
          steps,
          period,
          forgettingRate: 0,
          policyTemperature: temperature,
          add: 0,
          salt: 9101,
          arm: "held",
        });
      }
    }
  }
  for (const signal of EXPLORERS) {
    for (const seed of seeds) {
      for (const add of [0, ...POSITIVE_DOSES]) {
        queue({
          seed,
          signal,
          steps,
          period,
          forgettingRate: 0,
          policyTemperature: PRIMARY_TEMPERATURE,
          add,
          salt: 9301,
          arm: "periodic",
        });
      }
    }
  }
  console.error(`cycle occupancy ${jobs.length} episodes, ${steps} steps, period ${period}, ${workers} workers`);
  const t1 = Date.now();
  const episodes = (await runPool(jobs, new URL("./cycle-worker.ts", import.meta.url), workers)) as EpisodeResult[];
  console.error(`occupancy finished in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  for (const row of episodes) {
    if (row.foods !== 0 || row.lives !== 0) {
      throw new Error(`cycle world recorded food or death on seed ${row.seed} ${row.signal}`);
    }
  }
  assertRandom(episodes);

  const primary = shapeTable(episodes, PRIMARY_TEMPERATURE, 8100, 8200);
  const shipped = shapeTable(episodes, SHIPPED_TEMPERATURE, 8500, 8600);
  const positive = positiveTable(episodes);
  const instrument = instrumentCall(positive.rhoShapes);
  const summary = cycleSummary({
    instrument,
    random: primary.random,
    rho: primary.rho,
    others: primary.others,
  });
  report.summary = summary;
  report.instrument = instrument;
  report.detectingDose = positive.detecting;
  report.occupancy = { primary, shipped, positive: positive.rows };
  writeFileSync(`${OUT}/cycle.json`, `${JSON.stringify(report, null, 2)}\n`);
  drawAcf(primary.rows, `${OUT}/acf-by-explorer.png`, `acf excess at P=${period} and P/2, temperature 0.15`);
  drawPositive(positive.rows, period);
  console.error(`summary ${summary} instrument ${instrument} dose ${positive.detecting ?? "none"}`);
  console.error(`total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

function assertRandom(rows: EpisodeResult[]) {
  const randomRows = rows.filter((row) => row.signal === "random");
  const groups = new Map<string, EpisodeResult[]>();
  for (const row of randomRows) {
    const key = row.arm === "periodic" ? `periodic|${row.seed}` : `pair|${row.policyTemperature}|${row.seed}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  for (const [key, list] of groups) {
    const checksum = list[0]!.checksum;
    for (const row of list) {
      if (row.checksum !== checksum || row.foods !== list[0]!.foods || row.lives !== list[0]!.lives) {
        throw new Error(`random walk diverged (${key})`);
      }
    }
  }
}

type ShapeRow = {
  signal: CuriositySignal;
  period: Interval;
  half: Interval;
  shape: ReturnType<typeof cycleShapeCall>;
  east: Interval;
};

function shapeTable(rows: EpisodeResult[], temperature: number, periodSalt: number, halfSalt: number) {
  const out: ShapeRow[] = [];
  for (const signal of EXPLORERS) {
    const forget = rows.filter((row) => row.arm === "forget" && row.policyTemperature === temperature && row.signal === signal);
    const held = rows.filter((row) => row.arm === "held" && row.policyTemperature === temperature && row.signal === signal);
    forget.sort((a, b) => a.seed - b.seed);
    held.sort((a, b) => a.seed - b.seed);
    const index = explorerIndex(signal);
    const period = pairedDifference(
      forget.map((row) => row.acfPeriod),
      held.map((row) => row.acfPeriod),
      periodSalt + index,
    );
    const half = pairedDifference(
      forget.map((row) => row.acfHalf),
      held.map((row) => row.acfHalf),
      halfSalt + index,
    );
    const east = pairedDifference(
      forget.map((row) => row.eastFrac),
      held.map((row) => row.eastFrac),
      8700 + index + (temperature === SHIPPED_TEMPERATURE ? 10 : 0),
    );
    out.push({ signal, period, half, shape: cycleShapeCall(period, half), east });
  }
  return {
    temperature,
    rows: out,
    random: out.find((row) => row.signal === "random")!.shape,
    rho: out.find((row) => row.signal === "rho")!.shape,
    others: out.filter((row) => row.signal !== "random" && row.signal !== "rho").map((row) => row.shape),
  };
}

function positiveTable(rows: EpisodeResult[]) {
  const flat = rows.filter((row) => row.arm === "periodic" && row.add === 0);
  const out: { signal: CuriositySignal; add: number; period: Interval; half: Interval; shape: ReturnType<typeof cycleShapeCall> }[] = [];
  const rhoShapes: ReturnType<typeof cycleShapeCall>[] = [];
  POSITIVE_DOSES.forEach((add, dose) => {
    for (const signal of EXPLORERS) {
      const boosted = rows
        .filter((row) => row.arm === "periodic" && row.add === add && row.signal === signal)
        .sort((a, b) => a.seed - b.seed);
      const base = flat.filter((row) => row.signal === signal).sort((a, b) => a.seed - b.seed);
      const index = explorerIndex(signal);
      const period = pairedDifference(
        boosted.map((row) => row.acfPeriod),
        base.map((row) => row.acfPeriod),
        8300 + 10 * index + dose,
      );
      const half = pairedDifference(
        boosted.map((row) => row.acfHalf),
        base.map((row) => row.acfHalf),
        8400 + 10 * index + dose,
      );
      const shape = cycleShapeCall(period, half);
      out.push({ signal, add, period, half, shape });
      if (signal === "rho") rhoShapes.push(shape);
    }
  });
  return { rows: out, rhoShapes, detecting: smallestShapeDose(POSITIVE_DOSES, rhoShapes) };
}

function drawCurve(times: number[], held: number[], decay: number[], interference: number[], floor: number, half: number | null) {
  const width = 880;
  const height = 520;
  const rgba = blank(width, height);
  drawText(rgba, width, 16, 12, "region-1 probe while away", [30, 30, 30]);
  const series: { name: string; ys: number[]; rgb: RGB }[] = [
    { name: "held", ys: held, rgb: [40, 40, 40] },
    { name: "decay", ys: decay, rgb: [140, 60, 180] },
    { name: "interfere", ys: interference, rgb: [36, 104, 196] },
  ];
  series.forEach((item, i) => {
    fillRect(rgba, width, 520 + i * 110, 12, 12, 8, item.rgb);
    drawText(rgba, width, 536 + i * 110, 12, item.name, [30, 30, 30]);
  });
  const left = 64;
  const right = width - 24;
  const top = 40;
  const bottom = height - 42;
  let yMin = floor;
  let yMax = floor;
  for (const item of series) for (const y of item.ys) {
    yMin = Math.min(yMin, y);
    yMax = Math.max(yMax, y);
  }
  const pad = Math.max(0.005, (yMax - yMin) * 0.12);
  yMin -= pad;
  yMax += pad;
  const yOf = (value: number) => bottom - ((value - yMin) / (yMax - yMin || 1)) * (bottom - top);
  const xOf = (t: number) => left + (t / (times[times.length - 1] || 1)) * (right - left);
  line(rgba, width, left, yOf(floor), right, yOf(floor), [180, 180, 180]);
  if (half != null) line(rgba, width, xOf(half), top, xOf(half), bottom, [200, 180, 220]);
  for (const item of series) {
    for (let i = 1; i < times.length; i++) {
      line(rgba, width, xOf(times[i - 1]!), yOf(item.ys[i - 1]!), xOf(times[i]!), yOf(item.ys[i]!), item.rgb);
    }
  }
  drawText(rgba, width, left, height - 28, "away steps", [30, 30, 30]);
  writeFileSync(`${OUT}/forget-curve.png`, writePng(width, height, rgba));
}

function drawAcf(rows: ShapeRow[], path: string, title: string) {
  const width = 880;
  const height = 520;
  const rgba = blank(width, height);
  drawText(rgba, width, 16, 12, title, [30, 30, 30]);
  const left = 64;
  const right = width - 24;
  const top = 48;
  const bottom = height - 48;
  let yMin = 0;
  let yMax = 0;
  for (const row of rows) {
    for (const ci of [row.period, row.half]) {
      yMin = Math.min(yMin, ci.lo, ci.mean);
      yMax = Math.max(yMax, ci.hi, ci.mean);
    }
  }
  const pad = Math.max(0.01, (yMax - yMin) * 0.15);
  yMin -= pad;
  yMax += pad;
  const yOf = (value: number) => bottom - ((value - yMin) / (yMax - yMin || 1)) * (bottom - top);
  line(rgba, width, left, yOf(0), right, yOf(0), [170, 170, 170]);
  rows.forEach((row, i) => {
    const x = left + ((i + 0.5) / rows.length) * (right - left);
    whisker(rgba, width, x - 10, row.period, yOf, COLOR[row.signal]);
    whisker(rgba, width, x + 10, row.half, yOf, [220, 160, 40]);
    drawText(rgba, width, x - 16, bottom + 8, row.signal.slice(0, 4), [30, 30, 30]);
  });
  fillRect(rgba, width, 560, 16, 12, 8, [140, 60, 180]);
  drawText(rgba, width, 576, 16, "period", [30, 30, 30]);
  fillRect(rgba, width, 680, 16, 12, 8, [220, 160, 40]);
  drawText(rgba, width, 696, 16, "half", [30, 30, 30]);
  writeFileSync(path, writePng(width, height, rgba));
}

function whisker(rgba: Uint8Array, width: number, x: number, ci: Interval, yOf: (v: number) => number, rgb: RGB) {
  const y = yOf(ci.mean);
  const lo = yOf(ci.lo);
  const hi = yOf(ci.hi);
  line(rgba, width, x, lo, x, hi, rgb);
  line(rgba, width, x - 5, lo, x + 5, lo, rgb);
  line(rgba, width, x - 5, hi, x + 5, hi, rgb);
  fillRect(rgba, width, x - 3, y - 3, 6, 6, rgb);
}

function drawPositive(
  rows: { signal: CuriositySignal; add: number; period: Interval; half: Interval }[],
  period: number,
) {
  const width = 880;
  const height = 520;
  const rgba = blank(width, height);
  drawText(rgba, width, 16, 12, `planted period ${period}, acf excess`, [30, 30, 30]);
  EXPLORERS.forEach((signal, i) => {
    fillRect(rgba, width, 280 + i * 110, 12, 12, 8, COLOR[signal]);
    drawText(rgba, width, 296 + i * 110, 12, signal.slice(0, 4), [30, 30, 30]);
  });
  const left = 64;
  const right = width - 24;
  const top = 48;
  const bottom = height - 48;
  let yMin = 0;
  let yMax = 0;
  for (const row of rows) {
    yMin = Math.min(yMin, row.period.lo, row.half.lo);
    yMax = Math.max(yMax, row.period.hi, row.half.hi);
  }
  const pad = Math.max(0.01, (yMax - yMin) * 0.15);
  yMin -= pad;
  yMax += pad;
  const yOf = (value: number) => bottom - ((value - yMin) / (yMax - yMin || 1)) * (bottom - top);
  const xOf = (add: number) => left + ((Math.log(add) - Math.log(0.05)) / (Math.log(0.15) - Math.log(0.05) || 1)) * (right - left);
  line(rgba, width, left, yOf(0), right, yOf(0), [170, 170, 170]);
  for (const signal of EXPLORERS) {
    const mine = rows.filter((row) => row.signal === signal);
    for (let i = 1; i < mine.length; i++) {
      line(rgba, width, xOf(mine[i - 1]!.add), yOf(mine[i - 1]!.period.mean), xOf(mine[i]!.add), yOf(mine[i]!.period.mean), COLOR[signal]);
    }
    for (const row of mine) {
      const x = xOf(row.add);
      line(rgba, width, x, yOf(row.period.lo), x, yOf(row.period.hi), COLOR[signal]);
      fillRect(rgba, width, x - 3, yOf(row.period.mean) - 3, 6, 6, COLOR[signal]);
    }
  }
  drawText(rgba, width, left, height - 28, "0.05", [30, 30, 30]);
  drawText(rgba, width, right - 36, height - 28, "0.15", [30, 30, 30]);
  writeFileSync(`${OUT}/positive-acf.png`, writePng(width, height, rgba));
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
