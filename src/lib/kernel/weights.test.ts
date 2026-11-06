import assert from "node:assert/strict";
import test from "node:test";
import { PUBLISHED_CEILING_SEED1_RHO, RATE_DELTA } from "./match.ts";
import { partsColumnIndex, partsPieceSalt } from "./parts.ts";
import { explorerIndex } from "./phase-diagram.ts";
import { emptyExploreParts, emptyScoreParts, imagineScores } from "./policy.ts";
import { assertWeightsRate, runWeightsSample } from "./weights-run.ts";
import {
  CEILING_RATE,
  PUBLISHED_UNCERTAINTY,
  WEIGHTS_COLOR_CLAMP,
  WEIGHTS_COLUMNS,
  weightsNoveltySalt,
  weightsResidualSalt,
  weightsSummary,
  weightsVerdict,
} from "./weights.ts";

test("the weight door is the published ceiling cell", () => {
  assert.equal(assertWeightsRate(), 0.94);
  assert.equal(CEILING_RATE, 0.94);
  assert.equal(RATE_DELTA, 0.05422156393527985);
  assert.equal(PUBLISHED_UNCERTAINTY, 0.025383679792284966);
  assert.equal(WEIGHTS_COLOR_CLAMP, 0.05);
  assert.deepEqual(WEIGHTS_COLUMNS, ["residual", "novelty"]);
  assert.equal(weightsResidualSalt(4), 46004);
  assert.equal(weightsNoveltySalt(explorerIndex("rho")), 46104);
  assert.equal(weightsResidualSalt(1), 46001);
  assert.equal(partsPieceSalt(explorerIndex("rho"), partsColumnIndex("uncertainty")), 45042);
});

test("the headline is the residual weight, and a signed novelty weight refutes it", () => {
  const residual = {
    logit: "attracted" as const,
    uncertainty: "attracted" as const,
    residual: "attracted" as const,
    novelty: "null-with-sensitivity" as const,
  };
  assert.equal(weightsSummary(residual), "residual");
  assert.equal(weightsVerdict("residual"), "confirmed");
  assert.equal(weightsSummary({ ...residual, novelty: "attracted" }), "shared");
  assert.equal(weightsVerdict("shared"), "refuted");
  assert.equal(weightsSummary({ ...residual, novelty: "repelled" }), "opposed");
  assert.equal(weightsVerdict("opposed"), "refuted");
  assert.equal(
    weightsSummary({ ...residual, residual: "null-with-sensitivity", novelty: "attracted" }),
    "novelty",
  );
  assert.equal(weightsVerdict("novelty"), "refuted");
  assert.equal(weightsSummary({ ...residual, residual: "repelled", novelty: "attracted" }), "counter");
  assert.equal(weightsVerdict("counter"), "refuted");
  assert.equal(weightsSummary({ ...residual, logit: "null-with-sensitivity" }), "unreproduced");
  assert.equal(weightsSummary({ ...residual, uncertainty: "repelled" }), "unreproduced");
  assert.equal(weightsVerdict("unreproduced"), "inconclusive");
  assert.equal(weightsSummary({ ...residual, novelty: "inconclusive" }), "inconclusive");
  assert.equal(weightsVerdict("inconclusive"), "inconclusive");
});

test("the explore split sums to the uncertainty term and does not change the score", () => {
  const predict = (a: number, into: Float32Array) => {
    into[0] = a === 0 ? 0.5 : 0.2;
    into[1] = a === 0 ? 0.5 : 0.8;
    return into;
  };
  const read = (a: number) => ({ reward: 0.2, cost: 0.1, novelty: a === 0 ? 0.4 : 0.1 });
  const shared = {
    acts: 2,
    curiosity: 1,
    goal: 1,
    progressEma: 0.02,
    ema: 0.05,
    horizonRho: true,
    predict,
    predictFrom: (_pred: Float32Array, a1: number, into: Float32Array) => {
      into[0] = a1 === 0 ? 0.9 : 0.4;
      into[1] = a1 === 0 ? 0.1 : 0.6;
      return into;
    },
    read: (_pred: Float32Array, a: number) => read(a),
    readPred: () => ({ reward: 0, cost: 0, novelty: 0.2 }),
    progressBonus: (a: number) => (a === 0 ? 0.03 : 0),
  };
  const plain = new Float32Array(2);
  imagineScores({
    ...shared,
    imagined: [new Float32Array(2), new Float32Array(2)],
    imagined2: [new Float32Array(2), new Float32Array(2)],
    scores: plain,
  });
  const scores = new Float32Array(2);
  const parts = emptyScoreParts(2);
  const explore = emptyExploreParts(2);
  imagineScores({
    ...shared,
    imagined: [new Float32Array(2), new Float32Array(2)],
    imagined2: [new Float32Array(2), new Float32Array(2)],
    scores,
    parts,
    explore,
  });
  assert.equal(scores[0], plain[0]);
  assert.equal(scores[1], plain[1]);
  for (let a = 0; a < 2; a++) {
    const sum = explore.residual[a]! + explore.novelty[a]!;
    assert.ok(Math.abs(sum - parts.uncertainty[a]!) < 1e-6, `action ${a} split ${sum} uncertainty ${parts.uncertainty[a]}`);
    assert.ok(explore.residual[a]! > 0, "a nonzero prediction still carries a residual weight");
    assert.ok(explore.novelty[a]! > 0, "a nonzero visit-scent still carries a novelty weight");
  }
  assert.notEqual(explore.residual[0], explore.residual[1]);
});

test("seed 1 of the weight door is the published ceiling door", () => {
  const row = runWeightsSample(0, 1);
  assert.equal(row.logit.rho, PUBLISHED_CEILING_SEED1_RHO);
  assert.equal(row.logit.random, 0);
  assert.equal(row.bonus.count, 0);
  assert.equal(Number.isFinite(row.raw), true);
  assert.ok(Math.abs(row.residual + row.novelty - row.uncertainty) <= 1e-6);
  assert.equal(Number.isFinite(row.residual), true);
  assert.equal(Number.isFinite(row.novelty), true);
});
