/**
 * Falsifiable claims. If these fail, the kernel is not doing what it says.
 */
import { Kernel, SIZE } from "./kernel.ts";
import { runStream, StreamKernel } from "./stream.ts";
import type { LoopFeatures } from "./loop.ts";
import { CANONICAL_ENV } from "./env.ts";
import { PROBE_EARLY_STEP, buildProbe } from "./probe.ts";
import { g1Baseline, normalizedSkill, type ProbeBaseline } from "./baselines.ts";

export type { ProbeBaseline };
export { g1Baseline, normalizedSkill };

/**
 * G1 passes only when late error is under that environment's per-cell-mean
 * floor and has also fallen below 85% of the early probe. The old absolute
 * 0.14 arm sat between the sigmoid prior and the mean floor, so clearing it
 * only showed that the net had left 0.5. `meanFloor` defaults to Field.
 */
export function g1Pass(early: number, late: number, meanFloor?: number) {
  const floor = meanFloor ?? g1Baseline("field").meanFloor;
  return late < floor && late < early * 0.85;
}

export function g2Pass(action: number, foods: number, x: number) {
  return action === 1 || foods > 0 || x === 6;
}

export function s1Pass(early: number, late: number) {
  return late < 0.05 || late < early * 0.25;
}

export function s2Pass(late: number) {
  return late > 0.15;
}

export function s3Pass(structuredLate: number, noiseLate: number) {
  return structuredLate < noiseLate * 0.35;
}

export function c1Pass(structEarly: number, structLate: number, noiseLate: number) {
  return structLate > 0.4 && structLate > structEarly * 1.8 && noiseLate < 0.25;
}

export function c2Pass(meanB: number) {
  return meanB >= 1.6 && meanB <= 4.6;
}

export type Claim = {
  id: string;
  claim: string;
  pass: boolean;
  detail: string;
};

export function gridSurprise(seed = 7, steps = 280, features?: Partial<LoopFeatures>) {
  const probe = buildProbe(CANONICAL_ENV.field);
  const k = new Kernel("field", seed, features, { env: CANONICAL_ENV.field });
  let early = 0;
  let probeEarly = 0;
  for (let i = 0; i < steps; i++) {
    k.step();
    if (i + 1 === PROBE_EARLY_STEP) probeEarly = k.frozenProbeError(probe);
    if (i === 49) early = k.ema;
  }
  const probeLate = k.frozenProbeError(probe);
  if (steps < 50) early = k.ema;
  if (steps < PROBE_EARLY_STEP) probeEarly = probeLate;
  return {
    early,
    late: k.ema,
    probeEarly,
    probeLate,
    foods: k.foods,
    lives: k.lives,
    age: k.age,
  };
}

/** Hungry body, food in the adjacent cell. Whiskers should take it. */
export function adjacentFood(seed = 2, features?: Partial<LoopFeatures>, temperature = 0.04) {
  const k = new Kernel("blank", seed, features);
  k.cells.fill(0);
  for (let i = 0; i < SIZE; i++) {
    k.cells[i] = 1;
    k.cells[(SIZE - 1) * SIZE + i] = 1;
    k.cells[i * SIZE] = 1;
    k.cells[i * SIZE + SIZE - 1] = 1;
  }
  k.x = 5;
  k.y = 7;
  k.energy = 20;
  k.scent.fill(0);
  k.cells[7 * SIZE + 6] = 2;
  k.params = { lr: 0.03, curiosity: 0, goal: 2, temperature };
  k.loop.prevInput = null;
  k.lastObs = k.sense();
  k.step();
  return { action: k.lastAction, foods: k.foods, x: k.x, y: k.y };
}

function mean(xs: number[]) {
  if (xs.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return s / xs.length;
}

/** Prediction commitment (1 − expected residual) early vs late on a stream. */
export function streamCommitment(kind: "structured" | "noise", seed = 3, steps = 220) {
  const s = new StreamKernel(kind, seed);
  const early: number[] = [];
  const late: number[] = [];
  for (let t = 0; t < steps; t++) {
    s.step();
    const c = s.loop.commitment;
    if (t < 40) early.push(c);
    if (t >= steps - 60) late.push(c);
  }
  return { early: mean(early), late: mean(late), age: s.age };
}

/**
 * Policy band on Field after burn-in: entropy H ∈ [0,1], branching ∈ [1,5].
 * The interior is the cheap edge-of-chaos proxy. Freeze is B≈1; a coin is B≈5.
 */
export function fieldBand(seed = 7, steps = 280, features?: Partial<LoopFeatures>) {
  const k = new Kernel("field", seed, features, { env: CANONICAL_ENV.field });
  const H: number[] = [];
  const B: number[] = [];
  const E: number[] = [];
  for (let i = 0; i < steps; i++) {
    k.step();
    if (i >= steps - 80) {
      H.push(k.policyEntropy);
      B.push(k.branching);
      E.push(k.edge);
    }
  }
  return { meanH: mean(H), meanB: mean(B), meanEdge: mean(E), age: k.age };
}

export function evaluateClaims(): Claim[] {
  const grid = gridSurprise();
  const food = adjacentFood();
  const structured = runStream("structured");
  const noise = runStream("noise");
  const structC = streamCommitment("structured");
  const noiseC = streamCommitment("noise");
  const band = fieldBand();

  const structureFalls = s1Pass(structured.early, structured.late);
  const noiseHolds = s2Pass(noise.late);
  const structuredBetter = s3Pass(structured.late, noise.late);
  const gridFalls = g1Pass(grid.probeEarly, grid.probeLate, g1Baseline("field").meanFloor);
  const tookFood = g2Pass(food.action, food.foods, food.x);
  const commitment = c1Pass(structC.early, structC.late, noiseC.late);
  const interior = c2Pass(band.meanB);

  return [
    {
      id: "G1",
      claim: "On a structured grid, held-out probe error falls. The compressor finds regularities it did not choose.",
      pass: gridFalls,
      detail: `probe ${grid.probeEarly.toFixed(3)} → ${grid.probeLate.toFixed(3)}; on-policy ema ${grid.early.toFixed(3)} → ${grid.late.toFixed(3)}`,
    },
    {
      id: "G2",
      claim: "A hungry body takes food in the adjacent cell. Sensing, not a half-plane radar.",
      pass: tookFood,
      detail: `action ${food.action} at ${food.x},${food.y} meals ${food.foods}`,
    },
    {
      id: "S1",
      claim: "The same loop compresses a repeating bit stream (next-bit prediction).",
      pass: structureFalls,
      detail: `structured ema ${structured.early.toFixed(3)} → ${structured.late.toFixed(3)}`,
    },
    {
      id: "S2",
      claim: "The same loop does not compress white noise. Surprise is not a reward.",
      pass: noiseHolds,
      detail: `noise ema ${noise.early.toFixed(3)} → ${noise.late.toFixed(3)}`,
    },
    {
      id: "S3",
      claim: "Structure is much cheaper than noise. Compression progress distinguishes them.",
      pass: structuredBetter,
      detail: `structured ${structured.late.toFixed(3)} vs noise ${noise.late.toFixed(3)}`,
    },
    {
      id: "C1",
      claim: "Effective complexity grows on structure: predictions polarize (commitment rises). A fair coin does not earn a model.",
      pass: commitment,
      detail: `commit structured ${structC.early.toFixed(3)} → ${structC.late.toFixed(3)}; noise late ${noiseC.late.toFixed(3)}`,
    },
    {
      id: "C2",
      claim: "On Field, imagined actions stay in an interior band — not freeze (branching 1), not a coin (branching 5).",
      pass: interior,
      detail: `branching ${band.meanB.toFixed(2)} · H ${band.meanH.toFixed(2)} · edge ${band.meanEdge.toFixed(2)}`,
    },
  ];
}
