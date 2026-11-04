import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "./kernel.ts";
import { doorY, dividerX } from "./family.ts";
import { doorwayActionRegion } from "./doorway-run.ts";
import { negateSpec } from "./negate-run.ts";
import { mulberry32 } from "./presets.ts";
import { runRelearnSample } from "./relearn-run.ts";
import {
  DOOR_X,
  DOOR_Y,
  SEED1_DROP_HELD,
  SEED1_DROP_NEGATE,
  SEED1_LEARN,
  SEED1_OVERWRITE,
  SEED1_RAW_HELD,
  SEED1_RAW_NEGATE,
  relearnSummary,
  relearnVerdict,
  slopeVerdict,
  type RelearnCalls,
} from "./relearn.ts";

function withSeed<T>(seed: number, fn: () => T): T {
  const prev = Math.random;
  Math.random = mulberry32(seed >>> 0);
  try {
    return fn();
  } finally {
    Math.random = prev;
  }
}

const ready: RelearnCalls = {
  held: "refuted",
  origin: "confirmed",
  drop: "confirmed",
  fall: "confirmed",
  arrival: "confirmed",
  progress: "refuted",
  rawDoor: "confirmed",
  rhoDoor: "refuted",
  surpriseDoor: "refuted",
  rndDoor: "refuted",
  slope: "refuted",
};

test("the locked door cell is the west lip of the east room", () => {
  assert.equal(DOOR_X, dividerX(15));
  assert.equal(DOOR_Y, doorY(15));
  const k = withSeed(1, () => new Kernel("distractor", 1, undefined, { env: negateSpec(), signal: "rho" }));
  assert.equal(k.regionAt(DOOR_X, DOOR_Y), 0);
  assert.equal(k.regionAt(DOOR_X + 1, DOOR_Y), 1);
  k.x = DOOR_X;
  k.y = DOOR_Y;
  const into = [0, 1, 2, 3, 4].filter((action) => doorwayActionRegion(k, DOOR_X, DOOR_Y, action) === 1);
  const out = [0, 1, 2, 3, 4].filter((action) => doorwayActionRegion(k, DOOR_X, DOOR_Y, action) !== 1);
  assert.deepEqual(into, [1]);
  assert.equal(out.length, 4);
});

test("scoring the door does not move the weights or the ema", () => {
  const k = withSeed(2, () => new Kernel("distractor", 2, undefined, { env: negateSpec(), signal: "rho", traceScores: true }));
  const before = k.saveBrain();
  k.x = DOOR_X;
  k.y = DOOR_Y;
  const scores = k.scoreActions("rho");
  assert.equal(scores.length, 5);
  assert.ok(Number.isFinite(k.actionTrueError(1)));
  const after = k.saveBrain();
  assert.deepEqual(after.w1, before.w1);
  assert.deepEqual(after.w2, before.w2);
  assert.equal(after.ema, before.ema);
  assert.equal(after.progressEma, before.progressEma);
});

test("level is the predicted summary and a seeking rho refutes it", () => {
  assert.equal(relearnSummary(ready), "level");
  assert.equal(relearnVerdict("level"), "confirmed");
  assert.equal(relearnVerdict("level-fast"), "confirmed");
  assert.equal(relearnVerdict("level-open"), "confirmed");
  assert.equal(relearnSummary({ ...ready, slope: "confirmed" }), "level-fast");
  assert.equal(relearnSummary({ ...ready, slope: "inconclusive" }), "level-open");
  assert.equal(slopeVerdict("refuted"), "confirmed");
  assert.equal(slopeVerdict("confirmed"), "refuted");
  assert.equal(slopeVerdict("inconclusive"), "inconclusive");
  assert.equal(relearnSummary({ ...ready, held: "confirmed" }), "unreproduced");
  assert.equal(relearnSummary({ ...ready, origin: "refuted" }), "no-origin");
  assert.equal(relearnSummary({ ...ready, drop: "refuted" }), "no-drop");
  assert.equal(relearnSummary({ ...ready, fall: "inconclusive" }), "not-falling");
  assert.equal(relearnSummary({ ...ready, arrival: "refuted" }), "no-arrival");
  assert.equal(relearnSummary({ ...ready, progress: "confirmed" }), "paid");
  assert.equal(relearnSummary({ ...ready, rawDoor: "refuted" }), "hidden");
  assert.equal(relearnSummary({ ...ready, rhoDoor: "confirmed", surpriseDoor: "confirmed" }), "shared");
  assert.equal(relearnSummary({ ...ready, rhoDoor: "confirmed" }), "policy");
  assert.equal(relearnSummary({ ...ready, surpriseDoor: "confirmed" }), "immune");
  assert.equal(relearnSummary({ ...ready, rndDoor: "confirmed" }), "rnd");
  assert.equal(relearnVerdict("paid"), "refuted");
  assert.equal(relearnVerdict("immune"), "refuted");
  assert.equal(relearnVerdict("hidden"), "inconclusive");
  assert.equal(relearnVerdict("unreproduced"), "inconclusive");
});

test("seed 1 reproduces the published negation return", () => {
  const row = runRelearnSample(0, 1);
  assert.ok(Math.abs(row.stay) < 1e-9);
  assert.ok(Math.abs(row.learnDrop - SEED1_LEARN) < 1e-9);
  assert.ok(Math.abs(row.negateOverwrite - SEED1_OVERWRITE) < 1e-9);
  assert.ok(Math.abs(row.held.raw - SEED1_RAW_HELD) < 1e-9);
  assert.ok(Math.abs(row.negate.raw - SEED1_RAW_NEGATE) < 1e-9);
  assert.ok(Math.abs(row.held.drop20 - SEED1_DROP_HELD) < 1e-9);
  assert.ok(Math.abs(row.negate.drop20 - SEED1_DROP_NEGATE) < 1e-9);
  assert.equal(row.negateDoor.count, row.heldDoor.count);
});
