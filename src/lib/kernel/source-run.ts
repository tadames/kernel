/**
 * Why the imagined Bernoulli drop prefers noise while experienced progress
 * prefers the pattern. The episode is the invert contrast. The shipped drop
 * is read beside the expected-error drop of the same two windows, a hard
 * replay of the second window, and a wait replay. Workers import this.
 * The sweep is not part of CI.
 */
import { ACTS, CH, DIRS, Kernel, OBS, R, SIZE } from "./kernel.ts";
import {
  distractorSpec,
  EAST_HOLD_LATENT,
  FAMILY_LAYOUT_SEED,
  patternBit,
  type FamilyMemory,
} from "./family.ts";
import { doorwayActionRegion, doorwayDelta } from "./doorway-run.ts";
import { mulberry32 } from "./presets.ts";
import type { CuriositySignal } from "./signals.ts";
import { emptyAccum, finishProgress, pushProgress, type RoomProgress } from "./progress.ts";
import { SHIPPED_POLICY_TEMPERATURE } from "./noise.ts";
import { COMPETE_STREAM } from "./compete-run.ts";
import { stayLevel } from "./reach-run.ts";
import { expectedResidual, REPLAY_HARD_AT } from "./policy.ts";

/** Published signed score-selected drop, pattern minus noise, rho, seeds 1–800. */
export const INVERT_SIGNED_MEAN = -0.02648417014527407;

export const INVERT_SIGNED_LO = -0.02791401147556503;

export const INVERT_SIGNED_HI = -0.02508995485739464;

export const INVERT_SIGNED_N = 745;

/** Invert bootstrap salt for the signed row. */
export const INVERT_SIGNED_SALT = 29201;

/** Published first-window residual, pattern minus noise, rho, seeds 1–800. */
export const INVERT_RES1_MEAN = -0.062402946109348906;

export const INVERT_RES1_LO = -0.06707283655710157;

export const INVERT_RES1_HI = -0.058073926461417784;

export const INVERT_RES1_N = 745;

/** Invert bootstrap salt for the first-window residual. */
export const INVERT_RES1_SALT = 29208;

/**
 * Expected squared error is in surprise units. δ is the planted
 * progress-channel dose, 0.0169. It is not the residual δ.
 */
export const SOURCE_ERROR_DELTA = 0.0169;

export const SOURCE_ERROR_SALT = 29301;

export const SOURCE_HARD_SALT = 29302;

export const SOURCE_STAY_SALT = 29303;

export const SOURCE_ERR1_SALT = 29304;

/** Wait is the last action. A replay with it does not shift the window. */
export const SOURCE_WAIT = 4;

export type SourceArm = "pattern" | "noise";

export type SourceRequest = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  arm: SourceArm;
};

export type SourceResult = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  arm: SourceArm;
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
  /** `res1 − res2*`, same ticks. */
  signed: number;
  /** `err1 − err2*` on the score-winning follow-up. Expected squared error. */
  error: number;
  /** `res1 − resHard` on that same follow-up. Hard threshold, no shift change. */
  hard: number;
  /** `res1 − resWait`. Soft replay, wait action. */
  stay: number;
  /** First-window Bernoulli residual, same ticks. Not a call. */
  res1: number;
  /** Expected squared error of the first window, same ticks. Not a call. */
  err1: number;
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

/** Squared error of one coordinate. A coin has no fixed bit. */
export function expectedSquaredError(p: number, kind: "fixed" | "coin", bit = 0) {
  if (kind === "coin") return p * p - p + 0.5;
  const d = p - bit;
  return d * d;
}

function glowTarget(x: number, y: number, idx: number, family: FamilyMemory): { kind: "fixed" | "coin"; bit: number } {
  const reg = family.region[idx] ?? 2;
  if (reg === 2) return { kind: "fixed", bit: 0 };
  if (reg === 0) {
    if (family.stochastic[idx]) return { kind: "coin", bit: 0 };
    return { kind: "fixed", bit: family.fixedGlow[idx] ?? 0 };
  }
  if (family.channel[idx]) return { kind: "fixed", bit: patternBit(x, y, EAST_HOLD_LATENT) };
  if (family.mode === "noise" && !family.freezeTarget) return { kind: "coin", bit: 0 };
  return { kind: "fixed", bit: patternBit(x, y, family.eastLatent) };
}

/**
 * Mean expected squared error of a predicted window. Wall and food only,
 * the same coordinates the Bernoulli residual weights. Scent is omitted.
 * `eaten` is a cell index the imagined move consumes, or -1. A fresh food
 * spawn is not in the target. The pre-step cell map is `cells`.
 */
export function expectedWindowError(
  pred: ArrayLike<number>,
  ox: number,
  oy: number,
  cells: Uint8Array,
  family: FamilyMemory,
  eaten: number,
): number {
  const size = family.size;
  let sum = 0;
  let den = 0;
  let k = 0;
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const wx = ox + dx;
      const wy = oy + dy;
      const pWall = pred[k] ?? 0;
      const pFood = pred[k + 1] ?? 0;
      k += CH;
      const oob = wx < 0 || wy < 0 || wx >= size || wy >= size;
      let wallKind: "fixed" | "coin" = "fixed";
      let wallBit = 1;
      let foodBit = 0;
      if (!oob) {
        const idx = wy * size + wx;
        const emptied = idx === eaten;
        if (!emptied && cells[idx] === 1) {
          wallBit = 1;
          foodBit = 0;
        } else if (!emptied && family.decoy[idx] === 1) {
          wallBit = 0;
          foodBit = 1;
        } else if (!emptied && cells[idx] === 2 && (family.region[idx] ?? 2) !== 1) {
          wallBit = 0;
          foodBit = 1;
        } else {
          const glow = glowTarget(wx, wy, idx, family);
          wallKind = glow.kind;
          wallBit = glow.bit;
          foodBit = 0;
        }
      }
      sum += expectedSquaredError(pWall, wallKind, wallBit);
      sum += expectedSquaredError(pFood, "fixed", foodBit);
      den += 2;
    }
  }
  if (k !== OBS) throw new Error(`expected window read ${k}, not ${OBS}`);
  return den ? sum / den : 0;
}

/** Destination of one action on a frozen cell map. A blocked step stays. */
export function bodyAfter(x: number, y: number, action: number, cells: Uint8Array, size = SIZE) {
  const nx = x + DIRS[action]!.x;
  const ny = y + DIRS[action]!.y;
  const oob = nx < 0 || ny < 0 || nx >= size || ny >= size;
  const blocked = action === SOURCE_WAIT || oob || cells[ny * size + nx] === 1;
  if (blocked) return { x, y, eaten: -1 };
  const landed = ny * size + nx;
  const eaten = cells[landed] === 2 ? landed : -1;
  return { x: nx, y: ny, eaten };
}

function residualOf(pred: Float32Array) {
  return expectedResidual(pred, (i) => (i % CH === 2 ? 0 : 1));
}

export function runSourceEpisode(req: SourceRequest): SourceResult {
  if (REPLAY_HARD_AT !== 0.5) throw new Error(`hard replay threshold ${REPLAY_HARD_AT} moved`);
  if (SOURCE_WAIT !== ACTS - 1) throw new Error("wait is not the last action");
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
    if (k.intrinsicBoost) throw new Error("the source arm carried a place bonus");
    if (!k.rhoHatParts || !k.rhoDrop) throw new Error("a trace buffer was not allocated");
    const rho = req.signal === "rho";
    const family = k.family;
    if (!family) throw new Error("the distractor has no family");
    let inRoom = 0;
    let path = 0;
    let samples = 0;
    let scoreSum = 0;
    let scoreSteps = 0;
    let roomSteps = 0;
    let dropSum = 0;
    let signedSum = 0;
    let errorSum = 0;
    let hardSum = 0;
    let staySum = 0;
    let resSum = 0;
    let err1Sum = 0;
    const eastAcc = emptyAccum();
    const buf = new Float32Array(OBS);
    const replayHard = new Float32Array(OBS);
    const replayStay = new Float32Array(OBS);
    for (let t = 0; t < req.steps; t++) {
      const x = k.x;
      const y = k.y;
      const reg = k.regionAt();
      const heldBefore = k.optionHeld;
      const energy = k.energy;
      const cellsSnap = rho && reg === 1 ? k.cells.slice() : null;
      path = (Math.imul(path, 33) + y * SIZE + x) | 0;
      k.step();
      if (reg === 1 && rho) pushProgress(eastAcc, k.loop.progress, k.loop.progressEma);
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
      if (!rho && dropLevel !== 0) {
        throw new Error(`seed ${req.seed} ${req.arm} ${req.signal} wrote a horizon drop`);
      }
      const nAct = drop.res1.length;
      const signedLevel = actionMean(nAct, (action) => drop.res1[action]! - drop.best[action]!, into);
      const resLevel = actionMean(nAct, (action) => drop.res1[action]!, into);
      const traceRect = actionMean(nAct, (action) => Math.max(0, drop.res1[action]! - drop.best[action]!), into);
      if (signedLevel == null || resLevel == null || traceRect == null) {
        throw new Error(`seed ${req.seed} ${req.arm} lost an in-room residual`);
      }
      if (rho && Math.abs(traceRect - dropLevel) > 1e-6) {
        throw new Error(`seed ${req.seed} ${req.arm} traced drop ${traceRect} does not match ${dropLevel}`);
      }
      let errorLevel = 0;
      let hardLevel = 0;
      let stayLevelDrop = 0;
      let err1Level = 0;
      if (rho) {
        if (!cellsSnap) throw new Error(`seed ${req.seed} ${req.arm} lost the pre-step map`);
        let eSum = 0;
        let hSum = 0;
        let sSum = 0;
        let e1Sum = 0;
        let nStay = 0;
        const softBuf = buf;
        const hardBuf = replayHard;
        const stayBuf = replayStay;
        for (let action = 0; action < nAct; action++) {
          if (!into(action)) continue;
          const follow = drop.follow[action]!;
          if (follow < 0 || follow >= nAct) {
            throw new Error(`seed ${req.seed} ${req.arm} follow ${follow} is not an action`);
          }
          const pred1 = k.imagined[action]!;
          const first = bodyAfter(x, y, action, cellsSnap);
          const second = bodyAfter(first.x, first.y, follow, cellsSnap);
          const pred2 = k.replayImagination(pred1, follow, false, energy, softBuf);
          const res2 = residualOf(pred2);
          if (Math.abs(res2 - drop.best[action]!) > 1e-6) {
            throw new Error(`seed ${req.seed} ${req.arm} replay ${res2} does not match ${drop.best[action]}`);
          }
          const err1 = expectedWindowError(pred1, first.x, first.y, cellsSnap, family, first.eaten);
          const err2 = expectedWindowError(pred2, second.x, second.y, cellsSnap, family, second.eaten);
          const predHard = k.replayImagination(pred1, follow, true, energy, hardBuf);
          const predStay = k.replayImagination(pred1, SOURCE_WAIT, false, energy, stayBuf);
          eSum += err1 - err2;
          hSum += drop.res1[action]! - residualOf(predHard);
          sSum += drop.res1[action]! - residualOf(predStay);
          e1Sum += err1;
          nStay += 1;
        }
        if (nStay === 0) throw new Error(`seed ${req.seed} ${req.arm} lost an in-room replay`);
        errorLevel = eSum / nStay;
        hardLevel = hSum / nStay;
        stayLevelDrop = sSum / nStay;
        err1Level = e1Sum / nStay;
      }
      dropSum += dropLevel;
      signedSum += signedLevel;
      errorSum += errorLevel;
      hardSum += hardLevel;
      staySum += stayLevelDrop;
      resSum += resLevel;
      err1Sum += err1Level;
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
      error: errorSum / denom,
      hard: hardSum / denom,
      stay: staySum / denom,
      res1: resSum / denom,
      err1: err1Sum / denom,
    };
  });
}
