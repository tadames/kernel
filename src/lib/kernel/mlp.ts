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
    for (let i = 0; i < h; i++) {
      const row = i * inn;
      const g = dz1[i];
      for (let j = 0; j < inn; j++) {
        w1[row + j] -= lr * g * x[j];
      }
      b1[i] -= lr * g;
    }
  }

  lastHidden(): Float32Array {
    return this.ha;
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
