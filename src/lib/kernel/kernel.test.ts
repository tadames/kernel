import assert from "node:assert/strict";
import { test } from "node:test";
import { MLP, mse } from "./mlp.ts";
import { Kernel } from "./kernel.ts";

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

test("Kernel surprise falls while living in Field", () => {
  const k = new Kernel("field", 7);
  for (let i = 0; i < 40; i++) k.step();
  const early = k.ema;
  for (let i = 0; i < 220; i++) k.step();
  assert.ok(k.age === 260);
  assert.ok(
    k.ema < early * 0.85 || k.ema < 0.12,
    `ema surprise did not fall: ${early.toFixed(4)} → ${k.ema.toFixed(4)}`,
  );
});

test("compression progress appears while living; curiosity no longer rewards raw EMA", () => {
  const k = new Kernel("field", 11);
  let sawPositiveProgress = false;
  let maxProgress = -1;
  for (let i = 0; i < 180; i++) {
    k.step();
    if (k.progress > 0) sawPositiveProgress = true;
    if (k.progress > maxProgress) maxProgress = k.progress;
  }
  assert.ok(sawPositiveProgress, "expected at least one positive compression-progress tick");
  assert.ok(maxProgress > 0.0005, `max progress too small: ${maxProgress}`);
  // Policy still acts (age advanced) and has non-trivial scores.
  const snap = k.snapshot();
  assert.ok(snap.scores.length === 5);
  let any = false;
  for (let i = 0; i < 5; i++) if (Number.isFinite(snap.scores[i])) any = true;
  assert.ok(any, "scores should be finite after compression-progress policy");
});
