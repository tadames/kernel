/**
 * Falsifiable claims. If these fail, the kernel is not doing what it says.
 */
import { Kernel, SIZE } from "./kernel.ts";
import { runStream } from "./stream.ts";

export type Claim = {
  id: string;
  claim: string;
  pass: boolean;
  detail: string;
};

export function gridSurprise(seed = 7, steps = 280) {
  const k = new Kernel("field", seed);
  for (let i = 0; i < 50; i++) k.step();
  const early = k.ema;
  for (let i = 0; i < steps - 50; i++) k.step();
  return { early, late: k.ema, foods: k.foods, age: k.age };
}

/** Hungry body, food in the adjacent cell. Whiskers should take it. */
export function adjacentFood(seed = 2) {
  const k = new Kernel("blank", seed);
  k.cells.fill(0);
  for (let i = 0; i < SIZE; i++) {
    k.cells[i] = 1;
    k.cells[(SIZE - 1) * SIZE + i] = 1;
    k.cells[i * SIZE] = 1;
    k.cells[i * SIZE + SIZE - 1] = 1;
  }
  k.x = 5;
  k.y = 7;
  k.energy = 20;
  k.scent.fill(0);
  k.cells[7 * SIZE + 6] = 2;
  k.params = { lr: 0.03, curiosity: 0, goal: 2, temperature: 0.04 };
  k.loop.prevInput = null;
  k.lastObs = k.sense();
  k.step();
  return { action: k.lastAction, foods: k.foods, x: k.x, y: k.y };
}

export function evaluateClaims(): Claim[] {
  const grid = gridSurprise();
  const food = adjacentFood();
  const structured = runStream("structured");
  const noise = runStream("noise");

  const structureFalls = structured.late < 0.05 || structured.late < structured.early * 0.25;
  const noiseHolds = noise.late > 0.15;
  const structuredBetter = structured.late < noise.late * 0.35;
  const gridFalls = grid.late < grid.early * 0.85 || grid.late < 0.14;
  const tookFood = food.action === 1 || food.foods > 0 || food.x === 6;

  return [
    {
      id: "G1",
      claim: "On a structured grid, surprise falls. The compressor finds regularities.",
      pass: gridFalls,
      detail: `field ema ${grid.early.toFixed(3)} → ${grid.late.toFixed(3)}`,
    },
    {
      id: "G2",
      claim: "A hungry body takes food in the adjacent cell. Sensing, not a half-plane radar.",
      pass: tookFood,
      detail: `action ${food.action} at ${food.x},${food.y} meals ${food.foods}`,
    },
    {
      id: "S1",
      claim: "The same loop compresses a repeating bit stream (next-bit prediction).",
      pass: structureFalls,
      detail: `structured ema ${structured.early.toFixed(3)} → ${structured.late.toFixed(3)}`,
    },
    {
      id: "S2",
      claim: "The same loop does not compress white noise. Surprise is not a reward.",
      pass: noiseHolds,
      detail: `noise ema ${noise.early.toFixed(3)} → ${noise.late.toFixed(3)}`,
    },
    {
      id: "S3",
      claim: "Structure is much cheaper than noise. Compression progress distinguishes them.",
      pass: structuredBetter,
      detail: `structured ${structured.late.toFixed(3)} vs noise ${noise.late.toFixed(3)}`,
    },
  ];
}
