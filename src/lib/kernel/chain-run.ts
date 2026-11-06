/**
 * Doorway-score decomposition on the pure pattern versus matched noise.
 * The episode is the credit content contrast: same stream, no planted bonus.
 * Workers import this. The sweep is not part of CI.
 */
import { Kernel, SIZE } from "./kernel.ts";
import { distractorSpec, FAMILY_LAYOUT_SEED } from "./family.ts";
import { doorwayActionRegion, doorwayDelta } from "./doorway-run.ts";
import { mulberry32 } from "./presets.ts";
import type { CuriositySignal } from "./signals.ts";
import { emptyAccum, finishProgress, pushProgress, type RoomProgress } from "./progress.ts";
import { SHIPPED_POLICY_TEMPERATURE } from "./noise.ts";
import { CREDIT_DOSE } from "./credit-run.ts";
import { COMPETE_STREAM } from "./compete-run.ts";
import { RHO_HAT_PROG_WEIGHT, type ScoreParts } from "./policy.ts";

/** Published planted lower end, rho, boost minus pattern. The score-unit δ. */
export const CHAIN_SCORE_DELTA = 0.04559740761000422;

/**
 * A ρ̂ add of this size is the same progress-channel dose as the planted
 * 0.0169, because prog adds `RHO_HAT_PROG_WEIGHT * ρ̂`.
 */
export const CHAIN_RHO_HAT_DELTA = CREDIT_DOSE / RHO_HAT_PROG_WEIGHT;

/** Published content doorway mean, pattern minus noise, rho, seeds 1–800. */
export const CREDIT_RHO_CONTENT_MEAN = -0.00792605777551224;

export const CREDIT_RHO_CONTENT_N = 766;

/** Published in-room rectified gap, pattern minus noise, rho, seeds 1–800. */
export const CREDIT_RHO_RECTIFIED = 0.021385533643288657;

export const CREDIT_RHO_RECT_N = 703;

/** Published occupancy excess, pattern minus noise, rho, seeds 1–800. */
export const CREDIT_RHO_OCCUPANCY = 0.0023718750000000038;

export type ChainArm = "pattern" | "noise";

export type ChainPartName = "rho" | "global" | "uncertainty" | "extrinsic" | "follow";

export const CHAIN_PARTS: ChainPartName[] = ["rho", "global", "uncertainty", "extrinsic", "follow"];

export type ChainRequest = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  arm: ChainArm;
};

export type ChainResult = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  arm: ChainArm;
  distractorFrac: number;
  foods: number;
  lives: number;
  /** Cell index before each move, folded with multiplier 33. */
  path: number;
  samples: number;
  scoreGap: number;
  scoreSteps: number;
  rho: number;
  global: number;
  uncertainty: number;
  extrinsic: number;
  follow: number;
  /** Doorway gap of max(0, ρ̂), before the explore weight. */
  rhoHat: number;
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

function partDelta(parts: ScoreParts, name: ChainPartName | "rhoHat", into: (action: number) => boolean) {
  const scores = name === "rhoHat" ? parts.rhoHat : parts[name];
  return doorwayDelta(scores, into);
}

export function runChainEpisode(req: ChainRequest): ChainResult {
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
      traceScores: true,
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
    if (k.intrinsicBoost) throw new Error("the chain arm carried a place bonus");
    if (!k.scoreParts) throw new Error("the trace buffer was not allocated");
    let inRoom = 0;
    let path = 0;
    let samples = 0;
    let scoreSum = 0;
    let scoreSteps = 0;
    const partSum = { rho: 0, global: 0, uncertainty: 0, extrinsic: 0, follow: 0, rhoHat: 0 };
    const eastAcc = emptyAccum();
    const trace = req.signal === "rho";
    for (let t = 0; t < req.steps; t++) {
      const x = k.x;
      const y = k.y;
      const reg = k.regionAt();
      const heldBefore = k.optionHeld;
      path = (Math.imul(path, 33) + y * SIZE + x) | 0;
      k.step();
      if (reg === 1 && trace) pushProgress(eastAcc, k.loop.progress, k.loop.progressEma);
      if (reg === 1) inRoom += 1;
      if (k.optionHeld !== heldBefore) continue;
      samples += 1;
      const into = (action: number) => doorwayActionRegion(k, x, y, action) === 1;
      const delta = doorwayDelta(k.scores, into);
      if (delta == null) continue;
      const parts = k.scoreParts;
      if (!parts) throw new Error("the trace buffer disappeared");
      let piece = 0;
      for (const name of CHAIN_PARTS) {
        const gap = partDelta(parts, name, into);
        if (gap == null) throw new Error(`seed ${req.seed} ${req.arm} lost a ${name} doorway`);
        partSum[name] += gap;
        piece += gap;
      }
      const hat = partDelta(parts, "rhoHat", into);
      if (hat == null) throw new Error(`seed ${req.seed} ${req.arm} lost the rho-hat doorway`);
      partSum.rhoHat += hat;
      for (let a = 0; a < parts.extra.length; a++) {
        if (parts.extra[a] !== 0) throw new Error(`seed ${req.seed} ${req.arm} wrote a place bonus`);
      }
      if (Math.abs(piece - delta) > 1e-6) {
        throw new Error(`seed ${req.seed} ${req.arm} parts ${piece} do not match score ${delta}`);
      }
      scoreSum += delta;
      scoreSteps += 1;
    }
    if (req.steps % 2 !== 0 || samples !== req.steps / 2) {
      throw new Error(`seed ${req.seed} ${req.arm} sampled ${samples} of ${req.steps}`);
    }
    const denom = scoreSteps || 1;
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
      rho: partSum.rho / denom,
      global: partSum.global / denom,
      uncertainty: partSum.uncertainty / denom,
      extrinsic: partSum.extrinsic / denom,
      follow: partSum.follow / denom,
      rhoHat: partSum.rhoHat / denom,
      east: finishProgress(eastAcc),
    };
  });
}
