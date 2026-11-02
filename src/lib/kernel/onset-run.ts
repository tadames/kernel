/**
 * Whether the expected-error inversion is present before the pattern is
 * learned. The episode is the source contrast. Exposure counts every step
 * that began in region 1, held ticks included, because those ticks train.
 * The open band is exposure at most 2. The late band is exposure above 32.
 * Workers import this. The sweep is not part of CI.
 */
import { CH, Kernel, OBS, SIZE } from "./kernel.ts";
import { CYCLE_EAST_LATENT, distractorSpec, FAMILY_LAYOUT_SEED, type FamilyMemory } from "./family.ts";
import { doorwayActionRegion, doorwayDelta } from "./doorway-run.ts";
import { mulberry32 } from "./presets.ts";
import type { CuriositySignal } from "./signals.ts";
import { emptyAccum, finishProgress, pushProgress, type RoomProgress } from "./progress.ts";
import { SHIPPED_POLICY_TEMPERATURE } from "./noise.ts";
import { COMPETE_STREAM } from "./compete-run.ts";
import { stayLevel } from "./reach-run.ts";
import { expectedResidual } from "./policy.ts";
import { bodyAfter, expectedWindowParts } from "./source-run.ts";

/** Published expected-error drop, pattern minus noise, rho, seeds 1–800. */
export const SOURCE_ERROR_MEAN = -0.03257988930857322;

export const SOURCE_ERROR_LO = -0.033825830409122994;

export const SOURCE_ERROR_HI = -0.03132528104876149;

export const SOURCE_ERROR_N = 745;

/** Published first-window expected error, pattern minus noise, rho, seeds 1–800. */
export const SOURCE_ERR1_MEAN = -0.038216306138155805;

export const SOURCE_ERR1_LO = -0.039216168222399955;

export const SOURCE_ERR1_HI = -0.03721044179405636;

export const SOURCE_ERR1_N = 745;

/**
 * In-room steps, including the current one. At most this many is the open
 * band: one sample, or a held entry plus the sample that follows it.
 */
export const ONSET_OPEN = 2;

/** In-room steps above this are the late band. The cut is not searched. */
export const ONSET_LATE = 32;

/** Doubling grid. Open is the first bin. Late is the last. Middles do not flip the summary. */
export const ONSET_BIN_EDGES = [2, 8, 16, 32] as const;

export const ONSET_BIN_SALT = [29421, 29422, 29423, 29424, 29425] as const;

export const ONSET_BIN_ERR1_SALT = [29431, 29432, 29433, 29434, 29435] as const;

/** Published open-band expected-error drop, pattern minus noise, rho, seeds 1–800. */
export const ONSET_ERROR_OPEN_MEAN = -0.01129604520649296;

export const ONSET_ERROR_OPEN_LO = -0.012841440246606769;

export const ONSET_ERROR_OPEN_HI = -0.009733342749404074;

export const ONSET_ERROR_OPEN_N = 745;

/** Published open-band first-window expected error, pattern minus noise, rho, seeds 1–800. */
export const ONSET_ERR1_OPEN_MEAN = -0.015894278371355236;

export const ONSET_ERR1_OPEN_LO = -0.01770256648727083;

export const ONSET_ERR1_OPEN_HI = -0.014121594788131941;

export const ONSET_ERR1_OPEN_N = 745;

/** Published late-band expected-error drop, pattern minus noise, rho, seeds 1–800. */
export const ONSET_ERROR_LATE_MEAN = -0.03869603445312814;

export const ONSET_ERROR_LATE_LO = -0.040378947498860486;

export const ONSET_ERROR_LATE_HI = -0.037201909539290146;

export const ONSET_ERROR_LATE_N = 599;

/** Published late-band first-window expected error, pattern minus noise, rho, seeds 1–800. */
export const ONSET_ERR1_LATE_MEAN = -0.041293708305141494;

export const ONSET_ERR1_LATE_LO = -0.04216906399588397;

export const ONSET_ERR1_LATE_HI = -0.04039470774788882;

export const ONSET_ERR1_LATE_N = 599;

export type OnsetBins = [number, number, number, number, number];

export type OnsetArm = "pattern" | "noise";

/** Stripes are the published code. Blocks are the other easy rule. Static is a frozen fair-bit picture. */
export type PatternCode = "stripes" | "blocks" | "static";

export type OnsetRequest = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  arm: OnsetArm;
  /** Omitted is stripes, the published pattern channel. */
  code?: PatternCode;
  /**
   * Partition the expected-error drop into fixed channels and east bits.
   * Omitted leaves those fields at 0. It does not draw a random number and
   * it does not enter the bonus.
   */
  traceSplit?: boolean;
};

export type OnsetResult = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  arm: OnsetArm;
  code: PatternCode;
  distractorFrac: number;
  foods: number;
  lives: number;
  /** Cell index before each move, folded with multiplier 33. */
  path: number;
  samples: number;
  scoreGap: number;
  scoreSteps: number;
  east: RoomProgress;
  /** In-room sample ticks. */
  roomSteps: number;
  /** Shipped `max(0, res1 − res2*)`, stay actions, in-room sample ticks. */
  drop2: number;
  /** `res1 − res2*`, same ticks. */
  signed: number;
  /** `err1 − err2*` on the score-winning follow-up. Expected squared error. */
  error: number;
  /** First-window Bernoulli residual, same ticks. Not a call. */
  res1: number;
  /** Expected squared error of the first window, same ticks. */
  err1: number;
  /** Sample counts in exposure bins 1–2, 3–8, 9–16, 17–32, 33+. */
  binSteps: OnsetBins;
  binError: OnsetBins;
  binErr1: OnsetBins;
  /**
   * Fixed-channel share of `error`. Walls, food, and the west pattern.
   * Zero unless `traceSplit`.
   */
  fixedDrop: number;
  /** East-bit share of `error`. Region-1 glow. Zero unless `traceSplit`. */
  eastDrop: number;
  /** Fixed-channel share of `err1`. Zero unless `traceSplit`. */
  fixedErr1: number;
  /** East-bit share of `err1`. Zero unless `traceSplit`. */
  eastErr1: number;
  binFixedDrop: OnsetBins;
  binEastDrop: OnsetBins;
  binFixedErr1: OnsetBins;
  binEastErr1: OnsetBins;
};

/** 0 is exposure 1–2. 4 is exposure 33 and above. */
export function onsetBin(exposure: number): 0 | 1 | 2 | 3 | 4 {
  if (exposure <= ONSET_BIN_EDGES[0]) return 0;
  if (exposure <= ONSET_BIN_EDGES[1]) return 1;
  if (exposure <= ONSET_BIN_EDGES[2]) return 2;
  if (exposure <= ONSET_BIN_EDGES[3]) return 3;
  return 4;
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

function residualOf(pred: Float32Array) {
  return expectedResidual(pred, (i) => (i % CH === 2 ? 0 : 1));
}

function emptyBins(): OnsetBins {
  return [0, 0, 0, 0, 0];
}

function finishBins(sum: OnsetBins, steps: OnsetBins): OnsetBins {
  return steps.map((n, i) => (n ? sum[i]! / n : 0)) as OnsetBins;
}

function replayError(
  k: Kernel,
  x: number,
  y: number,
  cellsSnap: Uint8Array,
  family: FamilyMemory,
  into: (action: number) => boolean,
  nAct: number,
  follow: ArrayLike<number>,
  best: ArrayLike<number>,
  energy: number,
  buf: Float32Array,
  seed: number,
  arm: OnsetArm,
) {
  let eSum = 0;
  let e1Sum = 0;
  let fSum = 0;
  let f1Sum = 0;
  let aSum = 0;
  let a1Sum = 0;
  let nStay = 0;
  for (let action = 0; action < nAct; action++) {
    if (!into(action)) continue;
    const next = follow[action]!;
    if (next < 0 || next >= nAct) {
      throw new Error(`seed ${seed} ${arm} follow ${next} is not an action`);
    }
    const pred1 = k.imagined[action]!;
    const first = bodyAfter(x, y, action, cellsSnap);
    const second = bodyAfter(first.x, first.y, next, cellsSnap);
    const pred2 = k.replayImagination(pred1, next, false, energy, buf);
    const res2 = residualOf(pred2);
    if (Math.abs(res2 - best[action]!) > 1e-6) {
      throw new Error(`seed ${seed} ${arm} replay ${res2} does not match ${best[action]}`);
    }
    const err1 = expectedWindowParts(pred1, first.x, first.y, cellsSnap, family, first.eaten);
    const err2 = expectedWindowParts(pred2, second.x, second.y, cellsSnap, family, second.eaten);
    eSum += err1.total - err2.total;
    e1Sum += err1.total;
    fSum += err1.fixed - err2.fixed;
    f1Sum += err1.fixed;
    aSum += err1.east - err2.east;
    a1Sum += err1.east;
    nStay += 1;
  }
  if (nStay === 0) throw new Error(`seed ${seed} ${arm} lost an in-room replay`);
  return {
    error: eSum / nStay,
    err1: e1Sum / nStay,
    fixed: fSum / nStay,
    east: aSum / nStay,
    fixedErr1: f1Sum / nStay,
    eastErr1: a1Sum / nStay,
  };
}

/**
 * Pattern arm of one locked code. The noise arm omits the code, so the
 * episode coin still matches. Omitted on the request is stripes.
 */
export function patternCodeSpec(arm: OnsetArm, code: PatternCode, seed: number) {
  const base = { learnability: 1, driftRate: 0, distractorRelevance: 0 };
  if (arm === "noise") return distractorSpec(base);
  if (code === "stripes") return distractorSpec({ ...base, patternChannel: "all" as const });
  if (code === "blocks") {
    return distractorSpec({ ...base, patternChannel: "all" as const, patternLatent: CYCLE_EAST_LATENT });
  }
  if (code === "static") return distractorSpec({ ...base, roomContent: "static" as const, staticSeed: seed });
  throw new Error(`pattern code ${String(code)} is not locked`);
}

export function runOnsetEpisode(req: OnsetRequest): OnsetResult {
  if (ONSET_OPEN !== ONSET_BIN_EDGES[0] || ONSET_LATE !== ONSET_BIN_EDGES[3]) {
    throw new Error("the open and late bands left the exposure grid");
  }
  const code = req.code ?? "stripes";
  const spec = patternCodeSpec(req.arm, code, req.seed);
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
    if (k.intrinsicBoost) throw new Error("the onset arm carried a place bonus");
    if (!k.rhoHatParts || !k.rhoDrop) throw new Error("a trace buffer was not allocated");
    const rho = req.signal === "rho";
    const family = k.family;
    if (!family) throw new Error("the distractor has no family");
    let inRoom = 0;
    let exposure = 0;
    let path = 0;
    let samples = 0;
    let scoreSum = 0;
    let scoreSteps = 0;
    let roomSteps = 0;
    let dropSum = 0;
    let signedSum = 0;
    let errorSum = 0;
    let resSum = 0;
    let err1Sum = 0;
    const traceSplit = req.traceSplit === true;
    const binSteps = emptyBins();
    const binErrorSum = emptyBins();
    const binErr1Sum = emptyBins();
    const binFixedSum = emptyBins();
    const binEastSum = emptyBins();
    const binFixedErr1Sum = emptyBins();
    const binEastErr1Sum = emptyBins();
    let fixedSum = 0;
    let eastSum = 0;
    let fixedErr1Sum = 0;
    let eastErr1Sum = 0;
    const eastAcc = emptyAccum();
    const buf = new Float32Array(OBS);
    for (let t = 0; t < req.steps; t++) {
      const x = k.x;
      const y = k.y;
      const reg = k.regionAt();
      const heldBefore = k.optionHeld;
      const energy = k.energy;
      const cellsSnap = rho && reg === 1 ? k.cells.slice() : null;
      if (reg === 1) exposure += 1;
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
      let err1Level = 0;
      const bin = onsetBin(exposure);
      if (rho) {
        if (!cellsSnap) throw new Error(`seed ${req.seed} ${req.arm} lost the pre-step map`);
        const replayed = replayError(
          k,
          x,
          y,
          cellsSnap,
          family,
          into,
          nAct,
          drop.follow,
          drop.best,
          energy,
          buf,
          req.seed,
          req.arm,
        );
        errorLevel = replayed.error;
        err1Level = replayed.err1;
        if (traceSplit) {
          if (Math.abs(replayed.fixed + replayed.east - replayed.error) > 1e-9) {
            throw new Error(`seed ${req.seed} ${req.arm} split does not add to the drop`);
          }
          if (Math.abs(replayed.fixedErr1 + replayed.eastErr1 - replayed.err1) > 1e-9) {
            throw new Error(`seed ${req.seed} ${req.arm} split does not add to the first window`);
          }
          fixedSum += replayed.fixed;
          eastSum += replayed.east;
          fixedErr1Sum += replayed.fixedErr1;
          eastErr1Sum += replayed.eastErr1;
          binFixedSum[bin] += replayed.fixed;
          binEastSum[bin] += replayed.east;
          binFixedErr1Sum[bin] += replayed.fixedErr1;
          binEastErr1Sum[bin] += replayed.eastErr1;
        }
      }
      dropSum += dropLevel;
      signedSum += signedLevel;
      errorSum += errorLevel;
      resSum += resLevel;
      err1Sum += err1Level;
      binSteps[bin] += 1;
      binErrorSum[bin] += errorLevel;
      binErr1Sum[bin] += err1Level;
      roomSteps += 1;
    }
    if (req.steps % 2 !== 0 || samples !== req.steps / 2) {
      throw new Error(`seed ${req.seed} ${req.arm} sampled ${samples} of ${req.steps}`);
    }
    const binTotal = binSteps.reduce((s, n) => s + n, 0);
    if (binTotal !== roomSteps) {
      throw new Error(`seed ${req.seed} ${req.arm} binned ${binTotal} of ${roomSteps}`);
    }
    const denom = roomSteps || 1;
    return {
      id: req.id,
      seed: req.seed,
      signal: req.signal,
      steps: req.steps,
      arm: req.arm,
      code,
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
      res1: resSum / denom,
      err1: err1Sum / denom,
      binSteps,
      binError: finishBins(binErrorSum, binSteps),
      binErr1: finishBins(binErr1Sum, binSteps),
      fixedDrop: fixedSum / denom,
      eastDrop: eastSum / denom,
      fixedErr1: fixedErr1Sum / denom,
      eastErr1: eastErr1Sum / denom,
      binFixedDrop: finishBins(binFixedSum, binSteps),
      binEastDrop: finishBins(binEastSum, binSteps),
      binFixedErr1: finishBins(binFixedErr1Sum, binSteps),
      binEastErr1: finishBins(binEastErr1Sum, binSteps),
    };
  });
}
