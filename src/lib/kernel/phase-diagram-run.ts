/**
 * One episode of the phase-diagram instrument. Workers import this.
 * The sweep is not part of CI.
 */
import { Kernel } from "./kernel.ts";
import { distractorSpec } from "./family.ts";
import { mulberry32 } from "./presets.ts";
import type { CuriositySignal } from "./signals.ts";
import { PHASE_STEPS, PHASE_STREAM, PHASE_TEMPERATURE, phaseKey, type PhaseSpec } from "./phase-diagram.ts";

export type PhaseJob = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  spec: PhaseSpec;
};

export type PhaseResult = {
  id: number;
  seed: number;
  signal: CuriositySignal;
  key: string;
  frac: number;
  foods: number;
  lives: number;
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

export function runPhaseEpisode(job: PhaseJob, steps = PHASE_STEPS): PhaseResult {
  const spec = job.spec;
  const built = distractorSpec({
    learnability: 1,
    driftRate: spec.driftRate,
    distractorRelevance: 0,
    noiseAmplitude: spec.noiseAmplitude,
    ...(spec.content === "static" ? { roomContent: "static" as const, staticSeed: job.seed } : {}),
    ...(spec.content === "matched" && spec.matchedArm ? { matchedPattern: spec.matchedArm } : {}),
  });
  return withSeed(job.seed * 10007 + PHASE_STREAM, () => {
    const k = new Kernel("distractor", job.seed, undefined, {
      env: built,
      signal: job.signal,
      policyTemperature: PHASE_TEMPERATURE,
      ...(spec.forgettingRate > 0 ? { forgettingRate: spec.forgettingRate } : {}),
      ...(spec.boostAdd !== 0 ? { intrinsicBoost: { add: spec.boostAdd, region: 1 as const } } : {}),
    });
    let inRoom = 0;
    for (let t = 0; t < steps; t++) {
      const reg = k.regionAt();
      k.step();
      if (reg === 1) inRoom += 1;
    }
    return {
      id: job.id,
      seed: job.seed,
      signal: job.signal,
      key: `${job.signal}|${job.seed}|${phaseKey(spec)}`,
      frac: steps ? inRoom / steps : 0,
      foods: k.foods,
      lives: k.lives,
    };
  });
}
