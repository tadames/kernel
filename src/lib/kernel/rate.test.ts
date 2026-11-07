import assert from "node:assert/strict";
import test from "node:test";
import { driftRatesFromTau } from "./family.ts";
import { LOCKED_DRIFT_TAU } from "./drift-run.ts";
import { runDriftDoor } from "./atlas-run.ts";
import {
  PUBLISHED_AT_COUNT,
  PUBLISHED_AT_RAW,
  PUBLISHED_AT_RHO,
  PUBLISHED_AT_RHO_BONUS,
  PUBLISHED_AT_RND,
  PUBLISHED_AT_RND_BONUS,
  PUBLISHED_AT_SEED1_RHO,
  PUBLISHED_AT_SURPRISE,
  PUBLISHED_AT_SURPRISE_BONUS,
  RATE_DELTA,
  RATE_LEVELS,
  rateBaselineSalt,
  rateLadder,
  rateLogitSalt,
  ratePeakSalt,
  rateRiseSalt,
  rateSummary,
  rateVerdict,
} from "./rate.ts";
import { assertRateLadder, runRateSample } from "./rate-run.ts";

test("the door ladder is the locked nonzero drift grid", () => {
  const ladder = assertRateLadder();
  assert.deepEqual(
    ladder.map((cell) => cell.rate),
    [0.001173, 0.004692, 0.01877, 0.07507, 0.3003],
  );
  assert.deepEqual(
    ladder.map((cell) => cell.level),
    [...RATE_LEVELS],
  );
  const full = driftRatesFromTau(LOCKED_DRIFT_TAU);
  assert.equal(full[0], 0);
  assert.equal(ladder[2]!.rate, full[3]);
  assert.equal(RATE_DELTA, 0.05422156393527985);
  assert.equal(rateLogitSalt("at", 4), 42024);
  assert.equal(rateLogitSalt("fast", 0), 42040);
  assert.equal(ratePeakSalt("slow"), 42400);
  assert.equal(ratePeakSalt("fast"), 42404);
  assert.equal(rateRiseSalt("surprise"), 42412);
  assert.equal(rateRiseSalt("rnd"), 42413);
  assert.equal(rateBaselineSalt("fast", 2), 42342);
  assert.equal(PUBLISHED_AT_RHO, 0.061450635716319084);
  assert.equal(PUBLISHED_AT_SURPRISE, 0.24986666545271874);
  assert.equal(PUBLISHED_AT_RND, 0.03987037252634764);
  assert.equal(PUBLISHED_AT_COUNT, -0.33158675611019134);
  assert.equal(PUBLISHED_AT_RAW, -0.1660314184533794);
  assert.equal(PUBLISHED_AT_RHO_BONUS, 0.01840890091524244);
  assert.equal(PUBLISHED_AT_SURPRISE_BONUS, 0.06833567010238767);
  assert.equal(PUBLISHED_AT_RND_BONUS, -0.006656389080453664);
});

test("the headline is a band, and a fast rate that wins refutes it", () => {
  const banded = {
    atAttracted: true,
    peakSlow: "confirmed" as const,
    peakFast: "confirmed" as const,
    fastRho: "confirmed" as const,
    fastSurprise: "attracted" as const,
  };
  assert.equal(rateSummary(banded), "banded");
  assert.equal(rateVerdict("banded"), "confirmed");
  assert.equal(rateSummary({ ...banded, atAttracted: false }), "unreproduced");
  assert.equal(rateSummary({ ...banded, peakSlow: "refuted", peakFast: "refuted" }), "trough");
  assert.equal(rateSummary({ ...banded, peakFast: "refuted" }), "rising");
  assert.equal(rateSummary({ ...banded, peakSlow: "refuted" }), "no-peak");
  assert.equal(rateSummary({ ...banded, peakFast: "inconclusive" }), "inconclusive");
  assert.equal(rateSummary({ ...banded, fastRho: "refuted" }), "open");
  assert.equal(rateSummary({ ...banded, fastRho: "inconclusive" }), "inconclusive");
  assert.equal(rateSummary({ ...banded, fastSurprise: "repelled" }), "tracked");
  assert.equal(rateSummary({ ...banded, fastSurprise: "null-with-sensitivity" }), "tracked");
  assert.equal(rateSummary({ ...banded, fastSurprise: "inconclusive" }), "inconclusive");
  assert.equal(rateVerdict("rising"), "refuted");
  assert.equal(rateVerdict("no-peak"), "refuted");
  assert.equal(rateVerdict("trough"), "refuted");
  assert.equal(rateVerdict("tracked"), "refuted");
  assert.equal(rateVerdict("open"), "inconclusive");
  assert.equal(rateVerdict("inconclusive"), "inconclusive");
  assert.equal(rateVerdict("unreproduced"), "inconclusive");
});

test("the adaptation-rate door matches the published atlas cell on seed 1", () => {
  const door = runDriftDoor(1);
  assert.equal(door.logit.rho, PUBLISHED_AT_SEED1_RHO);
  assert.equal(door.logit.random, 0);
  assert.equal(door.bonus.count, 0);
  assert.equal(door.bonus.random, 0);
  const row = runRateSample(0, 1);
  assert.equal(row.doors.at.logit.rho, door.logit.rho);
  assert.equal(row.doors.at.logit.surprise, door.logit.surprise);
  assert.equal(row.doors.at.logit.rnd, door.logit.rnd);
  assert.equal(row.doors.at.logit.count, door.logit.count);
  assert.equal(row.doors.at.raw, door.raw);
  assert.equal(row.doors.at.bonus.rho, door.bonus.rho);
  for (const level of RATE_LEVELS) {
    assert.equal(row.doors[level].logit.random, 0);
    assert.equal(row.doors[level].bonus.count, 0);
  }
  assert.equal(rateLadder()[2]!.level, "at");
});
