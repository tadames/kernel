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
 * When the observation is the grid interleave (familyCount === 3), the
 * MLP output is wall+food only. Scent is a side head on the same hidden
 * state: one sigmoid per cell, spliced onto family 2. That head trains
 * only when family-2 residual falls (compression progress), so noise
 * does not write. Stream worlds (one family) still plan over the whole
 * vector.
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
  /** When false, MLP predicts raw obs (legacy brains). Plan shrink still applies. */
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
  /** Scratch for the packed plan-head target / forward. */
  private planScratch: Float32Array;
  /**
   * Per-cell scent head: hidden → one sigmoid per family-2 cell.
   * 0.5 means "no residual" on top of the skip baseline. Weights
   * start at 0 so an untrained head reconstructs the mean prior.
   */
  scentW: Float32Array;
  scentB: Float32Array;
  scentPred: Float32Array;
  scentCells: number;
  /** How often the scent head was allowed to write. Inspectable. */
  scentTrains = 0;

  inDim: number;
  hidden: number;
  /** Full observation window the body sees. */
  outDim: number;
  /** MLP output size: wall+food when families split, else outDim. */
  planDim: number;
  replayCap: number;
  extraReplay: number;

  constructor(inDim: number, hidden: number, outDim: number, replayCap = 160, extraReplay = 3) {
    this.inDim = inDim;
    this.hidden = hidden;
    this.outDim = outDim;
    this.replayCap = replayCap;
    this.extraReplay = extraReplay;
    this.familyCount = outDim % 3 === 0 && outDim >= 3 ? 3 : 1;
    this.planDim = this.familyCount === 3 ? (outDim * 2) / 3 : outDim;
    this.model = new MLP(inDim, hidden, this.planDim);
    this.lastPred = new Float32Array(outDim);
    this.baseline = new Float32Array(outDim);
    this.baseline.fill(0.5);
    this.residualEma = new Float32Array(outDim);
    this.residualEma.fill(0.08);
    this.familyResidual = new Float32Array(this.familyCount);
    this.familyResidual.fill(0.08);
    this.planScratch = new Float32Array(this.planDim);
    this.scentCells = this.familyCount === 3 ? outDim / 3 : 0;
    this.scentW = new Float32Array(this.scentCells * hidden);
    this.scentB = new Float32Array(this.scentCells);
    this.scentPred = new Float32Array(this.scentCells);
    this.scentPred.fill(0.5);
  }

  reset() {
    this.model = new MLP(this.inDim, this.hidden, this.planDim);
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
    this.scentW.fill(0);
    this.scentB.fill(0);
    this.scentPred.fill(0.5);
    this.scentTrains = 0;
  }

  /** Map a full observation index onto a plan-head slot, or -1 if prior-only. */
  private planIndex(obsI: number): number {
    if (this.familyCount <= 1) return obsI;
    const fam = obsI % 3;
    if (fam === 2) return -1;
    const cell = (obsI / 3) | 0;
    return cell * 2 + fam;
  }

  private toTarget(obs: Float32Array, into: Float32Array): Float32Array {
    if (this.familyCount <= 1) {
      if (!this.residual) {
        into.set(obs);
        return into;
      }
      for (let i = 0; i < this.outDim; i++) {
        into[i] = clamp01(obs[i] - this.baseline[i] + 0.5);
      }
      return into;
    }
    for (let i = 0; i < this.outDim; i++) {
      const p = this.planIndex(i);
      if (p < 0) continue;
      into[p] = this.residual ? clamp01(obs[i] - this.baseline[i] + 0.5) : obs[i];
    }
    return into;
  }

  /**
   * Rebuild a full window from a plan-head vector. Scent (family 2) is
   * the skip baseline plus the per-cell scent head — never a plan-head
   * output unit.
   */
  private fromResidual(y: Float32Array, into: Float32Array): Float32Array {
    if (this.familyCount <= 1) {
      if (!this.residual) {
        if (into !== y) into.set(y);
        return into;
      }
      for (let i = 0; i < this.outDim; i++) {
        into[i] = clamp01(y[i] + this.baseline[i] - 0.5);
      }
      return into;
    }
    for (let i = 0; i < this.outDim; i++) {
      const p = this.planIndex(i);
      if (p < 0) {
        const cell = (i / 3) | 0;
        const off = cell < this.scentPred.length ? this.scentPred[cell] : 0.5;
        into[i] = this.residual ? clamp01(off + this.baseline[i] - 0.5) : this.baseline[i];
        continue;
      }
      into[i] = this.residual ? clamp01(y[p] + this.baseline[i] - 0.5) : clamp01(y[p]);
    }
    return into;
  }

  private forwardScent(ha: Float32Array): Float32Array {
    const cells = this.scentCells;
    const h = ha.length;
    const w = this.scentW;
    const b = this.scentB;
    for (let c = 0; c < cells; c++) {
      let s = b[c];
      const row = c * h;
      const n = Math.min(h, w.length - row);
      for (let i = 0; i < n; i++) s += w[row + i] * ha[i];
      this.scentPred[c] = 1 / (1 + Math.exp(-Math.max(-12, Math.min(12, s))));
    }
    return this.scentPred;
  }

  private trainScent(ha: Float32Array, obs: Float32Array, lr: number) {
    this.forwardScent(ha);
    const cells = this.scentCells;
    const h = ha.length;
    const w = this.scentW;
    const scale = cells > 0 ? 2 / cells : 2;
    for (let c = 0; c < cells; c++) {
      const obsI = c * 3 + 2;
      const target = this.residual ? clamp01(obs[obsI] - this.baseline[obsI] + 0.5) : obs[obsI];
      const y = this.scentPred[c];
      const g = (y - target) * scale * y * (1 - y);
      this.scentB[c] -= lr * g;
      const row = c * h;
      for (let i = 0; i < h; i++) w[row + i] -= lr * g * ha[i];
    }
    this.scentTrains += 1;
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
   * so progress ρ is not a tax on noise. Training sees plan families only.
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
   * channel — inspected, never in the MLP, never used for δ / ρ.
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
    const target = this.planScratch;
    this.toTarget(obs, target);
    if (this.prevInput) {
      const raw = this.model.forward(this.prevInput, new Float32Array(this.planDim));
      const ha = Float32Array.from(this.model.lastHidden());
      if (this.familyCount === 3) this.forwardScent(ha);
      this.fromResidual(raw, this.lastPred);
      this.surpriseRaw = mse(this.lastPred, obs);
      const scentBefore = this.familyCount === 3 ? this.familyResidual[2] : 0;
      this.surprise = this.scoreSurprise(this.lastPred, obs);
      this.participation = participation(this.model.lastHidden());
      this.model.train(this.prevInput, target, lr);
      if (
        this.familyCount === 3 &&
        this.residual &&
        (this.scentTrains < 96 ||
          (this.familyResidual[2] < 0.05 && this.familyResidual[2] < scentBefore - 1e-5))
      ) {
        this.trainScent(ha, obs, lr);
      }
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
    const raw = this.model.forward(input, new Float32Array(this.planDim));
    if (this.familyCount === 3) this.forwardScent(this.model.lastHidden());
    const window = into && into.length >= this.outDim ? into : new Float32Array(this.outDim);
    return this.fromResidual(raw, window);
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
      planDim: this.planDim,
      scentW: Array.from(this.scentW),
      scentB: Array.from(this.scentB),
      scentPred: Array.from(this.scentPred),
      scentTrains: this.scentTrains,
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
    if ("scentW" in w && Array.isArray(w.scentW) && w.scentW.length === this.scentW.length) {
      this.scentW.set(w.scentW);
    }
    if ("scentB" in w && Array.isArray(w.scentB) && w.scentB.length === this.scentB.length) {
      this.scentB.set(w.scentB);
    }
    if ("scentPred" in w && Array.isArray(w.scentPred) && w.scentPred.length === this.scentPred.length) {
      this.scentPred.set(w.scentPred);
    }
    if ("scentTrains" in w && typeof w.scentTrains === "number") this.scentTrains = w.scentTrains;
    if ("replay" in w && Array.isArray(w.replay)) {
      this.replay = w.replay
        .filter((s) => s && Array.isArray(s.x) && Array.isArray(s.y))
        .map((s) => ({
          x: Float32Array.from(s.x),
          y: Float32Array.from(s.y),
        }))
        .filter((s) => s.x.length === this.inDim && s.y.length === this.planDim);
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
  planDim?: number;
  scentW?: number[];
  scentB?: number[];
  scentPred?: number[];
  scentTrains?: number;
};
