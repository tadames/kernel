/**
 * Calls for the relearning study. The rules are the preregistration in
 * JOURNAL.md. A CI that only includes zero is inconclusive.
 *
 * The curve is the negated-target curve. The new measurement is the first
 * 80 steps of original learning, and the doorway score on the erased brain
 * against the mastered brain. No occupancy episode is run.
 */
import type { Call } from "./noise.ts";

/** Shipped width. The net that stored the glow and cleared the half bar. */
export const RELEARN_HIDDEN = 32;

/**
 * West lip of the door on the cycle map. `dividerX(15)` is 9 and `doorY(15)`
 * is 7. The cell is region 0. East lands in region 1. The other four actions
 * do not. Not searched.
 */
export const DOOR_X = 9;
export const DOOR_Y = 7;

/** Means over seeds 1–200 in `bench/negate/negate.json`. A miss aborts. */
export const PUBLISHED_NEGATE_OVERWRITE = 0.08763105034106822;
export const PUBLISHED_RAW_HELD = 0.005807579870458458;
export const PUBLISHED_RAW_NEGATE = -0.01954583792599607;
export const PUBLISHED_DROP_HELD = 0.000993185790499048;
export const PUBLISHED_DROP_NEGATE = 0.038415340640057;

/** Seed 1 of that file. The unit test checks the path against these. */
export const SEED1_LEARN = 0.1575989905941843;
export const SEED1_OVERWRITE = 0.10552288499697605;
export const SEED1_RAW_HELD = 0.005103453659792783;
export const SEED1_RAW_NEGATE = -0.019637824964059934;
export const SEED1_DROP_HELD = 0.0013868295966233263;
export const SEED1_DROP_NEGATE = 0.05316073884019307;

export type RelearnSummary =
  | "unreproduced"
  | "no-origin"
  | "no-drop"
  | "not-falling"
  | "no-arrival"
  | "paid"
  | "hidden"
  | "shared"
  | "policy"
  | "immune"
  | "rnd"
  | "level"
  | "level-fast"
  | "level-open";

export type RelearnCalls = {
  /** Raw progress, negation minus held. Refuted reproduces the no-renewal gap. */
  held: Call;
  /** Raw progress on the first 80 steps of original learning. Confirmed means it pays. */
  origin: Call;
  /** 20-step probe drop on the true return after negation. Confirmed means the probe falls. */
  drop: Call;
  /** Online surprise at step 0 minus surprise at step 80, on that return. */
  fall: Call;
  /** Surprise minus the ema on the first true step after negation. */
  arrival: Call;
  /** Raw progress on that return. Refuted means the mean lies entirely below 0. */
  progress: Call;
  /** Realized-error doorway, negation minus held. */
  rawDoor: Call;
  /** Rho's policy score at the same door. */
  rhoDoor: Call;
  /** Shipped surprise signal, which is Bernoulli confidence, at the same door. */
  surpriseDoor: Call;
  /** RND error of the imagined window, at the same door. */
  rndDoor: Call;
  /**
   * 20-step probe drop, negation minus the first 20 steps of original learning.
   * Refuted means relearning is smaller per step. Confirmed means it is larger.
   */
  slope: Call;
};

/**
 * First match wins. `level` is the predicted summary: the probe and the
 * online surprise fall, progress is negative anyway, raw error at the door
 * prefers the erased room, and rho, confidence, and RND do not. The slope
 * is smaller than original learning. `level-fast` and `level-open` are the
 * same signs with a slope that is larger or unresolved.
 */
export function relearnSummary(input: RelearnCalls): RelearnSummary {
  if (input.held !== "refuted") return "unreproduced";
  if (input.origin !== "confirmed") return "no-origin";
  if (input.drop !== "confirmed") return "no-drop";
  if (input.fall !== "confirmed") return "not-falling";
  if (input.arrival !== "confirmed") return "no-arrival";
  if (input.progress !== "refuted") return "paid";
  if (input.rawDoor !== "confirmed") return "hidden";
  if (input.rhoDoor === "confirmed" && input.surpriseDoor === "confirmed") return "shared";
  if (input.rhoDoor === "confirmed") return "policy";
  if (input.surpriseDoor === "confirmed") return "immune";
  if (input.rndDoor === "confirmed") return "rnd";
  if (input.slope === "refuted") return "level";
  if (input.slope === "confirmed") return "level-fast";
  return "level-open";
}

/**
 * Headline. Confirmed when progress is negative while the probe and the
 * online surprise fall, and the shipped scores miss a room the realized
 * error sees. The slope subclass does not flip it.
 */
export function relearnVerdict(summary: RelearnSummary): "confirmed" | "refuted" | "inconclusive" {
  if (summary === "level" || summary === "level-fast" || summary === "level-open") return "confirmed";
  if (summary === "paid" || summary === "shared" || summary === "policy" || summary === "immune" || summary === "rnd") {
    return "refuted";
  }
  return "inconclusive";
}

/**
 * Slope call. The prediction is that relearning's 20-step probe drop is
 * smaller, which is `greaterCall` refuted on negation minus original.
 */
export function slopeVerdict(slope: Call): "confirmed" | "refuted" | "inconclusive" {
  if (slope === "refuted") return "confirmed";
  if (slope === "confirmed") return "refuted";
  return "inconclusive";
}

export function slopeSalt() {
  return 39001;
}
export function originSalt() {
  return 39002;
}
export function dropSalt() {
  return 39003;
}
export function fallSalt() {
  return 39004;
}
export function arrivalSalt() {
  return 39005;
}
export function progressSalt() {
  return 39006;
}
export function heldSalt() {
  return 39007;
}
export function rawDoorSalt() {
  return 39008;
}
export function rhoDoorSalt() {
  return 39009;
}
export function surpriseDoorSalt() {
  return 39010;
}
export function rndDoorSalt() {
  return 39011;
}
export function countDoorSalt() {
  return 39012;
}
