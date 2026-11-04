import assert from "node:assert/strict";
import test from "node:test";
import { RHO_HAT_PROG_WEIGHT } from "./policy.ts";
import { rateBonusSalt, rateLogitSalt } from "./rate.ts";
import { runDriftDoor } from "./atlas-run.ts";
import {
  CEILING_RATE,
  DOOR_RATE_LIMIT,
  DOSE_AXIS_HI,
  DOSE_AXIS_LO,
  FAST_RATE,
  PUBLISHED_FAST_COUNT,
  PUBLISHED_FAST_RAW,
  PUBLISHED_FAST_RHO,
  PUBLISHED_FAST_RHO_BONUS,
  PUBLISHED_FAST_RND,
  PUBLISHED_FAST_RND_BONUS,
  PUBLISHED_FAST_SEED1_RHO,
  PUBLISHED_FAST_SURPRISE,
  PUBLISHED_FAST_SURPRISE_BONUS,
  RATE_DELTA,
  ceilingBaselineSalt,
  ceilingBonusFallSalt,
  ceilingBonusSalt,
  ceilingDoseBand,
  ceilingFallSalt,
  ceilingLogitSalt,
  ceilingRawFallSalt,
  ceilingRawSalt,
  ceilingSummary,
  ceilingVerdict,
  progressDose,
} from "./ceiling.ts";
import { assertCeilingRates, runCeilingSample } from "./ceiling-run.ts";

test("the ceiling rate is one locked cell under the door limit", () => {
  const rates = assertCeilingRates();
  assert.equal(rates.fast, FAST_RATE);
  assert.equal(rates.ceiling, CEILING_RATE);
  assert.equal(FAST_RATE, 0.3003);
  assert.equal(CEILING_RATE, 0.94);
  assert.equal(DOOR_RATE_LIMIT, 0.95);
  assert.ok(CEILING_RATE > FAST_RATE);
  assert.ok(CEILING_RATE < DOOR_RATE_LIMIT);
  assert.equal(RATE_DELTA, 0.05422156393527985);
  assert.equal(DOSE_AXIS_LO, -0.02);
  assert.equal(DOSE_AXIS_HI, 0.08);
  assert.equal(RHO_HAT_PROG_WEIGHT, 0.55);
  assert.equal(ceilingLogitSalt("fast", 4), rateLogitSalt("fast", 4));
  assert.equal(ceilingLogitSalt("fast", 4), 42044);
  assert.equal(ceilingBonusSalt("fast", 4), rateBonusSalt("fast", 4));
  assert.equal(ceilingLogitSalt("ceiling", 4), 43004);
  assert.equal(ceilingBonusSalt("ceiling", 2), 43102);
  assert.equal(ceilingRawSalt("ceiling"), 43200);
  assert.equal(ceilingBaselineSalt("ceiling", 3), 43303);
  assert.equal(ceilingFallSalt(4), 43404);
  assert.equal(ceilingBonusFallSalt(), 43600);
  assert.equal(ceilingRawFallSalt(), 43700);
  assert.equal(PUBLISHED_FAST_RHO, 0.06867696205154061);
  assert.equal(PUBLISHED_FAST_SURPRISE, 0.27239973679184915);
  assert.equal(PUBLISHED_FAST_RND, 0.04574953872710466);
  assert.equal(PUBLISHED_FAST_COUNT, -0.38972927927970885);
  assert.equal(PUBLISHED_FAST_RAW, -0.20304700671425796);
  assert.equal(PUBLISHED_FAST_RHO_BONUS, 0.01940108576051468);
  assert.equal(PUBLISHED_FAST_SURPRISE_BONUS, 0.07297489142045378);
  assert.equal(PUBLISHED_FAST_RND_BONUS, -0.005818616191390902);
});

test("the headline is a falloff, and a ceiling that still attracts refutes it", () => {
  const fallen = { ceilingRho: "confirmed" as const, ceilingSurprise: "attracted" as const };
  assert.equal(ceilingSummary(fallen), "fallen");
  assert.equal(ceilingVerdict("fallen"), "confirmed");
  assert.equal(ceilingSummary({ ...fallen, ceilingRho: "refuted" }), "plateau");
  assert.equal(ceilingSummary({ ...fallen, ceilingRho: "inconclusive" }), "inconclusive");
  assert.equal(ceilingSummary({ ...fallen, ceilingSurprise: "repelled" }), "tracked");
  assert.equal(ceilingSummary({ ...fallen, ceilingSurprise: "null-with-sensitivity" }), "tracked");
  assert.equal(ceilingSummary({ ...fallen, ceilingSurprise: "inconclusive" }), "inconclusive");
  assert.equal(ceilingVerdict("plateau"), "refuted");
  assert.equal(ceilingVerdict("tracked"), "refuted");
  assert.equal(ceilingVerdict("inconclusive"), "inconclusive");
});

test("a progress dose is the bonus times 0.55 and sits on the published curve", () => {
  const bonus = { mean: 0.02, lo: 0.01, hi: 0.03, n: 200 };
  const dose = progressDose(bonus);
  assert.equal(dose.mean, 0.55 * bonus.mean);
  assert.equal(dose.lo, 0.55 * bonus.lo);
  assert.equal(dose.hi, 0.55 * bonus.hi);
  assert.equal(dose.n, 200);
  assert.equal(ceilingDoseBand(dose, 200), "below-undetectable");
  assert.equal(ceilingDoseBand({ mean: 0.03, lo: 0.02, hi: 0.04, n: 200 }, 200), "rho-blind-band");
  assert.equal(ceilingDoseBand({ mean: 0.07, lo: 0.06, hi: 0.08, n: 200 }, 200), "at-or-above-detectable");
  assert.equal(ceilingDoseBand({ mean: 0.05, lo: 0.04, hi: 0.06, n: 200 }, 200), "spans-detectable");
  assert.equal(ceilingDoseBand({ mean: 0.02, lo: 0.01, hi: 0.03, n: 40 }, 200), "too-few");
});

test("the fast door matches the published 16× cell on seed 1", () => {
  const door = runDriftDoor(1, FAST_RATE);
  assert.equal(door.logit.rho, PUBLISHED_FAST_SEED1_RHO);
  assert.equal(door.logit.random, 0);
  assert.equal(door.bonus.count, 0);
  const row = runCeilingSample(0, 1);
  assert.equal(row.fast.logit.rho, door.logit.rho);
  assert.equal(row.fast.logit.surprise, door.logit.surprise);
  assert.equal(row.fast.logit.rnd, door.logit.rnd);
  assert.equal(row.fast.logit.count, door.logit.count);
  assert.equal(row.fast.raw, door.raw);
  assert.equal(row.fast.bonus.rho, door.bonus.rho);
  assert.equal(row.ceiling.logit.random, 0);
  assert.equal(row.ceiling.bonus.count, 0);
  assert.equal(row.ceiling.bonus.random, 0);
  assert.equal(Number.isFinite(row.ceiling.logit.rho), true);
  assert.equal(Number.isFinite(row.ceiling.bonus.rho), true);
  assert.equal(Number.isFinite(row.ceiling.raw), true);
});
