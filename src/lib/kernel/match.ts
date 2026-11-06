/**
 * Does the ceiling door's progress-channel dose buy its logit?
 * The rules are the preregistration in JOURNAL.md. A CI that only
 * includes zero is not yet the summary: sign comes before the null.
 * The sweep is not part of CI.
 *
 * The rate is the published ceiling, 0.94. No other rate is a cell.
 * The plant is that seed's own dose on the held brain. Occupancy is
 * not this measurement. The progress term is not split.
 */
import { CEILING_RATE, RATE_DELTA, ceilingBonusSalt, ceilingLogitSalt, ceilingRawSalt } from "./ceiling.ts";
import type { PhaseClass } from "./phase-diagram.ts";

export { CEILING_RATE, RATE_DELTA };

/**
 * Means of the published ceiling cell, seeds 1–200. A miss aborts.
 * These numbers are the previous cell. They are not this claim.
 */
export const PUBLISHED_CEILING_RHO = 0.07877570550888777;
export const PUBLISHED_CEILING_SURPRISE = 0.29832686215639115;
export const PUBLISHED_CEILING_RND = 0.04852886945009231;
export const PUBLISHED_CEILING_COUNT = -0.4250148528814316;
export const PUBLISHED_CEILING_RAW = -0.19100396591506477;
export const PUBLISHED_CEILING_RHO_BONUS = 0.02258083738292072;
export const PUBLISHED_CEILING_SURPRISE_BONUS = 0.07840519232675433;
export const PUBLISHED_CEILING_RND_BONUS = -0.006153701646253467;

/** Seed 1 of that cell. The unit test, not the 200-seed claim. */
export const PUBLISHED_CEILING_SEED1_RHO = 0.07902253419160843;

export type MatchSummary = "accounted" | "excess" | "short" | "blind" | "unreproduced" | "inconclusive";

/** Same color scale as the ceiling figure, so a 0.25 surprise cell matches. */
export const MATCH_COLOR_CLAMP = 0.3;

/**
 * The drift cell reuses the published ceiling salts, so a matching sample
 * reproduces that cell's intervals. The plant and the gap are new.
 */
export function matchDriftLogitSalt(explorer: number) {
  return ceilingLogitSalt("ceiling", explorer);
}

export function matchDriftBonusSalt(explorer: number) {
  return ceilingBonusSalt("ceiling", explorer);
}

export function matchDriftRawSalt() {
  return ceilingRawSalt("ceiling");
}

/** Plant logit, boosted held minus flat held. Not the summary by itself. */
export function matchPlantSalt(explorer: number) {
  return 44100 + explorer;
}

/**
 * Drift logit minus plant logit. Rho's gap is the call.
 * Other explorers are reported and do not flip the summary.
 */
export function matchGapSalt(explorer: number) {
  return 44200 + explorer;
}

/**
 * Headline. `accounted` is the prediction: the drift logit and the plant
 * logit are the same attraction, inside the published plant threshold.
 * `excess` means the drift logit is larger. `short` means the plant is
 * larger. `blind` means the dose did not attract on this door.
 *
 * The first match wins. The dose band and the other explorers do not enter.
 * Sign of the gap comes before the sensitive null.
 */
export function matchSummary(input: {
  driftRho: PhaseClass;
  plantRho: PhaseClass;
  gap: PhaseClass;
}): MatchSummary {
  if (input.driftRho !== "attracted") return "unreproduced";
  if (input.gap === "attracted") return "excess";
  if (input.gap === "repelled") return "short";
  if (input.plantRho !== "attracted") return "blind";
  if (input.gap === "null-with-sensitivity") return "accounted";
  return "inconclusive";
}

export function matchVerdict(summary: MatchSummary): "confirmed" | "refuted" | "inconclusive" {
  if (summary === "accounted") return "confirmed";
  if (summary === "excess" || summary === "short" || summary === "blind") return "refuted";
  return "inconclusive";
}
