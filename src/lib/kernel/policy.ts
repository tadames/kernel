/**
 * Action selection from the world model only.
 *
 * The policy may not inspect the current observation for goals (no "food
 * radar", no hand-coded scan). It imagines each action, reads predicted
 * reward / cost / novelty from the predicted observation, and samples.
 *
 * Horizon 3: after the first imagined step, score the best follow-up from the
 * predicted window, then one more from that second window. Discounted.
 * Early on the model is uncalibrated so confidence still gates the imagined terms.
 *
 * Curiosity is compression-progress. The intrinsic term is primarily the
 * model's own expected residual (Bernoulli variance of the predicted window).
 * Visit-scent is a light prior. Global recent progress ρ still scales, but
 * when horizon ≥2 is on we also use an action-conditional ρ̂: the drop in
 * expected residual from step-1 to the best later window. Prefer
 * moves the model itself expects to make more certain. A third step lets
 * ρ̂ look past a wall, and only runs once ema is under the gate. A second
 * loop predicts the next hidden state; its progress is mixed into learning
 * by the caller once the latent is compressing. A slower code one level up
 * is mixed the same way, and only after both codes are compressing. Its ρ̂ can score one imagined latent step against the current code.
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

/**
 * Weight of action-conditional ρ̂ inside the progress channel.
 * `prog = max(0, learning) + progExtra + RHO_HAT_PROG_WEIGHT * max(0, ρ̂)`.
 */
export const RHO_HAT_PROG_WEIGHT = 0.55;

/** Additive pieces of one action's score. Present only when a sweep asks. */
export type ScoreParts = {
  /** `curiosity * explore * 0.75 * 12 * RHO_HAT_PROG_WEIGHT * max(0, ρ̂)`. */
  rho: Float32Array;
  /** `curiosity * explore * 0.75 * 12 * max(0, learning)`. Global progress, gated by explore. */
  global: Float32Array;
  /** `curiosity * (0.75 * explore * 0.35 + 0.2 * explore)`. No progress. */
  uncertainty: Float32Array;
  /** `curiosity * explore * 0.75 * 12 * progExtra`. Zero unless a place bonus is on. */
  extra: Float32Array;
  /** Goal minus cost on this first action. */
  extrinsic: Float32Array;
  /** Discounted follow-up value. Zero when imagination is one step. */
  follow: Float32Array;
  /** `max(0, ρ̂)` that entered the progress channel, before the explore weight. */
  rhoHat: Float32Array;
};

/**
 * Additive pieces of ρ̂. Each is already rectified, so they sum to the
 * `max(0, ρ̂)` that enters the score. Omitted from the score path.
 */
export type RhoHatParts = {
  /** `max(0, progressBonus)`. For rho this is the scent residual drop. */
  bonus: Float32Array;
  /** `max(0, res1 − bestRes2)` when the horizon drop is on, else 0. */
  drop2: Float32Array;
  /** `max(0, bestRes2 − bestRes3)` when the third step runs, else 0. */
  drop3: Float32Array;
};

export function emptyRhoHatParts(acts: number): RhoHatParts {
  return {
    bonus: new Float32Array(acts),
    drop2: new Float32Array(acts),
    drop3: new Float32Array(acts),
  };
}

/**
 * Residuals behind the horizon-2 drop. Omitted from the score path.
 * `best` is the follow-up whose score strictly won. `mean`, `min`, and
 * `max` are that same follow-up set, unweighted.
 */
export type RhoDropTrace = {
  /** Bernoulli residual of the first imagined window. */
  res1: Float32Array;
  /** Residual of the score-winning follow-up. Equals `res1` when horizon 2 is off. */
  best: Float32Array;
  /** Unweighted mean residual across follow-up actions. */
  mean: Float32Array;
  /** Lowest follow-up residual. */
  min: Float32Array;
  /** Highest follow-up residual. */
  max: Float32Array;
};

export function emptyRhoDropTrace(acts: number): RhoDropTrace {
  return {
    res1: new Float32Array(acts),
    best: new Float32Array(acts),
    mean: new Float32Array(acts),
    min: new Float32Array(acts),
    max: new Float32Array(acts),
  };
}

export function emptyScoreParts(acts: number): ScoreParts {
  return {
    rho: new Float32Array(acts),
    global: new Float32Array(acts),
    uncertainty: new Float32Array(acts),
    extra: new Float32Array(acts),
    extrinsic: new Float32Array(acts),
    follow: new Float32Array(acts),
    rhoHat: new Float32Array(acts),
  };
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
  uncertainty = true,
  progExtra = 0,
  sink?: { parts: ScoreParts; action: number },
): number {
  // Uncertainty is the Bernoulli residual. Off leaves visit-scent as the only explore term.
  const residual = uncertainty ? expectedResidual(pred, residualWeight) : 0;
  const explore = 0.7 * residual + 0.3 * v.novelty;
  // progExtra is a measurement hook. Zero is the shipped progress channel.
  const learned = Math.max(0, learning);
  const hat = Math.max(0, rhoHat);
  const prog = learned + progExtra + RHO_HAT_PROG_WEIGHT * hat;
  const curious =
    curiosity * (0.75 * explore * (0.35 + 12 * prog) + 0.2 * explore);
  const g = goal * v.reward * (0.2 + 0.8 * confidence);
  const cost = v.cost * (0.15 + 0.85 * confidence);
  if (sink) {
    const c = curiosity;
    const e = explore;
    const parts = sink.parts;
    const action = sink.action;
    parts.rho[action] = c * e * 0.75 * 12 * RHO_HAT_PROG_WEIGHT * hat;
    parts.global[action] = c * e * 0.75 * 12 * learned;
    parts.uncertainty[action] = c * (0.75 * e * 0.35 + 0.2 * e);
    parts.extra[action] = c * e * 0.75 * 12 * progExtra;
    parts.extrinsic[action] = g - cost;
    parts.rhoHat[action] = hat;
  }
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
  imagined3?: Float32Array[];
  residualWeight?: (i: number) => number;
  progressBonus?: (a: number, pred: Float32Array) => number;
  /** Gate the third imagined window until the model is calibrated. */
  horizon3Ema?: number;
  /**
   * Add the imagined residual drop to rho-hat. On for the rho signal.
   * Baselines leave it off so their bonus is only the curiosity term.
   * Omitted means on, which is the historical rho path.
   */
  horizonRho?: boolean;
  /**
   * Bernoulli expected residual in the explore mix. Omitted means on.
   * Off is a measurement arm: progress still scales whatever explore remains.
   */
  uncertainty?: boolean;
  /**
   * Added to the progress channel of this first action, after rectification.
   * Omitted is zero, which is the shipped score. Follow-up windows do not
   * receive it: imagined steps have no grid region.
   */
  progExtra?: (action: number) => number;
  /**
   * Horizon-2 follow-up for each first action. Written only when passed.
   * The index is the first `a1` whose value strictly won, the same `s2 > best2`
   * comparison that enters the score. A tie keeps the earlier index. Omitted
   * writes nothing and leaves the score path unchanged.
   */
  follow?: Int32Array;
  /**
   * Additive split of each action's score. Omitted writes nothing and leaves
   * the score path unchanged. The pieces sum to `scores`.
   */
  parts?: ScoreParts;
  /**
   * Split of ρ̂ into the bonus slot and the two horizon drops. Omitted
   * writes nothing. The three are already rectified and sum to the ρ̂ that
   * enters the score. The split does not draw a random number and does not
   * change the score.
   */
  hatParts?: RhoHatParts;
  /**
   * Residuals of the horizon-2 drop. Omitted writes nothing and leaves the
   * score path unchanged. The trace does not draw a random number and does
   * not enter the bonus.
   */
  hatTrace?: RhoDropTrace;
}): Float32Array {
  const confidence = Math.max(0, Math.min(1, 1 - opts.ema / 0.4));
  const learning = Math.max(0, opts.progressEma);
  const disc = opts.discount ?? 0.65;
  const twoStep = Boolean(opts.predictFrom && opts.readPred && opts.imagined2);
  const emaGate = opts.horizon3Ema ?? 0.12;
  const threeStep = twoStep && Boolean(opts.imagined3) && opts.ema < emaGate;
  const horizonRho = opts.horizonRho !== false;
  const uncertainty = opts.uncertainty !== false;

  for (let a = 0; a < opts.acts; a++) {
    const pred = opts.predict(a, opts.imagined[a]);
    const v = opts.read(pred, a);
    const res1 = expectedResidual(pred, opts.residualWeight);
    const bonus = opts.progressBonus ? Math.max(0, opts.progressBonus(a, pred)) : 0;
    let rhoHat = bonus;
    let drop2 = 0;
    let drop3 = 0;
    const extra = opts.progExtra ? opts.progExtra(a) : 0;
    if (opts.follow) opts.follow[a] = a;
    let bestRes2 = res1;
    let meanRes2 = res1;
    let minRes2 = res1;
    let maxRes2 = res1;

    if (twoStep) {
      let best2 = -Infinity;
      let bestPred2: Float32Array | null = null;
      const into2 = opts.imagined2![a];
      let sumRes = 0;
      let loRes = Infinity;
      let hiRes = -Infinity;
      for (let a1 = 0; a1 < opts.acts; a1++) {
        const pred2 = opts.predictFrom!(pred, a1, into2);
        const v2 = opts.readPred!(pred2, a1);
        const s2 = valueOf(v2, pred2, opts.curiosity, opts.goal, learning, confidence, 0, opts.residualWeight, uncertainty);
        if (s2 > best2) {
          best2 = s2;
          bestRes2 = expectedResidual(pred2, opts.residualWeight);
          if (opts.follow) opts.follow[a] = a1;
          if (threeStep) {
            if (!bestPred2 || bestPred2 === into2) bestPred2 = pred2.slice();
            else bestPred2.set(pred2);
          }
        }
        if (opts.hatTrace) {
          const res2 = expectedResidual(pred2, opts.residualWeight);
          sumRes += res2;
          if (res2 < loRes) loRes = res2;
          if (res2 > hiRes) hiRes = res2;
        }
      }
      if (opts.hatTrace) {
        meanRes2 = sumRes / opts.acts;
        minRes2 = loRes;
        maxRes2 = hiRes;
      }
      if (horizonRho) {
        drop2 = Math.max(0, res1 - bestRes2);
        rhoHat += drop2;
      }
      let best3 = 0;
      if (threeStep && bestPred2) {
        let best3v = -Infinity;
        let bestRes3 = bestRes2;
        const into3 = opts.imagined3![a];
        for (let a2 = 0; a2 < opts.acts; a2++) {
          const pred3 = opts.predictFrom!(bestPred2, a2, into3);
          const v3 = opts.readPred!(pred3, a2);
          const s3 = valueOf(v3, pred3, opts.curiosity, opts.goal, learning, confidence, 0, opts.residualWeight, uncertainty);
          if (s3 > best3v) {
            best3v = s3;
            bestRes3 = expectedResidual(pred3, opts.residualWeight);
          }
        }
        best3 = best3v;
        if (horizonRho) {
          drop3 = Math.max(0, bestRes2 - bestRes3);
          rhoHat += drop3;
        }
      }
      const score1 = valueOf(
        v,
        pred,
        opts.curiosity,
        opts.goal,
        learning,
        confidence,
        rhoHat,
        opts.residualWeight,
        uncertainty,
        extra,
        opts.parts ? { parts: opts.parts, action: a } : undefined,
      );
      opts.scores[a] = score1 + disc * confidence * best2 + disc * disc * confidence * best3;
      if (opts.parts) opts.parts.follow[a] = opts.scores[a] - score1;
    } else {
      opts.scores[a] = valueOf(
        v,
        pred,
        opts.curiosity,
        opts.goal,
        learning,
        confidence,
        rhoHat,
        opts.residualWeight,
        uncertainty,
        extra,
        opts.parts ? { parts: opts.parts, action: a } : undefined,
      );
      if (opts.parts) opts.parts.follow[a] = 0;
    }
    if (opts.parts) {
      const parts = opts.parts;
      const sum =
        parts.rho[a]! +
        parts.global[a]! +
        parts.uncertainty[a]! +
        parts.extra[a]! +
        parts.extrinsic[a]! +
        parts.follow[a]!;
      if (Math.abs(sum - opts.scores[a]!) > 1e-6) {
        throw new Error(`score parts ${sum} do not add up to ${opts.scores[a]}`);
      }
    }
    if (opts.hatParts) {
      opts.hatParts.bonus[a] = bonus;
      opts.hatParts.drop2[a] = drop2;
      opts.hatParts.drop3[a] = drop3;
    }
    if (opts.hatTrace) {
      const trace = opts.hatTrace;
      trace.res1[a] = res1;
      trace.best[a] = bestRes2;
      trace.mean[a] = meanRes2;
      trace.min[a] = minRes2;
      trace.max[a] = maxRes2;
    }
  }
  return opts.scores;
}
