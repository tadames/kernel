/**
 * Domain-general loop: observe → predict → surprise → compress → progress → act.
 *
 * The compressor is an MLP over the last observation. Family 2 (visit-scent)
 * is a side channel: plan surprise, mute, and ρ stay hard-zero there.
 * Imagination novelty reads scentNovelty only after the family-2 residual has
 * stayed under the freeze line for SCENT_FALL_STREAK steps, or during the
 * 96-step probe.
 *
 * Phase 1 seed: a second loop predicts a latent, not cells. The projection
 * is a slow encoder. Its target is stop-grad — the predictor cannot move the
 * code it is scored against. The encoder steps only when latent progress is
 * positive, so noise does not rewrite the features. Cell prediction stays:
 * the body still imagines a window.
 */
import { MLP, mse } from "./mlp.ts";
import { participation } from "./complexity.ts";

export type BrainDump = {
  w1: number[];
  b1: number[];
  w2: number[];
  b2: number[];
  ema: number;
  progressEma: number;
  surprise: number;
  compression: number;
  baselineRate: number;
  scentFallStreak: number;
  scentTrains: number;
  latentW1: number[];
  latentB1: number[];
  latentW2: number[];
  latentB2: number[];
  latentEma: number;
  latentSurprise: number;
  /** Slow encoder. Absent on brains saved before the projection was learned. */
  proj?: number[];
};

export class Loop {
  static readonly SCENT_FALL_STREAK = 4;
  static readonly SCENT_FREEZE = 0.05;
  static readonly SCENT_PROBE = 96;
  /** Slow relative to the latent predictor (0.4). Stop-grad target. */
  static readonly ENC_LR = 0.08;

  readonly net: MLP;
  /** Second compressor. Input and target are hidden activations, not cells. */
  readonly latent: MLP;
  prevInput: Float32Array | null = null;
  lastPred: Float32Array;
  surprise = 0.25;
  ema = 0.25;
  progress = 0;
  progressEma = 0;
  compression = 0;
  baselineRate = 0.02;
  commitment = 0;
  participation = 0;

  familyResidual = new Float32Array(3);
  residualEma: Float32Array;
  scentPred: Float32Array;
  scentCells: number;
  scentTrains = 0;
  scentFallStreak = 0;

  lastHidden: Float32Array;
  prevHidden: Float32Array | null = null;
  latentPred: Float32Array;
  latentSurprise = 0.25;
  latentEma = 0.25;
  latentProgress = 0;
  /** Side head for family 2. Plan surprise stays muted; this residual gates novelty. */
  private scentW: Float32Array;
  private scentB: Float32Array;
  private scentHat: Float32Array;

  private prevFamily2 = 1;
  private sideEma = 0.25;
  /** Slow encoder. Stop-grad target; steps only when the latent is compressing. */
  private proj: Float32Array;
  private latentNow: Float32Array;
  private prevEncObs: Float32Array | null = null;
  private encObsPending: Float32Array | null = null;
  encoderSteps = 0;

  constructor(
    readonly inn: number,
    readonly hidden: number,
    readonly out: number,
  ) {
    this.net = new MLP(inn, hidden, out);
    const latentH = Math.max(4, hidden >> 2);
    this.latent = new MLP(hidden, latentH, hidden);
    this.lastPred = new Float32Array(out);
    this.lastPred.fill(0.5);
    this.residualEma = new Float32Array(out);
    this.residualEma.fill(0.25);
    this.scentCells = out % 3 === 0 ? out / 3 : 0;
    this.scentPred = new Float32Array(Math.max(1, this.scentCells));
    this.scentPred.fill(0.5);
    this.lastHidden = new Float32Array(hidden);
    this.latentPred = new Float32Array(hidden);
    this.latentPred.fill(0.5);
    this.scentW = new Float32Array(Math.max(1, this.scentCells) * inn);
    this.scentB = new Float32Array(Math.max(1, this.scentCells));
    this.scentHat = new Float32Array(Math.max(1, this.scentCells));
    this.scentHat.fill(0.5);
    const a = Math.sqrt(6 / (inn + Math.max(1, this.scentCells)));
    for (let i = 0; i < this.scentW.length; i++) this.scentW[i] = (Math.random() * 2 - 1) * a;
    this.proj = new Float32Array(hidden * out);
    const ap = Math.sqrt(2 / out);
    for (let i = 0; i < this.proj.length; i++) this.proj[i] = (Math.random() * 2 - 1) * ap;
    this.latentNow = new Float32Array(hidden);
  }

  private families() {
    return this.out % 3 === 0 ? 3 : 1;
  }

  /** Plan weight. Family 2 is muted: it never enters surprise or ρ. */
  familyWeight(channel: number): number {
    return channel === 2 ? 0 : 1;
  }

  /** Copy an observation and zero family-2 channels so imagination cannot plan on scent. */
  muteFamilies(obs: Float32Array, into: Float32Array) {
    const n = Math.min(obs.length, into.length);
    into.set(obs.subarray(0, n));
    if (this.families() !== 3) return;
    for (let i = 2; i < n; i += 3) into[i] = 0;
  }

  /**
   * Imagination novelty on a cell. Open during the probe, or after the
   * family-2 residual has held under the freeze line for a falling streak.
   * A single dip does not open. Shut gate returns 0 so noise never pays.
   */
  scentNovelty(cell: number): number {
    if (this.scentCells <= 0) return 0;
    const c = Math.max(0, Math.min(this.scentCells - 1, cell | 0));
    if (!Number.isFinite(c)) return 0;
    const probing = this.scentTrains < Loop.SCENT_PROBE;
    const held =
      this.familyResidual[2] < Loop.SCENT_FREEZE &&
      this.scentFallStreak >= Loop.SCENT_FALL_STREAK;
    if (!probing && !held) return 0;
    return 1;
  }

  private trackScent(target: Float32Array) {
    this.scentTrains += 1;
    if (this.families() !== 3 || !this.prevInput) return;
    const cells = this.scentCells;
    let err = 0;
    for (let c = 0; c < cells; c++) {
      let s = this.scentB[c];
      const row = c * this.inn;
      for (let j = 0; j < this.inn; j++) s += this.scentW[row + j] * this.prevInput[j];
      const y = s < 0 ? 0 : s > 1 ? 1 : s;
      this.scentHat[c] = y;
      const t = target[c * 3 + 2] ?? 0;
      const d = y - t;
      err += d * d;
      const g = d;
      for (let j = 0; j < this.inn; j++) this.scentW[row + j] -= 0.35 * g * this.prevInput[j];
      this.scentB[c] -= 0.35 * g;
      this.scentPred[c] = 0.85 * this.scentPred[c] + 0.15 * y;
    }
    const inst = cells ? err / cells : 0;
    this.sideEma = 0.82 * this.sideEma + 0.18 * inst;
    this.familyResidual[2] = this.sideEma;
    const r2 = this.sideEma;
    if (r2 < Loop.SCENT_FREEZE && r2 <= this.prevFamily2 + 1e-9) this.scentFallStreak += 1;
    else if (r2 >= Loop.SCENT_FREEZE) this.scentFallStreak = 0;
    this.prevFamily2 = r2;
  }

  private project(obs: Float32Array, into: Float32Array) {
    const n = Math.min(obs.length, this.out);
    for (let i = 0; i < this.hidden; i++) {
      let s = 0;
      const row = i * this.out;
      for (let j = 0; j < n; j++) s += this.proj[row + j] * obs[j];
      into[i] = Math.tanh(s);
    }
    return into;
  }

  /**
   * Stop-grad encoder step. `h` is the detached target. The predictor's
   * input gradient is applied to the projection that produced prevHidden,
   * never to the target. Runs only after latent progress, so a fair coin
   * does not get to pick features.
   */
  private learnEncoder() {
    if (!this.prevEncObs || !this.prevHidden) return;
    // Same gate as curiosity. Flicker on a fair coin is not progress.
    if (this.latentEma >= 0.2 || this.latentProgress <= 0.001) return;
    // Stop-grad covariance. Target code is already detached; this step only
    // writes the projection that will encode the next observation. Stable
    // channels accumulate. Noise averages toward zero, then decays.
    const x = this.prevEncObs;
    const n = Math.min(x.length, this.out);
    const lr = Loop.ENC_LR;
    for (let i = 0; i < this.hidden; i++) {
      const z = this.prevHidden[i];
      const row = i * this.out;
      for (let j = 0; j < n; j++) {
        const w = this.proj[row + j];
        let next = w * 0.998 + lr * z * (x[j] - 0.5);
        if (next > 1.5) next = 1.5;
        else if (next < -1.5) next = -1.5;
        this.proj[row + j] = next;
      }
    }
    this.encoderSteps += 1;
  }

  private commitHidden(h: Float32Array) {
    if (!this.prevHidden) {
      this.prevHidden = new Float32Array(this.hidden);
      this.prevHidden.set(h);
      this.lastHidden.set(h);
      this.stashEncObs();
      return;
    }
    const pred = this.latent.forward(this.prevHidden, this.latentPred);
    // Stop-grad target. A copy, not a view the encoder can chase.
    const zt = new Float32Array(this.hidden);
    let s = 0;
    for (let i = 0; i < this.hidden; i++) {
      const t = (h[i] + 1) * 0.5;
      zt[i] = t;
      const d = pred[i] - t;
      s += d * d;
    }
    this.latentSurprise = s / this.hidden;
    let varH = 0;
    let meanH = 0;
    for (let i = 0; i < this.hidden; i++) meanH += h[i];
    meanH /= this.hidden;
    for (let i = 0; i < this.hidden; i++) {
      const d = h[i] - meanH;
      varH += d * d;
    }
    varH /= this.hidden;
    // Collapse is not compression. A constant hidden predicts itself on noise.
    if (varH < 0.01) this.latentSurprise = Math.max(this.latentSurprise, 0.25);
    this.latentProgress = this.latentEma - this.latentSurprise;
    this.latentEma = 0.92 * this.latentEma + 0.08 * this.latentSurprise;
    this.latent.train(this.prevHidden, zt, 0.4);
    this.learnEncoder();
    this.prevHidden.set(h);
    this.lastHidden.set(h);
    this.stashEncObs();
  }

  private noteEncObs(obs: Float32Array) {
    if (!this.encObsPending) this.encObsPending = new Float32Array(this.out);
    const n = Math.min(obs.length, this.out);
    this.encObsPending.fill(0);
    this.encObsPending.set(obs.subarray(0, n));
  }

  private stashEncObs() {
    if (!this.encObsPending) return;
    if (!this.prevEncObs) this.prevEncObs = new Float32Array(this.out);
    this.prevEncObs.set(this.encObsPending);
  }

  /**
   * Score the current model against `target` before the gradient step,
   * then compress. Family 2 is excluded from δ and from the training target.
   */
  assimilate(target: Float32Array, lr: number) {
    if (!this.prevInput) {
      this.lastPred.fill(0.5);
      this.surprise = 0.25;
      this.trackScent(target);
      return;
    }
    this.net.forward(this.prevInput, this.lastPred);
    const encoded = this.net.lastHidden().slice();
    const fam = this.families();
    const famErr = [0, 0, 0];
    const famN = [0, 0, 0];
    let s = 0;
    let n = 0;
    let commitMass = 0;
    let commitDen = 0;
    for (let i = 0; i < this.out; i++) {
      const d = this.lastPred[i] - target[i];
      const e = d * d;
      this.residualEma[i] = 0.9 * this.residualEma[i] + 0.1 * e;
      const f = fam === 3 ? i % 3 : 0;
      famErr[f] += e;
      famN[f] += 1;
      if (f !== 2) {
        s += e;
        n += 1;
      }
      const p = this.lastPred[i];
      commitMass += p * (1 - p);
      commitDen += 1;
    }
    for (let f = 0; f < 3; f++) this.familyResidual[f] = famN[f] ? famErr[f] / famN[f] : 0;
    this.surprise = n ? s / n : 0;
    this.progress = this.ema - this.surprise;
    this.progressEma = 0.95 * this.progressEma + 0.05 * this.progress;
    if (this.progress > 0) this.compression += this.progress;
    const a = this.baselineRate;
    this.ema = (1 - a) * this.ema + a * this.surprise;
    this.commitment = 1 - (commitDen ? (commitMass / commitDen) * 4 : 1);
    this.trackScent(target);
    this.project(target, this.latentNow);
    this.noteEncObs(target);

    const trainTarget = target.slice();
    if (fam === 3) {
      for (let i = 2; i < this.out; i += 3) trainTarget[i] = this.lastPred[i];
    }
    this.net.train(this.prevInput, trainTarget, lr);
    this.participation = participation(encoded);
    this.commitHidden(this.latentNow);
  }

  /** Predict into `into` without learning. */
  imagine(x: Float32Array, into: Float32Array): Float32Array {
    return this.net.forward(x, into);
  }

  commit(x: Float32Array) {
    if (!this.prevInput || this.prevInput.length !== x.length) this.prevInput = new Float32Array(x.length);
    this.prevInput.set(x);
  }

  get weightEnergy() {
    return this.net.weightEnergy();
  }

  /**
   * Side-head predicted residual at a cell. scentPred is residual-space
   * (0.5 = skip). Bernoulli variance y(1−y) peaks on the mean prior.
   */
  predictedScentResidual(cell: number): number {
    if (this.scentCells <= 0) return 0;
    const c = Math.max(0, Math.min(this.scentCells - 1, cell | 0));
    const y = this.scentPred[c];
    return y * (1 - y);
  }

  /**
   * Action-conditional scent ρ̂: drop in the side head's predicted
   * residual from the current cell to the destination.
   * Zero when the novelty gate is shut, so noise never pays.
   */
  scentRhoHat(fromCell: number, toCell: number): number {
    if (this.scentNovelty(toCell) <= 0) return 0;
    const ra = this.predictedScentResidual(fromCell);
    const rb = this.predictedScentResidual(toCell);
    return Math.max(0, ra - rb);
  }

  /** Gated latent progress. Zero until the latent itself is compressing. */
  latentRho(): number {
    if (this.latentEma >= 0.2) return 0;
    return Math.max(0, this.latentProgress);
  }

  exportBrain(): BrainDump {
    const w = this.net.exportWeights();
    const z = this.latent.exportWeights();
    return {
      ...w,
      ema: this.ema,
      progressEma: this.progressEma,
      surprise: this.surprise,
      compression: this.compression,
      baselineRate: this.baselineRate,
      scentFallStreak: this.scentFallStreak,
      scentTrains: this.scentTrains,
      latentW1: z.w1,
      latentB1: z.b1,
      latentW2: z.w2,
      latentB2: z.b2,
      latentEma: this.latentEma,
      latentSurprise: this.latentSurprise,
      proj: Array.from(this.proj),
    };
  }

  importBrain(w: BrainDump): boolean {
    const ok = this.net.importWeights(w);
    if (!ok) return false;
    if (w.latentW1 && w.latentB1 && w.latentW2 && w.latentB2) {
      this.latent.importWeights({
        w1: w.latentW1,
        b1: w.latentB1,
        w2: w.latentW2,
        b2: w.latentB2,
      });
    }
    this.ema = w.ema;
    this.progressEma = w.progressEma;
    this.surprise = w.surprise;
    this.compression = w.compression;
    this.baselineRate = w.baselineRate;
    this.scentFallStreak = w.scentFallStreak ?? 0;
    this.scentTrains = w.scentTrains ?? 0;
    this.latentEma = w.latentEma ?? 0.25;
    this.latentSurprise = w.latentSurprise ?? 0.25;
    if (w.proj && w.proj.length === this.proj.length) this.proj.set(w.proj);
    return true;
  }
}

export { mse };
