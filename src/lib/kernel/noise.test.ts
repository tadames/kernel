import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Loop } from "./loop.ts";
import { Kernel, CENTER, R, SIZE } from "./kernel.ts";
import { senseGrid } from "./env.ts";
import { createFamily, distractorSpec, FAMILY_LAYOUT_SEED } from "./family.ts";
import { runPhaseEpisode } from "./phase-run.ts";
import { runNoiseEpisode } from "./noise-run.ts";
import { BOOST_ADDS, BOOST_FAR, BOOST_GAP, PUBLISHED_RANDOM_FRACTION, runBoostEpisode } from "./boost-run.ts";
import { runDriftEpisode } from "./drift-run.ts";
import { PROGRESS_SLOT_WEIGHT, runDriftGapEpisode } from "./drift-gap-run.ts";
import { doorwayDelta, runDoorwayEpisode } from "./doorway-run.ts";
import { CREDIT_DOSE, runCreditEpisode } from "./credit-run.ts";
import { CHAIN_RHO_HAT_DELTA, CHAIN_SCORE_DELTA, runChainEpisode } from "./chain-run.ts";
import { imagineScores, RHO_HAT_PROG_WEIGHT } from "./policy.ts";
import {
  amplitudeCall,
  boostSummary,
  dosePlacement,
  driftGapSummary,
  greaterCall,
  logExcessSlope,
  driftShapeCall,
  driftSummary,
  fedRoomCall,
  fedRoomSummary,
  matchedContentCall,
  matchedSummary,
  noAttractionCall,
  policySplitCall,
  policyTermsCall,
  competeSummary,
  competeVerdict,
  creditContentClass,
  creditInstrumentCall,
  creditSummary,
  creditVerdict,
  chainCarry,
  chainSummary,
  chainVerdict,
  CREDIT_POWER_DELTA,
  doorwaySummary,
  repulsionCall,
  rhoGapBand,
  RHO_DETECT_DOSE,
  RHO_UNDETECT_DOSE,
  seRemovalCall,
  sensitivityCall,
  SHARP_POLICY_TEMPERATURE,
  sharpVerdict,
  SHIPPED_POLICY_TEMPERATURE,
  smallestDetecting,
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

test("drift shape peaks only when the middle clears both extremes", () => {
  const up = { lo: 0.02, hi: 0.08 };
  const down = { lo: -0.08, hi: -0.02 };
  const flat = { lo: -0.01, hi: 0.01 };
  assert.equal(driftShapeCall(up, up, up), "confirmed");
  assert.equal(driftShapeCall(down, up, up), "refuted");
  assert.equal(driftShapeCall(up, down, down), "refuted");
  assert.equal(driftShapeCall(up, up, flat), "inconclusive");
  assert.equal(driftShapeCall(flat, flat, flat), "inconclusive");
  assert.equal(driftSummary(true, "confirmed", "confirmed", ["inconclusive", "inconclusive", "inconclusive"]), "confounded");
  assert.equal(driftSummary(false, "refuted", "confirmed", ["inconclusive", "inconclusive", "inconclusive"]), "refuted");
  assert.equal(driftSummary(false, "confirmed", "refuted", ["inconclusive", "inconclusive", "inconclusive"]), "refuted");
  assert.equal(driftSummary(false, "confirmed", "confirmed", ["confirmed", "inconclusive", "inconclusive"]), "shared");
  assert.equal(driftSummary(false, "confirmed", "confirmed", ["inconclusive", "inconclusive", "inconclusive"]), "confirmed");
  assert.equal(driftSummary(false, "confirmed", "inconclusive", ["inconclusive", "inconclusive", "inconclusive"]), "inconclusive");
  assert.equal(driftSummary(false, "inconclusive", "confirmed", ["inconclusive", "inconclusive", "inconclusive"]), "inconclusive");
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
  assert.equal(yml.includes("boost-room"), false);
  assert.equal(yml.includes("drift-gap"), false);
  assert.equal(yml.includes("npm run doorway"), false);
});

test("the drift-gap call places a rectified gap on the dose curve", () => {
  assert.equal(RHO_DETECT_DOSE, 0.05);
  assert.equal(RHO_UNDETECT_DOSE, 0.0169);
  const belowBoth = { lo: -0.01, hi: 0.01 };
  const blind = { lo: 0.02, hi: 0.04 };
  const above = { lo: 0.05, hi: 0.08 };
  const spans = { lo: 0.01, hi: 0.07 };
  assert.equal(dosePlacement(belowBoth, 200, 180, 0.05), "below");
  assert.equal(dosePlacement(above, 200, 180, 0.05), "above");
  assert.equal(dosePlacement(spans, 200, 180, 0.05), "spans");
  assert.equal(dosePlacement(belowBoth, 200, 100, 0.05), "too-few");
  assert.equal(rhoGapBand(belowBoth, 200, 180), "below-undetectable");
  assert.equal(rhoGapBand(blind, 200, 180), "rho-blind-band");
  assert.equal(rhoGapBand({ lo: -0.002, hi: 0.02 }, 200, 180), "rho-blind-band");
  assert.equal(rhoGapBand(above, 200, 180), "at-or-above-detectable");
  assert.equal(rhoGapBand(spans, 200, 180), "spans-detectable");
  assert.equal(rhoGapBand(belowBoth, 200, 80), "too-few");
  assert.equal(driftGapSummary("below-undetectable"), "confirmed");
  assert.equal(driftGapSummary("rho-blind-band"), "confirmed");
  assert.equal(driftGapSummary("at-or-above-detectable"), "refuted");
  assert.equal(driftGapSummary("spans-detectable"), "inconclusive");
  assert.equal(driftGapSummary("too-few"), "inconclusive");
});

test("an action bonus of b matches a progress-channel dose of 0.55 b", () => {
  const score = (extra: { progressBonus?: (a: number) => number; progExtra?: (a: number) => number }) => {
    const scores = new Float32Array(2);
    imagineScores({
      acts: 2,
      curiosity: 1,
      goal: 0,
      progressEma: 0.01,
      ema: 0.2,
      horizonRho: false,
      uncertainty: true,
      imagined: [new Float32Array(2), new Float32Array(2)],
      scores,
      predict: (_a, into) => {
        into[0] = 0.4;
        into[1] = 0.6;
        return into;
      },
      read: () => ({ reward: 0, cost: 0, novelty: 0.4 }),
      ...extra,
    });
    return [scores[0]!, scores[1]!];
  };
  const bonus = 0.2;
  const viaBonus = score({ progressBonus: (a) => (a === 0 ? bonus : 0) });
  const viaDose = score({ progExtra: (a) => (a === 0 ? PROGRESS_SLOT_WEIGHT * bonus : 0) });
  assert.equal(viaBonus[0], viaDose[0]);
  assert.equal(viaBonus[1], viaDose[1]);
  assert.ok(viaBonus[0] !== viaBonus[1]);
});

test("the drift-gap episode is the drift episode", () => {
  const base = { id: 0, seed: 1, steps: 400, driftRate: 0.01877 } as const;
  for (const arm of ["drift", "held"] as const) {
    const drift = runDriftEpisode({ ...base, signal: "rho", arm });
    const gap = runDriftGapEpisode({ ...base, signal: "rho", arm });
    assert.equal(gap.distractorFrac, drift.distractorFrac);
    assert.equal(gap.foods, drift.foods);
    assert.equal(gap.lives, drift.lives);
    const frac = gap.roomSteps ? gap.progressPos / gap.roomSteps : null;
    assert.equal(frac, drift.targetProgressPos);
    assert.equal(gap.channelSum, gap.rectSum);
  }
  const count = runDriftGapEpisode({ ...base, signal: "count", arm: "drift" });
  const countDrift = runDriftEpisode({ ...base, signal: "count", arm: "drift" });
  assert.equal(count.distractorFrac, countDrift.distractorFrac);
  assert.equal(count.foods, countDrift.foods);
  assert.equal(count.lives, countDrift.lives);
  if (count.roomSteps > 0) {
    const mean = count.channelSum / count.roomSteps;
    assert.ok(mean > 0 && mean <= PROGRESS_SLOT_WEIGHT);
  }
});

test("the place-bonus summary follows the locked gap and the far dose", () => {
  assert.deepEqual([...BOOST_ADDS], [0.0085, 0.0169, 0.05, 0.15, 0.5, 2]);
  assert.equal(BOOST_GAP, 0.0169);
  assert.equal(BOOST_FAR, 0.15);
  const calls = ["inconclusive", "inconclusive", "confirmed", "confirmed", "confirmed", "confirmed"] as const;
  assert.equal(smallestDetecting(BOOST_ADDS, calls), 0.05);
  assert.equal(boostSummary(false, "confirmed", 0.0169, BOOST_GAP, BOOST_FAR), "confirmed");
  assert.equal(boostSummary(true, "confirmed", 0.0169, BOOST_GAP, BOOST_FAR), "confounded");
  assert.equal(boostSummary(false, "refuted", null, BOOST_GAP, BOOST_FAR), "refuted");
  assert.equal(boostSummary(false, "inconclusive", 0.05, BOOST_GAP, BOOST_FAR), "above-gap");
  assert.equal(boostSummary(false, "inconclusive", 0.15, BOOST_GAP, BOOST_FAR), "above-gap");
  assert.equal(boostSummary(false, "inconclusive", 0.5, BOOST_GAP, BOOST_FAR), "insensitive");
  assert.equal(boostSummary(false, "inconclusive", null, BOOST_GAP, BOOST_FAR), "insensitive");
  assert.equal(boostSummary(false, "inconclusive", 0.0085, BOOST_GAP, BOOST_FAR), "inconclusive");
});

test("the sharp temperature is kept only when the gain clears and nothing is hurt", () => {
  assert.equal(SHIPPED_POLICY_TEMPERATURE, 0.45);
  assert.equal(SHARP_POLICY_TEMPERATURE, 0.15);
  assert.equal(PUBLISHED_RANDOM_FRACTION, 0.15796249999999998);
  const kept = sharpVerdict({
    excessGain: { lo: 0.01, hi: 0.04 },
    probeDelta: { lo: -0.01, hi: 0.002 },
    livesDelta: { lo: -0.2, hi: 0.1 },
    g2Shipped: [true, true, true],
    g2Sharp: [true, true, false],
    c2Shipped: [true, true, true],
    c2Sharp: [true, false, true],
  });
  assert.equal(kept.verdict, "kept");
  assert.equal(kept.beats, "confirmed");
  const quiet = sharpVerdict({
    excessGain: { lo: -0.01, hi: 0.02 },
    probeDelta: { lo: -0.01, hi: 0.002 },
    livesDelta: { lo: -0.2, hi: 0.1 },
    g2Shipped: [true, true],
    g2Sharp: [true, true],
    c2Shipped: [true, true],
    c2Sharp: [true, true],
  });
  assert.equal(quiet.verdict, "reverted");
  assert.equal(quiet.beats, "inconclusive");
  const hurt = sharpVerdict({
    excessGain: { lo: 0.01, hi: 0.04 },
    probeDelta: { lo: 0.001, hi: 0.02 },
    livesDelta: { lo: -0.2, hi: 0.1 },
    g2Shipped: [true, true],
    g2Sharp: [true, true],
    c2Shipped: [true, true],
    c2Sharp: [true, true],
  });
  assert.equal(hurt.verdict, "reverted");
  assert.equal(hurt.probeHurt, true);
  const food = sharpVerdict({
    excessGain: { lo: 0.01, hi: 0.04 },
    probeDelta: { lo: -0.01, hi: 0.002 },
    livesDelta: { lo: 0.1, hi: 0.4 },
    g2Shipped: [true, true, true],
    g2Sharp: [false, false, true],
    c2Shipped: [true, true, true],
    c2Sharp: [false, false, true],
  });
  assert.equal(food.verdict, "reverted");
  assert.equal(food.livesHurt, true);
  assert.equal(food.g2Hurt, true);
  assert.equal(food.c2Hurt, true);
  assert.equal(sensitivityCall(0.0085), "confirmed");
  assert.equal(sensitivityCall(0.0169), "confirmed");
  assert.equal(sensitivityCall(0.05), "refuted");
  assert.equal(sensitivityCall(null), "refuted");
  assert.equal(noAttractionCall({ lo: -0.01, hi: 0.02 }), "confirmed");
  assert.equal(noAttractionCall({ lo: -0.02, hi: -0.001 }), "confirmed");
  assert.equal(noAttractionCall({ lo: 0.001, hi: 0.02 }), "refuted");
  assert.equal(repulsionCall({ lo: -0.02, hi: -0.001 }), "confirmed");
  assert.equal(repulsionCall({ lo: 0.001, hi: 0.02 }), "refuted");
  assert.equal(repulsionCall({ lo: -0.01, hi: 0.02 }), "inconclusive");
  assert.equal(doorwaySummary("inconclusive", "confirmed"), "confirmed");
  assert.equal(doorwaySummary("confirmed", "confirmed"), "refuted");
  assert.equal(doorwaySummary("confirmed", "inconclusive"), "refuted");
  assert.equal(doorwaySummary("inconclusive", "inconclusive"), "inconclusive");
  assert.equal(doorwaySummary("refuted", "confirmed"), "refuted");
  assert.equal(doorwaySummary("inconclusive", "refuted"), "refuted");
});

test("a pattern channel is swamped only when the pure room attracts and the third does not", () => {
  assert.equal(competeSummary(false, "confirmed", "null-with-sensitivity"), "swamped");
  assert.equal(competeSummary(false, "confirmed", "repelled"), "swamped");
  assert.equal(competeVerdict("swamped", "confirmed"), "confirmed");
  assert.equal(competeSummary(false, "confirmed", "attracted"), "found");
  assert.equal(competeSummary(false, "inconclusive", "attracted"), "found");
  assert.equal(competeVerdict("found", "confirmed"), "refuted");
  assert.equal(competeSummary(false, "inconclusive", "inconclusive"), "pure-miss");
  assert.equal(competeVerdict("pure-miss", "inconclusive"), "inconclusive");
  assert.equal(competeSummary(false, "refuted", "inconclusive"), "pure-miss");
  assert.equal(competeVerdict("pure-miss", "refuted"), "refuted");
  assert.equal(competeSummary(false, "confirmed", "inconclusive"), "unresolved");
  assert.equal(competeVerdict("unresolved", "confirmed"), "inconclusive");
  assert.equal(competeSummary(true, "confirmed", "null-with-sensitivity"), "confounded");
  assert.equal(competeVerdict("confounded", "confirmed"), "inconclusive");
});

test("the doorway delta drops a one-sided tick and ignores a held tick's stale score", () => {
  assert.equal(doorwayDelta([0, 0, 0, 0, 0], (action) => action === 1), 0);
  assert.equal(doorwayDelta([0, 2, 0, 0, 0], (action) => action === 1), 2);
  assert.equal(doorwayDelta([1, 1, 1, 1, 1], () => true), null);
  const drift = runDoorwayEpisode({
    id: 0,
    seed: 3,
    signal: "random",
    steps: 40,
    driftRate: 0.01877,
    arm: "drift",
    policyTemperature: SHARP_POLICY_TEMPERATURE,
  });
  const held = runDoorwayEpisode({
    id: 1,
    seed: 3,
    signal: "random",
    steps: 40,
    driftRate: 0.01877,
    arm: "held",
    policyTemperature: SHARP_POLICY_TEMPERATURE,
  });
  assert.equal(drift.samples, 20);
  assert.equal(held.samples, 20);
  assert.equal(drift.scoreGap, 0);
  assert.equal(held.scoreGap, 0);
  assert.equal(drift.path, held.path);
  assert.equal(drift.distractorFrac, held.distractorFrac);
  assert.equal(drift.foods, held.foods);
  assert.equal(drift.lives, held.lives);
  assert.equal(new Kernel("field", 1).features.option, true);
});

test("policy temperature defaults to the shipped softmax and does not move a random walk", () => {
  const shipped = new Kernel("field", 3);
  assert.equal(shipped.params.temperature, SHIPPED_POLICY_TEMPERATURE);
  assert.equal(shipped.params.lr, 4);
  const sharp = new Kernel("field", 3, undefined, { policyTemperature: SHARP_POLICY_TEMPERATURE });
  assert.equal(sharp.params.temperature, SHARP_POLICY_TEMPERATURE);
  assert.equal(sharp.params.lr, shipped.params.lr);
  assert.throws(() => new Kernel("field", 3, undefined, { policyTemperature: 0.04 }), /policyTemperature/);
  const base = { id: 7, seed: 4, steps: 25, signal: "random" as const, add: 0 };
  const walk = runBoostEpisode(base);
  const cold = runBoostEpisode({ ...base, policyTemperature: SHARP_POLICY_TEMPERATURE });
  assert.equal(cold.distractorFrac, walk.distractorFrac);
  assert.equal(cold.foods, walk.foods);
  assert.equal(cold.lives, walk.lives);
});

test("a place bonus does not move a random walk and does raise the score gap", () => {
  const base = {
    id: 0,
    seed: 4,
    steps: 40,
  };
  const randomOff = runBoostEpisode({ ...base, signal: "random", add: 0 });
  const randomOn = runBoostEpisode({ ...base, signal: "random", add: 2 });
  assert.equal(randomOn.distractorFrac, randomOff.distractorFrac);
  assert.equal(randomOn.foods, randomOff.foods);
  assert.equal(randomOn.lives, randomOff.lives);
  assert.equal(randomOn.scoreGap, 0);
  assert.equal(randomOff.scoreGap, 0);

  const spec = distractorSpec({
    learnability: 1,
    driftRate: 0,
    distractorRelevance: 0,
    matchedPattern: "held",
  });
  const make = (add: number) => {
    const prev = Math.random;
    Math.random = mulberry32(4);
    try {
      return new Kernel("distractor", 4, undefined, {
        env: { ...spec, layoutSeed: FAMILY_LAYOUT_SEED },
        signal: "rho",
        intrinsicBoost: add === 0 ? undefined : { add, region: 1 },
      });
    } finally {
      Math.random = prev;
    }
  };
  const off = make(0);
  const on = make(2);
  const x = 9;
  const y = 7;
  assert.equal(off.regionAt(x, y), 0);
  assert.equal(off.regionAt(x + 1, y), 1);
  assert.equal(off.cells[y * SIZE + x], 0);
  assert.equal(off.cells[y * SIZE + x + 1], 0);
  off.x = x;
  off.y = y;
  on.x = x;
  on.y = y;
  off.step();
  on.step();
  assert.ok(on.scores[1]! > off.scores[1]! + 0.5, `east on ${on.scores[1]} off ${off.scores[1]}`);
  assert.equal(on.scores[3], off.scores[3]);
});

test("a pattern doorway credits only when the choice prefers it, and a planted gap sets delta", () => {
  assert.equal(CREDIT_POWER_DELTA, 0.036);
  assert.equal(creditInstrumentCall({ lo: 0.04, hi: 0.06 }, 800, 800), "confirmed");
  assert.equal(creditInstrumentCall({ lo: -0.01, hi: 0.02 }, 800, 800), "inconclusive");
  assert.equal(creditInstrumentCall({ lo: 0.04, hi: 0.06 }, 100, 800), "inconclusive");
  const delta = 0.0367;
  assert.equal(creditContentClass({ lo: 0.01, hi: 0.02 }, 800, 800, delta), "attracted");
  assert.equal(creditContentClass({ lo: -0.02, hi: -0.001 }, 800, 800, delta), "repelled");
  assert.equal(creditContentClass({ lo: -0.01, hi: 0.01 }, 800, 800, delta), "null-with-sensitivity");
  assert.equal(creditContentClass({ lo: 0, hi: 0 }, 800, 800, delta), "null-with-sensitivity");
  assert.equal(creditContentClass({ lo: -0.05, hi: 0.01 }, 800, 800, delta), "inconclusive");
  assert.equal(creditContentClass({ lo: -0.01, hi: 0.01 }, 800, 800, null), "inconclusive");
  assert.equal(creditContentClass({ lo: -0.01, hi: 0.01 }, 100, 800, delta), "inconclusive");
  assert.equal(creditSummary(false, "confirmed", "null-with-sensitivity"), "blind");
  assert.equal(creditSummary(false, "confirmed", "repelled"), "against");
  assert.equal(creditSummary(false, "confirmed", "attracted"), "offered");
  assert.equal(creditSummary(false, "confirmed", "inconclusive"), "unresolved");
  assert.equal(creditSummary(false, "inconclusive", "null-with-sensitivity"), "no-instrument");
  assert.equal(creditSummary(true, "confirmed", "null-with-sensitivity"), "confounded");
  assert.equal(creditVerdict("blind"), "confirmed");
  assert.equal(creditVerdict("against"), "confirmed");
  assert.equal(creditVerdict("offered"), "refuted");
  assert.equal(creditVerdict("unresolved"), "inconclusive");
  assert.equal(creditVerdict("no-instrument"), "inconclusive");
  assert.equal(creditVerdict("confounded"), "inconclusive");
  const pattern = runCreditEpisode({ id: 0, seed: 3, signal: "random", steps: 40, arm: "pattern" });
  const noise = runCreditEpisode({ id: 1, seed: 3, signal: "random", steps: 40, arm: "noise" });
  const boost = runCreditEpisode({ id: 2, seed: 3, signal: "random", steps: 40, arm: "boost" });
  assert.equal(pattern.samples, 20);
  assert.equal(noise.samples, 20);
  assert.equal(boost.samples, 20);
  assert.equal(pattern.path, noise.path);
  assert.equal(pattern.path, boost.path);
  assert.equal(pattern.distractorFrac, noise.distractorFrac);
  assert.equal(pattern.foods, noise.foods);
  assert.equal(pattern.lives, noise.lives);
  assert.equal(pattern.scoreGap, 0);
  assert.equal(boost.scoreGap, 0);
});

test("the doorway chain is absent only when progress never reaches a piece", () => {
  assert.equal(CHAIN_SCORE_DELTA, 0.04559740761000422);
  assert.equal(CHAIN_RHO_HAT_DELTA, CREDIT_DOSE / RHO_HAT_PROG_WEIGHT);
  assert.equal(chainCarry({ lo: 0.05, hi: 0.08 }, CHAIN_SCORE_DELTA), true);
  assert.equal(chainCarry({ lo: 0.01, hi: 0.02 }, CHAIN_SCORE_DELTA), false);
  assert.equal(chainCarry({ lo: -0.08, hi: -0.05 }, CHAIN_SCORE_DELTA), true);
  assert.equal(chainCarry({ lo: -0.01, hi: 0.01 }, CHAIN_SCORE_DELTA), false);
  assert.equal(chainCarry({ lo: 0.05, hi: 0.08 }, 0), false);
  const quiet = { uncertainty: false, global: false, extrinsic: false, follow: false };
  const nil = "null-with-sensitivity" as const;
  assert.equal(chainSummary(false, nil, nil, nil, nil, nil, nil, quiet), "absent");
  assert.equal(chainSummary(false, nil, nil, "attracted", nil, nil, nil, quiet), "absent");
  assert.equal(chainSummary(false, nil, "attracted", nil, nil, nil, nil, quiet), "gated");
  assert.equal(chainSummary(false, "attracted", "attracted", "repelled", nil, nil, nil, quiet), "cancelled");
  assert.equal(chainSummary(false, "attracted", nil, nil, nil, nil, nil, quiet), "offered");
  assert.equal(chainSummary(false, "repelled", nil, nil, nil, nil, nil, quiet), "reversed");
  assert.equal(chainSummary(false, nil, "repelled", nil, nil, nil, nil, quiet), "reversed");
  assert.equal(
    chainSummary(false, nil, nil, "attracted", nil, nil, nil, { ...quiet, uncertainty: true }),
    "elsewhere",
  );
  assert.equal(chainSummary(false, nil, nil, "inconclusive", nil, nil, nil, quiet), "unresolved");
  assert.equal(chainSummary(false, "inconclusive", nil, nil, nil, nil, nil, quiet), "unresolved");
  assert.equal(chainSummary(true, nil, nil, nil, nil, nil, nil, quiet), "confounded");
  assert.equal(chainVerdict("absent"), "confirmed");
  assert.equal(chainVerdict("gated"), "refuted");
  assert.equal(chainVerdict("cancelled"), "refuted");
  assert.equal(chainVerdict("offered"), "refuted");
  assert.equal(chainVerdict("reversed"), "refuted");
  assert.equal(chainVerdict("elsewhere"), "refuted");
  assert.equal(chainVerdict("unresolved"), "inconclusive");
  assert.equal(chainVerdict("confounded"), "inconclusive");
  const traced = runChainEpisode({ id: 0, seed: 3, signal: "rho", steps: 40, arm: "pattern" });
  const plain = runCreditEpisode({ id: 1, seed: 3, signal: "rho", steps: 40, arm: "pattern" });
  assert.equal(traced.path, plain.path);
  assert.equal(traced.foods, plain.foods);
  assert.equal(traced.lives, plain.lives);
  assert.equal(traced.distractorFrac, plain.distractorFrac);
  assert.equal(traced.samples, plain.samples);
  assert.equal(traced.scoreSteps, plain.scoreSteps);
  assert.equal(traced.scoreGap, plain.scoreGap);
  assert.equal(traced.east.n, plain.east.n);
  assert.equal(traced.east.rectifiedMean, plain.east.rectifiedMean);
  const random = runChainEpisode({ id: 2, seed: 3, signal: "random", steps: 40, arm: "noise" });
  assert.equal(random.scoreGap, 0);
  assert.equal(random.rho, 0);
  assert.equal(random.global, 0);
  assert.equal(random.uncertainty, 0);
  assert.equal(random.extrinsic, 0);
  assert.equal(random.follow, 0);
  assert.equal(random.rhoHat, 0);
});
