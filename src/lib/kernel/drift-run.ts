/**
 * One episode of the matched drift pair. The drifting arm redraws a
 * low-frequency pattern. The held arm keeps that pattern and burns the
 * same coin. Workers import this. The sweep is not part of CI.
 */
import { Kernel, SIZE } from "./kernel.ts";
import { distractorSpec, FAMILY_LAYOUT_SEED } from "./family.ts";
import { mulberry32 } from "./presets.ts";
import type { CuriositySignal } from "./signals.ts";

/**
 * Adaptation timescale on the wide-door map, seeds 1–8, bootstrap seed 5.
 * The narrow-door lock was 67.65. This map learns faster. Do not put that
 * old number back under the rates.
 */
export const LOCKED_DRIFT_TAU = 53.28471423768756;

export type DriftArm = "drift" | "held";

export type DriftRequest = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  driftRate: number;
  arm: DriftArm;
};

export type DriftResult = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  steps: number;
  driftRate: number;
  arm: DriftArm;
  distractorFrac: number;
  /** Held-out error on the shared initial pattern. Lower is better. */
  probeInitial: number;
  /** Held-out error on the pattern present at the end. Lower is better. */
  probeCurrent: number;
  /** Live probe of the large room, the phase-sweep definition. */
  probeWorld: number;
  foods: number;
  lives: number;
  /** Fraction of target-room steps with raw progress above 0. Null if none. */
  targetProgressPos: number | null;
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

export function runDriftEpisode(req: DriftRequest): DriftResult {
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
    });
    let inRoom = 0;
    let progressPos = 0;
    for (let t = 0; t < req.steps; t++) {
      const reg = k.regionAt();
      k.step();
      if (reg !== 1) continue;
      inRoom += 1;
      if (k.loop.progress > 0) progressPos += 1;
    }
    return {
      id: req.id,
      seed: req.seed,
      signal: req.signal,
      steps: req.steps,
      driftRate: req.driftRate,
      arm: req.arm,
      distractorFrac: req.steps ? inRoom / req.steps : 0,
      probeInitial: k.patternProbe("initial", 40, 20261015),
      probeCurrent: k.patternProbe("current", 40, 20261015),
      probeWorld: k.liveProbeError(0, 40, 20261015),
      foods: k.foods,
      lives: k.lives,
      targetProgressPos: inRoom ? progressPos / inRoom : null,
    };
  });
}
