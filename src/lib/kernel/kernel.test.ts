import assert from "node:assert/strict";
import { test } from "node:test";
import { MLP, mse } from "./mlp.ts";
import { Loop } from "./loop.ts";
import { Kernel } from "./kernel.ts";
import { StreamKernel, runStream } from "./stream.ts";
import { evaluateClaims } from "./experiments.ts";

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
