import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { periodicBoostOn } from "./kernel.ts";
import { fundamental, onsetOf, phaseBinMeans } from "./phase.ts";
import { phaseContrast } from "./period.ts";
import {
  boutCall,
  bootstrapOnsetDiff,
  chainPrediction,
  contrastTrack,
  excessCall,
  gridSpecificity,
  hunchCall,
  hunchVerdict,
  latePattern,
  locationCall,
  matchCall,
  moveCall,
  offsetCall,
  peakMajority,
  phaseInstrumentCall,
  profileSummary,
  scaleCall,
  scalePrediction,
  signCall,
  specificityCall,
  squareHalfContrast,
  templateStep,
  TRACK_BOUT_STEPS,
  TRACK_CYCLES,
  TRACK_WINDOWS,
  trackEpisodeSteps,
  trackReason,
  usablePeak,
  WINDOW_BOUT_STEPS,
  WINDOW_GRID,
  wrapSigned,
} from "./phase.ts";

function square(period: number, offset: number, cycles: number) {
  const half = Math.floor(period / 2);
  const cycle = half * 2;
  const series: number[] = [];
  for (let t = 0; t < cycles * period; t++) {
    let shifted = t - offset;
    shifted = ((shifted % cycle) + cycle) % cycle;
    series.push(Math.floor(shifted / half) % 2 === 0 ? 1 : 0);
  }
  return series;
}

test("a square wave's onset is the planted offset, at every quarter", () => {
  const period = 160;
  for (const offset of [0, 40, 80, 120]) {
    const wave = fundamental(square(period, offset, 8), period);
    const onset = onsetOf(wave.c, wave.s, period);
    assert.ok(Math.abs(wrapSigned(onset - offset, period)) < 1, `offset ${offset} recovered ${onset}`);
    assert.ok(wave.c * wave.c + wave.s * wave.s > 0.01);
  }
  const flat = fundamental([0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4], 4);
  assert.ok(Math.abs(flat.c) < 1e-12);
  assert.ok(Math.abs(flat.s) < 1e-12);
  assert.equal(onsetOf(0, 0, 160), 0);
});

test("eight bins split a first-half square into four high and four low", () => {
  const bins = phaseBinMeans(square(160, 0, 4), 160);
  for (let i = 0; i < 4; i++) assert.equal(bins[i], 1);
  for (let i = 4; i < 8; i++) assert.equal(bins[i], 0);
  const shifted = phaseBinMeans(square(160, 80, 4), 160);
  for (let i = 0; i < 4; i++) assert.equal(shifted[i], 0);
  for (let i = 4; i < 8; i++) assert.equal(shifted[i], 1);
});

test("offset 0 matches the first-half clock, and a quarter delay moves it", () => {
  for (let age = 0; age < 40; age++) {
    const half = 5;
    const legacy = Math.floor(age / half) % 2 === 0;
    assert.equal(periodicBoostOn(age, 10, 0), legacy);
  }
  assert.equal(periodicBoostOn(0, 172, 0), true);
  assert.equal(periodicBoostOn(86, 172, 0), false);
  assert.equal(periodicBoostOn(0, 172, 86), false);
  assert.equal(periodicBoostOn(86, 172, 86), true);
  assert.equal(periodicBoostOn(129, 172, 129), true);
});

test("planted-offset calls distinguish a hit, a delay, a miss, and a flip", () => {
  const quarter = 43;
  assert.equal(offsetCall({ lo: 0.01, hi: 0.05 }, { lo: -2, hi: 4 }, quarter), "tracked");
  assert.equal(offsetCall({ lo: 0.01, hi: 0.05 }, { lo: 8, hi: 30 }, quarter), "delayed");
  assert.equal(offsetCall({ lo: 0.01, hi: 0.05 }, { lo: -30, hi: -4 }, quarter), "early");
  assert.equal(offsetCall({ lo: -0.02, hi: 0.01 }, { lo: -2, hi: 4 }, quarter), "missed");
  assert.equal(offsetCall({ lo: -0.05, hi: -0.01 }, { lo: 70, hi: 90 }, quarter), "flipped");
  assert.equal(offsetCall({ lo: 0.01, hi: 0.05 }, { lo: 50, hi: 70 }, quarter), "distorted");
  assert.equal(phaseInstrumentCall(["tracked", "delayed", "early", "tracked"]), "confirmed");
  assert.equal(phaseInstrumentCall(["tracked", "missed", "tracked", "tracked"]), "inconclusive");
  assert.equal(phaseInstrumentCall(["flipped", "flipped", "flipped", "flipped"]), "refuted");
});

test("location puts a tight midpoint in the half cycle and a wide interval nowhere", () => {
  assert.equal(locationCall(86, -4, 4, 172, 0.02), "half-cycle");
  assert.equal(locationCall(60, -2, 2, 172, 0.02), "delayed");
  assert.equal(locationCall(0, -2, 2, 172, 0.02), "prompt");
  assert.equal(locationCall(20, -2, 2, 172, 0.02), "other");
  assert.equal(locationCall(86, -50, 50, 172, 0.02), "unresolved");
  assert.equal(locationCall(0, 0, 0, 172, 0), "unresolved");
});

test("sign, scale, hunch, bout, and excess follow the locked intervals", () => {
  assert.equal(signCall({ lo: -0.03, hi: -0.004 }), "negative");
  assert.equal(signCall({ lo: 0.01, hi: 0.02 }), "positive");
  assert.equal(signCall({ lo: -0.01, hi: 0.01 }), "null");
  assert.equal(
    scaleCall({ available: true, phaseDiff: { lo: -0.02, hi: 0.03 }, stepDiff: { lo: 40, hi: 90 } }),
    "timescale",
  );
  assert.equal(
    scaleCall({ available: true, phaseDiff: { lo: -0.2, hi: -0.05 }, stepDiff: { lo: -10, hi: 12 } }),
    "fixed-lag",
  );
  assert.equal(
    scaleCall({ available: true, phaseDiff: { lo: -0.02, hi: 0.02 }, stepDiff: { lo: -8, hi: 8 } }),
    "indistinguishable",
  );
  assert.equal(
    scaleCall({ available: true, phaseDiff: { lo: 0.05, hi: 0.2 }, stepDiff: { lo: 20, hi: 40 } }),
    "incompatible",
  );
  assert.equal(scaleCall({ available: false, phaseDiff: { lo: 1, hi: 2 }, stepDiff: { lo: 1, hi: 2 } }), "unavailable");

  const above = { lo: 0.02, hi: 0.08 };
  const below = { lo: -0.08, hi: -0.02 };
  const cross = { lo: -0.01, hi: 0.01 };
  assert.equal(hunchCall({ endVsStart: above, midVsStart: [cross], midVsEnd: [below] }), "grows");
  assert.equal(hunchCall({ endVsStart: below, midVsStart: [below], midVsEnd: [cross] }), "falls");
  assert.equal(hunchCall({ endVsStart: above, midVsStart: [above], midVsEnd: [above] }), "intermediate");
  assert.equal(hunchCall({ endVsStart: cross, midVsStart: [cross], midVsEnd: [cross] }), "flat");
  assert.equal(boutCall(200, 40, null), "silent");
  assert.equal(boutCall(200, 180, { lo: 30, hi: 50 }), "lagged");
  assert.equal(boutCall(200, 180, { lo: 1, hi: 8 }), "immediate");
  assert.equal(boutCall(200, 180, { lo: 12, hi: 28 }), "mid");
  assert.equal(excessCall(true, { lo: 20, hi: 60 }), "beyond-response");
  assert.equal(excessCall(true, { lo: -10, hi: 10 }), "same-as-response");
  assert.equal(excessCall(false, { lo: 20, hi: 60 }), "uncertified");
  assert.equal(matchCall(false, { lo: 0, hi: 1 }), "not-applicable");
  assert.equal(matchCall(true, { lo: -5, hi: 8 }), "matches");
  assert.equal(matchCall(true, { lo: 4, hi: 12 }), "differs");
});

test("the summary stays blind until the instrument passes, and a shared explorer blocks a rho-only claim", () => {
  const base = {
    periodRan: true,
    instrument: "confirmed" as const,
    randomSign: "null" as const,
    rhoSign: "negative" as const,
    rhoHeldOut: false,
    rhoLocation: "half-cycle" as const,
    otherExists: false,
  };
  assert.equal(profileSummary({ ...base, periodRan: false }), "no-period");
  assert.equal(profileSummary({ ...base, instrument: "inconclusive" }), "instrument-blind");
  assert.equal(profileSummary({ ...base, randomSign: "negative" }), "confounded");
  assert.equal(profileSummary({ ...base, rhoSign: "positive", rhoHeldOut: false }), "sign-reversed");
  assert.equal(profileSummary({ ...base, rhoSign: "null", rhoHeldOut: false }), "sign-null");
  assert.equal(profileSummary(base), "replicated-half");
  assert.equal(profileSummary({ ...base, rhoLocation: "delayed" }), "replicated-delayed");
  assert.equal(profileSummary({ ...base, rhoLocation: "prompt" }), "replicated-prompt");
  assert.equal(profileSummary({ ...base, rhoLocation: "other" }), "replicated-other");
  assert.equal(profileSummary({ ...base, rhoLocation: "unresolved" }), "replicated-other");
  assert.equal(profileSummary({ ...base, otherExists: true }), "shared");
  assert.equal(
    profileSummary({ ...base, rhoSign: "null", rhoHeldOut: true, rhoLocation: "delayed" }),
    "heldout-delayed",
  );
});

test("CI does not run the phase-profile sweep", () => {
  const yml = readFileSync(".github/workflows/ci.yml", "utf8");
  assert.equal(yml.includes("phase-profile"), false);
  assert.equal(yml.includes("window-sweep"), false);
  assert.equal(yml.includes("window-track"), false);
});

test("the window grid is half, one, and twice the shipped 50, and the bout can hold the long one", () => {
  assert.deepEqual([...WINDOW_GRID], [25, 50, 100]);
  assert.equal(WINDOW_BOUT_STEPS, 240);
  assert.ok(WINDOW_BOUT_STEPS > 2 * 100);
});

test("onset difference recovers a shift and wraps the short way", () => {
  const period = 160;
  const early = fundamental(square(period, 0, 8), period);
  const late = fundamental(square(period, 40, 8), period);
  const rows = (wave: { c: number; s: number }) => Array.from({ length: 8 }, (_, seed) => ({ seed: seed + 1, ...wave }));
  const forward = bootstrapOnsetDiff(rows(late), rows(early), period, 200, 3);
  assert.ok(Math.abs(forward.mean - 40) < 1, `forward ${forward.mean}`);
  const wrapped = fundamental(square(period, 140, 8), period);
  const across = bootstrapOnsetDiff(rows(early), rows(wrapped), period, 200, 4);
  assert.ok(Math.abs(across.mean - 20) < 1, `wrapped ${across.mean}`);
});

test("window scaling confirms only when the bout, the onset, and the contrast all move later", () => {
  const later = { lo: 2, hi: 8 };
  const same = { lo: -1, hi: 1 };
  const sooner = { lo: -8, hi: -2 };
  assert.equal(moveCall(later), "later");
  assert.equal(moveCall(same), "same");
  assert.equal(moveCall(sooner), "sooner");
  assert.equal(scalePrediction(["later", "later"], false), "scales");
  assert.equal(scalePrediction(["same", "same"], false), "fixed");
  assert.equal(scalePrediction(["later", "same"], false), "partial");
  assert.equal(scalePrediction(["sooner", "later"], false), "reversed");
  assert.equal(scalePrediction(["later", "later"], true), "censored");
  const instrument = "confirmed" as const;
  assert.equal(
    hunchVerdict({ instrument, bout: "scales", onset: "scales", contrast: "scales" }),
    "confirmed",
  );
  assert.equal(hunchVerdict({ instrument, bout: "fixed", onset: "fixed", contrast: "scales" }), "refuted");
  assert.equal(hunchVerdict({ instrument, bout: "fixed", onset: "fixed", contrast: "fixed" }), "refuted");
  assert.equal(hunchVerdict({ instrument, bout: "scales", onset: "fixed", contrast: "scales" }), "split");
  assert.equal(hunchVerdict({ instrument, bout: "scales", onset: "scales", contrast: "fixed" }), "split");
  assert.equal(hunchVerdict({ instrument, bout: "censored", onset: "scales", contrast: "scales" }), "inconclusive");
  assert.equal(
    hunchVerdict({ instrument: "inconclusive", bout: "scales", onset: "scales", contrast: "scales" }),
    "inconclusive",
  );
  assert.equal(latePattern("negative", "delayed"), "late");
  assert.equal(latePattern("negative", "half-cycle"), "late");
  assert.equal(latePattern("negative", "prompt"), "shifted");
  assert.equal(latePattern("negative", "unresolved"), "unlocated");
  assert.equal(latePattern("null", "delayed"), "absent");
  assert.equal(specificityCall({ randomSign: "null", otherExists: false }), "specific");
  assert.equal(specificityCall({ randomSign: "null", otherExists: true }), "shared");
  assert.equal(specificityCall({ randomSign: "negative", otherExists: false }), "confounded");
  assert.equal(usablePeak(55, 240), true);
  assert.equal(usablePeak(239, 240), false);
  assert.equal(usablePeak(null, 240), false);
  assert.equal(peakMajority(200, 101), true);
  assert.equal(peakMajority(200, 100), false);
});

test("the track grid puts points around 50, and the bout and the episode can hold the long window", () => {
  assert.deepEqual([...TRACK_WINDOWS], [25, 35, 50, 70, 100]);
  assert.equal(TRACK_BOUT_STEPS, 400);
  assert.ok(TRACK_BOUT_STEPS > 2 * 100);
  assert.equal(TRACK_CYCLES, 27);
  assert.equal(trackEpisodeSteps(172), 27 * 172);
  assert.ok(trackEpisodeSteps(172)! <= 4800);
  assert.ok(trackEpisodeSteps(172)! > 1600);
  assert.equal(trackEpisodeSteps(1), null);
});

test("square-wave half contrast falls until half a period and then rises", () => {
  const period = 172;
  assert.ok(Math.abs(squareHalfContrast(0, period) - 1) < 1e-12);
  assert.ok(Math.abs(squareHalfContrast(86, period) - -1) < 1e-12);
  assert.ok(Math.abs(squareHalfContrast(43, period)) < 1e-12);
  assert.ok(Math.abs(squareHalfContrast(129, period)) < 1e-12);
  assert.ok(squareHalfContrast(133, period) > 0);
  assert.ok(squareHalfContrast(92, period) < squareHalfContrast(60, period));
  assert.ok(squareHalfContrast(133, period) > squareHalfContrast(92, period));
  for (const offset of [0, 43, 86, 129]) {
    const contrast = phaseContrast(square(period, offset, 4), period);
    assert.ok(Math.abs(contrast - squareHalfContrast(offset, period)) < 1e-9, `offset ${offset}`);
  }
});

test("a window chain tracks only when every step is later and the contrast follows the template", () => {
  const later = { lo: 2, hi: 8 };
  const same = { lo: -1, hi: 1 };
  const sooner = { lo: -8, hi: -2 };
  assert.equal(chainPrediction([moveCall(later), moveCall(later), moveCall(later), moveCall(later)], false), "scales");
  assert.equal(chainPrediction([moveCall(same), moveCall(same), moveCall(same), moveCall(same)], false), "fixed");
  assert.equal(chainPrediction([moveCall(later), moveCall(same), moveCall(later), moveCall(later)], false), "partial");
  assert.equal(chainPrediction([moveCall(sooner), moveCall(later), moveCall(later), moveCall(later)], false), "reversed");
  assert.equal(chainPrediction([moveCall(later), moveCall(later)], true), "censored");
  assert.equal(templateStep(-0.4, { lo: -0.03, hi: -0.01 }), "matched");
  assert.equal(templateStep(-0.4, { lo: 0.01, hi: 0.03 }), "mismatched");
  assert.equal(templateStep(-0.4, { lo: -0.02, hi: 0.01 }), "unresolved");
  assert.equal(templateStep(0.02, { lo: -0.01, hi: 0.01 }), "flat");
  assert.equal(templateStep(0.02, { lo: 0.01, hi: 0.03 }), "mismatched");
  assert.equal(contrastTrack(["matched", "flat", "matched"]), "tracks");
  assert.equal(contrastTrack(["matched", "unresolved"]), "partial");
  assert.equal(contrastTrack(["mismatched", "matched"]), "reversed");
  assert.equal(contrastTrack(["flat", "flat"]), "flat");
  const tracked = {
    curveRun: true,
    instrument: "confirmed" as const,
    bout: "scales" as const,
    onset: "scales" as const,
    contrast: "tracks" as const,
    specificity: "specific" as const,
  };
  assert.deepEqual(trackReason(tracked), { verdict: "confirmed", reason: "confirmed" });
  assert.deepEqual(trackReason({ ...tracked, instrument: "inconclusive" }), {
    verdict: "inconclusive",
    reason: "instrument-blind",
  });
  assert.deepEqual(trackReason({ ...tracked, bout: "censored" }), {
    verdict: "inconclusive",
    reason: "bout-censored",
  });
  assert.deepEqual(trackReason({ ...tracked, onset: "censored" }), {
    verdict: "refuted",
    reason: "onset-not-scaling",
  });
  assert.deepEqual(trackReason({ ...tracked, onset: "partial" }), {
    verdict: "refuted",
    reason: "onset-not-scaling",
  });
  assert.deepEqual(trackReason({ ...tracked, contrast: "partial" }), {
    verdict: "refuted",
    reason: "contrast-not-tracking",
  });
  assert.deepEqual(trackReason({ ...tracked, bout: "fixed" }), {
    verdict: "refuted",
    reason: "bout-not-scaling",
  });
  assert.deepEqual(trackReason({ ...tracked, specificity: "shared" }), {
    verdict: "refuted",
    reason: "shared",
  });
  assert.equal(gridSpecificity({ shipped: "specific", randomNonNull: 1, lateCounts: [0, 1, 0] }), "specific");
  assert.equal(gridSpecificity({ shipped: "specific", randomNonNull: 2, lateCounts: [0, 0, 0] }), "confounded");
  assert.equal(gridSpecificity({ shipped: "specific", randomNonNull: 0, lateCounts: [0, 2, 0] }), "shared");
  assert.equal(gridSpecificity({ shipped: "shared", randomNonNull: 0, lateCounts: [0, 0, 0] }), "shared");
});
