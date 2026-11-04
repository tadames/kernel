/**
 * Door-scale phase diagram. The rules are the preregistration in JOURNAL.md.
 * A CI that only includes zero is inconclusive. The sweep is not part of CI.
 *
 * Three rooms, one door, one planted dose. The forget cell is the published
 * relearn doorway. Noise and drift are the same score on fresh weights.
 */
import type { Call, Ends } from "./noise.ts";
import { PHASE_DOSE, PHASE_STEPS, phaseDriftLevels, type NotAttracted, type PhaseClass } from "./phase-diagram.ts";

export { PHASE_DOSE, PHASE_STEPS };

/** Adaptation-rate cell of the locked drift ladder. The fast cell is not rerun. */
export const ATLAS_DRIFT = phaseDriftLevels()[2]!;

/** Fresh weight stream for the noise and drift arms. Not the relearn stream. */
export const ATLAS_STREAM = 41011;

/** Training steps on the noise and drift arms. The phase-diagram episode length. */
export const ATLAS_CONTENT_STEPS = PHASE_STEPS;

/**
 * Means of the published relearn doorway, seeds 1–200. A miss aborts.
 * Rho is the logit. Surprise and RND are the unmixed bonuses. Count is 0.
 */
export const PUBLISHED_RHO_DOOR = -0.003528726361691952;
export const PUBLISHED_SURPRISE_BONUS = -0.0025827644392848017;
export const PUBLISHED_RND_BONUS = -0.001979550663381815;
export const PUBLISHED_RAW_DOOR = 0.07871244594574688;

export const ATLAS_CELLS = ["noise", "drift", "forget"] as const;
export type AtlasCell = (typeof ATLAS_CELLS)[number];

export type AtlasSummary = "instrument-blind" | "attracted" | "mapped" | "inconclusive";

/** Color scale of the figure. A mean of this size is fully saturated. */
export const ATLAS_COLOR_CLAMP = 0.04;

export function atlasCellIndex(cell: AtlasCell) {
  return ATLAS_CELLS.indexOf(cell);
}

/** Logit gap, target minus control. Explorer index matches the phase diagram. */
export function atlasLogitSalt(cell: AtlasCell, explorer: number) {
  return 41000 + atlasCellIndex(cell) * 10 + explorer;
}

/** Unmixed bonus gap. Not the call, except as the forget checksum. */
export function atlasBonusSalt(cell: AtlasCell, explorer: number) {
  return 41100 + atlasCellIndex(cell) * 10 + explorer;
}

/** Realized squared error, target minus control. */
export function atlasRawSalt(cell: AtlasCell) {
  return 41200 + atlasCellIndex(cell);
}

/** Planted dose minus the flat door, on the mastered brain. */
export function atlasPlantSalt(explorer: number) {
  return 41300 + explorer;
}

/** Rho's logit gap minus that baseline's logit gap. Baseline index stops at RND. */
export function atlasBaselineSalt(cell: AtlasCell, baseline: number) {
  return 41500 + atlasCellIndex(cell) * 10 + baseline;
}

export function atlasPlantBaselineSalt(baseline: number) {
  return 41600 + baseline;
}

/**
 * Headline. `mapped` is the prediction: the plant is visible, noise is a
 * harder room at the door, and rho's logit is not attracted on any of the
 * three cells. `attracted` refutes that. A blind plant does not become a
 * sensitive null. An unseparated noise room does not either.
 */
export function atlasSummary(input: {
  plant: Call;
  noise: NotAttracted;
  drift: NotAttracted;
  forget: NotAttracted;
  noiseSeparated: boolean;
}): AtlasSummary {
  const cells = [input.noise, input.drift, input.forget];
  if (cells.some((cell) => cell === "refuted")) return "attracted";
  if (input.plant !== "confirmed") return "instrument-blind";
  if (!input.noiseSeparated) return "inconclusive";
  if (cells.every((cell) => cell === "confirmed")) return "mapped";
  return "inconclusive";
}

export function atlasVerdict(summary: AtlasSummary): "confirmed" | "refuted" | "inconclusive" {
  if (summary === "mapped") return "confirmed";
  if (summary === "attracted") return "refuted";
  return "inconclusive";
}

/** The printed tag. `null` is the sensitive null. */
export function atlasClassTag(phaseClass: PhaseClass) {
  if (phaseClass === "null-with-sensitivity") return "null";
  if (phaseClass === "inconclusive") return "inconcl";
  return phaseClass;
}

export type AtlasEnds = Ends & { mean: number; n: number; call: Call; phaseClass: PhaseClass; notAttracted: NotAttracted };
