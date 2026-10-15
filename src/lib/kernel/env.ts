/**
 * Environment seam. Field and Rooms are static maps. The parameter block is
 * the place a later family will hang learnability, drift, and distractors.
 * This file does not implement that family: a positive drift rate throws
 * so a caller cannot silently pretend the map is moving.
 */
import { generateWorld, randomEmpty, type WorldKind } from "./presets.ts";

/** Same order as Kernel `DIRS`: north, east, south, west, wait. */
export const GRID_DIRS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: 0 },
] as const;

export type EnvParams = {
  /** 1 = the map's rules are fully learnable. Reserved. */
  learnability: number;
  /** 0 = the map does not change under the agent. Reserved. */
  driftRate: number;
  /** 0 = no distractor channel. Reserved. */
  distractorRelevance: number;
};

export const DEFAULT_ENV_PARAMS: EnvParams = {
  learnability: 1,
  driftRate: 0,
  distractorRelevance: 0,
};

export type EnvSpec = {
  kind: WorldKind;
  /** Layout RNG. Independent of the episode seed that inits weights. */
  layoutSeed: number;
  params: EnvParams;
};

/** One saved probe and one fixed map per measured environment. */
export const CANONICAL_ENV: Record<"field" | "rooms", EnvSpec> = {
  field: { kind: "field", layoutSeed: 1000, params: { ...DEFAULT_ENV_PARAMS } },
  rooms: { kind: "rooms", layoutSeed: 2000, params: { ...DEFAULT_ENV_PARAMS } },
};

export type GridBody = {
  cells: Uint8Array;
  scent: Float32Array;
  x: number;
  y: number;
  energy: number;
  pulseClock: number;
};

const EMPTY = 0;
const WALL = 1;
const FOOD = 2;

/**
 * Drift hook. Zero rate is a no-op. A positive rate is refused until the
 * drift family exists, so probes stay samples of a static map.
 */
export function applyDrift(cells: Uint8Array, params: EnvParams, _rand: () => number) {
  if (params.driftRate <= 0) return cells;
  throw new Error(
    `driftRate ${params.driftRate} is not implemented. The drift family is intentionally absent.`,
  );
}

export function senseGrid(
  cells: Uint8Array,
  scent: Float32Array,
  x: number,
  y: number,
  size: number,
  radius: number,
  into: Float32Array,
): Float32Array {
  const view = radius * 2 + 1;
  let k = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const wx = x + dx;
      const wy = y + dy;
      const oob = wx < 0 || wy < 0 || wx >= size || wy >= size;
      const wall = oob || cells[wy * size + wx] === WALL ? 1 : 0;
      const food = !oob && cells[wy * size + wx] === FOOD ? 1 : 0;
      const sc = oob ? 0 : scent[wy * size + wx];
      into[k++] = wall;
      into[k++] = food;
      into[k++] = sc;
    }
  }
  if (k !== view * view * 3) throw new Error(`sense wrote ${k}, expected ${view * view * 3}`);
  return into;
}

function spawnFood(cells: Uint8Array, size: number, rand: () => number) {
  const p = randomEmpty(cells, size, rand);
  cells[p.y * size + p.x] = FOOD;
}

/**
 * One grid transition. Mirrors Kernel.step's body (move, food, scent, death)
 * without learning. `params.driftRate` must be 0.
 */
export function stepGrid(
  body: GridBody,
  kind: WorldKind,
  action: number,
  size: number,
  rand: () => number,
  params: EnvParams = DEFAULT_ENV_PARAMS,
) {
  const dir = GRID_DIRS[Math.max(0, Math.min(GRID_DIRS.length - 1, action | 0))];
  const nx = body.x + dir.x;
  const ny = body.y + dir.y;
  const oob = nx < 0 || ny < 0 || nx >= size || ny >= size;
  const blocked = oob || body.cells[ny * size + nx] === WALL;
  if (!blocked) {
    body.x = nx;
    body.y = ny;
    body.energy -= 1;
    const i = body.y * size + body.x;
    if (body.cells[i] === FOOD) {
      body.cells[i] = EMPTY;
      body.energy = Math.min(140, body.energy + 38);
      if (kind !== "pulse" && kind !== "blank") spawnFood(body.cells, size, rand);
    }
  } else {
    body.energy -= 1.6;
  }
  for (let i = 0; i < body.scent.length; i++) body.scent[i] *= 0.9;
  body.scent[body.y * size + body.x] = 1;
  if (kind === "pulse") {
    body.pulseClock += 1;
    if (body.pulseClock >= 48) {
      body.pulseClock = 0;
      for (let i = 0; i < body.cells.length; i++) if (body.cells[i] === FOOD) body.cells[i] = EMPTY;
      spawnFood(body.cells, size, rand);
    }
  }
  if (body.energy <= 0) {
    const p = randomEmpty(body.cells, size, rand);
    body.x = p.x;
    body.y = p.y;
    body.energy = 100;
  }
  applyDrift(body.cells, params, rand);
}

export function makeBody(kind: WorldKind, size: number, layoutSeed: number, rand: () => number): GridBody {
  const cells = generateWorld(kind, size, layoutSeed);
  const scent = new Float32Array(size * size);
  const p = randomEmpty(cells, size, rand);
  return { cells, scent, x: p.x, y: p.y, energy: 100, pulseClock: 0 };
}
