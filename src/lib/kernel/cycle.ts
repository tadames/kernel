/**
 * Calls for the forgetting-cycle study. The rules are the preregistration
 * in JOURNAL.md. A CI that only includes zero is inconclusive.
 */
import type { Call, Ends } from "./noise.ts";
import { greaterCall } from "./noise.ts";

/** Wide-door adaptation time. Locked in the drift entry. */
export const CYCLE_TAU = 53.28471423768756;

/** Weight-decay rate whose half-life is one adaptation time. */
export const CYCLE_LAMBDA = 1 - Math.exp(-Math.LN2 / CYCLE_TAU);

export const LEARN_STEPS = 200;
export const AWAY_STEPS = 400;
export const PROBE_STRIDE = 10;
export const PROBE_SAMPLES = 24;
export const PROBE_SEED = 20261018;

/** Half the learn drop below this is censored. The room was not learned. */
export const MIN_TARGET = 0.01;

/** Shortest half-period. Below this, a crossing of the map cannot fit. */
export const MIN_HALF = 20;

export const MIN_EPISODE = 1600;
export const MAX_EPISODE = 4800;
export const TARGET_CYCLES = 8;
export const MIN_CYCLES = 4;

/** Doses already known to move rho's occupancy at temperature 0.15. */
export const POSITIVE_DOSES = [0.05, 0.15] as const;

/**
 * Planted-wave ladder for the phase-locked instrument.
 * The two middle doses are the ones that moved occupancy. The ends bracket
 * them: below the constant-bonus threshold, and up at the saturating dose.
 */
export const PHASE_DOSES = [0.0085, 0.0169, 0.05, 0.15, 0.5] as const;

export const PRIMARY_TEMPERATURE = 0.15;
export const SHIPPED_TEMPERATURE = 0.45;

export const CURVE_LEARN_SALT = 8001;
export const CURVE_CONSOLIDATE_SALT = 8002;
export const CURVE_FORGET_SALT = 8003;
export const CURVE_INTERFERENCE_SALT = 8004;

export type CurveDecision = "no-learning" | "no-consolidation" | "no-forgetting" | "period-censored" | "run";

export type CycleSummary =
  | "confirmed"
  | "shared"
  | "refuted"
  | "instrument-blind"
  | "confounded"
  | "inconclusive";

/**
 * First away step where decay minus held reaches half the learn drop.
 * A drop below `MIN_TARGET`, or a curve that never gets there, is censored.
 */
export function halfRecovery(
  probe0: number,
  learnEnd: number,
  held: readonly number[],
  decay: readonly number[],
  times: readonly number[],
): number | null {
  const target = 0.5 * (probe0 - learnEnd);
  if (!(target >= MIN_TARGET)) return null;
  const n = Math.min(held.length, decay.length, times.length);
  for (let i = 0; i < n; i++) {
    if (decay[i]! - held[i]! >= target) return times[i]!;
  }
  return null;
}

/** Episode length for a locked half-period. Null when the period does not fit. */
export function episodeLength(half: number): number | null {
  if (!Number.isInteger(half) || half < MIN_HALF || half > AWAY_STEPS) return null;
  const period = 2 * half;
  const steps = Math.min(MAX_EPISODE, Math.max(MIN_EPISODE, TARGET_CYCLES * period));
  if (steps < MIN_CYCLES * period) return null;
  return steps;
}

/**
 * Stop before occupancy unless the net learns, still learns under decay,
 * forgets while away, and a majority of seeds yield a half-period that fits.
 */
export function curveDecision(input: {
  learns: Call;
  consolidates: Call;
  forgets: Call;
  nSeeds: number;
  nUncensored: number;
  meanH: number | null;
}): { decision: CurveDecision; half: number | null; period: number | null; steps: number | null } {
  const none = { half: null, period: null, steps: null };
  if (input.learns !== "confirmed") return { decision: "no-learning", ...none };
  if (input.consolidates !== "confirmed") return { decision: "no-consolidation", ...none };
  if (input.forgets !== "confirmed") return { decision: "no-forgetting", ...none };
  if (!(input.nUncensored * 2 > input.nSeeds) || input.meanH == null || !Number.isFinite(input.meanH)) {
    return { decision: "period-censored", ...none };
  }
  const half = Math.round(input.meanH);
  const steps = episodeLength(half);
  if (steps == null) return { decision: "period-censored", half, period: null, steps: null };
  return { decision: "run", half, period: 2 * half, steps };
}

/**
 * Confirmed only when correlation rises at the period and falls at the
 * opposite phase. A period excess entirely below 0 is a refutation.
 */
export function cycleShapeCall(atPeriod: Ends, atHalf: Ends): Call {
  if (atPeriod.lo > 0 && atHalf.hi < 0) return "confirmed";
  if (atPeriod.hi < 0) return "refuted";
  return "inconclusive";
}

/**
 * Phase-locked shape. Confirmed when the planted half is high and the
 * half-period template is not. A 50% square is orthogonal to that template,
 * so the half contrast of a real cycle is near zero, not negative.
 * Both contrasts clearing zero is the autocorrelation failure: the series
 * is in phase at P and at P/2. That stays inconclusive.
 * Refuted when the planted half is the low one.
 */
export function phaseShapeCall(fundamental: Ends, half: Ends): Call {
  if (fundamental.lo > 0 && !(half.lo > 0)) return "confirmed";
  if (fundamental.hi < 0) return "refuted";
  return "inconclusive";
}

/** The instrument works when either planted dose produces the cycle shape. */
export function instrumentCall(doseShapes: readonly Call[]): Call {
  if (doseShapes.some((call) => call === "confirmed")) return "confirmed";
  if (doseShapes.length > 0 && doseShapes.every((call) => call === "refuted")) return "refuted";
  return "inconclusive";
}

/** Smallest planted dose whose shape is confirmed. Null if none is. */
export function smallestShapeDose(doses: readonly number[], shapes: readonly Call[]): number | null {
  for (let i = 0; i < doses.length; i++) {
    if (shapes[i] === "confirmed") return doses[i]!;
  }
  return null;
}

export function cycleSummary(input: {
  instrument: Call;
  random: Call;
  rho: Call;
  others: readonly Call[];
}): CycleSummary {
  if (input.instrument !== "confirmed") return "instrument-blind";
  if (input.random === "confirmed" || input.random === "refuted") return "confounded";
  if (input.rho === "confirmed") {
    if (input.others.some((call) => call === "confirmed")) return "shared";
    return "confirmed";
  }
  if (input.rho === "refuted") return "refuted";
  return "inconclusive";
}

export function callOf(diff: Ends): Call {
  return greaterCall(diff);
}
