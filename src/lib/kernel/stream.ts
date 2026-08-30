/**
 * Second testbed. Same loop, no body, no grid.
 *
 * A bit stream. The compressor sees the last 8 bits and must guess the next.
 *   structured — period-6 pattern 001011 (compressible)
 *   noise      — a fresh fair bit every step (incompressible)
 *
 * Measuring surprise on the whole sliding window would cheat: 7 of 8 bits
 * are a copy. We predict the next bit only. That is the claim.
 */
import { Loop } from "./loop.ts";
import { mulberry32 } from "./presets.ts";

export const STREAM_W = 8;
export const STREAM_IN = STREAM_W + 1;
export const STREAM_HIDDEN = 24;
export const STREAM_OUT = 1;
export const STREAM_SHOW = 40;
const PATTERN = [0, 0, 1, 0, 1, 1];
const HISTORY = 140;

export type StreamKind = "structured" | "noise";

export type StreamSnapshot = {
  kind: StreamKind;
  bits: number[];
  pred: number;
  actual: number;
  surprise: number;
  ema: number;
  progress: number;
  compression: number;
  history: number[];
  age: number;
  commitment: number;
};

export class StreamKernel {
  kind: StreamKind;
  loop: Loop;
  window: Float32Array;
  bits: number[] = [];
  pred = 0.5;
  actual = 0;
  history: number[] = [];
  age = 0;
  lr: number;
  private i = 0;
  private rand: () => number;

  constructor(kind: StreamKind = "structured", seed = 1, lr = 0.08) {
    this.kind = kind;
    this.lr = lr;
    this.rand = mulberry32(seed + 23);
    this.loop = new Loop(STREAM_IN, STREAM_HIDDEN, STREAM_OUT);
    this.window = new Float32Array(STREAM_W);
    for (let t = 0; t < STREAM_W; t++) {
      const b = this.nextBit();
      this.window[t] = b;
      this.bits.push(b);
    }
    this.loop.commit(this.encode());
  }

  private nextBit() {
    if (this.kind === "structured") {
      const b = PATTERN[this.i % PATTERN.length];
      this.i += 1;
      return b;
    }
    return this.rand() < 0.5 ? 0 : 1;
  }

  private encode() {
    const x = new Float32Array(STREAM_IN);
    x.set(this.window);
    x[STREAM_W] = 1;
    return x;
  }

  step() {
    const bit = this.nextBit();
    this.actual = bit;
    const y = new Float32Array([bit]);
    this.loop.assimilate(y, this.lr);
    this.pred = this.loop.lastPred[0] ?? 0.5;
    this.history.push(this.loop.surprise);
    if (this.history.length > HISTORY) this.history.shift();
    for (let k = 0; k < STREAM_W - 1; k++) this.window[k] = this.window[k + 1];
    this.window[STREAM_W - 1] = bit;
    this.bits.push(bit);
    if (this.bits.length > STREAM_SHOW) this.bits.shift();
    this.age += 1;
    this.loop.commit(this.encode());
  }

  snapshot(): StreamSnapshot {
    return {
      kind: this.kind,
      bits: this.bits.slice(),
      pred: this.pred,
      actual: this.actual,
      surprise: this.loop.surprise,
      ema: this.loop.ema,
      progress: this.loop.progress,
      compression: this.loop.compression,
      history: this.history.slice(),
      age: this.age,
      commitment: this.loop.commitment,
    };
  }
}

export function runStream(kind: StreamKind, seed = 3, steps = 220) {
  const s = new StreamKernel(kind, seed);
  let early = 0;
  for (let t = 0; t < steps; t++) {
    s.step();
    if (t === 40) early = s.loop.ema;
  }
  return { early, late: s.loop.ema, age: s.age };
}
