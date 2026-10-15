/**
 * Learning-progress window. The shipped estimator is one EMA of surprise
 * minus the current surprise. The EMA time constant is 50 steps (rate 0.02).
 * Confidence keeps that rate. A swept window uses its own baseline.
 * The variance-corrected estimator is a held-out split of the same window:
 * older half versus newer half, minus one standard error of that difference.
 */
export const SHIPPED_PROGRESS_WINDOW = 50;

/** Six log-spaced windows, from 4× below the shipped window to 8× above it. */
export const PROGRESS_WINDOWS = [12.5, 25, 50, 100, 200, 400] as const;

export type ProgressMode = "ema" | "se";

export const HIST_LO = -0.15;
export const HIST_HI = 0.15;
export const HIST_BINS = 60;

/**
 * Difference of two disjoint window means, minus one standard error.
 * `ring[oldest]` is the oldest sample. Length is `2 * window`.
 * The first half is the past estimate. The second half is the recent one.
 * They share no samples.
 */
export function heldOutProgressRing(ring: ArrayLike<number>, oldest: number, window: number): number {
  const w = window;
  const cap = w * 2;
  let pastSum = 0;
  let pastSq = 0;
  let recentSum = 0;
  let recentSq = 0;
  for (let i = 0; i < w; i++) {
    const p = ring[(oldest + i) % cap]!;
    pastSum += p;
    pastSq += p * p;
  }
  for (let i = 0; i < w; i++) {
    const r = ring[(oldest + w + i) % cap]!;
    recentSum += r;
    recentSq += r * r;
  }
  const mp = pastSum / w;
  const mr = recentSum / w;
  const vp = (pastSq - (pastSum * pastSum) / w) / (w - 1);
  const vr = (recentSq - (recentSum * recentSum) / w) / (w - 1);
  const se = Math.sqrt(Math.max(0, vp) / w + Math.max(0, vr) / w);
  return mp - mr - se;
}

export type ProgressAccum = {
  n: number;
  sum: number;
  sumSq: number;
  positive: number;
  rectSum: number;
  policySum: number;
};

export type RoomProgress = {
  n: number;
  mean: number;
  variance: number;
  fracPositive: number;
  rectifiedMean: number;
  policyMean: number;
};

export function emptyAccum(): ProgressAccum {
  return { n: 0, sum: 0, sumSq: 0, positive: 0, rectSum: 0, policySum: 0 };
}

export function pushProgress(acc: ProgressAccum, raw: number, policy: number) {
  acc.n += 1;
  acc.sum += raw;
  acc.sumSq += raw * raw;
  if (raw > 0) acc.positive += 1;
  acc.rectSum += raw > 0 ? raw : 0;
  acc.policySum += policy > 0 ? policy : 0;
}

export function finishProgress(acc: ProgressAccum): RoomProgress {
  if (acc.n <= 0) {
    return { n: 0, mean: 0, variance: 0, fracPositive: 0, rectifiedMean: 0, policyMean: 0 };
  }
  const mean = acc.sum / acc.n;
  const variance = acc.n > 1 ? (acc.sumSq - (acc.sum * acc.sum) / acc.n) / (acc.n - 1) : 0;
  return {
    n: acc.n,
    mean,
    variance: Math.max(0, variance),
    fracPositive: acc.positive / acc.n,
    rectifiedMean: acc.rectSum / acc.n,
    policyMean: acc.policySum / acc.n,
  };
}

export function emptyHist() {
  return { bins: new Array<number>(HIST_BINS).fill(0), under: 0, over: 0 };
}

export type Hist = ReturnType<typeof emptyHist>;

export function pushHist(hist: Hist, raw: number) {
  if (raw < HIST_LO) {
    hist.under += 1;
    return;
  }
  if (raw >= HIST_HI) {
    hist.over += 1;
    return;
  }
  const t = (raw - HIST_LO) / (HIST_HI - HIST_LO);
  const bin = Math.min(HIST_BINS - 1, Math.floor(t * HIST_BINS));
  hist.bins[bin] = (hist.bins[bin] ?? 0) + 1;
}

export function addHist(into: Hist, extra: Hist) {
  for (let i = 0; i < HIST_BINS; i++) into.bins[i] = (into.bins[i] ?? 0) + (extra.bins[i] ?? 0);
  into.under += extra.under;
  into.over += extra.over;
}
