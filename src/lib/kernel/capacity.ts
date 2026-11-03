/**
 * Calls for the capacity-limited revisitation study. The rules are the
 * preregistration in JOURNAL.md. A CI that only includes zero is inconclusive.
 *
 * Weight decay is not this experiment. The shipped 32-unit net does not
 * forget a room by capacity. A narrower cell net can, and the statistic
 * that can see the resulting cycle does not ask the high half to sit on
 * the first half of the episode clock.
 */
import { episodeLength } from "./cycle.ts";
import type { Call, Ends } from "./noise.ts";
import { meanOf } from "./stats.ts";

/** Shipped cell-net width. The control arm. Not a narrow candidate. */
export const SHIPPED_HIDDEN = 32;

/**
 * Locked ladder. 32 is the control. The others are the candidates, widest
 * first when a score ties. No other width is run.
 */
export const CAPACITY_WIDTHS = [32, 16, 8, 4, 2, 1] as const;

export const NARROW_WIDTHS = [16, 8, 4, 2, 1] as const;

/** Erasure bar: interference must undo at least half the learn drop. */
export const HALF_FRACTION = 0.5;

/**
 * Smallest planted bonus that moved rho's occupancy at temperature 0.15.
 * A capacity gap entirely below this cannot feed a cycle the instrument sees.
 */
export const DOSE_VISIBLE = 0.0085;

/** Gate dose for the planted wave. The smaller dose is sensitivity only. */
export const INSTRUMENT_DOSE = 0.05;

export const SENSITIVITY_DOSE = 0.0085;

/** Published width-32 curve, seeds 1–200, stream `seed * 10007 + 9201`. */
export const PUBLISHED_LEARN = 0.1557825436083189;
export const PUBLISHED_INTERFERENCE = 0.00991949544745183;

/** Weight-init and transition stream of the published curve. */
export const CURVE_STREAM = 9201;

/** Return-bout stream. Fresh, so the two arms share transitions. */
export const RETURN_SALT = 0x66c1;

/** Occupancy episodes. Not a stream used by the decay sweeps. */
export const OCCUPANCY_SALT = 24011;

/** Planted-wave episodes. */
export const WAVE_SALT = 24021;

export const PRIMARY_TEMPERATURE = 0.15;

export type CapacityReason =
  | "run"
  | "no-learning"
  | "no-forgetting"
  | "no-renewal"
  | "not-capacity"
  | "below-dose"
  | "period-censored";

export type CapacitySummary =
  | "confirmed"
  | "shared"
  | "refuted"
  | "instrument-blind"
  | "confounded"
  | "inconclusive"
  | "unfed";

export type WidthGate = {
  hidden: number;
  score: number;
  reason: CapacityReason;
};

/** Per-seed Fourier amplitude. Phase shifts cancel in the mean vector and do not cancel here. */
export function amplitudeOf(c: number, s: number) {
  return Math.hypot(c, s);
}

/** Overwrite minus half the learn drop. Positive means the other room erased the bar. */
export function erasureGap(overwrite: number, learnDrop: number) {
  return overwrite - HALF_FRACTION * learnDrop;
}

/**
 * How far a width got. The first failed gate is the reason.
 * `visible` is read only after `exceeds` is confirmed: the capacity gap
 * is not entirely below `DOSE_VISIBLE`.
 */
export function gateWidth(input: {
  learns: Call;
  forgets: Call;
  renews: Call;
  exceeds: Call;
  visible: boolean;
  period: "ok" | "censored";
}): { score: number; reason: CapacityReason } {
  if (input.learns !== "confirmed") return { score: 0, reason: "no-learning" };
  if (input.forgets !== "confirmed") return { score: 1, reason: "no-forgetting" };
  if (input.renews !== "confirmed") return { score: 2, reason: "no-renewal" };
  if (input.exceeds !== "confirmed") return { score: 3, reason: "not-capacity" };
  if (!input.visible) return { score: 4, reason: "below-dose" };
  if (input.period !== "ok") return { score: 5, reason: "period-censored" };
  return { score: 6, reason: "run" };
}

/** Widest width that can feed a cycle. A lower score leaves the hidden null. */
export function selectWidth(rows: readonly WidthGate[]): { hidden: number | null; reason: CapacityReason } {
  if (rows.length === 0) return { hidden: null, reason: "no-learning" };
  let best = rows[0]!;
  for (const row of rows) {
    if (row.score > best.score || (row.score === best.score && row.hidden > best.hidden)) best = row;
  }
  if (best.score < 6) return { hidden: null, reason: best.reason };
  return { hidden: best.hidden, reason: "run" };
}

/**
 * Half-recovery of the interference probe, then the occupancy episode.
 * A majority of seeds must be uncensored, and the rounded mean must fit
 * the map-crossing rule already locked in `episodeLength`.
 */
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

/** True when the capacity gap is large enough that the dose curve can see it. */
export function gapVisible(exceeds: Ends, dose = DOSE_VISIBLE) {
  return !(exceeds.hi < dose);
}

/**
 * The instrument gate is rho at dose 0.05 only. A confirmation at 0.0085
 * does not open the occupancy claim.
 */
export function capacityInstrument(shapeAtGateDose: Call): Call {
  if (shapeAtGateDose === "confirmed") return "confirmed";
  if (shapeAtGateDose === "refuted") return "refuted";
  return "inconclusive";
}

export function capacitySummary(input: {
  fed: boolean;
  instrument: Call;
  random: Call;
  rho: Call;
  others: readonly Call[];
}): CapacitySummary {
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
export function capacityVerdict(summary: CapacitySummary): "confirmed" | "refuted" | "inconclusive" {
  if (summary === "confirmed") return "confirmed";
  if (summary === "refuted" || summary === "shared") return "refuted";
  return "inconclusive";
}

export function widthIndex(hidden: number) {
  const index = (CAPACITY_WIDTHS as readonly number[]).indexOf(hidden);
  if (index < 0) throw new Error(`width ${hidden} is not on the ladder`);
  return index;
}

/** Bootstrap salts. Width index follows `CAPACITY_WIDTHS`. Explorer index is the signal order. */
export function learnSalt(hidden: number) {
  return 33000 + widthIndex(hidden);
}
export function overwriteSalt(hidden: number) {
  return 33100 + widthIndex(hidden);
}
export function erasureSalt(hidden: number) {
  return 33200 + widthIndex(hidden);
}
export function rectSalt(hidden: number) {
  return 33300 + widthIndex(hidden);
}
export function rawSalt(hidden: number) {
  return 33400 + widthIndex(hidden);
}
export function dropSalt(hidden: number) {
  return 33500 + widthIndex(hidden);
}
export function halfSalt(hidden: number) {
  return 33600 + widthIndex(hidden);
}
export function amplitudeSalt(explorer: number) {
  return 33700 + explorer;
}
export function phaseSalt(explorer: number) {
  return 33800 + explorer;
}
export function eastSalt(explorer: number) {
  return 33900 + explorer;
}
/** Dose index 0 is 0.0085. Dose index 1 is 0.05. */
export function waveSalt(doseIndex: number, explorer: number) {
  return 34000 + 10 * doseIndex + explorer;
}
export function wavePhaseSalt(doseIndex: number, explorer: number) {
  return 35000 + 10 * doseIndex + explorer;
}
export function waveEastSalt(doseIndex: number, explorer: number) {
  return 36000 + 10 * doseIndex + explorer;
}
export function exceedsSalt(hidden: number) {
  return 34100 + widthIndex(hidden);
}
