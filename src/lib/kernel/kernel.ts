import { Loop } from "./loop.ts";
import { imagineScores, softmaxSample } from "./policy.ts";
import { branching, edgeIndex, entropyNorm } from "./complexity.ts";
import {
  generateWorld,
  mulberry32,
  randomEmpty,
  type WorldKind,
} from "./presets.ts";

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

const HISTORY = 140;

export type Params = {
  lr: number;
  curiosity: number;
  goal: number;
  temperature: number;
};

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
  lastObs: Float32Array = new Float32Array(OBS);
  scores: Float32Array = new Float32Array(ACTS);
  policyEntropy = 1;
  branching = ACTS;
  edge = 0;
  /** Steps of elevated lr after loadBrain (distribution-shift adaptation). */
  burnIn = 0;
  imagined: Float32Array[] = Array.from({ length: ACTS }, () => new Float32Array(OBS));
  imagined2: Float32Array[] = Array.from({ length: ACTS }, () => new Float32Array(OBS));
  thoughts: Thought[] = [];
  thought = "I begin with no model of this place.";
  params: Params = { lr: 0.035, curiosity: 1, goal: 1, temperature: 0.45 };
  private pulseClock = 0;
  private thinkCooldown = 0;
  private rand: () => number;

  constructor(kind: WorldKind = "field", seed = 1) {
    this.seed = seed;
    this.rand = mulberry32(seed + 99);
    this.cells = generateWorld(kind, SIZE, seed);
    this.scent = new Float32Array(SIZE * SIZE);
    this.worldKind = kind;
    this.loop = new Loop(IN, HIDDEN, OUT);
    this.placeAgent();
    this.lastObs = this.sense();
  }

  get model() { return this.loop.model; }
  get surprise() { return this.loop.surprise; }
  get ema() { return this.loop.ema; }
  get progress() { return this.loop.progress; }
  get compression() { return this.loop.compression; }
  get participation() { return this.loop.participation; }

  private placeAgent() {
    const p = randomEmpty(this.cells, SIZE, this.rand);
    this.x = p.x;
    this.y = p.y;
    this.energy = 100;
  }

  setWorld(kind: WorldKind, seed?: number) {
    if (seed !== undefined) this.seed = seed;
    this.worldKind = kind;
    this.cells = generateWorld(kind, SIZE, this.seed);
    this.scent = new Float32Array(SIZE * SIZE);
    this.pulseClock = 0;
    this.placeAgent();
    this.loop.prevInput = null;
    this.lastObs = this.sense();
  }

  rebuildWorld(kind: WorldKind, seed?: number) {
    this.setWorld(kind, seed);
  }

  resetBrain() {
    this.loop.reset();
    this.history = [];
    this.age = 0;
    this.foods = 0;
    this.lives = 0;
    this.thoughts = [];
    this.thinkCooldown = 0;
    this.thought = "The model is new. I know nothing yet.";
    this.energy = 100;
    this.policyEntropy = 1;
    this.branching = ACTS;
    this.edge = 0;
    this.burnIn = 0;
  }

  /** Persist compressor + learning state for resume / inspect. Body and world stay. */
  saveBrain() {
    return this.loop.exportBrain();
  }

  /** Resume a saved mind. Returns false on dimension mismatch.
   *  Starts a short re-burn-in (elevated lr) so observation-shift can be absorbed
   *  without treating a trained compressor as a newborn forever.
   */
  loadBrain(w: Parameters<Loop["importBrain"]>[0]): boolean {
    const ok = this.loop.importBrain(w);
    if (ok) this.burnIn = 28;
    return ok;
  }

  sense(into: Float32Array = new Float32Array(OBS), ox = this.x, oy = this.y): Float32Array {
    let k = 0;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const wx = ox + dx;
        const wy = oy + dy;
        const oob = wx < 0 || wy < 0 || wx >= SIZE || wy >= SIZE;
        const i = wy * SIZE + wx;
        const cell = oob ? 1 : this.cells[i];
        into[k] = cell === 1 ? 1 : 0;
        into[k + 1] = cell === 2 ? 1 : 0;
        into[k + 2] = oob ? 0 : this.scent[i];
        k += CH;
      }
    }
    return into;
  }

  encode(obs: Float32Array, act: number, energy = this.energy) {
    const x = new Float32Array(IN);
    x.set(obs, 0);
    x[OBS + act] = 1;
    x[OBS + ACTS] = Math.max(0, Math.min(1, energy / 100));
    return x;
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

  private choose(obs: Float32Array): number {
    const hunger = Math.max(0, 1 - this.energy / 100);
    imagineScores({
      acts: ACTS,
      curiosity: this.params.curiosity,
      goal: this.params.goal,
      progressEma: this.loop.progressEma,
      ema: this.loop.ema,
      imagined: this.imagined,
      scores: this.scores,
      predict: (a, into) => this.loop.imagine(this.encode(obs, a), into),
      read: (pred, a) => {
        const tx = R + DIRS[a].x;
        const ty = R + DIRS[a].y;
        const ti = (ty * VIEW + tx) * CH;
        const visWall = a === 4 ? 0 : obs[ti];
        const visFood = a === 4 ? obs[CENTER + 1] : obs[ti + 1];
        const visScent = a === 4 ? obs[CENTER + 2] : obs[ti + 2];
        const stay = a === 4 ? 0.35 : 0;
        return {
          reward: (0.45 + 1.4 * hunger) * (visFood + 0.55 * pred[CENTER + 1]),
          cost: 6.5 * visWall + 1.8 * pred[CENTER] + stay,
          novelty: 1 - visScent,
        };
      },
      predictFrom: (pred, a1, into) => this.loop.imagine(this.encode(pred, a1), into),
      readPred: (pred, a) => {
        const tx = R + DIRS[a].x;
        const ty = R + DIRS[a].y;
        const ti = (ty * VIEW + tx) * CH;
        const destWall = a === 4 ? 0 : pred[ti];
        const destFood = a === 4 ? pred[CENTER + 1] : pred[ti + 1];
        const destScent = a === 4 ? pred[CENTER + 2] : pred[ti + 2];
        const stay = a === 4 ? 0.35 : 0;
        return {
          reward: (0.45 + 1.4 * hunger) * destFood,
          cost: 6.5 * destWall + 1.8 * pred[CENTER] + stay,
          novelty: 1 - destScent,
        };
      },
      imagined2: this.imagined2,
    });
    this.policyEntropy = entropyNorm(this.scores, this.params.temperature);
    this.branching = branching(this.scores);
    this.edge = edgeIndex(this.policyEntropy);
    return softmaxSample(this.scores, this.params.temperature, this.rand);
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
    else if (hunger) this.note(`Energy is low. I value predicted food over novelty, moving ${name}.`);
    else if (calm) this.note("This region is well-modeled. Seeking a less familiar edge.");
    else if (this.loop.progress > 0.004) this.note("Compression is moving. The guess is tightening.");
    else this.note(`Moving ${name}. Curiosity still pays.`);
  }

  private note(text: string) {
    this.thought = text;
    this.thoughts.unshift({ t: this.age, text });
    if (this.thoughts.length > 12) this.thoughts.pop();
  }

  step() {
    const obs = this.sense();
    this.lastObs = obs;
    const lr = this.burnIn > 0 ? this.params.lr * 2.4 : this.params.lr;
    if (this.burnIn > 0) this.burnIn -= 1;
    this.loop.assimilate(obs, lr);
    this.history.push(this.loop.surprise);
    if (this.history.length > HISTORY) this.history.shift();
    const action = this.choose(obs);
    this.lastAction = action;
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
    }
    this.age += 1;
    this.loop.commit(this.encode(obs, action));
    this.maybeThink(action, ate, blocked && action !== 4, died);
  }

  snapshot(): Snapshot {
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
      weightEnergy: this.loop.model.weightEnergy(),
      obs: this.lastObs.slice(),
      pred: this.loop.lastPred.slice(),
      scores: this.scores.slice(),
      imagined: this.imagined.map((p) => p.slice()),
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
