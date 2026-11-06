/**
 * One seed of the door-logit drift ladder. Workers import this.
 * The sweep is not part of CI.
 *
 * Each rate is the atlas drift door: fresh weights, 400 steps on the
 * cycle map, drift minus held. The adaptation-rate cell is that door
 * at 0.01877 and must match the published sample.
 */
import { ATLAS_DRIFT } from "./atlas.ts";
import { runDriftDoor, type AtlasGaps } from "./atlas-run.ts";
import { RATE_LEVELS, rateLadder, type RateLevel } from "./rate.ts";

export type RateSample = {
  id: number;
  seed: number;
  doors: Record<RateLevel, AtlasGaps>;
};

export type RateJob = { id: number; seed: number };

export function assertRateLadder() {
  const ladder = rateLadder();
  if (ladder.length !== RATE_LEVELS.length) throw new Error(`rate ladder has ${ladder.length} cells`);
  const at = ladder.find((cell) => cell.level === "at");
  if (!at || at.rate !== 0.01877 || at.rate !== ATLAS_DRIFT) {
    throw new Error(`rate ladder at-cell is ${at?.rate}`);
  }
  const expected = [0.001173, 0.004692, 0.01877, 0.07507, 0.3003];
  ladder.forEach((cell, i) => {
    if (cell.rate !== expected[i]) throw new Error(`rate ladder ${cell.level} is ${cell.rate}, not ${expected[i]}`);
  });
  return ladder;
}

export function runRateSample(id: number, seed: number): RateSample {
  const ladder = assertRateLadder();
  const doors = {} as Record<RateLevel, AtlasGaps>;
  for (const cell of ladder) doors[cell.level] = runDriftDoor(seed, cell.rate);
  return { id, seed, doors };
}

export function runRateJob(job: RateJob): RateSample {
  return runRateSample(job.id, job.seed);
}
