/**
 * One seed of the door-scale phase diagram. Workers import this.
 * The sweep is not part of CI.
 *
 * The forget cell is the published relearn doorway, including the logits
 * that doorway already computed. Noise and drift train on the cycle map
 * so the door has no meal. Cycle-world construction would otherwise force
 * hold mode, so the noise arms set the east mode to noise after the shell
 * is built. That is the room, not a Loop flag.
 */
import { TRANSITION_LR } from "./loop.ts";
import { RHO_HAT_PROG_WEIGHT } from "./policy.ts";
import { ACTS, Kernel, OBS, R, SIZE, type KernelOptions } from "./kernel.ts";
import { senseGrid, stepGrid, type EnvSpec, type GridBody } from "./env.ts";
import { applyFamily, distractorSpec, regionCells } from "./family.ts";
import { mulberry32 } from "./presets.ts";
import { doorwayActionRegion, doorwayDelta } from "./doorway-run.ts";
import { LEARN_STEPS } from "./cycle.ts";
import { runRelearnSample } from "./relearn-run.ts";
import { DOOR_X, DOOR_Y, RELEARN_HIDDEN } from "./relearn.ts";
import { ATLAS_CONTENT_STEPS, ATLAS_DRIFT, ATLAS_STREAM, PHASE_DOSE } from "./atlas.ts";
import type { PhaseExplorer } from "./phase-diagram.ts";
import { PHASE_EXPLORERS } from "./phase-diagram.ts";

export type SignalGaps = Record<PhaseExplorer, number>;

export type AtlasGaps = {
  logit: SignalGaps;
  bonus: SignalGaps;
  raw: number;
};

/**
 * Additive pieces of one explorer's doorway score. They sum to the logit.
 * `extra` is the place bonus and is zero on the shipped door.
 */
export const SCORE_PIECE_NAMES = ["rho", "global", "uncertainty", "extrinsic", "follow", "extra"] as const;
export type ScorePieceName = (typeof SCORE_PIECE_NAMES)[number];
export type ScorePieceGaps = Record<ScorePieceName, number>;
export type ExplorerPieces = Record<PhaseExplorer, ScorePieceGaps>;

export type AtlasSample = {
  id: number;
  seed: number;
  learnDrop: number;
  overwrite: number;
  stay: number;
  rawHeld: number;
  rawNegate: number;
  dropHeld: number;
  dropNegate: number;
  noise: AtlasGaps;
  drift: AtlasGaps;
  forget: AtlasGaps;
  /** Boosted door minus the flat mastered door. */
  plant: AtlasGaps;
  flatRho: number;
  heldRho: number;
};

export type AtlasJob = { id: number; seed: number };

const RELEARN_STREAM = 9201;

function withSeed<T>(seed: number, fn: () => T): T {
  const prev = Math.random;
  Math.random = mulberry32(seed >>> 0);
  try {
    return fn();
  } finally {
    Math.random = prev;
  }
}

function zeros(): SignalGaps {
  return { random: 0, count: 0, surprise: 0, rnd: 0, rho: 0 };
}

function sub(a: SignalGaps, b: SignalGaps): SignalGaps {
  const out = zeros();
  for (const signal of PHASE_EXPLORERS) out[signal] = a[signal] - b[signal];
  return out;
}

function maxAbs(gaps: SignalGaps) {
  let m = 0;
  for (const signal of PHASE_EXPLORERS) m = Math.max(m, Math.abs(gaps[signal]));
  return m;
}

function weightSum(k: Kernel) {
  const w = k.loop.exportBrain().w1;
  let s = 0;
  for (let i = 0; i < w.length; i++) s += w[i]!;
  return s;
}

function freshKernel(seed: number, stream: number, env: EnvSpec, traceExplore = false) {
  return withSeed(seed * 10007 + stream, () => {
    const options: KernelOptions = {
      env,
      signal: "rho",
      cellHidden: RELEARN_HIDDEN,
      traceScores: true,
      traceExplore,
    };
    return new Kernel("distractor", seed, undefined, options);
  });
}

/** Cycle map, then east mode noise. Static keeps the frozen picture. */
export function noiseSpec(seed: number, content: "noise" | "static"): EnvSpec {
  return distractorSpec({
    learnability: 1,
    driftRate: 0,
    distractorRelevance: 0,
    noiseAmplitude: 1,
    cycleWorld: true,
    ...(content === "static" ? { roomContent: "static" as const, staticSeed: seed } : {}),
  });
}

export function driftSpec(arm: "drift" | "held", driftRate = ATLAS_DRIFT): EnvSpec {
  if (!(driftRate > 0) || driftRate >= 0.95) throw new Error(`drift door rate ${driftRate} is outside the ladder`);
  return distractorSpec({
    learnability: 1,
    driftRate,
    distractorRelevance: 0,
    cycleWorld: true,
    matchedPattern: arm,
  });
}

/**
 * Cycle-world construction paints a block and sets hold mode. The noise
 * generative step is the noise branch, which is also what keeps a frozen
 * picture frozen. Call this before any training step on a noise arm.
 */
export function applyNoiseMode(k: Kernel) {
  if (!k.family) throw new Error("atlas noise world has no family");
  if (!k.envParams.cycleWorld) throw new Error("atlas noise world is not the cycle map");
  if (k.family.mode !== "hold") throw new Error(`atlas noise world started in mode ${k.family.mode}`);
  k.family.mode = "noise";
}

function doorDelta(k: Kernel, values: ArrayLike<number>) {
  const delta = doorwayDelta(values, (action) => doorwayActionRegion(k, DOOR_X, DOOR_Y, action) === 1);
  if (delta == null) throw new Error("atlas doorway did not split actions");
  return delta;
}

function emptyPieces(): ScorePieceGaps {
  return { rho: 0, global: 0, uncertainty: 0, extrinsic: 0, follow: 0, extra: 0 };
}

function readPieces(k: Kernel): ScorePieceGaps {
  const parts = k.scoreParts;
  if (!parts) throw new Error("atlas doorway requires the score split");
  const out = emptyPieces();
  for (const name of SCORE_PIECE_NAMES) out[name] = doorDelta(k, parts[name]);
  return out;
}

function readExplore(k: Kernel): ExploreDoor | null {
  const explore = k.exploreParts;
  const parts = k.scoreParts;
  if (!explore) return null;
  if (!parts) throw new Error("explore split requires the score split");
  for (let a = 0; a < ACTS; a++) {
    const sum = explore.residual[a]! + explore.novelty[a]!;
    if (Math.abs(sum - parts.uncertainty[a]!) > 1e-6) {
      throw new Error(`explore split ${sum} left uncertainty ${parts.uncertainty[a]}`);
    }
  }
  return {
    residual: doorDelta(k, explore.residual),
    novelty: doorDelta(k, explore.novelty),
  };
}

function scoreDoor(k: Kernel): ScoredDoor {
  const brain = k.loop.exportBrain();
  const counts = k.visitCounts.slice();
  const predW = k.rnd.predW.slice();
  const predB = k.rnd.predB.slice();
  const x = k.x;
  const y = k.y;
  k.x = DOOR_X;
  k.y = DOOR_Y;
  const errors = new Float64Array(ACTS);
  for (let a = 0; a < ACTS; a++) errors[a] = k.actionTrueError(a);
  const raw = doorDelta(k, errors);
  const logit = zeros();
  const bonus = zeros();
  const pieces = {} as ExplorerPieces;
  let mix: ExploreDoor | null = null;
  for (const signal of PHASE_EXPLORERS) {
    const scores = k.scoreActions(signal);
    if (!k.scoreParts) throw new Error("atlas doorway requires the score split");
    logit[signal] = doorDelta(k, scores);
    bonus[signal] = signal === "random" ? 0 : doorDelta(k, k.scoreParts.rhoHat);
    pieces[signal] = readPieces(k);
    let total = 0;
    for (const name of SCORE_PIECE_NAMES) total += pieces[signal][name];
    if (Math.abs(total - logit[signal]) > 1e-6) {
      throw new Error(`door pieces ${total} do not match logit ${logit[signal]}`);
    }
    if (signal !== "random" && k.exploreParts) {
      const door = readExplore(k);
      if (!door) throw new Error("explore split disappeared during the door");
      if (Math.abs(door.residual + door.novelty - pieces[signal].uncertainty) > 1e-6) {
        throw new Error(`${signal} explore door left the uncertainty piece`);
      }
      if (!mix) mix = door;
      else if (Math.abs(mix.residual - door.residual) > 1e-6 || Math.abs(mix.novelty - door.novelty) > 1e-6) {
        throw new Error(`${signal} explore split left the shared door`);
      }
    }
  }
  if (!k.loop.importBrain(brain)) throw new Error("atlas could not restore the brain");
  k.visitCounts.set(counts);
  k.rnd.predW.set(predW);
  k.rnd.predB.set(predB);
  k.x = x;
  k.y = y;
  return { logit, bonus, raw, pieces, mix };
}

/** The published 200-step learn. Targets stay true. Counts and RND train. */
function learnMastered(k: Kernel, seed: number) {
  const rand = mulberry32((seed ^ 0x51c0) >>> 0);
  for (let t = 0; t < LEARN_STEPS; t++) {
    const pair = k.measurePair(1, rand, false);
    k.trainPair(pair.obs, pair.action, pair.next, TRANSITION_LR);
    k.rnd.train(pair.obs);
    k.visitCounts[pair.index] = (k.visitCounts[pair.index] ?? 0) + 1;
  }
}

/**
 * One generative step on the live family, then the transition that step
 * produced. The body in the copy is not the agent. The room is.
 */
function trainLive(k: Kernel, rand: () => number, steps: number) {
  const family = k.family;
  if (!family) throw new Error("atlas content training requires a family");
  for (let t = 0; t < steps; t++) {
    const pool = regionCells(family, 1, k.cells);
    if (pool.length === 0) throw new Error("atlas content training found no east cells");
    const index = pool[(rand() * pool.length) | 0]!;
    const x = index % SIZE;
    const y = (index / SIZE) | 0;
    const obs = new Float32Array(OBS);
    const blank = new Float32Array(SIZE * SIZE);
    senseGrid(k.cells, blank, x, y, SIZE, R, obs, family.glow);
    const action = (rand() * ACTS) | 0;
    const body: GridBody = {
      cells: k.cells,
      scent: blank,
      x,
      y,
      energy: 100,
      pulseClock: 0,
    };
    const stepRand = mulberry32((rand() * 0x100000000) >>> 0);
    stepGrid(body, k.worldKind, action, SIZE, stepRand, k.envParams, family);
    const next = new Float32Array(OBS);
    senseGrid(body.cells, body.scent, body.x, body.y, SIZE, R, next, family.glow);
    k.trainPair(obs, action, next, TRANSITION_LR);
    k.rnd.train(obs);
    k.visitCounts[index] = (k.visitCounts[index] ?? 0) + 1;
  }
  if (k.foods !== 0 || k.lives !== 0) throw new Error(`atlas content world recorded a meal or a death, foods ${k.foods} lives ${k.lives}`);
}

/**
 * The atlas drift cell, at any positive rate on the locked ladder.
 * The omitted rate is 0.01877, and that path is the published cell.
 * Both arms share the atlas weight stream. The train stream is
 * `seed ^ 0x41a6` on both arms. The gap is drift minus held.
 */
type DriftScored = {
  door: AtlasGaps;
  /** Drift arm, then held arm. The gap is drift minus held. */
  driftPieces: ExplorerPieces;
  heldPieces: ExplorerPieces;
};

/** Uncertainty term split into the residual weight and the novelty weight. */
export type ExploreDoor = { residual: number; novelty: number };

type ScoredDoor = {
  logit: SignalGaps;
  bonus: SignalGaps;
  raw: number;
  pieces: ExplorerPieces;
  /** Null unless the kernel was built with `traceExplore`. */
  mix: ExploreDoor | null;
};

/**
 * Train the matched drift pair and score the door. The omitted rate is
 * 0.01877. The piece buffers are the same score the logit already used.
 * They do not draw a random number and they do not enter the bonus.
 */
function scoreDriftPair(seed: number, driftRate: number, traceExplore = false): DriftScored & {
  driftMix: ExploreDoor | null;
  heldMix: ExploreDoor | null;
} {
  const left = freshKernel(seed, ATLAS_STREAM, driftSpec("drift", driftRate), traceExplore);
  const right = freshKernel(seed, ATLAS_STREAM, driftSpec("held", driftRate), traceExplore);
  if (weightSum(left) !== weightSum(right)) throw new Error("drift door arms did not share a weight init");
  if (left.family?.mode !== "drift" || right.family?.mode !== "hold") {
    throw new Error(`drift door arms are ${left.family?.mode} and ${right.family?.mode}`);
  }
  if (left.envParams.driftRate !== driftRate || right.envParams.driftRate !== driftRate) {
    throw new Error(`drift door rate drifted to ${left.envParams.driftRate}`);
  }
  const randLeft = mulberry32((seed ^ 0x41a6) >>> 0);
  const randRight = mulberry32((seed ^ 0x41a6) >>> 0);
  trainLive(left, randLeft, ATLAS_CONTENT_STEPS);
  trainLive(right, randRight, ATLAS_CONTENT_STEPS);
  const target = scoreDoor(left);
  const control = scoreDoor(right);
  const bonus = sub(target.bonus, control.bonus);
  if (bonus.count !== 0) throw new Error(`drift door count bonus gap is ${bonus.count}`);
  if (bonus.random !== 0 || target.logit.random !== 0 || control.logit.random !== 0) {
    throw new Error("drift door random score moved");
  }
  if (traceExplore && (!target.mix || !control.mix)) throw new Error("weight door did not record the explore split");
  if (!traceExplore && (target.mix || control.mix)) throw new Error("drift door recorded an explore split it did not ask for");
  return {
    door: { logit: sub(target.logit, control.logit), bonus, raw: target.raw - control.raw },
    driftPieces: target.pieces,
    heldPieces: control.pieces,
    driftMix: target.mix,
    heldMix: control.mix,
  };
}

export function runDriftDoor(seed: number, driftRate = ATLAS_DRIFT): AtlasGaps {
  return scoreDriftPair(seed, driftRate).door;
}

/** The drift door plus the additive pieces of each explorer's logit. */
export function runDriftPieceDoor(seed: number, driftRate = ATLAS_DRIFT): DriftScored {
  return scoreDriftPair(seed, driftRate);
}

export type DriftWeightDoor = DriftScored & {
  /** Drift minus held. The two weights sum to the shared uncertainty gap. */
  residual: number;
  novelty: number;
};

/**
 * The drift door, with the uncertainty term split into the residual weight
 * and the novelty weight. The split is not a second training. It does not
 * enter the bonus. The omitted rate is 0.01877.
 */
export function runDriftWeightDoor(seed: number, driftRate = ATLAS_DRIFT): DriftWeightDoor {
  const scored = scoreDriftPair(seed, driftRate, true);
  if (!scored.driftMix || !scored.heldMix) throw new Error("weight door missing the explore split");
  const residual = scored.driftMix.residual - scored.heldMix.residual;
  const novelty = scored.driftMix.novelty - scored.heldMix.novelty;
  const uncertainty = scored.driftPieces.rho.uncertainty - scored.heldPieces.rho.uncertainty;
  if (Math.abs(residual + novelty - uncertainty) > 1e-6) {
    throw new Error(`weight door ${residual + novelty} left uncertainty ${uncertainty}`);
  }
  return { ...scored, residual, novelty };
}

export type DoseMatch = {
  /** Drift minus held. The published ceiling door when the rate is 0.94. */
  door: AtlasGaps;
  /** Boosted held door minus the flat held door. The boost is this seed's dose. */
  plant: AtlasGaps;
  /** Progress-channel dose, 0.55 times the unmixed rho bonus gap. */
  dose: number;
};

/**
 * The drift door, then a constant progress-channel plant of that seed's own
 * dose on the held brain. The plant is not a second training and not a copy
 * of the weights. The scent head stays. A zero dose leaves the boost off and
 * the plant gap at zero. The door path is `runDriftDoor`.
 */
export function runDoseMatch(seed: number, driftRate: number): DoseMatch {
  const left = freshKernel(seed, ATLAS_STREAM, driftSpec("drift", driftRate));
  const right = freshKernel(seed, ATLAS_STREAM, driftSpec("held", driftRate));
  if (weightSum(left) !== weightSum(right)) throw new Error("matched door arms did not share a weight init");
  if (left.family?.mode !== "drift" || right.family?.mode !== "hold") {
    throw new Error(`matched door arms are ${left.family?.mode} and ${right.family?.mode}`);
  }
  if (left.envParams.driftRate !== driftRate || right.envParams.driftRate !== driftRate) {
    throw new Error(`matched door rate drifted to ${left.envParams.driftRate}`);
  }
  const randLeft = mulberry32((seed ^ 0x41a6) >>> 0);
  const randRight = mulberry32((seed ^ 0x41a6) >>> 0);
  trainLive(left, randLeft, ATLAS_CONTENT_STEPS);
  trainLive(right, randRight, ATLAS_CONTENT_STEPS);
  const target = scoreDoor(left);
  const control = scoreDoor(right);
  const bonus = sub(target.bonus, control.bonus);
  if (bonus.count !== 0) throw new Error(`matched door count bonus gap is ${bonus.count}`);
  if (bonus.random !== 0 || target.logit.random !== 0 || control.logit.random !== 0) {
    throw new Error("matched door random score moved");
  }
  const door: AtlasGaps = { logit: sub(target.logit, control.logit), bonus, raw: target.raw - control.raw };
  const dose = RHO_HAT_PROG_WEIGHT * door.bonus.rho;
  if (!Number.isFinite(dose)) throw new Error(`matched dose is not finite on seed ${seed}`);
  if (dose === 0) return { door, plant: { logit: zeros(), bonus: zeros(), raw: 0 }, dose };
  (right as { intrinsicBoost: { add: number; region: 0 | 1 } | null }).intrinsicBoost = {
    add: dose,
    region: 1,
  };
  const high = scoreDoor(right);
  const plantBonus = sub(high.bonus, control.bonus);
  if (maxAbs(plantBonus) > 1e-4) throw new Error(`matched plant changed the unmixed bonus by ${maxAbs(plantBonus)}`);
  if (high.logit.random !== 0 || control.logit.random !== 0) throw new Error("matched plant moved the random logit");
  const rawGap = high.raw - control.raw;
  if (Math.abs(rawGap) > 1e-4) throw new Error(`matched plant moved the realized error by ${rawGap}`);
  const plantLogit = sub(high.logit, control.logit);
  for (const signal of PHASE_EXPLORERS) {
    if (signal === "random" || signal === "rho") continue;
    if (Math.abs(plantLogit[signal]! - plantLogit.rho) > 1e-4) {
      throw new Error(`matched plant ${signal} logit ${plantLogit[signal]} left rho ${plantLogit.rho}`);
    }
  }
  return { door, plant: { logit: plantLogit, bonus: plantBonus, raw: rawGap }, dose };
}

function trainPair(seed: number, kind: "noise" | "drift"): AtlasGaps {
  if (kind === "drift") return runDriftDoor(seed, ATLAS_DRIFT);
  const left = freshKernel(seed, ATLAS_STREAM, noiseSpec(seed, "noise"));
  const right = freshKernel(seed, ATLAS_STREAM, noiseSpec(seed, "static"));
  if (weightSum(left) !== weightSum(right)) throw new Error("atlas noise arms did not share a weight init");
  applyNoiseMode(left);
  applyNoiseMode(right);
  const randLeft = mulberry32((seed ^ 0x41a5) >>> 0);
  const randRight = mulberry32((seed ^ 0x41a5) >>> 0);
  applyFamily(left.cells, left.family!, left.envParams, randLeft);
  applyFamily(right.cells, right.family!, right.envParams, randRight);
  trainLive(left, randLeft, ATLAS_CONTENT_STEPS);
  trainLive(right, randRight, ATLAS_CONTENT_STEPS);
  const target = scoreDoor(left);
  const control = scoreDoor(right);
  const bonus = sub(target.bonus, control.bonus);
  if (bonus.count !== 0) throw new Error(`atlas noise count bonus gap is ${bonus.count}`);
  if (bonus.random !== 0 || target.logit.random !== 0 || control.logit.random !== 0) {
    throw new Error("atlas noise random score moved");
  }
  return { logit: sub(target.logit, control.logit), bonus, raw: target.raw - control.raw };
}

function plantDoor(seed: number, heldRho: number): { plant: AtlasGaps; flatRho: number } {
  const mastered = freshKernel(seed, RELEARN_STREAM, masteredSpec());
  learnMastered(mastered, seed);
  const flatScore = scoreDoor(mastered);
  if (Math.abs(flatScore.logit.rho - heldRho) > 1e-9) {
    throw new Error(`atlas flat door ${flatScore.logit.rho} does not match the relearn door ${heldRho}`);
  }
  // Same brain. A second kernel drops the scent head, which is not in the
  // brain dump, and that head is part of rho-hat. The boost is a field the
  // score reads. It is not a copy of the weights.
  (mastered as { intrinsicBoost: { add: number; region: 0 | 1 } | null }).intrinsicBoost = {
    add: PHASE_DOSE,
    region: 1,
  };
  const high = scoreDoor(mastered);
  const bonus = sub(high.bonus, flatScore.bonus);
  if (maxAbs(bonus) > 1e-4) throw new Error(`atlas plant changed the unmixed bonus by ${maxAbs(bonus)} ${JSON.stringify(bonus)}`);
  if (high.logit.random !== 0 || flatScore.logit.random !== 0) throw new Error("atlas plant moved the random logit");
  if (Math.abs(high.raw - flatScore.raw) > 1e-4) throw new Error("atlas plant moved the realized error");
  return {
    flatRho: flatScore.logit.rho,
    plant: { logit: sub(high.logit, flatScore.logit), bonus, raw: high.raw - flatScore.raw },
  };
}

function masteredSpec(): EnvSpec {
  return distractorSpec({
    learnability: 1,
    driftRate: 0,
    distractorRelevance: 0,
    cycleWorld: true,
  });
}

export function runAtlasSample(id: number, seed: number): AtlasSample {
  if (ATLAS_DRIFT !== 0.01877) throw new Error(`atlas drift cell ${ATLAS_DRIFT} is not 0.01877`);
  const published = runRelearnSample(id, seed);
  const forget: AtlasGaps = {
    logit: {
      random: 0,
      count: published.negateDoor.logitCount - published.heldDoor.logitCount,
      surprise: published.negateDoor.logitSurprise - published.heldDoor.logitSurprise,
      rnd: published.negateDoor.logitRnd - published.heldDoor.logitRnd,
      rho: published.negateDoor.rho - published.heldDoor.rho,
    },
    bonus: {
      random: 0,
      count: published.negateDoor.count - published.heldDoor.count,
      surprise: published.negateDoor.surprise - published.heldDoor.surprise,
      rnd: published.negateDoor.rnd - published.heldDoor.rnd,
      rho: published.negateDoor.bonusRho - published.heldDoor.bonusRho,
    },
    raw: published.negateDoor.raw - published.heldDoor.raw,
  };
  if (forget.bonus.count !== 0) throw new Error(`atlas forget count bonus gap is ${forget.bonus.count}`);
  const planted = plantDoor(seed, published.heldDoor.rho);
  return {
    id,
    seed,
    learnDrop: published.learnDrop,
    overwrite: published.negateOverwrite,
    stay: published.stay,
    rawHeld: published.held.raw,
    rawNegate: published.negate.raw,
    dropHeld: published.held.drop20,
    dropNegate: published.negate.drop20,
    noise: trainPair(seed, "noise"),
    drift: trainPair(seed, "drift"),
    forget,
    plant: planted.plant,
    flatRho: planted.flatRho,
    heldRho: published.heldDoor.rho,
  };
}

export function runAtlasJob(job: AtlasJob): AtlasSample {
  return runAtlasSample(job.id, job.seed);
}
