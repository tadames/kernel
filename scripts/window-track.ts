/**
 * Does rho's late return track the progress window once the bout and the
 * episode can see it? Not part of CI.
 *
 *   npm run window-track
 *
 * Fresh seeds. Windows 25, 35, 50, 70, 100. Bout 400. Episode 27 cycles.
 * Writes bench/window-track/window.json and the figures.
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
  CONTROL_DOSE,
  PHASE_BINS,
  PROGRESS_TIMES,
  TRACK_BOUT_STEPS,
  TRACK_WINDOWS,
  bootstrapOnset,
  bootstrapOnsetDiff,
  bootstrapPlantedLag,
  chainPrediction,
  contrastTrack,
  gridSpecificity,
  latePattern,
  locationCall,
  meanVector,
  moveCall,
  offsetCall,
  peakAngle,
  peakMajority,
  phaseInstrumentCall,
  project,
  signCall,
  specificityCall,
  squareHalfContrast,
  templateStep,
  trackEpisodeSteps,
  trackReason,
  usablePeak,
  type ContrastTrack,
  type LatePattern,
  type LocationCall,
  type MoveCall,
  type OffsetCall,
  type ScalePrediction,
  type SignCall,
  type TemplateStep,
} from "../src/lib/kernel/phase.ts";
import { mulberry32 } from "../src/lib/kernel/presets.ts";
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
const OUT = arg("out", "bench/window-track");
const HARNESS = SEEDS === 200;
const PREVIOUS = "bench/phase-profile/profile.json";
const EXPLORERS = CURIOSITY_SIGNALS;
const LAST = PROGRESS_TIMES.length - 1;
const PROGRESS_SALT = 16101;
const POSITIVE_SALT = 16201;
const OCC_SALT = 16301;
type RGB = [number, number, number];
const WINDOW_COLOR: RGB[] = [
  [36, 104, 196],
  [20, 130, 140],
  [140, 60, 180],
  [196, 112, 32],
  [186, 42, 58],
];
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
  const index = TRACK_WINDOWS.indexOf(window as (typeof TRACK_WINDOWS)[number]);
  if (index < 0) throw new Error(`window ${window} is not on the track grid`);
  return index;
}

function windowColor(window: number): RGB {
  return WINDOW_COLOR[windowIndex(window)] ?? [0, 0, 0];
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

function saltsFor(window: number, signal: CuriositySignal) {
  const w = windowIndex(window);
  const e = explorerIndex(signal);
  return {
    phase: 17000 + 100 * w + e,
    half: 17100 + 100 * w + e,
    east: 17200 + 100 * w + e,
    bin: 17300 + 100 * w + 10 * e,
    onset: 17400 + 100 * w + e,
    held: 17500 + 100 * w + e,
  };
}

function occupancyRow(
  forget: EpisodeResult[],
  held: EpisodeResult[],
  period: number,
  signal: CuriositySignal,
  window: number,
): OccRow {
  const salts = saltsFor(window, signal);
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
    const projSalt = 17700 + 10 * windowIndex(window) + offsetIndex;
    const lagSalt = 17800 + 10 * windowIndex(window) + offsetIndex;
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
    if (decided.period !== previous.primaryCurve.period || decided.decision !== "run") {
      throw new Error(`harness period ${decided.period} decision ${decided.decision}`);
    }
  }
  drawCurve(ordered);

  const report: Record<string, unknown> = {
    date: new Date().toISOString(),
    tau: CYCLE_TAU,
    lambda: CYCLE_LAMBDA,
    seeds,
    windows: TRACK_WINDOWS,
    boutSteps: TRACK_BOUT_STEPS,
    learnSteps: LEARN_STEPS,
    awaySteps: AWAY_STEPS,
    controlDose: CONTROL_DOSE,
    temperature: PRIMARY_TEMPERATURE,
    progressSalt: PROGRESS_SALT,
    positiveSalt: POSITIVE_SALT,
    occupancySalt: OCC_SALT,
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
      historicalSteps: decided.steps,
    },
  };

  if (decided.decision !== "run" || decided.period == null) {
    report.summary = "no-period";
    report.reason = "no-period";
    writeFileSync(`${OUT}/window.json`, `${JSON.stringify(report, null, 2)}\n`);
    console.error(`stopped at ${decided.decision}`);
    return;
  }
  const period = decided.period;
  const steps = trackEpisodeSteps(period);
  if (steps == null) throw new Error(`period ${period} does not fit a track episode`);
  report.episodeSteps = steps;
  report.cycles = steps / period;
  const offsets = [0, Math.round(period / 4), 2 * Math.round(period / 4), 3 * Math.round(period / 4)];
  console.error(`episode ${steps} steps, ${steps / period} cycles, period ${period}`);

  const progressJobs: CycleJob[] = [];
  for (const window of TRACK_WINDOWS) {
    for (const seed of seeds) {
      progressJobs.push({
        kind: "progress",
        id: progressJobs.length,
        seed,
        lambda: CYCLE_LAMBDA,
        progressWindow: window,
        boutSteps: TRACK_BOUT_STEPS,
        salt: PROGRESS_SALT,
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
  drawPeaks(progress.publicRows);
  drawTrace(progress.traces);

  const episodeJobs: CycleJob[] = [];
  const queue = (partial: Omit<Extract<CycleJob, { kind: "episode" }>, "kind" | "id">) => {
    episodeJobs.push({ kind: "episode", id: episodeJobs.length, ...partial });
  };
  for (const window of TRACK_WINDOWS) {
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
        salt: POSITIVE_SALT,
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
          salt: POSITIVE_SALT,
          arm: "periodic",
          tag: "positive",
          progressWindow: window,
        });
      }
    }
  }
  for (const signal of EXPLORERS) {
    for (const window of TRACK_WINDOWS) {
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
            salt: OCC_SALT,
            arm,
            tag: "occ",
            progressWindow: window,
          });
        }
      }
    }
  }
  console.error(`episodes ${episodeJobs.length}, ${workers} workers`);
  const tEp = Date.now();
  const episodeRows = (await runPool(
    episodeJobs,
    new URL("./cycle-worker.ts", import.meta.url),
    workers,
  )) as EpisodeResult[];
  console.error(`episodes finished in ${((Date.now() - tEp) / 1000).toFixed(1)}s`);
  assertClean(episodeRows);

  const positive = TRACK_WINDOWS.map((window) => {
    const rows = positiveTable(
      episodeRows.filter((row) => row.tag === "positive"),
      window,
      offsets,
    );
    return { window, rows, instrument: phaseInstrumentCall(rows.map((row) => row.offsetCall)) };
  });
  const instruments = positive.map((row) => row.instrument);
  const instrument = instruments.every((call) => call === "confirmed")
    ? "confirmed"
    : instruments.every((call) => call === "refuted")
      ? "refuted"
      : "inconclusive";

  const occupancy = EXPLORERS.flatMap((signal) =>
    TRACK_WINDOWS.map((window) => {
      const mine = episodeRows.filter(
        (row) => row.tag === "occ" && row.signal === signal && row.progressWindow === window,
      );
      return occupancyRow(
        mine.filter((row) => row.arm === "forget"),
        mine.filter((row) => row.arm === "held"),
        period,
        signal,
        window,
      );
    }),
  );
  const rhoOcc = occupancy.filter((row) => row.signal === "rho");
  const baselines = occupancy.filter((row) => row.signal !== "rho");

  const boutDiffs = adjacent(TRACK_WINDOWS).map(([shorter, longer], index) => {
    const diff = peakDiff(progress.rows.get(longer) ?? [], progress.rows.get(shorter) ?? [], 17620 + index);
    return { shorter, longer, ...diff, move: moveCall(diff.ci) };
  });
  const boutCensored = progress.publicRows.some((row) => row.peakCensored) || boutDiffs.some((row) => row.censored);
  const boutPrediction = chainPrediction(
    boutDiffs.map((row) => row.move),
    boutCensored,
  );

  const onsetDiffs = adjacent(TRACK_WINDOWS).map(([shorter, longer], index) => {
    const left = rhoOcc.find((row) => row.window === shorter)!;
    const right = rhoOcc.find((row) => row.window === longer)!;
    const scorable = left.location !== "unresolved" && right.location !== "unresolved";
    const ci = bootstrapOnsetDiff(right.vectors, left.vectors, period, 2000, 17600 + index);
    return { shorter, longer, ...ci, scorable, move: scorable ? moveCall(ci) : ("same" as MoveCall) };
  });
  const onsetCensored = instrument !== "confirmed" || onsetDiffs.some((row) => !row.scorable);
  const onsetPrediction = chainPrediction(
    onsetDiffs.map((row) => (row.scorable ? row.move : "same")),
    onsetCensored,
  );

  const contrastDiffs = adjacent(TRACK_WINDOWS).map(([shorter, longer], index) => {
    const left = rhoOcc.find((row) => row.window === shorter)!;
    const right = rhoOcc.find((row) => row.window === longer)!;
    if (left.vectors.some((row, i) => row.seed !== right.vectors[i]?.seed)) {
      throw new Error(`contrast seeds ${shorter} vs ${longer}`);
    }
    const peakS = progress.publicRows.find((row) => row.window === shorter)!.peak.mean;
    const peakL = progress.publicRows.find((row) => row.window === longer)!.peak.mean;
    const templateDelta = squareHalfContrast(peakL, period) - squareHalfContrast(peakS, period);
    const ci = pairedDifference(
      right.vectors.map((row) => row.phase),
      left.vectors.map((row) => row.phase),
      17610 + index,
    );
    const step: TemplateStep = templateStep(templateDelta, ci);
    return { shorter, longer, ...ci, templateDelta, step };
  });
  const contrastPrediction: ContrastTrack = contrastTrack(contrastDiffs.map((row) => row.step));

  const shippedRandom = baselines.find((row) => row.signal === "random" && row.window === 50)!;
  const shippedOthers = baselines.filter((row) => row.signal !== "random" && row.window === 50);
  const shipped = specificityCall({
    randomSign: shippedRandom.sign,
    otherExists: shippedOthers.some((row) => row.exists),
  });
  const randomNonNull = baselines.filter((row) => row.signal === "random" && row.sign !== "null").length;
  const lateCounts = (["count", "surprise", "rnd"] as const).map(
    (signal) => baselines.filter((row) => row.signal === signal && row.late === "late").length,
  );
  const specificity = gridSpecificity({ shipped, randomNonNull, lateCounts });
  const decidedTrack = trackReason({
    curveRun: true,
    instrument,
    bout: boutPrediction,
    onset: onsetPrediction,
    contrast: contrastPrediction,
    specificity,
  });

  const ratios = adjacent(TRACK_WINDOWS).map(([shorter, longer], index) => ({
    shorter,
    longer,
    ...ratioOf(progress.rows.get(longer) ?? [], progress.rows.get(shorter) ?? [], 17650 + index),
  }));

  report.positive = positive.map((row) => ({
    window: row.window,
    instrument: row.instrument,
    offsets: row.rows,
  }));
  report.instrument = instrument;
  report.occupancy = rhoOcc.map(publicOcc);
  report.baselines = baselines.map(publicOcc);
  report.boutDiffs = boutDiffs.map((row) => ({
    shorter: row.shorter,
    longer: row.longer,
    ...row.ci,
    nPaired: row.nPaired,
    censored: row.censored,
    move: row.move,
  }));
  report.onsetDiffs = onsetDiffs.map((row) => ({
    shorter: row.shorter,
    longer: row.longer,
    mean: row.mean,
    lo: row.lo,
    hi: row.hi,
    n: row.n,
    scorable: row.scorable,
    move: row.scorable ? row.move : "censored",
  }));
  report.contrastDiffs = contrastDiffs;
  report.ratios = ratios;
  report.predictions = {
    bout: boutPrediction,
    onset: onsetPrediction,
    contrast: contrastPrediction,
  };
  report.specificity = specificity;
  report.specificityDetail = { shipped, randomNonNull, lateCounts };
  report.summary = decidedTrack.verdict;
  report.reason = decidedTrack.reason;
  writeFileSync(`${OUT}/window.json`, `${JSON.stringify(report, null, 2)}\n`);
  drawPositive(positive);
  drawContrast(rhoOcc, baselines.filter((row) => row.window === 50));
  drawBaselineContrast(baselines);
  drawOnset(rhoOcc, progress.publicRows);
  drawPhase(rhoOcc, baselines.filter((row) => row.window === 50), period);
  console.error(
    `instrument ${instrument} bout ${boutPrediction} onset ${onsetPrediction} contrast ${contrastPrediction}`,
  );
  console.error(`summary ${decidedTrack.verdict} reason ${decidedTrack.reason} specificity ${specificity}`);
  for (const row of rhoOcc) {
    console.error(
      `rho W${row.window} ${row.sign} phase ${fmt(row.phase)} onset ${row.onset.mean.toFixed(2)} width ${row.onset.width.toFixed(1)} ${row.location} late ${row.late}`,
    );
  }
  for (const row of progress.publicRows) {
    console.error(
      `peak W${row.window} ${fmt(row.peak)} usable ${row.nUsable}/${row.n} censored ${row.peakCensored} peak80 ${fmt(row.peak80)}`,
    );
  }
  for (const diff of boutDiffs) console.error(`bout ${diff.shorter}->${diff.longer} ${fmt(diff.ci)} ${diff.move} censored ${diff.censored}`);
  for (const diff of onsetDiffs) {
    console.error(`onset ${diff.shorter}->${diff.longer} ${fmt(diff)} scorable ${diff.scorable}`);
  }
  for (const diff of contrastDiffs) {
    console.error(
      `contrast ${diff.shorter}->${diff.longer} ${fmt(diff)} template ${diff.templateDelta.toFixed(3)} ${diff.step}`,
    );
  }
  for (const row of positive) {
    console.error(`control W${row.window} ${row.instrument}`);
    for (const item of row.rows) console.error(`  offset ${item.offset} ${item.offsetCall} lag ${fmt(item.lag)}`);
  }
  console.error(`total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

function adjacent(windows: readonly number[]) {
  const pairs: [number, number][] = [];
  for (let i = 1; i < windows.length; i++) pairs.push([windows[i - 1]!, windows[i]!]);
  return pairs;
}

function progressTable(rows: ProgressResult[]) {
  const grouped = new Map<number, ProgressResult[]>();
  for (const row of rows) {
    const list = grouped.get(row.progressWindow) ?? [];
    list.push(row);
    grouped.set(row.progressWindow, list);
  }
  const publicRows = [];
  const traces: { window: number; mean: number[] }[] = [];
  for (const window of TRACK_WINDOWS) {
    const side = oneWindow(grouped.get(window) ?? [], window);
    publicRows.push(side.pub);
    traces.push({ window, mean: side.trace });
  }
  return { rows: grouped, publicRows, traces };
}

function oneWindow(rows: ProgressResult[], window: number) {
  const ordered = rows.slice().sort((a, b) => a.seed - b.seed);
  const n = ordered.length;
  const index = windowIndex(window);
  const peaks = ordered.map((row) => row.peakAt[LAST] ?? null);
  const usable = peaks.filter((value): value is number => usablePeak(value, TRACK_BOUT_STEPS));
  const peak = usable.length
    ? meanCI(usable, 2000, 0.05, 17630 + index)
    : { mean: 0, lo: 0, hi: 0, n: 0 };
  const peak80Values = ordered.map((row) => row.peakAt80[LAST]).filter((value): value is number => value != null);
  const peak80 = peak80Values.length
    ? meanCI(peak80Values, 2000, 0.05, 17640 + index)
    : { mean: 0, lo: 0, hi: 0, n: 0 };
  const trace = ordered[0] ? ordered[0].trace.map((_, step) => meanOf(ordered.map((row) => row.trace[step]!))) : [];
  const pub = {
    window,
    n,
    nUsable: usable.length,
    nRightCensored: peaks.filter((value) => value === TRACK_BOUT_STEPS - 1).length,
    nSilent: peaks.filter((value) => value == null).length,
    peakCensored: !peakMajority(n, usable.length),
    peak,
    peak80,
  };
  return { pub, trace };
}

function peakDiff(longer: ProgressResult[], shorter: ProgressResult[], salt: number) {
  const a = longer.slice().sort((x, y) => x.seed - y.seed);
  const b = shorter.slice().sort((x, y) => x.seed - y.seed);
  if (a.length !== b.length || a.some((row, i) => row.seed !== b[i]!.seed)) throw new Error("peak diff is not paired");
  const diffs: number[] = [];
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!.peakAt[LAST] ?? null;
    const right = b[i]!.peakAt[LAST] ?? null;
    if (!usablePeak(left, TRACK_BOUT_STEPS) || !usablePeak(right, TRACK_BOUT_STEPS)) continue;
    diffs.push(left! - right!);
  }
  const censored = !peakMajority(a.length, diffs.length);
  const ci = diffs.length
    ? pairedDifference(diffs, diffs.map(() => 0), salt)
    : { mean: 0, lo: 0, hi: 0, n: 0, excludesZero: false };
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
    if (!usablePeak(left, TRACK_BOUT_STEPS) || !usablePeak(right, TRACK_BOUT_STEPS) || right === 0) continue;
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
  const series = [
    { name: "held", ys: times.map((_, i) => meanOf(rows.map((row) => row.held[i]!))), rgb: [40, 40, 40] as RGB },
    { name: "decay", ys: times.map((_, i) => meanOf(rows.map((row) => row.decay[i]!))), rgb: [140, 60, 180] as RGB },
  ];
  plotSeries(rgba, width, height, times, series, "away steps");
  writeFileSync(`${OUT}/forget-curve.png`, writePng(width, height, rgba));
}

function drawPeaks(rows: ReturnType<typeof oneWindow>["pub"][]) {
  const width = 880;
  const height = 520;
  const rgba = blank(width, height);
  drawText(rgba, width, 16, 12, "progress peak step", [30, 30, 30]);
  let yMin = 0;
  let yMax = 1;
  for (const row of rows) {
    yMin = Math.min(yMin, row.peak.lo, row.peak80.lo);
    yMax = Math.max(yMax, row.peak.hi, row.peak80.hi);
  }
  const yOf = axisY(height, yMin, yMax);
  const xOf = (index: number) => 120 + ((index + 0.5) / rows.length) * 680;
  line(rgba, width, 80, yOf(0), 840, yOf(0), [210, 210, 210]);
  for (let i = 1; i < rows.length; i++) {
    line(rgba, width, xOf(i - 1), yOf(rows[i - 1]!.peak.mean), xOf(i), yOf(rows[i]!.peak.mean), [140, 60, 180]);
  }
  rows.forEach((row, index) => {
    const rgb = windowColor(row.window);
    whisker(rgba, width, xOf(index), row.peak.lo, row.peak.hi, yOf, rgb);
    fillRect(rgba, width, xOf(index) - 4, yOf(row.peak.mean) - 4, 8, 8, rgb);
    fillRect(rgba, width, xOf(index) + 12, yOf(row.peak80.mean) - 3, 6, 6, [80, 80, 80]);
    drawText(rgba, width, xOf(index) - 12, height - 28, String(row.window), [30, 30, 30]);
  });
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
    rgb: windowColor(trace.window),
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
    const rgb = windowColor(group.window);
    fillRect(rgba, width, 16 + g * 90, 36, 12, 8, rgb);
    drawText(rgba, width, 32 + g * 90, 36, String(group.window), [30, 30, 30]);
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
      const x = xOf(row.offset) + (g - 2) * 7;
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
    ...rho.map((row) => ({ label: String(row.window), ci: row.phase, rgb: windowColor(row.window) })),
    ...baselines.map((row) => ({ label: row.signal.slice(0, 4), ci: row.phase, rgb: SIGNAL_COLOR[row.signal] })),
  ];
  drawPoints(rgba, width, height, points);
  writeFileSync(`${OUT}/half-contrast.png`, writePng(width, height, rgba));
}

function drawBaselineContrast(baselines: OccRow[]) {
  const width = 880;
  const height = 520;
  const rgba = blank(width, height);
  drawText(rgba, width, 16, 12, "baseline half contrast", [30, 30, 30]);
  const points = baselines.map((row) => ({
    label: `${row.signal.slice(0, 1)}${row.window}`,
    ci: row.phase,
    rgb: SIGNAL_COLOR[row.signal],
  }));
  drawPoints(rgba, width, height, points);
  writeFileSync(`${OUT}/baseline-contrast.png`, writePng(width, height, rgba));
}

function drawOnset(rho: OccRow[], peaks: { window: number; peak: Interval }[]) {
  const width = 880;
  const height = 520;
  const rgba = blank(width, height);
  drawText(rgba, width, 16, 12, "onset and progress peak", [30, 30, 30]);
  let yMin = 0;
  let yMax = 1;
  for (const row of rho) {
    yMin = Math.min(yMin, row.onset.mean + row.onset.lo);
    yMax = Math.max(yMax, row.onset.mean + row.onset.hi);
  }
  for (const row of peaks) {
    yMin = Math.min(yMin, row.peak.lo);
    yMax = Math.max(yMax, row.peak.hi);
  }
  const yOf = axisY(height, yMin, yMax);
  const xOf = (index: number) => 120 + ((index + 0.5) / rho.length) * 680;
  line(rgba, width, 80, yOf(0), 840, yOf(0), [210, 210, 210]);
  for (let i = 1; i < rho.length; i++) {
    line(rgba, width, xOf(i - 1), yOf(rho[i - 1]!.onset.mean), xOf(i), yOf(rho[i]!.onset.mean), [140, 60, 180]);
    line(rgba, width, xOf(i - 1), yOf(peaks[i - 1]!.peak.mean), xOf(i), yOf(peaks[i]!.peak.mean), [80, 80, 80]);
  }
  rho.forEach((row, index) => {
    const rgb = windowColor(row.window);
    whisker(rgba, width, xOf(index) - 8, row.onset.mean + row.onset.lo, row.onset.mean + row.onset.hi, yOf, rgb);
    fillRect(rgba, width, xOf(index) - 12, yOf(row.onset.mean) - 4, 8, 8, rgb);
    const peak = peaks[index]!.peak;
    whisker(rgba, width, xOf(index) + 8, peak.lo, peak.hi, yOf, [80, 80, 80]);
    fillRect(rgba, width, xOf(index) + 5, yOf(peak.mean) - 3, 6, 6, [80, 80, 80]);
    drawText(rgba, width, xOf(index) - 12, height - 28, String(row.window), [30, 30, 30]);
  });
  drawText(rgba, width, 16, 36, "color onset   gray peak", [30, 30, 30]);
  writeFileSync(`${OUT}/onset-vs-window.png`, writePng(width, height, rgba));
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
    const rgb = row.signal === "rho" ? windowColor(row.window) : SIGNAL_COLOR[row.signal];
    const name = row.signal === "rho" ? String(row.window) : row.signal.slice(0, 4);
    fillRect(rgba, width, 16 + (index % 8) * 100, 36 + Math.floor(index / 8) * 16, 10, 8, rgb);
    drawText(rgba, width, 30 + (index % 8) * 100, 36 + Math.floor(index / 8) * 16, name, [30, 30, 30]);
    for (let i = 1; i < row.bins.length; i++) {
      line(rgba, width, xOf(i - 1), yOf(row.bins[i - 1]!.mean), xOf(i), yOf(row.bins[i]!.mean), rgb);
    }
    row.bins.forEach((bin, i) => fillRect(rgba, width, xOf(i) - 2, yOf(bin.mean) - 2, 4, 4, rgb));
  });
  writeFileSync(`${OUT}/phase-by-window.png`, writePng(width, height, rgba));
}

function drawPoints(
  rgba: Uint8Array,
  width: number,
  height: number,
  points: { label: string; ci: Interval; rgb: RGB }[],
) {
  let yMin = 0;
  let yMax = 0;
  for (const point of points) {
    yMin = Math.min(yMin, point.ci.lo);
    yMax = Math.max(yMax, point.ci.hi);
  }
  const yOf = axisY(height, yMin, yMax);
  line(rgba, width, 70, yOf(0), 850, yOf(0), [170, 170, 170]);
  points.forEach((point, i) => {
    const x = 70 + ((i + 0.5) / Math.max(1, points.length)) * 780;
    whisker(rgba, width, x, point.ci.lo, point.ci.hi, yOf, point.rgb);
    fillRect(rgba, width, x - 3, yOf(point.ci.mean) - 3, 6, 6, point.rgb);
    drawText(rgba, width, x - 14, height - 28, point.label, [30, 30, 30]);
  });
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
