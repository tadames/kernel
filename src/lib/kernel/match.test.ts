import assert from "node:assert/strict";
import test from "node:test";
import { RHO_HAT_PROG_WEIGHT } from "./policy.ts";
import { runDriftDoor } from "./atlas-run.ts";
import { CEILING_RATE, ceilingBonusSalt, ceilingLogitSalt, ceilingRawSalt } from "./ceiling.ts";
import {
  MATCH_COLOR_CLAMP,
  PUBLISHED_CEILING_COUNT,
  PUBLISHED_CEILING_RAW,
  PUBLISHED_CEILING_RHO,
  PUBLISHED_CEILING_RHO_BONUS,
  PUBLISHED_CEILING_RND,
  PUBLISHED_CEILING_RND_BONUS,
  PUBLISHED_CEILING_SEED1_RHO,
  PUBLISHED_CEILING_SURPRISE,
  PUBLISHED_CEILING_SURPRISE_BONUS,
  RATE_DELTA,
  matchDriftBonusSalt,
  matchDriftLogitSalt,
  matchDriftRawSalt,
  matchGapSalt,
  matchPlantSalt,
  matchSummary,
  matchVerdict,
} from "./match.ts";
import { assertMatchRate, runMatchSample } from "./match-run.ts";

test("the matched door is the published ceiling cell", () => {
  assert.equal(assertMatchRate(), 0.94);
  assert.equal(CEILING_RATE, 0.94);
  assert.equal(RATE_DELTA, 0.05422156393527985);
  assert.equal(MATCH_COLOR_CLAMP, 0.3);
  assert.equal(RHO_HAT_PROG_WEIGHT, 0.55);
  assert.equal(matchDriftLogitSalt(4), ceilingLogitSalt("ceiling", 4));
  assert.equal(matchDriftLogitSalt(4), 43004);
  assert.equal(matchDriftBonusSalt(4), ceilingBonusSalt("ceiling", 4));
  assert.equal(matchDriftBonusSalt(2), 43102);
  assert.equal(matchDriftRawSalt(), ceilingRawSalt("ceiling"));
  assert.equal(matchDriftRawSalt(), 43200);
  assert.equal(matchPlantSalt(4), 44104);
  assert.equal(matchGapSalt(4), 44204);
  assert.equal(PUBLISHED_CEILING_RHO, 0.07877570550888777);
  assert.equal(PUBLISHED_CEILING_SURPRISE, 0.29832686215639115);
  assert.equal(PUBLISHED_CEILING_RND, 0.04852886945009231);
  assert.equal(PUBLISHED_CEILING_COUNT, -0.4250148528814316);
  assert.equal(PUBLISHED_CEILING_RAW, -0.19100396591506477);
  assert.equal(PUBLISHED_CEILING_RHO_BONUS, 0.02258083738292072);
  assert.equal(PUBLISHED_CEILING_SURPRISE_BONUS, 0.07840519232675433);
  assert.equal(PUBLISHED_CEILING_RND_BONUS, -0.006153701646253467);
  assert.equal(PUBLISHED_CEILING_SEED1_RHO, 0.07902253419160843);
});

test("the headline is a matched dose, and a larger drift logit refutes it", () => {
  const accounted = {
    driftRho: "attracted" as const,
    plantRho: "attracted" as const,
    gap: "null-with-sensitivity" as const,
  };
  assert.equal(matchSummary(accounted), "accounted");
  assert.equal(matchVerdict("accounted"), "confirmed");
  assert.equal(matchSummary({ ...accounted, gap: "attracted" }), "excess");
  assert.equal(matchSummary({ ...accounted, plantRho: "repelled", gap: "attracted" }), "excess");
  assert.equal(matchVerdict("excess"), "refuted");
  assert.equal(matchSummary({ ...accounted, gap: "repelled" }), "short");
  assert.equal(matchVerdict("short"), "refuted");
  assert.equal(matchSummary({ ...accounted, plantRho: "null-with-sensitivity" }), "blind");
  assert.equal(matchSummary({ ...accounted, plantRho: "inconclusive" }), "blind");
  assert.equal(matchSummary({ ...accounted, plantRho: "repelled" }), "blind");
  assert.equal(matchVerdict("blind"), "refuted");
  assert.equal(matchSummary({ ...accounted, driftRho: "null-with-sensitivity" }), "unreproduced");
  assert.equal(matchSummary({ ...accounted, driftRho: "inconclusive" }), "unreproduced");
  assert.equal(matchVerdict("unreproduced"), "inconclusive");
  assert.equal(matchSummary({ ...accounted, gap: "inconclusive" }), "inconclusive");
  assert.equal(matchVerdict("inconclusive"), "inconclusive");
});

test("seed 1 of the matched door is the published ceiling door", () => {
  const door = runDriftDoor(1, CEILING_RATE);
  assert.equal(door.logit.rho, PUBLISHED_CEILING_SEED1_RHO);
  const row = runMatchSample(0, 1);
  assert.equal(row.door.logit.rho, door.logit.rho);
  assert.equal(row.door.logit.surprise, door.logit.surprise);
  assert.equal(row.door.logit.rnd, door.logit.rnd);
  assert.equal(row.door.logit.count, door.logit.count);
  assert.equal(row.door.logit.random, 0);
  assert.equal(row.door.bonus.rho, door.bonus.rho);
  assert.equal(row.door.bonus.surprise, door.bonus.surprise);
  assert.equal(row.door.bonus.rnd, door.bonus.rnd);
  assert.equal(row.door.bonus.count, 0);
  assert.equal(row.door.raw, door.raw);
  assert.equal(row.dose, RHO_HAT_PROG_WEIGHT * row.door.bonus.rho);
  assert.equal(Number.isFinite(row.dose), true);
  assert.equal(row.plant.logit.random, 0);
  assert.equal(row.plant.bonus.count, 0);
  assert.ok(Math.abs(row.plant.raw) <= 1e-4);
  assert.ok(Math.abs(row.plant.bonus.rho) <= 1e-4);
  assert.ok(Math.abs(row.plant.logit.surprise - row.plant.logit.rho) <= 1e-4);
  assert.ok(Math.abs(row.plant.logit.rnd - row.plant.logit.rho) <= 1e-4);
  assert.ok(Math.abs(row.plant.logit.count - row.plant.logit.rho) <= 1e-4);
  assert.equal(Number.isFinite(row.plant.logit.rho), true);
});
