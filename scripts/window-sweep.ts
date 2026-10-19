/**
 * Progress-window sweep under the primary forgetting rate. Not part of CI.
 *
 *   npm run window-sweep
 *
 * The curve is the previous entry's. Rho then runs at windows 25, 50, and 100.
 * Count, surprise, RND, and random run at the shipped window only: they do not
 * read it. Seeds 1–200. Writes bench/window-sweep/window.json and the figures.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  PHASE_BINS,
  PROGRESS_TIMES,
  WINDOW_BOUT_STEPS,
  WINDOW_GRID,
  bootstrapOnset,
  bootstrapOnsetDiff,
  bootstrapPlantedLag,
  hunchVerdict,
  latePattern,
  locationCall,
  meanVector,
  moveCall,
  offsetCall,
  peakAngle,
  peakMajority,
  phaseInstrumentCall,
  project,
  scalePrediction,
  signCall,
  specificityCall,
  usablePeak,
  type LatePattern,
  type LocationCall,
  type MoveCall,
  type OffsetCall,
  type ScalePrediction,
  type SignCall,
} from "../src/lib/kernel/phase.ts";
import { mulberry32 } from "../src/lib/kernel/presets.ts";
import { SHIPPED_PROGRESS_WINDOW } from "../src/lib/kernel/progress.ts";
import { CURIOSITY_SIGNALS, type CuriositySignal } from "../src/lib/kernel/signals.ts";
import { bootstrapMeanCI as meanCI, meanOf, pairedDifference, type Interval } from "../src/lib/kernel/stats.ts";
import { drawText, fillRect, writePng } from "./png.ts";
import { runPool, workerCount } from "./pool.ts";

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) return fallback;
  return process.argv[i + 1]!;
}

const SEEDS = Math.max(1, Number(arg("seeds", "200")));
const OUT = arg("out", "bench/window-sweep");
const HARNESS = SEEDS === 200;
const PREVIOUS = "bench/phase-profile/profile.json";
const EXPLORERS = CURIOSITY_SIGNALS;
const LAST = PROGRESS_TIMES.length - 1;
type RGB = [number, number, number];
const WINDOW_COLOR: Record<(typeof WINDOW_GRID)[number], RGB> = {
  25: [36, 104, 196],
  50: [140, 60, 180],
  100: [186, 42, 58],
};
const SIGNAL_COLOR: Record<CuriositySignal, RGB> = {
  random: [120, 120, 120],
  count: [36, 104, 196],
  surprise: [186, 42, 58],
  rnd: [40, 140, 90],
  rho: [140, 60, 180],
};

function explorerIndex(signal: CuriositySignal) {
  return EXPLORERS.indexOf(signal);
}

function windowIndex(window: number) {
  return WINDOW_GRID.indexOf(window as (typeof WINDOW_GRID)[number]);
}

function fmt(ci: Interval) {
  return `${ci.mean.toFixed(4)} [${ci.lo.toFixed(4)}, ${ci.hi.toFixed(4)}]`;
}

function near(actual: number, expected: number, label: string) {
  if (!(Math.abs(actual - expected) <= 1e-9)) {
    throw new Error(`harness ${label}: ${actual} != ${expected}`);
  }
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

function whisker(rgba: Uint8Array, width: number, x: number, lo: number, hi: number, yOf: (v: number) => number, rgb: RGB) {
  line(rgba, width, x, yOf(lo), x, yOf(hi), rgb);
  line(rgba, width, x - 4, yOf(lo), x + 4, yOf(lo), rgb);
  line(rgba, width, x - 4, yOf(hi), x + 4, yOf(hi), rgb);
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

function assertClean(rows: EpisodeResult[]) {
  for (const row of rows) {
    if (row.foods !== 0 || row.lives !== 0) {
      throw new Error(`cycle world recorded food or death on seed ${row.seed} ${row.signal}`);
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

type OccRow = {
  signal: CuriositySignal;
  window: number;
  phase: Interval;
  half: Interval;
  east: Interval;
  sign: SignCall;
  onset: ReturnType<typeof bootstrapOnset>;
  location: LocationCall;
  heldOut: Interval;
  exists: boolean;
  bins: Interval[];
  amplitude: number;
  late: LatePattern;
  vectors: Diff[];
};

function occupancyRow(
  forget: EpisodeResult[],
  held: EpisodeResult[],
  period: number,
  signal: CuriositySignal,
  window: number,
  salts: { phase: number; half: number; east: number; bin: number; onset: number; held: number },
): OccRow {
  const vectors = diffVectors(forget, held);
  const phase = pairedDifference(
    vectors.map((row) => row.phase),
    vectors.map(() => 0),
    salts.phase,
  );
  const half = pairedDifference(
    vectors.map((row) => row.half),
    vectors.map(() => 0),
    salts.half,
  );
  const east = pairedDifference(
    vectors.map((row) => row.east),
    vectors.map(() => 0),
    salts.east,
  );
  const bins = vectors[0]!.bins.map((_, bin) =>
    pairedDifference(
      vectors.map((row) => row.bins[bin]!),
      vectors.map(() => 0),
      salts.bin + bin,
    ),
  );
  const onset = bootstrapOnset(vectors, period, 2000, salts.onset);
  const mean = meanVector(vectors);
  const amplitude = Math.hypot(mean.c, mean.s);
  const location = locationCall(onset.mean, onset.lo, onset.hi, period, amplitude);
  const discovery = vectors.filter((row) => row.seed <= 100);
  const confirmation = vectors.filter((row) => row.seed >= 101);
  const dir = meanVector(discovery);
  const phi = Math.atan2(dir.s, dir.c);
  const heldOut = meanCI(
    confirmation.map((row) => project(row.c, row.s, phi)),
    2000,
    0.05,
    salts.held,
  );
  const sign = signCall(phase);
  return {
    signal,
    window,
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
    late: latePattern(sign, location),
    vectors,
  };
}

function legacySalts(signal: CuriositySignal) {
  const index = explorerIndex(signal);
  return {
    phase: 11000 + index,
    half: 11200 + index,
    east: 11800 + index,
    bin: 11600 + 10 * index,
    onset: 11400 + index,
    held: 12000 + index,
  };
}

function windowSalts(window: number) {
  if (window === SHIPPED_PROGRESS_WINDOW) return legacySalts("rho");
  const index = windowIndex(window);
  return {
    phase: 13300 + index,
    half: 13500 + index,
    east: 13600 + index,
    bin: 13700 + 10 * index,
    onset: 13800 + index,
    held: 13900 + index,
  };
}

type ControlRow = {
  window: number;
  offset: number;
  projection: Interval;
  lag: Interval;
  offsetCall: OffsetCall;
};

function positiveTable(rows: EpisodeResult[], window: number, offsets: number[]): ControlRow[] {
  const mine = rows.filter((row) => row.progressWindow === window && row.signal === "rho");
  const flat = mine.filter((row) => row.add === 0);
  const out: ControlRow[] = [];
  for (const offset of offsets) {
    const boosted = mine.filter((row) => row.add === CONTROL_DOSE && row.offset === offset);
    const vectors = diffVectors(boosted, flat);
    const offsetIndex = offsets.indexOf(offset);
    const legacy = window === SHIPPED_PROGRESS_WINDOW;
    const projSalt = legacy ? 10040 + offsetIndex : 14000 + 10 * windowIndex(window) + offsetIndex;
    const lagSalt = legacy ? 10140 + offsetIndex : 14100 + 10 * windowIndex(window) + offsetIndex;
    const phi = peakAngle(offset, boosted[0]!.period);
    const projection = pairedDifference(
      vectors.map((row) => project(row.c, row.s, phi)),
      vectors.map(() => 0),
      projSalt,
    );
    const lag = bootstrapPlantedLag(vectors, boosted[0]!.period, offset, 2000, lagSalt);
    const quarter = Math.floor(boosted[0]!.period / 4);
    out.push({ window, offset, projection, lag, offsetCall: offsetCall(projection, lag, quarter) });
  }
  return out;
}

function publicOcc(row: OccRow) {
  return {
    signal: row.signal,
    window: row.window,
    phase: row.phase,
    half: row.half,
    east: row.east,
    sign: row.sign,
    onset: row.onset,
    location: row.location,
    heldOut: row.heldOut,
    exists: row.exists,
    amplitude: row.amplitude,
    late: row.late,
    bins: row.bins,
  };
}

async function main() {
  const seeds = Array.from({ length: SEEDS }, (_, i) => i + 1);
  const workers = workerCount();
  mkdirSync(OUT, { recursive: true });
  const previous = JSON.parse(readFileSync(PREVIOUS, "utf8")) as {
    primaryCurve: {
      learns: Interval;
      forgets: Interval;
      meanH: number;
      period: number;
      half: number;
      steps: number;
      decision: string;
    };
    progress: { primary: { peakAtEnd: Interval; positiveSum: Interval[] } };
    occupancy: { primary: { rows: { signal: string; phase: Interval; onset: { mean: number }; sign: string; location: string }[] } };
    positive: { signal: string; add: number; offset: number; projection: Interval; lag: Interval; offsetCall: string }[];
  };
  const t0 = Date.now();
  const curveJobs: CycleJob[] = seeds.map((seed, id) => ({ kind: "curve", id, seed, lambda: CYCLE_LAMBDA }));
  console.error(`curve ${curveJobs.length} seeds, ${workers} workers, λ ${CYCLE_LAMBDA}`);
  const curveRows = (await runPool(curveJobs, new URL("./cycle-worker.ts", import.meta.url), workers)) as CurveResult[];
  const ordered = curveRows.slice().sort((a, b) => a.seed - b.seed);
  const probe0 = ordered.map((row) => row.probe0);
  const learnEnd = ordered.map((row) => row.learnEnd);
  const learns = pairedDifference(probe0, learnEnd, CURVE_LEARN_SALT);
  const consolidates = pairedDifference(
    ordered.map((row) => (row.probe0 + row.learnEnd) / 2),
    ordered.map((row) => row.decayLearnEnd),
    CURVE_CONSOLIDATE_SALT,
  );
  const forgets = pairedDifference(
    ordered.map((row) => row.decayEnd),
    ordered.map((row) => row.heldEnd),
    CURVE_FORGET_SALT,
  );
  const interference = pairedDifference(
    ordered.map((row) => row.interEnd),
    ordered.map((row) => row.heldEnd),
    CURVE_INTERFERENCE_SALT,
  );
  const hs: number[] = [];
  for (const row of ordered) {
    const h = halfRecovery(row.probe0, row.learnEnd, row.held, row.decay, row.times);
    if (h != null) hs.push(h);
  }
  const meanH = hs.length ? meanOf(hs) : null;
  const decided = curveDecision({
    learns: callOf(learns),
    consolidates: callOf(consolidates),
    forgets: callOf(forgets),
    nSeeds: ordered.length,
    nUncensored: hs.length,
    meanH,
  });
  const hInterval = meanCI(hs, 2000, 0.05, 8005);
  console.error(`curve ${decided.decision} H ${meanH ?? "none"} P ${decided.period ?? "none"} forgets ${fmt(forgets)}`);
  if (HARNESS) {
    near(learns.mean, previous.primaryCurve.learns.mean, "learns");
    near(forgets.mean, previous.primaryCurve.forgets.mean, "forgets");
    near(meanH ?? NaN, previous.primaryCurve.meanH, "half-recovery");
    if (decided.period !== previous.primaryCurve.period || decided.steps !== previous.primaryCurve.steps) {
      throw new Error(`harness period ${decided.period} steps ${decided.steps}`);
    }
    if (decided.decision !== "run") throw new Error(`harness curve ${decided.decision}`);
  }
  drawCurve(ordered);

  const report: Record<string, unknown> = {
    date: new Date().toISOString(),
    tau: CYCLE_TAU,
    lambda: CYCLE_LAMBDA,
    seeds,
    windows: WINDOW_GRID,
    boutSteps: WINDOW_BOUT_STEPS,
    historicalBout: BOUT_STEPS,
    learnSteps: LEARN_STEPS,
    awaySteps: AWAY_STEPS,
    controlDose: CONTROL_DOSE,
    temperature: PRIMARY_TEMPERATURE,
    curve: {
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
    },
  };

  if (decided.decision !== "run" || decided.period == null || decided.steps == null) {
    report.summary = "no-period";
    writeFileSync(`${OUT}/window.json`, `${JSON.stringify(report, null, 2)}\n`);
    console.error(`stopped at ${decided.decision}`);
    return;
  }
  const period = decided.period;
  const steps = decided.steps;
  const offsets = [0, Math.round(period / 4), 2 * Math.round(period / 4), 3 * Math.round(period / 4)];

  const progressJobs: CycleJob[] = [];
  for (const window of WINDOW_GRID) {
    for (const seed of seeds) {
      progressJobs.push({
        kind: "progress",
        id: progressJobs.length,
        seed,
        lambda: CYCLE_LAMBDA,
        progressWindow: window,
        boutSteps: WINDOW_BOUT_STEPS,
      });
    }
  }
  console.error(`progress ${progressJobs.length}, ${workers} workers`);
  const tProgress = Date.now();
  const progressRows = (await runPool(
    progressJobs,
    new URL("./cycle-worker.ts", import.meta.url),
    workers,
  )) as ProgressResult[];
  console.error(`progress finished in ${((Date.now() - tProgress) / 1000).toFixed(1)}s`);
  const progress = progressTable(progressRows);
  report.progress = progress.publicRows;
  if (HARNESS) {
    const replicated = progress.byWindow.get(SHIPPED_PROGRESS_WINDOW)!;
    near(replicated.pub.peak80.mean, previous.progress.primary.peakAtEnd.mean, "peak80");
    near(replicated.pub.sum80.mean, previous.progress.primary.positiveSum[LAST]!.mean, "positiveSum80");
    console.error(`harness peak80 ${replicated.pub.peak80.mean} sum80 ${replicated.pub.sum80.mean}`);
  }
  drawPeaks(progress.publicRows);
  drawTrace(progress.traces);

  const episodeJobs: CycleJob[] = [];
  const queue = (partial: Omit<Extract<CycleJob, { kind: "episode" }>, "kind" | "id">) => {
    episodeJobs.push({ kind: "episode", id: episodeJobs.length, ...partial });
  };
  for (const window of WINDOW_GRID) {
    for (const seed of seeds) {
      queue({
        seed,
        signal: "rho",
        steps,
        period,
        forgettingRate: 0,
        policyTemperature: PRIMARY_TEMPERATURE,
        add: 0,
        offset: 0,
        salt: 9501,
        arm: "periodic",
        tag: "positive",
        progressWindow: window,
      });
      for (const offset of offsets) {
        queue({
          seed,
          signal: "rho",
          steps,
          period,
          forgettingRate: 0,
          policyTemperature: PRIMARY_TEMPERATURE,
          add: CONTROL_DOSE,
          offset,
          salt: 9501,
          arm: "periodic",
          tag: "positive",
          progressWindow: window,
        });
      }
      queue({
        seed,
        signal: "rho",
        steps,
        period,
        forgettingRate: CYCLE_LAMBDA,
        policyTemperature: PRIMARY_TEMPERATURE,
        add: 0,
        offset: 0,
        salt: 9401,
        arm: "forget",
        tag: "occ",
        progressWindow: window,
      });
      queue({
        seed,
        signal: "rho",
        steps,
        period,
        forgettingRate: 0,
        policyTemperature: PRIMARY_TEMPERATURE,
        add: 0,
        offset: 0,
        salt: 9401,
        arm: "held",
        tag: "occ",
        progressWindow: window,
      });
    }
  }
  for (const signal of EXPLORERS) {
    if (signal === "rho") continue;
    for (const seed of seeds) {
      for (const arm of ["forget", "held"] as const) {
        queue({
          seed,
          signal,
          steps,
          period,
          forgettingRate: arm === "forget" ? CYCLE_LAMBDA : 0,
          policyTemperature: PRIMARY_TEMPERATURE,
          add: 0,
          offset: 0,
          salt: 9401,
          arm,
          tag: "occ",
          progressWindow: SHIPPED_PROGRESS_WINDOW,
        });
      }
    }
  }
  console.error(`episodes ${episodeJobs.length}, ${workers} workers`);
  const tEp = Date.now();
  const episodeRows = (await runPool(episodeJobs, new URL("./cycle-worker.ts", import.meta.url), workers)) as EpisodeResult[];
  console.error(`episodes finished in ${((Date.now() - tEp) / 1000).toFixed(1)}s`);
  assertClean(episodeRows);

  const positive = WINDOW_GRID.map((window) => {
    const rows = positiveTable(episodeRows.filter((row) => row.tag === "positive"), window, offsets);
    return { window, rows, instrument: phaseInstrumentCall(rows.map((row) => row.offsetCall)) };
  });
  if (HARNESS) {
    const shipped = positive.find((row) => row.window === SHIPPED_PROGRESS_WINDOW)!;
    const prior = previous.positive.filter((row) => row.signal === "rho" && row.add === CONTROL_DOSE);
    for (const row of shipped.rows) {
      const match = prior.find((item) => item.offset === row.offset);
      if (!match) throw new Error(`harness missing offset ${row.offset}`);
      near(row.projection.mean, match.projection.mean, `proj ${row.offset}`);
      near(row.lag.mean, match.lag.mean, `lag ${row.offset}`);
      if (row.offsetCall !== match.offsetCall) throw new Error(`harness offset ${row.offset} ${row.offsetCall} != ${match.offsetCall}`);
    }
    console.error("harness positive control matched");
  }

  const rhoOcc = WINDOW_GRID.map((window) => {
    const mine = episodeRows.filter((row) => row.tag === "occ" && row.signal === "rho" && row.progressWindow === window);
    return occupancyRow(
      mine.filter((row) => row.arm === "forget"),
      mine.filter((row) => row.arm === "held"),
      period,
      "rho",
      window,
      windowSalts(window),
    );
  });
  const baselines = EXPLORERS.filter((signal) => signal !== "rho").map((signal) => {
    const mine = episodeRows.filter(
      (row) => row.tag === "occ" && row.signal === signal && row.progressWindow === SHIPPED_PROGRESS_WINDOW,
    );
    return occupancyRow(
      mine.filter((row) => row.arm === "forget"),
      mine.filter((row) => row.arm === "held"),
      period,
      signal,
      SHIPPED_PROGRESS_WINDOW,
      legacySalts(signal),
    );
  });
  const rho50 = rhoOcc.find((row) => row.window === SHIPPED_PROGRESS_WINDOW)!;
  if (HARNESS) {
    const prior = previous.occupancy.primary.rows.find((row) => row.signal === "rho")!;
    near(rho50.phase.mean, prior.phase.mean, "half-contrast");
    near(rho50.onset.mean, prior.onset.mean, "onset");
    if (rho50.sign !== prior.sign || rho50.location !== prior.location) {
      throw new Error(`harness occupancy ${rho50.sign} ${rho50.location} != ${prior.sign} ${prior.location}`);
    }
    console.error("harness occupancy matched");
  }

  const instrumentCalls = positive.map((row) => row.instrument);
  const instrument = instrumentCalls.every((call) => call === "confirmed")
    ? "confirmed"
    : instrumentCalls.every((call) => call === "refuted")
      ? "refuted"
      : "inconclusive";

  const boutMoves: MoveCall[] = [];
  const boutDiffs = [
    peakDiff(progress.rows.get(50)!, progress.rows.get(25)!, 13100),
    peakDiff(progress.rows.get(100)!, progress.rows.get(50)!, 13101),
  ];
  const boutCensored = progress.publicRows.some((row) => row.peakCensored) || boutDiffs.some((row) => row.censored);
  for (const diff of boutDiffs) if (!diff.censored) boutMoves.push(moveCall(diff.ci));
  const boutPrediction = scalePrediction(boutMoves, boutCensored);

  const onsetAvailable = instrument === "confirmed" && rhoOcc.every((row) => row.location !== "unresolved");
  const onsetDiffs = onsetAvailable
    ? [
        bootstrapOnsetDiff(rhoOcc[1]!.vectors, rhoOcc[0]!.vectors, period, 2000, 13200),
        bootstrapOnsetDiff(rhoOcc[2]!.vectors, rhoOcc[1]!.vectors, period, 2000, 13201),
      ]
    : [];
  const onsetPrediction = scalePrediction(
    onsetDiffs.map((diff) => moveCall(diff)),
    !onsetAvailable,
  );

  const contrastDiffs = [
    pairedDifference(
      rhoOcc[0]!.vectors.map((row) => row.phase),
      rhoOcc[1]!.vectors.map((row) => row.phase),
      13400,
    ),
    pairedDifference(
      rhoOcc[1]!.vectors.map((row) => row.phase),
      rhoOcc[2]!.vectors.map((row) => row.phase),
      13401,
    ),
  ];
  const contrastPrediction: ScalePrediction = scalePrediction(
    contrastDiffs.map((diff) => moveCall(diff)),
    false,
  );
  const verdict = hunchVerdict({
    instrument,
    bout: boutPrediction,
    onset: onsetPrediction,
    contrast: contrastPrediction,
  });
  const specificity = specificityCall({
    randomSign: baselines.find((row) => row.signal === "random")!.sign,
    otherExists: baselines.some((row) => row.exists),
  });

  report.instrument = instrument;
  report.positive = positive.map((row) => ({
    window: row.window,
    instrument: row.instrument,
    offsets: row.rows,
  }));
  report.occupancy = rhoOcc.map(publicOcc);
  report.baselines = baselines.map(publicOcc);
  report.boutDiffs = boutDiffs.map((row) => ({ ...row.ci, nPaired: row.nPaired, censored: row.censored }));
  report.onsetDiffs = onsetDiffs;
  report.contrastDiffs = contrastDiffs;
  report.predictions = {
    bout: boutPrediction,
    onset: onsetPrediction,
    contrast: contrastPrediction,
  };
  report.summary = verdict;
  report.specificity = specificity;
  report.ratios = [
    ratioOf(progress.rows.get(50)!, progress.rows.get(25)!, 13110),
    ratioOf(progress.rows.get(100)!, progress.rows.get(50)!, 13111),
  ];
  writeFileSync(`${OUT}/window.json`, `${JSON.stringify(report, null, 2)}\n`);
  drawPositive(positive);
  drawContrast(rhoOcc, baselines);
  drawPhase(rhoOcc, baselines, period);
  console.error(`instrument ${instrument} bout ${boutPrediction} onset ${onsetPrediction} contrast ${contrastPrediction}`);
  console.error(`summary ${verdict} specificity ${specificity}`);
  for (const row of rhoOcc) {
    console.error(
      `rho W${row.window} ${row.sign} phase ${fmt(row.phase)} onset ${row.onset.mean.toFixed(2)} ${row.location} late ${row.late}`,
    );
  }
  for (const row of progress.publicRows) {
    console.error(
      `peak W${row.window} ${fmt(row.peak)} usable ${row.nUsable}/${row.n} censored ${row.peakCensored} peak80 ${fmt(row.peak80)}`,
    );
  }
  for (const diff of boutDiffs) console.error(`bout diff ${fmt(diff.ci)} paired ${diff.nPaired} censored ${diff.censored}`);
  for (const diff of onsetDiffs) console.error(`onset diff ${fmt(diff)}`);
  for (const diff of contrastDiffs) console.error(`contrast diff ${fmt(diff)}`);
  for (const row of baselines) console.error(`${row.signal} ${row.sign} phase ${fmt(row.phase)} late ${row.late}`);
  console.error(`total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

function progressTable(rows: ProgressResult[]) {
  const byWindow = new Map<number, ReturnType<typeof oneWindow>>();
  const grouped = new Map<number, ProgressResult[]>();
  for (const row of rows) {
    const list = grouped.get(row.progressWindow) ?? [];
    list.push(row);
    grouped.set(row.progressWindow, list);
  }
  const publicRows = [];
  const traces: { window: number; mean: number[] }[] = [];
  for (const window of WINDOW_GRID) {
    const side = oneWindow(grouped.get(window) ?? [], window);
    byWindow.set(window, side);
    publicRows.push(side.pub);
    traces.push({ window, mean: side.trace });
  }
  return { byWindow, rows: grouped, publicRows, traces };
}

function oneWindow(rows: ProgressResult[], window: number) {
  const ordered = rows.slice().sort((a, b) => a.seed - b.seed);
  const n = ordered.length;
  const peaks = ordered.map((row) => row.peakAt[LAST] ?? null);
  const usable = peaks.filter((value): value is number => usablePeak(value, WINDOW_BOUT_STEPS));
  const peak = usable.length ? meanCI(usable, 2000, 0.05, 13000 + windowIndex(window)) : { mean: 0, lo: 0, hi: 0, n: 0 };
  const peak80Values = ordered.map((row) => row.peakAt80[LAST]).filter((value): value is number => value != null);
  const peak80Salt = window === SHIPPED_PROGRESS_WINDOW ? 8370 : 13020 + windowIndex(window);
  const peak80 = peak80Values.length ? meanCI(peak80Values, 2000, 0.05, peak80Salt) : { mean: 0, lo: 0, hi: 0, n: 0 };
  const sum80 = meanCI(
    ordered.map((row) => row.positiveSum80[LAST]!),
    2000,
    0.05,
    window === SHIPPED_PROGRESS_WINDOW ? 8500 + LAST : 14300 + 10 * windowIndex(window) + LAST,
  );
  const sums = PROGRESS_TIMES.map((_, index) =>
    meanCI(
      ordered.map((row) => row.positiveSum80[index]!),
      2000,
      0.05,
      window === SHIPPED_PROGRESS_WINDOW ? 8500 + index : 14300 + 10 * windowIndex(window) + index,
    ),
  );
  const trace = ordered[0] ? ordered[0].trace.map((_, step) => meanOf(ordered.map((row) => row.trace[step]!))) : [];
  const pub = {
    window,
    n,
    nUsable: usable.length,
    nRightCensored: peaks.filter((value) => value === WINDOW_BOUT_STEPS - 1).length,
    nSilent: peaks.filter((value) => value == null).length,
    peakCensored: !peakMajority(n, usable.length),
    peak,
    peak80,
    sum80,
    positiveSum80: sums,
  };
  return { pub, trace, peaks, ordered };
}

function peakDiff(longer: ProgressResult[], shorter: ProgressResult[], salt: number) {
  const a = longer.slice().sort((x, y) => x.seed - y.seed);
  const b = shorter.slice().sort((x, y) => x.seed - y.seed);
  if (a.length !== b.length || a.some((row, i) => row.seed !== b[i]!.seed)) throw new Error("peak diff is not paired");
  const diffs: number[] = [];
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!.peakAt[LAST] ?? null;
    const right = b[i]!.peakAt[LAST] ?? null;
    if (!usablePeak(left, WINDOW_BOUT_STEPS) || !usablePeak(right, WINDOW_BOUT_STEPS)) continue;
    diffs.push(left! - right!);
  }
  const censored = !peakMajority(a.length, diffs.length);
  const ci = diffs.length ? pairedDifference(diffs, diffs.map(() => 0), salt) : { mean: 0, lo: 0, hi: 0, n: 0, excludesZero: false };
  return { ci, nPaired: diffs.length, censored };
}

function ratioOf(numer: ProgressResult[], denom: ProgressResult[], salt: number): Interval {
  const a = numer.slice().sort((x, y) => x.seed - y.seed);
  const b = denom.slice().sort((x, y) => x.seed - y.seed);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!.peakAt[LAST] ?? null;
    const right = b[i]!.peakAt[LAST] ?? null;
    if (!usablePeak(left, WINDOW_BOUT_STEPS) || !usablePeak(right, WINDOW_BOUT_STEPS) || right === 0) continue;
    xs.push(left!);
    ys.push(right!);
  }
  if (xs.length < 2) return { mean: 0, lo: 0, hi: 0, n: xs.length };
  const point = meanOf(xs) / meanOf(ys);
  const rand = mulberry32(salt >>> 0);
  const values = new Float64Array(2000);
  for (let draw = 0; draw < 2000; draw++) {
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < xs.length; i++) {
      const j = (rand() * xs.length) | 0;
      sx += xs[j]!;
      sy += ys[j]!;
    }
    values[draw] = sy === 0 ? point : sx / sy;
  }
  values.sort();
  return {
    mean: point,
    lo: values[Math.floor(0.025 * 2000)]!,
    hi: values[Math.min(1999, Math.ceil(0.975 * 2000) - 1)]!,
    n: xs.length,
  };
}

function drawCurve(rows: CurveResult[]) {
  const width = 880;
  const height = 520;
  const rgba = blank(width, height);
  drawText(rgba, width, 16, 12, "region-1 probe while away", [30, 30, 30]);
  const times = rows[0]?.times ?? [];
  const held = times.map((_, i) => meanOf(rows.map((row) => row.held[i]!)));
  const decay = times.map((_, i) => meanOf(rows.map((row) => row.decay[i]!)));
  const series = [
    { name: "held", ys: held, rgb: [40, 40, 40] as RGB },
    { name: "decay", ys: decay, rgb: [140, 60, 180] as RGB },
  ];
  plotSeries(rgba, width, height, times, series, "away steps");
  writeFileSync(`${OUT}/forget-curve.png`, writePng(width, height, rgba));
}

function drawPeaks(rows: ReturnType<typeof oneWindow>["pub"][]) {
  const width = 880;
  const height = 520;
  const rgba = blank(width, height);
  drawText(rgba, width, 16, 12, "progress peak step", [30, 30, 30]);
  const windows = rows.map((row) => row.window);
  let yMin = 0;
  let yMax = 1;
  for (const row of rows) {
    yMin = Math.min(yMin, row.peak.lo, row.peak80.lo);
    yMax = Math.max(yMax, row.peak.hi, row.peak80.hi, row.window);
  }
  const yOf = axisY(height, yMin, yMax);
  const xOf = (window: number) => 120 + ((windows.indexOf(window) + 0.5) / windows.length) * 680;
  line(rgba, width, 80, yOf(0), 840, yOf(0), [210, 210, 210]);
  for (let i = 1; i < rows.length; i++) {
    line(rgba, width, xOf(rows[i - 1]!.window), yOf(rows[i - 1]!.peak.mean), xOf(rows[i]!.window), yOf(rows[i]!.peak.mean), [140, 60, 180]);
  }
  for (const row of rows) {
    const rgb = WINDOW_COLOR[row.window as 25 | 50 | 100];
    whisker(rgba, width, xOf(row.window), row.peak.lo, row.peak.hi, yOf, rgb);
    fillRect(rgba, width, xOf(row.window) - 4, yOf(row.peak.mean) - 4, 8, 8, rgb);
    fillRect(rgba, width, xOf(row.window) + 10, yOf(row.peak80.mean) - 3, 6, 6, [80, 80, 80]);
    drawText(rgba, width, xOf(row.window) - 12, height - 28, String(row.window), [30, 30, 30]);
  }
  drawText(rgba, width, 16, 36, "square full bout   small square first 80", [30, 30, 30]);
  writeFileSync(`${OUT}/peak-vs-window.png`, writePng(width, height, rgba));
}

function drawTrace(traces: { window: number; mean: number[] }[]) {
  const width = 880;
  const height = 520;
  const rgba = blank(width, height);
  drawText(rgba, width, 16, 12, "progress during the return", [30, 30, 30]);
  const series = traces.map((trace) => ({
    name: String(trace.window),
    ys: trace.mean,
    rgb: WINDOW_COLOR[trace.window as 25 | 50 | 100],
  }));
  const xs = traces[0] ? traces[0].mean.map((_, i) => i) : [];
  plotSeries(rgba, width, height, xs, series, "bout step");
  writeFileSync(`${OUT}/progress-trace.png`, writePng(width, height, rgba));
}

function drawPositive(rows: { window: number; rows: ControlRow[] }[]) {
  const width = 880;
  const height = 520;
  const rgba = blank(width, height);
  drawText(rgba, width, 16, 12, "recovered onset minus planted offset", [30, 30, 30]);
  const offsets = rows[0]?.rows.map((row) => row.offset) ?? [];
  let yMin = 0;
  let yMax = 1;
  for (const group of rows) {
    for (const row of group.rows) {
      yMin = Math.min(yMin, row.lag.lo);
      yMax = Math.max(yMax, row.lag.hi);
    }
  }
  const yOf = axisY(height, yMin, yMax);
  const xOf = (offset: number) => 90 + ((offsets.indexOf(offset) + 0.5) / Math.max(1, offsets.length)) * 720;
  line(rgba, width, 70, yOf(0), 850, yOf(0), [210, 210, 210]);
  rows.forEach((group, g) => {
    const rgb = WINDOW_COLOR[group.window as 25 | 50 | 100];
    fillRect(rgba, width, 16 + g * 70, 36, 12, 8, rgb);
    drawText(rgba, width, 32 + g * 70, 36, String(group.window), [30, 30, 30]);
    for (let i = 1; i < group.rows.length; i++) {
      line(
        rgba,
        width,
        xOf(group.rows[i - 1]!.offset),
        yOf(group.rows[i - 1]!.lag.mean),
        xOf(group.rows[i]!.offset),
        yOf(group.rows[i]!.lag.mean),
        rgb,
      );
    }
    for (const row of group.rows) {
      const x = xOf(row.offset) + (g - 1) * 8;
      whisker(rgba, width, x, row.lag.lo, row.lag.hi, yOf, rgb);
      fillRect(rgba, width, x - 3, yOf(row.lag.mean) - 3, 6, 6, rgb);
    }
  });
  for (const offset of offsets) drawText(rgba, width, xOf(offset) - 10, height - 28, String(offset), [30, 30, 30]);
  writeFileSync(`${OUT}/positive-onset.png`, writePng(width, height, rgba));
}

function drawContrast(rho: OccRow[], baselines: OccRow[]) {
  const width = 880;
  const height = 520;
  const rgba = blank(width, height);
  drawText(rgba, width, 16, 12, "half contrast decay minus held", [30, 30, 30]);
  const points = [
    ...rho.map((row) => ({ label: String(row.window), ci: row.phase, rgb: WINDOW_COLOR[row.window as 25 | 50 | 100] })),
    ...baselines.map((row) => ({ label: row.signal.slice(0, 4), ci: row.phase, rgb: SIGNAL_COLOR[row.signal] })),
  ];
  let yMin = 0;
  let yMax = 0;
  for (const point of points) {
    yMin = Math.min(yMin, point.ci.lo);
    yMax = Math.max(yMax, point.ci.hi);
  }
  const yOf = axisY(height, yMin, yMax);
  line(rgba, width, 70, yOf(0), 850, yOf(0), [170, 170, 170]);
  points.forEach((point, i) => {
    const x = 80 + ((i + 0.5) / points.length) * 760;
    whisker(rgba, width, x, point.ci.lo, point.ci.hi, yOf, point.rgb);
    fillRect(rgba, width, x - 4, yOf(point.ci.mean) - 4, 8, 8, point.rgb);
    drawText(rgba, width, x - 16, height - 28, point.label, [30, 30, 30]);
  });
  writeFileSync(`${OUT}/half-contrast.png`, writePng(width, height, rgba));
}

function drawPhase(rho: OccRow[], baselines: OccRow[], period: number) {
  const width = 880;
  const height = 520;
  const rgba = blank(width, height);
  drawText(rgba, width, 16, 12, `phase bins P=${period}`, [30, 30, 30]);
  const rows = [...rho, ...baselines.filter((row) => row.signal !== "random")];
  let yMin = 0;
  let yMax = 0;
  for (const row of rows) {
    for (const bin of row.bins) {
      yMin = Math.min(yMin, bin.lo);
      yMax = Math.max(yMax, bin.hi);
    }
  }
  const yOf = axisY(height, yMin, yMax, 72);
  const xOf = (bin: number) => 70 + ((bin + 0.5) / PHASE_BINS) * 760;
  line(rgba, width, 60, yOf(0), 850, yOf(0), [170, 170, 170]);
  line(rgba, width, xOf(3.5), 64, xOf(3.5), height - 48, [220, 220, 220]);
  rows.forEach((row, index) => {
    const rgb = row.signal === "rho" ? WINDOW_COLOR[row.window as 25 | 50 | 100] : SIGNAL_COLOR[row.signal];
    const name = row.signal === "rho" ? String(row.window) : row.signal.slice(0, 4);
    fillRect(rgba, width, 16 + index * 70, 36, 10, 8, rgb);
    drawText(rgba, width, 30 + index * 70, 36, name, [30, 30, 30]);
    for (let i = 1; i < row.bins.length; i++) {
      line(rgba, width, xOf(i - 1), yOf(row.bins[i - 1]!.mean), xOf(i), yOf(row.bins[i]!.mean), rgb);
    }
    row.bins.forEach((bin, i) => fillRect(rgba, width, xOf(i) - 2, yOf(bin.mean) - 2, 4, 4, rgb));
  });
  writeFileSync(`${OUT}/phase-by-window.png`, writePng(width, height, rgba));
}

function axisY(height: number, yMin: number, yMax: number, top = 56) {
  const bottom = height - 48;
  const pad = Math.max(1e-4, (yMax - yMin) * 0.12);
  const lo = yMin - pad;
  const hi = yMax + pad;
  return (value: number) => bottom - ((value - lo) / (hi - lo || 1)) * (bottom - top);
}

function plotSeries(
  rgba: Uint8Array,
  width: number,
  height: number,
  xs: number[],
  series: { name: string; ys: number[]; rgb: RGB }[],
  xlabel: string,
) {
  series.forEach((item, i) => {
    fillRect(rgba, width, 16 + i * 80, 36, 12, 8, item.rgb);
    drawText(rgba, width, 32 + i * 80, 36, item.name, [30, 30, 30]);
  });
  const yOf = (() => {
    let yMin = 0;
    let yMax = 0;
    for (const item of series) {
      for (const y of item.ys) {
        yMin = Math.min(yMin, y);
        yMax = Math.max(yMax, y);
      }
    }
    return axisY(height, yMin, yMax);
  })();
  const xMax = xs[xs.length - 1] || 1;
  const xOf = (x: number) => 64 + (x / xMax) * (width - 96);
  line(rgba, width, 64, yOf(0), width - 24, yOf(0), [210, 210, 210]);
  for (const item of series) {
    for (let i = 1; i < xs.length; i++) {
      line(rgba, width, xOf(xs[i - 1]!), yOf(item.ys[i - 1]!), xOf(xs[i]!), yOf(item.ys[i]!), item.rgb);
    }
  }
  drawText(rgba, width, 64, height - 24, xlabel, [30, 30, 30]);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
