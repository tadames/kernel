/**
 * Seeded measurements for the nightly job.
 * One Field life supplies G1, foods, lives, and the C2 band.
 * Math.random is reseeded before every episode so a flag flip is the only change.
 */
import { Kernel } from "./kernel.ts";
import { StreamKernel, type StreamKind } from "./stream.ts";
import { mulberry32 } from "./presets.ts";
import {
  LOOP_FEATURE_KEYS,
  resolveLoopFeatures,
  type LoopFeatures,
} from "./loop.ts";
import {
  adjacentFood,
  c1Pass,
  c2Pass,
  g1Pass,
  g2Pass,
  s1Pass,
  s2Pass,
  s3Pass,
} from "./experiments.ts";

export const BENCH_SEEDS = [1, 2, 3, 4, 5] as const;
export const FIELD_STEPS = 280;
export const STREAM_STEPS = 220;

const CLAIM_IDS = ["g1", "g2", "s1", "s2", "s3", "c1", "c2"] as const;
export type ClaimId = (typeof CLAIM_IDS)[number];

export type SeedMetrics = {
  seed: number;
  fieldEarly: number;
  fieldLate: number;
  fieldFoods: number;
  fieldLives: number;
  roomsFoods: number;
  roomsLives: number;
  structEarly: number;
  structLate: number;
  noiseEarly: number;
  noiseLate: number;
  structCommitEarly: number;
  structCommitLate: number;
  noiseCommitLate: number;
  meanB: number;
  meanH: number;
  g2Action: number;
  g2Foods: number;
  g2x: number;
  g1: boolean;
  g2: boolean;
  s1: boolean;
  s2: boolean;
  s3: boolean;
  c1: boolean;
  c2: boolean;
};

export type BenchMean = {
  fieldEarly: number;
  fieldLate: number;
  fieldFoods: number;
  fieldLives: number;
  roomsFoods: number;
  roomsLives: number;
  structLate: number;
  noiseLate: number;
  meanB: number;
};

export type ConfigReport = {
  name: string;
  features: LoopFeatures;
  seeds: SeedMetrics[];
  mean: BenchMean;
  /** True when the claim passes on a strict majority of seeds. */
  passes: Record<ClaimId, boolean>;
  passCount: Record<ClaimId, number>;
};

export type BenchReport = {
  date: string;
  sha: string;
  seeds: number[];
  fieldSteps: number;
  streamSteps: number;
  configs: ConfigReport[];
};

function withSeed<T>(seed: number, fn: () => T): T {
  const prev = Math.random;
  Math.random = mulberry32(seed >>> 0);
  try {
    return fn();
  } finally {
    Math.random = prev;
  }
}

function mean(xs: number[]) {
  if (xs.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i]!;
  return s / xs.length;
}

function runField(seed: number, features: LoopFeatures) {
  return withSeed(seed * 10007 + 1, () => {
    const k = new Kernel("field", seed, features);
    let early = 0;
    const H: number[] = [];
    const B: number[] = [];
    for (let t = 0; t < FIELD_STEPS; t++) {
      k.step();
      if (t === 49) early = k.ema;
      if (t >= FIELD_STEPS - 80) {
        H.push(k.policyEntropy);
        B.push(k.branching);
      }
    }
    return { early, late: k.ema, foods: k.foods, lives: k.lives, meanH: mean(H), meanB: mean(B) };
  });
}

function runRooms(seed: number, features: LoopFeatures) {
  return withSeed(seed * 10007 + 5, () => {
    const k = new Kernel("rooms", seed, features);
    for (let t = 0; t < FIELD_STEPS; t++) k.step();
    return { foods: k.foods, lives: k.lives };
  });
}

function runStreamDetailed(kind: StreamKind, seed: number) {
  const tag = kind === "noise" ? 9 : 3;
  return withSeed(seed * 10007 + tag, () => {
    const s = new StreamKernel(kind, seed);
    const earlyC: number[] = [];
    const lateC: number[] = [];
    let early = 0;
    for (let t = 0; t < STREAM_STEPS; t++) {
      s.step();
      if (t === 40) early = s.loop.ema;
      const c = s.loop.commitment;
      if (t < 40) earlyC.push(c);
      if (t >= STREAM_STEPS - 60) lateC.push(c);
    }
    return { early, late: s.loop.ema, commitEarly: mean(earlyC), commitLate: mean(lateC) };
  });
}

export function measureSeed(seed: number, features: LoopFeatures): SeedMetrics {
  const field = runField(seed, features);
  const rooms = runRooms(seed, features);
  const structured = runStreamDetailed("structured", seed);
  const noise = runStreamDetailed("noise", seed);
  const food = withSeed(seed * 10007 + 11, () => adjacentFood(seed, features));
  const g1 = g1Pass(field.early, field.late);
  const g2 = g2Pass(food.action, food.foods, food.x);
  const s1 = s1Pass(structured.early, structured.late);
  const s2 = s2Pass(noise.late);
  const s3 = s3Pass(structured.late, noise.late);
  const c1 = c1Pass(structured.commitEarly, structured.commitLate, noise.commitLate);
  const c2 = c2Pass(field.meanB);
  return {
    seed,
    fieldEarly: field.early,
    fieldLate: field.late,
    fieldFoods: field.foods,
    fieldLives: field.lives,
    roomsFoods: rooms.foods,
    roomsLives: rooms.lives,
    structEarly: structured.early,
    structLate: structured.late,
    noiseEarly: noise.early,
    noiseLate: noise.late,
    structCommitEarly: structured.commitEarly,
    structCommitLate: structured.commitLate,
    noiseCommitLate: noise.commitLate,
    meanB: field.meanB,
    meanH: field.meanH,
    g2Action: food.action,
    g2Foods: food.foods,
    g2x: food.x,
    g1,
    g2,
    s1,
    s2,
    s3,
    c1,
    c2,
  };
}

function majority(flags: boolean[]) {
  let n = 0;
  for (const flag of flags) if (flag) n += 1;
  return n * 2 > flags.length;
}

export function summarize(name: string, features: LoopFeatures, seeds: SeedMetrics[]): ConfigReport {
  const meanOf = (pick: (row: SeedMetrics) => number) => mean(seeds.map(pick));
  const passes = {} as Record<ClaimId, boolean>;
  const passCount = {} as Record<ClaimId, number>;
  for (const id of CLAIM_IDS) {
    const flags = seeds.map((row) => row[id]);
    passCount[id] = flags.filter(Boolean).length;
    passes[id] = majority(flags);
  }
  return {
    name,
    features,
    seeds,
    mean: {
      fieldEarly: meanOf((row) => row.fieldEarly),
      fieldLate: meanOf((row) => row.fieldLate),
      fieldFoods: meanOf((row) => row.fieldFoods),
      fieldLives: meanOf((row) => row.fieldLives),
      roomsFoods: meanOf((row) => row.roomsFoods),
      roomsLives: meanOf((row) => row.roomsLives),
      structLate: meanOf((row) => row.structLate),
      noiseLate: meanOf((row) => row.noiseLate),
      meanB: meanOf((row) => row.meanB),
    },
    passes,
    passCount,
  };
}

export type BenchConfig = { name: string; features: LoopFeatures };

/** Default stack, plus one flip of each flag. That is the ablation set. */
export function ablationConfigs(base?: Partial<LoopFeatures>): BenchConfig[] {
  const features = resolveLoopFeatures(base);
  const configs: BenchConfig[] = [{ name: "default", features }];
  for (const key of LOOP_FEATURE_KEYS) {
    const flipped: LoopFeatures = { ...features, [key]: !features[key] };
    configs.push({ name: features[key] ? `off-${key}` : `on-${key}`, features: flipped });
  }
  return configs;
}

export function measureConfig(config: BenchConfig, seeds: readonly number[] = BENCH_SEEDS): ConfigReport {
  const rows = seeds.map((seed) => measureSeed(seed, config.features));
  return summarize(config.name, config.features, rows);
}
