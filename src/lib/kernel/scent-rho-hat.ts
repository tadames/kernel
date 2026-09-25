import { Loop } from "./loop.ts";

declare module "./loop.ts" {
  interface Loop {
    scentRhoHat(fromCell: number, toCell: number): number;
    predictedScentResidual(cell: number): number;
  }
}

/**
 * Side-head predicted residual at a cell. scentPred is residual-space
 * (0.5 = skip). Bernoulli variance y(1−y) peaks on the mean prior.
 */
Loop.prototype.predictedScentResidual = function predictedScentResidual(cell: number): number {
  if (this.scentCells <= 0) return 0;
  const c = Math.max(0, Math.min(this.scentCells - 1, cell | 0));
  const y = this.scentPred[c];
  return y * (1 - y);
};

/**
 * Action-conditional scent ρ̂: drop in the side head's predicted
 * residual from the current cell to the destination.
 * Zero when the novelty gate is shut, so noise never pays.
 */
Loop.prototype.scentRhoHat = function scentRhoHat(fromCell: number, toCell: number): number {
  if (this.scentNovelty(toCell) <= 0) return 0;
  const ra = this.predictedScentResidual(fromCell);
  const rb = this.predictedScentResidual(toCell);
  return Math.max(0, ra - rb);
};
