import { MLP, mse } from "./mlp.ts";
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

const REPLAY = 160;
const EXTRA = 3;
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
};

function softmaxSample(logits: Float32Array, temperature: number) {
  const t = Math.max(0.05, temperature);
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i];
  const ex = new Float32Array(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    const v = Math.exp((logits[i] - max) / t);
    ex[i] = v;
    sum += v;
  }
  let r = Math.random() * sum;
  for (let i = 0; i < ex.length; i++) {
    r -= ex[i];
    if (r <= 0) return i;
  }
  return ex.length - 1;
}

export class Kernel {
  worldKind: WorldKind = "field";
  seed: number;
  cells: Uint8Array;
  scent: Float32Array;
  model: MLP;
  replay: { x: Float32Array; y: Float32Array }[] = [];
  x = 1;
  y = 1;
  energy = 100;
  age = 0;
  foods = 0;
  lives = 0;
  ema = 0.35;
  progress = 0;
  surprise = 0.35;
  history: number[] = [];
  prevInput: Float32Array | null = null;
  prevObs: Float32Array | null = null;
  lastAction = 4;
  lastPred: Float32Array = new Float32Array(OBS);
  lastObs: Float32Array = new Float32Array(OBS);
  scores: Float32Array = new Float32Array(ACTS);
  imagined: Float32Array[] = Array.from({ length: ACTS }, () => new Float32Array(OBS));
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
    this.model = new MLP(IN, HIDDEN, OUT);
    this.placeAgent();
    this.lastObs = this.sense();
  }

  private placeAgent() {
    const p = randomEmpty(this.cells, SIZE, this.rand);
    this.x = p.x;
    this.y = p.y;
    this.energy = 100;
  }

  rebuildWorld(kind: WorldKind, seed?: number) {
    this.worldKind = kind;
    this.seed = seed ?? ((Math.random() * 1e9) | 0);
    this.rand = mulberry32(this.seed + 99);
    this.cells = generateWorld(kind, SIZE, this.seed);
    this.scent = new Float32Array(SIZE * SIZE);
    this.pulseClock = 0;
    this.placeAgent();
    this.prevInput = null;
    this.prevObs = null;
    this.lastObs = this.sense();
  }

  resetBrain() {
    this.model = new MLP(IN, HIDDEN, OUT);
    this.replay = [];
    this.ema = 0.35;
    this.progress = 0;
    this.surprise = 0.35;
    this.history = [];
    this.age = 0;
    this.foods = 0;
    this.lives = 0;
    this.prevInput = null;
    this.prevObs = null;
    this.thoughts = [];
    this.thinkCooldown = 0;
    this.thought = "The model is new. I know nothing yet.";
    this.energy = 100;
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
    const predBuf = new Float32Array(OBS);
    for (let a = 0; a < ACTS; a++) {
      const input = this.encode(obs, a);
      const pred = this.model.forward(input, this.imagined[a]);
      predBuf.set(pred);

      const wallAhead = pred[CENTER];
      const foodHere = pred[CENTER + 1];
      // Look at the current observation in the direction of travel.
      const tx = R + DIRS[a].x;
      const ty = R + DIRS[a].y;
      const ti = (ty * VIEW + tx) * CH;
      const wallNow = a === 4 ? 0 : obs[ti];
      const foodNow = a === 4 ? obs[CENTER + 1] : obs[ti + 1];
      const scentNow = a === 4 ? obs[CENTER + 2] : obs[ti + 2];

      // Food visible anywhere in that half of the window.
      let foodPull = foodNow + 0.55 * foodHere;
      if (a < 4) {
        for (let dy = -R; dy <= R; dy++) {
          for (let dx = -R; dx <= R; dx++) {
            const toward =
              (DIRS[a].x !== 0 && dx * DIRS[a].x > 0) ||
              (DIRS[a].y !== 0 && dy * DIRS[a].y > 0);
            if (!toward) continue;
            const fi = ((dy + R) * VIEW + (dx + R)) * CH + 1;
            foodPull += 0.18 * obs[fi];
          }
        }
      }

      const novelty = 1 - scentNow;
      const wallCost = 6.5 * Math.max(wallAhead, wallNow);
      const stayTax = a === 4 ? 0.35 : 0;
      const curious = this.params.curiosity * (0.85 * novelty + 0.35 * this.ema);
      const goal = this.params.goal * (0.45 + 1.4 * hunger) * foodPull;

      this.scores[a] = curious + goal - wallCost - stayTax;
    }
    return softmaxSample(this.scores, this.params.temperature);
  }

  private maybeThink(action: number, ate: boolean, bumped: boolean, died: boolean) {
    if (died) {
      this.note("Energy gone. The model remains. I begin again.");
      return;
    }
    if (ate) {
      this.note("Food. Energy returns. The world just became slightly more regular.");
      return;
    }
    this.thinkCooldown--;
    if (this.thinkCooldown > 0) return;
    this.thinkCooldown = 18 + ((Math.random() * 22) | 0);

    const hunger = this.energy < 40;
    const confused = this.surprise > this.ema * 1.45;
    const calm = this.ema < 0.08;
    const name = DIR_NAMES[action];

    if (bumped) this.note("A wall. The prediction was cheap. I turn.");
    else if (confused) this.note("The world did not match. Updating the model.");
    else if (hunger) this.note(`Energy is low. I value food over novelty, moving ${name}.`);
    else if (calm) this.note("This region is well-modeled. Seeking a less familiar edge.");
    else if (this.progress > 0.004) this.note("Compression is moving. The guess is tightening.");
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

    if (this.prevInput) {
      this.model.train(this.prevInput, obs, this.params.lr);
      if (this.replay.length > 0) {
        for (let k = 0; k < EXTRA; k++) {
          const s = this.replay[(Math.random() * this.replay.length) | 0];
          this.model.train(s.x, s.y, this.params.lr * 0.7);
        }
      }
      this.replay.push({ x: this.prevInput, y: obs.slice() });
      if (this.replay.length > REPLAY) this.replay.shift();
    }

    if (this.prevObs) {
      const pred = this.model.forward(this.prevInput!, this.lastPred);
      this.surprise = mse(pred, obs);
    } else {
      this.surprise = 0.35;
    }

    const prevEma = this.ema;
    this.ema = 0.94 * this.ema + 0.06 * this.surprise;
    this.progress = prevEma - this.ema;
    this.history.push(this.surprise);
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
    this.prevObs = obs;
    this.prevInput = this.encode(obs, action);
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
      surprise: this.surprise,
      ema: this.ema,
      progress: this.progress,
      compression: 1 / (1 + this.ema * 8),
      weightEnergy: this.model.weightEnergy(),
      obs: this.lastObs.slice(),
      pred: this.lastPred.slice(),
      scores: this.scores.slice(),
      imagined: this.imagined.map((p) => p.slice()),
      history: this.history.slice(),
      thought: this.thought,
      thoughts: this.thoughts.slice(),
      lastAction: this.lastAction,
      worldKind: this.worldKind,
    };
  }
}
