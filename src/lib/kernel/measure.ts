/**
 * One measured episode: same learner, one curiosity signal, frozen probe
 * checkpoints, plus coverage and food. The probe is not a function of the policy.
 */
import { Kernel, SIZE, type KernelOptions } from "./kernel.ts";
import { adjacentFood, c2Pass, g1Baseline, g1Pass, g2Pass, normalizedSkill } from "./experiments.ts";
import { CANONICAL_ENV, type EnvSpec } from "./env.ts";
import { PROBE_EARLY_STEP, PROBE_EVERY, type ProbeSet } from "./probe.ts";
import { loadCanonicalProbe } from "./probe-file.ts";
import { mulberry32 } from "./presets.ts";
import type { LoopFeatures } from "./loop.ts";
import { resolveLoopFeatures } from "./loop.ts";
import type { CuriositySignal } from "./signals.ts";
import { visitStats } from "./stats.ts";

export type MeasuredEnv = "field" | "rooms";

export type EpisodeRequest = {
  id: number;
  env: MeasuredEnv;
  seed: number;
  steps: number;
  signal: CuriositySignal;
  features?: Partial<LoopFeatures>;
  probeEvery?: number;
};

export type Checkpoint = { t: number; probe: number; onPolicy: number };

export type EpisodeResult = {
  id: number;
  env: MeasuredEnv;
  seed: number;
  signal: CuriositySignal;
  features: LoopFeatures;
  steps: number;
  probeEarly: number;
  probeLate: number;
  onPolicyEarly: number;
  onPolicyLate: number;
  distinctCells: number;
  stateEntropy: number;
  foods: number;
  lives: number;
  meanB: number;
  g1: boolean;
  /** (mean floor − late) / (mean floor − shift ceiling). Field and Rooms only. */
  skill: number;
  g2: boolean;
  c2: boolean;
  checkpoints: Checkpoint[];
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

export function envSpec(env: MeasuredEnv): EnvSpec {
  return CANONICAL_ENV[env];
}

export function runMeasuredEpisode(req: EpisodeRequest, probe?: ProbeSet): EpisodeResult {
  const spec = envSpec(req.env);
  const held = probe ?? loadCanonicalProbe(req.env);
  const every = req.probeEvery ?? PROBE_EVERY;
  const options: KernelOptions = { signal: req.signal, env: spec };
  const episode = withSeed(req.seed * 10007 + (req.env === "rooms" ? 5 : 1), () => {
    const k = new Kernel(spec.kind, req.seed, req.features, options);
    const visits = new Uint32Array(k.cells.length);
    const band: number[] = [];
    const checkpoints: Checkpoint[] = [];
    let onPolicyEarly = 0;
    let probeEarly = Number.NaN;
    for (let t = 0; t < req.steps; t++) {
      k.step();
      visits[k.y * SIZE + k.x] += 1;
      if (t === 49) onPolicyEarly = k.ema;
      if (t >= req.steps - 80) band.push(k.branching);
      const step = t + 1;
      if (step % every === 0 || step === req.steps) {
        const probeError = k.frozenProbeError(held);
        checkpoints.push({ t: step, probe: probeError, onPolicy: k.ema });
        if (step === PROBE_EARLY_STEP) probeEarly = probeError;
      }
    }
    const coverage = visitStats(visits);
    const meanB = band.length ? band.reduce((s, x) => s + x, 0) / band.length : k.branching;
    const probeLate = checkpoints.length ? checkpoints[checkpoints.length - 1]!.probe : k.frozenProbeError(held);
    if (Number.isNaN(probeEarly)) probeEarly = probeLate;
    if (req.steps < 50) onPolicyEarly = k.ema;
    return {
      probeEarly,
      probeLate,
      onPolicyEarly,
      onPolicyLate: k.ema,
      distinctCells: coverage.distinct,
      stateEntropy: coverage.entropy,
      foods: k.foods,
      lives: k.lives,
      meanB,
      checkpoints,
    };
  });
  const food = withSeed(req.seed * 10007 + 11, () => adjacentFood(req.seed, req.features));
  const g2 = g2Pass(food.action, food.foods, food.x);
  const baseline = g1Baseline(req.env);
  const g1 = g1Pass(episode.probeEarly, episode.probeLate, baseline.meanFloor);
  const skill = normalizedSkill(episode.probeLate, baseline);
  const c2 = c2Pass(episode.meanB);
  return {
    id: req.id,
    env: req.env,
    seed: req.seed,
    signal: req.signal,
    features: resolveLoopFeatures(req.features),
    steps: req.steps,
    ...episode,
    g1,
    skill,
    g2,
    c2,
  };
}
