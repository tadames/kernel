import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Loop } from "./loop.ts";
import { Kernel, CENTER, R, SIZE } from "./kernel.ts";
import { senseGrid } from "./env.ts";
import { createFamily } from "./family.ts";
import { runPhaseEpisode } from "./phase-run.ts";
import { runNoiseEpisode } from "./noise-run.ts";
import {
  amplitudeCall,
  greaterCall,
  logExcessSlope,
  seRemovalCall,
  spuriousCall,
} from "./noise.ts";
import { heldOutProgressRing, PROGRESS_WINDOWS, SHIPPED_PROGRESS_WINDOW } from "./progress.ts";
import { mulberry32 } from "./presets.ts";

test("the progress windows are the locked log grid around 50", () => {
  assert.equal(SHIPPED_PROGRESS_WINDOW, 50);
  assert.deepEqual([...PROGRESS_WINDOWS], [12.5, 25, 50, 100, 200, 400]);
  assert.equal(1 / 50, 0.02);
});

test("held-out progress is zero on a flat trace, positive on a falling trace, and negative on noise", () => {
  const flat = new Float64Array(8).fill(0.2);
  assert.equal(heldOutProgressRing(flat, 0, 4), 0);

  const falling = new Float64Array(40);
  for (let i = 0; i < falling.length; i++) falling[i] = 1 - i * 0.01;
  assert.ok(heldOutProgressRing(falling, 0, 20) > 0);

  const rand = mulberry32(7);
  const ring = new Float64Array(80);
  let at = 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const u = Math.max(1e-12, rand());
    const v = rand();
    const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    ring[at] = g;
    at = (at + 1) % ring.length;
    if (i >= ring.length - 1) {
      sum += heldOutProgressRing(ring, at, 40);
      n += 1;
    }
  }
  assert.ok(n > 100);
  assert.ok(sum / n < -0.05, `noise mean ${sum / n}`);
});

test("log excess slope recovers -0.5 and rejects a flat excess", () => {
  const windows = [...PROGRESS_WINDOWS];
  const copies = windows.map((w) => Array.from({ length: 8 }, () => 1 / Math.sqrt(w)));
  const fit = logExcessSlope(windows, copies, 200, 3);
  assert.ok(Math.abs(fit.slope - -0.5) < 1e-9, `slope ${fit.slope}`);
  assert.equal(fit.call, "confirmed");
  assert.ok(fit.lo <= -0.5 && fit.hi >= -0.5);

  const flat = windows.map(() => Array.from({ length: 8 }, () => 0.08));
  const flatFit = logExcessSlope(windows, flat, 200, 4);
  assert.ok(Math.abs(flatFit.slope) < 1e-9);
  assert.equal(flatFit.call, "refuted");

  const short = windows.map((w, i) => (i < 3 ? [1 / Math.sqrt(w)] : [-0.01]));
  const shortFit = logExcessSlope(windows, short, 50, 5);
  assert.equal(shortFit.call, "inconclusive");
});

test("call rules match the preregistration", () => {
  assert.equal(greaterCall({ lo: 0.01, hi: 0.2 }), "confirmed");
  assert.equal(greaterCall({ lo: -0.2, hi: -0.01 }), "refuted");
  assert.equal(greaterCall({ lo: -0.01, hi: 0.02 }), "inconclusive");

  const raw = { lo: 0.04, hi: 0.1 };
  assert.equal(seRemovalCall(raw, { lo: -0.02, hi: 0.01 }, { lo: 0.03, hi: 0.08 }), "confirmed");
  assert.equal(seRemovalCall(raw, { lo: -0.08, hi: -0.01 }, { lo: -0.01, hi: 0.01 }), "confirmed");
  assert.equal(seRemovalCall(raw, { lo: 0.01, hi: 0.05 }, { lo: 0.02, hi: 0.04 }), "refuted");
  assert.equal(seRemovalCall({ lo: -0.01, hi: 0.02 }, { lo: -0.02, hi: 0.01 }, { lo: 0.01, hi: 0.02 }), "inconclusive");

  assert.equal(amplitudeCall(0.02, 0.05, 0.09, { lo: 0.01, hi: 0.1 }), "confirmed");
  assert.equal(amplitudeCall(0.09, 0.05, 0.02, { lo: -0.1, hi: -0.01 }), "refuted");
  assert.equal(amplitudeCall(0.02, 0.1, 0.05, { lo: 0.01, hi: 0.08 }), "inconclusive");

  assert.equal(spuriousCall({ lo: 0.01, hi: 0.02 }, 20, 11), "confirmed");
  assert.equal(spuriousCall({ lo: 0.01, hi: 0.02 }, 20, 10), "inconclusive");
  assert.equal(spuriousCall({ lo: -0.05, hi: -0.01 }, 20, 20), "refuted");
});

test("noise amplitude scales east glow and leaves west glow alone", () => {
  const params = { learnability: 1, driftRate: 0, distractorRelevance: 0, noiseAmplitude: 0.5 };
  const built = createFamily("distractor", SIZE, 3000, params, false);
  const gain = { region: built.family.region, amplitude: 0.5 };
  const into = new Float32Array((R * 2 + 1) * (R * 2 + 1) * 3);
  let east = -1;
  let west = -1;
  for (let i = 0; i < built.family.glow.length; i++) {
    if (built.cells[i] !== 0 || built.family.glow[i] !== 1) continue;
    if (east < 0 && built.family.region[i] === 1) east = i;
    if (west < 0 && built.family.region[i] === 0) west = i;
  }
  assert.ok(east >= 0 && west >= 0);
  senseGrid(built.cells, new Float32Array(built.cells.length), east % SIZE, (east / SIZE) | 0, SIZE, R, into, built.family.glow, gain);
  assert.equal(into[CENTER], 0.5);
  senseGrid(built.cells, new Float32Array(built.cells.length), west % SIZE, (west / SIZE) | 0, SIZE, R, into, built.family.glow, gain);
  assert.equal(into[CENTER], 1);
  senseGrid(built.cells, new Float32Array(built.cells.length), east % SIZE, (east / SIZE) | 0, SIZE, R, into, built.family.glow, null);
  assert.equal(into[CENTER], 1);
});

test("the shipped progress path is the ema, and another window does not move confidence", () => {
  Math.random = mulberry32(11);
  const shipped = new Loop(6, 4, 3, 5);
  const input = new Float32Array(6);
  input[0] = 1;
  shipped.commit(input);
  const ema0 = shipped.ema;
  shipped.assimilate(new Float32Array(3), 0.01);
  assert.ok(Math.abs(shipped.progress - (ema0 - shipped.surprise)) < 1e-12);
  assert.equal(shipped.progressBaseline, 0.25);
  assert.equal(shipped.baselineRate, 0.02);

  Math.random = mulberry32(11);
  const wide = new Loop(6, 4, 3, 5);
  wide.progressWindow = 25;
  wide.commit(input);
  const base0 = wide.progressBaseline;
  wide.assimilate(new Float32Array(3), 0.01);
  assert.ok(Math.abs(wide.progress - (base0 - wide.surprise)) < 1e-12);
  assert.ok(Math.abs(wide.ema - ((1 - 0.02) * ema0 + 0.02 * wide.surprise)) < 1e-9);
  const p = 1 / 25;
  assert.ok(Math.abs(wide.progressBaseline - ((1 - p) * base0 + p * wide.surprise)) < 1e-12);

  const kernel = new Kernel("field", 3, undefined, { progressWindow: 25, progressMode: "se" });
  assert.equal(kernel.loop.progressWindow, 25);
  assert.equal(kernel.loop.progressMode, "se");
  assert.equal(kernel.loop.baselineRate, 0.02);
  assert.throws(() => new Kernel("field", 1, undefined, { progressWindow: 0 }));
});

test("a shipped noise episode matches the phase episode", () => {
  const phase = runPhaseEpisode({
    id: 0,
    seed: 1,
    signal: "rho",
    steps: 80,
    learnability: 1,
    driftRate: 0,
    distractorRelevance: 0,
  });
  const noise = runNoiseEpisode({
    id: 0,
    seed: 1,
    signal: "rho",
    steps: 80,
    learnability: 1,
    driftRate: 0,
    distractorRelevance: 0,
    progressWindow: 50,
    progressMode: "ema",
    noiseAmplitude: 1,
    traceHist: false,
  });
  assert.equal(noise.distractorFrac, phase.distractorFrac);
  assert.equal(noise.foods, phase.foods);
  assert.equal(noise.distractorFoods, phase.distractorFoods);
  assert.equal(noise.lives, phase.lives);
  assert.ok(noise.east.n + noise.west.n === 80);
});

test("CI does not run the noise sweep", () => {
  const yml = readFileSync(".github/workflows/ci.yml", "utf8");
  assert.equal(yml.includes("npm run noise"), false);
});
