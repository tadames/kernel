/**
 * Door-logit drift ladder. The rules are the preregistration in JOURNAL.md.
 * A CI that only includes zero is inconclusive. The sweep is not part of CI.
 *
 * Five locked rates around 1/τ, the same door as the atlas drift cell.
 * The zero cell is the closed noise room and is not on this ladder.
 */
import { ATLAS_DRIFT } from "./atlas.ts";
import { LOCKED_DRIFT_TAU } from "./drift-run.ts";
import { driftRatesFromTau } from "./family.ts";
import type { Call } from "./noise.ts";
import type { NotAttracted, PhaseClass, PhaseExplorer } from "./phase-diagram.ts";

export { ATLAS_DRIFT, LOCKED_DRIFT_TAU };

/** Published plant lower end from the door atlas. Not remeasured. */
export const RATE_DELTA = 0.05422156393527985;

/**
 * Means of the published atlas drift cell, seeds 1–200. A miss aborts.
 * These numbers are the previous cell. They are not this claim.
 */
export const PUBLISHED_AT_RHO = 0.061450635716319084;
export const PUBLISHED_AT_SURPRISE = 0.24986666545271874;
export const PUBLISHED_AT_RND = 0.03987037252634764;
export const PUBLISHED_AT_COUNT = -0.33158675611019134;
export const PUBLISHED_AT_RAW = -0.1660314184533794;
export const PUBLISHED_AT_RHO_BONUS = 0.01840890091524244;
export const PUBLISHED_AT_SURPRISE_BONUS = 0.06833567010238767;
export const PUBLISHED_AT_RND_BONUS = -0.006656389080453664;

/** Seed 1 of that cell. The unit test, not the 200-seed claim. */
export const PUBLISHED_AT_SEED1_RHO = -0.0659591406583786;

export const RATE_LEVELS = ["slow", "below", "at", "above", "fast"] as const;
export type RateLevel = (typeof RATE_LEVELS)[number];

export type RateSummary =
  | "unreproduced"
  | "trough"
  | "rising"
  | "no-peak"
  | "open"
  | "tracked"
  | "banded"
  | "inconclusive";

/** Color scale of the figure. Wider than the atlas, whose clamp is 0.04. */
export const RATE_COLOR_CLAMP = 0.3;

export function rateIndex(level: RateLevel) {
  return RATE_LEVELS.indexOf(level);
}

/**
 * Nonzero cells of the locked drift ladder. Zero is not a cell.
 * Factors are 1/16, 1/4, 1, 4, and 16 times 1/τ.
 */
export function rateLadder() {
  const rates = driftRatesFromTau(LOCKED_DRIFT_TAU);
  const factors = [1 / 16, 1 / 4, 1, 4, 16] as const;
  return RATE_LEVELS.map((level, i) => ({
    level,
    rate: rates[i + 1]!,
    factor: factors[i]!,
  }));
}

/** Logit gap, drift minus held. Explorer index matches the phase diagram. */
export function rateLogitSalt(level: RateLevel, explorer: number) {
  return 42000 + rateIndex(level) * 10 + explorer;
}

/** Unmixed bonus gap. Not the call. */
export function rateBonusSalt(level: RateLevel, explorer: number) {
  return 42100 + rateIndex(level) * 10 + explorer;
}

/** Realized squared error, drift minus held. Reported. Not a gate. */
export function rateRawSalt(level: RateLevel) {
  return 42200 + rateIndex(level);
}

/** Rho's logit minus that baseline's logit. Baseline index stops at RND. */
export function rateBaselineSalt(level: RateLevel, baseline: number) {
  return 42300 + rateIndex(level) * 10 + baseline;
}

/** Rho at 1/τ minus rho at this other rate. */
export function ratePeakSalt(level: Exclude<RateLevel, "at">) {
  return 42400 + rateIndex(level);
}

/** Fast rate minus the adaptation rate, for one baseline. */
export function rateRiseSalt(signal: Exclude<PhaseExplorer, "random" | "rho">) {
  const index = signal === "count" ? 1 : signal === "surprise" ? 2 : 3;
  return 42410 + index;
}

/**
 * Headline. `banded` is the prediction: rho's logit at 1/τ lies entirely
 * above both 16× extremes, the fast rate does not attract rho, and surprise
 * is still attracted there. A fast rate that beats 1/τ is `rising`. A slow
 * rate that beats 1/τ is `no-peak`. Both is a trough. A peak that is still
 * attracted at 16× has not found the end of the band. Surprise falling with
 * rho is `tracked`, not a rho-specific miss.
 *
 * The first match wins. The 4× rates, the rise calls, and the unmixed
 * bonuses do not enter.
 */
export function rateSummary(input: {
  atAttracted: boolean;
  peakSlow: Call;
  peakFast: Call;
  fastRho: NotAttracted;
  fastSurprise: PhaseClass;
}): RateSummary {
  if (!input.atAttracted) return "unreproduced";
  if (input.peakSlow === "refuted" && input.peakFast === "refuted") return "trough";
  if (input.peakFast === "refuted") return "rising";
  if (input.peakSlow === "refuted") return "no-peak";
  if (input.peakSlow !== "confirmed" || input.peakFast !== "confirmed") return "inconclusive";
  if (input.fastRho === "refuted") return "open";
  if (input.fastRho !== "confirmed") return "inconclusive";
  if (input.fastSurprise === "attracted") return "banded";
  if (input.fastSurprise === "repelled" || input.fastSurprise === "null-with-sensitivity") return "tracked";
  return "inconclusive";
}

export function rateVerdict(summary: RateSummary): "confirmed" | "refuted" | "inconclusive" {
  if (summary === "banded") return "confirmed";
  if (summary === "trough" || summary === "rising" || summary === "no-peak" || summary === "tracked") return "refuted";
  return "inconclusive";
}
