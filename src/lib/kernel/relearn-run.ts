/**
 * Original-learning slope, negated-target return, and one doorway score.
 * Workers import this. The sweep is not part of CI.
 *
 * The learn stream and the return bouts match the published negation curve.
 * Count and RND are trained on the 200 true learn steps only, then restored
 * before both doorway scores, so the erased brain is the only difference.
 */
import { TRANSITION_LR } from "./loop.ts";
import { ACTS, Kernel, type KernelOptions } from "./kernel.ts";
import { negateSpec } from "./negate-run.ts";
import { RETURN_SALT } from "./capacity.ts";
import { AWAY_STEPS, LEARN_STEPS, PROBE_SAMPLES, PROBE_SEED } from "./cycle.ts";
import { mulberry32 } from "./presets.ts";
import type { CuriositySignal } from "./signals.ts";
import { doorwayActionRegion, doorwayDelta } from "./doorway-run.ts";
import { BOUT_STEPS, DROP_STEP } from "./phase.ts";
import { DOOR_X, DOOR_Y, RELEARN_HIDDEN } from "./relearn.ts";

const DOOR_SIGNALS = ["rho", "surprise", "rnd", "count"] as const;
type DoorSignal = (typeof DOOR_SIGNALS)[number];

export type RelearnBout = {
  drop20: number;
  drop80: number;
  raw: number;
  rect: number;
  positive: number;
  arrival: number;
  fall: number;
  emaStart: number;
  surpriseStart: number;
};

export type RelearnDoors = {
  raw: number;
  rho: number;
  surprise: number;
  rnd: number;
  count: number;
  rhoGlobal: number;
  rhoUncertainty: number;
  progressEma: number;
};

export type RelearnSample = {
  kind: "sample";
  id: number;
  seed: number;
  learnDrop: number;
  negateOverwrite: number;
  stay: number;
  learn: RelearnBout;
  held: RelearnBout;
  negate: RelearnBout;
  heldDoor: RelearnDoors;
  negateDoor: RelearnDoors;
};

export type RelearnJob = { kind: "sample"; id: number; seed: number };

function withSeed<T>(seed: number, fn: () => T): T {
  const prev = Math.random;
  Math.random = mulberry32(seed >>> 0);
  try {
    return fn();
  } finally {
    Math.random = prev;
  }
}

function makeKernel(seed: number) {
  const options: KernelOptions = {
    env: negateSpec(),
    signal: "rho",
    cellHidden: RELEARN_HIDDEN,
    traceScores: true,
  };
  return new Kernel("distractor", seed, undefined, options);
}

function trainStep(k: Kernel, rand: () => number, negate: boolean, side: boolean) {
  const pair = k.measurePair(1, rand, negate);
  const emaBefore = k.loop.ema;
  k.trainPair(pair.obs, pair.action, pair.next, TRANSITION_LR);
  if (side) {
    k.rnd.train(pair.obs);
    k.visitCounts[pair.index] = (k.visitCounts[pair.index] ?? 0) + 1;
  }
  return { emaBefore, progress: k.loop.progress, surprise: k.loop.surprise };
}

function bout(k: Kernel, rand: () => number, side: boolean): RelearnBout {
  const before = k.liveProbeError(1, PROBE_SAMPLES, PROBE_SEED);
  const emaStart = k.loop.ema;
  let raw = 0;
  let rect = 0;
  let positive = 0;
  let arrival = 0;
  let surpriseStart = 0;
  let surpriseEnd = 0;
  let after20 = before;
  for (let s = 0; s < BOUT_STEPS; s++) {
    const step = trainStep(k, rand, false, side);
    raw += step.progress;
    if (step.progress > 0) {
      rect += step.progress;
      positive += 1;
    }
    if (s === 0) {
      arrival = step.surprise - step.emaBefore;
      surpriseStart = step.surprise;
    }
    surpriseEnd = step.surprise;
    if (s + 1 === DROP_STEP) after20 = k.liveProbeError(1, PROBE_SAMPLES, PROBE_SEED);
  }
  const after80 = k.liveProbeError(1, PROBE_SAMPLES, PROBE_SEED);
  return {
    drop20: before - after20,
    drop80: before - after80,
    raw: raw / BOUT_STEPS,
    rect: rect / BOUT_STEPS,
    positive: positive / BOUT_STEPS,
    arrival,
    fall: surpriseStart - surpriseEnd,
    emaStart,
    surpriseStart,
  };
}

function doorDelta(k: Kernel, values: ArrayLike<number>) {
  const delta = doorwayDelta(values, (action) => doorwayActionRegion(k, DOOR_X, DOOR_Y, action) === 1);
  if (delta == null) throw new Error("relearn doorway did not split actions");
  return delta;
}

function scoreDoors(k: Kernel): RelearnDoors {
  const brain = k.loop.exportBrain();
  const counts = k.visitCounts.slice();
  const predW = k.rnd.predW.slice();
  const predB = k.rnd.predB.slice();
  const x = k.x;
  const y = k.y;
  k.x = DOOR_X;
  k.y = DOOR_Y;
  const progressEma = k.loop.progressEma;
  const errors = new Float64Array(ACTS);
  for (let a = 0; a < ACTS; a++) errors[a] = k.actionTrueError(a);
  const raw = doorDelta(k, errors);
  const scores = {} as Record<DoorSignal, number>;
  let rhoGlobal = 0;
  let rhoUncertainty = 0;
  for (const signal of DOOR_SIGNALS) {
    const logits = k.scoreActions(signal);
    if (!k.scoreParts) throw new Error("relearn doorway requires the score split");
    if (signal === "rho") {
      scores.rho = doorDelta(k, logits);
      rhoGlobal = doorDelta(k, k.scoreParts.global);
      rhoUncertainty = doorDelta(k, k.scoreParts.uncertainty);
    } else {
      // Unmixed bonus. The logit scales every signal by the imagined residual.
      scores[signal] = doorDelta(k, k.scoreParts.rhoHat);
    }
  }
  if (!k.loop.importBrain(brain)) throw new Error("relearn could not restore the brain");
  k.visitCounts.set(counts);
  k.rnd.predW.set(predW);
  k.rnd.predB.set(predB);
  k.x = x;
  k.y = y;
  return {
    raw,
    rho: scores.rho,
    surprise: scores.surprise,
    rnd: scores.rnd,
    count: scores.count,
    rhoGlobal,
    rhoUncertainty,
    progressEma,
  };
}

export function runRelearnSample(id: number, seed: number): RelearnSample {
  return withSeed(seed * 10007 + 9201, () => {
    const k = makeKernel(seed);
    const probe0 = k.liveProbeError(1, PROBE_SAMPLES, PROBE_SEED);
    const learnRand = mulberry32((seed ^ 0x51c0) >>> 0);
    const learn = bout(k, learnRand, true);
    for (let t = 0; t < LEARN_STEPS - BOUT_STEPS; t++) trainStep(k, learnRand, false, true);
    const learnEnd = k.liveProbeError(1, PROBE_SAMPLES, PROBE_SEED);
    const learned = k.loop.exportBrain();
    if (!k.loop.importBrain(learned)) throw new Error("relearn could not restore the learned brain");
    const heldEnd = k.liveProbeError(1, PROBE_SAMPLES, PROBE_SEED);
    const heldDoor = scoreDoors(k);
    if (!k.loop.importBrain(learned)) throw new Error("relearn could not restore the learned brain");
    const held = bout(k, mulberry32((seed ^ RETURN_SALT) >>> 0), false);

    if (!k.loop.importBrain(learned)) throw new Error("relearn could not restore the learned brain");
    const negateRand = mulberry32((seed ^ 0x71a0) >>> 0);
    for (let t = 0; t < AWAY_STEPS; t++) trainStep(k, negateRand, true, false);
    const negateEnd = k.liveProbeError(1, PROBE_SAMPLES, PROBE_SEED);
    const erased = k.loop.exportBrain();
    const negateDoor = scoreDoors(k);
    if (!k.loop.importBrain(erased)) throw new Error("relearn could not restore the erased brain");
    const negate = bout(k, mulberry32((seed ^ RETURN_SALT) >>> 0), false);

    return {
      kind: "sample",
      id,
      seed,
      learnDrop: probe0 - learnEnd,
      negateOverwrite: negateEnd - heldEnd,
      stay: heldEnd - learnEnd,
      learn,
      held,
      negate,
      heldDoor,
      negateDoor,
    };
  });
}

export function runRelearnJob(job: RelearnJob): RelearnSample {
  return runRelearnSample(job.id, job.seed);
}
