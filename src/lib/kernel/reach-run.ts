/**
 * Where the pattern's retrospective progress is lost before ρ̂ is formed.
 * The episode is the chain contrast. ρ̂ is split into the bonus slot and
 * the two horizon drops, at the doorway and on sample ticks that begin in
 * the room. Workers import this. The sweep is not part of CI.
 */
import { Kernel, SIZE } from "./kernel.ts";
import { distractorSpec, FAMILY_LAYOUT_SEED } from "./family.ts";
import { doorwayActionRegion, doorwayDelta } from "./doorway-run.ts";
import { mulberry32 } from "./presets.ts";
import type { CuriositySignal } from "./signals.ts";
import { emptyAccum, finishProgress, pushProgress, type RoomProgress } from "./progress.ts";
import { SHIPPED_POLICY_TEMPERATURE } from "./noise.ts";
import { COMPETE_STREAM } from "./compete-run.ts";
import type { RhoHatParts } from "./policy.ts";

/** Published raw ρ̂ doorway gap, pattern minus noise, rho, seeds 1–800. */
export const CHAIN_RHO_HAT_MEAN = 0.0002382607482198441;

export const CHAIN_RHO_HAT_LO = -0.00035924714906002933;

export const CHAIN_RHO_HAT_HI = 0.0008395950742139654;

export const CHAIN_RHO_HAT_N = 766;

export type ReachArm = "pattern" | "noise";

export type ReachPiece = "bonus" | "drop2" | "drop3";

export const REACH_PIECES: ReachPiece[] = ["bonus", "drop2", "drop3"];

export type ReachRequest = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  arm: ReachArm;
};

export type ReachResult = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  arm: ReachArm;
  distractorFrac: number;
  foods: number;
  lives: number;
  /** Cell index before each move, folded with multiplier 33. */
  path: number;
  samples: number;
  scoreGap: number;
  scoreSteps: number;
  /** Doorway gap of max(0, ρ̂), the chain raw ρ̂. */
  rhoHat: number;
  doorBonus: number;
  doorDrop2: number;
  doorDrop3: number;
  doorSteps: number;
  /** In-room level of the same three pieces, stay-actions only. */
  roomBonus: number;
  roomDrop2: number;
  roomDrop3: number;
  roomSteps: number;
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

/**
 * Mean of actions whose destination is the target. Null when none do.
 * Unweighted, the same convention as one side of `doorwayDelta`.
 */
export function stayLevel(scores: ArrayLike<number>, destIsTarget: (action: number) => boolean): number | null {
  let sum = 0;
  let n = 0;
  for (let a = 0; a < scores.length; a++) {
    if (!destIsTarget(a)) continue;
    sum += scores[a]!;
    n += 1;
  }
  if (n === 0) return null;
  return sum / n;
}

function pieceOf(parts: RhoHatParts, name: ReachPiece) {
  if (name === "bonus") return parts.bonus;
  if (name === "drop2") return parts.drop2;
  return parts.drop3;
}

export function runReachEpisode(req: ReachRequest): ReachResult {
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
      traceRho: true,
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
    if (k.intrinsicBoost) throw new Error("the reach arm carried a place bonus");
    if (!k.scoreParts || !k.rhoHatParts) throw new Error("a trace buffer was not allocated");
    const rho = req.signal === "rho";
    let inRoom = 0;
    let path = 0;
    let samples = 0;
    let scoreSum = 0;
    let scoreSteps = 0;
    let hatSum = 0;
    const doorSum = { bonus: 0, drop2: 0, drop3: 0 };
    const roomSum = { bonus: 0, drop2: 0, drop3: 0 };
    let roomSteps = 0;
    const eastAcc = emptyAccum();
    const trace = rho;
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
      const hat = k.rhoHatParts;
      const parts = k.scoreParts;
      if (!hat || !parts) throw new Error("a trace buffer disappeared");
      for (let a = 0; a < hat.bonus.length; a++) {
        if (!rho && (hat.drop2[a] !== 0 || hat.drop3[a] !== 0)) {
          throw new Error(`seed ${req.seed} ${req.arm} ${req.signal} wrote a horizon drop`);
        }
        const total = hat.bonus[a]! + hat.drop2[a]! + hat.drop3[a]!;
        if (Math.abs(total - parts.rhoHat[a]!) > 1e-6) {
          throw new Error(`seed ${req.seed} ${req.arm} rho-hat pieces ${total} do not match ${parts.rhoHat[a]}`);
        }
      }
      const into = (action: number) => doorwayActionRegion(k, x, y, action) === 1;
      const delta = doorwayDelta(k.scores, into);
      if (delta != null) {
        const hatGap = doorwayDelta(parts.rhoHat, into);
        if (hatGap == null) throw new Error(`seed ${req.seed} ${req.arm} lost the rho-hat doorway`);
        let piece = 0;
        for (const name of REACH_PIECES) {
          const gap = doorwayDelta(pieceOf(hat, name), into);
          if (gap == null) throw new Error(`seed ${req.seed} ${req.arm} lost the ${name} doorway`);
          doorSum[name] += gap;
          piece += gap;
        }
        if (Math.abs(piece - hatGap) > 1e-6) {
          throw new Error(`seed ${req.seed} ${req.arm} rho-hat pieces ${piece} do not match ${hatGap}`);
        }
        hatSum += hatGap;
        scoreSum += delta;
        scoreSteps += 1;
      }
      if (reg === 1) {
        let levelPiece = 0;
        let levelHat = 0;
        for (const name of REACH_PIECES) {
          const level = stayLevel(pieceOf(hat, name), into);
          if (level == null) throw new Error(`seed ${req.seed} ${req.arm} lost an in-room ${name}`);
          roomSum[name] += level;
          levelPiece += level;
        }
        const hatLevel = stayLevel(parts.rhoHat, into);
        if (hatLevel == null) throw new Error(`seed ${req.seed} ${req.arm} lost the in-room rho-hat`);
        levelHat = hatLevel;
        if (Math.abs(levelPiece - levelHat) > 1e-6) {
          throw new Error(`seed ${req.seed} ${req.arm} in-room pieces ${levelPiece} do not match ${levelHat}`);
        }
        roomSteps += 1;
      }
    }
    if (req.steps % 2 !== 0 || samples !== req.steps / 2) {
      throw new Error(`seed ${req.seed} ${req.arm} sampled ${samples} of ${req.steps}`);
    }
    const doorDenom = scoreSteps || 1;
    const roomDenom = roomSteps || 1;
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
      rhoHat: scoreSteps ? hatSum / doorDenom : 0,
      doorBonus: doorSum.bonus / doorDenom,
      doorDrop2: doorSum.drop2 / doorDenom,
      doorDrop3: doorSum.drop3 / doorDenom,
      doorSteps: scoreSteps,
      roomBonus: roomSum.bonus / roomDenom,
      roomDrop2: roomSum.drop2 / roomDenom,
      roomDrop3: roomSum.drop3 / roomDenom,
      roomSteps,
      east: finishProgress(eastAcc),
    };
  });
}
