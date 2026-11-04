import assert from "node:assert/strict";
import test from "node:test";
import { phaseContrast } from "./period.ts";
import { fundamental } from "./phase.ts";
import { Kernel } from "./kernel.ts";
import { mulberry32 } from "./presets.ts";
import { capacitySpec, runCapacityEpisode } from "./capacity-run.ts";
import {
  SHIPPED_HIDDEN,
  amplitudeOf,
  capacityInstrument,
  capacitySummary,
  capacityVerdict,
  erasureGap,
  gapVisible,
  gateWidth,
  periodLock,
  selectWidth,
} from "./capacity.ts";

function withSeed<T>(seed: number, fn: () => T): T {
  const prev = Math.random;
  Math.random = mulberry32(seed >>> 0);
  try {
    return fn();
  } finally {
    Math.random = prev;
  }
}

test("fourier amplitude is unchanged when the square wave flips phase", () => {
  const period = 40;
  const n = period * 8;
  const aligned: number[] = [];
  const flipped: number[] = [];
  for (let t = 0; t < n; t++) {
    const on = Math.floor(t / (period / 2)) % 2 === 0;
    aligned.push(on ? 1 : 0);
    flipped.push(on ? 0 : 1);
  }
  const a = fundamental(aligned, period);
  const b = fundamental(flipped, period);
  assert.ok(Math.abs(amplitudeOf(a.c, a.s) - amplitudeOf(b.c, b.s)) < 1e-12);
  assert.ok(amplitudeOf(a.c, a.s) > 0.2);
  assert.equal(phaseContrast(aligned, period), 1);
  assert.equal(phaseContrast(flipped, period), -1);
  assert.equal(amplitudeOf(0, 0), 0);
});

test("a width feeds a cycle only after erasure, renewal, capacity, dose, and a period", () => {
  const ready = {
    learns: "confirmed" as const,
    forgets: "confirmed" as const,
    renews: "confirmed" as const,
    exceeds: "confirmed" as const,
    visible: true,
    period: "ok" as const,
  };
  assert.deepEqual(gateWidth(ready), { score: 6, reason: "run" });
  assert.equal(gateWidth({ ...ready, learns: "inconclusive" }).reason, "no-learning");
  assert.equal(gateWidth({ ...ready, forgets: "inconclusive" }).reason, "no-forgetting");
  assert.equal(gateWidth({ ...ready, renews: "refuted" }).reason, "no-renewal");
  assert.equal(gateWidth({ ...ready, exceeds: "inconclusive" }).reason, "not-capacity");
  assert.equal(gateWidth({ ...ready, visible: false }).reason, "below-dose");
  assert.equal(gateWidth({ ...ready, period: "censored" }).reason, "period-censored");
  assert.equal(erasureGap(0.1, 0.16), 0.1 - 0.08);
  assert.equal(gapVisible({ lo: 0.001, hi: 0.0084 }), false);
  assert.equal(gapVisible({ lo: 0.001, hi: 0.009 }), true);
});

test("the widest feeding width is kept, and a tied failure stays unfed", () => {
  const picked = selectWidth([
    { hidden: 16, score: 2, reason: "no-renewal" },
    { hidden: 4, score: 6, reason: "run" },
    { hidden: 2, score: 6, reason: "run" },
  ]);
  assert.deepEqual(picked, { hidden: 4, reason: "run" });
  const unfed = selectWidth([
    { hidden: 16, score: 1, reason: "no-forgetting" },
    { hidden: 8, score: 2, reason: "no-renewal" },
    { hidden: 2, score: 2, reason: "no-renewal" },
  ]);
  assert.deepEqual(unfed, { hidden: null, reason: "no-renewal" });
  assert.deepEqual(selectWidth([]), { hidden: null, reason: "no-learning" });
});

test("period lock uses the map-crossing rule", () => {
  const halves = Array.from({ length: 200 }, () => 86);
  const locked = periodLock(halves, 200);
  assert.equal(locked.ok, true);
  assert.equal(locked.half, 86);
  assert.equal(locked.period, 172);
  assert.equal(locked.steps, 1600);
  assert.equal(periodLock(Array.from({ length: 200 }, () => 10), 200).ok, false);
  assert.equal(periodLock(Array.from({ length: 200 }, () => null), 200).ok, false);
});

test("the instrument gate is the 0.05 dose, and only a specific rho cycle confirms", () => {
  assert.equal(capacityInstrument("confirmed"), "confirmed");
  assert.equal(capacityInstrument("inconclusive"), "inconclusive");
  assert.equal(
    capacitySummary({
      fed: true,
      instrument: "confirmed",
      random: "inconclusive",
      rho: "confirmed",
      others: ["inconclusive", "inconclusive", "inconclusive"],
    }),
    "confirmed",
  );
  assert.equal(
    capacitySummary({
      fed: true,
      instrument: "confirmed",
      random: "inconclusive",
      rho: "confirmed",
      others: ["confirmed", "inconclusive", "inconclusive"],
    }),
    "shared",
  );
  assert.equal(capacityVerdict("shared"), "refuted");
  assert.equal(capacityVerdict("unfed"), "inconclusive");
  assert.equal(capacityVerdict("confirmed"), "confirmed");
  assert.equal(
    capacitySummary({
      fed: false,
      instrument: "confirmed",
      random: "inconclusive",
      rho: "confirmed",
      others: [],
    }),
    "unfed",
  );
});

test("omitted width and width 32 are the same net, and a random walk ignores width", () => {
  const weights = (hidden?: number) =>
    withSeed(12345, () => {
      const k = new Kernel("field", 7, undefined, hidden == null ? undefined : { cellHidden: hidden });
      return [k.loop.hidden, k.loop.net.w1[0], k.loop.net.w2[0], k.cellHidden];
    });
  assert.deepEqual(weights(), weights(SHIPPED_HIDDEN));
  assert.equal(weights(4)[0], 4);
  assert.throws(() => new Kernel("field", 1, undefined, { cellHidden: 0 }), /cellHidden/);
  assert.throws(() => new Kernel("field", 1, undefined, { cellHidden: 33 }), /cellHidden/);

  const walk = (hidden?: number) =>
    withSeed(99, () => {
      const k = new Kernel("distractor", 3, undefined, {
        signal: "random",
        env: capacitySpec(),
        ...(hidden == null ? {} : { cellHidden: hidden }),
      });
      const bits: number[] = [];
      for (let t = 0; t < 40; t++) {
        bits.push(k.regionAt());
        k.step();
      }
      return bits.join(",");
    });
  assert.equal(walk(), walk(4));
  assert.equal(walk(), walk(1));

  const episode = (hidden: number) =>
    runCapacityEpisode({
      kind: "episode",
      id: hidden,
      seed: 3,
      signal: "random",
      steps: 30,
      period: 10,
      hidden,
      policyTemperature: 0.15,
      add: 0,
      salt: 24011,
      tag: "check",
    });
  assert.equal(episode(32).checksum, episode(1).checksum);
  assert.equal(episode(32).foods, 0);
  assert.equal(episode(32).lives, 0);
});
