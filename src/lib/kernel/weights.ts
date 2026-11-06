/**
 * Which weight inside the shared uncertainty gap carries it?
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
 * Mean of the published uncertainty gap, seeds 1–200. A miss aborts.
 * This number is the previous cell. It is not this claim.
 */
export const PUBLISHED_UNCERTAINTY = 0.025383679792284966;

/**
 * Color scale for the two weights. They live under the published
 * uncertainty gap, so the ceiling clamp of 0.30 would wash the figure.
 */
export const WEIGHTS_COLOR_CLAMP = 0.05;

export const WEIGHTS_COLUMNS = ["residual", "novelty"] as const;
export type WeightsColumn = (typeof WEIGHTS_COLUMNS)[number];

export type WeightsSummary =
  | "residual"
  | "novelty"
  | "shared"
  | "opposed"
  | "counter"
  | "unreproduced"
  | "inconclusive";

/**
 * Residual weight of one explorer. Salted so a rerun reprints the interval.
 * Explorer index is the phase order. Rho's class enters the summary.
 */
export function weightsResidualSalt(explorer: number) {
  return 46000 + explorer;
}

/**
 * Novelty weight of one explorer. Rho's class enters the summary.
 */
export function weightsNoveltySalt(explorer: number) {
  return 46100 + explorer;
}

/**
 * Headline. `residual` is the prediction: the residual weight is attracted
 * and the novelty weight is a sensitive null, so the shared gap is the
 * Bernoulli weight and not visit-scent.
 *
 * The first match wins. Sign of a weight comes before the sensitive null.
 * The logit and the uncertainty gap have to stay attracted or the ceiling
 * cell did not come back.
 */
export function weightsSummary(input: {
  logit: PhaseClass;
  uncertainty: PhaseClass;
  residual: PhaseClass;
  novelty: PhaseClass;
}): WeightsSummary {
  if (input.logit !== "attracted" || input.uncertainty !== "attracted") return "unreproduced";
  if (input.residual === "attracted" && input.novelty === "attracted") return "shared";
  if (input.residual === "attracted" && input.novelty === "repelled") return "opposed";
  if (input.residual === "attracted" && input.novelty === "null-with-sensitivity") return "residual";
  if (input.novelty === "attracted" && input.residual === "repelled") return "counter";
  if (input.novelty === "attracted" && input.residual === "null-with-sensitivity") return "novelty";
  return "inconclusive";
}

export function weightsVerdict(summary: WeightsSummary): "confirmed" | "refuted" | "inconclusive" {
  if (summary === "residual") return "confirmed";
  if (summary === "novelty" || summary === "shared" || summary === "opposed" || summary === "counter") {
    return "refuted";
  }
  return "inconclusive";
}
