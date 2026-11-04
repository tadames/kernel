import assert from "node:assert/strict";
import test from "node:test";
import { applyFamily } from "./family.ts";
import { Kernel } from "./kernel.ts";
import { mulberry32 } from "./presets.ts";
import {
  ATLAS_CONTENT_STEPS,
  ATLAS_DRIFT,
  ATLAS_STREAM,
  PUBLISHED_RAW_DOOR,
  PUBLISHED_RHO_DOOR,
  atlasBaselineSalt,
  atlasBonusSalt,
  atlasLogitSalt,
  atlasPlantSalt,
  atlasRawSalt,
  atlasSummary,
  atlasVerdict,
} from "./atlas.ts";
import { applyNoiseMode, driftSpec, noiseSpec, runAtlasSample } from "./atlas-run.ts";
import { PHASE_DOSE, PHASE_STEPS } from "./phase-diagram.ts";

function withSeed<T>(seed: number, fn: () => T): T {
  const prev = Math.random;
  Math.random = mulberry32(seed >>> 0);
  try {
    return fn();
  } finally {
    Math.random = prev;
  }
}

test("the door phase locks the adaptation rate, the dose, and the salts", () => {
  assert.equal(ATLAS_DRIFT, 0.01877);
  assert.equal(ATLAS_CONTENT_STEPS, PHASE_STEPS);
  assert.equal(ATLAS_CONTENT_STEPS, 400);
  assert.equal(PHASE_DOSE, 0.0085);
  assert.equal(ATLAS_STREAM, 41011);
  assert.equal(atlasLogitSalt("noise", 4), 41004);
  assert.equal(atlasLogitSalt("drift", 4), 41014);
  assert.equal(atlasLogitSalt("forget", 4), 41024);
  assert.equal(atlasBonusSalt("forget", 2), 41122);
  assert.equal(atlasRawSalt("noise"), 41200);
  assert.equal(atlasPlantSalt(4), 41304);
  assert.equal(atlasBaselineSalt("drift", 3), 41513);
  assert.equal(PUBLISHED_RHO_DOOR, -0.003528726361691952);
  assert.equal(PUBLISHED_RAW_DOOR, 0.07871244594574688);
});

test("the headline is a sensitive null map, and an attraction refutes it", () => {
  const mapped = { plant: "confirmed" as const, noise: "confirmed" as const, drift: "confirmed" as const, forget: "confirmed" as const, noiseSeparated: true };
  assert.equal(atlasSummary(mapped), "mapped");
  assert.equal(atlasVerdict("mapped"), "confirmed");
  assert.equal(atlasSummary({ ...mapped, noise: "refuted" }), "attracted");
  assert.equal(atlasVerdict("attracted"), "refuted");
  assert.equal(atlasSummary({ ...mapped, plant: "inconclusive" }), "instrument-blind");
  assert.equal(atlasSummary({ ...mapped, noiseSeparated: false }), "inconclusive");
  assert.equal(atlasSummary({ ...mapped, drift: "inconclusive" }), "inconclusive");
  assert.equal(atlasSummary({ ...mapped, noise: "refuted", plant: "inconclusive", noiseSeparated: false }), "attracted");
  assert.equal(atlasVerdict("instrument-blind"), "inconclusive");
  assert.equal(atlasVerdict("inconclusive"), "inconclusive");
});

test("a frozen picture stays frozen only after the noise mode is set", () => {
  const spec = noiseSpec(3, "static");
  const k = withSeed(3 * 10007 + ATLAS_STREAM, () => new Kernel("distractor", 3, undefined, { env: spec, signal: "rho" }));
  assert.ok(k.family);
  assert.equal(k.family.mode, "hold");
  applyNoiseMode(k);
  const before = k.family.glow.slice();
  applyFamily(k.cells, k.family, k.envParams, mulberry32(1));
  assert.deepEqual(k.family.glow, before);
  const live = withSeed(3 * 10007 + ATLAS_STREAM, () => new Kernel("distractor", 3, undefined, { env: noiseSpec(3, "noise"), signal: "rho" }));
  assert.ok(live.family);
  applyNoiseMode(live);
  const painted = live.family.glow.slice();
  applyFamily(live.cells, live.family, live.envParams, mulberry32(1));
  assert.notDeepEqual(live.family.glow, painted);
});

test("drift arms keep the matched modes on the cycle map", () => {
  const drift = withSeed(1, () => new Kernel("distractor", 1, undefined, { env: driftSpec("drift"), signal: "rho" }));
  const held = withSeed(1, () => new Kernel("distractor", 1, undefined, { env: driftSpec("held"), signal: "rho" }));
  assert.equal(drift.family?.mode, "drift");
  assert.equal(held.family?.mode, "hold");
  assert.equal(drift.envParams.cycleWorld, true);
  assert.equal(drift.envParams.driftRate, 0.01877);
});

test("seed 1 shares a count bonus and reproduces the mastered door", () => {
  const row = runAtlasSample(0, 1);
  assert.equal(row.noise.bonus.count, 0);
  assert.equal(row.drift.bonus.count, 0);
  assert.equal(row.forget.bonus.count, 0);
  assert.equal(row.noise.logit.random, 0);
  assert.equal(row.drift.logit.random, 0);
  assert.equal(row.plant.logit.random, 0);
  assert.ok(Math.abs(row.plant.bonus.rho) <= 1e-4);
  assert.ok(Math.abs(row.plant.raw) <= 1e-4);
  assert.ok(Math.abs(row.flatRho - row.heldRho) <= 1e-9);
  assert.ok(Math.abs(row.stay) < 1e-9);
});
