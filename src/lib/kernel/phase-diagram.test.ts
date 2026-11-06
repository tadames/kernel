import assert from "node:assert/strict";
import { test } from "node:test";
import { greaterCall } from "./noise.ts";
import { runPhaseEpisode } from "./phase-diagram-run.ts";
import {
  LOCKED_DRIFT_TAU,
  PHASE_DOSE,
  PHASE_EXPLORERS,
  baselineContrast,
  baselineSalt,
  excessSalt,
  explorerIndex,
  instrumentDelta,
  matchedSpec,
  notAttractedCall,
  phaseCells,
  phaseCellClass,
  phaseDriftLevels,
  phaseForgetLevels,
  phaseKey,
  positiveSalt,
  positiveSpecs,
} from "./phase-diagram.ts";

test("phase grid is three axes, four levels, one primary each", () => {
  const cells = phaseCells();
  assert.equal(cells.length, 12);
  assert.deepEqual(
    cells.map((cell) => `${cell.axis}:${cell.label}`),
    [
      "noise:0",
      "noise:1/3",
      "noise:2/3",
      "noise:1",
      "drift:0",
      "drift:below",
      "drift:at",
      "drift:above",
      "forget:0",
      "forget:slow",
      "forget:at",
      "forget:fast",
    ],
  );
  assert.deepEqual(
    cells.filter((cell) => cell.primary).map((cell) => `${cell.axis}:${cell.label}`),
    ["noise:1", "drift:at", "forget:at"],
  );
});

test("drift and forgetting levels are the locked coarse grid", () => {
  assert.deepEqual(phaseDriftLevels(), [0, 0.001173, 0.01877, 0.3003]);
  const forget = phaseForgetLevels();
  assert.equal(forget[0], 0);
  assert.equal(forget[2], 0.012924125031568812);
  assert.ok(forget[1]! > 0 && forget[1]! < forget[2]!);
  assert.ok(forget[3]! > forget[2]!);
  assert.equal(LOCKED_DRIFT_TAU, 53.28471423768756);
  assert.equal(PHASE_DOSE, 0.0085);
});

test("held room, drift zero, and the unboosted control are one episode", () => {
  const cells = phaseCells();
  const driftHeld = cells.find((cell) => cell.axis === "drift" && cell.level === 0)!.control;
  const forgetOff = cells.find((cell) => cell.axis === "forget" && cell.level === 0)!.control;
  const forgetTarget = cells.find((cell) => cell.axis === "forget" && cell.level === 0)!.target;
  const boostOff = positiveSpecs().control;
  assert.equal(phaseKey(driftHeld), phaseKey(forgetOff));
  assert.equal(phaseKey(forgetTarget), phaseKey(forgetOff));
  assert.equal(phaseKey(boostOff), phaseKey(matchedSpec("held", 0)));
  assert.notEqual(phaseKey(positiveSpecs().target), phaseKey(boostOff));
  assert.notEqual(phaseKey(cells.find((cell) => cell.axis === "drift" && cell.level === 0)!.target), phaseKey(driftHeld));
});

test("bootstrap salts do not collide", () => {
  const salts = new Set<number>();
  for (let axis = 0; axis < 3; axis++) {
    for (let level = 0; level < 4; level++) {
      for (let explorer = 0; explorer < 5; explorer++) salts.add(excessSalt(axis, level, explorer));
      for (let baseline = 0; baseline < 4; baseline++) salts.add(baselineSalt(axis, level, baseline));
    }
  }
  for (let explorer = 0; explorer < 5; explorer++) salts.add(positiveSalt(explorer));
  assert.equal(salts.size, 3 * 4 * 5 + 3 * 4 * 4 + 5);
});

test("cell class puts sign ahead of a sensitive null", () => {
  const delta = 0.02;
  assert.equal(phaseCellClass({ lo: 0.001, hi: 0.01 }, delta), "attracted");
  assert.equal(phaseCellClass({ lo: -0.02, hi: -0.001 }, delta), "repelled");
  assert.equal(phaseCellClass({ lo: -0.01, hi: 0.01 }, delta), "null-with-sensitivity");
  assert.equal(phaseCellClass({ lo: 0, hi: 0 }, delta), "null-with-sensitivity");
  assert.equal(phaseCellClass({ lo: -0.03, hi: 0.01 }, delta), "inconclusive");
  assert.equal(phaseCellClass({ lo: -0.01, hi: 0.02 }, delta), "inconclusive");
  assert.equal(phaseCellClass({ lo: -0.01, hi: 0.01 }, null), "inconclusive");
  assert.equal(instrumentDelta("confirmed", 0.016), 0.016);
  assert.equal(instrumentDelta("inconclusive", 0.016), null);
  assert.equal(instrumentDelta("refuted", -0.01), null);
});

test("not-attracted call and baseline contrast", () => {
  assert.equal(notAttractedCall("null-with-sensitivity", false), "confirmed");
  assert.equal(notAttractedCall("repelled", false), "confirmed");
  assert.equal(notAttractedCall("attracted", false), "refuted");
  assert.equal(notAttractedCall("inconclusive", false), "inconclusive");
  assert.equal(notAttractedCall("repelled", true), "inconclusive");
  assert.equal(baselineContrast({ lo: 0.01, hi: 0.02 }), "rho-higher");
  assert.equal(baselineContrast({ lo: -0.02, hi: -0.01 }), "rho-lower");
  assert.equal(baselineContrast({ lo: -0.01, hi: 0.01 }), "no-difference");
  assert.equal(explorerIndex("rho"), 4);
  assert.equal(PHASE_EXPLORERS.length, 5);
  assert.equal(greaterCall({ lo: 0.01, hi: 0.2 }), "confirmed");
});

test("matched arms stay paired for a walk that ignores observations", () => {
  const seed = 1;
  const steps = 400;
  let paired = 0;
  const noise0 = noisePair(0);
  const noise1 = noisePair(1);
  const drift0 = driftPair(0);
  const driftAt = driftPair(0.01877);
  const forget = [
    matchedSpec("held", 0, 0.012924125031568812),
    matchedSpec("held", 0, 0),
  ] as const;
  const boost = [positiveSpecs().target, positiveSpecs().control] as const;
  for (const [target, control] of [noise0, noise1, drift0, driftAt, forget, boost]) {
    const a = runPhaseEpisode({ id: 0, seed, signal: "random", spec: target }, steps);
    const b = runPhaseEpisode({ id: 1, seed, signal: "random", spec: control }, steps);
    assert.equal(a.frac, b.frac);
    assert.equal(a.foods, b.foods);
    assert.equal(a.lives, b.lives);
    paired += 1;
  }
  assert.equal(paired, 6);
  for (const [target, control] of [noise0, drift0]) {
    const a = runPhaseEpisode({ id: 2, seed, signal: "rho", spec: target }, steps);
    const b = runPhaseEpisode({ id: 3, seed, signal: "rho", spec: control }, steps);
    assert.equal(a.frac, b.frac);
    assert.equal(a.foods, b.foods);
    assert.equal(a.lives, b.lives);
  }
});

function noisePair(amplitude: number) {
  return [noiseSpecLocal(amplitude, "noise"), noiseSpecLocal(amplitude, "static")] as const;
}

function noiseSpecLocal(amplitude: number, content: "noise" | "static") {
  return {
    noiseAmplitude: amplitude,
    content,
    matchedArm: null,
    driftRate: 0,
    forgettingRate: 0,
    boostAdd: 0,
  } as const;
}

function driftPair(rate: number) {
  return [matchedSpec("drift", rate), matchedSpec("held", rate)] as const;
}
