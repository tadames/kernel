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
  fedRoomCall,
  fedRoomSummary,
  matchedContentCall,
  matchedSummary,
  policySplitCall,
  policyTermsCall,
  seRemovalCall,
  spuriousCall,
} from "./noise.ts";
import { curiosityScoreForArm } from "./noise-run.ts";
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

  const shipped = { lo: 0.04, hi: 0.1 };
  assert.equal(policyTermsCall(shipped, { lo: -0.01, hi: 0.02 }, { lo: 0.02, hi: 0.08 }), "confirmed");
  assert.equal(policyTermsCall(shipped, { lo: 0.01, hi: 0.05 }, { lo: 0.02, hi: 0.06 }), "confirmed");
  assert.equal(policyTermsCall(shipped, { lo: 0.01, hi: 0.05 }, { lo: -0.01, hi: 0.02 }), "refuted");
  assert.equal(policyTermsCall({ lo: -0.01, hi: 0.02 }, { lo: -0.02, hi: 0.01 }, { lo: 0.01, hi: 0.04 }), "inconclusive");
  assert.equal(matchedContentCall({ lo: 0.01, hi: 0.2 }), "confirmed");
  assert.equal(matchedContentCall({ lo: -0.2, hi: -0.01 }), "refuted");
  assert.equal(matchedContentCall({ lo: -0.01, hi: 0.02 }), "inconclusive");
  assert.equal(matchedContentCall({ lo: 0, hi: 0 }), "inconclusive");
  const five = ["confirmed", "confirmed", "confirmed", "confirmed", "confirmed"] as const;
  assert.equal(matchedSummary(true, [...five]), "confounded");
  assert.equal(matchedSummary(false, [...five]), "noise");
  assert.equal(
    matchedSummary(false, ["refuted", "refuted", "refuted", "refuted", "refuted"]),
    "static",
  );
  assert.equal(
    matchedSummary(false, ["inconclusive", "inconclusive", "inconclusive", "inconclusive", "inconclusive"]),
    "inconclusive",
  );
  assert.equal(
    matchedSummary(false, ["confirmed", "refuted", "inconclusive", "confirmed", "refuted"]),
    "mixed",
  );
  assert.equal(matchedSummary(false, []), "inconclusive");

  const gap = { lo: 0.04, hi: 0.1 };
  assert.equal(fedRoomCall(gap, { lo: -0.01, hi: 0.02 }), "closed");
  assert.equal(fedRoomCall(gap, { lo: 0, hi: 0 }), "closed");
  assert.equal(fedRoomCall(gap, { lo: -0.04, hi: -0.01 }), "closed");
  assert.equal(fedRoomCall(gap, { lo: 0.01, hi: 0.05 }), "open");
  assert.equal(fedRoomCall({ lo: -0.01, hi: 0.02 }, { lo: -0.01, hi: 0.02 }), "inconclusive");
  assert.equal(fedRoomCall({ lo: -0.05, hi: -0.01 }, { lo: 0.01, hi: 0.04 }), "open");
  const closedFive = ["closed", "closed", "closed", "closed", "closed"] as const;
  assert.equal(fedRoomSummary(true, [...closedFive]), "confounded");
  assert.equal(fedRoomSummary(false, [...closedFive]), "empty");
  assert.equal(fedRoomSummary(false, ["open", "open", "open", "open", "open"]), "not-empty");
  assert.equal(
    fedRoomSummary(false, ["inconclusive", "inconclusive", "inconclusive", "inconclusive", "inconclusive"]),
    "inconclusive",
  );
  assert.equal(fedRoomSummary(false, ["closed", "open", "closed", "open", "inconclusive"]), "mixed");
  assert.equal(fedRoomSummary(false, []), "inconclusive");

  assert.equal(policySplitCall("confirmed", "confirmed"), "both");
  assert.equal(policySplitCall("confirmed", "refuted"), "horizon");
  assert.equal(policySplitCall("refuted", "confirmed"), "uncertainty");
  assert.equal(policySplitCall("refuted", "refuted"), "conjunction");
  assert.equal(policySplitCall("confirmed", "inconclusive"), "horizon");
  assert.equal(policySplitCall("inconclusive", "refuted"), "inconclusive");
});

test("the default kernel keeps both curiosity terms", () => {
  const shipped = new Kernel("field", 2);
  assert.equal(shipped.scoreUncertainty, true);
  assert.equal(shipped.scoreHorizonDrop, true);
  const cut = new Kernel("field", 2, undefined, {
    curiosityScore: { uncertainty: false, horizonDrop: false },
  });
  assert.equal(cut.scoreUncertainty, false);
  assert.equal(cut.scoreHorizonDrop, false);
  const dropOnly = new Kernel("field", 2, undefined, { curiosityScore: { horizonDrop: false } });
  assert.equal(dropOnly.scoreUncertainty, true);
  assert.equal(dropOnly.scoreHorizonDrop, false);
});

test("policy arms cut only the named terms and shipped cuts nothing", () => {
  assert.deepEqual(curiosityScoreForArm("shipped"), { uncertainty: true, horizonDrop: true });
  assert.deepEqual(curiosityScoreForArm("progress"), { uncertainty: false, horizonDrop: false });
  assert.deepEqual(curiosityScoreForArm("no-horizon"), { uncertainty: true, horizonDrop: false });
  assert.deepEqual(curiosityScoreForArm("no-uncertainty"), { uncertainty: false, horizonDrop: true });
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
  assert.equal(noise.policyArm, "shipped");

  const explicit = runNoiseEpisode({
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
    policyArm: "shipped",
  });
  assert.equal(explicit.distractorFrac, noise.distractorFrac);
  assert.equal(explicit.foods, noise.foods);
  assert.equal(explicit.lives, noise.lives);
});

test("target foods leave a random noise episode on the empty-room path", () => {
  const base = {
    id: 0,
    seed: 3,
    signal: "random" as const,
    steps: 60,
    learnability: 1,
    driftRate: 0,
    distractorRelevance: 0,
    progressWindow: 50,
    progressMode: "ema" as const,
    noiseAmplitude: 1,
    traceHist: false,
  };
  const empty = runNoiseEpisode(base);
  const off = runNoiseEpisode({ ...base, targetFoods: false });
  const fed = runNoiseEpisode({ ...base, targetFoods: true });
  const emptyMirror = runNoiseEpisode({ ...base, mirror: true });
  const fedMirror = runNoiseEpisode({ ...base, targetFoods: true, mirror: true });
  assert.equal(empty.targetFoods, false);
  assert.equal(off.targetFoods, false);
  assert.equal(off.distractorFrac, empty.distractorFrac);
  assert.equal(fed.targetFoods, true);
  assert.equal(fed.distractorFrac, empty.distractorFrac);
  assert.equal(fed.foods, empty.foods);
  assert.equal(fed.lives, empty.lives);
  assert.equal(fed.distractorFoods, empty.distractorFoods);
  assert.equal(fedMirror.distractorFrac, emptyMirror.distractorFrac);
  assert.equal(fedMirror.foods, emptyMirror.foods);
  assert.equal(fedMirror.lives, emptyMirror.lives);
});

test("CI does not run the noise sweep", () => {
  const yml = readFileSync(".github/workflows/ci.yml", "utf8");
  assert.equal(yml.includes("npm run noise"), false);
});
