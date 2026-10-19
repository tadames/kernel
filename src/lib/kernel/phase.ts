/**
 * Phase-profile calls. The rules are the preregistration in JOURNAL.md.
 * A CI that includes zero does not locate a peak and does not confirm a sign.
 */
import { CYCLE_TAU } from "./cycle.ts";
import { phasePrefix } from "./period.ts";
import { mulberry32 } from "./presets.ts";
import type { Ends } from "./noise.ts";
import { bootstrapMeanCI, type Interval } from "./stats.ts";

export const PHASE_BINS = 8;

/** Dose whose half-contrast already cleared. The offset ladder is scored here. */
export const CONTROL_DOSE = 0.05;

/** Smallest dose the half-contrast instrument confirmed. Sensitivity only. */
export const THRESHOLD_DOSE = 0.0085;

/** Forced relearning bout. The drop is scored after the first 20 steps. */
export const BOUT_STEPS = 80;
export const DROP_STEP = 20;

/**
 * Decay checkpoints in steps. Quarters of the historical period 172,
 * then one and two periods, then the away endpoint. Locked before the run.
 */
export const PROGRESS_TIMES = [0, 43, 86, 129, 172, 258, 344, 400] as const;

/** Second rate: weight half-life is twice the locked adaptation time. */
export const SLOW_HALF_FACTOR = 2;

export function slowLambda(tau = CYCLE_TAU) {
  return 1 - Math.exp(-Math.LN2 / (SLOW_HALF_FACTOR * tau));
}

/** Wrap a difference into (−period/2, period/2]. */
export function wrapSigned(delta: number, period: number) {
  if (!(period > 0)) return 0;
  let x = delta % period;
  if (x <= -period / 2) x += period;
  else if (x > period / 2) x -= period;
  return x;
}

export function wrapUnit(value: number, period: number) {
  if (!(period > 0)) return 0;
  const x = value % period;
  return x < 0 ? x + period : x;
}

/** Four planted onsets: 0 and the three quarter-period shifts. */
export function plantedOffsets(period: number) {
  const q = Math.round(period / 4);
  return [0, q, 2 * q, 3 * q];
}

/** Angle of the fundamental peak for a 50% square whose on-half starts at `offset`. */
export function peakAngle(offset: number, period: number) {
  const peak = offset + period / 4;
  return (2 * Math.PI * peak) / period;
}

export function project(c: number, s: number, phi: number) {
  return c * Math.cos(phi) + s * Math.sin(phi);
}

/** Mean of the series in each phase bin. Complete periods only. */
export function phaseBinMeans(series: ArrayLike<number>, period: number, bins = PHASE_BINS) {
  const n = phasePrefix(series.length, period);
  const sum = new Array<number>(bins).fill(0);
  const count = new Array<number>(bins).fill(0);
  if (n < period) return sum;
  for (let t = 0; t < n; t++) {
    const b = Math.min(bins - 1, Math.floor(((t % period) * bins) / period));
    sum[b] += series[t]!;
    count[b] += 1;
  }
  return sum.map((value, i) => (count[i]! > 0 ? value / count[i]! : 0));
}

/** First Fourier coefficients of the mean-centered series, complete periods only. */
export function fundamental(series: ArrayLike<number>, period: number) {
  const n = phasePrefix(series.length, period);
  if (n < period) return { c: 0, s: 0 };
  let mean = 0;
  for (let t = 0; t < n; t++) mean += series[t]!;
  mean /= n;
  const w = (2 * Math.PI) / period;
  let c = 0;
  let s = 0;
  for (let t = 0; t < n; t++) {
    const x = series[t]! - mean;
    c += x * Math.cos(w * t);
    s += x * Math.sin(w * t);
  }
  return { c: c / n, s: s / n };
}

/**
 * Step of the fundamental's maximum, in [0, period).
 * A zero vector has no peak; the onset is then undefined and reported as 0
 * with amplitude 0, which the location call treats as unresolved.
 */
export function peakStep(c: number, s: number, period: number) {
  if (c * c + s * s <= 0) return 0;
  const angle = Math.atan2(s, c);
  let step = (angle * period) / (2 * Math.PI);
  if (step < 0) step += period;
  return step;
}

/** Start of a 50% high half whose center is the fundamental peak. */
export function onsetOf(c: number, s: number, period: number) {
  if (c * c + s * s <= 0) return 0;
  return wrapUnit(peakStep(c, s, period) - period / 4, period);
}

export function signedOnset(c: number, s: number, period: number) {
  return wrapSigned(onsetOf(c, s, period), period);
}

export function meanVector(rows: readonly { c: number; s: number }[]) {
  let c = 0;
  let s = 0;
  for (const row of rows) {
    c += row.c;
    s += row.s;
  }
  const n = rows.length || 1;
  return { c: c / n, s: s / n, n: rows.length };
}

export type CircularCI = {
  /** Point estimate in [0, period). */
  mean: number;
  /** Percentiles of the signed deviation from `mean`. `lo` ≤ `hi`. */
  lo: number;
  hi: number;
  n: number;
  width: number;
};

function percentile(sorted: Float64Array, iters: number, alpha: number) {
  const lo = sorted[Math.floor((alpha / 2) * iters)]!;
  const hi = sorted[Math.min(iters - 1, Math.ceil((1 - alpha / 2) * iters) - 1)]!;
  return { lo, hi };
}

/** Bootstrap the onset of the mean vector. Deviations are wrapped around the point. */
export function bootstrapOnset(
  rows: readonly { c: number; s: number }[],
  period: number,
  iters = 2000,
  seed = 1,
): CircularCI {
  const n = rows.length;
  const point = meanVector(rows);
  const mean = onsetOf(point.c, point.s, period);
  if (n === 0) return { mean, lo: 0, hi: 0, n: 0, width: 0 };
  if (n === 1) return { mean, lo: 0, hi: 0, n: 1, width: 0 };
  const rand = mulberry32(seed >>> 0);
  const devs = new Float64Array(iters);
  for (let b = 0; b < iters; b++) {
    let c = 0;
    let s = 0;
    for (let i = 0; i < n; i++) {
      const row = rows[(rand() * n) | 0]!;
      c += row.c;
      s += row.s;
    }
    devs[b] = wrapSigned(onsetOf(c / n, s / n, period) - mean, period);
  }
  devs.sort();
  const ends = percentile(devs, iters, 0.05);
  return { mean, lo: ends.lo, hi: ends.hi, n, width: ends.hi - ends.lo };
}

export type LagDiff = {
  /** Slow phase fraction minus primary phase fraction, wrapped to (−1/2, 1/2]. */
  phase: Interval;
  /** Slow signed onset minus primary signed onset, in steps. */
  steps: Interval;
};

/**
 * Difference of two independent onsets. Each replicate redraws both arms.
 * Phase fractions use the signed onset, so a peak just before 0 is a small
 * negative lag rather than a lag of almost one period.
 */
export function bootstrapLagDiff(
  primary: readonly { c: number; s: number }[],
  slow: readonly { c: number; s: number }[],
  periodP: number,
  periodS: number,
  iters = 2000,
  seed = 1,
): LagDiff {
  const pointP = meanVector(primary);
  const pointS = meanVector(slow);
  const stepP = signedOnset(pointP.c, pointP.s, periodP);
  const stepS = signedOnset(pointS.c, pointS.s, periodS);
  const phasePoint = wrapSigned(stepS / periodS - stepP / periodP, 1);
  const stepPoint = stepS - stepP;
  const nP = primary.length;
  const nS = slow.length;
  if (nP < 2 || nS < 2) {
    const thin = (mean: number): Interval => ({ mean, lo: mean, hi: mean, n: Math.min(nP, nS) });
    return { phase: thin(phasePoint), steps: thin(stepPoint) };
  }
  const rand = mulberry32(seed >>> 0);
  const phases = new Float64Array(iters);
  const steps = new Float64Array(iters);
  for (let b = 0; b < iters; b++) {
    let cp = 0;
    let sp = 0;
    for (let i = 0; i < nP; i++) {
      const row = primary[(rand() * nP) | 0]!;
      cp += row.c;
      sp += row.s;
    }
    let cs = 0;
    let ss = 0;
    for (let i = 0; i < nS; i++) {
      const row = slow[(rand() * nS) | 0]!;
      cs += row.c;
      ss += row.s;
    }
    const lp = signedOnset(cp / nP, sp / nP, periodP);
    const ls = signedOnset(cs / nS, ss / nS, periodS);
    phases[b] = wrapSigned(ls / periodS - lp / periodP, 1);
    steps[b] = ls - lp;
  }
  phases.sort();
  steps.sort();
  const phaseEnds = percentile(phases, iters, 0.05);
  const stepEnds = percentile(steps, iters, 0.05);
  return {
    phase: { mean: phasePoint, lo: phaseEnds.lo, hi: phaseEnds.hi, n: nP },
    steps: { mean: stepPoint, lo: stepEnds.lo, hi: stepEnds.hi, n: nP },
  };
}

/**
 * Recovered onset minus the planted offset, wrapped to (−period/2, period/2].
 * The interval is the percentile CI of that wrapped lag.
 */
export function bootstrapPlantedLag(
  rows: readonly { c: number; s: number }[],
  period: number,
  planted: number,
  iters = 2000,
  seed = 1,
): Interval {
  const n = rows.length;
  const point = meanVector(rows);
  const mean = wrapSigned(onsetOf(point.c, point.s, period) - planted, period);
  if (n < 2) return { mean, lo: mean, hi: mean, n };
  const rand = mulberry32(seed >>> 0);
  const values = new Float64Array(iters);
  for (let b = 0; b < iters; b++) {
    let c = 0;
    let s = 0;
    for (let i = 0; i < n; i++) {
      const row = rows[(rand() * n) | 0]!;
      c += row.c;
      s += row.s;
    }
    values[b] = wrapSigned(onsetOf(c / n, s / n, period) - planted, period);
  }
  values.sort();
  const ends = percentile(values, iters, 0.05);
  return { mean, lo: ends.lo, hi: ends.hi, n };
}

/** Signed onset of the mean vector, with a percentile CI of the bootstrap signed onsets. */
export function bootstrapSignedOnset(
  rows: readonly { c: number; s: number }[],
  period: number,
  iters = 2000,
  seed = 1,
): Interval {
  const n = rows.length;
  const point = meanVector(rows);
  const mean = signedOnset(point.c, point.s, period);
  if (n < 2) return { mean, lo: mean, hi: mean, n };
  const rand = mulberry32(seed >>> 0);
  const values = new Float64Array(iters);
  for (let b = 0; b < iters; b++) {
    let c = 0;
    let s = 0;
    for (let i = 0; i < n; i++) {
      const row = rows[(rand() * n) | 0]!;
      c += row.c;
      s += row.s;
    }
    values[b] = signedOnset(c / n, s / n, period);
  }
  values.sort();
  const ends = percentile(values, iters, 0.05);
  return { mean, lo: ends.lo, hi: ends.hi, n };
}

/** Linear difference of two independent signed onsets. Used for the response-lag excess. */
export function bootstrapStepDiff(
  left: readonly { c: number; s: number }[],
  right: readonly { c: number; s: number }[],
  periodL: number,
  periodR: number,
  iters = 2000,
  seed = 1,
): Interval {
  return bootstrapLagDiff(right, left, periodR, periodL, iters, seed).steps;
}

export type OffsetCall = "tracked" | "delayed" | "early" | "flipped" | "missed" | "distorted";

/**
 * One planted offset. `lag` is recovered onset minus planted, wrapped,
 * so a positive lag means the occupancy peak is later than the plant.
 */
export function offsetCall(proj: Ends, lag: Ends, quarter: number): OffsetCall {
  if (proj.hi < 0) return "flipped";
  if (!(proj.lo > 0)) return "missed";
  if (lag.hi < -quarter || lag.lo > quarter) return "distorted";
  if (lag.lo > 0) return "delayed";
  if (lag.hi < 0) return "early";
  return "tracked";
}

export function phaseInstrumentCall(calls: readonly OffsetCall[]): "confirmed" | "refuted" | "inconclusive" {
  if (calls.length === 0) return "inconclusive";
  const seen = (call: OffsetCall) => call === "tracked" || call === "delayed" || call === "early";
  if (calls.every(seen)) return "confirmed";
  if (calls.every((call) => call === "flipped")) return "refuted";
  return "inconclusive";
}

export type SignCall = "negative" | "positive" | "null";

/** First-half minus second-half. Negative repeats the previous entry's sign. */
export function signCall(contrast: Ends): SignCall {
  if (contrast.hi < 0) return "negative";
  if (contrast.lo > 0) return "positive";
  return "null";
}

export type LocationCall = "half-cycle" | "delayed" | "prompt" | "other" | "unresolved";

function arcWithin(mean: number, lo: number, hi: number, center: number, radius: number, period: number) {
  if (hi - lo >= period / 2) return false;
  const d1 = Math.abs(wrapSigned(mean + lo - center, period));
  const d2 = Math.abs(wrapSigned(mean + hi - center, period));
  return d1 <= radius && d2 <= radius;
}

/**
 * Where the high half starts. `lo` and `hi` are signed deviations from `mean`.
 * A zero vector is unresolved: an onset of 0 there is not a peak.
 */
export function locationCall(mean: number, lo: number, hi: number, period: number, amplitude: number): LocationCall {
  if (!(amplitude > 1e-12)) return "unresolved";
  if (!(hi - lo < period / 2)) return "unresolved";
  if (arcWithin(mean, lo, hi, period / 2, period / 8, period)) return "half-cycle";
  if (arcWithin(mean, lo, hi, period / 2, period / 4 - 1e-9, period)) return "delayed";
  if (arcWithin(mean, lo, hi, 0, period / 8, period)) return "prompt";
  return "other";
}

export type ScaleCall = "timescale" | "fixed-lag" | "indistinguishable" | "incompatible" | "unavailable";

export function scaleCall(input: { available: boolean; phaseDiff: Ends; stepDiff: Ends }): ScaleCall {
  if (!input.available) return "unavailable";
  const phaseZero = input.phaseDiff.lo <= 0 && input.phaseDiff.hi >= 0;
  const stepZero = input.stepDiff.lo <= 0 && input.stepDiff.hi >= 0;
  if (phaseZero && !stepZero && input.stepDiff.lo > 0) return "timescale";
  if (stepZero && !phaseZero) return "fixed-lag";
  if (phaseZero && stepZero) return "indistinguishable";
  return "incompatible";
}

export type HunchCall = "intermediate" | "grows" | "falls" | "flat" | "other";

/**
 * Progress across decay checkpoints. `midVsStart[i]` is checkpoint i+1 minus
 * the first. `midVsEnd[i]` is that same checkpoint minus the last.
 * Intermediate means some middle checkpoint clears both ends.
 */
export function hunchCall(input: { endVsStart: Ends; midVsStart: Ends[]; midVsEnd: Ends[] }): HunchCall {
  const n = Math.min(input.midVsStart.length, input.midVsEnd.length);
  let intermediate = false;
  let noneAboveEnd = true;
  let noneAboveStart = true;
  for (let i = 0; i < n; i++) {
    const vsStart = input.midVsStart[i]!;
    const vsEnd = input.midVsEnd[i]!;
    if (vsStart.lo > 0 && vsEnd.lo > 0) intermediate = true;
    if (vsEnd.lo > 0) noneAboveEnd = false;
    if (vsStart.lo > 0) noneAboveStart = false;
  }
  if (intermediate) return "intermediate";
  if (input.endVsStart.lo > 0 && noneAboveEnd) return "grows";
  if (input.endVsStart.hi < 0 && noneAboveStart) return "falls";
  if (input.endVsStart.lo <= 0 && input.endVsStart.hi >= 0 && noneAboveEnd && noneAboveStart) return "flat";
  return "other";
}

export type BoutCall = "silent" | "lagged" | "immediate" | "mid";

/** When, inside an 80-step relearning bout, rectified progress peaks. */
export function boutCall(nSeeds: number, nPositive: number, peakAt: Ends | null): BoutCall {
  if (!(nPositive * 2 > nSeeds) || peakAt == null) return "silent";
  if (peakAt.lo > 20) return "lagged";
  if (peakAt.hi < 10) return "immediate";
  return "mid";
}

export type MatchCall = "matches" | "differs" | "not-applicable";

export function matchCall(applicable: boolean, diff: Ends | null): MatchCall {
  if (!applicable || diff == null) return "not-applicable";
  if (diff.lo <= 0 && diff.hi >= 0) return "matches";
  return "differs";
}

export type ExcessCall = "beyond-response" | "same-as-response" | "sooner" | "uncertified";

export function excessCall(certified: boolean, diff: Ends | null): ExcessCall {
  if (!certified || diff == null) return "uncertified";
  if (diff.lo > 0) return "beyond-response";
  if (diff.hi < 0) return "sooner";
  return "same-as-response";
}

export type ProfileSummary =
  | "no-period"
  | "instrument-blind"
  | "confounded"
  | "sign-reversed"
  | "sign-null"
  | "shared"
  | "replicated-half"
  | "replicated-delayed"
  | "replicated-prompt"
  | "replicated-other"
  | "heldout-half"
  | "heldout-delayed"
  | "heldout-prompt"
  | "heldout-other";

export function profileSummary(input: {
  periodRan: boolean;
  instrument: "confirmed" | "refuted" | "inconclusive";
  randomSign: SignCall;
  rhoSign: SignCall;
  rhoHeldOut: boolean;
  rhoLocation: LocationCall;
  otherExists: boolean;
}): ProfileSummary {
  if (!input.periodRan) return "no-period";
  if (input.instrument !== "confirmed") return "instrument-blind";
  if (input.randomSign !== "null") return "confounded";
  const signExists = input.rhoSign === "negative";
  const exists = signExists || input.rhoHeldOut;
  if (!exists) return input.rhoSign === "positive" ? "sign-reversed" : "sign-null";
  if (input.otherExists) return "shared";
  if (signExists) {
    if (input.rhoLocation === "half-cycle") return "replicated-half";
    if (input.rhoLocation === "delayed") return "replicated-delayed";
    if (input.rhoLocation === "prompt") return "replicated-prompt";
    return "replicated-other";
  }
  if (input.rhoLocation === "half-cycle") return "heldout-half";
  if (input.rhoLocation === "delayed") return "heldout-delayed";
  if (input.rhoLocation === "prompt") return "heldout-prompt";
  return "heldout-other";
}

/** Held-out projection onto a direction frozen on the other half of the seeds. */
export function heldOutProjection(
  discovery: readonly { c: number; s: number }[],
  confirmation: readonly { c: number; s: number }[],
  salt: number,
): Interval & { phi: number } {
  const dir = meanVector(discovery);
  const phi = Math.atan2(dir.s, dir.c);
  const values = confirmation.map((row) => project(row.c, row.s, phi));
  return { ...bootstrapMeanCI(values, 2000, 0.05, salt), phi };
}
