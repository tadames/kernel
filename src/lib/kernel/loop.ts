/**
 * The kernel.
 *
 * A mind is not a pile of weights. It is this closed loop:
 *
 *   observe  x
 *   predict  x̂ = M(x₋, a₋)
 *   surprise δ = ‖x − x̂‖²          measured BEFORE the update
 *   compress M ← M − η ∇δ
 *   progress ρ = δ̄ − δ             improvement, not surprise itself
 *   act      a ← π(M, ρ, goal)
 *
 * Everything else in this repository — grids, streams, energy, a browser lab —
 * is a testbed. If a new world cannot be learned by this object, the kernel
 * is too small, or the world is incompressible. That is a scientific result,
 * not a product failure.
 */
import { MLP, mse } from "./mlp.ts";

export class Loop {
  model: MLP;
  replay: { x: Float32Array; y: Float32Array }[] = [];
  prevInput: Float32Array | null = null;
  lastPred: Float32Array;
  surprise = 0.35;
  ema = 0.35;
  progress = 0;
  progressEma = 0;

  inDim: number;
  hidden: number;
  outDim: number;
  replayCap: number;
  extraReplay: number;

  constructor(inDim: number, hidden: number, outDim: number, replayCap = 160, extraReplay = 3) {
    this.inDim = inDim;
    this.hidden = hidden;
    this.outDim = outDim;
    this.replayCap = replayCap;
    this.extraReplay = extraReplay;
    this.model = new MLP(inDim, hidden, outDim);
    this.lastPred = new Float32Array(outDim);
  }

  reset() {
    this.model = new MLP(this.inDim, this.hidden, this.outDim);
    this.replay = [];
    this.prevInput = null;
    this.lastPred = new Float32Array(this.outDim);
    this.surprise = 0.35;
    this.ema = 0.35;
    this.progress = 0;
    this.progressEma = 0;
  }

  /**
   * Assimilate observation x_t. Surprise is the residual of the *current*
   * model, before the gradient step. Training after that is compression.
   */
  assimilate(obs: Float32Array, lr: number) {
    if (this.prevInput) {
      this.model.forward(this.prevInput, this.lastPred);
      this.surprise = mse(this.lastPred, obs);
      this.model.train(this.prevInput, obs, lr);
      if (this.replay.length > 0) {
        for (let k = 0; k < this.extraReplay; k++) {
          const s = this.replay[(Math.random() * this.replay.length) | 0];
          this.model.train(s.x, s.y, lr * 0.7);
        }
      }
      this.replay.push({ x: this.prevInput, y: obs.slice() });
      if (this.replay.length > this.replayCap) this.replay.shift();
    } else {
      this.surprise = 0.35;
    }
    const prev = this.ema;
    this.ema = 0.94 * this.ema + 0.06 * this.surprise;
    this.progress = prev - this.ema;
    this.progressEma = 0.95 * this.progressEma + 0.05 * this.progress;
    return this.surprise;
  }

  imagine(input: Float32Array, into?: Float32Array): Float32Array {
    return this.model.forward(input, into);
  }

  commit(input: Float32Array) {
    this.prevInput = input;
  }

  get compression() {
    return 1 / (1 + this.ema * 8);
  }
}
