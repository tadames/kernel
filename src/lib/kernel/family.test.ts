import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CENTER, Kernel } from "./kernel.ts";
import { applyFamily, createFamily, distractorSpec, driftRatesFromTau, forgettingRatesFromTau, patternBit, splitSpec } from "./family.ts";
import { applyDrift, DEFAULT_ENV_PARAMS, senseGrid, stepGrid } from "./env.ts";
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

test("a frozen target room keeps its picture and burns the same draws", () => {
  const params = { learnability: 0, driftRate: 0, distractorRelevance: 0 };
  const noise = createFamily("distractor", 15, 3000, params, false);
  const frozen = createFamily(
    "distractor",
    15,
    3000,
    { ...params, roomContent: "static", staticSeed: 4 },
    false,
  );
  assert.equal(noise.family.freezeTarget, false);
  assert.equal(frozen.family.freezeTarget, true);
  assert.notDeepEqual(Array.from(noise.family.glow), Array.from(frozen.family.glow));
  const again = createFamily(
    "distractor",
    15,
    3000,
    { ...params, roomContent: "static", staticSeed: 4 },
    false,
  );
  assert.deepEqual(Array.from(again.family.glow), Array.from(frozen.family.glow));
  const other = createFamily(
    "distractor",
    15,
    3000,
    { ...params, roomContent: "static", staticSeed: 5 },
    false,
  );
  assert.notDeepEqual(Array.from(other.family.glow), Array.from(frozen.family.glow));
  const tagged = createFamily("distractor", 15, 3000, { ...params, staticSeed: 4 }, false);
  assert.deepEqual(Array.from(tagged.family.glow), Array.from(noise.family.glow));

  const step = (built: ReturnType<typeof createFamily>) => {
    let n = 0;
    const before = built.family.glow.slice();
    applyFamily(built.cells, built.family, params, () => {
      n += 1;
      return 0.1;
    });
    let changed = 0;
    for (let i = 0; i < before.length; i++) {
      if (built.family.region[i] === 1 && before[i] !== built.family.glow[i]) changed += 1;
    }
    return { n, changed };
  };
  const noiseStep = step(noise);
  const frozenStep = step(frozen);
  assert.equal(noiseStep.n, frozenStep.n);
  assert.ok(noiseStep.n > 0);
  assert.ok(noiseStep.changed > 0);
  assert.equal(frozenStep.changed, 0);
});

test("mirroring swaps the target room and keeps the shell", () => {
  const params = { learnability: 1, driftRate: 0, distractorRelevance: 0 };
  const east = createFamily("distractor", 15, 3000, params, false);
  const west = createFamily("distractor", 15, 3000, { ...params, mirrorRooms: true }, false);
  assert.equal(east.family.dividerX, 9);
  assert.equal(west.family.dividerX, 5);
  assert.equal(east.family.mirrored, false);
  assert.equal(west.family.mirrored, true);
  const size = 15;
  let eastCells = 0;
  let westCells = 0;
  let foodsE = 0;
  let foodsW = 0;
  for (let i = 0; i < east.cells.length; i++) {
    const x = i % size;
    const y = (i / size) | 0;
    const j = y * size + (size - 1 - x);
    assert.equal(west.cells[j], east.cells[i]);
    assert.equal(west.family.region[j], east.family.region[i]);
    if (east.family.region[i] === 1) eastCells += 1;
    if (west.family.region[i] === 1) westCells += 1;
    if (east.cells[i] === 2) foodsE += 1;
    if (west.cells[i] === 2) foodsW += 1;
  }
  assert.equal(eastCells, 52);
  assert.equal(westCells, 52);
  assert.equal(foodsE, 5);
  assert.equal(foodsW, 5);
  let door = 0;
  for (let y = 0; y < size; y++) {
    if (west.cells[y * size + west.family.dividerX] !== 1) door += 1;
  }
  assert.equal(door, 7);
  assert.equal(west.family.region[west.family.doorY * size + west.family.dividerX], 0);
});

test("the body still starts in the large room after a mirror", () => {
  const params = { learnability: 1, driftRate: 0, distractorRelevance: 0 };
  const east = new Kernel("distractor", 3, undefined, {
    env: distractorSpec(params),
    signal: "random",
  });
  const west = new Kernel("distractor", 3, undefined, {
    env: distractorSpec({ ...params, mirrorRooms: true }),
    signal: "random",
  });
  assert.equal(east.regionAt(), 0);
  assert.ok(east.family);
  assert.ok(west.family);
  assert.ok(east.x <= east.family.dividerX);
  assert.equal(west.regionAt(), 0);
  assert.ok(west.x >= west.family.dividerX);
  assert.notEqual(east.regionAt(east.family.dividerX + 1, east.family.doorY), 0);
  assert.equal(west.regionAt(west.family.dividerX - 1, west.family.doorY), 1);
});

test("a random walk ignores the frozen picture", () => {
  const walk = (content: "noise" | "static", mirror: boolean, learnability: number) => {
    const k = new Kernel("distractor", 8, undefined, {
      env: distractorSpec({
        learnability,
        driftRate: 0,
        distractorRelevance: 0,
        ...(content === "static" ? { roomContent: "static" as const, staticSeed: 8 } : {}),
        ...(mirror ? { mirrorRooms: true } : {}),
      }),
      signal: "random",
    });
    const pos: number[] = [];
    for (let t = 0; t < 40; t++) {
      pos.push(k.x * 15 + k.y);
      k.step();
    }
    return pos;
  };
  for (const mirror of [false, true]) {
    for (const learnability of [0, 1]) {
      assert.deepEqual(walk("noise", mirror, learnability), walk("static", mirror, learnability));
    }
  }
});

test("CI does not run the phase or forgetting sweeps", () => {
  const yml = readFileSync(".github/workflows/ci.yml", "utf8");
  assert.equal(yml.includes("npm run phase"), false);
  assert.equal(yml.includes("npm run forget"), false);
  assert.equal(yml.includes("npm run timescale"), false);
  assert.equal(yml.includes("npm run noise"), false);
  assert.equal(yml.includes("npm run matched-room"), false);
  assert.equal(yml.includes("npm run policy-terms"), false);
  assert.equal(yml.includes("npm run fed-room"), false);
});

test("target foods are five non-edible markers and do not move a random walk", () => {
  const params = { learnability: 0, driftRate: 0, distractorRelevance: 0 };
  const empty = createFamily("distractor", 15, 3000, params, false);
  const fed = createFamily("distractor", 15, 3000, { ...params, targetFoods: true }, false);
  const size = 15;
  let decoys = 0;
  let meals = 0;
  let region1Meals = 0;
  for (let i = 0; i < fed.cells.length; i++) {
    assert.equal(fed.cells[i], empty.cells[i]);
    if (fed.family.decoy[i] !== 1) assert.equal(fed.family.glow[i], empty.family.glow[i]);
    if (fed.cells[i] === 2) meals += 1;
    if (fed.family.decoy[i] === 1) {
      decoys += 1;
      assert.equal(fed.family.region[i], 1);
      assert.equal(fed.cells[i], 0);
      assert.equal(fed.family.glow[i], 0);
    } else {
      assert.equal(fed.family.decoy[i], 0);
    }
    if (fed.family.region[i] === 1 && fed.cells[i] === 2) region1Meals += 1;
    assert.equal(empty.family.decoy[i], 0);
  }
  assert.equal(decoys, 5);
  assert.equal(meals, 5);
  assert.equal(region1Meals, 0);

  const spot = fed.family.decoy.indexOf(1);
  const x = spot % size;
  const y = (spot / size) | 0;
  const into = new Float32Array(5 * 5 * 3);
  senseGrid(
    fed.cells,
    new Float32Array(fed.cells.length),
    x,
    y,
    size,
    2,
    into,
    fed.family.glow,
    null,
    fed.family.decoy,
  );
  assert.equal(into[CENTER], 0);
  assert.equal(into[CENTER + 1], 1);

  const body = {
    cells: fed.cells,
    scent: new Float32Array(fed.cells.length),
    x,
    y,
    energy: 100,
    pulseClock: 0,
  };
  const stepped = stepGrid(body, "distractor", 4, size, () => 0.5, { ...params, targetFoods: true }, fed.family);
  assert.equal(stepped.ate, false);
  assert.equal(body.energy, 99);
  assert.equal(body.cells[spot], 0);
  assert.equal(fed.family.decoy[spot], 1);
  assert.equal(fed.family.glow[spot], 0);

  const mirrored = createFamily("distractor", 15, 3000, { ...params, targetFoods: true, mirrorRooms: true }, false);
  let mirroredDecoys = 0;
  for (let i = 0; i < fed.cells.length; i++) {
    const mx = i % size;
    const my = (i / size) | 0;
    const j = my * size + (size - 1 - mx);
    assert.equal(mirrored.family.decoy[j], fed.family.decoy[i]);
    if (mirrored.family.decoy[i] === 1) {
      mirroredDecoys += 1;
      assert.equal(mirrored.family.region[i], 1);
      assert.equal(mirrored.cells[i], 0);
    }
  }
  assert.equal(mirroredDecoys, 5);

  const walk = (foods: boolean, mirror: boolean) => {
    const k = new Kernel("distractor", 8, undefined, {
      env: distractorSpec({
        ...params,
        ...(foods ? { targetFoods: true } : {}),
        ...(mirror ? { mirrorRooms: true } : {}),
      }),
      signal: "random",
    });
    const pos: number[] = [];
    for (let t = 0; t < 80; t++) {
      pos.push(k.x * size + k.y);
      k.step();
    }
    return { pos, foods: k.foods, lives: k.lives };
  };
  for (const mirror of [false, true]) {
    const plain = walk(false, mirror);
    const marked = walk(true, mirror);
    assert.deepEqual(marked.pos, plain.pos);
    assert.equal(marked.foods, plain.foods);
    assert.equal(marked.lives, plain.lives);
  }
});
