/**
 * One distractor episode for the noise-room study. The seed stream matches
 * the phase sweep, so a shipped rho episode is the same episode.
 */
import { Kernel, SIZE } from "./kernel.ts";
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
  distractorFrac: number;
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
  const spec = distractorSpec({
    learnability: req.learnability,
    driftRate: req.driftRate,
    distractorRelevance: req.distractorRelevance,
    noiseAmplitude: req.noiseAmplitude,
  });
  return withSeed(req.seed * 10007 + 31, () => {
    const k = new Kernel("distractor", req.seed, undefined, {
      env: spec,
      signal: req.signal,
      progressWindow: req.progressWindow,
      progressMode: req.progressMode,
    });
    let inEast = 0;
    let eastFood = 0;
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
      distractorFrac: req.steps ? inEast / req.steps : 0,
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
