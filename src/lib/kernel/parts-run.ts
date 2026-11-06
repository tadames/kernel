/**
 * One seed of the ceiling door, split into the additive score pieces.
 * Workers import this. The sweep is not part of CI.
 *
 * The rate is the published ceiling, 0.94. The gap is drift minus held.
 * The plant is not computed. ρ̂ is not split.
 */
import {
  runDriftPieceDoor,
  SCORE_PIECE_NAMES,
  type ExplorerPieces,
  type ScorePieceGaps,
  type ScorePieceName,
  type SignalGaps,
} from "./atlas-run.ts";
import { CEILING_RATE } from "./parts.ts";
import { PHASE_EXPLORERS, type PhaseExplorer } from "./phase-diagram.ts";

export type PartsSample = {
  id: number;
  seed: number;
  logit: SignalGaps;
  bonus: SignalGaps;
  raw: number;
  /** Drift minus held, one doorway gap per piece. */
  pieces: ExplorerPieces;
  /** Explore-weighted ρ̂ plus global progress. */
  progress: SignalGaps;
  /** Uncertainty plus follow-up plus extrinsic. */
  outside: SignalGaps;
};

export type PartsJob = { id: number; seed: number };

const SHARED: PhaseExplorer[] = ["count", "surprise", "rnd", "rho"];

export function assertPartsRate() {
  if (CEILING_RATE !== 0.94) throw new Error(`parts rate ${CEILING_RATE} is not the published ceiling`);
  return CEILING_RATE;
}

function pieceSum(parts: ScorePieceGaps) {
  let sum = 0;
  for (const name of SCORE_PIECE_NAMES) sum += parts[name];
  return sum;
}

function subPieces(drift: ExplorerPieces, held: ExplorerPieces): ExplorerPieces {
  const out = {} as ExplorerPieces;
  for (const signal of PHASE_EXPLORERS) {
    const gap = {} as ScorePieceGaps;
    for (const name of SCORE_PIECE_NAMES) gap[name] = drift[signal][name] - held[signal][name];
    out[signal] = gap;
  }
  return out;
}

function channel(pieces: ExplorerPieces, names: readonly ScorePieceName[]): SignalGaps {
  const out = {} as SignalGaps;
  for (const signal of PHASE_EXPLORERS) {
    let sum = 0;
    for (const name of names) sum += pieces[signal][name];
    out[signal] = sum;
  }
  return out;
}

function assertArm(seed: number, arm: string, pieces: ExplorerPieces) {
  for (const signal of PHASE_EXPLORERS) {
    const row = pieces[signal];
    if (!Number.isFinite(pieceSum(row))) throw new Error(`seed ${seed} ${arm} ${signal} piece is not finite`);
    if (Math.abs(row.extra) > 1e-9) throw new Error(`seed ${seed} ${arm} ${signal} wrote a place bonus`);
    if (signal === "random") {
      for (const name of SCORE_PIECE_NAMES) {
        if (row[name] !== 0) throw new Error(`seed ${seed} ${arm} random ${name} moved`);
      }
    }
  }
  for (const signal of SHARED) {
    if (signal !== "rho" && Math.abs(pieces[signal].global) > 1e-9) {
      throw new Error(`seed ${seed} ${arm} ${signal} global progress moved`);
    }
  }
  const uncertainty = pieces.count.uncertainty;
  const extrinsic = pieces.count.extrinsic;
  for (const signal of SHARED) {
    if (Math.abs(pieces[signal].uncertainty - uncertainty) > 1e-6) {
      throw new Error(`seed ${seed} ${arm} ${signal} uncertainty left the shared door`);
    }
    if (Math.abs(pieces[signal].extrinsic - extrinsic) > 1e-6) {
      throw new Error(`seed ${seed} ${arm} ${signal} extrinsic left the shared door`);
    }
  }
}

export function runPartsSample(id: number, seed: number): PartsSample {
  const rate = assertPartsRate();
  const scored = runDriftPieceDoor(seed, rate);
  assertArm(seed, "drift", scored.driftPieces);
  assertArm(seed, "held", scored.heldPieces);
  const pieces = subPieces(scored.driftPieces, scored.heldPieces);
  const progress = channel(pieces, ["rho", "global"]);
  const outside = channel(pieces, ["uncertainty", "follow", "extrinsic"]);
  for (const signal of PHASE_EXPLORERS) {
    const sum = progress[signal] + outside[signal] + pieces[signal].extra;
    if (Math.abs(sum - scored.door.logit[signal]) > 1e-6) {
      throw new Error(`seed ${seed} ${signal} gap pieces ${sum} do not match logit ${scored.door.logit[signal]}`);
    }
    if (Math.abs(pieces[signal].extra) > 1e-9) throw new Error(`seed ${seed} ${signal} place bonus gap moved`);
    if (signal === "random") {
      for (const name of SCORE_PIECE_NAMES) {
        if (pieces[signal][name] !== 0) throw new Error(`seed ${seed} random ${name} gap moved`);
      }
    }
    if (signal !== "rho" && signal !== "random" && Math.abs(pieces[signal].global) > 1e-9) {
      throw new Error(`seed ${seed} ${signal} global gap moved`);
    }
  }
  const uncertainty = pieces.count.uncertainty;
  const extrinsic = pieces.count.extrinsic;
  for (const signal of SHARED) {
    if (Math.abs(pieces[signal].uncertainty - uncertainty) > 1e-6) {
      throw new Error(`seed ${seed} ${signal} uncertainty gap left the shared door`);
    }
    if (Math.abs(pieces[signal].extrinsic - extrinsic) > 1e-6) {
      throw new Error(`seed ${seed} ${signal} extrinsic gap left the shared door`);
    }
  }
  if (scored.door.bonus.count !== 0) throw new Error(`seed ${seed} count bonus moved`);
  if (scored.door.logit.random !== 0) throw new Error(`seed ${seed} random logit moved`);
  return {
    id,
    seed,
    logit: scored.door.logit,
    bonus: scored.door.bonus,
    raw: scored.door.raw,
    pieces,
    progress,
    outside,
  };
}

export function runPartsJob(job: PartsJob): PartsSample {
  return runPartsSample(job.id, job.seed);
}
