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

function valueOf(
  v: PredRead,
  curiosity: number,
  goal: number,
  learning: number,
  confidence: number,
): number {
  const curious =
    curiosity * (0.75 * v.novelty * (0.35 + 12 * learning) + 0.2 * v.novelty);
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
  /** One-step prediction from current state + action. */
  predict: (a: number, into: Float32Array) => Float32Array;
  /** Score a predicted observation under action a (may use true whiskers). */
  read: (pred: Float32Array, a: number) => PredRead;
  /**
   * Optional second-step imagination. Given first-step pred and second action,
   * return the next predicted window. When provided, horizon is 2.
   */
  predictFrom?: (pred: Float32Array, a1: number, into: Float32Array) => Float32Array;
  /**
   * Read purely from a predicted window (no true sensors). Used for step 2.
   */
  readPred?: (pred: Float32Array, a: number) => PredRead;
  /** Discount on the second step. Default 0.65. */
  discount?: number;
  /** Scratch buffer for second-step predictions (one per first action). */
  imagined2?: Float32Array[];
}): Float32Array {
  // Untrained sigmoid outputs sit near 0.5. Do not treat them as walls.
  const confidence = Math.max(0, Math.min(1, 1 - opts.ema / 0.4));
  const learning = Math.max(0, opts.progressEma);
  const disc = opts.discount ?? 0.65;
  const twoStep = Boolean(opts.predictFrom && opts.readPred && opts.imagined2);

  for (let a = 0; a < opts.acts; a++) {
    const pred = opts.predict(a, opts.imagined[a]);
    const v = opts.read(pred, a);
    let score = valueOf(v, opts.curiosity, opts.goal, learning, confidence);

    if (twoStep) {
      // Best follow-up from the imagined window (greedy, pure model).
      let best2 = -Infinity;
      const into2 = opts.imagined2![a];
      for (let a1 = 0; a1 < opts.acts; a1++) {
        const pred2 = opts.predictFrom!(pred, a1, into2);
        const v2 = opts.readPred!(pred2, a1);
        const s2 = valueOf(v2, opts.curiosity, opts.goal, learning, confidence);
        if (s2 > best2) best2 = s2;
      }
      // Gate the second step harder: uncalibrated models should not plan deep.
      score += disc * confidence * best2;
    }

    opts.scores[a] = score;
  }
  return opts.scores;
}
