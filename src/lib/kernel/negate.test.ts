import assert from "node:assert/strict";
import test from "node:test";
import { Kernel, flipOpenGlow, openGlowMask } from "./kernel.ts";
import { mulberry32 } from "./presets.ts";
import { negateSpec, runNegateEpisode } from "./negate-run.ts";
import { runCapacityEpisode } from "./capacity-run.ts";
import {
  erasureGap,
  gateNegate,
  manipulateVerdict,
  negateSummary,
  negateVerdict,
  periodLock,
  renewalVisible,
  selectNegate,
} from "./negate.ts";

function withSeed<T>(seed: number, fn: () => T): T {
  const prev = Math.random;
  Math.random = mulberry32(seed >>> 0);
  try {
    return fn();
  } finally {
    Math.random = prev;
  }
}

test("open-cell glow flips and true walls do not", () => {
  const cells = new Uint8Array(9);
  cells.fill(1);
  cells[4] = 0;
  const next = new Float32Array(27);
  next.fill(1);
  next[12] = 0;
  const mask = openGlowMask(cells, 1, 1, 3, 1);
  assert.equal(mask[0], 0);
  assert.equal(mask[12], 1);
  const flipped = flipOpenGlow(next, cells, 1, 1, 3, 1);
  assert.equal(flipped, 1);
  assert.equal(next[0], 1);
  assert.equal(next[12], 1);
});

test("negation flips glow targets and leaves the food channel", () => {
  const k = withSeed(4, () => new Kernel("distractor", 2, undefined, { env: negateSpec(), signal: "random", cellHidden: 4 }));
  const plain = k.measurePair(1, mulberry32(8), false);
  const flipped = k.measurePair(1, mulberry32(8), true);
  assert.deepEqual(Array.from(plain.obs), Array.from(flipped.obs));
  let wall = 0;
  let food = 0;
  for (let i = 0; i < plain.next.length; i += 3) {
    if (plain.next[i] !== flipped.next[i]) wall += 1;
    if (plain.next[i + 1] !== flipped.next[i + 1]) food += 1;
    if (plain.next[i + 2] !== flipped.next[i + 2]) food += 1;
  }
  assert.ok(wall > 0);
  assert.equal(food, 0);
  assert.equal(flipped.flipped, wall);
  assert.equal(erasureGap(1, 1), 0.5);
});

test("a width feeds a cycle only after store, erasure, ablation, renewal, dose, and a period", () => {
  const ready = {
    learns: "confirmed" as const,
    stores: "confirmed" as const,
    forgets: "confirmed" as const,
    pattern: "confirmed" as const,
    absent: "refuted" as const,
    renews: "confirmed" as const,
    visible: true,
    period: "ok" as const,
  };
  assert.deepEqual(gateNegate(ready), { score: 8, reason: "run" });
  assert.equal(gateNegate({ ...ready, stores: "refuted" }).reason, "no-store");
  assert.equal(gateNegate({ ...ready, forgets: "inconclusive" }).reason, "no-forgetting");
  assert.equal(gateNegate({ ...ready, pattern: "inconclusive" }).reason, "not-pattern");
  assert.equal(gateNegate({ ...ready, absent: "confirmed" }).reason, "no-ablation");
  assert.equal(gateNegate({ ...ready, absent: "inconclusive" }).reason, "no-ablation");
  assert.equal(gateNegate({ ...ready, renews: "refuted" }).reason, "no-renewal");
  assert.equal(gateNegate({ ...ready, visible: false }).reason, "below-dose");
  assert.equal(gateNegate({ ...ready, period: "censored" }).reason, "period-censored");
  assert.equal(renewalVisible({ lo: 0.01, hi: 0.02 }), true);
  assert.equal(renewalVisible({ lo: 0.001, hi: 0.008 }), false);
  assert.deepEqual(
    selectNegate([
      { hidden: 1, score: 8, reason: "run" },
      { hidden: 32, score: 8, reason: "run" },
    ]),
    { hidden: 32, reason: "run" },
  );
  assert.deepEqual(
    selectNegate([
      { hidden: 32, score: 2, reason: "no-forgetting" },
      { hidden: 1, score: 1, reason: "no-store" },
    ]),
    { hidden: null, reason: "no-forgetting" },
  );
});

test("manipulation is confirmed only when negation clears the bar and true targets do not", () => {
  const ok = {
    learns: "confirmed" as const,
    stores: "confirmed" as const,
    forgets: "confirmed" as const,
    pattern: "confirmed" as const,
    absent: "refuted" as const,
  };
  assert.equal(manipulateVerdict(ok), "confirmed");
  assert.equal(manipulateVerdict({ ...ok, forgets: "refuted" }), "refuted");
  assert.equal(manipulateVerdict({ ...ok, absent: "confirmed" }), "confounded");
  assert.equal(manipulateVerdict({ ...ok, stores: "inconclusive" }), "inconclusive");
  assert.equal(manipulateVerdict({ ...ok, absent: "inconclusive" }), "inconclusive");
  assert.equal(
    negateSummary({
      fed: true,
      instrument: "confirmed",
      random: "inconclusive",
      rho: "confirmed",
      others: ["inconclusive", "inconclusive", "inconclusive"],
    }),
    "confirmed",
  );
  assert.equal(negateVerdict("shared"), "refuted");
  assert.equal(negateVerdict("unfed"), "inconclusive");
  assert.equal(negateVerdict("confirmed"), "confirmed");
});

test("period lock uses the map-crossing rule", () => {
  const locked = periodLock(Array.from({ length: 200 }, () => 86), 200);
  assert.equal(locked.ok, true);
  assert.equal(locked.half, 86);
  assert.equal(locked.period, 172);
  assert.equal(locked.steps, 1600);
  assert.equal(periodLock(Array.from({ length: 200 }, () => null), 200).ok, false);
});

test("replay does not move the random walk or the surprise score, and it does move weights", () => {
  const path = (replay: boolean) =>
    withSeed(9, () => {
      const k = new Kernel("distractor", 3, undefined, {
        env: negateSpec(),
        signal: "random",
        ...(replay ? { negateReplay: true } : {}),
      });
      const bits: number[] = [];
      for (let t = 0; t < 40; t++) {
        bits.push(k.x, k.y, k.regionAt());
        k.step();
      }
      return { bits: bits.join(","), foods: k.foods, lives: k.lives, w: k.loop.net.w1[0] };
    });
  const off = path(false);
  const on = path(true);
  assert.equal(on.bits, off.bits);
  assert.equal(on.foods, 0);
  assert.equal(on.lives, 0);
  assert.notEqual(on.w, off.w);

  const scored = withSeed(9, () => {
    const k = new Kernel("distractor", 3, undefined, { env: negateSpec(), signal: "random" });
    k.step();
    const surprise = k.loop.surprise;
    const ema = k.loop.ema;
    const pair = k.measurePair(1, mulberry32(3), true);
    k.trainWeights(pair.obs, pair.action, pair.next, 4);
    return { surprise, ema, afterS: k.loop.surprise, afterE: k.loop.ema };
  });
  assert.equal(scored.afterS, scored.surprise);
  assert.equal(scored.afterE, scored.ema);

  const episode = (replay: number) =>
    runNegateEpisode({
      kind: "episode",
      id: replay,
      seed: 3,
      signal: "random",
      steps: 30,
      period: 10,
      hidden: 32,
      policyTemperature: 0.15,
      add: 0,
      replay,
      salt: 24031,
      tag: "check",
    });
  const capacity = runCapacityEpisode({
    kind: "episode",
    id: 1,
    seed: 3,
    signal: "random",
    steps: 30,
    period: 10,
    hidden: 32,
    policyTemperature: 0.15,
    add: 0,
    salt: 24031,
    tag: "check",
  });
  assert.equal(episode(0).checksum, capacity.checksum);
  assert.equal(episode(0).checksum, episode(1).checksum);
  assert.equal(episode(0).foods, 0);
  assert.equal(episode(0).lives, 0);
});
