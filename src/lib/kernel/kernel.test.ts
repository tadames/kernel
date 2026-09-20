import assert from "node:assert/strict";
import { test } from "node:test";
import { MLP, mse } from "./mlp.ts";
import { Loop } from "./loop.ts";
import { Kernel } from "./kernel.ts";
import { StreamKernel, runStream } from "./stream.ts";
import { evaluateClaims } from "./experiments.ts";
import { expectedResidual } from "./policy.ts";
import { branching, edgeIndex, entropyNorm, participation } from "./complexity.ts";

test("MLP compresses a repeating map: loss falls", () => {
  const net = new MLP(8, 16, 8);
  const x = new Float32Array(8);
  const y = new Float32Array(8);
  for (let i = 0; i < 8; i++) {
    x[i] = i % 2;
    y[i] = 1 - x[i];
  }
  const before = mse(net.forward(x, new Float32Array(8)), y);
  for (let i = 0; i < 400; i++) net.train(x, y, 0.08);
  const after = mse(net.forward(x, new Float32Array(8)), y);
  assert.ok(after < before * 0.4, `loss ${before.toFixed(4)} → ${after.toFixed(4)}`);
  assert.ok(after < 0.05, `final loss still high: ${after.toFixed(4)}`);
});

test("Loop surprise is measured before the update", () => {
  const loop = new Loop(4, 8, 4);
  const a = new Float32Array([1, 0, 0, 0]);
  const b = new Float32Array([0, 1, 0, 0]);
  loop.commit(a);
  loop.assimilate(b, 0.1);
  assert.ok(loop.surprise > 0.05, "first prediction of an unseen target should be wrong");
});

test("Kernel surprise falls while living in Field", () => {
  const k = new Kernel("field", 7);
  for (let i = 0; i < 40; i++) k.step();
  const early = k.ema;
  for (let i = 0; i < 220; i++) k.step();
  assert.equal(k.age, 260);
  assert.ok(
    k.ema < early * 0.85 || k.ema < 0.14,
    `ema surprise did not fall: ${early.toFixed(4)} → ${k.ema.toFixed(4)}`,
  );
});

test("Stream: structure compresses, noise does not", () => {
  const s = runStream("structured", 3, 220);
  const n = runStream("noise", 3, 220);
  assert.ok(s.late < 0.05, `structured late ${s.late.toFixed(3)}`);
  assert.ok(n.late > 0.15, `noise late ${n.late.toFixed(3)}`);
  assert.ok(s.late < n.late * 0.35, `structured ${s.late.toFixed(3)} vs noise ${n.late.toFixed(3)}`);
});

test("Both testbeds share the Loop object", () => {
  const k = new Kernel("blank", 1);
  const t = new StreamKernel("structured", 1);
  assert.equal(k.loop.inDim, 81);
  assert.equal(t.loop.inDim, 9);
  assert.equal(typeof k.loop.assimilate, "function");
  assert.equal(typeof t.loop.assimilate, "function");
});

test("Falsifiable claims: evaluateClaims", () => {
  const claims = evaluateClaims();
  const failed = claims.filter((c) => !c.pass);
  assert.ok(
    failed.length === 0,
    failed.map((c) => `${c.id} ${c.detail}`).join("; "),
  );
});

test("Policy horizon 2: adjacent food still taken", () => {
  const claims = evaluateClaims();
  const g2 = claims.find((c) => c.id === "G2");
  assert.ok(g2 && g2.pass, g2?.detail ?? "G2 missing");
});

test("expectedResidual peaks near 0.5 and falls at extremes", () => {
  const mid = new Float32Array(8).fill(0.5);
  const sure = new Float32Array(8);
  for (let i = 0; i < 8; i++) sure[i] = i % 2;
  const rMid = expectedResidual(mid);
  const rSure = expectedResidual(sure);
  assert.ok(rMid > rSure, `mid ${rMid.toFixed(3)} vs sure ${rSure.toFixed(3)}`);
  assert.ok(rMid > 0.2, `mid residual too low: ${rMid}`);
});

test("entropyNorm is ~1 on ties and falls when one logit wins", () => {
  const ties = new Float32Array([1, 1, 1, 1, 1]);
  const peak = new Float32Array([5, 0, 0, 0, 0]);
  assert.ok(Math.abs(entropyNorm(ties, 1) - 1) < 0.05);
  assert.ok(entropyNorm(peak, 0.3) < 0.55);
});

test("participation is 1 for a one-hot hidden and n for a flat one", () => {
  const one = new Float32Array(16);
  one[3] = 1;
  const flat = new Float32Array(16).fill(1 / 16);
  assert.ok(Math.abs(participation(one) - 1) < 0.05);
  assert.ok(participation(flat) > 12);
});

test("saveBrain / loadBrain round-trips and preserves compression", () => {
  const a = new Kernel("field", 11);
  for (let i = 0; i < 80; i++) a.step();
  const brain = a.saveBrain();
  assert.ok(brain.ema !== undefined && brain.replay && brain.replay.length > 0, "brain carries compact replay");
  const lossBefore = a.loop.ema;

  const b = new Kernel("field", 99);
  assert.ok(b.loadBrain(brain), "load succeeds");
  assert.equal(b.loop.ema, brain.ema, "ema restored on load");
  assert.ok(b.loop.replay.length > 0, "replay restored on load");
  assert.ok(b.burnIn > 0, "re-burn-in armed after load");
  const predA = new Float32Array(a.loop.outDim);
  const predB = new Float32Array(b.loop.outDim);
  a.loop.imagine(a.loop.prevInput ?? new Float32Array(a.loop.inDim), predA);
  b.loop.imagine(a.loop.prevInput ?? new Float32Array(a.loop.inDim), predB);
  let maxDiff = 0;
  for (let i = 0; i < predA.length; i++) {
    maxDiff = Math.max(maxDiff, Math.abs(predA[i] - predB[i]));
  }
  assert.ok(maxDiff < 1e-5, `predictions diverge after load: maxDiff ${maxDiff}`);

  for (let i = 0; i < 50; i++) b.step();
  assert.ok(b.burnIn === 0, "burn-in expires");
  assert.ok(
    b.loop.ema < lossBefore * 1.35 || b.loop.ema < 0.18,
    `loaded mind forgot: ema ${lossBefore.toFixed(4)} → ${b.loop.ema.toFixed(4)}`,
  );

  const weightsOnly = {
    w1: brain.w1,
    b1: brain.b1,
    w2: brain.w2,
    b2: brain.b2,
  };
  const c = new Kernel("field", 7);
  assert.ok(c.loadBrain(weightsOnly), "legacy weights-only load succeeds");

  const bad = { ...brain, w1: brain.w1.slice(0, 10) };
  assert.equal(b.loadBrain(bad), false);
});

test("latent residual skip tracks observation mean", () => {
  const loop = new Loop(4, 8, 4);
  assert.equal(loop.residual, true);
  const low = new Float32Array([0.1, 0.1, 0.1, 0.1]);
  const high = new Float32Array([0.9, 0.9, 0.9, 0.9]);
  loop.commit(low);
  for (let i = 0; i < 80; i++) {
    loop.assimilate(low, 0.08);
    loop.commit(low);
  }
  const meanLow = loop.baseline.reduce((s, v) => s + v, 0) / 4;
  assert.ok(meanLow < 0.35, `baseline did not follow low mean: ${meanLow.toFixed(3)}`);

  loop.baselineRate = 0.12;
  for (let i = 0; i < 40; i++) {
    loop.assimilate(high, 0.08);
    loop.commit(high);
  }
  const meanHigh = loop.baseline.reduce((s, v) => s + v, 0) / 4;
  assert.ok(meanHigh > 0.55, `baseline did not follow high mean: ${meanHigh.toFixed(3)}`);

  const brain = loop.exportBrain();
  assert.equal(brain.residual, true);
  assert.ok(brain.baseline && brain.baseline.length === 4);
  assert.ok(brain.residualEma && brain.residualEma.length === 4);

  const fresh = new Loop(4, 8, 4);
  assert.ok(fresh.importBrain(brain));
  assert.equal(fresh.residual, true);
  assert.ok(Math.abs(fresh.baseline[0] - loop.baseline[0]) < 1e-6);

  const legacy = { w1: brain.w1, b1: brain.b1, w2: brain.w2, b2: brain.b2 };
  const old = new Loop(4, 8, 4);
  assert.ok(old.importBrain(legacy));
  assert.equal(old.residual, false);
});

test("re-burn-in absorbs Field\u2192Rooms observation shift", () => {
  const field = new Kernel("field", 17);
  for (let i = 0; i < 100; i++) field.step();
  const brain = field.saveBrain();
  const trainedEma = field.loop.ema;

  const rooms = new Kernel("rooms", 3);
  assert.ok(rooms.loadBrain(brain), "cross-world load succeeds");
  assert.ok(rooms.burnIn > 0, "burn-in armed for shift");

  for (let i = 0; i < 55; i++) rooms.step();
  assert.equal(rooms.burnIn, 0, "burn-in finished");
  assert.ok(
    rooms.loop.ema < Math.max(trainedEma * 2.2, 0.22),
    `cross-world ema still high after burn-in: trained ${trainedEma.toFixed(4)} → ${rooms.loop.ema.toFixed(4)}`,
  );
});

test("incompressible channels are downweighted in surprise", () => {
  const loop = new Loop(4, 12, 4);
  for (let t = 0; t < 220; t++) {
    const x = new Float32Array(4);
    x[0] = t % 2;
    x[1] = 1 - (t % 2);
    x[2] = Math.random();
    x[3] = Math.random();
    loop.assimilate(x, 0.08);
    loop.commit(x);
  }
  const struct = (loop.residualEma[0] + loop.residualEma[1]) / 2;
  const noise = (loop.residualEma[2] + loop.residualEma[3]) / 2;
  assert.ok(noise > struct * 1.6, `noise residual ${noise.toFixed(4)} vs structure ${struct.toFixed(4)}`);
  assert.ok(
    loop.surprise <= loop.surpriseRaw + 0.005 || loop.surprise < 0.03,
    `weighted surprise ${loop.surprise.toFixed(4)} vs raw mse ${loop.surpriseRaw.toFixed(4)}`,
  );

  const brain = loop.exportBrain();
  const copy = new Loop(4, 12, 4);
  assert.ok(copy.importBrain(brain));
  assert.ok(Math.abs(copy.residualEma[2] - loop.residualEma[2]) < 1e-6);
});

test("family-pooled residual downweights the noisy channel family", () => {
  const loop = new Loop(6, 16, 6);
  assert.equal(loop.familyCount, 3);
  for (let t = 0; t < 260; t++) {
    const x = new Float32Array(6);
    const bit = t % 2;
    x[0] = bit;
    x[1] = 1 - bit;
    x[2] = Math.random();
    x[3] = bit;
    x[4] = 1 - bit;
    x[5] = Math.random();
    loop.assimilate(x, 0.08);
    loop.commit(x);
  }
  const wall = loop.familyResidual[0];
  const food = loop.familyResidual[1];
  const scent = loop.familyResidual[2];
  assert.ok(
    scent > wall * 1.5 && scent > food * 1.5,
    `scent family ${scent.toFixed(4)} should exceed wall ${wall.toFixed(4)} and food ${food.toFixed(4)}`,
  );
  assert.ok(
    loop.surprise < loop.surpriseRaw,
    `family-weighted surprise ${loop.surprise.toFixed(4)} should undercut raw ${loop.surpriseRaw.toFixed(4)}`,
  );

  const brain = loop.exportBrain();
  assert.ok(brain.familyResidual && brain.familyResidual.length === 3);
  const copy = new Loop(6, 16, 6);
  assert.ok(copy.importBrain(brain));
  assert.ok(Math.abs(copy.familyResidual[2] - loop.familyResidual[2]) < 1e-6);
});

test("high-residual family is muted in imagination input and residual scoring", () => {
  const loop = new Loop(6, 16, 6);
  for (let t = 0; t < 260; t++) {
    const x = new Float32Array(6);
    const bit = t % 2;
    x[0] = bit;
    x[1] = 1 - bit;
    x[2] = Math.random();
    x[3] = bit;
    x[4] = 1 - bit;
    x[5] = Math.random();
    loop.assimilate(x, 0.08);
    loop.commit(x);
  }
  const wWall = loop.familyWeight(0);
  const wScent = loop.familyWeight(2);
  assert.ok(wScent < wWall * 0.7, `scent gate ${wScent.toFixed(3)} should be below wall ${wWall.toFixed(3)}`);

  const obs = new Float32Array([1, 1, 1, 1, 1, 1]);
  const muted = loop.muteFamilies(obs);
  assert.ok(muted[2] < muted[0] * 0.7, `muted scent ${muted[2].toFixed(3)} vs wall ${muted[0].toFixed(3)}`);
  assert.equal(obs[2], 1, "muteFamilies must not rewrite the live observation");

  const mixed = new Float32Array([0.05, 0.05, 0.5, 0.05, 0.05, 0.5]);
  const raw = expectedResidual(mixed);
  const gated = expectedResidual(mixed, (i) => loop.familyWeight(i % 3));
  assert.ok(gated < raw, `gated residual ${gated.toFixed(3)} should undercut raw ${raw.toFixed(3)}`);
});

test("scent is a side channel: plan head ignores it in surprise and mute", () => {
  const loop = new Loop(6, 16, 6);
  assert.equal(loop.familyCount, 3);
  assert.equal(loop.plansFamily(0), true);
  assert.equal(loop.plansFamily(1), true);
  assert.equal(loop.plansFamily(2), false);
  assert.equal(loop.familyWeight(2), 0);

  const structured = new Float32Array([1, 0, 0, 1, 0, 0]);
  loop.commit(structured);
  for (let t = 0; t < 80; t++) {
    loop.assimilate(structured, 0.08);
    loop.commit(structured);
  }
  const planSurprise = loop.surprise;

  const flicker = structured.slice();
  flicker[2] = 1;
  flicker[5] = 1;
  loop.assimilate(flicker, 0.08);
  assert.ok(
    Math.abs(loop.surprise - planSurprise) < 0.02,
    `scent flicker moved plan surprise ${planSurprise.toFixed(4)} → ${loop.surprise.toFixed(4)}`,
  );

  const muted = loop.muteFamilies(new Float32Array([1, 1, 1, 1, 1, 1]));
  assert.equal(muted[2], 0);
  assert.equal(muted[5], 0);
  assert.ok(muted[0] > 0.5 && muted[1] > 0.5);

  const stream = new Loop(4, 8, 4);
  assert.equal(stream.familyCount, 1);
  assert.equal(stream.plansFamily(0), true);
  assert.ok(stream.familyWeight(0) > 0);
});

test("plan head is smaller than the window: scent reconstruction is the baseline prior", () => {
  const loop = new Loop(6, 16, 6);
  assert.equal(loop.familyCount, 3);
  assert.equal(loop.planDim, 4);
  assert.equal(loop.model.out, 4);
  assert.equal(loop.outDim, 6);

  const structured = new Float32Array([1, 0, 0.2, 1, 0, 0.2]);
  loop.commit(structured);
  for (let t = 0; t < 90; t++) {
    loop.assimilate(structured, 0.08);
    loop.commit(structured);
  }
  const pred = loop.imagine(loop.prevInput ?? structured, new Float32Array(6));
  const scentFromPrior = (i: number) =>
    Math.max(0, Math.min(1, loop.scentPred + loop.baseline[i] - 0.5));
  assert.ok(Math.abs(pred[2] - scentFromPrior(2)) < 1e-6, `scent pred ${pred[2]} vs prior ${scentFromPrior(2)}`);
  assert.ok(Math.abs(pred[5] - scentFromPrior(5)) < 1e-6);
  assert.ok(pred[0] > 0.6, `wall should be learned, got ${pred[0]}`);

  const brain = loop.exportBrain();
  assert.equal(brain.planDim, 4);
  assert.equal(brain.w2.length, 4 * 16);
  assert.ok(brain.replay && brain.replay.every((s) => s.y.length === 4));

  const stream = new Loop(4, 8, 4);
  assert.equal(stream.planDim, 4);
  assert.equal(stream.model.out, 4);
});

test("shared scent head trains only when family-2 residual falls", () => {
  const structured = new Loop(6, 16, 6);
  for (let t = 0; t < 280; t++) {
    const bit = t % 2;
    const x = new Float32Array([bit, 1 - bit, bit, bit, 1 - bit, bit]);
    structured.assimilate(x, 0.08);
    structured.commit(x);
  }
  assert.ok(structured.scentTrains >= 96, `structured scent never finished its probe: trains ${structured.scentTrains}`);
  const bit = 0;
  const cur = new Float32Array([bit, 1 - bit, bit, bit, 1 - bit, bit]);
  const pred = structured.imagine(cur, new Float32Array(6));
  const meanPrior = structured.baseline[2];
  assert.ok(
    Math.abs(pred[2] - 1) < Math.abs(meanPrior - 1) + 0.05 || Math.abs(pred[2] - 1) < 0.4,
    `shared head should not be worse than the lagging mean on the next scent bit: pred ${pred[2].toFixed(3)} baseline ${meanPrior.toFixed(3)}`,
  );

  const noise = new Loop(6, 16, 6);
  for (let t = 0; t < 280; t++) {
    const bit = t % 2;
    const x = new Float32Array([bit, 1 - bit, Math.random(), bit, 1 - bit, Math.random()]);
    noise.assimilate(x, 0.08);
    noise.commit(x);
  }
  assert.ok(
    noise.scentTrains <= 110,
    `noise scent head kept writing after the probe: trains ${noise.scentTrains}`,
  );
});
