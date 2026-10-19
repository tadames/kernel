/**
 * Phase-locked forgetting-cycle sweep. Not part of CI.
 *
 *   npm run cycle-phase
 *
 * The curve runs first. The planted square wave runs only when that curve
 * locks a period. The decay arm runs only when the planted wave passes the
 * phase-locked shape test. Seeds 1–200.
 * Writes bench/cycle-phase/cycle.json and the figures.
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
  PHASE_DOSES,
  PRIMARY_TEMPERATURE,
  SHIPPED_TEMPERATURE,
  callOf,
  curveDecision,
  cycleShapeCall,
  cycleSummary,
  halfRecovery,
  instrumentCall,
  phaseShapeCall,
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
const OUT = arg("out", "bench/cycle-phase");
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
  console.error(`phase curve ${curveJobs.length} seeds, ${workers} workers, learn ${LEARN_STEPS}, away ${AWAY_STEPS}`);
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
    doses: PHASE_DOSES,
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
    })),
  };

  drawCurve(times, meanCurve("held"), meanCurve("decay"), meanCurve("interference"), meanOf(learnEnd), decided.half);

  if (decided.decision !== "run" || decided.period == null || decided.steps == null) {
    report.summary = null;
    report.instrument = null;
    report.occupancy = null;
    writeFileSync(`${OUT}/cycle.json`, `${JSON.stringify(report, null, 2)}\n`);
    console.error(`phase stopped at ${decided.decision}`);
    return;
  }

  const period = decided.period;
  const steps = decided.steps;
  report.phaseSteps = Math.floor(steps / period) * period;
  const positiveJobs = episodeJobs(seeds, steps, period, "positive");
  console.error(`planted wave ${positiveJobs.length} episodes, ${steps} steps, period ${period}, ${workers} workers`);
  const t1 = Date.now();
  const positiveEpisodes = (await runPool(
    positiveJobs,
    new URL("./cycle-worker.ts", import.meta.url),
    workers,
  )) as EpisodeResult[];
  console.error(`planted wave finished in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  assertClean(positiveEpisodes);

  const positive = positiveTable(positiveEpisodes);
  const instrument = instrumentCall(positive.rhoShapes);
  report.instrument = instrument;
  report.detectingDose = positive.detecting;
  report.positive = positive.rows;
  drawPositive(positive.rows, period);
  console.error(`instrument ${instrument} dose ${positive.detecting ?? "none"}`);
  for (const row of positive.rows.filter((item) => item.signal === "rho")) {
    console.error(
      `rho dose ${row.add} phase ${fmt(row.phase)} half ${fmt(row.half)} shape ${row.shape} acf ${fmt(row.acfPeriod)}/${fmt(row.acfHalf)} east ${fmt(row.east)}`,
    );
  }

  if (instrument !== "confirmed") {
    report.summary = "instrument-blind";
    report.occupancy = null;
    writeFileSync(`${OUT}/cycle.json`, `${JSON.stringify(report, null, 2)}\n`);
    console.error(`summary instrument-blind. occupancy not run. total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return;
  }

  const forgetJobs = episodeJobs(seeds, steps, period, "forget");
  console.error(`forgetting occupancy ${forgetJobs.length} episodes, ${workers} workers`);
  const t2 = Date.now();
  const forgetEpisodes = (await runPool(
    forgetJobs,
    new URL("./cycle-worker.ts", import.meta.url),
    workers,
  )) as EpisodeResult[];
  console.error(`forgetting occupancy finished in ${((Date.now() - t2) / 1000).toFixed(1)}s`);
  assertClean(forgetEpisodes);

  const primary = shapeTable(forgetEpisodes, PRIMARY_TEMPERATURE, 9600, 9700, 8100, 8200);
  const shipped = shapeTable(forgetEpisodes, SHIPPED_TEMPERATURE, 9800, 9900, 8500, 8600);
  const summary = cycleSummary({
    instrument,
    random: primary.random,
    rho: primary.rho,
    others: primary.others,
  });
  report.summary = summary;
  report.occupancy = { primary, shipped };
  writeFileSync(`${OUT}/cycle.json`, `${JSON.stringify(report, null, 2)}\n`);
  drawPhase(primary.rows, `${OUT}/phase-by-explorer.png`, `phase excess at P=${period}, temperature 0.15`);
  console.error(`summary ${summary} instrument ${instrument} dose ${positive.detecting ?? "none"}`);
  for (const row of primary.rows) {
    console.error(
      `${row.signal} phase ${fmt(row.phase)} half ${fmt(row.half)} shape ${row.shape} east ${fmt(row.east)}`,
    );
  }
  console.error(`total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

function episodeJobs(seeds: number[], steps: number, period: number, which: "positive" | "forget"): CycleJob[] {
  const jobs: CycleJob[] = [];
  let id = 0;
  const queue = (partial: Omit<Extract<CycleJob, { kind: "episode" }>, "kind" | "id">) => {
    jobs.push({ kind: "episode", id: id++, ...partial });
  };
  if (which === "positive") {
    for (const signal of EXPLORERS) {
      for (const seed of seeds) {
        for (const add of [0, ...PHASE_DOSES]) {
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
    return jobs;
  }
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
  return jobs;
}

function assertClean(rows: EpisodeResult[]) {
  for (const row of rows) {
    if (row.foods !== 0 || row.lives !== 0) {
      throw new Error(`cycle world recorded food or death on seed ${row.seed} ${row.signal}`);
    }
  }
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

type PositiveRow = {
  signal: CuriositySignal;
  add: number;
  phase: Interval;
  half: Interval;
  shape: ReturnType<typeof phaseShapeCall>;
  acfPeriod: Interval;
  acfHalf: Interval;
  acfShape: ReturnType<typeof cycleShapeCall>;
  east: Interval;
};

function positiveTable(rows: EpisodeResult[]) {
  const flat = rows.filter((row) => row.arm === "periodic" && row.add === 0);
  const out: PositiveRow[] = [];
  const rhoShapes: ReturnType<typeof phaseShapeCall>[] = [];
  PHASE_DOSES.forEach((add, dose) => {
    for (const signal of EXPLORERS) {
      const boosted = rows
        .filter((row) => row.arm === "periodic" && row.add === add && row.signal === signal)
        .sort((a, b) => a.seed - b.seed);
      const base = flat.filter((row) => row.signal === signal).sort((a, b) => a.seed - b.seed);
      const index = explorerIndex(signal);
      const phase = pairedDifference(
        boosted.map((row) => row.phasePeriod),
        base.map((row) => row.phasePeriod),
        8800 + 10 * index + dose,
      );
      const half = pairedDifference(
        boosted.map((row) => row.phaseHalf),
        base.map((row) => row.phaseHalf),
        8900 + 10 * index + dose,
      );
      const acfPeriod = pairedDifference(
        boosted.map((row) => row.acfPeriod),
        base.map((row) => row.acfPeriod),
        7600 + 10 * index + dose,
      );
      const acfHalf = pairedDifference(
        boosted.map((row) => row.acfHalf),
        base.map((row) => row.acfHalf),
        7700 + 10 * index + dose,
      );
      const east = pairedDifference(
        boosted.map((row) => row.eastFrac),
        base.map((row) => row.eastFrac),
        9000 + 10 * index + dose,
      );
      const shape = phaseShapeCall(phase, half);
      out.push({
        signal,
        add,
        phase,
        half,
        shape,
        acfPeriod,
        acfHalf,
        acfShape: cycleShapeCall(acfPeriod, acfHalf),
        east,
      });
      if (signal === "rho") rhoShapes.push(shape);
    }
  });
  return { rows: out, rhoShapes, detecting: smallestShapeDose(PHASE_DOSES, rhoShapes) };
}

type ShapeRow = {
  signal: CuriositySignal;
  phase: Interval;
  half: Interval;
  shape: ReturnType<typeof phaseShapeCall>;
  acfPeriod: Interval;
  acfHalf: Interval;
  acfShape: ReturnType<typeof cycleShapeCall>;
  east: Interval;
};

function shapeTable(
  rows: EpisodeResult[],
  temperature: number,
  phaseSalt: number,
  halfSalt: number,
  acfSalt: number,
  acfHalfSalt: number,
) {
  const out: ShapeRow[] = [];
  for (const signal of EXPLORERS) {
    const forget = rows
      .filter((row) => row.arm === "forget" && row.policyTemperature === temperature && row.signal === signal)
      .sort((a, b) => a.seed - b.seed);
    const held = rows
      .filter((row) => row.arm === "held" && row.policyTemperature === temperature && row.signal === signal)
      .sort((a, b) => a.seed - b.seed);
    const index = explorerIndex(signal);
    const tempBump = temperature === SHIPPED_TEMPERATURE ? 10 : 0;
    const phase = pairedDifference(
      forget.map((row) => row.phasePeriod),
      held.map((row) => row.phasePeriod),
      phaseSalt + index,
    );
    const half = pairedDifference(
      forget.map((row) => row.phaseHalf),
      held.map((row) => row.phaseHalf),
      halfSalt + index,
    );
    const acfPeriod = pairedDifference(
      forget.map((row) => row.acfPeriod),
      held.map((row) => row.acfPeriod),
      acfSalt + index,
    );
    const acfHalf = pairedDifference(
      forget.map((row) => row.acfHalf),
      held.map((row) => row.acfHalf),
      acfHalfSalt + index,
    );
    const east = pairedDifference(
      forget.map((row) => row.eastFrac),
      held.map((row) => row.eastFrac),
      8700 + index + tempBump,
    );
    out.push({
      signal,
      phase,
      half,
      shape: phaseShapeCall(phase, half),
      acfPeriod,
      acfHalf,
      acfShape: cycleShapeCall(acfPeriod, acfHalf),
      east,
    });
  }
  return {
    temperature,
    rows: out,
    random: out.find((row) => row.signal === "random")!.shape,
    rho: out.find((row) => row.signal === "rho")!.shape,
    others: out.filter((row) => row.signal !== "random" && row.signal !== "rho").map((row) => row.shape),
  };
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
  for (const item of series) {
    for (const y of item.ys) {
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
    }
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

function whisker(rgba: Uint8Array, width: number, x: number, ci: Interval, yOf: (v: number) => number, rgb: RGB) {
  const y = yOf(ci.mean);
  const lo = yOf(ci.lo);
  const hi = yOf(ci.hi);
  line(rgba, width, x, lo, x, hi, rgb);
  line(rgba, width, x - 5, lo, x + 5, lo, rgb);
  line(rgba, width, x - 5, hi, x + 5, hi, rgb);
  fillRect(rgba, width, x - 3, y - 3, 6, 6, rgb);
}

function drawPhase(rows: ShapeRow[], path: string, title: string) {
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
    for (const ci of [row.phase, row.half]) {
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
    whisker(rgba, width, x - 10, row.phase, yOf, COLOR[row.signal]);
    whisker(rgba, width, x + 10, row.half, yOf, [220, 160, 40]);
    drawText(rgba, width, x - 16, bottom + 8, row.signal.slice(0, 4), [30, 30, 30]);
  });
  fillRect(rgba, width, 520, 16, 12, 8, [140, 60, 180]);
  drawText(rgba, width, 536, 16, "period", [30, 30, 30]);
  fillRect(rgba, width, 640, 16, 12, 8, [220, 160, 40]);
  drawText(rgba, width, 656, 16, "half", [30, 30, 30]);
  writeFileSync(path, writePng(width, height, rgba));
}

function drawPositive(rows: PositiveRow[], period: number) {
  const width = 880;
  const height = 520;
  const rgba = blank(width, height);
  drawText(rgba, width, 16, 12, `planted period ${period}, phase contrast`, [30, 30, 30]);
  EXPLORERS.forEach((signal, i) => {
    fillRect(rgba, width, 16 + i * 90, 36, 12, 8, COLOR[signal]);
    drawText(rgba, width, 32 + i * 90, 36, signal.slice(0, 4), [30, 30, 30]);
  });
  const left = 64;
  const right = width - 24;
  const top = 64;
  const bottom = height - 48;
  const doses = PHASE_DOSES;
  const logLo = Math.log(doses[0]!);
  const logHi = Math.log(doses[doses.length - 1]!);
  let yMin = 0;
  let yMax = 0;
  for (const row of rows) {
    yMin = Math.min(yMin, row.phase.lo, row.half.lo);
    yMax = Math.max(yMax, row.phase.hi, row.half.hi);
  }
  const pad = Math.max(0.01, (yMax - yMin) * 0.15);
  yMin -= pad;
  yMax += pad;
  const yOf = (value: number) => bottom - ((value - yMin) / (yMax - yMin || 1)) * (bottom - top);
  const xOf = (add: number) => left + ((Math.log(add) - logLo) / (logHi - logLo || 1)) * (right - left);
  line(rgba, width, left, yOf(0), right, yOf(0), [170, 170, 170]);
  for (const signal of EXPLORERS) {
    const mine = rows.filter((row) => row.signal === signal);
    for (let i = 1; i < mine.length; i++) {
      line(
        rgba,
        width,
        xOf(mine[i - 1]!.add),
        yOf(mine[i - 1]!.phase.mean),
        xOf(mine[i]!.add),
        yOf(mine[i]!.phase.mean),
        COLOR[signal],
      );
    }
    for (const row of mine) {
      const x = xOf(row.add);
      line(rgba, width, x, yOf(row.phase.lo), x, yOf(row.phase.hi), COLOR[signal]);
      fillRect(rgba, width, x - 3, yOf(row.phase.mean) - 3, 6, 6, COLOR[signal]);
    }
  }
  doses.forEach((dose) => {
    const label = dose >= 0.1 ? dose.toFixed(2) : dose.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
    drawText(rgba, width, xOf(dose) - 16, height - 28, label, [30, 30, 30]);
  });
  writeFileSync(`${OUT}/positive-phase.png`, writePng(width, height, rgba));
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
