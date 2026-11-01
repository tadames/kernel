import { Loop, TRANSITION_LR, resolveLoopFeatures, type LoopFeatures } from "./loop.ts";
import "./scent-rho-hat.ts";
import { emptyRhoHatParts, emptyScoreParts, imagineScores, softmaxSample, type RhoHatParts, type ScoreParts } from "./policy.ts";
import { branching, edgeIndex, entropyNorm } from "./complexity.ts";
import {
  generateWorld,
  mulberry32,
  randomEmpty,
  type WorldKind,
} from "./presets.ts";
import { applyDrift, DEFAULT_ENV_PARAMS, senseGrid, stepGrid, type EnvParams, type EnvSpec, type GlowGain, type GridBody } from "./env.ts";
import { SHIPPED_PROGRESS_WINDOW, type ProgressMode } from "./progress.ts";
import {
  cloneFamily,
  createFamily,
  EAST_HOLD_LATENT,
  isFamilyKind,
  paintFamilyPattern,
  regionCells,
  type FamilyMemory,
} from "./family.ts";
import {
  RndCuriosity,
  signalActionBonus,
  signalProgressEma,
  type CuriositySignal,
  type SignalView,
} from "./signals.ts";

export const SIZE = 15;
export const R = 2;
export const VIEW = R * 2 + 1;
export const CH = 3;
export const OBS = VIEW * VIEW * CH;
export const ACTS = 5;
export const IN = OBS + ACTS + 1;
export const HIDDEN = 32;
export const OUT = OBS;
export const CENTER = (R * VIEW + R) * CH;

export const DIRS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: 0 },
] as const;
export const DIR_NAMES = ["north", "east", "south", "west", "wait"] as const;

/**
 * Ticks a sampled direction is executed before the policy samples again.
 * 2 is the locked option: the commitment tick plus one held tick.
 * The probe gate is the test of that choice. It is not a searched length.
 */
export const OPTION_SPAN = 2;

const HISTORY = 140;

export type Params = {
  lr: number;
  curiosity: number;
  goal: number;
  temperature: number;
};

export type KernelOptions = {
  /** Which intrinsic term scores actions. Default is compression progress. */
  signal?: CuriositySignal;
  /**
   * When set, the map is generated from this seed instead of the episode seed.
   * Episode seed still inits weights and the policy RNG.
   */
  layoutSeed?: number;
  /** Fixed environment, including reserved drift parameters. */
  env?: EnvSpec;
  /**
   * Multiplicative weight decay applied to the cell net after each update.
   * 0 keeps the weights. This is the forgetting-rate knob.
   */
  forgettingRate?: number;
  /**
   * Freeze one learnable pattern in the east room. Used to measure the
   * adaptation timescale. The phase sweep leaves this off, so drift 0 stays
   * stationary white noise.
   */
  patternHold?: boolean;
  /**
   * Progress-baseline window in steps. 50 is the shipped EMA.
   * Confidence stays on baselineRate. Only the progress difference moves.
   */
  progressWindow?: number;
  /** `se` replaces the progress difference with a held-out split minus one standard error. */
  progressMode?: ProgressMode;
  /**
   * Measurement-only cuts in the curiosity score. Omitted means the shipped
   * score: uncertainty on, and the horizon residual drop on for rho.
   * Not a Loop feature flag. The default agent does not change.
   */
  curiosityScore?: {
    /** Bernoulli expected residual in the explore mix. Default on. */
    uncertainty?: boolean;
    /** Imagined residual drop across later windows. Default on. */
    horizonDrop?: boolean;
  };
  /**
   * Measurement-only place bonus. Added to the progress channel of actions
   * whose destination lies in `region`. Omitted is the shipped policy.
   * Not a Loop feature flag. The default agent does not change.
   */
  intrinsicBoost?: {
    add: number;
    region: 0 | 1;
  };
  /**
   * Softmax temperature. Omitted is 0.45, the shipped policy.
   * Not a Loop feature flag. The default agent does not change.
   * The sampler clamps at 0.05, so a value under that floor is rejected.
   */
  policyTemperature?: number;
  /**
   * Measurement-only square wave on the progress channel. On for one half
   * of each period, off for the other, and only for actions that land in
   * `region`. `offset` 0 is the first half, the same clock as before.
   * A positive offset delays the on-half. Omitted is the shipped policy.
   * Not a Loop feature flag.
   */
  periodicBoost?: {
    add: number;
    region: 0 | 1;
    period: number;
    /** Steps to delay the on-half. Omitted is 0, the first half of the period. */
    offset?: number;
  };
  /**
   * Measurement-only split of the action scores. Omitted does not allocate
   * the buffers and does not pass them into imagination. Not a Loop feature
   * flag. The default agent does not change. The split does not draw a
   * random number and does not enter the bonus.
   */
  traceScores?: boolean;
  /**
   * Measurement-only split of ρ̂ into the bonus slot and the two horizon
   * drops. Omitted does not allocate the buffers and does not pass them
   * into imagination. Not a Loop feature flag. The default agent does not
   * change. The split does not draw a random number and does not enter the
   * bonus.
   */
  traceRho?: boolean;
};

/**
 * True during the on-half of each period. Offset 0 is the first half,
 * including step 0. The on-half is `floor(period / 2)` steps long.
 */
export function periodicBoostOn(age: number, period: number, offset = 0) {
  const half = Math.floor(period / 2);
  if (half < 1) return false;
  const cycle = half * 2;
  let shifted = age - offset;
  shifted = ((shifted % cycle) + cycle) % cycle;
  return Math.floor(shifted / half) % 2 === 0;
}

export type Thought = { t: number; text: string };

export type Snapshot = {
  size: number;
  cells: Uint8Array;
  scent: Float32Array;
  ax: number;
  ay: number;
  facing: number;
  energy: number;
  age: number;
  foods: number;
  lives: number;
  surprise: number;
  ema: number;
  progress: number;
  compression: number;
  weightEnergy: number;
  obs: Float32Array;
  pred: Float32Array;
  scores: Float32Array;
  imagined: Float32Array[];
  history: number[];
  thought: string;
  thoughts: Thought[];
  lastAction: number;
  worldKind: WorldKind;
  participation: number;
  policyEntropy: number;
  branching: number;
  edge: number;
  commitment: number;
};

export class Kernel {
  worldKind: WorldKind = "field";
  seed: number;
  /** Resolved loop flags. resetBrain keeps this set. */
  readonly features: LoopFeatures;
  /** Curiosity baseline. `rho` is the historical compression signal. */
  readonly signal: CuriositySignal;
  /** Reserved environment parameters. Drift rate 0 on a static map does not move. */
  readonly envParams: EnvParams;
  /** Cell-net weight decay per step. 0 on Field and Rooms. */
  readonly forgettingRate: number;
  /** East-room state. Null on Field, Rooms, and the other static maps. */
  family: FamilyMemory | null = null;
  private readonly patternHold: boolean;
  private readonly fixedLayout: number | null;
  readonly progressWindow: number;
  readonly progressMode: ProgressMode;
  /** Shipped score keeps both. The noise study turns them off per arm. */
  readonly scoreUncertainty: boolean;
  readonly scoreHorizonDrop: boolean;
  /** Place bonus on the progress channel. Null is the shipped policy. */
  readonly intrinsicBoost: { add: number; region: 0 | 1 } | null;
  /** Square-wave place bonus. Null is the shipped policy. */
  readonly periodicBoost: { add: number; region: 0 | 1; period: number; offset: number } | null;
  /**
   * Additive split of the last sampled scores. Null unless `traceScores`.
   * A held tick does not refresh it.
   */
  readonly scoreParts: ScoreParts | null;
  /**
   * Split of the last sampled ρ̂. Null unless `traceRho`. A held tick does
   * not refresh it. The default agent does not allocate it.
   */
  readonly rhoHatParts: RhoHatParts | null;
  /** Visit counts for the count-based baseline. Not used by rho. */
  readonly visitCounts: Uint32Array;
  /** RND target and predictor. The target stays fixed for the episode. */
  rnd: RndCuriosity;
  cells: Uint8Array;
  scent: Float32Array;
  loop: Loop;
  x = 1;
  y = 1;
  energy = 100;
  age = 0;
  foods = 0;
  lives = 0;
  history: number[] = [];
  lastAction = 4;
  /** Ticks remaining in the current option, after the commitment tick. Zero when `option` is off. */
  private optionLeft = 0;
  /** Direction committed by the last sample. Unused when `option` is off. */
  private heldAction = 4;
  /**
   * Steps that repeated a committed direction instead of sampling.
   * Stays 0 when `option` is off, so the off path can be checked against it.
   */
  optionHeld = 0;
  /** Horizon-2 follow-up per first action. Written only when `rollout` is on. */
  private followBuf = new Int32Array(ACTS);
  /** True after a commitment whose imagination wrote `followBuf`. */
  private followReady = false;
  /** Action stored for the option's second tick. The primitive when `rollout` is off. */
  private rolloutAction = 4;
  /**
   * Follow-up from the last commitment. Stays at wait when `rollout` is off,
   * so the off path can be checked against it.
   */
  rolloutFollow = 4;
  /**
   * Second ticks that executed a follow-up different from the committed primitive.
   * Stays 0 when `rollout` is off.
   */
  rolloutSwitched = 0;
  lastObs: Float32Array = new Float32Array(OBS);
  scores: Float32Array = new Float32Array(ACTS);
  policyEntropy = 1;
  branching = ACTS;
  edge = 0;
  /** Steps of elevated lr after loadBrain (distribution-shift adaptation). */
  burnIn = 0;
  /** Fast per-channel observation mean. Used only while burnIn > 0 to
   *  subtract density bias (walls/food) so Field→Rooms is not pure surprise. */
  obsMean = new Float32Array(CH);
  imagined: Float32Array[] = Array.from({ length: ACTS }, () => new Float32Array(OBS));
  imagined2: Float32Array[] = Array.from({ length: ACTS }, () => new Float32Array(OBS));
  imagined3: Float32Array[] = Array.from({ length: ACTS }, () => new Float32Array(OBS));
  thoughts: Thought[] = [];
  thought = "I begin with no model of this place.";
  params: Params = { lr: 0.035, curiosity: 1, goal: 1, temperature: 0.45 };
  private pulseClock = 0;
  private thinkCooldown = 0;
  private rand: () => number;

  constructor(kind: WorldKind = "field", seed = 1, features?: Partial<LoopFeatures>, options?: KernelOptions) {
    this.seed = seed;
    this.features = resolveLoopFeatures(features);
    this.signal = options?.signal ?? "rho";
    this.envParams = options?.env?.params ?? { ...DEFAULT_ENV_PARAMS };
    this.forgettingRate = options?.forgettingRate ?? 0;
    this.patternHold = options?.patternHold ?? false;
    this.fixedLayout = options?.env ? options.env.layoutSeed : (options?.layoutSeed ?? null);
    if (options?.progressWindow != null && !(options.progressWindow > 0)) {
      throw new Error("progressWindow must be positive");
    }
    this.progressWindow = options?.progressWindow ?? SHIPPED_PROGRESS_WINDOW;
    this.progressMode = options?.progressMode ?? "ema";
    this.scoreUncertainty = options?.curiosityScore?.uncertainty !== false;
    this.scoreHorizonDrop = options?.curiosityScore?.horizonDrop !== false;
    const boost = options?.intrinsicBoost;
    if (boost && !(boost.add === 0 || Number.isFinite(boost.add))) {
      throw new Error("intrinsicBoost.add must be finite");
    }
    this.intrinsicBoost = boost && boost.add !== 0 ? { add: boost.add, region: boost.region } : null;
    const wave = options?.periodicBoost;
    if (wave) {
      if (!(Number.isFinite(wave.add) && wave.add !== 0)) throw new Error("periodicBoost.add must be a non-zero finite number");
      if (wave.region !== 0 && wave.region !== 1) throw new Error("periodicBoost.region must be 0 or 1");
      if (!Number.isInteger(wave.period) || wave.period < 2) throw new Error("periodicBoost.period must be an integer of at least 2");
      if (wave.offset != null && !Number.isInteger(wave.offset)) throw new Error("periodicBoost.offset must be an integer");
    }
    this.periodicBoost = wave
      ? { add: wave.add, region: wave.region, period: wave.period, offset: wave.offset ?? 0 }
      : null;
    this.scoreParts = options?.traceScores ? emptyScoreParts(ACTS) : null;
    this.rhoHatParts = options?.traceRho ? emptyRhoHatParts(ACTS) : null;
    if (options?.policyTemperature != null && !(Number.isFinite(options.policyTemperature) && options.policyTemperature >= 0.05)) {
      throw new Error("policyTemperature must be finite and at least 0.05");
    }
    if (options?.env) kind = options.env.kind;
    this.rand = mulberry32(seed);
    this.loop = new Loop(IN, HIDDEN, OUT, ACTS, this.features);
    if (this.features.transition) this.params = { ...this.params, lr: TRANSITION_LR };
    if (options?.policyTemperature != null) {
      this.params = { ...this.params, temperature: options.policyTemperature };
    }
    this.cells = new Uint8Array(SIZE * SIZE);
    this.scent = new Float32Array(SIZE * SIZE);
    this.visitCounts = new Uint32Array(SIZE * SIZE);
    this.rnd = new RndCuriosity(seed ^ 0x51ed, OBS);
    this.setWorld(kind, seed);
    this.applyProgress();
  }

  /** Re-apply after the loop is rebuilt. Confidence rate stays 0.02. */
  private applyProgress() {
    this.loop.progressWindow = this.progressWindow;
    this.loop.progressMode = this.progressMode;
    this.loop.progressBaseline = this.loop.ema;
  }

  private glowGain(): GlowGain | null {
    const amplitude = this.envParams.noiseAmplitude ?? 1;
    if (!this.family || amplitude === 1) return null;
    return { region: this.family.region, amplitude };
  }

  rebuildWorld(kind: WorldKind = this.worldKind, seed = this.seed) {
    this.setWorld(kind, seed);
  }

  setWorld(kind: WorldKind, seed = this.seed) {
    this.worldKind = kind;
    this.seed = seed;
    this.rand = mulberry32(seed);
    const layout = this.fixedLayout ?? seed;
    if (isFamilyKind(kind)) {
      const built = createFamily(kind, SIZE, layout, this.envParams, this.patternHold);
      this.cells = built.cells;
      this.family = built.family;
    } else {
      this.cells = generateWorld(kind, SIZE, layout);
      this.family = null;
    }
    this.scent.fill(0);
    this.visitCounts.fill(0);
    this.rnd = new RndCuriosity(seed ^ 0x51ed, OBS);
    this.placeAgent();
    this.loop.commit(this.encode(this.sense()));
    // The first real pair is (window, chosen action) → the window after the move.
    // A commit of the spawn frame would train the net to copy that frame.
    if (this.features.transition) this.loop.prevInput = null;
    this.age = 0;
    this.foods = 0;
    this.lives = 0;
    this.history = [];
    this.energy = 100;
    this.pulseClock = 0;
    this.thought = "I begin with no model of this place.";
    this.thoughts = [];
    this.thinkCooldown = 0;
    this.burnIn = 0;
    this.obsMean.fill(0);
    this.optionLeft = 0;
    this.heldAction = 4;
    this.optionHeld = 0;
    this.followReady = false;
    this.rolloutAction = 4;
    this.rolloutFollow = 4;
    this.rolloutSwitched = 0;
  }

  private placeAgent() {
    if (this.family && this.family.mode !== "split") {
      const pool = regionCells(this.family, 0, this.cells).filter((i) => this.cells[i] === 0);
      if (pool.length) {
        const i = pool[(this.rand() * pool.length) | 0]!;
        this.x = i % SIZE;
        this.y = (i / SIZE) | 0;
        return;
      }
    }
    const p = randomEmpty(this.cells, SIZE, this.rand);
    this.x = p.x;
    this.y = p.y;
  }

  regionAt(x = this.x, y = this.y) {
    if (!this.family) return 0;
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return 2;
    return this.family.region[y * SIZE + x] ?? 2;
  }

  /** Constant place bonus plus the on-half of a square wave. Both default to zero. */
  private progressExtra(dest: (action: number) => number, action: number) {
    let extra = 0;
    const cell = dest(action);
    const x = cell % SIZE;
    const y = (cell / SIZE) | 0;
    const region = this.regionAt(x, y);
    const boost = this.intrinsicBoost;
    if (boost && region === boost.region) extra += boost.add;
    const wave = this.periodicBoost;
    if (wave && region === wave.region && periodicBoostOn(this.age, wave.period, wave.offset)) extra += wave.add;
    return extra;
  }

  /** True wall and true food for one action. Glow is not either. */
  private bodyAt(action: number) {
    if (action === 4) {
      const i = this.y * SIZE + this.x;
      return { wall: 0, food: this.cells[i] === 2 ? 1 : 0 };
    }
    const nx = this.x + DIRS[action].x;
    const ny = this.y + DIRS[action].y;
    if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) return { wall: 1, food: 0 };
    const cell = this.cells[ny * SIZE + nx];
    return { wall: cell === 1 ? 1 : 0, food: cell === 2 ? 1 : 0 };
  }

  /**
   * Train one transition pair at a fixed energy, the same pair the probe asks
   * for: (window, action) → next window. Used by the adaptation measurement.
   */
  trainPair(obs: Float32Array, action: number, nextObs: Float32Array, lr: number) {
    this.loop.commit(this.encode(obs, action, false, 100));
    this.loop.assimilate(nextObs, lr);
  }

  /**
   * Mean squared error of the current weights on `samples` states inside a
   * region. Each sample is simulated on a copy, so the episode does not move.
   * Wall and food channels only, matching the frozen probe.
   */
  liveProbeError(region: 0 | 1, samples = 48, probeSeed = 20261015) {
    if (!this.family) return this.frozenProbeError({ transitions: [] });
    const pool = regionCells(this.family, region, this.cells);
    if (!pool.length) return 0;
    const rand = mulberry32(probeSeed + region * 17 + this.age);
    const into = new Float32Array(OBS);
    const obs = new Float32Array(OBS);
    let sum = 0;
    let n = 0;
    for (let s = 0; s < samples; s++) {
      const index = pool[(rand() * pool.length) | 0]!;
      const x = index % SIZE;
      const y = (index / SIZE) | 0;
      const action = (rand() * ACTS) | 0;
      senseGrid(this.cells, this.scent, x, y, SIZE, R, obs, this.family.glow, this.glowGain(), this.family.decoy);
      this.loop.imagine(this.encode(obs, action, false, 100), into);
      const body: GridBody = {
        cells: this.cells.slice(),
        scent: this.scent.slice(),
        x,
        y,
        energy: 100,
        pulseClock: 0,
      };
      const family = cloneFamily(this.family);
      const stepRand = mulberry32((probeSeed + s * 997 + region * 13) >>> 0);
      stepGrid(body, this.worldKind, action, SIZE, stepRand, this.envParams, family);
      const next = new Float32Array(OBS);
      senseGrid(body.cells, body.scent, body.x, body.y, SIZE, R, next, family.glow, this.glowGain(), family.decoy);
      for (let i = 0; i < OBS; i++) {
        if (i % CH === 2) continue;
        const d = into[i]! - next[i]!;
        sum += d * d;
        n += 1;
      }
    }
    return n ? sum / n : 0;
  }

  /**
   * Held-out probe of region 1 with scent blanked and drift forced off.
   * `initial` scores the shared starting pattern. `current` scores the
   * latent on the map now. Forward only. The episode does not move.
   */
  patternProbe(which: "initial" | "current", samples = 40, probeSeed = 20261015): number {
    if (!this.family) return 0;
    const base = cloneFamily(this.family);
    const latent = which === "initial" ? EAST_HOLD_LATENT : this.family.eastLatent;
    base.mode = "hold";
    base.burnDrift = false;
    base.freezeTarget = false;
    paintFamilyPattern(this.cells, base, latent);
    const pool = regionCells(base, 1, this.cells);
    if (!pool.length) return 0;
    const params = { ...this.envParams, driftRate: 0, distractorRelevance: 0 };
    const rand = mulberry32(probeSeed + 17 + this.age);
    const into = new Float32Array(OBS);
    const obs = new Float32Array(OBS);
    let sum = 0;
    let n = 0;
    for (let s = 0; s < samples; s++) {
      const index = pool[(rand() * pool.length) | 0]!;
      const x = index % SIZE;
      const y = (index / SIZE) | 0;
      const action = (rand() * ACTS) | 0;
      const blank = new Float32Array(this.scent.length);
      senseGrid(this.cells, blank, x, y, SIZE, R, obs, base.glow, null, base.decoy);
      this.loop.imagine(this.encode(obs, action, false, 100), into);
      const body: GridBody = {
        cells: this.cells.slice(),
        scent: blank.slice(),
        x,
        y,
        energy: 100,
        pulseClock: 0,
      };
      const family = cloneFamily(base);
      const stepRand = mulberry32((probeSeed + s * 997 + 13) >>> 0);
      stepGrid(body, this.worldKind, action, SIZE, stepRand, params, family);
      const next = new Float32Array(OBS);
      senseGrid(body.cells, body.scent, body.x, body.y, SIZE, R, next, family.glow, null, family.decoy);
      for (let i = 0; i < OBS; i++) {
        if (i % CH === 2) continue;
        const d = into[i]! - next[i]!;
        sum += d * d;
        n += 1;
      }
    }
    return n ? sum / n : 0;
  }

  resetBrain() {
    this.loop = new Loop(IN, HIDDEN, OUT, ACTS, this.features);
    if (this.features.transition) this.params = { ...this.params, lr: TRANSITION_LR };
    this.loop.commit(this.encode(this.sense()));
    if (this.features.transition) this.loop.prevInput = null;
    this.history = [];
    this.thoughts = [];
    this.thinkCooldown = 0;
    this.thought = "The model is new. I know nothing yet.";
    this.energy = 100;
    this.policyEntropy = 1;
    this.branching = ACTS;
    this.edge = 0;
    this.burnIn = 0;
    this.obsMean.fill(0);
    this.loop.baselineRate = 0.02;
    this.applyProgress();
    this.visitCounts.fill(0);
    this.rnd = new RndCuriosity(this.seed ^ 0x51ed, OBS);
    this.optionLeft = 0;
    this.heldAction = 4;
    this.optionHeld = 0;
    this.followReady = false;
    this.rolloutAction = 4;
    this.rolloutFollow = 4;
    this.rolloutSwitched = 0;
  }

  get ema() {
    return this.loop.ema;
  }
  get surprise() {
    return this.loop.surprise;
  }
  get progress() {
    return this.loop.progress;
  }

  /** Persist compressor + learning state for resume / inspect. Body and world stay. */
  saveBrain() {
    return this.loop.exportBrain();
  }

  /** Resume a saved mind. Returns false on dimension mismatch.
   *  Starts a re-burn-in (elevated lr + hotter policy temperature) so observation-shift
   *  can be absorbed without treating a trained compressor as a newborn forever.
   */
  loadBrain(w: Parameters<Loop["importBrain"]>[0]): boolean {
    const ok = this.loop.importBrain(w);
    if (ok) {
      this.burnIn = 36;
      this.obsMean.fill(0);
      // Fast skip adaptation: density shift is the latent's job, not the MLP's.
      this.loop.baselineRate = 0.12;
    }
    return ok;
  }

  /**
   * During burn-in, adapt a fast per-channel mean and soft-subtract a fading
   * fraction of that mean from the observation fed to assimilate/choose.
   * Spatial structure stays; global density (Field walls vs Rooms) is less
   * of a surprise tax on a loaded mind.
   */
  private adaptObs(raw: Float32Array): Float32Array {
    if (this.burnIn <= 0) return raw;
    const n = OBS / CH;
    const acc = [0, 0, 0];
    for (let i = 0; i < OBS; i++) acc[i % CH] += raw[i];
    for (let c = 0; c < CH; c++) {
      const m = acc[c] / n;
      this.obsMean[c] = 0.82 * this.obsMean[c] + 0.18 * m;
    }
    const fade = this.burnIn / 36;
    const gain = 0.55 * fade;
    const out = raw.slice();
    for (let i = 0; i < OBS; i++) {
      const v = out[i] - gain * this.obsMean[i % CH];
      out[i] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
    return out;
  }

  sense(into: Float32Array = new Float32Array(OBS), ox = this.x, oy = this.y): Float32Array {
    return senseGrid(this.cells, this.scent, ox, oy, SIZE, R, into, this.family?.glow ?? null, this.glowGain(), this.family?.decoy ?? null);
  }

  private encode(obs: Float32Array, action = this.lastAction, muteNoise = false, energy = this.energy): Float32Array {
    const x = new Float32Array(IN);
    if (muteNoise) this.loop.muteFamilies(obs, x);
    else x.set(obs);
    x[OBS + action] = 1;
    x[OBS + ACTS] = Math.min(1, energy / 100);
    return x;
  }

  /**
   * Prediction error of the current weights on a held-out probe.
   * Forward only: the compressor is not stepped. Energy is fixed at 100 so
   * the score is not the agent's hunger.
   */
  frozenProbeError(probe: { transitions: { action: number; obs: ArrayLike<number>; nextObs: ArrayLike<number> }[] }): number {
    const into = new Float32Array(OBS);
    const obs = new Float32Array(OBS);
    let sum = 0;
    let n = 0;
    for (const tr of probe.transitions) {
      obs.set(tr.obs);
      this.loop.imagine(this.encode(obs, tr.action, false, 100), into);
      for (let i = 0; i < OBS; i++) {
        if (i % CH === 2) continue;
        const d = into[i] - tr.nextObs[i];
        sum += d * d;
        n += 1;
      }
    }
    return n ? sum / n : 0;
  }

  private signalView(): SignalView {
    return {
      loop: this.loop,
      features: this.features,
      counts: this.visitCounts,
      rnd: this.rnd,
      destGrid: (action) => {
        const nx = this.x + DIRS[action].x;
        const ny = this.y + DIRS[action].y;
        const oob = nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE;
        const blocked = action === 4 || oob || this.cells[ny * SIZE + nx] === 1;
        if (blocked) return this.y * SIZE + this.x;
        return ny * SIZE + nx;
      },
      scentPair: (action) => {
        const from = (VIEW * VIEW) >> 1;
        const tx = R + DIRS[action].x;
        const ty = R + DIRS[action].y;
        const to = action === 4 ? from : ty * VIEW + tx;
        return { from, to };
      },
    };
  }

  private observeSignal() {
    if (this.signal === "count") {
      this.visitCounts[this.y * SIZE + this.x] += 1;
    } else if (this.signal === "rnd") {
      const obs = new Float32Array(OBS);
      this.sense(obs);
      this.rnd.train(obs);
    }
  }

  private spawnFood() {
    if (this.worldKind === "blank") return;
    const p = randomEmpty(this.cells, SIZE, Math.random);
    this.cells[p.y * SIZE + p.x] = 2;
  }

  private relocatePulse() {
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i] === 2) this.cells[i] = 0;
    this.spawnFood();
  }

  paint(cx: number, cy: number, mode: "wall" | "food" | "erase") {
    if (cx < 1 || cy < 1 || cx >= SIZE - 1 || cy >= SIZE - 1) return;
    if (cx === this.x && cy === this.y) return;
    const i = cy * SIZE + cx;
    if (mode === "erase") this.cells[i] = 0;
    else if (mode === "wall") this.cells[i] = this.cells[i] === 1 ? 0 : 1;
    else this.cells[i] = this.cells[i] === 2 ? 0 : 2;
  }

  /**
   * Sample, then either repeat that direction or execute the imagined
   * follow-up, until `OPTION_SPAN` ticks have run. Called only when `option`
   * is on. The off path never reaches this, so it draws no extra policy noise
   * and does not read the hold counter. `rollout` off takes the repeat branch
   * and does not read the follow-up.
   */
  private heldOrChoose(obs: Float32Array): number {
    if (this.optionLeft > 0) {
      this.optionLeft -= 1;
      if (this.features.rollout) {
        const action = this.rolloutAction;
        if (action === this.heldAction) this.optionHeld += 1;
        else this.rolloutSwitched += 1;
        return action;
      }
      this.optionHeld += 1;
      return this.heldAction;
    }
    const action = this.choose(obs);
    this.heldAction = action;
    if (this.features.rollout) {
      this.rolloutAction = this.followReady ? this.followBuf[action]! : action;
      this.rolloutFollow = this.rolloutAction;
    }
    this.optionLeft = OPTION_SPAN - 1;
    return action;
  }

  private choose(obs: Float32Array): number {
    this.followReady = false;
    if (this.signal === "random") {
      this.scores.fill(0);
      this.zeroScoreParts();
      this.zeroRhoHatParts();
      this.policyEntropy = 1;
      this.branching = ACTS;
      this.edge = edgeIndex(1);
      return (this.rand() * ACTS) | 0;
    }
    const hunger = Math.max(0, 1 - this.energy / 100);
    const view = this.signalView();
    imagineScores({
      acts: ACTS,
      curiosity: this.loop.curiosityWeight(this.params.curiosity),
      goal: this.params.goal,
      progressEma: signalProgressEma(this.signal, view),
      horizonRho: this.signal === "rho" && this.scoreHorizonDrop,
      uncertainty: this.scoreUncertainty,
      ema: this.loop.ema,
      imagined: this.imagined,
      imagined2: this.imagined2,
      imagined3: this.imagined3,
      horizon3Ema: 0.12,
      scores: this.scores,
      predict: (a, into) => this.loop.imagine(this.encode(obs, a, true), into),
      residualWeight: (i) => this.loop.familyWeight(i % CH),
      read: (pred, a) => {
        const tx = R + DIRS[a].x;
        const ty = R + DIRS[a].y;
        const ti = (ty * VIEW + tx) * CH;
        const visWall = a === 4 ? 0 : obs[ti];
        const visFood = a === 4 ? obs[CENTER + 1] : obs[ti + 1];
        const visScent = a === 4 ? obs[CENTER + 2] : obs[ti + 2];
        const stay = a === 4 ? 0.35 : 0;
        const cell = a === 4 ? (VIEW * VIEW) >> 1 : ty * VIEW + tx;
        const scentW = this.loop.scentNovelty(cell);
        if (this.family) {
          const body = this.bodyAt(a);
          return {
            reward: (0.45 + 1.4 * hunger) * body.food,
            cost: 6.5 * body.wall + stay,
            novelty: (1 - visScent) * scentW,
          };
        }
        return {
          reward: (0.45 + 1.4 * hunger) * (visFood + 0.55 * pred[CENTER + 1]),
          cost: 6.5 * visWall + 1.8 * pred[CENTER] + stay,
          novelty: (1 - visScent) * scentW,
        };
      },
      predictFrom: (pred, a1, into) => this.loop.imagine(this.encode(pred, a1, true), into),
      readPred: (pred, a) => {
        const tx = R + DIRS[a].x;
        const ty = R + DIRS[a].y;
        const ti = (ty * VIEW + tx) * CH;
        const destWall = a === 4 ? 0 : pred[ti];
        const destFood = a === 4 ? pred[CENTER + 1] : pred[ti + 1];
        const destScent = a === 4 ? pred[CENTER + 2] : pred[ti + 2];
        const stay = a === 4 ? 0.35 : 0;
        const cell = a === 4 ? (VIEW * VIEW) >> 1 : ty * VIEW + tx;
        const scentW = this.loop.scentNovelty(cell);
        if (this.family) {
          return { reward: 0, cost: stay, novelty: (1 - destScent) * scentW };
        }
        return {
          reward: (0.45 + 1.4 * hunger) * destFood,
          cost: 6.5 * destWall + 1.8 * pred[CENTER] + stay,
          novelty: (1 - destScent) * scentW,
        };
      },
      progressBonus: (a, pred) => signalActionBonus(this.signal, view, a, pred),
      progExtra:
        this.intrinsicBoost || this.periodicBoost
          ? (a) => this.progressExtra(view.destGrid, a)
          : undefined,
      follow: this.features.rollout ? this.followBuf : undefined,
      parts: this.scoreParts ?? undefined,
      hatParts: this.rhoHatParts ?? undefined,
    });
    if (this.features.rollout) this.followReady = true;
    let temp = this.loop.policyTemperature(this.params.temperature);
    if (this.burnIn > 0) temp = Math.min(1.2, temp * 1.55);
    this.policyEntropy = entropyNorm(this.scores, temp);
    this.branching = branching(this.scores);
    this.edge = edgeIndex(this.policyEntropy);
    this.loop.reviseEdge(this.branching);
    return softmaxSample(this.scores, temp, this.rand);
  }

  private zeroScoreParts() {
    const parts = this.scoreParts;
    if (!parts) return;
    parts.rho.fill(0);
    parts.global.fill(0);
    parts.uncertainty.fill(0);
    parts.extra.fill(0);
    parts.extrinsic.fill(0);
    parts.follow.fill(0);
    parts.rhoHat.fill(0);
  }

  private zeroRhoHatParts() {
    const parts = this.rhoHatParts;
    if (!parts) return;
    parts.bonus.fill(0);
    parts.drop2.fill(0);
    parts.drop3.fill(0);
  }

  private note(text: string) {
    this.thought = text;
    this.thoughts.unshift({ t: this.age, text });
    if (this.thoughts.length > 12) this.thoughts.pop();
  }

  private maybeThink(action: number, ate: boolean, bumped: boolean, died: boolean) {
    if (died) { this.note("Energy gone. The model remains. I begin again."); return; }
    if (ate) { this.note("Food. Energy returns. The world just became slightly more regular."); return; }
    this.thinkCooldown--;
    if (this.thinkCooldown > 0) return;
    this.thinkCooldown = 18 + ((this.rand() * 22) | 0);
    const hunger = this.energy < 40;
    const confused = this.loop.surprise > this.loop.ema * 1.45;
    const calm = this.loop.ema < 0.08;
    const name = DIR_NAMES[action];
    if (bumped) this.note("A wall. The prediction was cheap. I turn.");
    else if (confused) this.note("The world did not match. Updating the model.");
    else if (hunger) this.note(`Hungry. Moving ${name}. Looking for structure that feeds.`);
    else if (calm) this.note(`Quiet. ${name}. The map is holding.`);
    else this.note(`I move ${name}. Surprise ${this.loop.surprise.toFixed(3)}.`);
  }

  step() {
    const raw = this.sense();
    this.lastObs = raw;
    const obs = this.adaptObs(raw);
    const lr = this.burnIn > 0 ? this.params.lr * 2.4 : this.params.lr;
    if (this.burnIn > 0) {
      this.burnIn -= 1;
      if (this.burnIn === 0) this.loop.baselineRate = 0.02;
    }
    this.loop.assimilate(obs, lr);
    if (this.forgettingRate > 0) this.loop.net.decay(this.forgettingRate);
    this.history.push(this.loop.surprise);
    if (this.history.length > HISTORY) this.history.shift();
    const action = this.features.option ? this.heldOrChoose(obs) : this.choose(obs);
    this.lastAction = action;
    // The action already used the gain from before. Revise it for the next sample.
    this.loop.reviseCuriosity();
    // Held-out probe and imagination both ask M(window, action) for the next window.
    // Commit that pair before the body moves. The historical commit stored the
    // window after the move, so the loss was reconstruction and the probe could not fall.
    const transitionInput = this.features.transition ? this.encode(raw, action) : null;
    if (this.family) {
      const body: GridBody = {
        cells: this.cells,
        scent: this.scent,
        x: this.x,
        y: this.y,
        energy: this.energy,
        pulseClock: this.pulseClock,
      };
      const moved = stepGrid(body, this.worldKind, action, SIZE, this.rand, this.envParams, this.family);
      this.x = body.x;
      this.y = body.y;
      this.energy = body.energy;
      this.pulseClock = body.pulseClock;
      if (moved.ate) this.foods += 1;
      if (moved.died) this.lives += 1;
      this.observeSignal();
      this.maybeThink(action, moved.ate, moved.blocked, moved.died);
      this.age += 1;
      this.loop.commit(transitionInput ?? this.encode(this.sense(), action));
      return;
    }
    const nx = this.x + DIRS[action].x;
    const ny = this.y + DIRS[action].y;
    const oob = nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE;
    const blocked = oob || this.cells[ny * SIZE + nx] === 1;
    let ate = false;
    let died = false;
    if (!blocked) {
      this.x = nx;
      this.y = ny;
      this.energy -= 1;
      const i = this.y * SIZE + this.x;
      if (this.cells[i] === 2) {
        this.cells[i] = 0;
        this.energy = Math.min(140, this.energy + 38);
        this.foods += 1;
        ate = true;
        if (this.worldKind !== "pulse") this.spawnFood();
      }
    } else {
      this.energy -= 1.6;
    }
    for (let i = 0; i < this.scent.length; i++) this.scent[i] *= 0.9;
    this.scent[this.y * SIZE + this.x] = 1;
    if (this.worldKind === "pulse") {
      this.pulseClock++;
      if (this.pulseClock >= 48) {
        this.pulseClock = 0;
        this.relocatePulse();
      }
    }
    if (this.energy <= 0) {
      died = true;
      this.lives += 1;
      this.placeAgent();
      this.energy = 100;
    }
    applyDrift(this.cells, this.envParams, this.rand);
    this.observeSignal();
    this.maybeThink(action, ate, blocked, died);
    this.age += 1;
    this.loop.commit(transitionInput ?? this.encode(this.sense(), action));
  }

  snapshot(): Snapshot {
    const pred = new Float32Array(OBS);
    this.loop.imagine(this.encode(this.lastObs, this.lastAction), pred);
    return {
      size: SIZE,
      cells: this.cells.slice(),
      scent: this.scent.slice(),
      ax: this.x,
      ay: this.y,
      facing: this.lastAction,
      energy: this.energy,
      age: this.age,
      foods: this.foods,
      lives: this.lives,
      surprise: this.loop.surprise,
      ema: this.loop.ema,
      progress: this.loop.progress,
      compression: this.loop.compression,
      weightEnergy: this.loop.weightEnergy,
      obs: this.lastObs.slice(),
      pred,
      scores: this.scores.slice(),
      imagined: this.imagined.map((v) => v.slice()),
      history: this.history.slice(),
      thought: this.thought,
      thoughts: this.thoughts.slice(),
      lastAction: this.lastAction,
      worldKind: this.worldKind,
      participation: this.loop.participation,
      policyEntropy: this.policyEntropy,
      branching: this.branching,
      edge: this.edge,
      commitment: this.loop.commitment,
    };
  }
}
