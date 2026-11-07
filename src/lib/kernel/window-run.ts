/**
 * One seed of the ceiling door, with the Bernoulli residual and the
 * realized squared error of the same predicted window. Workers import
 * this. The sweep is not part of CI.
 *
 * The rate is the published ceiling, 0.94. The gap is drift minus held.
 * The plant is not computed. The weight split is a checksum.
 */
import { SCORE_PIECE_NAMES, runDriftWindowDoor, type SignalGaps } from "./atlas-run.ts";
import { CEILING_RATE } from "./window.ts";
import { windowResidualGain } from "./window.ts";
import { PHASE_EXPLORERS, type PhaseExplorer } from "./phase-diagram.ts";

export type WindowSample = {
  id: number;
  seed: number;
  logit: SignalGaps;
  bonus: SignalGaps;
  raw: number;
  /** Shared uncertainty weight, drift minus held. */
  uncertainty: number;
  /** Bernoulli residual of the predicted window, drift minus held. */
  residual: number;
  /** Realized squared error of that same window. Equals `raw`. */
  squared: number;
  /** Covariance with the realized bits. */
  align: number;
  /** `squared + residual / 4`. Equals `-2 * align` when the bits are 0 or 1. */
  gap: number;
  /** The score's residual weight is the gain times this window's residual. */
  matched: boolean;
};

export type WindowJob = { id: number; seed: number };

const SHARED: PhaseExplorer[] = ["count", "surprise", "rnd", "rho"];

export function assertWindowRate() {
  if (CEILING_RATE !== 0.94) throw new Error(`window rate ${CEILING_RATE} is not the published ceiling`);
  return CEILING_RATE;
}

export function runWindowSample(id: number, seed: number): WindowSample {
  const rate = assertWindowRate();
  const scored = runDriftWindowDoor(seed, rate);
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
  }
  if (scored.door.bonus.count !== 0) throw new Error(`seed ${seed} count bonus moved`);
  if (scored.door.logit.random !== 0) throw new Error(`seed ${seed} random logit moved`);
  const residual = scored.windowResidual;
  const squared = scored.windowSquared;
  const align = scored.align;
  const gap = squared + residual / 4;
  if (Math.abs(gap + 2 * align) > 1e-6) throw new Error(`seed ${seed} gap ${gap} left alignment ${align}`);
  if (Math.abs(squared - scored.door.raw) > 1e-9) {
    throw new Error(`seed ${seed} squared ${squared} left realized error ${scored.door.raw}`);
  }
  const weight = windowResidualGain(1) * residual;
  const matched = Math.abs(uncertainty - weight) <= 1e-6 && Math.abs(squared - scored.door.raw) <= 1e-9;
  if (!Number.isFinite(residual) || !Number.isFinite(squared) || !Number.isFinite(align) || !Number.isFinite(gap)) {
    throw new Error(`seed ${seed} window is not finite`);
  }
  return {
    id,
    seed,
    logit: scored.door.logit,
    bonus: scored.door.bonus,
    raw: scored.door.raw,
    uncertainty,
    residual,
    squared,
    align,
    gap,
    matched,
  };
}

export function runWindowJob(job: WindowJob): WindowSample {
  return runWindowSample(job.id, job.seed);
}
