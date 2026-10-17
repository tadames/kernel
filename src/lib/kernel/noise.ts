/**
 * Calls for the stationary-noise study. The rules are the preregistration.
 * A CI that only includes zero is inconclusive, not a pass and not a fail,
 * except where a rule below says otherwise.
 */
import { ols } from "./period.ts";
import { meanOf } from "./stats.ts";
import { mulberry32 } from "./presets.ts";

export type Call = "confirmed" | "refuted" | "inconclusive";

/** A seed counts for the room contrast only if the body spent this many steps there. */
export const MIN_ROOM_STEPS = 8;

export type Ends = { lo: number; hi: number };

/** Entirely above 0 is confirmed. Entirely below 0 is refuted. */
export function greaterCall(diff: Ends): Call {
  if (diff.lo > 0) return "confirmed";
  if (diff.hi < 0) return "refuted";
  return "inconclusive";
}

/**
 * Variance correction removes the attraction only when the uncorrected
 * agent was actually attracted. A corrected interval still entirely above
 * 0 refutes the removal. An interval entirely below 0, or a reliable
 * shrinkage whose remainder is not itself above 0, confirms it.
 */
export function seRemovalCall(raw: Ends, corrected: Ends, reduction: Ends): Call {
  if (!(raw.lo > 0)) return "inconclusive";
  if (corrected.lo > 0) return "refuted";
  if (corrected.hi < 0 || reduction.lo > 0) return "confirmed";
  return "inconclusive";
}

/**
 * Attraction grows with noise variance when the high-amplitude excess
 * beats the low-amplitude excess and the middle amplitude sits between them.
 */
export function amplitudeCall(low: number, mid: number, high: number, highMinusLow: Ends): Call {
  if (highMinusLow.hi < 0) return "refuted";
  if (highMinusLow.lo > 0 && low <= mid && mid <= high) return "confirmed";
  return "inconclusive";
}

/**
 * Spurious positive progress in the noise room: the rectified progress
 * there exceeds the rectified progress in the learnable room. Too few
 * seeds that actually entered both rooms makes the contrast inconclusive.
 */
export function spuriousCall(eastMinusWest: Ends, nSeeds: number, nEligible: number): Call {
  if (!(nEligible * 2 > nSeeds)) return "inconclusive";
  return greaterCall(eastMinusWest);
}

/**
 * Joint ablation of the horizon residual drop and the uncertainty term.
 * Confirmed when shipped rho was attracted and the ablated excess is not
 * itself entirely above 0, or the shipped excess reliably exceeds the
 * ablated excess. Refuted when the ablated agent is still attracted and
 * that gap does not clear. Inconclusive when the shipped attraction did
 * not clear.
 */
export function policyTermsCall(shipped: Ends, ablated: Ends, shippedMinusAblated: Ends): Call {
  if (!(shipped.lo > 0)) return "inconclusive";
  const removed = !(ablated.lo > 0);
  const reduced = shippedMinusAblated.lo > 0;
  if (removed || reduced) return "confirmed";
  if (ablated.lo > 0 && !reduced) return "refuted";
  return "inconclusive";
}

export type SplitCall = "both" | "horizon" | "uncertainty" | "conjunction" | "inconclusive";

/**
 * Target-room time under noise minus the same room frozen.
 * Entirely above 0 prefers the noise. Entirely below 0 prefers the static room.
 */
export function matchedContentCall(excess: Ends): Call {
  return greaterCall(excess);
}

export type MatchedSummary = "noise" | "static" | "mixed" | "confounded" | "inconclusive";

/**
 * Label for the five directed calls. Random excluding 0 means the content
 * swap moved a walk that does not read observations, so the label is
 * confounded and the directed calls are not a content effect.
 * All five confirmed: every directed explorer prefers the noise.
 * All five refuted: every one prefers the static room.
 * All five inconclusive: the contrast does not resolve.
 * Anything else is mixed, and the per-explorer calls are the result.
 */
export type FedCall = "closed" | "open" | "inconclusive";

/**
 * Foods close the empty-room gap when that gap was entirely above the
 * walk and the fed excess is not. The gap stays open when the fed excess
 * is entirely above the walk. Otherwise there was no gap to close.
 * A fed interval of [0, 0] is closed when the empty gap was real.
 */
export function fedRoomCall(empty: Ends, fed: Ends): FedCall {
  if (fed.lo > 0) return "open";
  if (empty.lo > 0) return "closed";
  return "inconclusive";
}

export type FedSummary = "empty" | "not-empty" | "mixed" | "confounded" | "inconclusive";

/**
 * All five directed gaps closed: the attractor was the empty room.
 * All five still open: the foods did not close it.
 * Random excluding 0 means the markers moved a walk that does not read
 * observations, so the label is confounded and the directed calls are
 * not an empty-room effect.
 */
export function fedRoomSummary(randomExcludesZero: boolean, directed: FedCall[]): FedSummary {
  if (randomExcludesZero) return "confounded";
  if (directed.length === 0 || directed.every((call) => call === "inconclusive")) return "inconclusive";
  if (directed.every((call) => call === "closed")) return "empty";
  if (directed.every((call) => call === "open")) return "not-empty";
  return "mixed";
}

export type DriftShapeCall = "confirmed" | "refuted" | "inconclusive";

/**
 * Attraction peaks at the adaptation rate. Confirmed when the excess there
 * lies entirely above 0 and entirely above both the slow rate and the fast
 * rate. Refuted when that excess lies entirely below 0, or when it lies
 * entirely below both extremes. Otherwise inconclusive.
 */
export function driftShapeCall(peak: Ends, peakMinusSlow: Ends, peakMinusFast: Ends): DriftShapeCall {
  if (peak.lo > 0 && peakMinusSlow.lo > 0 && peakMinusFast.lo > 0) return "confirmed";
  const trough = peakMinusSlow.hi < 0 && peakMinusFast.hi < 0;
  if (peak.hi < 0 || trough) return "refuted";
  return "inconclusive";
}

export type DriftSummary = "confirmed" | "refuted" | "shared" | "confounded" | "inconclusive";

/**
 * Rho is confirmed only when its shape peaks at the adaptation rate, the
 * held-out initial-pattern probe is worse on the drifting arm there, and
 * no other directed explorer shows the same shape. A random excess that
 * excludes 0 means the pattern moved a walk that does not read it.
 * A confirmed shape with a refuted probe is a refutation: the attraction
 * is not the preregistered learning signature.
 */
export function driftSummary(
  randomExcludesZero: boolean,
  rhoShape: DriftShapeCall,
  rhoProbe: Call,
  otherShapes: DriftShapeCall[],
): DriftSummary {
  if (randomExcludesZero) return "confounded";
  if (rhoShape === "refuted") return "refuted";
  if (rhoShape === "confirmed" && rhoProbe === "refuted") return "refuted";
  if (rhoShape === "confirmed" && rhoProbe === "confirmed") {
    if (otherShapes.some((call) => call === "confirmed")) return "shared";
    return "confirmed";
  }
  return "inconclusive";
}

export function matchedSummary(randomExcludesZero: boolean, directed: Call[]): MatchedSummary {
  if (randomExcludesZero) return "confounded";
  if (directed.length === 0 || directed.every((call) => call === "inconclusive")) return "inconclusive";
  if (directed.every((call) => call === "confirmed")) return "noise";
  if (directed.every((call) => call === "refuted")) return "static";
  return "mixed";
}

/**
 * Which single deletion carries a confirmed joint ablation.
 * A term carries it when removing that term alone is confirmed by
 * policyTermsCall. Both refuted means only the conjunction carries it.
 */
export function policySplitCall(horizon: Call, uncertainty: Call): SplitCall {
  const horizonCarries = horizon === "confirmed";
  const uncertaintyCarries = uncertainty === "confirmed";
  if (horizonCarries && uncertaintyCarries) return "both";
  if (horizonCarries) return "horizon";
  if (uncertaintyCarries) return "uncertainty";
  if (horizon === "refuted" && uncertainty === "refuted") return "conjunction";
  return "inconclusive";
}

export type SlopeFit = {
  slope: number;
  intercept: number;
  lo: number;
  hi: number;
  nWindows: number;
  nBoot: number;
  iters: number;
  call: Call;
  /** Windows whose mean excess was positive and entered the fit. */
  used: number[];
  dropped: number[];
};

/**
 * OLS of log(excess) on log(W). Windows with non-positive mean excess are
 * dropped. The slope is confirmed only when its CI contains −0.5 and lies
 * entirely below 0. A CI that excludes −0.5 refutes that exponent. A CI
 * that contains both −0.5 and 0 is inconclusive. Fewer than 4 positive
 * windows, or a bootstrap that often cannot fit, is inconclusive.
 */
export function logExcessSlope(
  windows: number[],
  excessByWindow: number[][],
  iters = 2000,
  rngSeed = 1907,
): SlopeFit {
  const nSeeds = excessByWindow[0]?.length ?? 0;
  const means = windows.map((_, i) => meanOf(excessByWindow[i] ?? []));
  const used: number[] = [];
  const dropped: number[] = [];
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i]!;
    if (w > 0 && means[i]! > 0) used.push(w);
    else dropped.push(w);
  }
  const point = fitMeans(windows, means);
  if (used.length < 4 || nSeeds < 2) {
    return {
      slope: point.slope,
      intercept: point.intercept,
      lo: point.slope,
      hi: point.slope,
      nWindows: used.length,
      nBoot: 0,
      iters,
      call: "inconclusive",
      used,
      dropped,
    };
  }
  const rand = mulberry32(rngSeed >>> 0);
  const slopes: number[] = [];
  for (let b = 0; b < iters; b++) {
    const bootMeans: number[] = [];
    for (let i = 0; i < windows.length; i++) {
      const xs = excessByWindow[i] ?? [];
      let s = 0;
      for (let k = 0; k < nSeeds; k++) s += xs[(rand() * nSeeds) | 0] ?? 0;
      bootMeans.push(s / nSeeds);
    }
    const fit = fitMeans(windows, bootMeans);
    if (fit.n >= 4) slopes.push(fit.slope);
  }
  slopes.sort((a, b) => a - b);
  const nBoot = slopes.length;
  const lo = nBoot ? slopes[Math.floor(0.025 * nBoot)]! : point.slope;
  const hi = nBoot ? slopes[Math.min(nBoot - 1, Math.ceil(0.975 * nBoot) - 1)]! : point.slope;
  return {
    slope: point.slope,
    intercept: point.intercept,
    lo,
    hi,
    nWindows: used.length,
    nBoot,
    iters,
    call: slopeCall(lo, hi, used.length, nBoot, iters),
    used,
    dropped,
  };
}

function fitMeans(windows: number[], means: number[]) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i]!;
    const m = means[i]!;
    if (!(w > 0) || !(m > 0)) continue;
    xs.push(Math.log(w));
    ys.push(Math.log(m));
  }
  return ols(xs, ys);
}

function slopeCall(lo: number, hi: number, nWindows: number, nBoot: number, iters: number): Call {
  if (nWindows < 4 || nBoot < 0.8 * iters) return "inconclusive";
  const containsHalf = lo <= -0.5 && hi >= -0.5;
  if (containsHalf && hi < 0) return "confirmed";
  if (containsHalf) return "inconclusive";
  return "refuted";
}
