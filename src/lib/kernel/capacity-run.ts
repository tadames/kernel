/**
 * Capacity curve, live return, and one occupancy episode.
 * Workers import this. The sweep is not part of CI.
 *
 * The curve stream matches the published forgetting curve so width 32 can
 * be checked against it. Decay is not applied. The return bout keeps the
 * ema the training just wrote. It does not pin the ema to the learned probe.
 */
import { TRANSITION_LR } from "./loop.ts";
import { ACTS, Kernel, OBS, R, SIZE, type KernelOptions } from "./kernel.ts";
import { senseGrid, stepGrid, type GridBody } from "./env.ts";
import { cloneFamily, distractorSpec, FAMILY_LAYOUT_SEED, regionCells } from "./family.ts";
import { mulberry32 } from "./presets.ts";
import type { CuriositySignal } from "./signals.ts";
import { acfAt, halfPhaseContrast, phaseContrast } from "./period.ts";
import { BOUT_STEPS, DROP_STEP, fundamental, phaseBinMeans } from "./phase.ts";
import { AWAY_STEPS, LEARN_STEPS, PROBE_SAMPLES, PROBE_SEED, PROBE_STRIDE, halfRecovery } from "./cycle.ts";
import { CURVE_STREAM, RETURN_SALT, amplitudeOf } from "./capacity.ts";

export function capacitySpec() {
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

export type CapacitySample = {
  kind: "sample";
  id: number;
  seed: number;
  hidden: number;
  probe0: number;
  learnEnd: number;
  heldEnd: number;
  interEnd: number;
  learnDrop: number;
  overwrite: number;
  stay: number;
  /** First away step where interference undoes half the learn drop. Null when censored. */
  half: number | null;
  /** Mean of max(0, progress) over the 80-step return. */
  returnRectHeld: number;
  returnRectInter: number;
  /** Mean of raw progress, ema minus surprise, over the same bout. */
  returnRawHeld: number;
  returnRawInter: number;
  drop20Held: number;
  drop20Inter: number;
};

export type CapacityEpisode = {
  kind: "episode";
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  period: number;
  hidden: number;
  policyTemperature: number;
  add: number;
  salt: number;
  tag: string;
};

export type CapacityEpisodeResult = {
  kind: "episode";
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  period: number;
  hidden: number;
  policyTemperature: number;
  add: number;
  tag: string;
  amplitude: number;
  phasePeriod: number;
  phaseHalf: number;
  acfPeriod: number;
  acfHalf: number;
  c: number;
  s: number;
  bins: number[];
  eastFrac: number;
  foods: number;
  lives: number;
  checksum: number;
};

export type CapacityJob = { kind: "sample"; id: number; seed: number; hidden: number } | CapacityEpisode;

export type CapacityResult = CapacitySample | CapacityEpisodeResult;

function withSeed<T>(seed: number, fn: () => T): T {
  const prev = Math.random;
  Math.random = mulberry32(seed >>> 0);
  try {
    return fn();
  } finally {
    Math.random = prev;
  }
}

function makeKernel(seed: number, hidden: number, options?: KernelOptions) {
  return new Kernel("distractor", seed, undefined, {
    env: capacitySpec(),
    signal: "random",
    cellHidden: hidden,
    ...options,
  });
}

function probeRegion(k: Kernel) {
  return k.liveProbeError(1, PROBE_SAMPLES, PROBE_SEED);
}

function oneTransition(k: Kernel, region: 0 | 1, rand: () => number) {
  if (!k.family) throw new Error("capacity world did not build a family");
  const params = capacitySpec().params;
  const pool = regionCells(k.family, region, k.cells).filter((i) => k.cells[i] !== 1);
  if (pool.length === 0) throw new Error(`capacity world has no open cells in region ${region}`);
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
  stepGrid(body, "distractor", action, SIZE, mulberry32((rand() * 0x100000000) >>> 0), params, family);
  const next = new Float32Array(OBS);
  senseGrid(body.cells, body.scent, body.x, body.y, SIZE, R, next, family.glow);
  k.trainPair(obs, action, next, TRANSITION_LR);
}

function train(k: Kernel, region: 0 | 1, steps: number, rand: () => number) {
  for (let t = 0; t < steps; t++) oneTransition(k, region, rand);
}

function bout(k: Kernel, seed: number) {
  const before = probeRegion(k);
  const rand = mulberry32((seed ^ RETURN_SALT) >>> 0);
  let rect = 0;
  let raw = 0;
  let after20 = before;
  for (let s = 0; s < BOUT_STEPS; s++) {
    oneTransition(k, 1, rand);
    const value = k.loop.progress;
    raw += value;
    if (value > 0) rect += value;
    if (s + 1 === DROP_STEP) after20 = probeRegion(k);
  }
  return {
    rect: rect / BOUT_STEPS,
    raw: raw / BOUT_STEPS,
    drop20: before - after20,
  };
}

export function runCapacitySample(id: number, seed: number, hidden: number): CapacitySample {
  return withSeed(seed * 10007 + CURVE_STREAM, () => {
    const k = makeKernel(seed, hidden);
    const probe0 = probeRegion(k);
    train(k, 1, LEARN_STEPS, mulberry32((seed ^ 0x51c0) >>> 0));
    const learnEnd = probeRegion(k);
    const learned = k.loop.exportBrain();
    if (!k.loop.importBrain(learned)) throw new Error("capacity curve could not restore the learned brain");
    const heldEnd = probeRegion(k);
    const heldBout = bout(k, seed);

    if (!k.loop.importBrain(learned)) throw new Error("capacity curve could not restore the learned brain");
    const interRand = mulberry32((seed ^ 0x71a0) >>> 0);
    const times: number[] = [0];
    const inter: number[] = [probeRegion(k)];
    for (let t = 0; t < AWAY_STEPS; t++) {
      oneTransition(k, 0, interRand);
      if ((t + 1) % PROBE_STRIDE === 0) {
        times.push(t + 1);
        inter.push(probeRegion(k));
      }
    }
    const interEnd = inter[inter.length - 1]!;
    const held = inter.map(() => learnEnd);
    const half = halfRecovery(probe0, learnEnd, held, inter, times);
    const interBout = bout(k, seed);
    return {
      kind: "sample",
      id,
      seed,
      hidden,
      probe0,
      learnEnd,
      heldEnd,
      interEnd,
      learnDrop: probe0 - learnEnd,
      overwrite: interEnd - heldEnd,
      stay: heldEnd - learnEnd,
      half,
      returnRectHeld: heldBout.rect,
      returnRectInter: interBout.rect,
      returnRawHeld: heldBout.raw,
      returnRawInter: interBout.raw,
      drop20Held: heldBout.drop20,
      drop20Inter: interBout.drop20,
    };
  });
}

function checksumOf(bits: Uint8Array) {
  let hash = 0;
  for (let t = 0; t < bits.length; t++) hash = (Math.imul(hash, 33) + bits[t]!) >>> 0;
  return hash;
}

export function runCapacityEpisode(job: CapacityEpisode): CapacityEpisodeResult {
  return withSeed(job.seed * 10007 + job.salt, () => {
    const options: KernelOptions = {
      env: capacitySpec(),
      signal: job.signal,
      policyTemperature: job.policyTemperature,
      cellHidden: job.hidden,
    };
    if (job.add !== 0) {
      options.periodicBoost = { add: job.add, region: 1, period: job.period, offset: 0 };
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
    const wave = fundamental(bits, job.period);
    const half = job.period >> 1;
    return {
      kind: "episode",
      id: job.id,
      seed: job.seed,
      signal: job.signal,
      steps: job.steps,
      period: job.period,
      hidden: job.hidden,
      policyTemperature: job.policyTemperature,
      add: job.add,
      tag: job.tag,
      amplitude: amplitudeOf(wave.c, wave.s),
      phasePeriod: phaseContrast(bits, job.period),
      phaseHalf: halfPhaseContrast(bits, job.period),
      acfPeriod: acfAt(bits, job.period),
      acfHalf: acfAt(bits, half),
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

export function runCapacityJob(job: CapacityJob): CapacityResult {
  if (job.kind === "sample") return runCapacitySample(job.id, job.seed, job.hidden);
  return runCapacityEpisode(job);
}
