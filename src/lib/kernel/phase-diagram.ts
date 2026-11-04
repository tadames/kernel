/**
 * Phase-diagram summary. One occupancy instrument, three axes.
 * The rules are the preregistration. The sweep is not part of CI.
 */
import { LOCKED_DRIFT_TAU } from "./drift-run.ts";
import { driftRatesFromTau, forgettingRatesFromTau } from "./family.ts";
import type { Call, Ends } from "./noise.ts";

export { LOCKED_DRIFT_TAU };

/** Fresh weight stream. Not used by an earlier occupancy episode. */
export const PHASE_STREAM = 18101;

export const PHASE_STEPS = 400;

/** Sensitivity setting. The shipped default stays 0.45. */
export const PHASE_TEMPERATURE = 0.15;

/**
 * Smallest planted dose at which rho's occupancy cleared at temperature 0.15.
 * The positive control uses this dose and no other.
 */
export const PHASE_DOSE = 0.0085;

export const PHASE_EXPLORERS = ["random", "count", "surprise", "rnd", "rho"] as const;
export type PhaseExplorer = (typeof PHASE_EXPLORERS)[number];

export const PHASE_AXES = ["noise", "drift", "forget"] as const;
export type PhaseAxis = (typeof PHASE_AXES)[number];

/** Stationary-noise glow scale. 1 is the historical 0/1 bit. */
export const NOISE_LEVELS = [0, 1 / 3, 2 / 3, 1] as const;

/**
 * Drift probabilities from the locked wide-door τ: zero, 16× below 1/τ,
 * 1/τ, and 16× above 1/τ. The two interior rates of the old sweep are not cells.
 */
export function phaseDriftLevels() {
  const rates = driftRatesFromTau(LOCKED_DRIFT_TAU);
  return [rates[0]!, rates[1]!, rates[3]!, rates[5]!] as const;
}

/**
 * Forgetting rates on the same τ. Zero, half-life 4τ (slower than adaptation),
 * half-life τ (the studied λ), and half-life τ/2 (faster than adaptation).
 */
export function phaseForgetLevels() {
  const rates = forgettingRatesFromTau(LOCKED_DRIFT_TAU);
  return [0, rates[3]!, rates[1]!, rates[0]!] as const;
}

export type PhaseSpec = {
  noiseAmplitude: number;
  content: "noise" | "static" | "matched";
  matchedArm: "drift" | "held" | null;
  driftRate: number;
  forgettingRate: number;
  boostAdd: number;
};

export type CellDef = {
  axis: PhaseAxis;
  axisIndex: number;
  level: number;
  label: string;
  value: number;
  /** The one cell on this axis that the not-attracted prediction reads. */
  primary: boolean;
  target: PhaseSpec;
  control: PhaseSpec;
};

const NOISE_LABELS = ["0", "1/3", "2/3", "1"] as const;
const DRIFT_LABELS = ["0", "below", "at", "above"] as const;
const FORGET_LABELS = ["0", "slow", "at", "fast"] as const;

export function matchedSpec(
  arm: "drift" | "held",
  driftRate: number,
  forgettingRate = 0,
  boostAdd = 0,
): PhaseSpec {
  return {
    noiseAmplitude: 1,
    content: "matched",
    matchedArm: arm,
    driftRate,
    forgettingRate,
    boostAdd,
  };
}

export function noiseSpec(amplitude: number, content: "noise" | "static"): PhaseSpec {
  return {
    noiseAmplitude: amplitude,
    content,
    matchedArm: null,
    driftRate: 0,
    forgettingRate: 0,
    boostAdd: 0,
  };
}

/** Twelve cells. Level 0 is the manipulation off. Level index 3 is the top of each axis. */
export function phaseCells(): CellDef[] {
  const drift = phaseDriftLevels();
  const forget = phaseForgetLevels();
  const cells: CellDef[] = [];
  NOISE_LEVELS.forEach((value, level) => {
    cells.push({
      axis: "noise",
      axisIndex: 0,
      level,
      label: NOISE_LABELS[level]!,
      value,
      primary: level === 3,
      target: noiseSpec(value, "noise"),
      control: noiseSpec(value, "static"),
    });
  });
  drift.forEach((value, level) => {
    cells.push({
      axis: "drift",
      axisIndex: 1,
      level,
      label: DRIFT_LABELS[level]!,
      value,
      primary: level === 2,
      target: matchedSpec("drift", value),
      control: matchedSpec("held", value),
    });
  });
  forget.forEach((value, level) => {
    cells.push({
      axis: "forget",
      axisIndex: 2,
      level,
      label: FORGET_LABELS[level]!,
      value,
      primary: level === 2,
      target: matchedSpec("held", 0, value),
      control: matchedSpec("held", 0, 0),
    });
  });
  return cells;
}

/** Planted bonus on the held room, the zero world of the drift and forgetting axes. */
export function positiveSpecs() {
  return {
    target: matchedSpec("held", 0, 0, PHASE_DOSE),
    control: matchedSpec("held", 0, 0, 0),
  };
}

/** Options that build the same episode. Signal and seed are not part of the spec. */
export function phaseKey(spec: PhaseSpec) {
  return [
    spec.content,
    spec.matchedArm ?? "",
    spec.noiseAmplitude,
    spec.driftRate,
    spec.forgettingRate,
    spec.boostAdd,
  ].join(",");
}

export function excessSalt(axisIndex: number, level: number, explorer: number) {
  return 19000 + axisIndex * 100 + level * 10 + explorer;
}

/** Rho's excess minus that baseline's excess. Baseline index is 0..3. */
export function baselineSalt(axisIndex: number, level: number, baseline: number) {
  return 20000 + axisIndex * 100 + level * 10 + baseline;
}

export function positiveSalt(explorer: number) {
  return 21000 + explorer;
}

export function positiveBaselineSalt(baseline: number) {
  return 21100 + baseline;
}

export type PhaseClass = "attracted" | "repelled" | "null-with-sensitivity" | "inconclusive";

/**
 * Attracted when the CI lies entirely above 0. Repelled when it lies entirely
 * below 0. Null-with-sensitivity when the instrument has a detection threshold
 * and the CI lies strictly inside (−δ, δ), so it excludes effects at least
 * that large. Otherwise inconclusive.
 */
export function phaseCellClass(excess: Ends, delta: number | null): PhaseClass {
  if (excess.lo > 0) return "attracted";
  if (excess.hi < 0) return "repelled";
  if (delta != null && delta > 0 && excess.lo > -delta && excess.hi < delta) return "null-with-sensitivity";
  return "inconclusive";
}

/** δ is the lower end of the positive control, and only when that control cleared. */
export function instrumentDelta(call: Call, lo: number): number | null {
  if (call !== "confirmed") return null;
  return lo;
}

export type NotAttracted = "confirmed" | "refuted" | "inconclusive";

/**
 * The cell prediction is that rho is not attracted.
 * Repulsion and a sensitive null confirm it. Attraction refutes it.
 * A walk that moved, or an interval too wide to exclude δ, is inconclusive.
 */
export function notAttractedCall(cell: PhaseClass, confounded: boolean): NotAttracted {
  if (confounded) return "inconclusive";
  if (cell === "attracted") return "refuted";
  if (cell === "repelled" || cell === "null-with-sensitivity") return "confirmed";
  return "inconclusive";
}

export type BaselineContrast = "rho-higher" | "rho-lower" | "no-difference";

/** Rho excess minus the baseline excess. */
export function baselineContrast(diff: Ends): BaselineContrast {
  if (diff.lo > 0) return "rho-higher";
  if (diff.hi < 0) return "rho-lower";
  return "no-difference";
}

export function explorerIndex(id: PhaseExplorer) {
  return PHASE_EXPLORERS.indexOf(id);
}
