/**
 * One episode of the place-bonus positive control. The boosted arm adds a
 * constant to the progress channel of actions that land in region 1. The
 * control omits that option, so it is the shipped agent. Workers import this.
 * The sweep is not part of CI.
 */
import { DIRS, Kernel, SIZE } from "./kernel.ts";
import { distractorSpec, FAMILY_LAYOUT_SEED } from "./family.ts";
import { mulberry32 } from "./presets.ts";
import type { CuriositySignal } from "./signals.ts";

/**
 * Additive doses on the progress channel. 0.0085 is the PR #7 matched-room
 * surprise gap. 0.0169 is the rectified progress gap from the noise-progress
 * study. The rest bracket those gaps and a misreading of the drift fraction
 * 0.07 as if it were a progress magnitude.
 */
export const BOOST_ADDS = [0.0085, 0.0169, 0.05, 0.15, 0.5, 2] as const;

/** Rectified progress gap, learnable room minus noise room. The primary dose. */
export const BOOST_GAP = 0.0169;

/**
 * A first detection above this dose is far above the locked gaps.
 * 0.15 is about 9× the progress gap and stays inside the order of magnitude.
 * 0.5 is the first dose the summary treats as insensitive.
 */
export const BOOST_FAR = 0.15;

export const BOOST_SURPRISE_GAP = 0.0085;

export type BoostRequest = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  /** Zero omits the option. The control arm is this value. */
  add: number;
};

export type BoostResult = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  add: number;
  distractorFrac: number;
  foods: number;
  lives: number;
  /**
   * Mean over steps of (mean score of actions into region 1 − mean score of
   * the others). Zero when a step has no action on one side.
   */
  scoreGap: number;
  scoreGapSteps: number;
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

export function runBoostEpisode(req: BoostRequest): BoostResult {
  const spec = distractorSpec({
    learnability: 1,
    driftRate: 0,
    distractorRelevance: 0,
    matchedPattern: "held",
  });
  return withSeed(req.seed * 10007 + 8101, () => {
    const k = new Kernel("distractor", req.seed, undefined, {
      env: { ...spec, layoutSeed: FAMILY_LAYOUT_SEED },
      signal: req.signal,
      intrinsicBoost: req.add === 0 ? undefined : { add: req.add, region: 1 },
    });
    let inRoom = 0;
    let scoreSum = 0;
    let scoreSteps = 0;
    for (let t = 0; t < req.steps; t++) {
      const x = k.x;
      const y = k.y;
      const reg = k.regionAt();
      k.step();
      if (reg === 1) inRoom += 1;
      let into = 0;
      let intoN = 0;
      let out = 0;
      let outN = 0;
      for (let a = 0; a < k.scores.length; a++) {
        const dest = actionRegion(k, x, y, a);
        if (dest === 1) {
          into += k.scores[a]!;
          intoN += 1;
        } else {
          out += k.scores[a]!;
          outN += 1;
        }
      }
      if (intoN > 0 && outN > 0) {
        scoreSum += into / intoN - out / outN;
        scoreSteps += 1;
      }
    }
    return {
      id: req.id,
      seed: req.seed,
      signal: req.signal,
      steps: req.steps,
      add: req.add,
      distractorFrac: req.steps ? inRoom / req.steps : 0,
      foods: k.foods,
      lives: k.lives,
      scoreGap: scoreSteps ? scoreSum / scoreSteps : 0,
      scoreGapSteps: scoreSteps,
    };
  });
}

/** Same destination rule as the policy's visit count: a blocked step stays. */
function actionRegion(k: Kernel, x: number, y: number, action: number) {
  const nx = x + DIRS[action]!.x;
  const ny = y + DIRS[action]!.y;
  const oob = nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE;
  const blocked = action === 4 || oob || k.cells[ny * SIZE + nx] === 1;
  if (blocked) return k.regionAt(x, y);
  return k.regionAt(nx, ny);
}
