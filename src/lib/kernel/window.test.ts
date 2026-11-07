import assert from "node:assert/strict";
import test from "node:test";
import { PUBLISHED_CEILING_RAW, PUBLISHED_CEILING_SEED1_RHO } from "./match.ts";
import { partsColumnIndex, partsPieceSalt } from "./parts.ts";
import { explorerIndex } from "./phase-diagram.ts";
import { assertWindowRate, runWindowSample } from "./window-run.ts";
import { PUBLISHED_UNCERTAINTY } from "./weights.ts";
import {
  CEILING_RATE,
  RATE_DELTA,
  WINDOW_COLOR_CLAMP,
  WINDOW_COLUMNS,
  WINDOW_IMPLIED_GAP,
  WINDOW_IMPLIED_RESIDUAL,
  windowAlignSalt,
  windowGapSalt,
  windowResidualGain,
  windowResidualSalt,
  windowSummary,
  windowVerdict,
} from "./window.ts";

test("the window door is the published ceiling cell", () => {
  assert.equal(assertWindowRate(), 0.94);
  assert.equal(CEILING_RATE, 0.94);
  assert.equal(RATE_DELTA, 0.05422156393527985);
  assert.equal(WINDOW_COLOR_CLAMP, 0.2);
  assert.deepEqual(WINDOW_COLUMNS, ["residual", "squared", "gap"]);
  assert.equal(windowResidualSalt(), 47000);
  assert.equal(windowGapSalt(), 47100);
  assert.equal(windowAlignSalt(), 47200);
  assert.equal(windowResidualGain(1), (0.75 * 0.35 + 0.2) * 0.7);
  assert.ok(Math.abs(WINDOW_IMPLIED_RESIDUAL - PUBLISHED_UNCERTAINTY / windowResidualGain()) < 1e-15);
  assert.ok(Math.abs(WINDOW_IMPLIED_GAP - (PUBLISHED_CEILING_RAW + WINDOW_IMPLIED_RESIDUAL / 4)) < 1e-15);
  assert.equal(partsPieceSalt(explorerIndex("rho"), partsColumnIndex("uncertainty")), 45042);
});

test("the headline is alignment, and a complement or an anti-aligned window refutes it", () => {
  const aligned = {
    logit: "attracted" as const,
    squared: "repelled" as const,
    uncertainty: "attracted" as const,
    matched: true,
    gap: "repelled" as const,
  };
  assert.equal(windowSummary(aligned), "aligned");
  assert.equal(windowVerdict("aligned"), "confirmed");
  assert.equal(windowSummary({ ...aligned, gap: "null-with-sensitivity" }), "identity");
  assert.equal(windowVerdict("identity"), "refuted");
  assert.equal(windowSummary({ ...aligned, gap: "attracted" }), "anti");
  assert.equal(windowVerdict("anti"), "refuted");
  assert.equal(windowSummary({ ...aligned, matched: false }), "mismatch");
  assert.equal(windowVerdict("mismatch"), "inconclusive");
  assert.equal(windowSummary({ ...aligned, logit: "null-with-sensitivity" }), "unreproduced");
  assert.equal(windowSummary({ ...aligned, squared: "attracted" }), "unreproduced");
  assert.equal(windowSummary({ ...aligned, uncertainty: "repelled" }), "unreproduced");
  assert.equal(windowVerdict("unreproduced"), "inconclusive");
  assert.equal(windowSummary({ ...aligned, gap: "inconclusive" }), "inconclusive");
  assert.equal(windowVerdict("inconclusive"), "inconclusive");
});

test("a binary window's squared error is the complement plus alignment", () => {
  const p = 0.8;
  const y = 1;
  const residual = 4 * p * (1 - p);
  const squared = (p - y) * (p - y);
  const align = (p - 0.5) * (y - 0.5);
  assert.ok(Math.abs(squared - (0.5 - residual / 4 - 2 * align)) < 1e-12);
  const weight = 0.75 * (0.7 * residual) * 0.35 + 0.2 * (0.7 * residual);
  assert.ok(Math.abs(windowResidualGain(1) * residual - weight) < 1e-12);
});

test("seed 1 of the window door is the published ceiling door", () => {
  const row = runWindowSample(0, 1);
  assert.equal(row.logit.rho, PUBLISHED_CEILING_SEED1_RHO);
  assert.equal(row.logit.random, 0);
  assert.equal(row.bonus.count, 0);
  assert.equal(row.matched, true);
  assert.ok(Math.abs(row.squared - row.raw) <= 1e-9);
  assert.ok(Math.abs(row.uncertainty - windowResidualGain(1) * row.residual) <= 1e-6);
  assert.ok(Math.abs(row.gap + 2 * row.align) <= 1e-6);
  assert.equal(Number.isFinite(row.gap), true);
});
