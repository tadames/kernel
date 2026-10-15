/**
 * Held-out probe set. Transitions are drawn once from a fixed seed, under a
 * uniform random policy and from uniformly sampled states, and then frozen.
 * Scoring is a forward pass: weights do not move.
 *
 * The on-policy ema can fall because the agent sits in a corner. The probe
 * cannot, because the agent did not choose these states.
 */
import { mulberry32 } from "./presets.ts";
import {
  CANONICAL_ENV,
  makeBody,
  senseGrid,
  stepGrid,
  type EnvSpec,
} from "./env.ts";

export const PROBE_SEED = 20261015;
export const PROBE_EVERY = 40;
export const PROBE_EARLY_STEP = 40;
export const PROBE_ROLLOUT = 96;
export const PROBE_UNIFORM = 96;
export const PROBE_SIZE = 15;
export const PROBE_RADIUS = 2;

const OBS = (PROBE_RADIUS * 2 + 1) * (PROBE_RADIUS * 2 + 1) * 3;

export type ProbeSource = "rollout" | "uniform";

export type ProbeTransition = {
  source: ProbeSource;
  action: number;
  obs: Float32Array;
  nextObs: Float32Array;
};

export type ProbeSet = {
  version: 1;
  kind: EnvSpec["kind"];
  layoutSeed: number;
  probeSeed: number;
  rollout: number;
  uniform: number;
  transitions: ProbeTransition[];
};

export type ProbeJson = {
  version: 1;
  kind: EnvSpec["kind"];
  layoutSeed: number;
  probeSeed: number;
  rollout: number;
  uniform: number;
  transitions: { source: ProbeSource; action: number; obs: number[]; nextObs: number[] }[];
};

const cache = new Map<string, ProbeSet>();

function cacheKey(spec: EnvSpec, probeSeed: number) {
  const p = spec.params;
  return `${spec.kind}:${spec.layoutSeed}:${probeSeed}:${p.learnability}:${p.driftRate}:${p.distractorRelevance}`;
}

function capture(body: ReturnType<typeof makeBody>): Float32Array {
  return senseGrid(body.cells, body.scent, body.x, body.y, PROBE_SIZE, PROBE_RADIUS, new Float32Array(OBS));
}

/** Build the probe. Deterministic in (spec, probeSeed). Does not read the policy. */
export function buildProbe(spec: EnvSpec, probeSeed = PROBE_SEED): ProbeSet {
  const key = cacheKey(spec, probeSeed);
  const hit = cache.get(key);
  if (hit) return hit;
  const rand = mulberry32(probeSeed);
  const transitions: ProbeTransition[] = [];

  const roll = makeBody(spec.kind, PROBE_SIZE, spec.layoutSeed, rand);
  for (let t = 0; t < PROBE_ROLLOUT; t++) {
    const action = (rand() * 5) | 0;
    const obs = capture(roll);
    stepGrid(roll, spec.kind, action, PROBE_SIZE, rand, spec.params);
    transitions.push({ source: "rollout", action, obs, nextObs: capture(roll) });
  }

  const origin = makeBody(spec.kind, PROBE_SIZE, spec.layoutSeed, mulberry32(spec.layoutSeed));
  for (let t = 0; t < PROBE_UNIFORM; t++) {
    const body = makeBody(spec.kind, PROBE_SIZE, spec.layoutSeed, rand);
    body.cells = origin.cells.slice();
    body.scent.fill(0);
    const action = (rand() * 5) | 0;
    const obs = capture(body);
    stepGrid(body, spec.kind, action, PROBE_SIZE, rand, spec.params);
    transitions.push({ source: "uniform", action, obs, nextObs: capture(body) });
  }

  const probe: ProbeSet = {
    version: 1,
    kind: spec.kind,
    layoutSeed: spec.layoutSeed,
    probeSeed,
    rollout: PROBE_ROLLOUT,
    uniform: PROBE_UNIFORM,
    transitions,
  };
  cache.set(key, probe);
  return probe;
}

export function probeToJson(probe: ProbeSet): ProbeJson {
  return {
    version: 1,
    kind: probe.kind,
    layoutSeed: probe.layoutSeed,
    probeSeed: probe.probeSeed,
    rollout: probe.rollout,
    uniform: probe.uniform,
    transitions: probe.transitions.map((tr) => ({
      source: tr.source,
      action: tr.action,
      obs: Array.from(tr.obs),
      nextObs: Array.from(tr.nextObs),
    })),
  };
}

export function probeFromJson(raw: ProbeJson): ProbeSet {
  return {
    version: 1,
    kind: raw.kind,
    layoutSeed: raw.layoutSeed,
    probeSeed: raw.probeSeed,
    rollout: raw.rollout,
    uniform: raw.uniform,
    transitions: raw.transitions.map((tr) => ({
      source: tr.source,
      action: tr.action,
      obs: Float32Array.from(tr.obs),
      nextObs: Float32Array.from(tr.nextObs),
    })),
  };
}

/**
 * Mean squared error on wall and food channels. Scent (family 2) is excluded,
 * matching Loop surprise, so the number lives on the same scale as ema.
 * `predict` must not train.
 */
export function scoreProbe(
  probe: ProbeSet,
  predict: (obs: Float32Array, action: number, into: Float32Array) => void,
): number {
  const into = new Float32Array(OBS);
  let sum = 0;
  let n = 0;
  for (const tr of probe.transitions) {
    predict(tr.obs, tr.action, into);
    for (let i = 0; i < OBS; i++) {
      if (i % 3 === 2) continue;
      const d = into[i] - tr.nextObs[i];
      sum += d * d;
      n += 1;
    }
  }
  return n ? sum / n : 0;
}

export function canonicalSpec(kind: "field" | "rooms"): EnvSpec {
  return CANONICAL_ENV[kind];
}
