import assert from "node:assert/strict";
import { test } from "node:test";
import { Loop } from "./loop.ts";
import "./scent-rho-hat.ts";

test("scent novelty opens only when family-2 residual is compressible", () => {
  const structured = new Loop(6, 16, 6);
  for (let t = 0; t < 280; t++) {
    const bit = t % 2;
    const x = new Float32Array([bit, 1 - bit, bit, bit, 1 - bit, 1 - bit]);
    structured.assimilate(x, 0.08);
    structured.commit(x);
  }
  assert.ok(structured.familyResidual[2] < 0.05, `structured scent residual ${structured.familyResidual[2]}`);
  const open0 = structured.scentNovelty(0);
  const open1 = structured.scentNovelty(1);
  assert.ok(open0 > 0.15, `compressible cell-0 novelty shut: ${open0.toFixed(3)}`);
  assert.ok(open1 > 0.15, `compressible cell-1 novelty shut: ${open1.toFixed(3)}`);
  assert.equal(structured.familyWeight(2), 0, "plan family-2 stays muted");

  const noise = new Loop(6, 16, 6);
  for (let t = 0; t < 280; t++) {
    const bit = t % 2;
    const x = new Float32Array([bit, 1 - bit, Math.random(), bit, 1 - bit, Math.random()]);
    noise.assimilate(x, 0.08);
    noise.commit(x);
  }
  assert.ok(noise.scentTrains >= 96, `noise probe incomplete: ${noise.scentTrains}`);
  assert.ok(noise.familyResidual[2] >= 0.05, `noise residual fell: ${noise.familyResidual[2]}`);
  assert.equal(noise.scentNovelty(0), 0);
  assert.equal(noise.scentNovelty(1), 0);
});

test("scent ρ̂ is the side-head predicted residual drop and stays shut on noise", () => {
  const structured = new Loop(6, 16, 6);
  for (let t = 0; t < 280; t++) {
    const bit = t % 2;
    const x = new Float32Array([bit, 1 - bit, bit, bit, 1 - bit, 1 - bit]);
    structured.assimilate(x, 0.08);
    structured.commit(x);
  }
  structured.scentPred[0] = 0.5;
  structured.scentPred[1] = 0.92;
  structured.residualEma[2] = 0.08;
  structured.residualEma[5] = 0.08;
  const drop = structured.scentRhoHat(0, 1);
  const expect = 0.5 * 0.5 - 0.92 * 0.08;
  assert.ok(Math.abs(drop - expect) < 1e-6, `structured scent ρ̂ ${drop} ≠ head drop ${expect}`);
  assert.ok(drop > 0.15, `structured scent ρ̂ too small: ${drop}`);
  assert.equal(structured.scentRhoHat(1, 0), 0, "negative drop must not pay");
  assert.equal(structured.familyWeight(2), 0, "plan family-2 stays muted");

  const noise = new Loop(6, 16, 6);
  for (let t = 0; t < 280; t++) {
    const bit = t % 2;
    const x = new Float32Array([bit, 1 - bit, Math.random(), bit, 1 - bit, Math.random()]);
    noise.assimilate(x, 0.08);
    noise.commit(x);
  }
  noise.scentPred[0] = 0.5;
  noise.scentPred[1] = 0.99;
  assert.equal(noise.scentRhoHat(0, 1), 0, "incompressible scent must not fund ρ̂");
});
