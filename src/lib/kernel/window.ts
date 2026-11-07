/**
 * Why the Bernoulli residual prefers the arm whose realized error is lower.
 * The rules are the preregistration in JOURNAL.md. A CI that only
 * includes zero is not yet the summary: sign comes before the null.
 * The sweep is not part of CI.
 *
 * The rate is the published ceiling, 0.94. The contrast is the residual
 * of the predicted window against the squared error of that same window.
 * The plant is not rerun. The weight split is not rerun as a claim.
 * Occupancy is not run.
 */
import { PUBLISHED_CEILING_RAW } from "./match.ts";
import { PUBLISHED_UNCERTAINTY } from "./weights.ts";
import { CEILING_RATE, RATE_DELTA } from "./ceiling.ts";
import type { PhaseClass } from "./phase-diagram.ts";

export { CEILING_RATE, RATE_DELTA };

/**
 * `curiosity * (0.75 * 0.7 * 0.35 + 0.2 * 0.7)`. This is the map from the
 * Bernoulli residual to the residual weight, at curiosity 1. Wonder is off,
 * so the score uses that constant. The expression is the one in the score.
 */
export function windowResidualGain(curiosity = 1) {
  return curiosity * (0.75 * 0.7 * 0.35 + 0.2 * 0.7);
}

/** Published uncertainty divided by the gain. Arithmetic, not a measurement. */
export const WINDOW_IMPLIED_RESIDUAL = PUBLISHED_UNCERTAINTY / windowResidualGain();

/**
 * Published realized-error door plus one quarter of the implied residual.
 * Arithmetic on the previous cell. Not a measurement.
 */
export const WINDOW_IMPLIED_GAP = PUBLISHED_CEILING_RAW + WINDOW_IMPLIED_RESIDUAL / 4;

/**
 * Color scale. The squared door is about 0.19, so the weight scale of
 * 0.05 would saturate every cell.
 */
export const WINDOW_COLOR_CLAMP = 0.2;

export const WINDOW_COLUMNS = ["residual", "squared", "gap"] as const;
export type WindowColumn = (typeof WINDOW_COLUMNS)[number];

export type WindowSummary = "aligned" | "identity" | "anti" | "mismatch" | "unreproduced" | "inconclusive";

/** Bernoulli residual of the predicted window. Salted so a rerun reprints it. */
export function windowResidualSalt() {
  return 47000;
}

/**
 * Squared error plus one quarter of the residual. The call.
 * Negative means the window matches the realized bits beyond the complement.
 */
export function windowGapSalt() {
  return 47100;
}

/** Covariance of the same window with the realized bits. Reported. */
export function windowAlignSalt() {
  return 47200;
}

/**
 * Headline. `aligned` is the prediction: the squared-error door is lower
 * than the Bernoulli complement, so the same window points at the realized
 * bits. `identity` means the complement accounts for the door. `anti` means
 * the window points away from the bits and the complement is what pulls
 * the error down.
 *
 * The first match wins. Sign of the gap comes before the sensitive null.
 * The logit has to stay attracted, the squared error repelled, and the
 * uncertainty weight attracted, or the ceiling cell did not come back.
 */
export function windowSummary(input: {
  logit: PhaseClass;
  squared: PhaseClass;
  uncertainty: PhaseClass;
  matched: boolean;
  gap: PhaseClass;
}): WindowSummary {
  if (input.logit !== "attracted" || input.squared !== "repelled" || input.uncertainty !== "attracted") {
    return "unreproduced";
  }
  if (!input.matched) return "mismatch";
  if (input.gap === "repelled") return "aligned";
  if (input.gap === "attracted") return "anti";
  if (input.gap === "null-with-sensitivity") return "identity";
  return "inconclusive";
}

export function windowVerdict(summary: WindowSummary): "confirmed" | "refuted" | "inconclusive" {
  if (summary === "aligned") return "confirmed";
  if (summary === "identity" || summary === "anti") return "refuted";
  return "inconclusive";
}
