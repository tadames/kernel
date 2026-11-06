/**
 * Which additive piece of the ceiling door carries the excess?
 * The rules are the preregistration in JOURNAL.md. A CI that only
 * includes zero is not yet the summary: sign comes before the null.
 * The sweep is not part of CI.
 *
 * The rate is the published ceiling, 0.94. The contrast is drift minus
 * held. The plant is not rerun. ρ̂ is not split. Occupancy is not run.
 */
import { CEILING_RATE, RATE_DELTA } from "./ceiling.ts";
import type { PhaseClass } from "./phase-diagram.ts";

export { CEILING_RATE, RATE_DELTA };

/**
 * The five pieces that sum to the logit. `extra` is the place bonus and
 * is not a column: the harness requires it to be zero.
 */
export const PARTS_COLUMNS = ["rho", "global", "uncertainty", "extrinsic", "follow"] as const;
export type PartsColumn = (typeof PARTS_COLUMNS)[number];

export function partsColumnIndex(name: PartsColumn) {
  return PARTS_COLUMNS.indexOf(name);
}

/** Same color scale as the ceiling figure, so a 0.25 surprise cell matches. */
export const PARTS_COLOR_CLAMP = 0.3;

export type PartsSummary = "inside" | "shared" | "opposed" | "outside" | "unreproduced" | "inconclusive";

/**
 * Piece gap of one explorer. Salted so a rerun reprints the interval.
 * Explorer index is the phase order. Column index is `PARTS_COLUMNS`.
 * Reported. Not the summary, except through the two sums below.
 */
export function partsPieceSalt(explorer: number, column: number) {
  return 45000 + 10 * explorer + column;
}

/**
 * Explore-weighted ρ̂ plus global progress. Rho's sum is the call.
 * Other explorers are reported and do not flip the summary.
 */
export function partsProgressSalt(explorer: number) {
  return 45100 + explorer;
}

/**
 * Uncertainty plus the follow-up plus the extrinsic term.
 * Rho's sum is the call.
 */
export function partsOutsideSalt(explorer: number) {
  return 45200 + explorer;
}

/**
 * Headline. `inside` is the prediction: the progress channel is attracted
 * and the outside sum is a sensitive null, so the remainder sits in the
 * channel the constant dose already occupies.
 *
 * The first match wins. Piece classes do not enter. Sign of a sum comes
 * before the sensitive null.
 */
export function partsSummary(input: {
  logit: PhaseClass;
  progress: PhaseClass;
  outside: PhaseClass;
}): PartsSummary {
  if (input.logit !== "attracted") return "unreproduced";
  if (input.progress === "attracted" && input.outside === "attracted") return "shared";
  if (input.progress === "attracted" && input.outside === "repelled") return "opposed";
  if (input.progress === "attracted" && input.outside === "null-with-sensitivity") return "inside";
  if (input.outside === "attracted" && (input.progress === "null-with-sensitivity" || input.progress === "repelled")) {
    return "outside";
  }
  return "inconclusive";
}

export function partsVerdict(summary: PartsSummary): "confirmed" | "refuted" | "inconclusive" {
  if (summary === "inside") return "confirmed";
  if (summary === "shared" || summary === "opposed" || summary === "outside") return "refuted";
  return "inconclusive";
}
