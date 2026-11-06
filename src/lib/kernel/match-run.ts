/**
 * One seed of the matched-dose door. Workers import this.
 * The sweep is not part of CI.
 *
 * The rate is the published ceiling, 0.94. The door is drift minus held.
 * The plant puts that seed's progress-channel dose on the held brain.
 */
import { runDoseMatch, type DoseMatch } from "./atlas-run.ts";
import { CEILING_RATE } from "./match.ts";

export type MatchSample = DoseMatch & {
  id: number;
  seed: number;
};

export type MatchJob = { id: number; seed: number };

export function assertMatchRate() {
  if (CEILING_RATE !== 0.94) throw new Error(`match rate ${CEILING_RATE} is not the published ceiling`);
  return CEILING_RATE;
}

export function runMatchSample(id: number, seed: number): MatchSample {
  const rate = assertMatchRate();
  return { id, seed, ...runDoseMatch(seed, rate) };
}

export function runMatchJob(job: MatchJob): MatchSample {
  return runMatchSample(job.id, job.seed);
}
