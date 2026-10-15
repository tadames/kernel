/**
 * Curiosity signals on one learner. The world model still trains. Only the
 * intrinsic term that scores actions changes. `rho` is the compression
 * progress already in the loop. The others are baselines.
 */
import type { Loop, LoopFeatures } from "./loop.ts";
import { expectedResidual } from "./policy.ts";
import { mulberry32 } from "./presets.ts";

export const CURIOSITY_SIGNALS = ["random", "count", "surprise", "rnd", "rho"] as const;
export type CuriositySignal = (typeof CURIOSITY_SIGNALS)[number];

export function isCuriositySignal(value: string): value is CuriositySignal {
  return (CURIOSITY_SIGNALS as readonly string[]).includes(value);
}

const RND_DIM = 8;
const RND_LR = 0.02;

/** Fixed random target plus a predictor. The target weights never train. */
export class RndCuriosity {
  readonly targetW: Float32Array;
  readonly targetB: Float32Array;
  readonly predW: Float32Array;
  readonly predB: Float32Array;
  readonly input: number;
  private targetY = new Float32Array(RND_DIM);
  private predY = new Float32Array(RND_DIM);

  constructor(seed: number, input: number) {
    this.input = input;
    const rand = mulberry32(seed >>> 0);
    const scale = Math.sqrt(6 / (input + RND_DIM));
    this.targetW = new Float32Array(RND_DIM * input);
    this.targetB = new Float32Array(RND_DIM);
    this.predW = new Float32Array(RND_DIM * input);
    this.predB = new Float32Array(RND_DIM);
    for (let i = 0; i < this.targetW.length; i++) this.targetW[i] = (rand() * 2 - 1) * scale;
    for (let i = 0; i < RND_DIM; i++) this.targetB[i] = (rand() * 2 - 1) * 0.1;
    for (let i = 0; i < this.predW.length; i++) this.predW[i] = (rand() * 2 - 1) * scale;
    for (let i = 0; i < RND_DIM; i++) this.predB[i] = (rand() * 2 - 1) * 0.1;
  }

  private embed(w: Float32Array, b: Float32Array, x: ArrayLike<number>, into: Float32Array) {
    const n = Math.min(this.input, x.length);
    for (let i = 0; i < RND_DIM; i++) {
      let s = b[i];
      const row = i * this.input;
      for (let j = 0; j < n; j++) s += w[row + j] * x[j];
      into[i] = Math.tanh(s);
    }
    return into;
  }

  /** Predictor error against the frozen target. Does not step weights. */
  error(x: ArrayLike<number>): number {
    this.embed(this.targetW, this.targetB, x, this.targetY);
    this.embed(this.predW, this.predB, x, this.predY);
    let s = 0;
    for (let i = 0; i < RND_DIM; i++) {
      const d = this.predY[i] - this.targetY[i];
      s += d * d;
    }
    return s / RND_DIM;
  }

  /** Train the predictor only. Returns the error before the step. */
  train(x: ArrayLike<number>, lr = RND_LR): number {
    const before = this.error(x);
    const n = Math.min(this.input, x.length);
    for (let i = 0; i < RND_DIM; i++) {
      const y = this.predY[i];
      const err = y - this.targetY[i];
      const g = err * (1 - y * y);
      const row = i * this.input;
      for (let j = 0; j < n; j++) this.predW[row + j] -= lr * g * x[j];
      this.predB[i] -= lr * g;
    }
    return before;
  }
}

export type SignalView = {
  loop: Loop;
  features: LoopFeatures;
  counts: Uint32Array;
  rnd: RndCuriosity;
  /** Cell the action would occupy, using the real grid (count baseline). */
  destGrid: (action: number) => number;
  /** View-cell indices for the scent rho-hat, matching the rho policy. */
  scentPair: (action: number) => { from: number; to: number };
};

/** Scalar that used to be `progressEma` inside action scoring. */
export function signalProgressEma(signal: CuriositySignal, view: SignalView): number {
  if (signal !== "rho") return 0;
  const f = view.features;
  const latent = f.latentRho ? view.loop.latentRho() : 0;
  const slow = f.slowRho ? view.loop.slowRho() : 0;
  return view.loop.progressEma + 0.35 * latent + 0.2 * slow;
}

/**
 * Per-action intrinsic bonus. For `rho` this is the existing rho-hat stack.
 * Count is 1/sqrt(n). Surprise is the imagined forward error. RND is the
 * predictor's error on the imagined observation.
 */
export function signalActionBonus(
  signal: CuriositySignal,
  view: SignalView,
  action: number,
  pred: Float32Array,
): number {
  if (signal === "random") return 0;
  if (signal === "count") {
    const cell = view.destGrid(action);
    const n = view.counts[cell] ?? 0;
    return 1 / Math.sqrt(n + 1);
  }
  if (signal === "surprise") {
    return expectedResidual(pred, (i) => view.loop.familyWeight(i % 3));
  }
  if (signal === "rnd") return view.rnd.error(pred);
  const f = view.features;
  const pair = view.scentPair(action);
  let bonus = view.loop.scentRhoHat(pair.from, pair.to);
  if (f.latentRhoHat) bonus += view.loop.latentRhoHat(action);
  if (f.slowRhoHat) bonus += view.loop.slowRhoHat(action);
  if (f.slowWindow) bonus += view.loop.slowWindowRhoHat(action);
  if (f.slowWindow2) bonus += view.loop.slowWindow2RhoHat(action);
  if (f.slowWindow3) bonus += view.loop.slowWindow3RhoHat(action);
  if (f.slowSelfWindow) bonus += view.loop.slowSelfWindowRhoHat(action);
  if (f.slowSelfWindow2) bonus += view.loop.slowSelfWindow2RhoHat(action);
  return bonus;
}
