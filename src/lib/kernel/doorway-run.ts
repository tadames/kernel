/**
 * Doorway score on the matched drift pair. The score is the mean logit of
 * actions that land in region 1 minus the mean logit of the others, on ticks
 * that sample. A held tick does not write a score for the cell it stands in.
 * Workers import this. The sweep is not part of CI.
 */
import { DIRS, Kernel, SIZE } from "./kernel.ts";
import { distractorSpec, FAMILY_LAYOUT_SEED } from "./family.ts";
import { mulberry32 } from "./presets.ts";
import type { CuriositySignal } from "./signals.ts";
import type { DriftArm } from "./drift-run.ts";

export type DoorwayRequest = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  driftRate: number;
  arm: DriftArm;
  /** The sensitivity setting. The shipped softmax is not this run. */
  policyTemperature: number;
};

export type DoorwayResult = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  driftRate: number;
  arm: DriftArm;
  distractorFrac: number;
  foods: number;
  lives: number;
  /** Cell index before each move, folded with multiplier 33. */
  path: number;
  samples: number;
  scoreGap: number;
  scoreSteps: number;
};

/**
 * Mean score of actions into region 1 minus the mean of the others.
 * Null when every action falls on one side, so that tick is not a doorway.
 */
export function doorwayDelta(scores: ArrayLike<number>, destIsTarget: (action: number) => boolean): number | null {
  let into = 0;
  let intoN = 0;
  let out = 0;
  let outN = 0;
  for (let a = 0; a < scores.length; a++) {
    if (destIsTarget(a)) {
      into += scores[a]!;
      intoN += 1;
    } else {
      out += scores[a]!;
      outN += 1;
    }
  }
  if (intoN === 0 || outN === 0) return null;
  return into / intoN - out / outN;
}

function withSeed<T>(seed: number, fn: () => T): T {
  const prev = Math.random;
  Math.random = mulberry32(seed >>> 0);
  try {
    return fn();
  } finally {
    Math.random = prev;
  }
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

export function runDoorwayEpisode(req: DoorwayRequest): DoorwayResult {
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
      policyTemperature: req.policyTemperature,
    });
    let inRoom = 0;
    let path = 0;
    let samples = 0;
    let scoreSum = 0;
    let scoreSteps = 0;
    for (let t = 0; t < req.steps; t++) {
      const x = k.x;
      const y = k.y;
      const reg = k.regionAt();
      const heldBefore = k.optionHeld;
      path = (Math.imul(path, 33) + y * SIZE + x) | 0;
      k.step();
      if (reg === 1) inRoom += 1;
      if (k.optionHeld !== heldBefore) continue;
      samples += 1;
      const delta = doorwayDelta(k.scores, (action) => actionRegion(k, x, y, action) === 1);
      if (delta == null) continue;
      scoreSum += delta;
      scoreSteps += 1;
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
      path,
      samples,
      scoreGap: scoreSteps ? scoreSum / scoreSteps : 0,
      scoreSteps,
    };
  });
}
