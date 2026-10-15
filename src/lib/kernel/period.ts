/**
 * Revisit-period estimators and the log-log slope against forgetting rate.
 * A flat series has no period. That is a null, not a period of zero.
 */
import { bootstrapMeanCI, meanOf, type Interval } from "./stats.ts";
import { mulberry32 } from "./presets.ts";

export type PeriodEstimate = {
  period: number | null;
  power: number;
  /** Power divided by the median power in the searched band. */
  ratio: number;
};

/**
 * Dominant period of a real series by a direct Fourier scan.
 * Periods outside [minPeriod, maxPeriod] are ignored.
 * A peak must be at least `minRatio` times the median power in that band,
 * otherwise the series has no detectable cycle.
 */
export function spectralPeriod(
  series: ArrayLike<number>,
  minPeriod: number,
  maxPeriod: number,
  minRatio = 3,
): PeriodEstimate {
  const n = series.length;
  if (n < minPeriod * 2) return { period: null, power: 0, ratio: 0 };
  let mean = 0;
  for (let i = 0; i < n; i++) mean += series[i]!;
  mean /= n;
  const lo = Math.max(2, minPeriod);
  const hi = Math.min(maxPeriod, Math.floor(n / 2));
  if (hi < lo) return { period: null, power: 0, ratio: 0 };
  const powers: number[] = [];
  let bestP = 0;
  let bestPeriod = lo;
  for (let p = lo; p <= hi; p++) {
    const w = (2 * Math.PI) / p;
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const x = series[i]! - mean;
      re += x * Math.cos(w * i);
      im += x * Math.sin(w * i);
    }
    const power = (re * re + im * im) / n;
    powers.push(power);
    if (power > bestP) {
      bestP = power;
      bestPeriod = p;
    }
  }
  const sorted = powers.slice().sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1] ?? 0;
  const ratio = median > 1e-12 ? bestP / median : 0;
  if (!(ratio >= minRatio) || bestP <= 0) return { period: null, power: bestP, ratio };
  return { period: bestPeriod, power: bestP, ratio };
}

/** First autocorrelation peak inside the lag window, if it clears `minCorr`. */
export function acfPeriod(series: ArrayLike<number>, minLag: number, maxLag: number, minCorr = 0.15) {
  const n = series.length;
  if (n < minLag + 2) return { period: null as number | null, corr: 0 };
  let mean = 0;
  for (let i = 0; i < n; i++) mean += series[i]!;
  mean /= n;
  let varSum = 0;
  for (let i = 0; i < n; i++) {
    const d = series[i]! - mean;
    varSum += d * d;
  }
  if (varSum < 1e-12) return { period: null, corr: 0 };
  const hi = Math.min(maxLag, n - 2);
  let bestLag = 0;
  let best = -Infinity;
  for (let lag = Math.max(1, minLag); lag <= hi; lag++) {
    let s = 0;
    for (let i = 0; i < n - lag; i++) s += (series[i]! - mean) * (series[i + lag]! - mean);
    const corr = s / varSum;
    if (corr > best) {
      best = corr;
      bestLag = lag;
    }
  }
  if (bestLag <= 0 || best < minCorr) return { period: null, corr: best === -Infinity ? 0 : best };
  return { period: bestLag, corr: best };
}

export type SlopeFit = {
  slope: number;
  intercept: number;
  n: number;
};

/** Ordinary least squares of y on x. Returns a zero slope when x does not vary. */
export function ols(x: number[], y: number[]): SlopeFit {
  const n = Math.min(x.length, y.length);
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i]!;
    sy += y[i]!;
    sxx += x[i]! * x[i]!;
    sxy += x[i]! * y[i]!;
  }
  const den = n * sxx - sx * sx;
  if (n < 2 || Math.abs(den) < 1e-18) return { slope: 0, intercept: n ? sy / n : 0, n };
  const slope = (n * sxy - sx * sy) / den;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept, n };
}

/**
 * One slope per seed: log(period) on log(rate), using only rates where that
 * seed has a period. Seeds with fewer than `minRates` points are dropped.
 * The returned interval is a bootstrap CI of the mean seed slope.
 */
export function seedLogSlope(
  rates: number[],
  periodsBySeed: (number | null)[][],
  minRates = 3,
  iters = 2000,
  seed = 7,
): { slope: Interval; nSeeds: number; perSeed: number[] } {
  const perSeed: number[] = [];
  for (const row of periodsBySeed) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < rates.length; i++) {
      const period = row[i];
      const rate = rates[i]!;
      if (period == null || !(period > 0) || !(rate > 0)) continue;
      xs.push(Math.log(rate));
      ys.push(Math.log(period));
    }
    if (xs.length < minRates) continue;
    perSeed.push(ols(xs, ys).slope);
  }
  return {
    slope: bootstrapMeanCI(perSeed, iters, 0.05, seed),
    nSeeds: perSeed.length,
    perSeed,
  };
}

/** Bootstrap CI of an OLS slope when each x has a cloud of y replicates. */
export function replicateLogSlope(
  rates: number[],
  periodsAtRate: number[][],
  iters = 2000,
  seed = 11,
): SlopeFit & { lo: number; hi: number } {
  const rand = mulberry32(seed >>> 0);
  const usable = rates
    .map((rate, i) => ({ rate, ys: periodsAtRate[i] ?? [] }))
    .filter((row) => row.rate > 0 && row.ys.length > 0);
  if (usable.length < 3) return { slope: 0, intercept: 0, n: usable.length, lo: 0, hi: 0 };
  const point = ols(
    usable.map((row) => Math.log(row.rate)),
    usable.map((row) => Math.log(meanOf(row.ys))),
  );
  const slopes = new Float64Array(iters);
  for (let b = 0; b < iters; b++) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const row of usable) {
      let s = 0;
      for (let k = 0; k < row.ys.length; k++) s += row.ys[(rand() * row.ys.length) | 0]!;
      xs.push(Math.log(row.rate));
      ys.push(Math.log(s / row.ys.length));
    }
    slopes[b] = ols(xs, ys).slope;
  }
  slopes.sort();
  return {
    ...point,
    lo: slopes[Math.floor(0.025 * iters)]!,
    hi: slopes[Math.min(iters - 1, Math.ceil(0.975 * iters) - 1)]!,
  };
}
