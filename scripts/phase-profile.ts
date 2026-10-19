/**
 * Phase profile of forgetting. Not part of CI.
 *
 *   npm run phase-profile
 *
 * The curve runs first, at the locked rate and at half that rate. The planted
 * offsets run next. Forgetting occupancy runs when the primary curve locks a
 * period, whether or not the offsets are recovered: a missed instrument blocks
 * the location claim and does not block the sign replication. Seeds 1–200.
 * Writes bench/phase-profile/profile.json and the figures.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { type CycleJob, type CurveResult, type EpisodeResult, type ProgressResult } from "../src/lib/kernel/cycle-run.ts";
import {
  AWAY_STEPS,
  CURVE_CONSOLIDATE_SALT,
  CURVE_FORGET_SALT,
  CURVE_INTERFERENCE_SALT,
  CURVE_LEARN_SALT,
  CYCLE_LAMBDA,
  CYCLE_TAU,
  LEARN_STEPS,
  PRIMARY_TEMPERATURE,
  callOf,
  curveDecision,
  halfRecovery,
} from "../src/lib/kernel/cycle.ts";
import {
  BOUT_STEPS,
  CONTROL_DOSE,
  DROP_STEP,
  PHASE_BINS,
  PROGRESS_TIMES,
  THRESHOLD_DOSE,
  bootstrapLagDiff,
  bootstrapOnset,
  bootstrapPlantedLag,
  bootstrapSignedOnset,
  bootstrapStepDiff,
  boutCall,
  excessCall,
  heldOutProjection,
  hunchCall,
  locationCall,
  matchCall,
  meanVector,
  offsetCall,
  peakAngle,
  phaseInstrumentCall,
  plantedOffsets,
  profileSummary,
  project,
  scaleCall,
  signCall,
  slowLambda,
  type LocationCall,
  type OffsetCall,
  type SignCall,
} from "../src/lib/kernel/phase.ts";
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
const OUT = arg("out", "bench/phase-profile");
const EXPLORERS = CURIOSITY_SIGNALS;
type RGB = [number, number, number];
const COLOR: Record<CuriositySignal, RGB> = {
  random: [120, 120, 120],
  count: [36, 104, 196],
  surprise: [186, 42, 58],
  rnd: [40, 140, 90],
  rho: [140, 60, 180],
};

const SLOW_LAMBDA = slowLambda();
const CURVE_SLOW_FORGET_SALT = 8021;
const CURVE_SLOW_H_SALT = 8022;
const CURVE_SLOW_CONSOLIDATE_SALT = 8023;

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

type Diff = {
  seed: number;
  c: number;
  s: number;
  bins: number[];
  phase: number;
  half: number;
  east: number;
};

function diffVectors(on: EpisodeResult[], off: EpisodeResult[]): Diff[] {
  const a = on.slice().sort((x, y) => x.seed - y.seed);
  const b = off.slice().sort((x, y) => x.seed - y.seed);
  if (a.length !== b.length || a.length === 0) throw new Error(`unpaired episodes ${a.length} vs ${b.length}`);
  return a.map((row, i) => {
    const other = b[i]!;
    if (row.seed !== other.seed) throw new Error(`seed mismatch ${row.seed} vs ${other.seed}`);
    return {
      seed: row.seed,
      c: row.c - other.c,
      s: row.s - other.s,
      bins: row.bins.map((value, bin) => value - other.bins[bin]!),
      phase: row.phasePeriod - other.phasePeriod,
      half: row.phaseHalf - other.phaseHalf,
      east: row.eastFrac - other.eastFrac,
    };
  });
}

function curveSide(rows: CurveResult[], saltForget: number, saltH: number, saltConsolidate: number) {
  const probe0 = rows.map((row) => row.probe0);
  const learnEnd = rows.map((row) => row.learnEnd);
  const mid = rows.map((row) => (row.probe0 + row.learnEnd) / 2);
  const learns = pairedDifference(probe0, learnEnd, CURVE_LEARN_SALT);
  const consolidates = pairedDifference(mid, rows.map((row) => row.decayLearnEnd), saltConsolidate);
  const forgets = pairedDifference(
    rows.map((row) => row.decayEnd),
    rows.map((row) => row.heldEnd),
    saltForget,
  );
  const interference = pairedDifference(
    rows.map((row) => row.interEnd),
    rows.map((row) => row.heldEnd),
    CURVE_INTERFERENCE_SALT,
  );
  const hs: number[] = [];
  for (const row of rows) {
    const h = halfRecovery(row.probe0, row.learnEnd, row.held, row.decay, row.times);
    if (h != null) hs.push(h);
  }
  const meanH = hs.length ? meanOf(hs) : null;
  const decided = curveDecision({
    learns: callOf(learns),
    consolidates: callOf(consolidates),
    forgets: callOf(forgets),
    nSeeds: rows.length,
    nUncensored: hs.length,
    meanH,
  });
  return {
    learns: { ...learns, call: callOf(learns) },
    consolidates: { ...consolidates, call: callOf(consolidates) },
    forgets: { ...forgets, call: callOf(forgets) },
    interference: { ...interference, call: callOf(interference) },
    nUncensored: hs.length,
    meanH,
    hInterval: bootstrapMeanCI(hs, 2000, 0.05, saltH),
    decided,
    times: rows[0]?.times ?? [],
    held: (rows[0]?.times ?? []).map((_, i) => meanOf(rows.map((row) => row.held[i]!))),
    decay: (rows[0]?.times ?? []).map((_, i) => meanOf(rows.map((row) => row.decay[i]!))),
    interferenceCurve: (rows[0]?.times ?? []).map((_, i) => meanOf(rows.map((row) => row.interference[i]!))),
    learnEnd: meanOf(learnEnd),
  };
}

async function main() {
  const seeds = Array.from({ length: SEEDS }, (_, i) => i + 1);
  const workers = workerCount();
  mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  const curveJobs: CycleJob[] = [];
  for (const seed of seeds) curveJobs.push({ kind: "curve", id: curveJobs.length, seed, lambda: CYCLE_LAMBDA });
  for (const seed of seeds) curveJobs.push({ kind: "curve", id: curveJobs.length, seed, lambda: SLOW_LAMBDA });
  console.error(
    `curves ${curveJobs.length} seeds×rates, ${workers} workers, λ ${CYCLE_LAMBDA} and ${SLOW_LAMBDA}`,
  );
  const curveRows = (await runPool(curveJobs, new URL("./cycle-worker.ts", import.meta.url), workers)) as CurveResult[];
  const primaryRows = curveRows.filter((row) => row.lambda === CYCLE_LAMBDA).sort((a, b) => a.seed - b.seed);
  const slowRows = curveRows.filter((row) => row.lambda === SLOW_LAMBDA).sort((a, b) => a.seed - b.seed);
  for (let i = 0; i < primaryRows.length; i++) {
    const a = primaryRows[i]!;
    const b = slowRows[i]!;
    if (a.probe0 !== b.probe0 || a.learnEnd !== b.learnEnd || a.heldEnd !== b.heldEnd || a.interEnd !== b.interEnd) {
      throw new Error(`slow curve did not share seed ${a.seed}'s learned weights`);
    }
  }
  const primary = curveSide(primaryRows, CURVE_FORGET_SALT, 8005, CURVE_CONSOLIDATE_SALT);
  const slow = curveSide(slowRows, CURVE_SLOW_FORGET_SALT, CURVE_SLOW_H_SALT, CURVE_SLOW_CONSOLIDATE_SALT);
  console.error(
    `primary ${primary.decided.decision} H ${primary.meanH ?? "none"} P ${primary.decided.period ?? "none"} forgets ${fmt(primary.forgets)}`,
  );
  console.error(
    `slow ${slow.decided.decision} H ${slow.meanH ?? "none"} P ${slow.decided.period ?? "none"} forgets ${fmt(slow.forgets)}`,
  );
  drawCurve(primary, slow);

  const progressJobs: CycleJob[] = [];
  for (const seed of seeds) {
    progressJobs.push({ kind: "progress", id: progressJobs.length, seed, lambda: CYCLE_LAMBDA });
    progressJobs.push({ kind: "progress", id: progressJobs.length, seed, lambda: SLOW_LAMBDA });
  }

  const episodeJobs: CycleJob[] = [];
  const queue = (partial: Omit<Extract<CycleJob, { kind: "episode" }>, "kind" | "id">) => {
    episodeJobs.push({ kind: "episode", id: 100000 + episodeJobs.length, ...partial });
  };
  let period = 0;
  let steps = 0;
  if (primary.decided.decision === "run" && primary.decided.period != null && primary.decided.steps != null) {
    period = primary.decided.period;
    steps = primary.decided.steps;
    const offsets = plantedOffsets(period);
    for (const signal of EXPLORERS) {
      for (const seed of seeds) {
        queue({
          seed,
          signal,
          steps,
          period,
          forgettingRate: 0,
          policyTemperature: PRIMARY_TEMPERATURE,
          add: 0,
          offset: 0,
          salt: 9501,
          arm: "periodic",
          tag: "positive",
        });
      }
    }
    for (const signal of EXPLORERS) {
      const doses = signal === "rho" ? [CONTROL_DOSE, THRESHOLD_DOSE] : [CONTROL_DOSE];
      const useOffsets = signal === "rho" ? offsets : [0];
      for (const seed of seeds) {
        for (const add of doses) {
          for (const offset of useOffsets) {
            queue({
              seed,
              signal,
              steps,
              period,
              forgettingRate: 0,
              policyTemperature: PRIMARY_TEMPERATURE,
              add,
              offset,
              salt: 9501,
              arm: "periodic",
              tag: "positive",
            });
          }
        }
      }
    }
    for (const signal of EXPLORERS) {
      for (const seed of seeds) {
        queue({
          seed,
          signal,
          steps,
          period,
          forgettingRate: CYCLE_LAMBDA,
          policyTemperature: PRIMARY_TEMPERATURE,
          add: 0,
          offset: 0,
          salt: 9401,
          arm: "forget",
          tag: "primary",
        });
        queue({
          seed,
          signal,
          steps,
          period,
          forgettingRate: 0,
          policyTemperature: PRIMARY_TEMPERATURE,
          add: 0,
          offset: 0,
          salt: 9401,
          arm: "held",
          tag: "primary",
        });
      }
    }
  }

  let slowPeriod = 0;
  let slowSteps = 0;
  if (slow.decided.decision === "run" && slow.decided.period != null && slow.decided.steps != null && period > 0) {
    slowPeriod = slow.decided.period;
    slowSteps = slow.decided.steps;
    for (const signal of EXPLORERS) {
      for (const seed of seeds) {
        queue({
          seed,
          signal,
          steps: slowSteps,
          period: slowPeriod,
          forgettingRate: SLOW_LAMBDA,
          policyTemperature: PRIMARY_TEMPERATURE,
          add: 0,
          offset: 0,
          salt: 9701,
          arm: "forget",
          tag: "slow",
        });
        queue({
          seed,
          signal,
          steps: slowSteps,
          period: slowPeriod,
          forgettingRate: 0,
          policyTemperature: PRIMARY_TEMPERATURE,
          add: 0,
          offset: 0,
          salt: 9701,
          arm: "held",
          tag: "slow",
        });
      }
    }
    for (const seed of seeds) {
      for (const add of [0, CONTROL_DOSE]) {
        queue({
          seed,
          signal: "rho",
          steps: slowSteps,
          period: slowPeriod,
          forgettingRate: 0,
          policyTemperature: PRIMARY_TEMPERATURE,
          add,
          offset: 0,
          salt: 9801,
          arm: "periodic",
          tag: "slow-control",
        });
      }
    }
  }

  console.error(`progress ${progressJobs.length} and episodes ${episodeJobs.length}, ${workers} workers`);
  const t1 = Date.now();
  const mixed = (await runPool(
    [...progressJobs, ...episodeJobs],
    new URL("./cycle-worker.ts", import.meta.url),
    workers,
  )) as (ProgressResult | EpisodeResult)[];
  console.error(`pool finished in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  const progressRows = mixed.filter((row): row is ProgressResult => row.kind === "progress");
  const episodeRows = mixed.filter((row): row is EpisodeResult => row.kind === "episode");
  assertClean(episodeRows);

  const progress = {
    primary: progressTable(progressRows.filter((row) => row.lambda === CYCLE_LAMBDA), {
      sum: 8500,
      drop: 8600,
      probe: 8700,
      end: 8301,
      midStart: 8310,
      midEnd: 8340,
      peak: 8370,
    }),
    slow: progressTable(progressRows.filter((row) => row.lambda === SLOW_LAMBDA), {
      sum: 8800,
      drop: 8900,
      probe: 9000,
      end: 8401,
      midStart: 8410,
      midEnd: 8440,
      peak: 8470,
    }),
  };
  drawProgress(progress.primary, progress.slow);

  const report: Record<string, unknown> = {
    date: new Date().toISOString(),
    tau: CYCLE_TAU,
    lambda: CYCLE_LAMBDA,
    slowLambda: SLOW_LAMBDA,
    seeds,
    learnSteps: LEARN_STEPS,
    awaySteps: AWAY_STEPS,
    boutSteps: BOUT_STEPS,
    dropStep: DROP_STEP,
    progressTimes: PROGRESS_TIMES,
    controlDose: CONTROL_DOSE,
    thresholdDose: THRESHOLD_DOSE,
    bins: PHASE_BINS,
    primaryCurve: publicCurve(primary),
    slowCurve: publicCurve(slow),
    progress,
  };

  if (period === 0) {
    report.summary = "no-period";
    report.instrument = null;
    report.occupancy = null;
    writeFileSync(`${OUT}/profile.json`, `${JSON.stringify(report, null, 2)}\n`);
    console.error(`stopped at ${primary.decided.decision}. total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return;
  }

  const offsets = plantedOffsets(period);
  const positive = positiveTable(episodeRows.filter((row) => row.tag === "positive"), offsets);
  const instrument = phaseInstrumentCall(positive.gate);
  report.instrument = instrument;
  report.offsets = offsets;
  report.positive = positive.rows;
  drawPositive(positive.rows.filter((row) => row.signal === "rho"), offsets);
  console.error(`instrument ${instrument}`);
  for (const row of positive.rows.filter((item) => item.signal === "rho" && item.add === CONTROL_DOSE)) {
    console.error(`rho dose ${row.add} offset ${row.offset} ${row.offsetCall} proj ${fmt(row.projection)} lag ${fmt(row.lag)}`);
  }

  const primaryOcc = occupancyTable(episodeRows, "primary", period, 0);
  const slowOcc =
    slowPeriod > 0 ? occupancyTable(episodeRows, "slow", slowPeriod, 1) : null;
  const primaryControl = positive.rows.find(
    (row) => row.signal === "rho" && row.add === CONTROL_DOSE && row.offset === 0,
  );
  const slowControlRows = episodeRows.filter((row) => row.tag === "slow-control");
  const slowControl =
    slowControlRows.length > 0 ? controlLag(slowControlRows, slowPeriod, 10300) : null;

  const rhoPrimary = primaryOcc.rows.find((row) => row.signal === "rho")!;
  const rhoSlow = slowOcc?.rows.find((row) => row.signal === "rho") ?? null;
  const scaleAvailable =
    instrument === "confirmed" &&
    rhoSlow != null &&
    rhoPrimary.location !== "unresolved" &&
    rhoSlow.location !== "unresolved" &&
    rhoPrimary.exists &&
    rhoSlow.exists;
  const lagDiff =
    rhoSlow != null
      ? bootstrapLagDiff(rhoPrimary.vectors, rhoSlow.vectors, period, slowPeriod, 2000, 12200)
      : null;
  const scaling = scaleCall({
    available: scaleAvailable,
    phaseDiff: lagDiff?.phase ?? { lo: 0, hi: 0 },
    stepDiff: lagDiff?.steps ?? { lo: 0, hi: 0 },
  });

  const excessPrimary = excessOf(
    rhoPrimary,
    primaryControl?.vectors ?? null,
    period,
    period,
    12300,
    instrument === "confirmed" && seenOffset(primaryControl?.offsetCall),
  );
  const excessSlow =
    rhoSlow && slowControl
      ? excessOf(rhoSlow, slowControl.vectors, slowPeriod, slowPeriod, 12310, instrument === "confirmed" && seenOffset(slowControl.call))
      : { call: "uncertified" as const, diff: null };

  const hunchPeak = progress.primary.peakTime;
  const matchApplicable =
    instrument === "confirmed" &&
    progress.primary.call === "intermediate" &&
    rhoPrimary.exists &&
    rhoPrimary.location !== "unresolved" &&
    hunchPeak != null;
  const signed = bootstrapSignedOnset(rhoPrimary.vectors, period, 2000, 12400);
  const matchDiff = hunchPeak == null ? null : shift(signed, -hunchPeak);
  const matched = matchCall(matchApplicable, matchDiff);

  const others = primaryOcc.rows.filter((row) => row.signal !== "rho" && row.signal !== "random");
  const summary = profileSummary({
    periodRan: true,
    instrument,
    randomSign: primaryOcc.rows.find((row) => row.signal === "random")!.sign,
    rhoSign: rhoPrimary.sign,
    rhoHeldOut: rhoPrimary.heldOut.lo > 0,
    rhoLocation: rhoPrimary.location,
    otherExists: others.some((row) => row.exists),
  });

  report.summary = summary;
  report.scaling = { call: scaling, ...(lagDiff ?? {}) };
  report.excess = { primary: excessPrimary, slow: excessSlow };
  report.match = { call: matched, diff: matchDiff, peakTime: hunchPeak };
  report.slowControl = slowControl ? { projection: slowControl.projection, lag: slowControl.lag, call: slowControl.call } : null;
  report.occupancy = {
    primary: publicOcc(primaryOcc),
    slow: slowOcc ? publicOcc(slowOcc) : null,
  };
  writeFileSync(`${OUT}/profile.json`, `${JSON.stringify(report, null, 2)}\n`);
  drawProfile(primaryOcc.rows, period, `${OUT}/phase-profile.png`, `decay minus held, P=${period}`);
  if (slowOcc) drawProfile(slowOcc.rows, slowPeriod, `${OUT}/phase-profile-slow.png`, `slow decay minus held, P=${slowPeriod}`);
  console.error(`summary ${summary} scale ${scaling} excess ${excessPrimary.call} match ${matched}`);
  for (const row of primaryOcc.rows) {
    console.error(
      `${row.signal} sign ${row.sign} phase ${fmt(row.phase)} onset ${row.onset.mean.toFixed(2)} [${row.onset.lo.toFixed(2)}, ${row.onset.hi.toFixed(2)}] ${row.location} held ${fmt(row.heldOut)} east ${fmt(row.east)}`,
    );
  }
  if (rhoSlow) {
    console.error(
      `slow rho sign ${rhoSlow.sign} phase ${fmt(rhoSlow.phase)} onset ${rhoSlow.onset.mean.toFixed(2)} ${rhoSlow.location} held ${fmt(rhoSlow.heldOut)}`,
    );
  }
  if (lagDiff) console.error(`scale phase ${fmt(lagDiff.phase)} steps ${fmt(lagDiff.steps)}`);
  console.error(`hunch ${progress.primary.call} bout ${progress.primary.bout} slow-hunch ${progress.slow.call}`);
  console.error(`total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

function shift(ci: Interval, by: number): Interval {
  return { mean: ci.mean + by, lo: ci.lo + by, hi: ci.hi + by, n: ci.n };
}

function publicCurve(side: ReturnType<typeof curveSide>) {
  return {
    learns: side.learns,
    consolidates: side.consolidates,
    forgets: side.forgets,
    interference: side.interference,
    nUncensored: side.nUncensored,
    meanH: side.meanH,
    hInterval: side.hInterval,
    decision: side.decided.decision,
    half: side.decided.half,
    period: side.decided.period,
    steps: side.decided.steps,
    curves: {
      times: side.times,
      held: side.held,
      decay: side.decay,
      interference: side.interferenceCurve,
      learnEnd: side.learnEnd,
    },
  };
}

type ProgressSide = ReturnType<typeof progressTable>;

function progressTable(rows: ProgressResult[], salts: {
  sum: number;
  drop: number;
  probe: number;
  end: number;
  midStart: number;
  midEnd: number;
  peak: number;
}): {
  call: ReturnType<typeof hunchCall>;
  bout: ReturnType<typeof boutCall>;
  peakTime: number | null;
  times: number[];
  positiveSum: Interval[];
  drop20: Interval[];
  probe: Interval[];
  peakAtEnd: Interval | null;
  nPositiveEnd: number;
} {
  const ordered = rows.slice().sort((a, b) => a.seed - b.seed);
  const times = [...PROGRESS_TIMES];
  const positiveSum = times.map((_, index) =>
    bootstrapMeanCI(
      ordered.map((row) => row.positiveSum[index]!),
      2000,
      0.05,
      salts.sum + index,
    ),
  );
  const drop20 = times.map((_, index) =>
    bootstrapMeanCI(
      ordered.map((row) => row.drop20[index]!),
      2000,
      0.05,
      salts.drop + index,
    ),
  );
  const probe = times.map((_, index) =>
    bootstrapMeanCI(
      ordered.map((row) => row.probe[index]!),
      2000,
      0.05,
      salts.probe + index,
    ),
  );
  const first = ordered.map((row) => row.positiveSum[0]!);
  const last = ordered.map((row) => row.positiveSum[times.length - 1]!);
  const midVsStart: Interval[] = [];
  const midVsEnd: Interval[] = [];
  for (let i = 1; i < times.length - 1; i++) {
    const mid = ordered.map((row) => row.positiveSum[i]!);
    midVsStart.push(pairedDifference(mid, first, salts.midStart + (i - 1)));
    midVsEnd.push(pairedDifference(mid, last, salts.midEnd + (i - 1)));
  }
  const call = hunchCall({
    endVsStart: pairedDifference(last, first, salts.end),
    midVsStart,
    midVsEnd,
  });
  const endAt = ordered.map((row) => row.peakAt[times.length - 1]!).filter((value): value is number => value != null);
  const peakAtEnd = endAt.length ? bootstrapMeanCI(endAt, 2000, 0.05, salts.peak) : null;
  const bout = boutCall(ordered.length, endAt.length, peakAtEnd);
  let peakTime: number | null = null;
  let best = -Infinity;
  positiveSum.forEach((ci, index) => {
    if (ci.mean > best) {
      best = ci.mean;
      peakTime = times[index]!;
    }
  });
  return { call, bout, peakTime, times, positiveSum, drop20, probe, peakAtEnd, nPositiveEnd: endAt.length };
}

type ControlRow = {
  signal: CuriositySignal;
  add: number;
  offset: number;
  projection: Interval;
  lag: Interval;
  offsetCall: OffsetCall;
  vectors: Diff[];
};

function positiveTable(rows: EpisodeResult[], offsets: number[]) {
  const flat = rows.filter((row) => row.add === 0);
  const doses = [CONTROL_DOSE, THRESHOLD_DOSE];
  const out: ControlRow[] = [];
  const gate: OffsetCall[] = [];
  for (const signal of EXPLORERS) {
    const base = flat.filter((row) => row.signal === signal);
    const doseList = signal === "rho" ? doses : [CONTROL_DOSE];
    const offsetList = signal === "rho" ? offsets : [0];
    for (const add of doseList) {
      const doseIndex = add === CONTROL_DOSE ? 0 : 1;
      for (const offset of offsetList) {
        const boosted = rows.filter((row) => row.signal === signal && row.add === add && row.offset === offset);
        const vectors = diffVectors(boosted, base);
        const index = explorerIndex(signal);
        const offsetIndex = offsets.indexOf(offset);
        const salt = 10 * index + offsetIndex + 40 * doseIndex;
        const phi = peakAngle(offset, boosted[0]!.period);
        const projected = vectors.map((row) => project(row.c, row.s, phi));
        const proj = pairedDifference(projected, projected.map(() => 0), 10000 + salt);
        const lag = bootstrapPlantedLag(vectors, boosted[0]!.period, offset, 2000, 10100 + salt);
        const quarter = Math.floor(boosted[0]!.period / 4);
        const call = offsetCall(proj, lag, quarter);
        out.push({ signal, add, offset, projection: proj, lag, offsetCall: call, vectors });
        if (signal === "rho" && add === CONTROL_DOSE) gate.push(call);
      }
    }
  }
  return { rows: out, gate };
}

function controlLag(rows: EpisodeResult[], period: number, salt: number) {
  const flat = rows.filter((row) => row.add === 0);
  const boosted = rows.filter((row) => row.add === CONTROL_DOSE);
  const vectors = diffVectors(boosted, flat);
  const phi = peakAngle(0, period);
  const projection = pairedDifference(
    vectors.map((row) => project(row.c, row.s, phi)),
    vectors.map(() => 0),
    salt,
  );
  const lag = bootstrapPlantedLag(vectors, period, 0, 2000, salt + 1);
  const call = offsetCall(projection, lag, Math.floor(period / 4));
  return { projection, lag, call, vectors };
}

type OccRow = {
  signal: CuriositySignal;
  phase: Interval;
  half: Interval;
  east: Interval;
  sign: SignCall;
  onset: ReturnType<typeof bootstrapOnset>;
  location: LocationCall;
  heldOut: Interval & { phi: number };
  exists: boolean;
  bins: Interval[];
  amplitude: number;
  vectors: Diff[];
};

function occupancyTable(rows: EpisodeResult[], tag: string, period: number, rateIndex: number): { rows: OccRow[] } {
  const out: OccRow[] = [];
  for (const signal of EXPLORERS) {
    const forget = rows.filter((row) => row.tag === tag && row.arm === "forget" && row.signal === signal);
    const held = rows.filter((row) => row.tag === tag && row.arm === "held" && row.signal === signal);
    const vectors = diffVectors(forget, held);
    const index = explorerIndex(signal);
    const phase = pairedDifference(
      vectors.map((row) => row.phase),
      vectors.map(() => 0),
      11000 + 100 * rateIndex + index,
    );
    const half = pairedDifference(
      vectors.map((row) => row.half),
      vectors.map(() => 0),
      11200 + 100 * rateIndex + index,
    );
    const east = pairedDifference(
      vectors.map((row) => row.east),
      vectors.map(() => 0),
      11800 + 100 * rateIndex + index,
    );
    const bins = vectors[0]!.bins.map((_, bin) =>
      pairedDifference(
        vectors.map((row) => row.bins[bin]!),
        vectors.map(() => 0),
        11600 + 100 * rateIndex + 10 * index + bin,
      ),
    );
    const onset = bootstrapOnset(vectors, period, 2000, 11400 + 100 * rateIndex + index);
    const mean = meanVector(vectors);
    const amplitude = Math.hypot(mean.c, mean.s);
    const location = locationCall(onset.mean, onset.lo, onset.hi, period, amplitude);
    const heldOut = heldOutProjection(
      vectors.filter((row) => row.seed <= 100),
      vectors.filter((row) => row.seed >= 101),
      12000 + 100 * rateIndex + index,
    );
    const sign = signCall(phase);
    out.push({
      signal,
      phase,
      half,
      east,
      sign,
      onset,
      location,
      heldOut,
      exists: sign === "negative" || heldOut.lo > 0,
      bins,
      amplitude,
      vectors,
    });
  }
  return { rows: out };
}

function seenOffset(call: OffsetCall | undefined) {
  return call === "tracked" || call === "delayed" || call === "early";
}

function excessOf(
  occ: OccRow,
  control: Diff[] | null,
  periodOcc: number,
  periodControl: number,
  salt: number,
  controlSeen: boolean,
) {
  if (!control || control.length === 0) return { call: "uncertified" as const, diff: null };
  const diff = bootstrapStepDiff(occ.vectors, control, periodOcc, periodControl, 2000, salt);
  const certified = controlSeen && occ.exists && occ.location !== "unresolved";
  return { call: excessCall(certified, diff), diff };
}

function publicOcc(table: { rows: OccRow[] }) {
  return {
    rows: table.rows.map((row) => ({
      signal: row.signal,
      phase: row.phase,
      half: row.half,
      east: row.east,
      sign: row.sign,
      onset: row.onset,
      location: row.location,
      heldOut: row.heldOut,
      exists: row.exists,
      bins: row.bins,
      amplitude: row.amplitude,
    })),
  };
}

function assertClean(rows: EpisodeResult[]) {
  for (const row of rows) {
    if (row.foods !== 0 || row.lives !== 0) {
      throw new Error(`cycle world recorded food or death on seed ${row.seed} ${row.signal} ${row.tag}`);
    }
  }
  const groups = new Map<string, EpisodeResult[]>();
  for (const row of rows) {
    if (row.signal !== "random") continue;
    const key = `${row.tag}|${row.steps}|${row.period}|${row.seed}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  for (const [key, list] of groups) {
    const checksum = list[0]!.checksum;
    for (const row of list) {
      if (row.checksum !== checksum) throw new Error(`random walk diverged (${key})`);
    }
  }
}

function whisker(rgba: Uint8Array, width: number, x: number, lo: number, hi: number, yOf: (v: number) => number, rgb: RGB) {
  line(rgba, width, x, yOf(lo), x, yOf(hi), rgb);
  line(rgba, width, x - 4, yOf(lo), x + 4, yOf(lo), rgb);
  line(rgba, width, x - 4, yOf(hi), x + 4, yOf(hi), rgb);
}

function drawCurve(primary: ReturnType<typeof curveSide>, slow: ReturnType<typeof curveSide>) {
  const width = 880;
  const height = 520;
  const rgba = blank(width, height);
  drawText(rgba, width, 16, 12, "region-1 probe while away", [30, 30, 30]);
  const series = [
    { name: "held", ys: primary.held, rgb: [40, 40, 40] as RGB },
    { name: "decay", ys: primary.decay, rgb: [140, 60, 180] as RGB },
    { name: "slow", ys: slow.decay, rgb: [36, 104, 196] as RGB },
  ];
  series.forEach((item, i) => {
    fillRect(rgba, width, 520 + i * 90, 12, 12, 8, item.rgb);
    drawText(rgba, width, 536 + i * 90, 12, item.name, [30, 30, 30]);
  });
  const left = 64;
  const right = width - 24;
  const top = 40;
  const bottom = height - 42;
  let yMin = primary.learnEnd;
  let yMax = primary.learnEnd;
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
  const times = primary.times;
  const xOf = (t: number) => left + (t / (times[times.length - 1] || 1)) * (right - left);
  for (const item of series) {
    for (let i = 1; i < times.length; i++) {
      line(rgba, width, xOf(times[i - 1]!), yOf(item.ys[i - 1]!), xOf(times[i]!), yOf(item.ys[i]!), item.rgb);
    }
  }
  drawText(rgba, width, left, height - 28, "away steps", [30, 30, 30]);
  writeFileSync(`${OUT}/forget-curve.png`, writePng(width, height, rgba));
}

function drawPositive(rows: ControlRow[], offsets: number[]) {
  const width = 880;
  const height = 520;
  const rgba = blank(width, height);
  drawText(rgba, width, 16, 12, "recovered onset minus planted offset", [30, 30, 30]);
  const doses = [CONTROL_DOSE, THRESHOLD_DOSE];
  const doseColor: RGB[] = [
    [140, 60, 180],
    [36, 104, 196],
  ];
  doses.forEach((dose, i) => {
    fillRect(rgba, width, 16 + i * 120, 36, 12, 8, doseColor[i]!);
    drawText(rgba, width, 32 + i * 120, 36, dose.toFixed(4), [30, 30, 30]);
  });
  const left = 72;
  const right = width - 24;
  const top = 64;
  const bottom = height - 48;
  let yMin = 0;
  let yMax = 0;
  for (const row of rows) {
    yMin = Math.min(yMin, row.lag.lo, row.lag.mean);
    yMax = Math.max(yMax, row.lag.hi, row.lag.mean);
  }
  const pad = Math.max(2, (yMax - yMin) * 0.15);
  yMin -= pad;
  yMax += pad;
  const yOf = (value: number) => bottom - ((value - yMin) / (yMax - yMin || 1)) * (bottom - top);
  const xOf = (offset: number) => left + (offsets.indexOf(offset) + 0.5) * ((right - left) / offsets.length);
  line(rgba, width, left, yOf(0), right, yOf(0), [170, 170, 170]);
  for (const [dose, rgb] of doses.map((dose, i) => [dose, doseColor[i]!] as const)) {
    const mine = rows.filter((row) => row.add === dose);
    for (let i = 1; i < mine.length; i++) {
      line(rgba, width, xOf(mine[i - 1]!.offset), yOf(mine[i - 1]!.lag.mean), xOf(mine[i]!.offset), yOf(mine[i]!.lag.mean), rgb);
    }
    for (const row of mine) {
      const x = xOf(row.offset) + (dose === CONTROL_DOSE ? -6 : 6);
      whisker(rgba, width, x, row.lag.lo, row.lag.hi, yOf, rgb);
      fillRect(rgba, width, x - 3, yOf(row.lag.mean) - 3, 6, 6, rgb);
    }
  }
  for (const offset of offsets) drawText(rgba, width, xOf(offset) - 10, height - 28, String(offset), [30, 30, 30]);
  writeFileSync(`${OUT}/positive-onset.png`, writePng(width, height, rgba));
}

function drawProfile(rows: OccRow[], period: number, path: string, title: string) {
  const width = 880;
  const height = 520;
  const rgba = blank(width, height);
  drawText(rgba, width, 16, 12, title, [30, 30, 30]);
  EXPLORERS.forEach((signal, i) => {
    fillRect(rgba, width, 16 + i * 90, 36, 12, 8, COLOR[signal]);
    drawText(rgba, width, 32 + i * 90, 36, signal.slice(0, 4), [30, 30, 30]);
  });
  const left = 64;
  const right = width - 24;
  const top = 64;
  const bottom = height - 42;
  let yMin = 0;
  let yMax = 0;
  for (const row of rows) {
    for (const bin of row.bins) {
      yMin = Math.min(yMin, bin.lo, bin.mean);
      yMax = Math.max(yMax, bin.hi, bin.mean);
    }
  }
  const pad = Math.max(0.005, (yMax - yMin) * 0.15);
  yMin -= pad;
  yMax += pad;
  const yOf = (value: number) => bottom - ((value - yMin) / (yMax - yMin || 1)) * (bottom - top);
  const xOf = (bin: number) => left + ((bin + 0.5) / PHASE_BINS) * (right - left);
  line(rgba, width, left, yOf(0), right, yOf(0), [170, 170, 170]);
  line(rgba, width, xOf(3.5), top, xOf(3.5), bottom, [210, 210, 210]);
  for (const row of rows) {
    for (let i = 1; i < row.bins.length; i++) {
      line(rgba, width, xOf(i - 1), yOf(row.bins[i - 1]!.mean), xOf(i), yOf(row.bins[i]!.mean), COLOR[row.signal]);
    }
    row.bins.forEach((bin, i) => {
      whisker(rgba, width, xOf(i), bin.lo, bin.hi, yOf, COLOR[row.signal]);
      fillRect(rgba, width, xOf(i) - 3, yOf(bin.mean) - 3, 6, 6, COLOR[row.signal]);
    });
  }
  drawText(rgba, width, left, height - 24, `phase of ${period}`, [30, 30, 30]);
  void period;
  writeFileSync(path, writePng(width, height, rgba));
}

function drawProgress(primary: ProgressSide, slow: ProgressSide) {
  const width = 880;
  const height = 520;
  const rgba = blank(width, height);
  drawText(rgba, width, 16, 12, "positive progress during an 80-step return", [30, 30, 30]);
  const series = [
    { name: "decay", side: primary, rgb: [140, 60, 180] as RGB },
    { name: "slow", side: slow, rgb: [36, 104, 196] as RGB },
  ];
  series.forEach((item, i) => {
    fillRect(rgba, width, 520 + i * 90, 12, 12, 8, item.rgb);
    drawText(rgba, width, 536 + i * 90, 12, item.name, [30, 30, 30]);
  });
  const left = 64;
  const right = width - 24;
  const top = 48;
  const bottom = height - 42;
  const times = primary.times;
  let yMin = 0;
  let yMax = 0;
  for (const item of series) {
    for (const ci of item.side.positiveSum) {
      yMin = Math.min(yMin, ci.lo, ci.mean);
      yMax = Math.max(yMax, ci.hi, ci.mean);
    }
  }
  const pad = Math.max(0.001, (yMax - yMin) * 0.15);
  yMin -= pad;
  yMax += pad;
  const yOf = (value: number) => bottom - ((value - yMin) / (yMax - yMin || 1)) * (bottom - top);
  const xOf = (t: number) => left + (t / (times[times.length - 1] || 1)) * (right - left);
  line(rgba, width, left, yOf(0), right, yOf(0), [170, 170, 170]);
  for (const item of series) {
    for (let i = 1; i < times.length; i++) {
      line(
        rgba,
        width,
        xOf(times[i - 1]!),
        yOf(item.side.positiveSum[i - 1]!.mean),
        xOf(times[i]!),
        yOf(item.side.positiveSum[i]!.mean),
        item.rgb,
      );
    }
    item.side.positiveSum.forEach((ci, i) => {
      whisker(rgba, width, xOf(times[i]!), ci.lo, ci.hi, yOf, item.rgb);
      fillRect(rgba, width, xOf(times[i]!) - 3, yOf(ci.mean) - 3, 6, 6, item.rgb);
    });
  }
  drawText(rgba, width, left, height - 24, "decay steps before the bout", [30, 30, 30]);
  writeFileSync(`${OUT}/progress-decay.png`, writePng(width, height, rgba));
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
