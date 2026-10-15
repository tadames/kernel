/**
 * One episode of the distractor family, the split-room forgetting episode,
 * and the adaptation-timescale curve. Workers import this. The sweep scripts
 * do not run in CI.
 */
import { TRANSITION_LR } from "./loop.ts";
import { Kernel, OBS, R, SIZE } from "./kernel.ts";
import { senseGrid, stepGrid, type GridBody } from "./env.ts";
import {
  cloneFamily,
  distractorSpec,
  regionCells,
  splitSpec,
} from "./family.ts";
import { mulberry32 } from "./presets.ts";
import type { CuriositySignal } from "./signals.ts";
import { visitStats } from "./stats.ts";
import { ols } from "./period.ts";
import { spectralPeriod, acfPeriod } from "./period.ts";

export type PhaseRequest = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  learnability: number;
  driftRate: number;
  distractorRelevance: number;
};

export type PhaseResult = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  learnability: number;
  driftRate: number;
  distractorRelevance: number;
  distractorFrac: number;
  probeWorld: number;
  probeDistractor: number;
  distinctCells: number;
  usefulCells: number;
  foods: number;
  distractorFoods: number;
  lives: number;
};

export type ForgetRequest = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  forgettingRate: number;
};

export type ForgetResult = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  forgettingRate: number;
  eastFrac: number;
  foods: number;
  lives: number;
  probeWest: number;
  probeEast: number;
  /** Spectral period in steps, or null when no peak clears the band. */
  period: number | null;
  powerRatio: number;
  acfPeriod: number | null;
  /** East-room occupancy, 0/1, one character per step. */
  series: string;
};

function withSeed<T>(seed: number, fn: () => T): T {
  const prev = Math.random;
  Math.random = mulberry32(seed >>> 0);
  try {
    return fn();
  } finally {
    Math.random = prev;
  }
}

export function runPhaseEpisode(req: PhaseRequest): PhaseResult {
  const spec = distractorSpec({
    learnability: req.learnability,
    driftRate: req.driftRate,
    distractorRelevance: req.distractorRelevance,
  });
  return withSeed(req.seed * 10007 + 31, () => {
    const k = new Kernel("distractor", req.seed, undefined, { env: spec, signal: req.signal });
    let inEast = 0;
    let eastFood = 0;
    const visits = new Uint32Array(k.cells.length);
    const useful = new Uint32Array(k.cells.length);
    for (let t = 0; t < req.steps; t++) {
      const before = k.foods;
      k.step();
      const reg = k.regionAt();
      const i = k.y * SIZE + k.x;
      visits[i] += 1;
      if (reg === 1) {
        inEast += 1;
        if (k.foods > before) eastFood += 1;
      } else if (reg === 0) {
        useful[i] += 1;
      }
    }
    const coverage = visitStats(visits);
    const usefulCoverage = visitStats(useful);
    return {
      id: req.id,
      seed: req.seed,
      signal: req.signal,
      steps: req.steps,
      learnability: req.learnability,
      driftRate: req.driftRate,
      distractorRelevance: req.distractorRelevance,
      distractorFrac: req.steps ? inEast / req.steps : 0,
      probeWorld: k.liveProbeError(0, 40, 20261015),
      probeDistractor: k.liveProbeError(1, 40, 20261015),
      distinctCells: coverage.distinct,
      usefulCells: usefulCoverage.distinct,
      foods: k.foods,
      distractorFoods: eastFood,
      lives: k.lives,
    };
  });
}

export function runForgetEpisode(req: ForgetRequest): ForgetResult {
  const spec = splitSpec();
  return withSeed(req.seed * 10007 + 67, () => {
    const k = new Kernel("split", req.seed, undefined, {
      env: spec,
      signal: req.signal,
      forgettingRate: req.forgettingRate,
    });
    const bits = new Uint8Array(req.steps);
    let east = 0;
    for (let t = 0; t < req.steps; t++) {
      k.step();
      const bit = k.regionAt() === 1 ? 1 : 0;
      bits[t] = bit;
      east += bit;
    }
    const minPeriod = 20;
    const maxPeriod = Math.max(minPeriod, Math.floor(req.steps / 2));
    const specPeak = spectralPeriod(bits, minPeriod, maxPeriod, 3);
    const acf = acfPeriod(bits, minPeriod, maxPeriod, 0.15);
    let series = "";
    for (let t = 0; t < bits.length; t++) series += bits[t] ? "1" : "0";
    return {
      id: req.id,
      seed: req.seed,
      signal: req.signal,
      steps: req.steps,
      forgettingRate: req.forgettingRate,
      eastFrac: req.steps ? east / req.steps : 0,
      foods: k.foods,
      lives: k.lives,
      probeWest: k.liveProbeError(0, 24, 4242),
      probeEast: k.liveProbeError(1, 24, 4242),
      period: specPeak.period,
      powerRatio: specPeak.ratio,
      acfPeriod: acf.period,
      series,
    };
  });
}

export type TauFit = {
  tau: number | null;
  halfLife: number | null;
  e0: number;
  eInf: number;
  slope: number;
  censored: boolean;
};

/**
 * e-folding time of excess distractor-probe error. The tail mean is the
 * asymptote. The fit is log(excess) on step, while excess stays above 5% of
 * the initial excess and step < 300. If that line does not fall, the
 * half-life is the fallback, and a curve that never halves is censored.
 */
export function fitTau(errors: number[]): TauFit {
  const n = errors.length;
  if (n < 10) return { tau: null, halfLife: null, e0: 0, eInf: 0, slope: 0, censored: true };
  const tailStart = Math.floor(n * 0.85);
  let eInf = 0;
  for (let i = tailStart; i < n; i++) eInf += errors[i]!;
  eInf /= n - tailStart;
  const e0 = errors[0]!;
  const initial = e0 - eInf;
  const halfTarget = eInf + 0.5 * initial;
  let half = -1;
  if (initial > 0) {
    for (let t = 0; t < n; t++) {
      if (errors[t]! <= halfTarget) {
        half = t;
        break;
      }
    }
  }
  const xs: number[] = [];
  const ys: number[] = [];
  const limit = Math.min(n, 300);
  if (initial > 0.005) {
    for (let t = 0; t < limit; t++) {
      const excess = errors[t]! - eInf;
      if (t > 0 && excess < 0.05 * initial) break;
      if (excess <= 1e-6) break;
      xs.push(t);
      ys.push(Math.log(excess));
    }
  }
  const fit = xs.length >= 5 ? ols(xs, ys) : { slope: 0, intercept: 0, n: xs.length };
  if (fit.n >= 5 && fit.slope < -1e-4) {
    const tau = -1 / fit.slope;
    return { tau, halfLife: tau * Math.LN2, e0, eInf, slope: fit.slope, censored: false };
  }
  if (half >= 1) {
    return { tau: half / Math.LN2, halfLife: half, e0, eInf, slope: fit.slope, censored: false };
  }
  return { tau: null, halfLife: null, e0, eInf, slope: fit.slope, censored: true };
}

/**
 * One gradient per step on uniform transitions inside a frozen east pattern.
 * Scent is zero so the curve is the compressor, not the trail. Returns probe
 * error after every step, including step 0 before any update.
 */
export function adaptationCurve(seed: number, steps = 400): number[] {
  const spec = distractorSpec({ learnability: 1, driftRate: 0, distractorRelevance: 0 });
  return withSeed(seed * 10007 + 101, () => {
    const k = new Kernel("distractor", seed, undefined, {
      env: spec,
      signal: "random",
      patternHold: true,
    });
    if (!k.family) throw new Error("pattern hold did not build a family");
    const pool = regionCells(k.family, 1, k.cells).filter((i) => k.cells[i] !== 1);
    const rand = mulberry32((seed ^ 0xa5a5a5) >>> 0);
    const errors: number[] = [];
    errors.push(k.liveProbeError(1, 24, 8100 + seed));
    for (let t = 0; t < steps; t++) {
      const index = pool[(rand() * pool.length) | 0]!;
      const x = index % SIZE;
      const y = (index / SIZE) | 0;
      const obs = new Float32Array(OBS);
      const blank = new Float32Array(k.scent.length);
      senseGrid(k.cells, blank, x, y, SIZE, R, obs, k.family.glow);
      const action = (rand() * 5) | 0;
      const body: GridBody = {
        cells: k.cells.slice(),
        scent: blank.slice(),
        x,
        y,
        energy: 100,
        pulseClock: 0,
      };
      const family = cloneFamily(k.family);
      stepGrid(body, "distractor", action, SIZE, mulberry32((seed * 1000 + t + 1) >>> 0), spec.params, family);
      const next = new Float32Array(OBS);
      senseGrid(body.cells, body.scent, body.x, body.y, SIZE, R, next, family.glow);
      k.trainPair(obs, action, next, TRANSITION_LR);
      errors.push(k.liveProbeError(1, 24, 8100 + seed));
    }
    return errors;
  });
}
