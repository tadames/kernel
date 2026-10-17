/**
 * Rectified progress on the matched drift pair, in the units of the
 * place-bonus doses. The episode is the drift episode: same spec, same
 * seed stream, no probes. Workers import this. The sweep is not part of CI.
 */
import { Kernel, OBS, SIZE } from "./kernel.ts";
import { distractorSpec, FAMILY_LAYOUT_SEED } from "./family.ts";
import { mulberry32 } from "./presets.ts";
import { expectedResidual } from "./policy.ts";
import type { CuriositySignal } from "./signals.ts";
import type { DriftArm } from "./drift-run.ts";

/**
 * Weight of an action bonus inside the progress channel.
 * The shipped score is max(0, learning) + dose + 0.55 × max(0, bonus).
 */
export const PROGRESS_SLOT_WEIGHT = 0.55;

/**
 * Rho occupancy excess at r* = 0.01877, drift minus held, from the
 * published drift sweep. A new runner that misses this is a different episode.
 */
export const PUBLISHED_RHO_OCCUPANCY = -0.0032124999999999983;

export type DriftGapRequest = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  driftRate: number;
  arm: DriftArm;
};

export type DriftGapResult = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  driftRate: number;
  arm: DriftArm;
  distractorFrac: number;
  foods: number;
  lives: number;
  roomSteps: number;
  rectSum: number;
  policySum: number;
  channelSum: number;
  progressPos: number;
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

export function runDriftGapEpisode(req: DriftGapRequest): DriftGapResult {
  const spec = distractorSpec({
    learnability: 1,
    driftRate: req.driftRate,
    distractorRelevance: 0,
    matchedPattern: req.arm,
  });
  return withSeed(req.seed * 10007 + 7301, () => {
    const k = new Kernel("distractor", req.seed, undefined, {
      env: { ...spec, layoutSeed: FAMILY_LAYOUT_SEED },
      signal: req.signal,
    });
    let inRoom = 0;
    let progressPos = 0;
    let rectSum = 0;
    let policySum = 0;
    let channelSum = 0;
    const obs = new Float32Array(OBS);
    for (let t = 0; t < req.steps; t++) {
      const reg = k.regionAt();
      let countSlot = 0;
      let rndSlot = 0;
      if (reg === 1 && k.signal === "count") {
        const n = k.visitCounts[k.y * SIZE + k.x] ?? 0;
        countSlot = PROGRESS_SLOT_WEIGHT / Math.sqrt(n + 1);
      } else if (reg === 1 && k.signal === "rnd") {
        k.sense(obs);
        rndSlot = PROGRESS_SLOT_WEIGHT * Math.max(0, k.rnd.error(obs));
      }
      k.step();
      if (reg !== 1) continue;
      inRoom += 1;
      const raw = k.loop.progress;
      if (raw > 0) progressPos += 1;
      const rect = raw > 0 ? raw : 0;
      const policy = k.loop.progressEma > 0 ? k.loop.progressEma : 0;
      rectSum += rect;
      policySum += policy;
      if (k.signal === "rho") channelSum += rect;
      else if (k.signal === "count") channelSum += countSlot;
      else if (k.signal === "rnd") channelSum += rndSlot;
      else if (k.signal === "surprise") {
        const pred = k.imagined[k.lastAction];
        const bonus = pred ? expectedResidual(pred, (i) => k.loop.familyWeight(i % 3)) : 0;
        channelSum += PROGRESS_SLOT_WEIGHT * Math.max(0, bonus);
      }
    }
    return {
      id: req.id,
      seed: req.seed,
      signal: req.signal,
      steps: req.steps,
      driftRate: req.driftRate,
      arm: req.arm,
      distractorFrac: req.steps ? inRoom / req.steps : 0,
      foods: k.foods,
      lives: k.lives,
      roomSteps: inRoom,
      rectSum,
      policySum,
      channelSum,
      progressPos,
    };
  });
}
