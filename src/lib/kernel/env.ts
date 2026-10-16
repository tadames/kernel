/**
 * Environment seam. Field and Rooms are static maps. The distractor family
 * hangs off the same parameter block: learnability, drift, relevance.
 * A positive drift rate without a family memory still throws, so a static
 * probe cannot silently pretend the map is moving.
 */
import { generateWorld, randomEmpty, type WorldKind } from "./presets.ts";
import { allowsFoodSpawn, allowsRespawn, applyFamily, type FamilyMemory } from "./family.ts";

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
  /**
   * Scale of east-room white-noise glow in the wall channel.
   * 1 is the historical 0/1 bit. Omitted means 1. West glow is not scaled.
   */
  noiseAmplitude?: number;
  /**
   * Target-room content. Omitted and `noise` are the shipped white-noise room.
   * `static` freezes one fair-bit picture. Measurement only.
   */
  roomContent?: "noise" | "static";
  /** Reflect the distractor map so the target room sits on the west. */
  mirrorRooms?: boolean;
  /**
   * Seed for the frozen target-room picture. Ignored unless `roomContent`
   * is `static`. The policy RNG is a different stream.
   */
  staticSeed?: number;
  /**
   * Five non-edible food markers in region 1. Measurement only.
   * Omitted leaves that room empty. The noise bits stay non-meals
   * unless `distractorRelevance` says otherwise.
   */
  targetFoods?: boolean;
};

/** East-room glow scale. Absent when the historical 0/1 bit is in force. */
export type GlowGain = {
  region: Uint8Array;
  amplitude: number;
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
 * Drift hook. Zero rate with no family is a no-op. A positive rate with no
 * family memory is refused. With a family, the east room updates.
 */
export function applyDrift(
  cells: Uint8Array,
  params: EnvParams,
  rand: () => number,
  family?: FamilyMemory | null,
) {
  if (family) {
    applyFamily(cells, family, params, rand);
    return cells;
  }
  if (params.driftRate <= 0) return cells;
  throw new Error(
    `driftRate ${params.driftRate} has no distractor family. Pass a family memory, or keep the rate at 0.`,
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
  glow?: Uint8Array | null,
  glowGain?: GlowGain | null,
  decoy?: Uint8Array | null,
): Float32Array {
  const view = radius * 2 + 1;
  const scaleEast = Boolean(glowGain && glowGain.amplitude !== 1);
  let k = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const wx = x + dx;
      const wy = y + dy;
      const oob = wx < 0 || wy < 0 || wx >= size || wy >= size;
      const idx = oob ? -1 : wy * size + wx;
      const wallCell = !oob && cells[idx] === WALL;
      const decoyCell = !oob && !!decoy && decoy[idx] === 1;
      const foodCell = !oob && (cells[idx] === FOOD || decoyCell);
      let glowVal = 0;
      if (!oob && !wallCell && !foodCell && glow && glow[idx]) {
        glowVal = scaleEast && glowGain!.region[idx] === 1 ? glowGain!.amplitude : 1;
      }
      const wall = oob || wallCell ? 1 : glowVal;
      const food = foodCell ? 1 : 0;
      const sc = oob ? 0 : scent[idx];
      into[k++] = wall;
      into[k++] = food;
      into[k++] = sc;
    }
  }
  if (k !== view * view * 3) throw new Error(`sense wrote ${k}, expected ${view * view * 3}`);
  return into;
}

function spawnFood(cells: Uint8Array, size: number, rand: () => number, family?: FamilyMemory | null) {
  if (!family) {
    const p = randomEmpty(cells, size, rand);
    cells[p.y * size + p.x] = FOOD;
    return;
  }
  const pool: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === EMPTY && allowsFoodSpawn(family, i)) pool.push(i);
  }
  if (!pool.length) return;
  cells[pool[(rand() * pool.length) | 0]!] = FOOD;
}

function respawnAt(cells: Uint8Array, size: number, rand: () => number, family?: FamilyMemory | null) {
  if (!family) return randomEmpty(cells, size, rand);
  const pool: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === EMPTY && allowsRespawn(family, i)) pool.push(i);
  }
  if (!pool.length) return randomEmpty(cells, size, rand);
  const i = pool[(rand() * pool.length) | 0]!;
  return { x: i % size, y: (i / size) | 0 };
}

export type GridStep = { ate: boolean; died: boolean; blocked: boolean };

/**
 * One grid transition. Mirrors Kernel.step's body (move, food, scent, death)
 * without learning. A static map must keep `driftRate` at 0. A family memory
 * updates the east room after the body moves.
 */
export function stepGrid(
  body: GridBody,
  kind: WorldKind,
  action: number,
  size: number,
  rand: () => number,
  params: EnvParams = DEFAULT_ENV_PARAMS,
  family?: FamilyMemory | null,
): GridStep {
  const dir = GRID_DIRS[Math.max(0, Math.min(GRID_DIRS.length - 1, action | 0))];
  const nx = body.x + dir.x;
  const ny = body.y + dir.y;
  const oob = nx < 0 || ny < 0 || nx >= size || ny >= size;
  const blocked = oob || body.cells[ny * size + nx] === WALL;
  let ate = false;
  if (!blocked) {
    body.x = nx;
    body.y = ny;
    body.energy -= 1;
    const i = body.y * size + body.x;
    if (body.cells[i] === FOOD) {
      body.cells[i] = EMPTY;
      body.energy = Math.min(140, body.energy + 38);
      ate = true;
      if (kind !== "pulse" && kind !== "blank") spawnFood(body.cells, size, rand, family);
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
      spawnFood(body.cells, size, rand, family);
    }
  }
  let died = false;
  if (body.energy <= 0) {
    died = true;
    const p = respawnAt(body.cells, size, rand, family);
    body.x = p.x;
    body.y = p.y;
    body.energy = 100;
  }
  applyDrift(body.cells, params, rand, family);
  return { ate, died, blocked };
}

export function makeBody(kind: WorldKind, size: number, layoutSeed: number, rand: () => number): GridBody {
  const cells = generateWorld(kind, size, layoutSeed);
  const scent = new Float32Array(size * size);
  const p = randomEmpty(cells, size, rand);
  return { cells, scent, x: p.x, y: p.y, energy: 100, pulseClock: 0 };
}
