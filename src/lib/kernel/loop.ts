/**
 * The kernel.
 *
 * A mind is not a pile of weights. It is this closed loop:
 *
 *   observe  x
 *   predict  x̂ = M(x₋, a₋)
 *   surprise δ = plan-family ‖x − x̂‖²  measured BEFORE the update
 *                (wall/food are the plan head; scent is a side channel
 *                the policy never scores over. Residual EMAs still pool
 *                every family so the split is inspectable.)
 *   compress M ← M − η ∇δ
 *   progress ρ = δ̄ − δ             improvement, not surprise itself
 *   act      a ← π(M, ρ, goal)  (side-channel families muted in scoring)
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
  /** Per-dimension squared residual EMA. High = incompressible. */
  residualEma: Float32Array;
  /**
   * Residual EMA pooled by channel family. Grid observations interleave
   * wall / food / scent (period 3). Stream worlds have one family.
   */
  familyResidual: Float32Array;
  familyCount: number;
  /** Unweighted window MSE, kept for inspectability. */
  surpriseRaw = 0.35;

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
    this.residualEma = new Float32Array(outDim);
    this.residualEma.fill(0.08);
    this.familyCount = outDim % 3 === 0 && outDim >= 3 ? 3 : 1;
    this.familyResidual = new Float32Array(this.familyCount);
    this.familyResidual.fill(0.08);
  }

  reset() {
    this.model = new MLP(this.inDim, this.hidden, this.outDim);
    this.replay = [];
    this.prevInput = null;
    this.lastPred = new Float32Array(this.outDim);
    this.baseline.fill(0.5);
    this.residualEma.fill(0.08);
    this.familyResidual.fill(0.08);
    this.residual = true;
    this.surprise = 0.35;
    this.surpriseRaw = 0.35;
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

  /**
   * Curiosity scores structure. Residual is tracked per pixel-channel, then
   * pooled into families (wall / food / scent on the grid). A family whose
   * residual stays high is treated as incompressible and is downweighted
   * so progress ρ is not a tax on noise. Training still sees every channel.
   */
  private scoreSurprise(pred: Float32Array, obs: Float32Array): number {
    const n = this.outDim;
    const f = this.familyCount;
    const acc = new Float32Array(f);
    const cnt = new Float32Array(f);
    for (let i = 0; i < n; i++) {
      const e = pred[i] - obs[i];
      const e2 = e * e;
      this.residualEma[i] = 0.94 * this.residualEma[i] + 0.06 * e2;
      const fam = f === 1 ? 0 : i % f;
      acc[fam] += this.residualEma[i];
      cnt[fam] += 1;
    }
    for (let c = 0; c < f; c++) {
      const mean = cnt[c] > 0 ? acc[c] / cnt[c] : this.familyResidual[c];
      this.familyResidual[c] = 0.9 * this.familyResidual[c] + 0.1 * mean;
    }
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      const e = pred[i] - obs[i];
      const e2 = e * e;
      const w = this.familyWeight(f > 1 ? i % f : i);
      num += w * e2;
      den += w;
    }
    return den > 1e-8 ? num / den : this.surpriseRaw;
  }

  /**
   * Plan families are the hierarchical head: wall + food when the
   * observation is the grid interleave. Scent (family 2) is a side
   * channel — trained, inspected, never used for δ / ρ / imagination.
   * Stream worlds (one family) plan over everything.
   */
  plansFamily(fam: number): boolean {
    if (this.familyCount <= 1) return true;
    return fam !== 2;
  }

  /**
   * How much a family still counts for curiosity and imagination input.
   * Side-channel families are hard-zero. Incompressible plan families
   * collapse toward 0 by residual.
   */
  familyWeight(fam: number): number {
    if (!this.plansFamily(fam)) return 0;
    const src =
      this.familyCount > 1
        ? this.familyResidual[Math.max(0, Math.min(this.familyCount - 1, fam))]
        : this.residualEma[Math.max(0, Math.min(this.outDim - 1, fam))];
    return 1 / (1 + src * 14);
  }

  /** Soft-mute observation dims whose family is treated as noise. */
  muteFamilies(obs: Float32Array, into?: Float32Array): Float32Array {
    const out = into ?? new Float32Array(obs.length);
    const f = this.familyCount;
    if (f <= 1) {
      if (out !== obs) out.set(obs);
      return out;
    }
    const n = Math.min(obs.length, this.outDim);
    for (let i = 0; i < n; i++) out[i] = obs[i] * this.familyWeight(i % f);
    if (obs.length > n && out !== obs) {
      for (let i = n; i < obs.length; i++) out[i] = obs[i];
    }
    return out;
  }

  assimilate(obs: Float32Array, lr: number) {
    const target = new Float32Array(this.outDim);
    this.toTarget(obs, target);
    if (this.prevInput) {
      const raw = this.model.forward(this.prevInput, new Float32Array(this.outDim));
      this.fromResidual(raw, this.lastPred);
      this.surpriseRaw = mse(this.lastPred, obs);
      this.surprise = this.scoreSurprise(this.lastPred, obs);
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
    return 1 - expectedResidual(this.lastPred, (i) => this.familyWeight(i % Math.max(1, this.familyCount)));
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
      residualEma: Array.from(this.residualEma),
      familyResidual: Array.from(this.familyResidual),
      surpriseRaw: this.surpriseRaw,
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
    if ("residualEma" in w && Array.isArray(w.residualEma) && w.residualEma.length === this.outDim) {
      this.residualEma.set(w.residualEma);
    }
    if (
      "familyResidual" in w &&
      Array.isArray(w.familyResidual) &&
      w.familyResidual.length === this.familyCount
    ) {
      this.familyResidual.set(w.familyResidual);
    }
    if ("surpriseRaw" in w && typeof w.surpriseRaw === "number") this.surpriseRaw = w.surpriseRaw;
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
  residualEma?: number[];
  familyResidual?: number[];
  surpriseRaw?: number;
};
