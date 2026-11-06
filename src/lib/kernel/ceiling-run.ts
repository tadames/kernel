/**
 * One seed of the ceiling door. Workers import this.
 * The sweep is not part of CI.
 *
 * The fast rate is the published 16× cell. The ceiling rate is 0.94.
 * Both are drift minus held on the atlas door. They share a weight init:
 * the rate is not in that stream.
 */
import { runDriftDoor, type AtlasGaps } from "./atlas-run.ts";
import {
  CEILING_RATE,
  DOOR_RATE_LIMIT,
  FAST_RATE,
  type CeilingLevel,
} from "./ceiling.ts";

export type CeilingSample = {
  id: number;
  seed: number;
  fast: AtlasGaps;
  ceiling: AtlasGaps;
};

export type CeilingJob = { id: number; seed: number };

export function assertCeilingRates() {
  if (FAST_RATE !== 0.3003) throw new Error(`fast rate ${FAST_RATE} is not the published 16× cell`);
  if (CEILING_RATE !== 0.94) throw new Error(`ceiling rate ${CEILING_RATE} is not the locked rate`);
  if (!(CEILING_RATE > FAST_RATE) || !(CEILING_RATE < DOOR_RATE_LIMIT)) {
    throw new Error(`ceiling rate ${CEILING_RATE} is not between ${FAST_RATE} and ${DOOR_RATE_LIMIT}`);
  }
  return { fast: FAST_RATE, ceiling: CEILING_RATE };
}

export function runCeilingSample(id: number, seed: number): CeilingSample {
  const rates = assertCeilingRates();
  const doors: Record<CeilingLevel, AtlasGaps> = {
    fast: runDriftDoor(seed, rates.fast),
    ceiling: runDriftDoor(seed, rates.ceiling),
  };
  return { id, seed, fast: doors.fast, ceiling: doors.ceiling };
}

export function runCeilingJob(job: CeilingJob): CeilingSample {
  return runCeilingSample(job.id, job.seed);
}
