/**
 * Calls for the negated-target interference study. The rules are the
 * preregistration in JOURNAL.md. A CI that only includes zero is inconclusive.
 *
 * Training the other room does not erase a mastered room. Negating the
 * open-cell glow targets of that same room does, on a net that stored them.
 * The occupancy claim runs only after that erasure renews shipped progress
 * by enough for the temperature-0.15 instrument to see.
 */
import { episodeLength } from "./cycle.ts";
import { SHIPPED_HIDDEN } from "./capacity.ts";
import type { Call, Ends } from "./noise.ts";
import { meanOf } from "./stats.ts";

export { SHIPPED_HIDDEN };

/** Shipped width, then the width that did not store the pattern. */
export const NEGATE_WIDTHS = [32, 1] as const;

/** Erasure bar: interference must undo at least half the learn drop. */
export const HALF_FRACTION = 0.5;

/**
 * Smallest planted bonus that moved rho's occupancy at temperature 0.15.
 * A renewal entirely below this cannot feed a cycle the instrument sees.
 */
export const DOSE_VISIBLE = 0.0085;

export const INSTRUMENT_DOSE = 0.05;
export const SENSITIVITY_DOSE = 0.0085;

export const PRIMARY_TEMPERATURE = 0.15;

/** Occupancy episodes. Not a stream used by the capacity sweep. */
export const OCCUPANCY_SALT = 24031;

/** Planted-wave episodes. */
export const WAVE_SALT = 24041;

/** Dedicated replay stream. Not the policy RNG. */
export const NEGATE_STREAM = 0x6e26;

export type NegateReason =
  | "run"
  | "no-learning"
  | "no-store"
  | "no-forgetting"
  | "not-pattern"
  | "no-ablation"
  | "no-renewal"
  | "below-dose"
  | "period-censored";

export type NegateSummary =
  | "confirmed"
  | "shared"
  | "refuted"
  | "instrument-blind"
  | "confounded"
  | "inconclusive"
  | "unfed";

export type ManipulateVerdict = "confirmed" | "refuted" | "confounded" | "inconclusive";

/** Overwrite minus half the learn drop. Positive means the bar was cleared. */
export function erasureGap(overwrite: number, learnDrop: number) {
  return overwrite - HALF_FRACTION * learnDrop;
}

/**
 * First failed gate is the reason. `stores` is the glow learn drop.
 * `pattern` is the glow rise under negation. `absent` is the true-target
 * continuation, which must be refuted.
 */
export function gateNegate(input: {
  learns: Call;
  stores: Call;
  forgets: Call;
  pattern: Call;
  absent: Call;
  renews: Call;
  visible: boolean;
  period: "ok" | "censored";
}): { score: number; reason: NegateReason } {
  if (input.learns !== "confirmed") return { score: 0, reason: "no-learning" };
  if (input.stores !== "confirmed") return { score: 1, reason: "no-store" };
  if (input.forgets !== "confirmed") return { score: 2, reason: "no-forgetting" };
  if (input.pattern !== "confirmed") return { score: 3, reason: "not-pattern" };
  if (input.absent !== "refuted") return { score: 4, reason: "no-ablation" };
  if (input.renews !== "confirmed") return { score: 5, reason: "no-renewal" };
  if (!input.visible) return { score: 6, reason: "below-dose" };
  if (input.period !== "ok") return { score: 7, reason: "period-censored" };
  return { score: 8, reason: "run" };
}

/** Widest width that can feed a cycle. A lower score leaves the hidden null. */
export function selectNegate(rows: readonly { hidden: number; score: number; reason: NegateReason }[]): {
  hidden: number | null;
  reason: NegateReason;
} {
  if (rows.length === 0) return { hidden: null, reason: "no-learning" };
  let best = rows[0]!;
  for (const row of rows) {
    if (row.score > best.score || (row.score === best.score && row.hidden > best.hidden)) best = row;
  }
  if (best.score < 8) return { hidden: null, reason: best.reason };
  return { hidden: best.hidden, reason: "run" };
}

/**
 * Manipulation check at the shipped width, read off the curve and not off
 * the occupancy episode. Confirmed only when negation clears the half bar,
 * the rise is in the glow, and the same steps with true targets do not.
 */
export function manipulateVerdict(input: {
  learns: Call;
  stores: Call;
  forgets: Call;
  pattern: Call;
  absent: Call;
}): ManipulateVerdict {
  if (input.learns !== "confirmed" || input.stores !== "confirmed") return "inconclusive";
  if (input.forgets === "refuted") return "refuted";
  if (input.forgets !== "confirmed" || input.pattern !== "confirmed") return "inconclusive";
  if (input.absent === "refuted") return "confirmed";
  if (input.absent === "confirmed") return "confounded";
  return "inconclusive";
}

export function periodLock(halves: readonly (number | null)[], nSeeds: number): {
  ok: boolean;
  half: number | null;
  period: number | null;
  steps: number | null;
  n: number;
  mean: number | null;
} {
  const kept: number[] = [];
  for (const h of halves) if (h != null) kept.push(h);
  const none = { ok: false, half: null, period: null, steps: null, n: kept.length, mean: null };
  if (!(kept.length * 2 > nSeeds)) return none;
  const mean = meanOf(kept);
  const half = Math.round(mean);
  const steps = episodeLength(half);
  if (steps == null) return { ok: false, half, period: null, steps: null, n: kept.length, mean };
  return { ok: true, half, period: 2 * half, steps, n: kept.length, mean };
}

/** True when the renewal is large enough that the dose curve can see it. */
export function renewalVisible(gap: Ends, dose = DOSE_VISIBLE) {
  return !(gap.hi < dose);
}

export function negateInstrument(shapeAtGateDose: Call): Call {
  if (shapeAtGateDose === "confirmed") return "confirmed";
  if (shapeAtGateDose === "refuted") return "refuted";
  return "inconclusive";
}

export function negateSummary(input: {
  fed: boolean;
  instrument: Call;
  random: Call;
  rho: Call;
  others: readonly Call[];
}): NegateSummary {
  if (!input.fed) return "unfed";
  if (input.instrument !== "confirmed") return "instrument-blind";
  if (input.random === "confirmed" || input.random === "refuted") return "confounded";
  if (input.rho === "confirmed") {
    if (input.others.some((call) => call === "confirmed")) return "shared";
    return "confirmed";
  }
  if (input.rho === "refuted") return "refuted";
  return "inconclusive";
}

/** Confirmed only when rho cycles and count, surprise, and RND do not. */
export function negateVerdict(summary: NegateSummary): "confirmed" | "refuted" | "inconclusive" {
  if (summary === "confirmed") return "confirmed";
  if (summary === "refuted" || summary === "shared") return "refuted";
  return "inconclusive";
}

export function widthIndex(hidden: number) {
  const index = (NEGATE_WIDTHS as readonly number[]).indexOf(hidden);
  if (index < 0) throw new Error(`width ${hidden} is not on the negate list`);
  return index;
}

export function learnSalt(hidden: number) {
  return 37000 + widthIndex(hidden);
}
export function storeSalt(hidden: number) {
  return 37010 + widthIndex(hidden);
}
export function negateOverwriteSalt(hidden: number) {
  return 37100 + widthIndex(hidden);
}
export function negateErasureSalt(hidden: number) {
  return 37200 + widthIndex(hidden);
}
export function glowRiseSalt(hidden: number) {
  return 37210 + widthIndex(hidden);
}
export function contOverwriteSalt(hidden: number) {
  return 37300 + widthIndex(hidden);
}
export function contErasureSalt(hidden: number) {
  return 37400 + widthIndex(hidden);
}
export function rectSalt(hidden: number) {
  return 37500 + widthIndex(hidden);
}
export function rawSalt(hidden: number) {
  return 37600 + widthIndex(hidden);
}
export function dropSalt(hidden: number) {
  return 37700 + widthIndex(hidden);
}
export function halfSalt(hidden: number) {
  return 37800 + widthIndex(hidden);
}
export function amplitudeSalt(explorer: number) {
  return 38100 + explorer;
}
export function phaseSalt(explorer: number) {
  return 38200 + explorer;
}
export function eastSalt(explorer: number) {
  return 38300 + explorer;
}
/** Dose index 0 is 0.0085. Dose index 1 is 0.05. */
export function waveSalt(doseIndex: number, explorer: number) {
  return 38400 + 10 * doseIndex + explorer;
}
export function wavePhaseSalt(doseIndex: number, explorer: number) {
  return 38500 + 10 * doseIndex + explorer;
}
export function waveEastSalt(doseIndex: number, explorer: number) {
  return 38600 + 10 * doseIndex + explorer;
}
