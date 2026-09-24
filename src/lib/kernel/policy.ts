/**
 * Action selection from the world model only.
 *
 * The policy may not inspect the current observation for goals (no "food
 * radar", no hand-coded scan). It imagines each action, reads predicted
 * reward / cost / novelty from the predicted observation, and samples.
 *
 * Horizon 2: after the first imagined step, score the best follow-up from the
 * predicted window (pure model, no true whiskers). Discounted. Early on the
 * model is uncalibrated so confidence still gates the imagined terms.
 *
 * Curiosity is compression-progress. The intrinsic term is primarily the
 * model's own expected residual (Bernoulli variance of the predicted window).
 * Visit-scent is a light prior. Global recent progress ρ still scales, but
 * when horizon 2 is on we also use an action-conditional ρ̂: the drop in
 * expected residual from step-1 window to the best step-2 window. Prefer
 * moves the model itself expects to make more certain. A second loop on
 * hidden activations (true model-of-learning) remains Phase 1.
 */

import "./scent-rho-hat.ts";

export function softmaxSample(
  logits: Float32Array,
  temperature: number,
  rng: () => number = Math.random,
) {
  const t = Math.max(0.05, temperature);
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i];
  const ex = new Float32Array(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    const v = Math.exp((logits[i] - max) / t);
    ex[i] = v;
    sum += v;
  }
  let r = rng() * sum;
  for (let i = 0; i < ex.length; i++) {
    r -= ex[i];
    if (r <= 0) return i;
  }
  return ex.length - 1;
}

export type PredRead = {
  reward: number;
  cost: number;
  /** Visit-scent novelty in [0,1]. Light prior only. */
  novelty: number;
};

/**
 * Expected residual under a Bernoulli reading of sigmoid outputs.
 * Peaks when the model is uncertain (p ≈ 0.5). This is the model-based
 * stand-in for "how much could I still learn here" before a true ρ̂.
 */
export function expectedResidual(pred: Float32Array, weightAt?: (i: number) => number): number {
  let s = 0;
  let den = 0;
  for (let i = 0; i < pred.length; i++) {
    const w = weightAt ? weightAt(i) : 1;
    const p = pred[i];
    s += w * p * (1 - p);
    den += w;
  }
  if (den < 1e-8) return 0;
  return (s / den) * 4;
}

function valueOf(
  v: PredRead,
  pred: Float32Array,
  curiosity: number,
  goal: number,
  learning: number,
  confidence: number,
  rhoHat = 0,
  residualWeight?: (i: number) => number,
): number {
  const residual = expectedResidual(pred, residualWeight);
  const explore = 0.7 * residual + 0.3 * v.novelty;
  const prog = Math.max(0, learning) + 0.55 * Math.max(0, rhoHat);
  const curious =
    curiosity * (0.75 * explore * (0.35 + 12 * prog) + 0.2 * explore);
  const g = goal * v.reward * (0.2 + 0.8 * confidence);
  const cost = v.cost * (0.15 + 0.85 * confidence);
  return curious + g - cost;
}

export function imagineScores(opts: {
  acts: number;
  curiosity: number;
  goal: number;
  progressEma: number;
  ema: number;
  imagined: Float32Array[];
  scores: Float32Array;
  predict: (a: number, into: Float32Array) => Float32Array;
  read: (pred: Float32Array, a: number) => PredRead;
  predictFrom?: (pred: Float32Array, a1: number, into: Float32Array) => Float32Array;
  readPred?: (pred: Float32Array, a: number) => PredRead;
  discount?: number;
  imagined2?: Float32Array[];
  residualWeight?: (i: number) => number;
  progressBonus?: (a: number, pred: Float32Array) => number;
}): Float32Array {
  const confidence = Math.max(0, Math.min(1, 1 - opts.ema / 0.4));
  const learning = Math.max(0, opts.progressEma);
  const disc = opts.discount ?? 0.65;
  const twoStep = Boolean(opts.predictFrom && opts.readPred && opts.imagined2);

  for (let a = 0; a < opts.acts; a++) {
    const pred = opts.predict(a, opts.imagined[a]);
    const v = opts.read(pred, a);
    const res1 = expectedResidual(pred, opts.residualWeight);
    let rhoHat = opts.progressBonus ? Math.max(0, opts.progressBonus(a, pred)) : 0;

    if (twoStep) {
      let best2 = -Infinity;
      let bestRes2 = res1;
      const into2 = opts.imagined2![a];
      for (let a1 = 0; a1 < opts.acts; a1++) {
        const pred2 = opts.predictFrom!(pred, a1, into2);
        const v2 = opts.readPred!(pred2, a1);
        const s2 = valueOf(v2, pred2, opts.curiosity, opts.goal, learning, confidence, 0, opts.residualWeight);
        if (s2 > best2) {
          best2 = s2;
          bestRes2 = expectedResidual(pred2, opts.residualWeight);
        }
      }
      rhoHat += Math.max(0, res1 - bestRes2);
      const score1 = valueOf(v, pred, opts.curiosity, opts.goal, learning, confidence, rhoHat, opts.residualWeight);
      opts.scores[a] = score1 + disc * confidence * best2;
    } else {
      opts.scores[a] = valueOf(v, pred, opts.curiosity, opts.goal, learning, confidence, rhoHat, opts.residualWeight);
    }
  }
  return opts.scores;
}
