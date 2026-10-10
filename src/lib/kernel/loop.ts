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
 * positive, so noise does not rewrite the features. The latent predictor is
 * action-conditional: the code it imagines depends on the move, so rho-hat
 * can score a drop in code residual, not only cells. Cell prediction stays.
 * One level up, a slower loop predicts that latent code, not the cells.
 * Its progress pays only after both codes are compressing. A level-1 residual
 * above its ema wakes that slower step even when the latent gate is shut, so
 * a surprise downstairs can still move the slower code. The wake does not pay.
 * ρ̂ can also score one imagined latent step: the slow prediction against the
 * low-passed next code, not only against the code already in hand. A second
 * latent step scores past a wall that first window refuses, and does not pay
 * when the first window already pays. The follow-up is the legal action that
 * also lowers the level-1 residual, so the second step cannot pick a code the
 * latent loop would refuse.
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
  /** Action bias on the latent code. Absent on brains saved before action conditioning. */
  latentActBias?: number[];
  /** Per-action latent prediction error. Absent on older brains. */
  latentActionEma?: number[];
  /** Slow code one level up. Absent on brains saved before the hierarchy. */
  slowW1?: number[];
  slowB1?: number[];
  slowW2?: number[];
  slowB2?: number[];
  slowEma?: number;
  slowSurprise?: number;
  slowActBias?: number[];
  slowActionEma?: number[];
  /** Low-passed latent code. Absent on older brains. */
  slowCode?: number[];
  /** Closed-gate steps woken by a level-1 residual. Absent on older brains. */
  slowWakes?: number;
  /** Last slower-window drop that cleared the floor. Absent on older brains. */
  slowWindow?: number;
  /** Second imagined latent step. Absent on brains saved before the wall gate. */
  slowWindow2?: number;
};

export class Loop {
  static readonly SCENT_FALL_STREAK = 4;
  static readonly SCENT_FREEZE = 0.05;
  static readonly SCENT_PROBE = 96;
  /** Slow relative to the latent predictor (0.4). Stop-grad target. */
  static readonly ENC_LR = 0.08;
  /** Slower than the latent predictor. Predicts the latent code, not cells. */
  static readonly SLOW_LR = 0.12;
  /** Level-1 residual above its ema by this much wakes a closed slow step. */
  static readonly SLOW_WAKE = 0.06;
  /** Second slow window stays shut until the slow code has earned the same line as horizon 3. */
  static readonly SLOW_WINDOW2_EMA = 0.12;

  readonly net: MLP;
  /** Second compressor. Input and target are hidden activations, not cells. */
  readonly latent: MLP;
  /** Third compressor. Input and target are the latent code, not cells. */
  readonly slow: MLP;
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
  /** Action that produced the last latent transition. */
  lastLatentAction = 0;
  /** Side head for family 2. Plan surprise stays muted; this residual gates novelty. */
  private scentW: Float32Array;
  private scentB: Float32Array;
  private scentHat: Float32Array;

  private prevFamily2 = 1;
  private sideEma = 0.25;
  /** Slow encoder. Stop-grad target; steps only when the latent is compressing. */
  private proj: Float32Array;
  private latentNow: Float32Array;
  private latentIn: Float32Array;
  private latentImagined: Float32Array;
  private latentImagined2: Float32Array;
  private latentStep: Float32Array;
  /** Clipped per-action shift so the imagined code can leave 1/2. */
  private actBias: Float32Array;
  /** Prediction error of the action-conditional code, per move. */
  private actionLatentEma: Float32Array;
  private prevEncObs: Float32Array | null = null;
  private encObsPending: Float32Array | null = null;
  encoderSteps = 0;

  slowSurprise = 0.25;
  slowEma = 0.25;
  slowProgress = 0;
  slowSteps = 0;
  /** Slow steps taken while the latent gate was shut, woken by a downstairs residual. */
  slowWakes = 0;
  /** Last slower-window drop that cleared the floor. Inspectable, not a reward store. */
  slowWindow = 0;
  /** Last second-step drop that cleared the floor past a first-window wall. */
  slowWindow2 = 0;
  private slowCode: Float32Array;
  private prevSlow: Float32Array | null = null;
  private slowPred: Float32Array;
  private slowIn: Float32Array;
  private slowImagined: Float32Array;
  private slowBias: Float32Array;
  private slowActionEma: Float32Array;

  /** One-hot width of the action the latent predictor conditions on. */
  readonly acts: number;
  constructor(
    readonly inn: number,
    readonly hidden: number,
    readonly out: number,
    acts = 5,
  ) {
    this.acts = acts;
    this.net = new MLP(inn, hidden, out);
    const latentH = Math.max(4, hidden >> 2);
    this.latent = new MLP(hidden + acts, latentH, hidden);
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
    this.latentIn = new Float32Array(hidden + acts);
    this.latentImagined = new Float32Array(hidden);
    this.latentImagined2 = new Float32Array(hidden);
    this.latentStep = new Float32Array(hidden);
    this.actBias = new Float32Array(acts * hidden);
    this.actionLatentEma = new Float32Array(acts);
    this.actionLatentEma.fill(0.25);
    const slowH = Math.max(4, hidden >> 3);
    this.slow = new MLP(hidden + acts, slowH, hidden);
    this.slowCode = new Float32Array(hidden);
    this.slowCode.fill(0.5);
    this.slowPred = new Float32Array(hidden);
    this.slowPred.fill(0.5);
    this.slowIn = new Float32Array(hidden + acts);
    this.slowImagined = new Float32Array(hidden);
    this.slowBias = new Float32Array(acts * hidden);
    this.slowActionEma = new Float32Array(acts);
    this.slowActionEma.fill(0.25);
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

  /** Action one-hot lives just past the observation in the committed input. */
  private readAction(x: Float32Array | null): number {
    if (!x || x.length < this.out + this.acts) return 0;
    let best = 0;
    let bestV = x[this.out] ?? 0;
    for (let a = 1; a < this.acts; a++) {
      const v = x[this.out + a] ?? 0;
      if (v > bestV) {
        bestV = v;
        best = a;
      }
    }
    return bestV > 0.5 ? best : 0;
  }

  private fillLatentIn(h: Float32Array, action: number) {
    this.latentIn.fill(0);
    this.latentIn.set(h.subarray(0, this.hidden));
    const a = Math.max(0, Math.min(this.acts - 1, action | 0));
    this.latentIn[this.hidden + a] = 1;
  }

  /** Mean Bernoulli variance. Peaks at 1/2, falls as the code commits. */
  private codeResidual(code: Float32Array): number {
    let s = 0;
    const n = Math.min(code.length, this.hidden);
    for (let i = 0; i < n; i++) {
      const y = code[i]!;
      s += y * (1 - y);
    }
    return n ? s / n : 0;
  }

  /**
   * Predict the next code under `action` without learning.
   * Uses the current hidden, so imagination can score a move before it is taken.
   */
  private applyActBias(pred: Float32Array, action: number) {
    const a = Math.max(0, Math.min(this.acts - 1, action | 0));
    const row = a * this.hidden;
    for (let i = 0; i < this.hidden; i++) {
      const y = pred[i]! + this.actBias[row + i]!;
      pred[i] = y < 0 ? 0 : y > 1 ? 1 : y;
    }
    return pred;
  }

  private learnActBias(pred: Float32Array, target: Float32Array, action: number) {
    const a = Math.max(0, Math.min(this.acts - 1, action | 0));
    const row = a * this.hidden;
    for (let i = 0; i < this.hidden; i++) {
      let next = this.actBias[row + i]! - 0.2 * (pred[i]! - target[i]!);
      if (next > 0.45) next = 0.45;
      else if (next < -0.45) next = -0.45;
      this.actBias[row + i] = next;
    }
  }

  imagineLatentFrom(src: Float32Array, action: number, into: Float32Array): Float32Array {
    this.fillLatentIn(src, action);
    this.latent.forward(this.latentIn, into);
    return this.applyActBias(into, action);
  }

  imagineLatent(action: number, into: Float32Array = this.latentImagined): Float32Array {
    return this.imagineLatentFrom(this.lastHidden, action, into);
  }

  /**
   * Action-conditional latent rho-hat: drop in predicted code residual from the
   * last transition's code to the code imagined under this move.
   * Zero until the latent itself is compressing, so an uncalibrated code never pays.
   */
  latentRhoHat(action: number): number {
    if (this.latentEma >= 0.2 || !this.prevHidden) return 0;
    const a = Math.max(0, Math.min(this.acts - 1, action | 0));
    // Score the imagined code: its cached prediction error against the latent's own ema.
    this.imagineLatent(a);
    const drop = this.latentEma - this.actionLatentEma[a]!;
    // Flicker under the gate is not progress. Same idea as the encoder's 0.001 floor, wider.
    if (drop <= 0.01) return 0;
    return drop;
  }

  private commitHidden(h: Float32Array) {
    if (!this.prevHidden) {
      this.prevHidden = new Float32Array(this.hidden);
      this.prevHidden.set(h);
      this.lastHidden.set(h);
      this.stashEncObs();
      return;
    }
    const action = this.readAction(this.prevInput);
    this.lastLatentAction = action;
    this.fillLatentIn(this.prevHidden, action);
    const pred = this.latent.forward(this.latentIn, this.latentPred);
    this.applyActBias(pred, action);
    // Stop-grad target. A copy, not a view the encoder can chase.
    const zt = new Float32Array(this.hidden);
    let s = 0;
    for (let i = 0; i < this.hidden; i++) {
      const t = (h[i] + 1) * 0.5;
      zt[i] = t;
      const d = pred[i] - t;
      s += d * d;
    }
    this.learnActBias(pred, zt, action);
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
    this.actionLatentEma[action] = 0.9 * this.actionLatentEma[action]! + 0.1 * this.latentSurprise;
    this.latentProgress = this.latentEma - this.latentSurprise;
    this.latentEma = 0.92 * this.latentEma + 0.08 * this.latentSurprise;
    this.latent.train(this.latentIn, zt, 0.4);
    this.learnEncoder();
    this.commitSlow(zt, action);
    this.prevHidden.set(h);
    this.lastHidden.set(h);
    this.stashEncObs();
  }

  private fillSlowIn(code: Float32Array, action: number) {
    this.slowIn.fill(0);
    this.slowIn.set(code.subarray(0, this.hidden));
    const a = Math.max(0, Math.min(this.acts - 1, action | 0));
    this.slowIn[this.hidden + a] = 1;
  }

  private applySlowBias(pred: Float32Array, action: number) {
    const a = Math.max(0, Math.min(this.acts - 1, action | 0));
    const row = a * this.hidden;
    for (let i = 0; i < this.hidden; i++) {
      const y = pred[i]! + this.slowBias[row + i]!;
      pred[i] = y < 0 ? 0 : y > 1 ? 1 : y;
    }
    return pred;
  }

  private learnSlowBias(pred: Float32Array, target: Float32Array, action: number) {
    const a = Math.max(0, Math.min(this.acts - 1, action | 0));
    const row = a * this.hidden;
    for (let i = 0; i < this.hidden; i++) {
      let next = this.slowBias[row + i]! - 0.08 * (pred[i]! - target[i]!);
      if (next > 0.35) next = 0.35;
      else if (next < -0.35) next = -0.35;
      this.slowBias[row + i] = next;
    }
  }

  /**
   * One level up: predict the detached latent code, low-passed, not the cells.
   * Trains after the level-1 code is compressing, at a slower rate. A level-1
   * residual above its ema wakes one step even when that gate is shut, so a
   * surprise downstairs can still move the slower code. The wake does not pay.
   */
  private commitSlow(zt: Float32Array, action: number) {
    for (let i = 0; i < this.hidden; i++) {
      this.slowCode[i] = 0.85 * this.slowCode[i]! + 0.15 * zt[i]!;
    }
    if (!this.prevSlow) {
      this.prevSlow = new Float32Array(this.hidden);
      this.prevSlow.set(this.slowCode);
      return;
    }
    const excess = this.latentSurprise - this.latentEma;
    const wake = excess > Loop.SLOW_WAKE;
    if (this.latentEma >= 0.2 && !wake) {
      this.prevSlow.set(this.slowCode);
      return;
    }
    this.fillSlowIn(this.prevSlow, action);
    const pred = this.slow.forward(this.slowIn, this.slowPred);
    this.applySlowBias(pred, action);
    const target = new Float32Array(this.hidden);
    let s = 0;
    let mean = 0;
    for (let i = 0; i < this.hidden; i++) {
      target[i] = this.slowCode[i]!;
      mean += target[i]!;
      const d = pred[i]! - target[i]!;
      s += d * d;
    }
    mean /= this.hidden;
    let varS = 0;
    for (let i = 0; i < this.hidden; i++) {
      const d = target[i]! - mean;
      varS += d * d;
    }
    varS /= this.hidden;
    this.learnSlowBias(pred, target, action);
    this.slowSurprise = s / this.hidden;
    if (varS < 0.004) this.slowSurprise = Math.max(this.slowSurprise, 0.25);
    const closed = this.latentEma >= 0.2;
    if (!closed) {
      this.slowActionEma[action] = 0.8 * this.slowActionEma[action]! + 0.2 * this.slowSurprise;
      this.slowProgress = this.slowEma - this.slowSurprise;
      this.slowEma = 0.96 * this.slowEma + 0.04 * this.slowSurprise;
    }
    const lr = closed ? Loop.SLOW_LR * 0.5 : Loop.SLOW_LR * (1 + Math.min(1, Math.max(0, excess) / 0.1));
    this.slow.train(this.slowIn, target, lr);
    this.slowSteps += 1;
    if (closed) this.slowWakes += 1;
    this.prevSlow.set(this.slowCode);
  }

  imagineSlow(action: number, into: Float32Array = this.slowImagined): Float32Array {
    const src = this.prevSlow ?? this.slowCode;
    this.fillSlowIn(src, action);
    this.slow.forward(this.slowIn, into);
    return this.applySlowBias(into, action);
  }

  /** Gated slow progress. Zero until both the latent and the slow code are compressing. */
  slowRho(): number {
    if (this.latentEma >= 0.2 || this.slowEma >= 0.2) return 0;
    // Flicker under the gate is not progress. Same floor as the encoder.
    if (this.slowProgress <= 0.001) return 0;
    return this.slowProgress;
  }

  /**
   * Action-conditional slow rho-hat: drop from the slow ema to this move's
   * own prediction error. Zero until both codes are compressing.
   */
  slowRhoHat(action: number): number {
    if (this.latentEma >= 0.2 || this.slowEma >= 0.2 || !this.prevSlow) return 0;
    const a = Math.max(0, Math.min(this.acts - 1, action | 0));
    this.imagineSlow(a);
    const drop = this.slowEma - this.slowActionEma[a]!;
    if (drop <= 0.005) return 0;
    return drop;
  }

  /**
   * Slower window: one imagined latent step under this move, low-passed the
   * same way commitSlow writes the code. ρ̂ is the drop from the residual of
   * the current code to the residual of that imagined next code, under the
   * same slow prediction. Zero until both codes are compressing. A collapsed
   * imagined code does not pay. This does not write slow progress.
   */
  private slowStepResidual(pred: Float32Array, code: Float32Array): { res: number; mean: number; varS: number } {
    let res = 0;
    let mean = 0;
    for (let i = 0; i < this.hidden; i++) {
      const t = code[i]!;
      mean += t;
      const d = pred[i]! - t;
      res += d * d;
    }
    res /= this.hidden;
    mean /= this.hidden;
    let varS = 0;
    for (let i = 0; i < this.hidden; i++) {
      const d = code[i]! - mean;
      varS += d * d;
    }
    return { res, mean, varS: varS / this.hidden };
  }

  slowWindowRhoHat(action: number): number {
    if (this.latentEma >= 0.2 || this.slowEma >= 0.2 || !this.prevSlow) return 0;
    const a = Math.max(0, Math.min(this.acts - 1, action | 0));
    const z = this.imagineLatent(a);
    const pred = this.imagineSlow(a);
    const held = this.slowStepResidual(pred, this.slowCode);
    const nextCode = new Float32Array(this.hidden);
    for (let i = 0; i < this.hidden; i++) nextCode[i] = 0.85 * this.slowCode[i]! + 0.15 * z[i]!;
    const nxt = this.slowStepResidual(pred, nextCode);
    if (nxt.varS < 0.004) return 0;
    const drop = held.res - nxt.res;
    // Floor matches slow progress. A compressed code lives under the 0.005 action-ema gate.
    if (drop <= 0.001) return 0;
    this.slowWindow = drop;
    return drop;
  }

  /**
   * Second latent step. Pays only when the first window treats this move as a
   * wall (no drop, or a collapsed one-step code) and the slow code is already
   * under SLOW_WINDOW2_EMA (0.12), the same line as horizon 3. An uncalibrated
   * slow code cannot imagine past a wall it has not earned. The follow-up is
   * the legal action whose low-passed code is closest to the slow prediction
   * and whose level-1 residual is lower than the first action's, so the second
   * step cannot pick a code the latent loop would refuse. A collapsed second
   * code does not pay. This does not write slow progress.
   */
  slowWindow2RhoHat(action: number): number {
    if (this.latentEma >= 0.2 || this.slowEma >= Loop.SLOW_WINDOW2_EMA || !this.prevSlow) return 0;
    const a = Math.max(0, Math.min(this.acts - 1, action | 0));
    const z1 = this.imagineLatent(a);
    this.latentStep.set(z1);
    const pred = this.imagineSlow(a);
    const held = this.slowStepResidual(pred, this.slowCode);
    const step1 = new Float32Array(this.hidden);
    for (let i = 0; i < this.hidden; i++) step1[i] = 0.85 * this.slowCode[i]! + 0.15 * this.latentStep[i]!;
    const first = this.slowStepResidual(pred, step1);
    if (first.varS >= 0.004 && held.res - first.res > 0.001) return 0;
    let best = 0;
    const firstLevel1 = this.actionLatentEma[a]!;
    for (let b = 0; b < this.acts; b++) {
      // Follow-up must also lower the level-1 residual. A code the latent
      // loop would refuse (higher or equal residual) cannot fund the second step.
      if (this.actionLatentEma[b]! >= firstLevel1 - 0.001) continue;
      const z2 = this.imagineLatentFrom(this.latentStep, b, this.latentImagined2);
      const step2 = new Float32Array(this.hidden);
      for (let i = 0; i < this.hidden; i++) step2[i] = 0.85 * step1[i]! + 0.15 * z2[i]!;
      const second = this.slowStepResidual(pred, step2);
      if (second.varS < 0.004) continue;
      const drop = first.res - second.res;
      if (drop > best) best = drop;
    }
    if (best <= 0.001) return 0;
    this.slowWindow2 = best;
    return best;
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
    const zslow = this.slow.exportWeights();
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
      latentActBias: Array.from(this.actBias),
      latentActionEma: Array.from(this.actionLatentEma),
      slowW1: zslow.w1,
      slowB1: zslow.b1,
      slowW2: zslow.w2,
      slowB2: zslow.b2,
      slowEma: this.slowEma,
      slowSurprise: this.slowSurprise,
      slowActBias: Array.from(this.slowBias),
      slowActionEma: Array.from(this.slowActionEma),
      slowCode: Array.from(this.slowCode),
      slowWakes: this.slowWakes,
      slowWindow: this.slowWindow,
      slowWindow2: this.slowWindow2,
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
    if (w.latentActBias && w.latentActBias.length === this.actBias.length) this.actBias.set(w.latentActBias);
    if (w.latentActionEma && w.latentActionEma.length === this.actionLatentEma.length) this.actionLatentEma.set(w.latentActionEma);
    if (w.slowW1 && w.slowB1 && w.slowW2 && w.slowB2) {
      this.slow.importWeights({ w1: w.slowW1, b1: w.slowB1, w2: w.slowW2, b2: w.slowB2 });
    }
    this.slowEma = w.slowEma ?? 0.25;
    this.slowSurprise = w.slowSurprise ?? 0.25;
    if (w.slowActBias && w.slowActBias.length === this.slowBias.length) this.slowBias.set(w.slowActBias);
    if (w.slowActionEma && w.slowActionEma.length === this.slowActionEma.length) this.slowActionEma.set(w.slowActionEma);
    if (w.slowCode && w.slowCode.length === this.slowCode.length) {
      this.slowCode.set(w.slowCode);
      if (!this.prevSlow) this.prevSlow = new Float32Array(this.hidden);
      this.prevSlow.set(this.slowCode);
    }
    this.slowWakes = w.slowWakes ?? 0;
    this.slowWindow = w.slowWindow ?? 0;
    this.slowWindow2 = w.slowWindow2 ?? 0;
    return true;
  }
}

export { mse };
