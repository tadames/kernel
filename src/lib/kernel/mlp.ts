/** Tiny two-layer network with online SGD. The compressor. */

function xavier(fanIn: number, fanOut: number) {
  return Math.sqrt(6 / (fanIn + fanOut));
}

export class MLP {
  readonly in: number;
  readonly h: number;
  readonly out: number;
  w1: Float32Array;
  b1: Float32Array;
  w2: Float32Array;
  b2: Float32Array;
  private z1: Float32Array;
  private ha: Float32Array;
  private y: Float32Array;
  private dz2: Float32Array;
  private dh: Float32Array;
  private dz1: Float32Array;
  /** dL/dx from the last train, using weights before the step. Stop-grad callers read this. */
  readonly dx: Float32Array;

  constructor(input: number, hidden: number, output: number) {
    this.in = input;
    this.h = hidden;
    this.out = output;
    this.w1 = new Float32Array(hidden * input);
    this.b1 = new Float32Array(hidden);
    this.w2 = new Float32Array(output * hidden);
    this.b2 = new Float32Array(output);
    this.z1 = new Float32Array(hidden);
    this.ha = new Float32Array(hidden);
    this.y = new Float32Array(output);
    this.dz2 = new Float32Array(output);
    this.dh = new Float32Array(hidden);
    this.dz1 = new Float32Array(hidden);
    this.dx = new Float32Array(input);
    this.randomize();
  }

  randomize() {
    const a1 = xavier(this.in, this.h);
    const a2 = xavier(this.h, this.out);
    for (let i = 0; i < this.w1.length; i++) this.w1[i] = (Math.random() * 2 - 1) * a1;
    for (let i = 0; i < this.w2.length; i++) this.w2[i] = (Math.random() * 2 - 1) * a2;
    this.b1.fill(0);
    this.b2.fill(0);
  }

  forward(x: Float32Array, into: Float32Array = this.y): Float32Array {
    const { in: inn, h, out, w1, b1, w2, b2, z1, ha } = this;
    for (let i = 0; i < h; i++) {
      let s = b1[i];
      const row = i * inn;
      for (let j = 0; j < inn; j++) s += w1[row + j] * x[j];
      z1[i] = s;
      ha[i] = Math.tanh(s);
    }
    for (let i = 0; i < out; i++) {
      let s = b2[i];
      const row = i * h;
      for (let j = 0; j < h; j++) s += w2[row + j] * ha[j];
      into[i] = 1 / (1 + Math.exp(-Math.max(-12, Math.min(12, s))));
    }
    return into;
  }

  train(x: Float32Array, target: Float32Array, lr: number) {
    const y = this.forward(x);
    const { in: inn, h, out, w1, b1, w2, b2, ha, dz2, dh, dz1 } = this;
    const scale = 2 / out;
    for (let i = 0; i < out; i++) {
      const err = (y[i] - target[i]) * scale;
      const sig = y[i] * (1 - y[i]);
      dz2[i] = err * sig;
    }
    dh.fill(0);
    for (let i = 0; i < out; i++) {
      const row = i * h;
      const g = dz2[i];
      for (let j = 0; j < h; j++) {
        dh[j] += w2[row + j] * g;
        w2[row + j] -= lr * g * ha[j];
      }
      b2[i] -= lr * g;
    }
    for (let i = 0; i < h; i++) {
      dz1[i] = dh[i] * (1 - ha[i] * ha[i]);
    }
    this.dx.fill(0);
    for (let i = 0; i < h; i++) {
      const row = i * inn;
      const g = dz1[i];
      for (let j = 0; j < inn; j++) this.dx[j] += w1[row + j] * g;
    }
    for (let i = 0; i < h; i++) {
      const row = i * inn;
      const g = dz1[i];
      for (let j = 0; j < inn; j++) {
        w1[row + j] -= lr * g * x[j];
      }
      b1[i] -= lr * g;
    }
  }

  /**
   * Match the hidden code from the last forward to a stop-grad `code`.
   * Updates W1 and b1 only. Returns the mean squared gap before the step.
   * Scale is 2/hidden, the same mean-square factor `train` uses on its outputs.
   */
  matchHidden(x: Float32Array, code: Float32Array, lr: number): number {
    const { in: inn, h, w1, b1, ha, dz1 } = this;
    const scale = 2 / h;
    let loss = 0;
    for (let i = 0; i < h; i++) {
      const d = ha[i]! - (code[i] ?? 0);
      loss += d * d;
      dz1[i] = d * scale * (1 - ha[i]! * ha[i]!);
    }
    for (let i = 0; i < h; i++) {
      const row = i * inn;
      const g = dz1[i]!;
      for (let j = 0; j < inn; j++) w1[row + j]! -= lr * g * x[j]!;
      b1[i]! -= lr * g;
    }
    return h ? loss / h : 0;
  }

  /**
   * Train the readout to decode the hidden code from the last forward.
   * The hidden is stop-grad: W1 and b1 do not move. Scale is 2/out.
   */
  decodeReadout(target: Float32Array, lr: number) {
    const { h, out, w2, b2, ha, dz2 } = this;
    const scale = 2 / out;
    for (let i = 0; i < out; i++) {
      let s = b2[i]!;
      const row = i * h;
      for (let j = 0; j < h; j++) s += w2[row + j]! * ha[j]!;
      const clipped = s < -12 ? -12 : s > 12 ? 12 : s;
      // Float32 store, same as forward into the probe. An exact prediction is a zero step.
      const y = Math.fround(1 / (1 + Math.exp(-clipped)));
      const err = (y - (target[i] ?? 0)) * scale;
      dz2[i] = err * y * (1 - y);
    }
    for (let i = 0; i < out; i++) {
      const row = i * h;
      const g = dz2[i]!;
      for (let j = 0; j < h; j++) w2[row + j]! -= lr * g * ha[j]!;
      b2[i]! -= lr * g;
    }
  }

  lastHidden(): Float32Array {
    return this.ha;
  }

  /**
   * Multiplicative decay toward 0. λ = 0 is a no-op. This is the forgetting
   * knob: no replay, so a decayed weight has to be learned again.
   */
  decay(lambda: number) {
    if (!(lambda > 0)) return;
    const keep = 1 - lambda;
    for (let i = 0; i < this.w1.length; i++) this.w1[i] *= keep;
    for (let i = 0; i < this.b1.length; i++) this.b1[i] *= keep;
    for (let i = 0; i < this.w2.length; i++) this.w2[i] *= keep;
    for (let i = 0; i < this.b2.length; i++) this.b2[i] *= keep;
  }

  /** Mean |w| of the first layer — a crude "how much has the mind written". */
  weightEnergy() {
    let s = 0;
    for (let i = 0; i < this.w1.length; i++) s += Math.abs(this.w1[i]);
    return s / this.w1.length;
  }

  /**
   * Snapshot the compressor as plain arrays. Small enough (~5k floats) to
   * JSON-stringify for Lab save / load / inspect. No architecture metadata —
   * the caller already knows in/h/out.
   */
  exportWeights(): { w1: number[]; b1: number[]; w2: number[]; b2: number[] } {
    return {
      w1: Array.from(this.w1),
      b1: Array.from(this.b1),
      w2: Array.from(this.w2),
      b2: Array.from(this.b2),
    };
  }

  /**
   * Restore weights. Dimensions must match; otherwise the net is left unchanged
   * and false is returned. Used by Kernel/StreamKernel brain load so a saved
   * mind can resume without a teacher.
   */
  importWeights(w: { w1: number[]; b1: number[]; w2: number[]; b2: number[] }): boolean {
    if (
      w.w1.length !== this.w1.length ||
      w.b1.length !== this.b1.length ||
      w.w2.length !== this.w2.length ||
      w.b2.length !== this.b2.length
    ) {
      return false;
    }
    this.w1.set(w.w1);
    this.b1.set(w.b1);
    this.w2.set(w.w2);
    this.b2.set(w.b2);
    return true;
  }
}

export function mse(a: Float32Array, b: Float32Array) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s / a.length;
}
