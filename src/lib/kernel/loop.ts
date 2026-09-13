/**
 * The kernel.
 *
 * A mind is not a pile of weights. It is this closed loop:
 *
 *   observe  x
 *   predict  x̂ = M(x₋, a₋)
 *   surprise δ = ‖x − x̂‖²          measured BEFORE the update
 *   compress M ← M − η ∇δ
 *   progress ρ = δ̄ − δ             improvement, not surprise itself
 *   act      a ← π(M, ρ, goal)
 *
 * Everything else in this repository — grids, streams, energy, a browser lab —
 * is a testbed. If a new world cannot be learned by this object, the kernel
 * is too small, or the world is incompressible. That is a scientific result,
 * not a product failure.
 */
import { MLP, mse } from "./mlp.ts";
import { participation } from "./complexity.ts";
import { expectedResidual } from "./policy.ts";

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class Loop {
  model: MLP;
  replay: { x: Float32Array; y: Float32Array }[] = [];
  prevInput: Float32Array | null = null;
  lastPred: Float32Array;
  /** Slow per-dimension observation mean. The latent skip. */
  baseline: Float32Array;
  /** When false, MLP predicts raw obs (legacy brains). */
  residual = true;
  surprise = 0.35;
  ema = 0.35;
  progress = 0;
  progressEma = 0;
  participation = 0;
  /** How fast the skip tracks a new world's mean. */
  baselineRate = 0.02;

  inDim: number;
  hidden: number;
  outDim: number;
  replayCap: number;
  extraReplay: number;

  constructor(inDim: number, hidden: number, outDim: number, replayCap = 160, extraReplay = 3) {
    this.inDim = inDim;
    this.hidden = hidden;
    this.outDim = outDim;
    this.replayCap = replayCap;
    this.extraReplay = extraReplay;
    this.model = new MLP(inDim, hidden, outDim);
    this.lastPred = new Float32Array(outDim);
    this.baseline = new Float32Array(outDim);
    this.baseline.fill(0.5);
  }

  reset() {
    this.model = new MLP(this.inDim, this.hidden, this.outDim);
    this.replay = [];
    this.prevInput = null;
    this.lastPred = new Float32Array(this.outDim);
    this.baseline.fill(0.5);
    this.residual = true;
    this.surprise = 0.35;
    this.ema = 0.35;
    this.progress = 0;
    this.progressEma = 0;
    this.participation = 0;
    this.baselineRate = 0.02;
  }

  private toTarget(obs: Float32Array, into: Float32Array): Float32Array {
    if (!this.residual) {
      into.set(obs);
      return into;
    }
    for (let i = 0; i < this.outDim; i++) {
      into[i] = clamp01(obs[i] - this.baseline[i] + 0.5);
    }
    return into;
  }

  private fromResidual(y: Float32Array, into: Float32Array): Float32Array {
    if (!this.residual) {
      if (into !== y) into.set(y);
      return into;
    }
    for (let i = 0; i < this.outDim; i++) {
      into[i] = clamp01(y[i] + this.baseline[i] - 0.5);
    }
    return into;
  }

  private trackBaseline(obs: Float32Array, rate = this.baselineRate) {
    for (let i = 0; i < this.outDim; i++) {
      this.baseline[i] = (1 - rate) * this.baseline[i] + rate * obs[i];
    }
  }

  assimilate(obs: Float32Array, lr: number) {
    const target = new Float32Array(this.outDim);
    this.toTarget(obs, target);
    if (this.prevInput) {
      const raw = this.model.forward(this.prevInput, new Float32Array(this.outDim));
      this.fromResidual(raw, this.lastPred);
      this.surprise = mse(this.lastPred, obs);
      this.participation = participation(this.model.lastHidden());
      this.model.train(this.prevInput, target, lr);
      if (this.replay.length > 0) {
        for (let k = 0; k < this.extraReplay; k++) {
          const s = this.replay[(Math.random() * this.replay.length) | 0];
          this.model.train(s.x, s.y, lr * 0.7);
        }
      }
      this.replay.push({ x: this.prevInput, y: target.slice() });
      if (this.replay.length > this.replayCap) this.replay.shift();
    } else {
      this.surprise = 0.35;
    }
    this.trackBaseline(obs);
    const prev = this.ema;
    this.ema = 0.94 * this.ema + 0.06 * this.surprise;
    this.progress = prev - this.ema;
    this.progressEma = 0.95 * this.progressEma + 0.05 * this.progress;
    return this.surprise;
  }

  imagine(input: Float32Array, into?: Float32Array): Float32Array {
    const raw = this.model.forward(input, into);
    return this.fromResidual(raw, raw);
  }

  commit(input: Float32Array) {
    this.prevInput = input;
  }

  get compression() {
    return 1 / (1 + this.ema * 8);
  }

  get commitment() {
    return 1 - expectedResidual(this.lastPred);
  }

  get weightEnergy() {
    return this.model.weightEnergy();
  }

  exportBrain(): Brain {
    const weights = this.model.exportWeights();
    const cap = Math.min(this.replay.length, 48);
    const start = this.replay.length - cap;
    const replay = this.replay.slice(start).map((s) => ({
      x: Array.from(s.x),
      y: Array.from(s.y),
    }));
    return {
      ...weights,
      ema: this.ema,
      progressEma: this.progressEma,
      surprise: this.surprise,
      progress: this.progress,
      replay,
      residual: this.residual,
      baseline: Array.from(this.baseline),
    };
  }

  importBrain(w: Brain | { w1: number[]; b1: number[]; w2: number[]; b2: number[] }): boolean {
    if (!this.model.importWeights(w)) return false;
    if ("ema" in w && typeof w.ema === "number") this.ema = w.ema;
    if ("progressEma" in w && typeof w.progressEma === "number") this.progressEma = w.progressEma;
    if ("surprise" in w && typeof w.surprise === "number") this.surprise = w.surprise;
    if ("progress" in w && typeof w.progress === "number") this.progress = w.progress;
    if ("residual" in w && typeof w.residual === "boolean") this.residual = w.residual;
    else this.residual = false;
    if ("baseline" in w && Array.isArray(w.baseline) && w.baseline.length === this.outDim) {
      this.baseline.set(w.baseline);
    } else if (!this.residual) {
      this.baseline.fill(0.5);
    }
    if ("replay" in w && Array.isArray(w.replay)) {
      this.replay = w.replay
        .filter((s) => s && Array.isArray(s.x) && Array.isArray(s.y))
        .map((s) => ({
          x: Float32Array.from(s.x),
          y: Float32Array.from(s.y),
        }))
        .filter((s) => s.x.length === this.inDim && s.y.length === this.outDim);
      if (this.replay.length > this.replayCap) {
        this.replay = this.replay.slice(this.replay.length - this.replayCap);
      }
    }
    return true;
  }
}

export type Brain = {
  w1: number[];
  b1: number[];
  w2: number[];
  b2: number[];
  ema?: number;
  progressEma?: number;
  surprise?: number;
  progress?: number;
  replay?: { x: number[]; y: number[] }[];
  residual?: boolean;
  baseline?: number[];
};
