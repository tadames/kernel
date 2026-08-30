/**
 * Cheap dynamics of a mind that is allowed to grow, and allowed to sit
 * between freeze and noise.
 *
 * Complexity here is not Kolmogorov length of the weight vector (that is
 * almost constant for a fixed net). It is *effective* complexity:
 *
 *   participation  — how many hidden units actually fire (capacity used)
 *   |w̄|            — how much the compressor has written (already on MLP)
 *   policy entropy — freeze (0) vs coin (1); the useful band is the middle
 *   branching      — how many imagined actions are still live
 *
 * The edge-of-chaos index is 4H(1−H): zero at both extremes, one at
 * half-entropy. That is a proxy, not Langton's λ. The Bench claim is the
 * test. If the body freezes or wanders like a coin, the claim fails.
 */

/** Shannon entropy of logits under a Boltzmann policy, normalised to [0, 1]. */
export function entropyNorm(
  logits: Float32Array,
  temperature: number,
): number {
  const n = logits.length;
  if (n < 2) return 0;
  const t = Math.max(0.05, temperature);
  let max = -Infinity;
  for (let i = 0; i < n; i++) if (logits[i] > max) max = logits[i];
  const ex = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.exp((logits[i] - max) / t);
    ex[i] = v;
    sum += v;
  }
  let h = 0;
  for (let i = 0; i < n; i++) {
    const p = ex[i] / sum;
    if (p > 1e-12) h -= p * Math.log(p);
  }
  return h / Math.log(n);
}

/** Count of actions within `frac` of the best score. 1 = ordered, n = chaotic. */
export function branching(scores: Float32Array, frac = 0.25): number {
  let max = -Infinity;
  let min = Infinity;
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] > max) max = scores[i];
    if (scores[i] < min) min = scores[i];
  }
  const span = Math.max(1e-6, max - min);
  const cut = max - frac * span;
  let k = 0;
  for (let i = 0; i < scores.length; i++) if (scores[i] >= cut) k++;
  return k;
}

/**
 * Participation ratio of a hidden vector: (Σ h²)² / Σ h⁴.
 * 1 = one unit carries the state; length = all units share it equally.
 */
export function participation(h: Float32Array): number {
  let s2 = 0;
  let s4 = 0;
  for (let i = 0; i < h.length; i++) {
    const x = h[i] * h[i];
    s2 += x;
    s4 += x * x;
  }
  if (s4 < 1e-12) return 0;
  return (s2 * s2) / s4;
}

/** Peaks at 1 when normalised entropy is ½. Zero at freeze and at a coin. */
export function edgeIndex(hNorm: number): number {
  const h = Math.max(0, Math.min(1, hNorm));
  return 4 * h * (1 - h);
}
