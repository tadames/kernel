/**
 * Forgetting curve and one occupancy episode of the cycle world.
 * Workers import this. The sweep is not part of CI.
 */
import { TRANSITION_LR } from "./loop.ts";
import { ACTS, Kernel, OBS, R, SIZE, type KernelOptions } from "./kernel.ts";
import { senseGrid, stepGrid, type GridBody } from "./env.ts";
import { cloneFamily, CYCLE_EAST_LATENT, distractorSpec, FAMILY_LAYOUT_SEED, regionCells } from "./family.ts";
import { mulberry32 } from "./presets.ts";
import type { CuriositySignal } from "./signals.ts";
import { acfAt, halfPhaseContrast, phaseContrast } from "./period.ts";
import { BOUT_STEPS, DROP_STEP, PROGRESS_TIMES, fundamental, phaseBinMeans } from "./phase.ts";
import {
  AWAY_STEPS,
  CYCLE_LAMBDA,
  LEARN_STEPS,
  PROBE_SAMPLES,
  PROBE_SEED,
  PROBE_STRIDE,
} from "./cycle.ts";

export function cycleSpec() {
  return distractorSpec(
    {
      learnability: 1,
      driftRate: 0,
      distractorRelevance: 0,
      cycleWorld: true,
    },
    FAMILY_LAYOUT_SEED,
  );
}

export type CurveResult = {
  kind: "curve";
  id: number;
  seed: number;
  lambda: number;
  probe0: number;
  learnEnd: number;
  decayLearnEnd: number;
  heldEnd: number;
  decayEnd: number;
  interEnd: number;
  /** Away times, including 0 and the endpoint. */
  times: number[];
  held: number[];
  decay: number[];
  interference: number[];
};

export type ProgressResult = {
  kind: "progress";
  id: number;
  seed: number;
  lambda: number;
  times: number[];
  /** Region-1 probe after this many decay steps, before the bout. */
  probe: number[];
  /** Probe before the bout minus probe after 20 training steps. */
  drop20: number[];
  /** Largest progress sample in the 80-step bout. Negative when the signal stays off. */
  peak: number[];
  /** Step of that peak. Null when the peak is not positive. */
  peakAt: (number | null)[];
  /** Sum of positive progress over the bout. */
  positiveSum: number[];
};

export type EpisodeResult = {
  kind: "episode";
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  period: number;
  forgettingRate: number;
  policyTemperature: number;
  add: number;
  /** Delay of the planted on-half, in steps. 0 is the first half. */
  offset: number;
  tag: string;
  arm: "forget" | "held" | "periodic";
  acfPeriod: number;
  acfHalf: number;
  /** On-half minus off-half, complete periods only. */
  phasePeriod: number;
  /** In-phase contrast of the P/2 template. Zero on a 50% square of period P. */
  phaseHalf: number;
  /** Cosine coefficient of the mean-centered occupancy, complete periods only. */
  c: number;
  /** Sine coefficient. A first-half square loads this one. */
  s: number;
  /** Mean occupancy in eight phase bins. */
  bins: number[];
  eastFrac: number;
  foods: number;
  lives: number;
  checksum: number;
};

export type CycleJob =
  | { kind: "curve"; id: number; seed: number; lambda?: number }
  | { kind: "progress"; id: number; seed: number; lambda: number }
  | {
      kind: "episode";
      id: number;
      seed: number;
      signal: CuriositySignal;
      steps: number;
      period: number;
      forgettingRate: number;
      policyTemperature: number;
      add: number;
      offset?: number;
      salt: number;
      arm: "forget" | "held" | "periodic";
      /** Which comparison this episode belongs to. Omitted on the older sweeps. */
      tag?: string;
    };

export type CycleResult = CurveResult | EpisodeResult | ProgressResult;

function withSeed<T>(seed: number, fn: () => T): T {
  const prev = Math.random;
  Math.random = mulberry32(seed >>> 0);
  try {
    return fn();
  } finally {
    Math.random = prev;
  }
}

function makeKernel(seed: number, options?: KernelOptions) {
  const spec = cycleSpec();
  return new Kernel("distractor", seed, undefined, {
    env: spec,
    signal: "random",
    ...options,
  });
}

function probeRegion(k: Kernel) {
  return k.liveProbeError(1, PROBE_SAMPLES, PROBE_SEED);
}

function oneTransition(k: Kernel, region: 0 | 1, rand: () => number, specParams: ReturnType<typeof cycleSpec>["params"]) {
  if (!k.family) throw new Error("cycle world did not build a family");
  const pool = regionCells(k.family, region, k.cells).filter((i) => k.cells[i] !== 1);
  if (pool.length === 0) throw new Error(`cycle world has no open cells in region ${region}`);
  const index = pool[(rand() * pool.length) | 0]!;
  const x = index % SIZE;
  const y = (index / SIZE) | 0;
  const obs = new Float32Array(OBS);
  const blank = new Float32Array(k.scent.length);
  senseGrid(k.cells, blank, x, y, SIZE, R, obs, k.family.glow);
  const action = (rand() * ACTS) | 0;
  const body: GridBody = {
    cells: k.cells.slice(),
    scent: blank.slice(),
    x,
    y,
    energy: 100,
    pulseClock: 0,
  };
  const family = cloneFamily(k.family);
  stepGrid(body, "distractor", action, SIZE, mulberry32((rand() * 0x100000000) >>> 0), specParams, family);
  const next = new Float32Array(OBS);
  senseGrid(body.cells, body.scent, body.x, body.y, SIZE, R, next, family.glow);
  k.trainPair(obs, action, next, TRANSITION_LR);
}

function train(k: Kernel, region: 0 | 1, steps: number, decay: number, rand: () => number) {
  const params = cycleSpec().params;
  for (let t = 0; t < steps; t++) {
    oneTransition(k, region, rand, params);
    if (decay > 0) k.loop.net.decay(decay);
  }
}

function awayCurve(
  k: Kernel,
  weights: { w1: number[]; b1: number[]; w2: number[]; b2: number[] },
  mode: "held" | "decay" | "interference",
  lambda: number,
  rand: () => number,
) {
  if (!k.loop.net.importWeights(weights)) throw new Error("cycle curve could not restore weights");
  const params = cycleSpec().params;
  const curve: number[] = [];
  const times: number[] = [];
  const snap = (t: number) => {
    times.push(t);
    curve.push(probeRegion(k));
  };
  snap(0);
  for (let t = 0; t < AWAY_STEPS; t++) {
    if (mode === "interference") oneTransition(k, 0, rand, params);
    if (mode === "decay") k.loop.net.decay(lambda);
    if ((t + 1) % PROBE_STRIDE === 0) snap(t + 1);
  }
  return { times, curve, end: curve[curve.length - 1]! };
}

export function runForgettingCurve(id: number, seed: number, lambda = CYCLE_LAMBDA): CurveResult {
  return withSeed(seed * 10007 + 9201, () => {
    const k = makeKernel(seed);
    const init = k.loop.net.exportWeights();
    const probe0 = probeRegion(k);
    const learnRand = mulberry32((seed ^ 0x51c0) >>> 0);
    train(k, 1, LEARN_STEPS, 0, learnRand);
    const learnEnd = probeRegion(k);
    const learned = k.loop.net.exportWeights();

    if (!k.loop.net.importWeights(init)) throw new Error("cycle curve could not restore the init");
    const decayLearnRand = mulberry32((seed ^ 0x51c0) >>> 0);
    train(k, 1, LEARN_STEPS, lambda, decayLearnRand);
    const decayLearnEnd = probeRegion(k);

    const held = awayCurve(k, learned, "held", lambda, mulberry32(1));
    const decay = awayCurve(k, learned, "decay", lambda, mulberry32(1));
    const interference = awayCurve(k, learned, "interference", lambda, mulberry32((seed ^ 0x71a0) >>> 0));
    return {
      kind: "curve",
      id,
      seed,
      lambda,
      probe0,
      learnEnd,
      decayLearnEnd,
      heldEnd: held.end,
      decayEnd: decay.end,
      interEnd: interference.end,
      times: held.times,
      held: held.curve,
      decay: decay.curve,
      interference: interference.curve,
    };
  });
}

/**
 * Progress available after a locked decay, with the body held still.
 * The ema starts at the learned probe, the same number at every checkpoint,
 * so the bout isolates the decayed weights. The cell net is what decays.
 */
export function runProgressBout(id: number, seed: number, lambda: number): ProgressResult {
  return withSeed(seed * 10007 + 9601, () => {
    const k = makeKernel(seed);
    const params = cycleSpec().params;
    const learnRand = mulberry32((seed ^ 0x51c0) >>> 0);
    train(k, 1, LEARN_STEPS, 0, learnRand);
    const learnEnd = probeRegion(k);
    const learned = k.loop.exportBrain();
    const times = [...PROGRESS_TIMES];
    const probe: number[] = [];
    const drop20: number[] = [];
    const peak: number[] = [];
    const peakAt: (number | null)[] = [];
    const positiveSum: number[] = [];
    for (const t of times) {
      if (!k.loop.importBrain(learned)) throw new Error("progress bout could not restore the learned brain");
      for (let i = 0; i < t; i++) k.loop.net.decay(lambda);
      const before = probeRegion(k);
      k.loop.ema = learnEnd;
      k.loop.surprise = learnEnd;
      k.loop.progress = 0;
      k.loop.progressEma = 0;
      const rand = mulberry32((seed ^ 0x66b0 ^ Math.imul(t + 1, 17)) >>> 0);
      let best = -Infinity;
      let bestAt = 0;
      let pos = 0;
      let after = before;
      for (let s = 0; s < BOUT_STEPS; s++) {
        oneTransition(k, 1, rand, params);
        const value = k.loop.progress;
        if (value > best) {
          best = value;
          bestAt = s;
        }
        if (value > 0) pos += value;
        if (s + 1 === DROP_STEP) after = probeRegion(k);
      }
      probe.push(before);
      drop20.push(before - after);
      peak.push(best);
      peakAt.push(best > 0 ? bestAt : null);
      positiveSum.push(pos);
    }
    return { kind: "progress", id, seed, lambda, times, probe, drop20, peak, peakAt, positiveSum };
  });
}

function checksumOf(bits: Uint8Array) {
  let hash = 0;
  for (let t = 0; t < bits.length; t++) hash = (Math.imul(hash, 33) + bits[t]!) >>> 0;
  return hash;
}

export function runCycleEpisode(job: Extract<CycleJob, { kind: "episode" }>): EpisodeResult {
  return withSeed(job.seed * 10007 + job.salt, () => {
    const spec = cycleSpec();
    const options: KernelOptions = {
      env: spec,
      signal: job.signal,
      policyTemperature: job.policyTemperature,
    };
    if (job.forgettingRate > 0) options.forgettingRate = job.forgettingRate;
    if (job.add !== 0) {
      options.periodicBoost = { add: job.add, region: 1, period: job.period, offset: job.offset ?? 0 };
    }
    const k = new Kernel("distractor", job.seed, undefined, options);
    const bits = new Uint8Array(job.steps);
    let east = 0;
    for (let t = 0; t < job.steps; t++) {
      const bit = k.regionAt() === 1 ? 1 : 0;
      bits[t] = bit;
      east += bit;
      k.step();
    }
    const half = job.period >> 1;
    const wave = fundamental(bits, job.period);
    return {
      kind: "episode",
      id: job.id,
      seed: job.seed,
      signal: job.signal,
      steps: job.steps,
      period: job.period,
      forgettingRate: job.forgettingRate,
      policyTemperature: job.policyTemperature,
      add: job.add,
      offset: job.offset ?? 0,
      tag: job.tag ?? "",
      arm: job.arm,
      acfPeriod: acfAt(bits, job.period),
      acfHalf: acfAt(bits, half),
      phasePeriod: phaseContrast(bits, job.period),
      phaseHalf: halfPhaseContrast(bits, job.period),
      c: wave.c,
      s: wave.s,
      bins: phaseBinMeans(bits, job.period),
      eastFrac: job.steps ? east / job.steps : 0,
      foods: k.foods,
      lives: k.lives,
      checksum: checksumOf(bits),
    };
  });
}

export function runCycleJob(job: CycleJob): CycleResult {
  if (job.kind === "curve") return runForgettingCurve(job.id, job.seed, job.lambda ?? CYCLE_LAMBDA);
  if (job.kind === "progress") return runProgressBout(job.id, job.seed, job.lambda);
  return runCycleEpisode(job);
}

export { CYCLE_EAST_LATENT };
