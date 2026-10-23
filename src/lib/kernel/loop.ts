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
 * The slow code invents its own features: a stop-grad encoder projects the
 * latent into the slow space. The residual mix rises with participation so a
 * high-dimensional code invents more aggressively. The encoder steps only when
 * the slow code is compressing, and the predictor cannot move the target it is
 * scored against.
 * Its progress pays only after both codes are compressing. A level-1 residual
 * above its ema wakes that slower step even when the latent gate is shut, so
 * a surprise downstairs can still move the slower code. The wake does not pay.
 * ρ̂ can also score one imagined latent step: the slow prediction against the
 * low-passed next code, not only against the code already in hand. A second
 * latent step scores past a wall that first window refuses, and does not pay
 * when the first window already pays. The follow-up is the legal action that
 * also lowers the level-1 residual, so the second step cannot pick a code the
 * latent loop would refuse. A third latent step scores one more imagined code
 * under the same residual constraint: its follow-up must lower the level-1
 * residual relative to the second action.
 * The slow code can also predict its own next step, not only a latent-imagined
 * code, so ρ̂ can score a window the latent predictor has not already compressed.
 * A second self-step scores past a wall that first self-prediction treats as a
 * wall, and only after slowEma < 0.12.
 * `discard` is learning-side and off by default. After 40 training steps it
 * drops a non-scent channel from the cell loss when that channel's model
 * residual is not below the error of its own running mean. Surprise and the
 * progress bonus still see the real residual.
 * `decode` is learning-side and off by default. The cell net's first layer
 * matches a stop-grad code of the next window instead of the cell error.
 * The second layer decodes that hidden code to cells, which is what the
 * probe reads. The code is trained so the current readout can decode it,
 * and the predictor cannot move the encoder. Surprise still sees the real
 * residual. The code width is the hidden width. There is no second mask.
 * `option` is action-side and on by default. The sampled direction is
 * executed for two ticks. The second tick does not sample. It does not
 * enter the progress bonus and it does not change the cell loss. The
 * off path still samples every tick and draws no extra random number.
 */
import { MLP, mse } from "./mlp.ts";
import { participation } from "./complexity.ts";
import { heldOutProgressRing, SHIPPED_PROGRESS_WINDOW, type ProgressMode } from "./progress.ts";

/**
 * Curiosity terms stacked onto the cell loop. Each one can be shut off
 * without deleting the trace. A term stays on only when a preregistered
 * probe ablation says it beats its own absence. See AGENTS.project.md.
 * The 2026-10-15 probe gate turned the noisy set off. None of them lowered
 * held-out probe error. `transition` is the cell learner, not a bonus term:
 * the same gate kept it because probe error fell. `discard` is also
 * learning-side. It does not enter the bonus. It stays off unless a
 * preregistered probe gate says it beats its absence. `decode` is
 * learning-side too. It does not enter the bonus. It stays off unless
 * that same gate says the latent target beats the cell loss. `option`
 * is action-side. It does not enter the bonus. The same gate kept it:
 * holding the sampled direction lowered Field probe error on seeds 1–20
 * and on seeds 1–200, and lives did not rise.
 */
export const LOOP_FEATURE_KEYS = [
  "encoder",
  "slowEncoder",
  "encoderMix",
  "wake",
  "latentRho",
  "latentRhoHat",
  "slowRho",
  "slowRhoHat",
  "slowWindow",
  "slowWindow2",
  "slowWindow3",
  "slowSelfWindow",
  "slowSelfWindow2",
  "discard",
  "decode",
  "option",
  "transition",
] as const;

export type LoopFeatureKey = (typeof LOOP_FEATURE_KEYS)[number];

export type LoopFeatures = Record<LoopFeatureKey, boolean>;

/**
 * Shipped set after the 2026-10-15 probe gate (seeds 1–20, Field, held-out
 * probe). Every previously noisy term failed: the paired CI of (off − on)
 * did not lie above zero. encoderMix and wake were exact ties. latentRho
 * and slowRhoHat made probe error worse. The code remains; the defaults
 * are off. `option` was added later and kept on 2026-10-23. See JOURNAL.md.
 */
export const DEFAULT_LOOP_FEATURES: LoopFeatures = {
  encoder: false,
  slowEncoder: false,
  encoderMix: false,
  wake: false,
  latentRho: false,
  latentRhoHat: false,
  slowRho: false,
  slowRhoHat: false,
  slowWindow: false,
  slowWindow2: false,
  slowWindow3: false,
  slowSelfWindow: false,
  slowSelfWindow2: false,
  /**
   * Drop non-scent channels the model is not beating their running mean on.
   * Off is the shipped loss. The probe gate decides whether it stays off.
   */
  discard: false,
  /**
   * Latent training target, decoded back to cells. Off is the cell loss.
   * The probe gate decides whether it stays off.
   */
  decode: false,
  /**
   * Hold the sampled direction for a second tick. Off samples every tick.
   * Kept on: the probe gate, seeds 1–20 and seeds 1–200.
   */
  option: true,
  /** (window, action) → next window, at TRANSITION_LR. Off reconstructs the window already in the input. */
  transition: true,
};

/**
 * Cell-step size used when `transition` is on. 0.035 never leaves the
 * sigmoid prior in 280 steps (probe stays ~0.235). 4 is the pilot rate
 * at which probe error falls through the mean and count separates from
 * random. The ablation gate is the test of that choice.
 */
export const TRANSITION_LR = 4;

export function resolveLoopFeatures(partial?: Partial<LoopFeatures>): LoopFeatures {
  const out: LoopFeatures = { ...DEFAULT_LOOP_FEATURES };
  if (!partial) return out;
  for (const key of LOOP_FEATURE_KEYS) {
    const value = partial[key];
    if (typeof value === "boolean") out[key] = value;
  }
  return out;
}

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
  /** Slow encoder projection. Absent on brains saved before the slow features were learned. */
  slowProj?: number[];
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
  /** Third imagined latent step past a second-window wall. Absent on older brains. */
  slowWindow3?: number;
  /** Self-predicted next step of the slow code. Absent on older brains. */
  slowSelfWindow?: number;
  /** Second self-step past a first self-window wall. Absent on older brains. */
  slowSelfWindow2?: number;
  /** Running per-channel target mean used by `discard`. Absent on older brains. */
  targetMean?: number[];
  /** Running marginal error used by `discard`. Absent on older brains. */
  marginalEma?: number[];
  /** Training steps completed while `discard` was on. Absent on older brains. */
  assimilateSteps?: number;
  /** Target encoder for `decode`. Absent on brains saved before the latent target. */
  decW?: number[];
  /** Target-encoder bias for `decode`. Absent on older brains. */
  decB?: number[];
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
  /**
   * Training updates that stay on the full cell loss before `discard` may
   * drop a channel. The first kernel step does not train, so this is 40
   * gradient steps, and the early probe at step 40 is still unmasked.
   */
  static readonly DISCARD_WARMUP = 40;

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
  /**
   * Steps in the progress baseline. 50 is the shipped EMA (rate 0.02).
   * Confidence keeps `baselineRate`. Only a window other than 50 uses
   * `progressBaseline`, so the shipped update stays the ema line below.
   */
  progressWindow = SHIPPED_PROGRESS_WINDOW;
  /** `ema` is baseline minus current error. `se` subtracts one standard error. */
  progressMode: ProgressMode = "ema";
  /** Baseline used when `progressWindow` is not the shipped 50. */
  progressBaseline = 0.25;
  private surpriseRing: Float64Array | null = null;
  private surpriseFill = 0;
  private surpriseAt = 0;
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
  /** Slow encoder. Stop-grad target; steps only when the slow code is compressing. */
  private slowProj: Float32Array;
  slowEncoderSteps = 0;
  private prevZt: Float32Array | null = null;
  private latentNow: Float32Array;
  private latentIn: Float32Array;
  private latentImagined: Float32Array;
  private latentImagined2: Float32Array;
  private latentImagined3: Float32Array;
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
  /** Last third-step drop that cleared the floor past a second-window wall. */
  slowWindow3 = 0;
  /** Last self-window drop that cleared the floor. */
  slowSelfWindow = 0;
  /** Last second self-step drop that cleared the floor past a first self-window wall. */
  slowSelfWindow2 = 0;
  /** Per-output running mean of the training target. Used only by `discard`. */
  targetMean: Float32Array;
  /** Per-output error of predicting that running mean. Used only by `discard`. */
  marginalEma: Float32Array;
  /** Training steps taken while `discard` is on. The off path leaves this at 0. */
  assimilateSteps = 0;
  /**
   * Share of non-scent outputs dropped on the last training step.
   * Zero during warmup and whenever `discard` is off.
   */
  discardFraction = 0;
  /**
   * Mean squared gap between the hidden code and the stop-grad target on the
   * last training step. Zero whenever `decode` is off.
   */
  decodeResidual = 0;
  /** Target encoder. A copy of `proj` at init, so it draws no Math.random. */
  decW: Float32Array;
  /** Target-encoder bias. Starts at 0. */
  decB: Float32Array;
  private decCode: Float32Array;
  private decIn: Float32Array;
  private decHat: Float32Array;
  private decDz: Float32Array;
  private decGz: Float32Array;
  private slowCode: Float32Array;
  private prevSlow: Float32Array | null = null;
  private slowPred: Float32Array;
  private slowIn: Float32Array;
  private slowImagined: Float32Array;
  private slowImaginedFromBuf: Float32Array;
  private slowBias: Float32Array;
  private slowActionEma: Float32Array;

  /** One-hot width of the action the latent predictor conditions on. */
  readonly acts: number;
  /** Which slow/latent terms learn and which enter the progress bonus. */
  readonly features: LoopFeatures;
  constructor(
    readonly inn: number,
    readonly hidden: number,
    readonly out: number,
    acts = 5,
    features?: Partial<LoopFeatures>,
  ) {
    this.acts = acts;
    this.features = resolveLoopFeatures(features);
    this.net = new MLP(inn, hidden, out);
    const latentH = Math.max(4, hidden >> 2);
    this.latent = new MLP(hidden + acts, latentH, hidden);
    this.lastPred = new Float32Array(out);
    this.lastPred.fill(0.5);
    this.residualEma = new Float32Array(out);
    this.residualEma.fill(0.25);
    this.targetMean = new Float32Array(out);
    this.targetMean.fill(0.5);
    this.marginalEma = new Float32Array(out);
    this.marginalEma.fill(0.25);
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
    this.slowProj = new Float32Array(hidden * hidden);
    for (let i = 0; i < this.hidden; i++) {
      for (let j = 0; j < this.hidden; j++) {
        const idx = i * this.hidden + j;
        this.slowProj[idx] = i === j ? 1 : 0;
      }
    }
    this.latentNow = new Float32Array(hidden);
    this.latentIn = new Float32Array(hidden + acts);
    this.latentImagined = new Float32Array(hidden);
    this.latentImagined2 = new Float32Array(hidden);
    this.latentImagined3 = new Float32Array(hidden);
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
    this.slowImaginedFromBuf = new Float32Array(hidden);
    this.slowBias = new Float32Array(acts * hidden);
    this.slowActionEma = new Float32Array(acts);
    this.slowActionEma.fill(0.25);
    // After every Math.random draw in this constructor. Copying `proj` does
    // not move the stream, so a flag that stays off is the same learner.
    this.decW = new Float32Array(this.proj);
    this.decB = new Float32Array(hidden);
    this.decCode = new Float32Array(hidden);
    this.decIn = new Float32Array(out);
    this.decHat = new Float32Array(out);
    this.decDz = new Float32Array(out);
    this.decGz = new Float32Array(hidden);
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
    if (!this.features.encoder) return;
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

  private projectSlow(code: Float32Array, into: Float32Array) {
    if (!this.features.slowEncoder) {
      for (let i = 0; i < this.hidden; i++) {
        const y = code[i]!;
        into[i] = y < 0 ? 0 : y > 1 ? 1 : y;
      }
      return into;
    }
    const part = participation(code);
    // Residual mix. Identity init stays exact at mix=0. The adaptive mix rises
    // with participation. encoderMix off freezes the pre-adaptive 0.01 mix.
    const mix = this.features.encoderMix
      ? 0.02 + 0.06 * Math.min(1, Math.max(0, (part - 2) / 8))
      : 0.01;
    for (let i = 0; i < this.hidden; i++) {
      let s = 0;
      const row = i * this.hidden;
      for (let j = 0; j < this.hidden; j++) s += this.slowProj[row + j] * code[j]!;
      const mixed = code[i]! + mix * (s - code[i]!);
      into[i] = mixed < 0 ? 0 : mixed > 1 ? 1 : mixed;
    }
    return into;
  }

  /**
   * Stop-grad slow encoder step. The slow predictor's residual does not move
   * the projection. Steps only after slow progress, so noise does not rewrite
   * the features the hierarchy chooses to compress.
   */
  private learnSlowEncoder() {
    if (!this.features.slowEncoder) return;
    if (!this.prevZt || !this.prevSlow) return;
    if (this.slowEma >= 0.2 || this.slowProgress <= 0.01 || this.latentEma >= 0.2) return;
    const x = this.prevZt;
    const lr = Loop.ENC_LR * 0.5;
    for (let i = 0; i < this.hidden; i++) {
      const z = this.prevSlow[i]!;
      const row = i * this.hidden;
      for (let j = 0; j < this.hidden; j++) {
        const w = this.slowProj[row + j]!;
        let next = w * 0.998 + lr * z * (x[j]! - 0.5);
        if (next > 1.5) next = 1.5;
        else if (next < -1.5) next = -1.5;
        this.slowProj[row + j] = next;
      }
    }
    this.slowEncoderSteps += 1;
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
   * One level up: predict the encoded latent code, low-passed, not the cells.
   * The slow encoder invents the features. Trains after the level-1 code is
   * compressing, at a slower rate. A level-1 residual above its ema wakes one
   * step even when that gate is shut, so a surprise downstairs can still move
   * the slower code. The wake does not pay.
   */
  private commitSlow(zt: Float32Array, action: number) {
    const encoded = new Float32Array(this.hidden);
    this.projectSlow(zt, encoded);
    for (let i = 0; i < this.hidden; i++) {
      this.slowCode[i] = 0.85 * this.slowCode[i]! + 0.15 * encoded[i]!;
    }
    if (!this.prevSlow) {
      this.prevSlow = new Float32Array(this.hidden);
      this.prevSlow.set(this.slowCode);
      this.prevZt = new Float32Array(this.hidden);
      this.prevZt.set(zt);
      return;
    }
    const excess = this.latentSurprise - this.latentEma;
    const wake = this.features.wake && excess > Loop.SLOW_WAKE;
    if (this.latentEma >= 0.2 && !wake) {
      this.prevSlow.set(this.slowCode);
      if (this.prevZt) this.prevZt.set(zt);
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
    const openBoost = this.features.wake ? 1 + Math.min(1, Math.max(0, excess) / 0.1) : 1;
    const lr = closed ? Loop.SLOW_LR * 0.5 : Loop.SLOW_LR * openBoost;
    this.slow.train(this.slowIn, target, lr);
    this.slowSteps += 1;
    if (closed) this.slowWakes += 1;
    this.learnSlowEncoder();
    this.prevSlow.set(this.slowCode);
    if (!this.prevZt) this.prevZt = new Float32Array(this.hidden);
    this.prevZt.set(zt);
  }

  imagineSlow(action: number, into: Float32Array = this.slowImagined): Float32Array {
    const src = this.prevSlow ?? this.slowCode;
    this.fillSlowIn(src, action);
    this.slow.forward(this.slowIn, into);
    return this.applySlowBias(into, action);
  }

  /** Predict the next slow code from an arbitrary source code under `action`. */
  imagineSlowFrom(src: Float32Array, action: number, into: Float32Array = this.slowImaginedFromBuf): Float32Array {
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

  /**
   * Third latent window: one more imagined step under the same residual
   * constraint. Builds from the best second step. The third follow-up must
   * lower the level-1 residual relative to that second action, so it cannot
   * pick a code the latent loop would refuse. Pays the incremental drop from
   * the second code to the third. A collapsed third code does not pay. Stays
   * shut until slowEma < 0.12. This does not write slow progress.
   */
  slowWindow3RhoHat(action: number): number {
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
    const firstLevel1 = this.actionLatentEma[a]!;
    let best2 = 0;
    let best2Action = -1;
    let best2Step: Float32Array | null = null;
    let best2Z: Float32Array | null = null;
    let best2Level1 = Infinity;
    let best2Res = first.res;
    for (let b = 0; b < this.acts; b++) {
      if (this.actionLatentEma[b]! >= firstLevel1 - 0.001) continue;
      const z2 = this.imagineLatentFrom(this.latentStep, b, this.latentImagined2);
      const step2 = new Float32Array(this.hidden);
      for (let i = 0; i < this.hidden; i++) step2[i] = 0.85 * step1[i]! + 0.15 * z2[i]!;
      const second = this.slowStepResidual(pred, step2);
      if (second.varS < 0.004) continue;
      const drop2 = first.res - second.res;
      if (drop2 > best2) {
        best2 = drop2;
        best2Action = b;
        best2Step = step2;
        best2Z = z2.slice();
        best2Level1 = this.actionLatentEma[b]!;
        best2Res = second.res;
      }
    }
    if (best2Action < 0 || !best2Step || !best2Z) return 0;
    let best = 0;
    for (let c = 0; c < this.acts; c++) {
      if (this.actionLatentEma[c]! >= best2Level1 - 0.001) continue;
      const z3 = this.imagineLatentFrom(best2Z, c, this.latentImagined3);
      const step3 = new Float32Array(this.hidden);
      for (let i = 0; i < this.hidden; i++) step3[i] = 0.85 * best2Step[i]! + 0.15 * z3[i]!;
      const third = this.slowStepResidual(pred, step3);
      if (third.varS < 0.004) continue;
      const drop = best2Res - third.res;
      if (drop > best) best = drop;
    }
    if (best <= 0.001) return 0;
    this.slowWindow3 = best;
    return best;
  }

  /**
   * Self window: the slow code predicts its own next step under this move,
   * without a latent-imagined code. ρ̂ is the drop from the residual of the
   * current code to the residual of that self-predicted next code, under a
   * further slow prediction. Zero until both codes are compressing. A collapsed
   * self-code does not pay. This does not write slow progress.
   */
  slowSelfWindowRhoHat(action: number): number {
    if (this.latentEma >= 0.2 || this.slowEma >= 0.2 || !this.prevSlow) return 0;
    const a = Math.max(0, Math.min(this.acts - 1, action | 0));
    const pred = this.imagineSlow(a);
    const held = this.slowStepResidual(pred, this.slowCode);
    const nextPred = this.imagineSlowFrom(pred, a);
    const nxt = this.slowStepResidual(nextPred, pred);
    if (nxt.varS < 0.004) return 0;
    const drop = held.res - nxt.res;
    if (drop <= 0.001) return 0;
    this.slowSelfWindow = drop;
    return drop;
  }

  /**
   * Second self window: one more self-step past a wall the first self-prediction
   * treats as a wall. From the first predicted code, imagines a follow-up action
   * whose own self-next drops the residual further. Pays only when the first
   * self-window refused. Stays shut until slowEma < 0.12. A collapsed follow-up
   * does not pay. This does not write slow progress.
   */
  slowSelfWindow2RhoHat(action: number): number {
    if (this.latentEma >= 0.2 || this.slowEma >= Loop.SLOW_WINDOW2_EMA || !this.prevSlow) return 0;
    const a = Math.max(0, Math.min(this.acts - 1, action | 0));
    const pred = this.imagineSlow(a);
    const held = this.slowStepResidual(pred, this.slowCode);
    const nextPred = this.imagineSlowFrom(pred, a);
    const first = this.slowStepResidual(nextPred, pred);
    if (first.varS >= 0.004 && held.res - first.res > 0.001) return 0;
    let best = 0;
    for (let b = 0; b < this.acts; b++) {
      if (b === a) continue;
      const furtherPred = this.imagineSlowFrom(pred, b);
      const furtherNext = this.imagineSlowFrom(furtherPred, b);
      const sec = this.slowStepResidual(furtherNext, furtherPred);
      if (sec.varS < 0.004) continue;
      const drop = held.res - sec.res;
      if (drop > best) best = drop;
    }
    if (best <= 0.001) return 0;
    this.slowSelfWindow2 = best;
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
    if (this.progressMode === "se") this.progress = this.seProgress(this.surprise);
    else if (this.progressWindow === SHIPPED_PROGRESS_WINDOW) this.progress = this.ema - this.surprise;
    else this.progress = this.progressBaseline - this.surprise;
    this.progressEma = 0.95 * this.progressEma + 0.05 * this.progress;
    if (this.progress > 0) this.compression += this.progress;
    const a = this.baselineRate;
    this.ema = (1 - a) * this.ema + a * this.surprise;
    if (this.progressMode === "ema" && this.progressWindow !== SHIPPED_PROGRESS_WINDOW) {
      const p = 1 / this.progressWindow;
      this.progressBaseline = (1 - p) * this.progressBaseline + p * this.surprise;
    }
    this.commitment = 1 - (commitDen ? (commitMass / commitDen) * 4 : 1);
    this.trackScent(target);
    this.project(target, this.latentNow);
    this.noteEncObs(target);

    if (this.features.discard) this.noteMarginal(target);
    const trainTarget = this.cellTrainTarget(target);
    if (this.features.discard) this.assimilateSteps += 1;
    if (this.features.decode) this.trainDecode(this.prevInput, trainTarget, lr);
    else this.net.train(this.prevInput, trainTarget, lr);
    this.participation = participation(encoded);
    this.commitHidden(this.latentNow);
  }

  /**
   * Marginal of each non-scent channel. The mean is the value before this
   * target is folded in, so the error is what a constant predictor would
   * have paid. Rate 0.1 matches `residualEma`. Family 2 is not tracked.
   */
  private noteMarginal(target: Float32Array) {
    const fam = this.families();
    const n = Math.min(target.length, this.out);
    for (let i = 0; i < n; i++) {
      if (fam === 3 && i % 3 === 2) continue;
      const mean = this.targetMean[i]!;
      const d = target[i]! - mean;
      this.marginalEma[i] = 0.9 * this.marginalEma[i]! + 0.1 * d * d;
      this.targetMean[i] = 0.9 * mean + 0.1 * target[i]!;
    }
  }

  /**
   * Cell-net target. Family 2 is always the prediction, so scent never
   * trains the plan. When `discard` is on and 40 training steps are done,
   * a non-scent channel whose model residual is not strictly below its
   * marginal error is copied from the prediction too. That is a zero
   * gradient. The comparison reads the EMAs after this step's update.
   */
  cellTrainTarget(target: Float32Array): Float32Array {
    const trainTarget = target.slice();
    const fam = this.families();
    const n = Math.min(target.length, this.out);
    if (fam === 3) {
      for (let i = 2; i < n; i += 3) trainTarget[i] = this.lastPred[i]!;
    }
    if (!this.features.discard) return trainTarget;
    let masked = 0;
    let scored = 0;
    const drop = this.assimilateSteps >= Loop.DISCARD_WARMUP;
    for (let i = 0; i < n; i++) {
      if (fam === 3 && i % 3 === 2) continue;
      scored += 1;
      if (drop && this.residualEma[i]! >= this.marginalEma[i]!) {
        trainTarget[i] = this.lastPred[i]!;
        masked += 1;
      }
    }
    this.discardFraction = scored ? masked / scored : 0;
    return trainTarget;
  }

  /** Same ±1.5 clip as the curiosity encoder. A step cannot run away. */
  private clipDecode(v: number) {
    if (v > 1.5) return 1.5;
    if (v < -1.5) return -1.5;
    return v;
  }

  /** z = tanh(E x + b). `src` is the cell target with family 2 already zeroed. */
  private writeDecodeCode(src: Float32Array, into: Float32Array) {
    const n = Math.min(src.length, this.out);
    for (let i = 0; i < this.hidden; i++) {
      let s = this.decB[i]!;
      const row = i * this.out;
      for (let j = 0; j < n; j++) s += this.decW[row + j]! * src[j]!;
      into[i] = Math.tanh(s);
    }
    return into;
  }

  /**
   * Latent target for the transition. Three updates, each reading the
   * weights from before the step. The predictor matches the hidden to a
   * detached code. The readout decodes that hidden to cells. The encoder
   * is trained so the current readout can decode the code, and it does not
   * see the predictor's hidden. Family 2 is not a feature of the code and
   * takes no encoder gradient. Surprise was already scored on the real cells.
   */
  private trainDecode(x: Float32Array, trainTarget: Float32Array, lr: number) {
    const src = this.decIn;
    const n = Math.min(trainTarget.length, this.out);
    src.fill(0);
    for (let j = 0; j < n; j++) src[j] = trainTarget[j]!;
    if (this.families() === 3) {
      for (let i = 2; i < n; i += 3) src[i] = 0;
    }
    this.writeDecodeCode(src, this.decCode);
    this.decodeResidual = this.net.matchHidden(x, this.decCode, lr);
    this.learnDecodeEncoder(src, trainTarget, lr);
    this.net.decodeReadout(trainTarget, lr);
  }

  /**
   * Reconstruction of the cell target through the current readout.
   * W2 and b2 are stop-grad. Family 2's error is zero, matching the plan.
   * Only the encoder moves, and each weight is clipped to ±1.5.
   */
  private learnDecodeEncoder(src: Float32Array, target: Float32Array, lr: number) {
    const h = this.hidden;
    const nOut = this.out;
    const z = this.decCode;
    const y = this.decHat;
    const gz = this.decGz;
    const dz2 = this.decDz;
    const w2 = this.net.w2;
    const b2 = this.net.b2;
    const n = Math.min(src.length, nOut);
    for (let i = 0; i < h; i++) {
      let s = this.decB[i]!;
      const row = i * nOut;
      for (let j = 0; j < n; j++) s += this.decW[row + j]! * src[j]!;
      z[i] = Math.tanh(s);
    }
    const scale = 2 / nOut;
    const fam = this.families();
    for (let k = 0; k < nOut; k++) {
      let s = b2[k]!;
      const row = k * h;
      for (let i = 0; i < h; i++) s += w2[row + i]! * z[i]!;
      const clipped = s < -12 ? -12 : s > 12 ? 12 : s;
      const yk = 1 / (1 + Math.exp(-clipped));
      y[k] = yk;
      const skip = fam === 3 && k % 3 === 2;
      const err = skip ? 0 : (yk - (target[k] ?? 0)) * scale;
      dz2[k] = err * yk * (1 - yk);
    }
    for (let i = 0; i < h; i++) {
      let g = 0;
      for (let k = 0; k < nOut; k++) g += w2[k * h + i]! * dz2[k]!;
      const zi = z[i]!;
      gz[i] = g * (1 - zi * zi);
    }
    for (let i = 0; i < h; i++) {
      const g = gz[i]!;
      const row = i * nOut;
      for (let j = 0; j < n; j++) {
        this.decW[row + j] = this.clipDecode(this.decW[row + j]! - lr * g * src[j]!);
      }
      this.decB[i] = this.clipDecode(this.decB[i]! - lr * g);
    }
  }

  /**
   * Held-out progress. Older W errors versus the latest W, minus one
   * standard error. Zero until both halves are full, so an empty buffer
   * does not pay.
   */
  private seProgress(surprise: number): number {
    const w = Math.max(2, Math.round(this.progressWindow));
    const cap = w * 2;
    if (!this.surpriseRing || this.surpriseRing.length !== cap) {
      this.surpriseRing = new Float64Array(cap);
      this.surpriseFill = 0;
      this.surpriseAt = 0;
    }
    const ring = this.surpriseRing;
    ring[this.surpriseAt] = surprise;
    this.surpriseAt = (this.surpriseAt + 1) % cap;
    this.surpriseFill = Math.min(cap, this.surpriseFill + 1);
    if (this.surpriseFill < cap) return 0;
    return heldOutProgressRing(ring, this.surpriseAt, w);
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
      slowProj: Array.from(this.slowProj),
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
      slowWindow3: this.slowWindow3,
      slowSelfWindow: this.slowSelfWindow,
      slowSelfWindow2: this.slowSelfWindow2,
      targetMean: Array.from(this.targetMean),
      marginalEma: Array.from(this.marginalEma),
      assimilateSteps: this.assimilateSteps,
      decW: Array.from(this.decW),
      decB: Array.from(this.decB),
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
    if (w.slowProj && w.slowProj.length === this.slowProj.length) this.slowProj.set(w.slowProj);
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
    this.slowWindow3 = w.slowWindow3 ?? 0;
    this.slowSelfWindow = w.slowSelfWindow ?? 0;
    this.slowSelfWindow2 = w.slowSelfWindow2 ?? 0;
    if (w.targetMean && w.targetMean.length === this.targetMean.length) this.targetMean.set(w.targetMean);
    if (w.marginalEma && w.marginalEma.length === this.marginalEma.length) this.marginalEma.set(w.marginalEma);
    this.assimilateSteps = w.assimilateSteps ?? 0;
    if (w.decW && w.decW.length === this.decW.length) this.decW.set(w.decW);
    if (w.decB && w.decB.length === this.decB.length) this.decB.set(w.decB);
    return true;
  }
}

export { mse };
