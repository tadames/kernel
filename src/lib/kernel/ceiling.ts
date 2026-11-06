/**
 * One door cell past the drift ladder. The rules are the preregistration
 * in JOURNAL.md. A CI that only includes zero is inconclusive.
 * The sweep is not part of CI.
 *
 * The five-rate ladder is not rerun. The 16× cell is a checksum.
 * The claim is one rate, 0.94, drift minus held, on the same door.
 */
import { RHO_HAT_PROG_WEIGHT } from "./policy.ts";
import { RATE_DELTA, rateBaselineSalt, rateBonusSalt, rateLogitSalt, rateRawSalt } from "./rate.ts";
import {
  RHO_DETECT_DOSE,
  RHO_UNDETECT_DOSE,
  rhoGapBand,
  type RhoGapBand,
} from "./noise.ts";
import type { Interval } from "./stats.ts";
import type { NotAttracted, PhaseClass } from "./phase-diagram.ts";

export { RATE_DELTA, RHO_DETECT_DOSE, RHO_UNDETECT_DOSE, RHO_HAT_PROG_WEIGHT };

/**
 * The door refuses a rate at or above this value. The drift grid collapses
 * those rates into one entry. 64× 1/τ is past it and is not a cell.
 */
export const DOOR_RATE_LIMIT = 0.95;

/**
 * One hundredth under the door limit. Four figures, so it does not round
 * onto 0.95 or onto 0.3003. Expected pattern lifetime is 1/0.94 steps.
 * Survival through one further step is 0.06. Not a searched grid.
 */
export const CEILING_RATE = 0.94;

/** Published 16× cell. The checksum, not a new contrast against 1/τ. */
export const FAST_RATE = 0.3003;

/**
 * Means of the published fast cell, seeds 1–200. A miss aborts.
 * These numbers are the previous cell. They are not this claim.
 */
export const PUBLISHED_FAST_RHO = 0.06867696205154061;
export const PUBLISHED_FAST_SURPRISE = 0.27239973679184915;
export const PUBLISHED_FAST_RND = 0.04574953872710466;
export const PUBLISHED_FAST_COUNT = -0.38972927927970885;
export const PUBLISHED_FAST_RAW = -0.20304700671425796;
export const PUBLISHED_FAST_RHO_BONUS = 0.01940108576051468;
export const PUBLISHED_FAST_SURPRISE_BONUS = 0.07297489142045378;
export const PUBLISHED_FAST_RND_BONUS = -0.005818616191390902;

/** Seed 1 of that cell. The unit test, not the 200-seed claim. */
export const PUBLISHED_FAST_SEED1_RHO = 0.030196338891983032;

export const CEILING_LEVELS = ["fast", "ceiling"] as const;
export type CeilingLevel = (typeof CEILING_LEVELS)[number];

export type CeilingSummary = "plateau" | "fallen" | "tracked" | "inconclusive";

/** Same color scale as the drift ladder, so a 0.25 surprise cell matches. */
export const CEILING_COLOR_CLAMP = 0.3;

/** Dose axis of the figure. Locked. Not fit to the sample. */
export const DOSE_AXIS_LO = -0.02;
export const DOSE_AXIS_HI = 0.08;

export function ceilingIndex(level: CeilingLevel) {
  return CEILING_LEVELS.indexOf(level);
}

/**
 * Fast-cell salts are the published ladder salts, so the intervals match
 * the previous run when the samples match. The ceiling salts are new.
 */
export function ceilingLogitSalt(level: CeilingLevel, explorer: number) {
  if (level === "fast") return rateLogitSalt("fast", explorer);
  return 43000 + explorer;
}

export function ceilingBonusSalt(level: CeilingLevel, explorer: number) {
  if (level === "fast") return rateBonusSalt("fast", explorer);
  return 43100 + explorer;
}

export function ceilingRawSalt(level: CeilingLevel) {
  if (level === "fast") return rateRawSalt("fast");
  return 43200;
}

export function ceilingBaselineSalt(level: CeilingLevel, baseline: number) {
  if (level === "fast") return rateBaselineSalt("fast", baseline);
  return 43300 + baseline;
}

/** Ceiling logit minus the published fast logit. Reported. Not the summary. */
export function ceilingFallSalt(explorer: number) {
  return 43400 + explorer;
}

/** Ceiling rho bonus minus the published fast rho bonus. Reported. Not the summary. */
export function ceilingBonusFallSalt() {
  return 43600;
}

/** Ceiling realized error minus the published fast realized error. Reported. Not a gate. */
export function ceilingRawFallSalt() {
  return 43700;
}

/**
 * Progress-channel dose of an unmixed rho bonus. The score adds
 * `RHO_HAT_PROG_WEIGHT * ρ̂`. The interval is that weight times the bonus
 * interval, the same resamples, not a second bootstrap.
 */
export function progressDose(bonus: Interval): Interval {
  const k = RHO_HAT_PROG_WEIGHT;
  if (!(k > 0)) throw new Error("progress weight must be positive");
  return { mean: k * bonus.mean, lo: k * bonus.lo, hi: k * bonus.hi, n: bonus.n };
}

/** Where that dose sits on the PR #11 curve. It does not flip the summary. */
export function ceilingDoseBand(dose: Interval, nSeeds: number): RhoGapBand {
  return rhoGapBand(dose, nSeeds, dose.n);
}

/**
 * Headline. `fallen` is the prediction: at 0.94 rho is not attracted, and
 * surprise still is. `plateau` means rho is still attracted, so the
 * adaptation-timescale account of this door is done. `tracked` means rho
 * leaves and surprise leaves with it.
 *
 * The first match wins. The dose band, the fall contrasts, and the
 * unmixed bonuses do not enter.
 */
export function ceilingSummary(input: {
  ceilingRho: NotAttracted;
  ceilingSurprise: PhaseClass;
}): CeilingSummary {
  if (input.ceilingRho === "refuted") return "plateau";
  if (input.ceilingRho !== "confirmed") return "inconclusive";
  if (input.ceilingSurprise === "attracted") return "fallen";
  if (input.ceilingSurprise === "repelled" || input.ceilingSurprise === "null-with-sensitivity") return "tracked";
  return "inconclusive";
}

export function ceilingVerdict(summary: CeilingSummary): "confirmed" | "refuted" | "inconclusive" {
  if (summary === "fallen") return "confirmed";
  if (summary === "plateau" || summary === "tracked") return "refuted";
  return "inconclusive";
}
