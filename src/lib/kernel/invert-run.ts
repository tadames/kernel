/**
 * Why the in-room horizon-2 drop inverts the retrospective progress edge.
 * The episode is the reach contrast. The shipped drop is read beside the
 * signed drop, the mean follow-up, the residual-scaled drop, and the early
 * half. Workers import this. The sweep is not part of CI.
 */
import { Kernel, SIZE } from "./kernel.ts";
import { distractorSpec, FAMILY_LAYOUT_SEED } from "./family.ts";
import { doorwayActionRegion, doorwayDelta } from "./doorway-run.ts";
import { mulberry32 } from "./presets.ts";
import type { CuriositySignal } from "./signals.ts";
import { emptyAccum, finishProgress, pushProgress, type RoomProgress } from "./progress.ts";
import { SHIPPED_POLICY_TEMPERATURE } from "./noise.ts";
import { COMPETE_STREAM } from "./compete-run.ts";
import { stayLevel } from "./reach-run.ts";
import type { RhoDropTrace } from "./policy.ts";

/** Published in-room horizon-2 drop, pattern minus noise, rho, seeds 1–800. */
export const REACH_ROOM_DROP2_MEAN = -0.017389538705750777;

export const REACH_ROOM_DROP2_LO = -0.018575258067774096;

export const REACH_ROOM_DROP2_HI = -0.01628763588135163;

export const REACH_ROOM_DROP2_N = 745;

/** Reach bootstrap salt for the rho in-room horizon-2 row. */
export const REACH_ROOM_DROP2_SALT = 28504;

/**
 * Floor under the first-window residual when the rectified drop is divided
 * by it. A residual below this is treated as this value. The shipped drop
 * is not divided.
 */
export const INVERT_SCALE_EPS = 1e-6;

export type InvertArm = "pattern" | "noise";

export type InvertRequest = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  arm: InvertArm;
};

export type InvertResult = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  arm: InvertArm;
  distractorFrac: number;
  foods: number;
  lives: number;
  /** Cell index before each move, folded with multiplier 33. */
  path: number;
  samples: number;
  scoreGap: number;
  scoreSteps: number;
  east: RoomProgress;
  /** In-room sample ticks. A stay action is required on each. */
  roomSteps: number;
  /** Shipped `max(0, res1 − res2*)`, stay actions, in-room sample ticks. */
  drop2: number;
  /** `res1 − res2*`, same ticks. No rectification. */
  signed: number;
  /** `res1 − mean follow-up residual`, same ticks. */
  mean: number;
  /** `max(0, res1 − mean follow-up residual)`, same ticks. Not a call. */
  meanRect: number;
  /** Shipped drop divided by `max(res1, INVERT_SCALE_EPS)`, same ticks. */
  scale: number;
  /** `res1 − min follow-up residual`, same ticks. Not a call. */
  order: number;
  /** `max follow-up residual − min follow-up residual`, same ticks. */
  spread: number;
  /** First-window residual, same ticks. Not a call. */
  res1: number;
  /** Shipped drop on sample ticks with `t < steps / 2` that began in the room. */
  early: number;
  earlySteps: number;
  /** Shipped drop on the remaining in-room sample ticks. Not a call. */
  late: number;
  lateSteps: number;
  /** Rectified one-step surprise drop, `max(0, surprise before − surprise after)`, same ticks. */
  stepProg: number;
  /** Rectified shipped progress, `max(0, ema − surprise)`, same ticks. */
  emaProg: number;
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

function actionMean(n: number, pick: (action: number) => number, destIsTarget: (action: number) => boolean): number | null {
  let sum = 0;
  let count = 0;
  for (let a = 0; a < n; a++) {
    if (!destIsTarget(a)) continue;
    sum += pick(a);
    count += 1;
  }
  if (count === 0) return null;
  return sum / count;
}

function scaledDrop(trace: RhoDropTrace, action: number) {
  const res1 = trace.res1[action]!;
  const drop = Math.max(0, res1 - trace.best[action]!);
  return drop / Math.max(res1, INVERT_SCALE_EPS);
}

export function runInvertEpisode(req: InvertRequest): InvertResult {
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
      traceRho: true,
      traceDrop: true,
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
    if (k.intrinsicBoost) throw new Error("the invert arm carried a place bonus");
    if (!k.rhoHatParts || !k.rhoDrop) throw new Error("a trace buffer was not allocated");
    const rho = req.signal === "rho";
    let inRoom = 0;
    let path = 0;
    let samples = 0;
    let scoreSum = 0;
    let scoreSteps = 0;
    let roomSteps = 0;
    let dropSum = 0;
    let signedSum = 0;
    let meanSum = 0;
    let meanRectSum = 0;
    let scaleSum = 0;
    let orderSum = 0;
    let spreadSum = 0;
    let resSum = 0;
    let earlySum = 0;
    let earlySteps = 0;
    let lateSum = 0;
    let lateSteps = 0;
    let stepSum = 0;
    let emaSum = 0;
    let surprise = k.loop.surprise;
    const eastAcc = emptyAccum();
    const traceProgress = rho;
    const half = req.steps / 2;
    for (let t = 0; t < req.steps; t++) {
      const x = k.x;
      const y = k.y;
      const reg = k.regionAt();
      const heldBefore = k.optionHeld;
      const prevSurprise = surprise;
      path = (Math.imul(path, 33) + y * SIZE + x) | 0;
      k.step();
      surprise = k.loop.surprise;
      if (reg === 1 && traceProgress) pushProgress(eastAcc, k.loop.progress, k.loop.progressEma);
      if (reg === 1) inRoom += 1;
      if (k.optionHeld !== heldBefore) continue;
      samples += 1;
      const hat = k.rhoHatParts;
      const drop = k.rhoDrop;
      if (!hat || !drop) throw new Error("a trace buffer disappeared");
      const into = (action: number) => doorwayActionRegion(k, x, y, action) === 1;
      const delta = doorwayDelta(k.scores, into);
      if (delta != null) {
        scoreSum += delta;
        scoreSteps += 1;
      }
      if (reg !== 1) continue;
      const dropLevel = stayLevel(hat.drop2, into);
      if (dropLevel == null) throw new Error(`seed ${req.seed} ${req.arm} lost an in-room drop`);
      const nAct = drop.res1.length;
      const signedLevel = actionMean(nAct, (action) => drop.res1[action]! - drop.best[action]!, into);
      const meanLevel = actionMean(nAct, (action) => drop.res1[action]! - drop.mean[action]!, into);
      const meanRectLevel = actionMean(nAct, (action) => Math.max(0, drop.res1[action]! - drop.mean[action]!), into);
      const scaleLevel = actionMean(nAct, (action) => scaledDrop(drop, action), into);
      const orderLevel = actionMean(nAct, (action) => drop.res1[action]! - drop.min[action]!, into);
      const spreadLevel = actionMean(nAct, (action) => drop.max[action]! - drop.min[action]!, into);
      const resLevel = actionMean(nAct, (action) => drop.res1[action]!, into);
      const traceRect = actionMean(nAct, (action) => Math.max(0, drop.res1[action]! - drop.best[action]!), into);
      if (
        signedLevel == null ||
        meanLevel == null ||
        meanRectLevel == null ||
        scaleLevel == null ||
        orderLevel == null ||
        spreadLevel == null ||
        resLevel == null ||
        traceRect == null
      ) {
        throw new Error(`seed ${req.seed} ${req.arm} lost an in-room residual`);
      }
      if (rho && Math.abs(traceRect - dropLevel) > 1e-6) {
        throw new Error(`seed ${req.seed} ${req.arm} traced drop ${traceRect} does not match ${dropLevel}`);
      }
      if (!rho && dropLevel !== 0) {
        throw new Error(`seed ${req.seed} ${req.arm} ${req.signal} wrote a horizon drop`);
      }
      dropSum += dropLevel;
      signedSum += signedLevel;
      meanSum += meanLevel;
      meanRectSum += meanRectLevel;
      scaleSum += scaleLevel;
      orderSum += orderLevel;
      spreadSum += spreadLevel;
      resSum += resLevel;
      const stepP = prevSurprise - surprise;
      stepSum += stepP > 0 ? stepP : 0;
      emaSum += k.loop.progress > 0 ? k.loop.progress : 0;
      if (t < half) {
        earlySum += dropLevel;
        earlySteps += 1;
      } else {
        lateSum += dropLevel;
        lateSteps += 1;
      }
      roomSteps += 1;
    }
    if (req.steps % 2 !== 0 || samples !== req.steps / 2) {
      throw new Error(`seed ${req.seed} ${req.arm} sampled ${samples} of ${req.steps}`);
    }
    const denom = roomSteps || 1;
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
      east: finishProgress(eastAcc),
      roomSteps,
      drop2: dropSum / denom,
      signed: signedSum / denom,
      mean: meanSum / denom,
      meanRect: meanRectSum / denom,
      scale: scaleSum / denom,
      order: orderSum / denom,
      spread: spreadSum / denom,
      res1: resSum / denom,
      early: earlySteps ? earlySum / earlySteps : 0,
      earlySteps,
      late: lateSteps ? lateSum / lateSteps : 0,
      lateSteps,
      stepProg: stepSum / denom,
      emaProg: emaSum / denom,
    };
  });
}
