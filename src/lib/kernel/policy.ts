/**
 * Action selection from the world model only.
 *
 * The policy may not inspect the current observation for goals (no "food
 * radar", no hand-coded scan). It imagines each action, reads predicted
 * reward / cost / novelty from the predicted observation, and samples.
 *
 * Compression progress ρ is not action-conditional yet — that needs a model
 * of learning (Phase 1). Here ρ scales how much novelty is worth: if the
 * compressor has stopped improving, novelty is probably noise.
 */
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
  novelty: number;
};

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
}): Float32Array {
  // Untrained sigmoid outputs sit near 0.5. Do not treat them as walls.
  const confidence = Math.max(0, Math.min(1, 1 - opts.ema / 0.4));
  const learning = Math.max(0, opts.progressEma);
  for (let a = 0; a < opts.acts; a++) {
    const pred = opts.predict(a, opts.imagined[a]);
    const v = opts.read(pred, a);
    // Novelty is cheap on noise. Weight it by recent compression progress
    // so an incompressible region goes stale.
    const curious = opts.curiosity * (0.75 * v.novelty * (0.35 + 12 * learning) + 0.2 * v.novelty);
    const goal = opts.goal * v.reward * (0.2 + 0.8 * confidence);
    const cost = v.cost * (0.15 + 0.85 * confidence);
    opts.scores[a] = curious + goal - cost;
  }
  return opts.scores;
}
