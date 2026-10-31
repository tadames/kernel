/**
 * One episode of the pattern-channel pair. The noise arm is the historical
 * stationary room. `third` and `all` paint the held low-frequency pattern
 * on a locked subset and still draw the noise coin. Workers import this.
 * The sweep is not part of CI.
 */
import { Kernel, SIZE } from "./kernel.ts";
import { distractorSpec, FAMILY_LAYOUT_SEED } from "./family.ts";
import { mulberry32 } from "./presets.ts";
import type { CuriositySignal } from "./signals.ts";
import { emptyAccum, finishProgress, pushProgress, type RoomProgress } from "./progress.ts";
import { SHIPPED_POLICY_TEMPERATURE } from "./noise.ts";

export const COMPETE_STREAM = 24001;

export type CompeteLevel = "third" | "all";
export type CompeteArm = "pattern" | "noise";

export type CompeteRequest = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  /** Which pattern mask the pattern arm uses. The noise arm ignores it. */
  level: CompeteLevel;
  arm: CompeteArm;
};

export type CompeteResult = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  level: CompeteLevel;
  arm: CompeteArm;
  distractorFrac: number;
  foods: number;
  lives: number;
  /** Cell index before each move, folded with multiplier 33. */
  path: number;
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

export function runCompeteEpisode(req: CompeteRequest): CompeteResult {
  const spec = distractorSpec({
    learnability: 1,
    driftRate: 0,
    distractorRelevance: 0,
    ...(req.arm === "pattern" ? { patternChannel: req.level } : {}),
  });
  return withSeed(req.seed * 10007 + COMPETE_STREAM, () => {
    const k = new Kernel("distractor", req.seed, undefined, {
      env: { ...spec, layoutSeed: FAMILY_LAYOUT_SEED },
      signal: req.signal,
    });
    if (k.params.temperature !== SHIPPED_POLICY_TEMPERATURE) {
      throw new Error(`temperature ${k.params.temperature} is not the shipped softmax`);
    }
    if (!k.features.option || !k.features.transition) {
      throw new Error("the shipped learner keeps option and transition on");
    }
    if (k.features.echo || k.features.edge || k.features.rollout || k.features.discard || k.features.decode) {
      throw new Error("a flag that defaults off was on");
    }
    let inRoom = 0;
    let path = 0;
    let surpriseSum = 0;
    let surpriseN = 0;
    const eastAcc = emptyAccum();
    const trace = req.signal === "rho";
    for (let t = 0; t < req.steps; t++) {
      const x = k.x;
      const y = k.y;
      const reg = k.regionAt();
      path = (Math.imul(path, 33) + y * SIZE + x) | 0;
      k.step();
      if (reg === 1) {
        inRoom += 1;
        surpriseSum += k.loop.surprise;
        surpriseN += 1;
        if (trace) pushProgress(eastAcc, k.loop.progress, k.loop.progressEma);
      }
    }
    return {
      id: req.id,
      seed: req.seed,
      signal: req.signal,
      steps: req.steps,
      level: req.level,
      arm: req.arm,
      distractorFrac: req.steps ? inRoom / req.steps : 0,
      foods: k.foods,
      lives: k.lives,
      path,
      targetSurprise: surpriseN ? surpriseSum / surpriseN : null,
      east: finishProgress(eastAcc),
    };
  });
}
