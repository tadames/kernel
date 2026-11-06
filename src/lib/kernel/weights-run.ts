/**
 * One seed of the ceiling door, with the uncertainty term split into the
 * residual weight and the novelty weight. Workers import this. The sweep
 * is not part of CI.
 *
 * The rate is the published ceiling, 0.94. The gap is drift minus held.
 * The plant is not computed. ρ̂ is not split.
 */
import { SCORE_PIECE_NAMES, runDriftWeightDoor, type SignalGaps } from "./atlas-run.ts";
import { CEILING_RATE } from "./weights.ts";
import { PHASE_EXPLORERS, type PhaseExplorer } from "./phase-diagram.ts";

export type WeightsSample = {
  id: number;
  seed: number;
  logit: SignalGaps;
  bonus: SignalGaps;
  raw: number;
  /** Shared uncertainty gap, drift minus held. The two weights sum to it. */
  uncertainty: number;
  residual: number;
  novelty: number;
};

export type WeightsJob = { id: number; seed: number };

const SHARED: PhaseExplorer[] = ["count", "surprise", "rnd", "rho"];

export function assertWeightsRate() {
  if (CEILING_RATE !== 0.94) throw new Error(`weights rate ${CEILING_RATE} is not the published ceiling`);
  return CEILING_RATE;
}

export function runWeightsSample(id: number, seed: number): WeightsSample {
  const rate = assertWeightsRate();
  const scored = runDriftWeightDoor(seed, rate);
  for (const signal of PHASE_EXPLORERS) {
    const row = scored.driftPieces[signal];
    const held = scored.heldPieces[signal];
    for (const name of SCORE_PIECE_NAMES) {
      if (!Number.isFinite(row[name]) || !Number.isFinite(held[name])) {
        throw new Error(`seed ${seed} ${signal} ${name} is not finite`);
      }
    }
    if (Math.abs(row.extra) > 1e-9 || Math.abs(held.extra) > 1e-9) {
      throw new Error(`seed ${seed} ${signal} wrote a place bonus`);
    }
    if (signal === "random") {
      for (const name of SCORE_PIECE_NAMES) {
        if (row[name] !== 0 || held[name] !== 0) throw new Error(`seed ${seed} random ${name} moved`);
      }
    }
  }
  const uncertainty = scored.driftPieces.rho.uncertainty - scored.heldPieces.rho.uncertainty;
  if (Math.abs(scored.residual + scored.novelty - uncertainty) > 1e-6) {
    throw new Error(`seed ${seed} weights ${scored.residual + scored.novelty} left uncertainty ${uncertainty}`);
  }
  for (const signal of SHARED) {
    const gap = scored.driftPieces[signal].uncertainty - scored.heldPieces[signal].uncertainty;
    if (Math.abs(gap - uncertainty) > 1e-6) {
      throw new Error(`seed ${seed} ${signal} uncertainty gap left the shared door`);
    }
    if (signal !== "rho" && Math.abs(scored.driftPieces[signal].global) > 1e-9) {
      throw new Error(`seed ${seed} ${signal} global progress moved`);
    }
    if (signal !== "rho" && Math.abs(scored.heldPieces[signal].global) > 1e-9) {
      throw new Error(`seed ${seed} ${signal} held global progress moved`);
    }
  }
  if (scored.door.bonus.count !== 0) throw new Error(`seed ${seed} count bonus moved`);
  if (scored.door.logit.random !== 0) throw new Error(`seed ${seed} random logit moved`);
  if (!Number.isFinite(scored.residual) || !Number.isFinite(scored.novelty)) {
    throw new Error(`seed ${seed} weight is not finite`);
  }
  return {
    id,
    seed,
    logit: scored.door.logit,
    bonus: scored.door.bonus,
    raw: scored.door.raw,
    uncertainty,
    residual: scored.residual,
    novelty: scored.novelty,
  };
}

export function runWeightsJob(job: WeightsJob): WeightsSample {
  return runWeightsSample(job.id, job.seed);
}
