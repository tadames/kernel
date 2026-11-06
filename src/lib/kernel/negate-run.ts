/**
 * Negated-target curve, true-target ablation, and one occupancy episode.
 * Workers import this. The sweep is not part of CI.
 *
 * The learn stream matches the published capacity curve. The negation arm
 * reuses the interference stream and flips open-cell glow in the target.
 * The continuation arm uses that same stream with the true target.
 */
import { TRANSITION_LR } from "./loop.ts";
import { Kernel, type KernelOptions } from "./kernel.ts";
import { capacitySpec } from "./capacity-run.ts";
import { RETURN_SALT } from "./capacity.ts";
import { AWAY_STEPS, LEARN_STEPS, PROBE_SAMPLES, PROBE_SEED, PROBE_STRIDE, halfRecovery } from "./cycle.ts";
import { mulberry32 } from "./presets.ts";
import type { CuriositySignal } from "./signals.ts";
import { acfAt, halfPhaseContrast, phaseContrast } from "./period.ts";
import { BOUT_STEPS, DROP_STEP, fundamental, phaseBinMeans } from "./phase.ts";
import { amplitudeOf } from "./capacity.ts";

export function negateSpec() {
  return capacitySpec();
}

export type NegateSample = {
  kind: "sample";
  id: number;
  seed: number;
  hidden: number;
  probe0: number;
  learnEnd: number;
  heldEnd: number;
  negateEnd: number;
  contEnd: number;
  learnDrop: number;
  negateOverwrite: number;
  contOverwrite: number;
  stay: number;
  half: number | null;
  glow0: number;
  glowLearn: number;
  glowNegate: number;
  glowCont: number;
  returnRectHeld: number;
  returnRectNegate: number;
  returnRawHeld: number;
  returnRawNegate: number;
  drop20Held: number;
  drop20Negate: number;
  returnRectCont: number;
  returnRawCont: number;
};

export type NegateEpisode = {
  kind: "episode";
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  period: number;
  hidden: number;
  policyTemperature: number;
  add: number;
  /** 1 replays a negated east step while the body is in the west. */
  replay: number;
  salt: number;
  tag: string;
};

export type NegateEpisodeResult = {
  kind: "episode";
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  period: number;
  hidden: number;
  policyTemperature: number;
  add: number;
  replay: number;
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

export type NegateJob = { kind: "sample"; id: number; seed: number; hidden: number } | NegateEpisode;

export type NegateResult = NegateSample | NegateEpisodeResult;

function withSeed<T>(seed: number, fn: () => T): T {
  const prev = Math.random;
  Math.random = mulberry32(seed >>> 0);
  try {
    return fn();
  } finally {
    Math.random = prev;
  }
}

function makeKernel(seed: number, hidden: number) {
  return new Kernel("distractor", seed, undefined, {
    env: negateSpec(),
    signal: "random",
    cellHidden: hidden,
  });
}

function train(k: Kernel, region: 0 | 1, steps: number, rand: () => number, negate: boolean) {
  for (let t = 0; t < steps; t++) {
    const pair = k.measurePair(region, rand, negate);
    k.trainPair(pair.obs, pair.action, pair.next, TRANSITION_LR);
  }
}

function bout(k: Kernel, seed: number) {
  const before = k.liveProbeError(1, PROBE_SAMPLES, PROBE_SEED);
  const rand = mulberry32((seed ^ RETURN_SALT) >>> 0);
  let rect = 0;
  let raw = 0;
  let after20 = before;
  for (let s = 0; s < BOUT_STEPS; s++) {
    const pair = k.measurePair(1, rand, false);
    k.trainPair(pair.obs, pair.action, pair.next, TRANSITION_LR);
    const value = k.loop.progress;
    raw += value;
    if (value > 0) rect += value;
    if (s + 1 === DROP_STEP) after20 = k.liveProbeError(1, PROBE_SAMPLES, PROBE_SEED);
  }
  return {
    rect: rect / BOUT_STEPS,
    raw: raw / BOUT_STEPS,
    drop20: before - after20,
  };
}

export function runNegateSample(id: number, seed: number, hidden: number): NegateSample {
  return withSeed(seed * 10007 + 9201, () => {
    const k = makeKernel(seed, hidden);
    const probe0 = k.liveProbeError(1, PROBE_SAMPLES, PROBE_SEED);
    const glow0 = k.glowProbeError(1, PROBE_SAMPLES, PROBE_SEED);
    train(k, 1, LEARN_STEPS, mulberry32((seed ^ 0x51c0) >>> 0), false);
    const learnEnd = k.liveProbeError(1, PROBE_SAMPLES, PROBE_SEED);
    const glowLearn = k.glowProbeError(1, PROBE_SAMPLES, PROBE_SEED);
    const learned = k.loop.exportBrain();
    if (!k.loop.importBrain(learned)) throw new Error("negate curve could not restore the learned brain");
    const heldEnd = k.liveProbeError(1, PROBE_SAMPLES, PROBE_SEED);
    const heldBout = bout(k, seed);

    if (!k.loop.importBrain(learned)) throw new Error("negate curve could not restore the learned brain");
    const contRand = mulberry32((seed ^ 0x71a0) >>> 0);
    train(k, 1, AWAY_STEPS, contRand, false);
    const contEnd = k.liveProbeError(1, PROBE_SAMPLES, PROBE_SEED);
    const glowCont = k.glowProbeError(1, PROBE_SAMPLES, PROBE_SEED);
    const contBout = bout(k, seed);

    if (!k.loop.importBrain(learned)) throw new Error("negate curve could not restore the learned brain");
    const negateRand = mulberry32((seed ^ 0x71a0) >>> 0);
    const times: number[] = [0];
    const inter: number[] = [k.liveProbeError(1, PROBE_SAMPLES, PROBE_SEED)];
    for (let t = 0; t < AWAY_STEPS; t++) {
      const pair = k.measurePair(1, negateRand, true);
      k.trainPair(pair.obs, pair.action, pair.next, TRANSITION_LR);
      if ((t + 1) % PROBE_STRIDE === 0) {
        times.push(t + 1);
        inter.push(k.liveProbeError(1, PROBE_SAMPLES, PROBE_SEED));
      }
    }
    const negateEnd = inter[inter.length - 1]!;
    const glowNegate = k.glowProbeError(1, PROBE_SAMPLES, PROBE_SEED);
    const held = inter.map(() => learnEnd);
    const half = halfRecovery(probe0, learnEnd, held, inter, times);
    const negateBout = bout(k, seed);
    return {
      kind: "sample",
      id,
      seed,
      hidden,
      probe0,
      learnEnd,
      heldEnd,
      negateEnd,
      contEnd,
      learnDrop: probe0 - learnEnd,
      negateOverwrite: negateEnd - heldEnd,
      contOverwrite: contEnd - learnEnd,
      stay: heldEnd - learnEnd,
      half,
      glow0,
      glowLearn,
      glowNegate,
      glowCont,
      returnRectHeld: heldBout.rect,
      returnRectNegate: negateBout.rect,
      returnRawHeld: heldBout.raw,
      returnRawNegate: negateBout.raw,
      drop20Held: heldBout.drop20,
      drop20Negate: negateBout.drop20,
      returnRectCont: contBout.rect,
      returnRawCont: contBout.raw,
    };
  });
}

function checksumOf(bits: Uint8Array) {
  let hash = 0;
  for (let t = 0; t < bits.length; t++) hash = (Math.imul(hash, 33) + bits[t]!) >>> 0;
  return hash;
}

export function runNegateEpisode(job: NegateEpisode): NegateEpisodeResult {
  return withSeed(job.seed * 10007 + job.salt, () => {
    const options: KernelOptions = {
      env: negateSpec(),
      signal: job.signal,
      policyTemperature: job.policyTemperature,
      cellHidden: job.hidden,
    };
    if (job.replay !== 0) options.negateReplay = true;
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
      replay: job.replay,
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

export function runNegateJob(job: NegateJob): NegateResult {
  if (job.kind === "sample") return runNegateSample(job.id, job.seed, job.hidden);
  return runNegateEpisode(job);
}
