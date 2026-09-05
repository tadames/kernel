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
  // G2 fixture is the contract. Horizon 2 must not override true whiskers.
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
  // Fresh brain starts higher; load the trained one.
  assert.ok(b.loadBrain(brain), "load succeeds");
  assert.equal(b.loop.ema, brain.ema, "ema restored on load");
  assert.ok(b.loop.replay.length > 0, "replay restored on load");
  assert.ok(b.burnIn > 0, "re-burn-in armed after load");
  // Same weights → same forward residual on a held observation pattern.
  const predA = new Float32Array(a.loop.outDim);
  const predB = new Float32Array(b.loop.outDim);
  a.loop.imagine(a.loop.prevInput ?? new Float32Array(a.loop.inDim), predA);
  b.loop.imagine(a.loop.prevInput ?? new Float32Array(a.loop.inDim), predB);
  let maxDiff = 0;
  for (let i = 0; i < predA.length; i++) {
    maxDiff = Math.max(maxDiff, Math.abs(predA[i] - predB[i]));
  }
  assert.ok(maxDiff < 1e-5, `predictions diverge after load: maxDiff ${maxDiff}`);

  // Continuing from the loaded mind keeps ema low (does not forget).
  // burnIn is 36; step past it.
  for (let i = 0; i < 50; i++) b.step();
  assert.ok(b.burnIn === 0, "burn-in expires");
  assert.ok(
    b.loop.ema < lossBefore * 1.35 || b.loop.ema < 0.18,
    `loaded mind forgot: ema ${lossBefore.toFixed(4)} → ${b.loop.ema.toFixed(4)}`,
  );

  // Legacy weights-only snapshots still load.
  const weightsOnly = {
    w1: brain.w1,
    b1: brain.b1,
    w2: brain.w2,
    b2: brain.b2,
  };
  const c = new Kernel("field", 7);
  assert.ok(c.loadBrain(weightsOnly), "legacy weights-only load succeeds");

  // Dimension mismatch is rejected.
  const bad = { ...brain, w1: brain.w1.slice(0, 10) };
  assert.equal(b.loadBrain(bad), false);
});

test("re-burn-in absorbs Field→Rooms observation shift", () => {
  const field = new Kernel("field", 17);
  for (let i = 0; i < 100; i++) field.step();
  const brain = field.saveBrain();
  const trainedEma = field.loop.ema;

  const rooms = new Kernel("rooms", 3);
  assert.ok(rooms.loadBrain(brain), "cross-world load succeeds");
  assert.ok(rooms.burnIn > 0, "burn-in armed for shift");

  // Without burn-in the first steps on Rooms would leave ema high for longer.
  // With elevated lr + hotter policy, ema should settle within a modest window.
  // burnIn is 36; step past it.
  for (let i = 0; i < 55; i++) rooms.step();
  assert.equal(rooms.burnIn, 0, "burn-in finished");
  assert.ok(
    rooms.loop.ema < Math.max(trainedEma * 2.2, 0.22),
    `cross-world ema still high after burn-in: trained ${trainedEma.toFixed(4)} → ${rooms.loop.ema.toFixed(4)}`,
  );
});
