/**
 * Calls for the stationary-noise study. The rules are the preregistration.
 * A CI that only includes zero is inconclusive, not a pass and not a fail,
 * except where a rule below says otherwise.
 */
import { ols } from "./period.ts";
import { majority, meanOf } from "./stats.ts";
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
 * Smallest dose whose occupancy excess lies entirely above 0.
 * Null when no dose on the grid detects.
 */
export function smallestDetecting(adds: readonly number[], calls: readonly Call[]): number | null {
  let best: number | null = null;
  for (let i = 0; i < adds.length; i++) {
    if (calls[i] !== "confirmed") continue;
    const add = adds[i]!;
    if (best == null || add < best) best = add;
  }
  return best;
}

/**
 * Rho's occupancy first clears at 0.05 and does not clear at 0.0169.
 * Both numbers are the PR #11 dose curve. They are not re-estimated here.
 */
export const RHO_DETECT_DOSE = 0.05;
export const RHO_UNDETECT_DOSE = 0.0169;

/** Published detection dose of each directed explorer, same curve. */
export const CHANNEL_DETECT_DOSE = {
  count: 0.05,
  surprise: 0.0169,
  rnd: 0.0169,
  rho: RHO_DETECT_DOSE,
} as const;

export type DosePlacement = "below" | "above" | "spans" | "too-few";

/**
 * Where a paired gap sits relative to one additive dose.
 * Below: the CI lies entirely under the dose. Above: the lower end is at
 * or above the dose. Too-few: the eligible seeds are not a majority.
 */
export function dosePlacement(ci: Ends, nSeeds: number, nEligible: number, dose: number): DosePlacement {
  if (!(nEligible * 2 > nSeeds)) return "too-few";
  if (ci.hi < dose) return "below";
  if (ci.lo >= dose) return "above";
  return "spans";
}

export type RhoGapBand =
  | "below-undetectable"
  | "rho-blind-band"
  | "at-or-above-detectable"
  | "spans-detectable"
  | "too-few";

/**
 * Placement of rho's rectified-progress gap on the dose curve.
 * Below 0.0169 is under every directed detection dose. The rho-blind band
 * is under 0.05 and not entirely under 0.0169: surprise and RND detect a
 * bonus of that size, and rho does not.
 */
export function rhoGapBand(ci: Ends, nSeeds: number, nEligible: number): RhoGapBand {
  const place = dosePlacement(ci, nSeeds, nEligible, RHO_DETECT_DOSE);
  if (place === "too-few") return "too-few";
  if (place === "above") return "at-or-above-detectable";
  if (place === "spans") return "spans-detectable";
  if (ci.hi < RHO_UNDETECT_DOSE) return "below-undetectable";
  return "rho-blind-band";
}

export type DriftGapSummary = "confirmed" | "refuted" | "inconclusive";

/** Confirmed: the gap is below 0.05, so the occupancy null matches the curve. */
export function driftGapSummary(band: RhoGapBand): DriftGapSummary {
  if (band === "below-undetectable" || band === "rho-blind-band") return "confirmed";
  if (band === "at-or-above-detectable") return "refuted";
  return "inconclusive";
}

export type BoostSummary = "confirmed" | "refuted" | "above-gap" | "insensitive" | "confounded" | "inconclusive";

/**
 * Rho is sensitive at the locked progress gap when its excess there lies
 * entirely above 0. A first detection above `far` (or none) is insensitive.
 * A first detection above the gap and at or below `far` is above-gap.
 * Random excluding 0 confounds the contrast. A negative excess at the gap
 * refutes the preference.
 */
export function boostSummary(
  randomExcludesZero: boolean,
  rhoAtGap: Call,
  smallest: number | null,
  gap: number,
  far: number,
): BoostSummary {
  if (randomExcludesZero) return "confounded";
  if (rhoAtGap === "confirmed") return "confirmed";
  if (rhoAtGap === "refuted") return "refuted";
  if (smallest == null || smallest > far) return "insensitive";
  if (smallest > gap) return "above-gap";
  return "inconclusive";
}

/** Shipped softmax temperature. The sharp instrument is the colder value. */
export const SHIPPED_POLICY_TEMPERATURE = 0.45;
export const SHARP_POLICY_TEMPERATURE = 0.15;

export type SharpVerdict = {
  /** Kept only when the occupancy gain clears and no safety arm is hurt. */
  verdict: "kept" | "reverted";
  beats: Call;
  probeHurt: boolean;
  livesHurt: boolean;
  g2Hurt: boolean;
  c2Hurt: boolean;
};

/**
 * Temperature 0.15 against 0.45. `excessGain` is sharp excess minus shipped
 * excess. Probe and lives deltas are sharp minus shipped: entirely above 0
 * is a hurt. G2 and C2 are hurt when the shipped arm holds a majority and
 * the sharp arm does not.
 */
export function sharpVerdict(input: {
  excessGain: Ends;
  probeDelta: Ends;
  livesDelta: Ends;
  g2Shipped: boolean[];
  g2Sharp: boolean[];
  c2Shipped: boolean[];
  c2Sharp: boolean[];
}): SharpVerdict {
  const beats = greaterCall(input.excessGain);
  const probeHurt = greaterCall(input.probeDelta) === "confirmed";
  const livesHurt = greaterCall(input.livesDelta) === "confirmed";
  const g2Hurt = majority(input.g2Shipped) && !majority(input.g2Sharp);
  const c2Hurt = majority(input.c2Shipped) && !majority(input.c2Sharp);
  const kept = beats === "confirmed" && !probeHurt && !livesHurt && !g2Hurt && !c2Hurt;
  return { verdict: kept ? "kept" : "reverted", beats, probeHurt, livesHurt, g2Hurt, c2Hurt };
}

/**
 * The dose-response hypothesis. Confirmed when the smallest detecting dose
 * is at or below 0.0169. Refuted when no dose detects, or the first one
 * sits above that gap. No third label.
 */
export function sensitivityCall(threshold: number | null, target = RHO_UNDETECT_DOSE): Call {
  if (threshold != null && threshold <= target) return "confirmed";
  return "refuted";
}

/** No attraction: the lower end is not above 0. Entirely above 0 refutes it. */
export function noAttractionCall(excess: Ends): Call {
  if (excess.lo > 0) return "refuted";
  return "confirmed";
}

/**
 * Directional repulsion. Entirely below 0 confirms it. Entirely above 0
 * refutes it. An interval that contains 0 is inconclusive.
 */
export function repulsionCall(excess: Ends): Call {
  if (excess.hi < 0) return "confirmed";
  if (excess.lo > 0) return "refuted";
  return "inconclusive";
}

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

export type DoorwaySummary = "confirmed" | "refuted" | "inconclusive";

/**
 * Doorway deficit, drift minus held, at the adaptation rate and at the fast rate.
 * Both arguments are `repulsionCall`: confirmed means the interval lies entirely below 0.
 * Confirmed: the fast rate repels and the adaptation rate does not resolve.
 * Refuted: either rate prefers the drifting room, both rates repel, or only the
 * adaptation rate repels. Otherwise the choice did not resolve a repulsion.
 */
export function doorwaySummary(atTau: Call, atFast: Call): DoorwaySummary {
  if (atTau === "refuted" || atFast === "refuted") return "refuted";
  if (atFast === "confirmed" && atTau === "inconclusive") return "confirmed";
  if (atFast === "confirmed" && atTau === "confirmed") return "refuted";
  if (atTau === "confirmed") return "refuted";
  return "inconclusive";
}

export type CompeteMixed = "attracted" | "repelled" | "null-with-sensitivity" | "inconclusive";

export type CompeteSummary = "swamped" | "found" | "pure-miss" | "unresolved" | "confounded";

/**
 * Pattern-channel occupancy, pattern minus matched noise.
 * `pure` is greaterCall when every open cell is the pattern.
 * `mixed` is the third-of-cells class, using δ from the pure lower end
 * only when `pure` is confirmed.
 * Found: the third still attracts, so noise did not hide the channel.
 * Swamped: the pure room attracts and the third is a sensitive null or a repulsion.
 * Pure-miss: the pure room does not attract and the third does not either.
 * Unresolved: the pure room attracts and the third includes 0 outside δ.
 * Confounded: random's excess excludes 0.
 */
export function competeSummary(randomExcludesZero: boolean, pure: Call, mixed: CompeteMixed): CompeteSummary {
  if (randomExcludesZero) return "confounded";
  if (mixed === "attracted") return "found";
  if (pure !== "confirmed") return "pure-miss";
  if (mixed === "null-with-sensitivity" || mixed === "repelled") return "swamped";
  return "unresolved";
}

/**
 * Confirmed is the swamped failure. Refuted is a third that still attracts,
 * or a pure room rho prefers less than noise. Anything else is inconclusive.
 */
export function competeVerdict(summary: CompeteSummary, pure: Call): Call {
  if (summary === "swamped") return "confirmed";
  if (summary === "found") return "refuted";
  if (summary === "pure-miss" && pure === "refuted") return "refuted";
  return "inconclusive";
}

/**
 * Half-width target for the pattern doorway contrast at 800 seeds.
 * The adaptation-rate doorway interval was 0.0079 [−0.0269, 0.0435], n = 199,
 * half-width 0.0352, seed SD about 0.253. At 800 seeds the normal half-width
 * is about 0.0176. A planted-bonus lower end at or above this bar is wider
 * than twice that half-width, so a content interval that includes 0 is a
 * sensitive null. The class still uses the instrument's own lower end.
 */
export const CREDIT_POWER_DELTA = 0.036;

export type CreditSummary = "blind" | "against" | "offered" | "unresolved" | "no-instrument" | "confounded";

export type CreditClass = "attracted" | "repelled" | "null-with-sensitivity" | "inconclusive";

/** Planted doorway gap. Too few eligible seeds is inconclusive and does not call a sign. */
export function creditInstrumentCall(excess: Ends, n: number, nSeeds: number): Call {
  if (!(n * 2 > nSeeds)) return "inconclusive";
  return greaterCall(excess);
}

/**
 * Pattern minus noise, same majority rule, then the phase-diagram class.
 * Sign comes before the null. δ is the instrument's lower end, or null
 * when the planted bonus did not clear.
 */
export function creditContentClass(excess: Ends, n: number, nSeeds: number, delta: number | null): CreditClass {
  if (!(n * 2 > nSeeds)) return "inconclusive";
  if (excess.lo > 0) return "attracted";
  if (excess.hi < 0) return "repelled";
  if (delta != null && delta > 0 && excess.lo > -delta && excess.hi < delta) return "null-with-sensitivity";
  return "inconclusive";
}

/**
 * Doorway score of the pure pattern against matched noise, once a planted
 * bonus of 0.0169 has been shown to move that score.
 * Blind: the choice does not resolve a preference inside δ.
 * Against: the choice prefers the noise room.
 * Offered: the choice prefers the pattern.
 * Unresolved: the interval is too wide to class.
 * No-instrument: the planted bonus did not clear, so δ is unavailable.
 * Confounded: random's content gap or the planted gap excludes 0.
 */
export function creditSummary(randomExcludesZero: boolean, instrument: Call, content: CreditClass): CreditSummary {
  if (randomExcludesZero) return "confounded";
  if (instrument !== "confirmed") return "no-instrument";
  if (content === "null-with-sensitivity") return "blind";
  if (content === "repelled") return "against";
  if (content === "attracted") return "offered";
  return "unresolved";
}

/**
 * Confirmed: the pattern is not offered at the choice.
 * Refuted: the choice prefers the pattern.
 * Otherwise inconclusive.
 */
export function creditVerdict(summary: CreditSummary): Call {
  if (summary === "blind" || summary === "against") return "confirmed";
  if (summary === "offered") return "refuted";
  return "inconclusive";
}

export type ChainLink =
  | "absent"
  | "gated"
  | "cancelled"
  | "offered"
  | "reversed"
  | "elsewhere"
  | "unresolved"
  | "confounded";

/**
 * A score term carries a plant-sized doorway gap when its interval excludes 0
 * and is not strictly inside (−δ, δ). A sign that stays inside δ does not carry.
 */
export function chainCarry(excess: Ends, delta: number): boolean {
  if (!(delta > 0)) return false;
  if (excess.lo > 0 && excess.hi >= delta) return true;
  if (excess.hi < 0 && excess.lo <= -delta) return true;
  return false;
}

/**
 * Where the pattern's progress edge is lost on the way into the doorway score.
 * `rho` is the action-conditional progress term in score units.
 * `raw` is max(0, ρ̂) before that term multiplies by explore.
 * The other four are the remaining additive pieces of the score.
 * Classes are `creditContentClass`. `carry` is `chainCarry` on that piece.
 * Absent: ρ̂ and its score term are sensitive nulls, and no other piece carries.
 * Gated: raw ρ̂ prefers the pattern and the score term does not resolve.
 * Cancelled: the progress term and another piece resolve opposite signs.
 * Offered: the progress term prefers the pattern and nothing opposes it.
 * Reversed: the progress term, or raw ρ̂, prefers the noise room.
 * Elsewhere: the progress pieces are sensitive nulls and another piece carries.
 * Confounded: random's gap excludes 0.
 */
export function chainSummary(
  randomExcludesZero: boolean,
  rho: CreditClass,
  raw: CreditClass,
  uncertainty: CreditClass,
  global: CreditClass,
  extrinsic: CreditClass,
  follow: CreditClass,
  carry: { uncertainty: boolean; global: boolean; extrinsic: boolean; follow: boolean },
): ChainLink {
  if (randomExcludesZero) return "confounded";
  const others: CreditClass[] = [uncertainty, global, extrinsic, follow];
  const rhoAttracted = rho === "attracted";
  const rhoRepelled = rho === "repelled";
  const opposed =
    (rhoAttracted && others.some((klass) => klass === "repelled")) ||
    (rhoRepelled && others.some((klass) => klass === "attracted"));
  if (opposed) return "cancelled";
  if (rhoAttracted) return "offered";
  if (rhoRepelled || raw === "repelled") return "reversed";
  if (raw === "attracted" && rho === "null-with-sensitivity") return "gated";
  const progressNull = rho === "null-with-sensitivity" && raw === "null-with-sensitivity";
  const carried = carry.uncertainty || carry.global || carry.extrinsic || carry.follow;
  if (progressNull && carried) return "elsewhere";
  const settled = (klass: CreditClass, didCarry: boolean) =>
    klass === "null-with-sensitivity" || ((klass === "attracted" || klass === "repelled") && !didCarry);
  if (
    progressNull &&
    settled(uncertainty, carry.uncertainty) &&
    settled(global, carry.global) &&
    settled(extrinsic, carry.extrinsic) &&
    settled(follow, carry.follow)
  ) {
    return "absent";
  }
  return "unresolved";
}

/**
 * Confirmed: the in-room edge is absent from ρ̂ and from every plant-sized
 * piece of the doorway score. Refuted: the edge is gated, cancelled, offered,
 * reversed, or sitting in another piece. Otherwise inconclusive.
 */
export function chainVerdict(summary: ChainLink): Call {
  if (summary === "absent") return "confirmed";
  if (
    summary === "gated" ||
    summary === "cancelled" ||
    summary === "offered" ||
    summary === "reversed" ||
    summary === "elsewhere"
  ) {
    return "refuted";
  }
  return "inconclusive";
}

export type ReachLink =
  | "absent"
  | "credit"
  | "cancelled"
  | "reached"
  | "reversed"
  | "flipped"
  | "opposed"
  | "pooled"
  | "unresolved"
  | "confounded";

/**
 * Where the retrospective edge is lost before ρ̂ is formed.
 * The six piece classes are the scent/bonus slot, the horizon-2 drop, and
 * the horizon-3 drop, first as a doorway preference and then as an in-room
 * level. The two sums are those three pieces added, at the same two places.
 * Sign comes before size. A class of attracted or repelled is a sign,
 * including one that stays inside δ. `chainCarry` is reported and is not
 * this summary.
 * Absent: all eight are sensitive nulls. The edge is not in any piece and
 * not in the sum, in the room or at the door.
 * Cancelled: the doorway pieces resolve both signs.
 * Reached: a doorway piece prefers the pattern and none prefers the noise.
 * Reversed: a doorway piece prefers the noise and none prefers the pattern.
 * Opposed: the doorway pieces are sensitive nulls and the in-room pieces
 * resolve both signs.
 * Credit: the doorway pieces are sensitive nulls and an in-room piece
 * prefers the pattern.
 * Flipped: the doorway pieces are sensitive nulls and an in-room piece
 * prefers the noise.
 * Pooled: every piece is a sensitive null and a sum is not.
 * Confounded: random's gap excludes 0.
 */
export function reachSummary(
  randomExcludesZero: boolean,
  doorBonus: CreditClass,
  doorDrop2: CreditClass,
  doorDrop3: CreditClass,
  roomBonus: CreditClass,
  roomDrop2: CreditClass,
  roomDrop3: CreditClass,
  doorSum: CreditClass,
  roomSum: CreditClass,
): ReachLink {
  if (randomExcludesZero) return "confounded";
  const door = [doorBonus, doorDrop2, doorDrop3];
  const room = [roomBonus, roomDrop2, roomDrop3];
  const attracted = (klass: CreditClass[]) => klass.some((item) => item === "attracted");
  const repelled = (klass: CreditClass[]) => klass.some((item) => item === "repelled");
  if (attracted(door) && repelled(door)) return "cancelled";
  if (attracted(door)) return "reached";
  if (repelled(door)) return "reversed";
  const doorNull = door.every((item) => item === "null-with-sensitivity");
  if (doorNull && attracted(room) && repelled(room)) return "opposed";
  if (doorNull && attracted(room)) return "credit";
  if (doorNull && repelled(room)) return "flipped";
  const piecesNull = doorNull && room.every((item) => item === "null-with-sensitivity");
  if (piecesNull && (doorSum === "attracted" || doorSum === "repelled" || roomSum === "attracted" || roomSum === "repelled")) {
    return "pooled";
  }
  if (piecesNull && doorSum === "null-with-sensitivity" && roomSum === "null-with-sensitivity") return "absent";
  return "unresolved";
}

/**
 * Confirmed: the retrospective edge is a sensitive null in every piece of
 * ρ̂ and in both sums. Refuted: a piece or a sum resolves, or the doorway
 * pieces cancel. Otherwise inconclusive.
 */
export function reachVerdict(summary: ReachLink): Call {
  if (summary === "absent") return "confirmed";
  if (
    summary === "credit" ||
    summary === "cancelled" ||
    summary === "reached" ||
    summary === "reversed" ||
    summary === "flipped" ||
    summary === "opposed" ||
    summary === "pooled"
  ) {
    return "refuted";
  }
  return "inconclusive";
}

export type InvertLink =
  | "scale"
  | "rectified"
  | "selected"
  | "variance"
  | "lag"
  | "window"
  | "intrinsic"
  | "unreproduced"
  | "unresolved"
  | "confounded";

/**
 * Why the in-room horizon-2 drop prefers noise while retrospective progress
 * prefers the pattern. Every class is pattern minus matched noise.
 * `rect` is the shipped `max(0, res1 − res2*)`.
 * `signed` removes that rectification.
 * `mean` replaces the score-winning follow-up with the unweighted mean.
 * `scale` divides the shipped drop by the first-window residual.
 * `early` keeps the shipped drop on the first half of the episode.
 * `spread` is the cross-action range of the follow-up residual.
 * `step` is rectified one-step surprise drop on the same ticks.
 * `ema` is rectified 50-step progress on the same ticks.
 * A correction restores the sign when its class is not repelled.
 * The first match wins.
 * Variance: the raw score-selected drop is a sensitive null and the noise
 * room has the wider follow-up range, so the clip of that range is the sign.
 * Rectified: removing the clip restores the sign and variance does not apply.
 * Selected: the raw drop prefers noise and the mean follow-up does not.
 * Scale: the raw drop and the mean follow-up prefer noise, and dividing by
 * the first-window residual does not.
 * Lag: the early half does not prefer noise, and the corrections above do.
 * Window: every forward correction prefers noise, 50-step progress on the
 * same ticks prefers the pattern, and one-step progress does not.
 * Intrinsic: every forward correction prefers noise and the window case does not.
 * Unreproduced: the shipped drop does not prefer noise.
 * Confounded: random's shipped drop excludes 0.
 */
export function invertSummary(
  randomExcludesZero: boolean,
  rect: CreditClass,
  signed: CreditClass,
  mean: CreditClass,
  scale: CreditClass,
  early: CreditClass,
  spread: CreditClass,
  step: CreditClass,
  ema: CreditClass,
): InvertLink {
  if (randomExcludesZero) return "confounded";
  if (
    rect === "inconclusive" ||
    signed === "inconclusive" ||
    mean === "inconclusive" ||
    scale === "inconclusive" ||
    early === "inconclusive"
  ) {
    return "unresolved";
  }
  if (rect !== "repelled") return "unreproduced";
  if (signed === "null-with-sensitivity") {
    if (spread === "inconclusive") return "unresolved";
    if (spread === "repelled") return "variance";
    return "rectified";
  }
  if (signed !== "repelled") return "rectified";
  if (mean !== "repelled") return "selected";
  if (scale !== "repelled") return "scale";
  if (early !== "repelled") return "lag";
  if (step === "inconclusive" || ema === "inconclusive") return "unresolved";
  if (ema === "attracted" && step !== "attracted") return "window";
  return "intrinsic";
}

/**
 * Confirmed: the inversion is the scale class. The absolute drop prefers
 * noise and dividing by the first-window residual does not.
 * Refuted: rectification, selection, variance, lag, the window, or the
 * imagined residual itself produces the sign.
 * Otherwise inconclusive.
 */
export function invertVerdict(summary: InvertLink): Call {
  if (summary === "scale") return "confirmed";
  if (
    summary === "rectified" ||
    summary === "selected" ||
    summary === "variance" ||
    summary === "lag" ||
    summary === "window" ||
    summary === "intrinsic"
  ) {
    return "refuted";
  }
  return "inconclusive";
}
