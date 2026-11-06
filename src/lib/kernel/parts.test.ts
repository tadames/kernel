import assert from "node:assert/strict";
import test from "node:test";
import { SCORE_PIECE_NAMES } from "./atlas-run.ts";
import { CEILING_RATE, ceilingBonusSalt, ceilingLogitSalt, ceilingRawSalt } from "./ceiling.ts";
import { PUBLISHED_CEILING_SEED1_RHO, RATE_DELTA } from "./match.ts";
import { RHO_HAT_PROG_WEIGHT } from "./policy.ts";
import { PHASE_EXPLORERS, explorerIndex } from "./phase-diagram.ts";
import {
  PARTS_COLOR_CLAMP,
  PARTS_COLUMNS,
  partsColumnIndex,
  partsOutsideSalt,
  partsPieceSalt,
  partsProgressSalt,
  partsSummary,
  partsVerdict,
} from "./parts.ts";
import { assertPartsRate, runPartsSample } from "./parts-run.ts";

test("the piece door is the published ceiling cell", () => {
  assert.equal(assertPartsRate(), 0.94);
  assert.equal(CEILING_RATE, 0.94);
  assert.equal(RATE_DELTA, 0.05422156393527985);
  assert.equal(PARTS_COLOR_CLAMP, 0.3);
  assert.equal(RHO_HAT_PROG_WEIGHT, 0.55);
  assert.equal(partsColumnIndex("rho"), 0);
  assert.equal(partsColumnIndex("follow"), 4);
  assert.equal(partsPieceSalt(4, 0), 45040);
  assert.equal(partsPieceSalt(explorerIndex("rho"), partsColumnIndex("global")), 45041);
  assert.equal(partsProgressSalt(4), 45104);
  assert.equal(partsOutsideSalt(4), 45204);
  assert.equal(partsPieceSalt(2, 3), 45023);
  assert.equal(ceilingLogitSalt("ceiling", 4), 43004);
  assert.equal(ceilingBonusSalt("ceiling", 4), 43104);
  assert.equal(ceilingRawSalt("ceiling"), 43200);
  assert.deepEqual(PARTS_COLUMNS, ["rho", "global", "uncertainty", "extrinsic", "follow"]);
});

test("the headline is the progress channel, and a signed outside sum refutes it", () => {
  const inside = {
    logit: "attracted" as const,
    progress: "attracted" as const,
    outside: "null-with-sensitivity" as const,
  };
  assert.equal(partsSummary(inside), "inside");
  assert.equal(partsVerdict("inside"), "confirmed");
  assert.equal(partsSummary({ ...inside, outside: "attracted" }), "shared");
  assert.equal(partsVerdict("shared"), "refuted");
  assert.equal(partsSummary({ ...inside, outside: "repelled" }), "opposed");
  assert.equal(partsVerdict("opposed"), "refuted");
  assert.equal(
    partsSummary({ logit: "attracted", progress: "null-with-sensitivity", outside: "attracted" }),
    "outside",
  );
  assert.equal(partsSummary({ logit: "attracted", progress: "repelled", outside: "attracted" }), "outside");
  assert.equal(partsVerdict("outside"), "refuted");
  assert.equal(partsSummary({ ...inside, logit: "null-with-sensitivity" }), "unreproduced");
  assert.equal(partsSummary({ ...inside, logit: "inconclusive" }), "unreproduced");
  assert.equal(partsVerdict("unreproduced"), "inconclusive");
  assert.equal(partsSummary({ ...inside, outside: "inconclusive" }), "inconclusive");
  assert.equal(partsSummary({ logit: "attracted", progress: "inconclusive", outside: "null-with-sensitivity" }), "inconclusive");
  assert.equal(partsVerdict("inconclusive"), "inconclusive");
  assert.equal(partsSummary({ ...inside, progress: "repelled" }), "inconclusive");
});

test("seed 1 of the piece door is the published ceiling door", () => {
  const row = runPartsSample(0, 1);
  assert.equal(row.logit.rho, PUBLISHED_CEILING_SEED1_RHO);
  assert.equal(row.logit.random, 0);
  assert.equal(row.bonus.count, 0);
  assert.equal(Number.isFinite(row.raw), true);
  for (const signal of PHASE_EXPLORERS) {
    let sum = 0;
    for (const name of SCORE_PIECE_NAMES) sum += row.pieces[signal][name];
    assert.ok(Math.abs(sum - row.logit[signal]) <= 1e-6, `${signal} pieces do not match the logit`);
    assert.equal(row.pieces[signal].extra, 0);
    assert.ok(Math.abs(row.progress[signal] + row.outside[signal] - row.logit[signal]) <= 1e-6);
  }
  for (const signal of ["count", "surprise", "rnd"] as const) {
    assert.equal(row.pieces[signal].global, 0);
    assert.ok(Math.abs(row.pieces[signal].uncertainty - row.pieces.rho.uncertainty) <= 1e-6);
    assert.ok(Math.abs(row.pieces[signal].extrinsic - row.pieces.rho.extrinsic) <= 1e-6);
  }
  for (const name of SCORE_PIECE_NAMES) assert.equal(row.pieces.random[name], 0);
  assert.equal(Number.isFinite(row.progress.rho), true);
  assert.equal(Number.isFinite(row.outside.rho), true);
});
