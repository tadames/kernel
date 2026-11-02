/**
 * Doorway score on the pure pattern versus matched noise, plus a planted
 * progress-channel bonus of 0.0169 on that same pattern. The seed stream is
 * the compete episode, so seeds 1–200 reproduce that occupancy. Workers
 * import this. The sweep is not part of CI.
 */
import { Kernel, SIZE } from "./kernel.ts";
import { distractorSpec, FAMILY_LAYOUT_SEED } from "./family.ts";
import { doorwayActionRegion, doorwayDelta } from "./doorway-run.ts";
import { mulberry32 } from "./presets.ts";
import type { CuriositySignal } from "./signals.ts";
import { emptyAccum, finishProgress, pushProgress, type RoomProgress } from "./progress.ts";
import { SHIPPED_POLICY_TEMPERATURE } from "./noise.ts";
import { COMPETE_STREAM } from "./compete-run.ts";

/** Same additive dose the occupancy curve first missed and the score curve cleared. */
export const CREDIT_DOSE = 0.0169;

/** Published pure-room occupancy excess, pattern minus noise, rho, seeds 1–200. */
export const COMPETE_RHO_ALL_OCCUPANCY = 0.0027625000000000037;

/** Published pure-room rectified-progress gap, rho, seeds with at least 8 steps in both rooms. */
export const COMPETE_RHO_ALL_RECTIFIED = 0.02165466068345234;

export const COMPETE_RHO_ALL_RECT_N = 177;

export type CreditArm = "pattern" | "noise" | "boost";

export type CreditRequest = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  arm: CreditArm;
};

export type CreditResult = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  arm: CreditArm;
  distractorFrac: number;
  foods: number;
  lives: number;
  /** Cell index before each move, folded with multiplier 33. */
  path: number;
  samples: number;
  scoreGap: number;
  scoreSteps: number;
  /** Mean training surprise on steps that began in region 1. Null if none. */
  targetSurprise: number | null;
  east: RoomProgress;
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

export function runCreditEpisode(req: CreditRequest): CreditResult {
  const spec = distractorSpec({
    learnability: 1,
    driftRate: 0,
    distractorRelevance: 0,
    ...(req.arm === "noise" ? {} : { patternChannel: "all" as const }),
  });
  return withSeed(req.seed * 10007 + COMPETE_STREAM, () => {
    const k = new Kernel("distractor", req.seed, undefined, {
      env: { ...spec, layoutSeed: FAMILY_LAYOUT_SEED },
      signal: req.signal,
      ...(req.arm === "boost" ? { intrinsicBoost: { add: CREDIT_DOSE, region: 1 as const } } : {}),
    });
    if (k.params.temperature !== SHIPPED_POLICY_TEMPERATURE) {
      throw new Error(`temperature ${k.params.temperature} is not the shipped softmax`);
    }
    if (!k.features.option || !k.features.transition) {
      throw new Error("the shipped learner keeps option and transition on");
    }
    if (
      k.features.echo ||
      k.features.edge ||
      k.features.shape ||
      k.features.wonder ||
      k.features.revise ||
      k.features.rollout ||
      k.features.discard ||
      k.features.decode
    ) {
      throw new Error("a flag that defaults off was on");
    }
    const boosted = k.intrinsicBoost;
    if (req.arm === "boost") {
      if (!boosted || boosted.add !== CREDIT_DOSE || boosted.region !== 1) {
        throw new Error("the planted arm is not a 0.0169 bonus on region 1");
      }
    } else if (boosted) {
      throw new Error("the unboosted arm carried a place bonus");
    }
    let inRoom = 0;
    let path = 0;
    let samples = 0;
    let scoreSum = 0;
    let scoreSteps = 0;
    let surpriseSum = 0;
    let surpriseN = 0;
    const eastAcc = emptyAccum();
    const trace = req.signal === "rho";
    for (let t = 0; t < req.steps; t++) {
      const x = k.x;
      const y = k.y;
      const reg = k.regionAt();
      const heldBefore = k.optionHeld;
      path = (Math.imul(path, 33) + y * SIZE + x) | 0;
      k.step();
      if (reg === 1) {
        inRoom += 1;
        surpriseSum += k.loop.surprise;
        surpriseN += 1;
        if (trace) pushProgress(eastAcc, k.loop.progress, k.loop.progressEma);
      }
      if (k.optionHeld !== heldBefore) continue;
      samples += 1;
      const delta = doorwayDelta(k.scores, (action) => doorwayActionRegion(k, x, y, action) === 1);
      if (delta == null) continue;
      scoreSum += delta;
      scoreSteps += 1;
    }
    if (req.steps % 2 !== 0 || samples !== req.steps / 2) {
      throw new Error(`seed ${req.seed} ${req.arm} sampled ${samples} of ${req.steps}`);
    }
    return {
      id: req.id,
      seed: req.seed,
      signal: req.signal,
      steps: req.steps,
      arm: req.arm,
      distractorFrac: req.steps ? inRoom / req.steps : 0,
      foods: k.foods,
      lives: k.lives,
      path,
      samples,
      scoreGap: scoreSteps ? scoreSum / scoreSteps : 0,
      scoreSteps,
      targetSurprise: surpriseN ? surpriseSum / surpriseN : null,
      east: finishProgress(eastAcc),
    };
  });
}
