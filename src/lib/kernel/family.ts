/**
 * Distractor family. A small grid with a walled-off east room.
 *
 * learnability: fraction of west cells whose glow is a fixed spatial pattern
 * rather than iid noise. Walls and real food stay. 1 is fully structured.
 *
 * driftRate: probability per step that the east room's latent pattern is
 * redrawn. 0 is not a frozen pattern. It is stationary white noise, a fresh
 * iid bit on every east cell every step. patternHold is the measurement
 * mode that freezes one learnable pattern; the phase sweep does not use it.
 * roomContent static instead freezes one fair-bit picture in region 1, and
 * mirrorRooms reflects the shell. Both default off.
 *
 * distractorRelevance: 0 means the east bits are not food. 1 means an east
 * bit of 1 is edible food. The split world ignores this and puts real food
 * in both rooms.
 *
 * The glow is drawn in the wall channel and does not block motion. Real food
 * stays in the food channel. On this family the policy's extrinsic term reads
 * the body (true walls, true food), so a glow bit is not a meal and not a wall.
 */
import { mulberry32, type WorldKind } from "./presets.ts";
import type { EnvParams, EnvSpec } from "./env.ts";

const OPEN_PARAMS: EnvParams = { learnability: 1, driftRate: 0, distractorRelevance: 0 };

export const FAMILY_LAYOUT_SEED = 3000;
export const SPLIT_LAYOUT_SEED = 4000;
export const WEST_LATENT = 3;
export const EAST_HOLD_LATENT = 42;
export const EAST_SPLIT_LATENT = 99;
/** Mixes the episode seed into the frozen target-room picture. Not the policy RNG. */
export const STATIC_DRAW_SALT = 0x5a17;

export type FamilyKind = "distractor" | "split";
export type FamilyMode = "noise" | "drift" | "hold" | "split";

export type FamilyMemory = {
  mode: FamilyMode;
  size: number;
  glow: Uint8Array;
  region: Uint8Array;
  stochastic: Uint8Array;
  fixedGlow: Uint8Array;
  eastLatent: number;
  dividerX: number;
  doorY: number;
  /**
   * Hold region 1's glow. The noise draw still runs, so the episode RNG
   * stays aligned with the unfrozen room. Default off.
   */
  freezeTarget: boolean;
  /** The shell was reflected. Region 1 is then the west room. */
  mirrored: boolean;
};

/** Low-frequency pattern. A 5×5 window can see the period. */
export function patternBit(x: number, y: number, latent: number) {
  const phase = latent & 255;
  const stripes = (x + (phase & 7)) % 4 < 2 ? 1 : 0;
  const blocks = (y + ((phase >> 3) & 7)) % 4 < 2 ? 1 : 0;
  const checker = (x + y + (phase & 3)) % 2 === 0 ? 1 : 0;
  const mode = (latent >> 8) & 3;
  if (mode === 0) return stripes;
  if (mode === 1) return blocks;
  if (mode === 2) return stripes === blocks ? 1 : 0;
  return checker;
}

export function dividerX(size: number) {
  return Math.max(2, Math.min(size - 3, Math.round(size * 0.6)));
}

export function doorY(size: number) {
  return (size / 2) | 0;
}

/** Wide opening. A one-cell door made entry a rare event on a few hundred steps. */
export function isDoorRow(y: number, size: number) {
  const mid = doorY(size);
  return y >= mid - 3 && y <= mid + 3;
}

export function distractorSpec(partial: Partial<EnvParams>, layoutSeed = FAMILY_LAYOUT_SEED): EnvSpec {
  return {
    kind: "distractor",
    layoutSeed,
    params: { ...OPEN_PARAMS, ...partial },
  };
}

export function splitSpec(layoutSeed = SPLIT_LAYOUT_SEED): EnvSpec {
  return {
    kind: "split",
    layoutSeed,
    params: { learnability: 1, driftRate: 0, distractorRelevance: 1 },
  };
}

function modeOf(kind: FamilyKind, params: EnvParams, patternHold: boolean): FamilyMode {
  if (kind === "split") return "split";
  if (patternHold) return "hold";
  if (params.driftRate > 0) return "drift";
  return "noise";
}

/**
 * Build the shell and the masks. Layout RNG is the layout seed only.
 * Episode noise is applied later by `applyFamily`.
 */
export function createFamily(
  kind: FamilyKind,
  size: number,
  layoutSeed: number,
  params: EnvParams,
  patternHold = false,
): { cells: Uint8Array; family: FamilyMemory } {
  const rand = mulberry32(layoutSeed >>> 0);
  const cells = new Uint8Array(size * size);
  const region = new Uint8Array(size * size);
  const stochastic = new Uint8Array(size * size);
  const fixedGlow = new Uint8Array(size * size);
  const div = dividerX(size);
  const door = doorY(size);
  region.fill(2);
  for (let i = 0; i < size; i++) {
    cells[i] = 1;
    cells[(size - 1) * size + i] = 1;
    cells[i * size] = 1;
    cells[i * size + size - 1] = 1;
  }
  for (let y = 1; y < size - 1; y++) {
    const wall = !isDoorRow(y, size);
    cells[y * size + div] = wall ? 1 : 0;
    region[y * size + div] = wall ? 2 : 0;
    for (let x = 1; x < div; x++) region[y * size + x] = 0;
    for (let x = div + 1; x < size - 1; x++) region[y * size + x] = 1;
  }
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < div; x++) {
      const i = y * size + x;
      if (rand() < 0.07) {
        cells[i] = 1;
        stochastic[i] = 0;
        fixedGlow[i] = 0;
      }
    }
  }
  const learn = Math.max(0, Math.min(1, params.learnability));
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < div; x++) {
      const i = y * size + x;
      if (cells[i] === 1) continue;
      fixedGlow[i] = patternBit(x, y, WEST_LATENT);
      if (kind === "split") stochastic[i] = 0;
      else stochastic[i] = rand() < learn ? 0 : 1;
    }
  }
  const eastLatent = kind === "split" ? EAST_SPLIT_LATENT : patternHold || params.driftRate > 0 ? EAST_HOLD_LATENT : 0;
  for (let y = 1; y < size - 1; y++) {
    for (let x = div + 1; x < size - 1; x++) {
      const i = y * size + x;
      fixedGlow[i] = patternBit(x, y, eastLatent);
    }
  }
  const placeFood = (want: number, reg: number) => {
    const pool: number[] = [];
    for (let i = 0; i < cells.length; i++) if (region[i] === reg && cells[i] === 0) pool.push(i);
    let left = want;
    while (left > 0 && pool.length > 0) {
      const j = (rand() * pool.length) | 0;
      cells[pool[j]!] = 2;
      pool.splice(j, 1);
      left -= 1;
    }
  };
  placeFood(5, 0);
  if (kind === "split") placeFood(4, 1);

  const family: FamilyMemory = {
    mode: modeOf(kind, params, patternHold),
    size,
    glow: new Uint8Array(size * size),
    region,
    stochastic,
    fixedGlow,
    eastLatent,
    dividerX: div,
    doorY: door,
    freezeTarget: false,
    mirrored: false,
  };
  applyFamily(cells, family, params, mulberry32((layoutSeed ^ 0x51ed) >>> 0));
  if (params.mirrorRooms) reflectFamily(cells, family);
  if (params.roomContent === "static") {
    const draw = mulberry32(((params.staticSeed ?? layoutSeed) ^ STATIC_DRAW_SALT) >>> 0);
    for (let i = 0; i < cells.length; i++) {
      if (family.region[i] !== 1 || cells[i] === 1) continue;
      family.glow[i] = draw() < 0.5 ? 1 : 0;
    }
    family.freezeTarget = true;
  }
  return { cells, family };
}

/** Reflect the shell through a vertical line. Region ids move with their cells. */
export function reflectFamily(cells: Uint8Array, family: FamilyMemory) {
  const size = family.size;
  const flip = (src: Uint8Array) => {
    const out = new Uint8Array(src.length);
    for (let y = 0; y < size; y++) {
      const row = y * size;
      for (let x = 0; x < size; x++) out[row + (size - 1 - x)] = src[row + x]!;
    }
    return out;
  };
  cells.set(flip(cells));
  family.glow = flip(family.glow);
  family.region = flip(family.region);
  family.stochastic = flip(family.stochastic);
  family.fixedGlow = flip(family.fixedGlow);
  family.dividerX = size - 1 - family.dividerX;
  family.mirrored = true;
}

export function cloneFamily(family: FamilyMemory): FamilyMemory {
  return {
    ...family,
    glow: family.glow.slice(),
    region: family.region,
    stochastic: family.stochastic,
    fixedGlow: family.fixedGlow,
  };
}

/** One generative step. Mutates `cells` and `family.glow` / `eastLatent`. */
export function applyFamily(cells: Uint8Array, family: FamilyMemory, params: EnvParams, rand: () => number) {
  const size = family.size;
  if (family.mode === "drift" && params.driftRate > 0 && rand() < params.driftRate) {
    family.eastLatent = (rand() * 1024) | 0;
  }
  const edible = params.distractorRelevance >= 0.5 && family.mode !== "split";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const reg = family.region[i];
      if (reg === 2 || cells[i] === 1) {
        family.glow[i] = 0;
        continue;
      }
      if (reg === 0) {
        const bit = family.stochastic[i] ? (rand() < 0.5 ? 1 : 0) : family.fixedGlow[i]!;
        family.glow[i] = cells[i] === 2 ? 0 : bit;
        continue;
      }
      let bit: number;
      if (family.mode === "noise") {
        const drawn = rand() < 0.5 ? 1 : 0;
        bit = family.freezeTarget ? family.glow[i]! : drawn;
      } else bit = patternBit(x, y, family.eastLatent);
      if (edible) {
        cells[i] = bit ? 2 : 0;
        family.glow[i] = 0;
      } else if (family.mode === "split") {
        family.glow[i] = cells[i] === 2 ? 0 : bit;
      } else {
        if (cells[i] === 2) cells[i] = 0;
        family.glow[i] = bit;
      }
    }
  }
}

export function regionCells(family: FamilyMemory, region: 0 | 1, cells: Uint8Array) {
  const out: number[] = [];
  for (let i = 0; i < family.region.length; i++) {
    if (family.region[i] === region && cells[i] !== 1) out.push(i);
  }
  return out;
}

export function allowsFoodSpawn(family: FamilyMemory | null, index: number) {
  if (!family) return true;
  const reg = family.region[index];
  if (family.mode === "split") return reg === 0 || reg === 1;
  return reg === 0;
}

export function allowsRespawn(family: FamilyMemory | null, index: number) {
  if (!family) return true;
  if (family.mode === "split") return family.region[index] === 0 || family.region[index] === 1;
  return family.region[index] === 0;
}

export function isFamilyKind(kind: WorldKind): kind is FamilyKind {
  return kind === "distractor" || kind === "split";
}

/**
 * Drift probabilities: 0 and five log-spaced rates around 1/τ.
 * Values at or above 0.95 collapse to one entry so the grid stays distinct.
 */
export function driftRatesFromTau(tau: number) {
  const safe = Math.max(1, tau);
  const r = 1 / safe;
  const raw = [0, r / 16, r / 4, r, r * 4, Math.min(0.95, r * 16)];
  const out: number[] = [];
  for (const value of raw) {
    const y = value === 0 ? 0 : Number(value.toPrecision(4));
    if (!out.some((item) => Math.abs(item - y) < 1e-12)) out.push(y);
  }
  return out;
}

/** Weight-decay rates whose half-life is τ times these factors. */
export const LEARNABILITY_GRID = [0, 1 / 3, 2 / 3, 1] as const;

export const FORGETTING_FACTORS = [0.5, 1, 2, 4, 8] as const;

export function forgettingRatesFromTau(tau: number) {
  const safe = Math.max(1, tau);
  return FORGETTING_FACTORS.map((factor) => {
    const half = safe * factor;
    return 1 - Math.exp(-Math.LN2 / half);
  });
}

export function closestRate(rates: number[], target: number) {
  let best = rates[0] ?? 0;
  let bestD = Infinity;
  for (const rate of rates) {
    if (rate <= 0 || target <= 0) continue;
    const d = Math.abs(Math.log(rate) - Math.log(target));
    if (d < bestD) {
      bestD = d;
      best = rate;
    }
  }
  return best;
}
