import { Loop } from "./loop.ts";

declare module "./loop.ts" {
  interface Loop {
    scentRhoHat(fromCell: number, toCell: number): number;
  }
}

/**
 * Action-conditional scent ρ̂: drop in per-cell family-2 residual
 * from the current cell to the destination. Zero when the novelty
 * gate is shut, so noise never pays. Plan ρ stays family-2-zero;
 * this term is only mixed into imagination ρ̂.
 */
Loop.prototype.scentRhoHat = function scentRhoHat(fromCell: number, toCell: number): number {
  if (this.scentNovelty(toCell) <= 0) return 0;
  const n = this.scentCells;
  const a = Math.max(0, Math.min(n - 1, fromCell | 0));
  const b = Math.max(0, Math.min(n - 1, toCell | 0));
  const ra = this.residualEma[a * 3 + 2];
  const rb = this.residualEma[b * 3 + 2];
  return Math.max(0, ra - rb);
};
