/**
 * Bootstrap percentile intervals. Paired diffs use the same seeds on both arms.
 */
import { mulberry32 } from "./presets.ts";

export type Interval = {
  mean: number;
  lo: number;
  hi: number;
  n: number;
};

export function meanOf(xs: number[]) {
  if (xs.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i]!;
  return s / xs.length;
}

/** 95% percentile bootstrap CI of the mean. `seed` makes the interval reproducible. */
export function bootstrapMeanCI(xs: number[], iters = 2000, alpha = 0.05, seed = 1): Interval {
  const n = xs.length;
  if (n === 0) return { mean: 0, lo: 0, hi: 0, n: 0 };
  const point = meanOf(xs);
  if (n === 1) return { mean: point, lo: point, hi: point, n: 1 };
  const rand = mulberry32(seed >>> 0);
  const means = new Float64Array(iters);
  for (let i = 0; i < iters; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += xs[(rand() * n) | 0]!;
    means[i] = s / n;
  }
  means.sort();
  const lo = means[Math.floor((alpha / 2) * iters)]!;
  const hi = means[Math.min(iters - 1, Math.ceil((1 - alpha / 2) * iters) - 1)]!;
  return { mean: point, lo, hi, n };
}

export type Paired = Interval & { excludesZero: boolean };

/** Mean of a−b on matched seeds, with a bootstrap CI. */
export function pairedDifference(a: number[], b: number[], seed = 1): Paired {
  const n = Math.min(a.length, b.length);
  const d = new Array<number>(n);
  for (let i = 0; i < n; i++) d[i] = a[i]! - b[i]!;
  const ci = bootstrapMeanCI(d, 2000, 0.05, seed);
  return { ...ci, excludesZero: ci.lo > 0 || ci.hi < 0 };
}

export function visitStats(counts: ArrayLike<number>) {
  let total = 0;
  let distinct = 0;
  for (let i = 0; i < counts.length; i++) {
    if (counts[i]! > 0) {
      distinct += 1;
      total += counts[i]!;
    }
  }
  if (total === 0) return { distinct: 0, entropy: 0 };
  let h = 0;
  for (let i = 0; i < counts.length; i++) {
    if (counts[i]! <= 0) continue;
    const p = counts[i]! / total;
    h -= p * Math.log2(p);
  }
  return { distinct, entropy: h };
}

export function majority(flags: boolean[]) {
  let n = 0;
  for (const flag of flags) if (flag) n += 1;
  return n * 2 > flags.length;
}
