import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Kernel } from "./kernel.ts";
import { applyFamily, createFamily, distractorSpec, driftRatesFromTau, forgettingRatesFromTau, patternBit, splitSpec } from "./family.ts";
import { applyDrift, DEFAULT_ENV_PARAMS } from "./env.ts";
import { fitTau } from "./phase-run.ts";
import { acfPeriod, spectralPeriod } from "./period.ts";
import { mulberry32 } from "./presets.ts";

test("static drift still refuses a positive rate, and zero is a no-op", () => {
  const cells = new Uint8Array([0, 1, 2, 0]);
  applyDrift(cells, DEFAULT_ENV_PARAMS, () => 0);
  assert.equal(cells[1], 1);
  assert.throws(() => applyDrift(cells, { ...DEFAULT_ENV_PARAMS, driftRate: 0.1 }, () => 0));
});

test("drift 0 is stationary noise and a held pattern does not move", () => {
  const params = { learnability: 1, driftRate: 0, distractorRelevance: 0 };
  const noise = createFamily("distractor", 15, 3000, params, false);
  assert.equal(noise.family.mode, "noise");
  const before = noise.family.glow.slice();
  applyFamily(noise.cells, noise.family, params, mulberry32(1));
  let changed = 0;
  for (let i = 0; i < before.length; i++) {
    if (noise.family.region[i] === 1 && before[i] !== noise.family.glow[i]) changed += 1;
  }
  assert.ok(changed > 0);
  for (let i = 0; i < noise.cells.length; i++) {
    if (noise.family.region[i] === 1) assert.notEqual(noise.cells[i], 2);
  }

  const held = createFamily("distractor", 15, 3000, params, true);
  assert.equal(held.family.mode, "hold");
  const glow = held.family.glow.slice();
  applyFamily(held.cells, held.family, params, mulberry32(2));
  applyFamily(held.cells, held.family, params, mulberry32(3));
  assert.deepEqual(Array.from(held.family.glow), Array.from(glow));
});

test("learnability selects deterministic west cells and relevance makes the east room edible", () => {
  const full = createFamily("distractor", 15, 3000, { learnability: 1, driftRate: 0, distractorRelevance: 0 }, false);
  let stochastic = 0;
  for (let i = 0; i < full.family.stochastic.length; i++) stochastic += full.family.stochastic[i]!;
  assert.equal(stochastic, 0);

  const none = createFamily("distractor", 15, 3000, { learnability: 0, driftRate: 0, distractorRelevance: 0 }, false);
  let noiseCells = 0;
  let west = 0;
  for (let i = 0; i < none.cells.length; i++) {
    if ((i % 15) === none.family.dividerX) continue;
    if (none.family.region[i] !== 0 || none.cells[i] === 1) continue;
    west += 1;
    noiseCells += none.family.stochastic[i]!;
  }
  assert.ok(west > 20);
  assert.equal(noiseCells, west);
  assert.equal(none.cells[1 * 15 + none.family.dividerX], 1);

  const edible = createFamily("distractor", 15, 11, { learnability: 1, driftRate: 0.25, distractorRelevance: 1 }, false);
  assert.equal(edible.family.mode, "drift");
  let foods = 0;
  for (let i = 0; i < edible.cells.length; i++) if (edible.family.region[i] === 1 && edible.cells[i] === 2) foods += 1;
  assert.ok(foods > 0);
  const edibleDoor = edible.family.doorY * 15 + edible.family.dividerX;
  assert.equal(edible.cells[edibleDoor], 0);
  assert.equal(edible.family.region[edibleDoor], 0);
  assert.equal(patternBit(2, 2, 3), patternBit(2, 2, 3));
});

test("split puts food on both sides of the door", () => {
  const split = createFamily("split", 15, 4000, splitSpec().params, false);
  assert.equal(split.family.mode, "split");
  let west = 0;
  let east = 0;
  for (let i = 0; i < split.cells.length; i++) {
    if (split.cells[i] !== 2) continue;
    if (split.family.region[i] === 0) west += 1;
    if (split.family.region[i] === 1) east += 1;
  }
  assert.ok(west > 0);
  assert.ok(east > 0);
});

test("a short distractor episode stays finite and weight decay shrinks the net", () => {
  Math.random = mulberry32(4);
  const k = new Kernel("distractor", 2, undefined, {
    env: distractorSpec({ learnability: 1, driftRate: 0, distractorRelevance: 0 }),
    signal: "rho",
  });
  for (let t = 0; t < 12; t++) k.step();
  assert.ok(k.age === 12);
  assert.equal(k.regionAt(1, 1), 0);
  assert.equal(k.regionAt(12, 7), 1);
  const before = k.loop.weightEnergy;
  k.loop.net.decay(0.5);
  assert.ok(k.loop.weightEnergy < before);
});

test("spectral period of a square wave is the wavelength, and a flat line has none", () => {
  const wave: number[] = [];
  for (let i = 0; i < 400; i++) wave.push(Math.floor(i / 20) % 2);
  const peak = spectralPeriod(wave, 10, 120, 3);
  assert.ok(peak.period != null && Math.abs(peak.period - 40) <= 2);
  const acf = acfPeriod(wave, 10, 120, 0.15);
  assert.ok(acf.period != null && Math.abs(acf.period - 40) <= 2);
  const flat = spectralPeriod(new Array(200).fill(0), 10, 80, 3);
  assert.equal(flat.period, null);
});

test("tau fit recovers an exponential e-folding time", () => {
  const errors = [];
  for (let t = 0; t <= 400; t++) errors.push(0.05 + 0.2 * Math.exp(-t / 40));
  const fit = fitTau(errors);
  assert.equal(fit.censored, false);
  assert.ok(fit.tau != null && Math.abs(fit.tau - 40) < 8, `tau ${fit.tau}`);
});

test("drift and forgetting grids bracket 1/tau and stay inside (0, 1)", () => {
  const drifts = driftRatesFromTau(40);
  assert.equal(drifts[0], 0);
  assert.ok(drifts.length >= 5);
  assert.ok(drifts.some((rate) => Math.abs(Math.log(rate) - Math.log(1 / 40)) < Math.log(1.01)));
  const forget = forgettingRatesFromTau(40);
  assert.equal(forget.length, 5);
  for (const rate of forget) {
    assert.ok(rate > 0 && rate < 1);
  }
});

test("CI does not run the phase or forgetting sweeps", () => {
  const yml = readFileSync(".github/workflows/ci.yml", "utf8");
  assert.equal(yml.includes("npm run phase"), false);
  assert.equal(yml.includes("npm run forget"), false);
  assert.equal(yml.includes("npm run timescale"), false);
  assert.equal(yml.includes("npm run noise"), false);
});
