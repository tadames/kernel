/**
 * One distractor episode for the noise-room study. The seed stream matches
 * the phase sweep, so a shipped rho episode is the same episode.
 */
import { Kernel, SIZE, type KernelOptions } from "./kernel.ts";
import { distractorSpec } from "./family.ts";
import { mulberry32 } from "./presets.ts";
import type { CuriositySignal } from "./signals.ts";
import {
  emptyAccum,
  emptyHist,
  finishProgress,
  pushHist,
  pushProgress,
  type Hist,
  type ProgressMode,
  type RoomProgress,
} from "./progress.ts";

/** Measurement arms. `shipped` is window-50 rho with both policy terms on. */
export const POLICY_ARMS = ["shipped", "progress", "no-horizon", "no-uncertainty"] as const;
export type PolicyArm = (typeof POLICY_ARMS)[number];

/** Cuts for one arm. Shipped keeps uncertainty and the horizon residual drop. */
export function curiosityScoreForArm(arm: PolicyArm): { uncertainty: boolean; horizonDrop: boolean } {
  if (arm === "progress") return { uncertainty: false, horizonDrop: false };
  if (arm === "no-horizon") return { uncertainty: true, horizonDrop: false };
  if (arm === "no-uncertainty") return { uncertainty: false, horizonDrop: true };
  return { uncertainty: true, horizonDrop: true };
}

export type NoiseRequest = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  learnability: number;
  driftRate: number;
  distractorRelevance: number;
  progressWindow: number;
  progressMode: ProgressMode;
  noiseAmplitude: number;
  /** Histogram of raw progress. Room means are always recorded for rho. */
  traceHist: boolean;
  /**
   * Curiosity-score arm. Omitted is shipped, so the noise-progress episodes
   * stay the phase-diagram episodes.
   */
  policyArm?: PolicyArm;
  /** Target-room content. Omitted is stationary noise, the historical room. */
  content?: "noise" | "static";
  /** Reflect the map so region 1 is on the west. Omitted leaves the east room. */
  mirror?: boolean;
};

export type NoiseResult = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  learnability: number;
  driftRate: number;
  distractorRelevance: number;
  progressWindow: number;
  progressMode: ProgressMode;
  noiseAmplitude: number;
  policyArm: PolicyArm;
  content: "noise" | "static";
  mirror: boolean;
  distractorFrac: number;
  /** Mean training surprise on steps that began in the target room. Null if none. */
  targetSurprise: number | null;
  foods: number;
  distractorFoods: number;
  lives: number;
  east: RoomProgress;
  west: RoomProgress;
  eastHist: Hist | null;
  westHist: Hist | null;
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

export function runNoiseEpisode(req: NoiseRequest): NoiseResult {
  const content = req.content ?? "noise";
  const mirror = req.mirror ?? false;
  const spec = distractorSpec({
    learnability: req.learnability,
    driftRate: req.driftRate,
    distractorRelevance: req.distractorRelevance,
    noiseAmplitude: req.noiseAmplitude,
    ...(content === "static" ? { roomContent: "static" as const, staticSeed: req.seed } : {}),
    ...(mirror ? { mirrorRooms: true } : {}),
  });
  const policyArm = req.policyArm ?? "shipped";
  const curiosityScore = curiosityScoreForArm(policyArm);
  return withSeed(req.seed * 10007 + 31, () => {
    const options: KernelOptions = {
      env: spec,
      signal: req.signal,
      progressWindow: req.progressWindow,
      progressMode: req.progressMode,
      curiosityScore,
    };
    const k = new Kernel("distractor", req.seed, undefined, options);
    let inEast = 0;
    let eastFood = 0;
    let surpriseSum = 0;
    let surpriseN = 0;
    const eastAcc = emptyAccum();
    const westAcc = emptyAccum();
    const eastHist = req.traceHist ? emptyHist() : null;
    const westHist = req.traceHist ? emptyHist() : null;
    const trace = req.signal === "rho";
    for (let t = 0; t < req.steps; t++) {
      const reg = k.regionAt();
      const before = k.foods;
      k.step();
      if (reg === 1) {
        inEast += 1;
        if (k.foods > before) eastFood += 1;
        surpriseSum += k.loop.surprise;
        surpriseN += 1;
      }
      if (!trace) continue;
      const raw = k.loop.progress;
      const policy = k.loop.progressEma;
      if (reg === 1) {
        pushProgress(eastAcc, raw, policy);
        if (eastHist) pushHist(eastHist, raw);
      } else if (reg === 0) {
        pushProgress(westAcc, raw, policy);
        if (westHist) pushHist(westHist, raw);
      }
    }
    return {
      id: req.id,
      seed: req.seed,
      signal: req.signal,
      steps: req.steps,
      learnability: req.learnability,
      driftRate: req.driftRate,
      distractorRelevance: req.distractorRelevance,
      progressWindow: req.progressWindow,
      progressMode: req.progressMode,
      noiseAmplitude: req.noiseAmplitude,
      policyArm,
      content,
      mirror,
      distractorFrac: req.steps ? inEast / req.steps : 0,
      targetSurprise: surpriseN ? surpriseSum / surpriseN : null,
      foods: k.foods,
      distractorFoods: eastFood,
      lives: k.lives,
      east: finishProgress(eastAcc),
      west: finishProgress(westAcc),
      eastHist,
      westHist,
    };
  });
}
