import { Loop } from "./loop.ts";

/**
 * Kept so older imports still attach the side-head helpers. The methods
 * live on Loop itself — a side-effect import is stripped from the production
 * bundle (`sideEffects: false`), which left choose() calling a missing function.
 */
Loop.prototype.predictedScentResidual = function predictedScentResidual(cell: number): number {
  if (this.scentCells <= 0) return 0;
  const c = Math.max(0, Math.min(this.scentCells - 1, cell | 0));
  const y = this.scentPred[c];
  return y * (1 - y);
};

Loop.prototype.scentRhoHat = function scentRhoHat(fromCell: number, toCell: number): number {
  if (this.scentNovelty(toCell) <= 0) return 0;
  const ra = this.predictedScentResidual(fromCell);
  const rb = this.predictedScentResidual(toCell);
  return Math.max(0, ra - rb);
};
