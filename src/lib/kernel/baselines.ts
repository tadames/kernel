/**
 * Probe baselines that anchor G1. Computed from the frozen probe, not from
 * a constant written into the claim. The per-cell mean is the marginal
 * predictor. The shift ceiling copies the visible window one step and fills
 * the unseen strip with that marginal.
 */
import { CH, OBS, R } from "./kernel.ts";
import { buildProbe, type ProbeSet } from "./probe.ts";
import { CANONICAL_ENV } from "./env.ts";

const VIEW = R * 2 + 1;
const MOVES = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: 0 },
];

export type ProbeBaseline = {
  meanFloor: number;
  shiftCeiling: number;
};

function cellIndex(dx: number, dy: number, ch: number) {
  return ((dy + R) * VIEW + (dx + R)) * CH + ch;
}

function scoredMse(pred: ArrayLike<number>, target: ArrayLike<number>) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < OBS; i++) {
    if (i % CH === 2) continue;
    const d = pred[i]! - target[i]!;
    sum += d * d;
    n += 1;
  }
  return n ? sum / n : 0;
}

/** Predict every scored channel by its mean on this probe. */
export function meanFloor(probe: ProbeSet) {
  const acc = new Float64Array(OBS);
  for (const tr of probe.transitions) {
    for (let i = 0; i < OBS; i++) acc[i] += tr.nextObs[i]!;
  }
  const pred = new Float32Array(OBS);
  const n = probe.transitions.length || 1;
  for (let i = 0; i < OBS; i++) pred[i] = acc[i]! / n;
  let all = 0;
  for (const tr of probe.transitions) all += scoredMse(pred, tr.nextObs);
  return all / n;
}

/**
 * Shift the visible window along the action. The new strip uses the probe
 * marginal of that channel. Food under the agent is consumed on a move.
 */
export function shiftCeiling(probe: ProbeSet) {
  const acc = new Float64Array(OBS);
  for (const tr of probe.transitions) {
    for (let i = 0; i < OBS; i++) acc[i] += tr.nextObs[i]!;
  }
  const nTr = probe.transitions.length || 1;
  let wallP = 0;
  let foodP = 0;
  let wn = 0;
  let fn = 0;
  for (let i = 0; i < OBS; i++) {
    if (i % CH === 2) continue;
    const p = acc[i]! / nTr;
    if (i % CH === 0) {
      wallP += p;
      wn += 1;
    } else {
      foodP += p;
      fn += 1;
    }
  }
  const marginal = [wn ? wallP / wn : 0, fn ? foodP / fn : 0];
  const into = new Float32Array(OBS);
  let all = 0;
  for (const tr of probe.transitions) {
    const move = MOVES[tr.action] ?? MOVES[4]!;
    into.fill(0);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const sx = dx + move.x;
        const sy = dy + move.y;
        const seen = sx >= -R && sx <= R && sy >= -R && sy <= R;
        for (let ch = 0; ch < 2; ch++) {
          const dest = cellIndex(dx, dy, ch);
          let v: number;
          if (seen) {
            v = tr.obs[cellIndex(sx, sy, ch)]!;
            if (ch === 1 && dx === 0 && dy === 0 && (move.x !== 0 || move.y !== 0)) v = 0;
          } else {
            v = marginal[ch]!;
          }
          into[dest] = v;
        }
      }
    }
    all += scoredMse(into, tr.nextObs);
  }
  return all / nTr;
}

export function probeBaseline(probe: ProbeSet): ProbeBaseline {
  return { meanFloor: meanFloor(probe), shiftCeiling: shiftCeiling(probe) };
}

const cache = new Map<"field" | "rooms", ProbeBaseline>();

/** Canonical Field or Rooms baseline. Cached. The numbers are properties of the frozen probe. */
export function g1Baseline(env: "field" | "rooms"): ProbeBaseline {
  const hit = cache.get(env);
  if (hit) return hit;
  const base = probeBaseline(buildProbe(CANONICAL_ENV[env]));
  cache.set(env, base);
  return base;
}

/**
 * 0 at the per-cell mean, 1 at the shift ceiling. Negative means worse than
 * predicting the marginal. Above 1 means past the shift ceiling.
 */
export function normalizedSkill(late: number, baseline: ProbeBaseline) {
  const den = baseline.meanFloor - baseline.shiftCeiling;
  if (!(den > 1e-8)) return 0;
  return (baseline.meanFloor - late) / den;
}
