/**
 * Horizon-2 action scoring: one-step whiskers + best second step from the model.
 */
import { imagineScores, softmaxSample, type PredRead } from "./policy.ts";

export type HorizonDirs = readonly { readonly x: number; readonly y: number }[];

export function chooseHorizon2(opts: {
  obs: Float32Array;
  energy: number;
  curiosity: number;
  goal: number;
  temperature: number;
  progressEma: number;
  ema: number;
  acts: number;
  center: number;
  ch: number;
  r: number;
  view: number;
  dirs: HorizonDirs;
  imagined: Float32Array[];
  imagined2: Float32Array[];
  scores: Float32Array;
  predict: (a: number, into: Float32Array) => Float32Array;
  predictFrom: (pred: Float32Array, a1: number, into: Float32Array) => Float32Array;
  rng: () => number;
}): number {
  const {
    obs, energy, curiosity, goal, temperature, progressEma, ema,
    acts, center, ch, r, view, dirs, imagined, imagined2, scores,
    predict, predictFrom, rng,
  } = opts;
  const hunger = Math.max(0, 1 - energy / 100);
  const readPred = (pred: Float32Array, a: number): PredRead => {
    const stay = a === 4 ? 0.35 : 0;
    return {
      reward: (0.45 + 1.4 * hunger) * pred[center + 1],
      cost: 1.8 * pred[center] + stay,
      novelty: 1 - pred[center + 2],
    };
  };
  imagineScores({
    acts,
    curiosity,
    goal,
    progressEma,
    ema,
    imagined,
    imagined2,
    scores,
    discount: 0.65,
    predict,
    predictFrom,
    read: (pred, a) => {
      const tx = r + dirs[a].x;
      const ty = r + dirs[a].y;
      const ti = (ty * view + tx) * ch;
      const visWall = a === 4 ? 0 : obs[ti];
      const visFood = a === 4 ? obs[center + 1] : obs[ti + 1];
      const visScent = a === 4 ? obs[center + 2] : obs[ti + 2];
      const stay = a === 4 ? 0.35 : 0;
      return {
        reward: (0.45 + 1.4 * hunger) * (visFood + 0.55 * pred[center + 1]),
        cost: 6.5 * visWall + 1.8 * pred[center] + stay,
        novelty: 1 - visScent,
      };
    },
    readPred,
  });
  return softmaxSample(scores, temperature, rng);
}
