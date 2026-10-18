import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { acfAt } from "./period.ts";
import { createFamily, CYCLE_EAST_LATENT, patternBit, WEST_LATENT } from "./family.ts";
import { Kernel, periodicBoostOn } from "./kernel.ts";
import { cycleSpec, runCycleEpisode } from "./cycle-run.ts";
import {
  CYCLE_LAMBDA,
  CYCLE_TAU,
  curveDecision,
  cycleShapeCall,
  cycleSummary,
  episodeLength,
  halfRecovery,
  instrumentCall,
  smallestShapeDose,
} from "./cycle.ts";

test("decay constant is one half-life of the locked adaptation time", () => {
  assert.equal(CYCLE_LAMBDA, 1 - Math.exp(-Math.LN2 / CYCLE_TAU));
  assert.ok(Math.abs(CYCLE_LAMBDA - 0.012924125031568812) < 1e-18);
});

test("autocorrelation of a square wave is positive at the period and negative at the half", () => {
  const period = 20;
  const series: number[] = [];
  for (let i = 0; i < 400; i++) series.push(Math.floor(i / (period / 2)) % 2 === 0 ? 1 : 0);
  assert.ok(acfAt(series, period) > 0.8);
  assert.ok(acfAt(series, period / 2) < -0.8);
  assert.equal(acfAt(series, 0), 0);
  assert.equal(acfAt([0.2, 0.2, 0.2, 0.2], 1), 0);
});

test("half-recovery censors a flat learn and a curve that never rises", () => {
  const times = [0, 10, 20, 30];
  assert.equal(halfRecovery(0.25, 0.24, [0.24, 0.24, 0.24, 0.24], [0.24, 0.3, 0.4, 0.5], times), null);
  assert.equal(halfRecovery(0.25, 0.05, [0.05, 0.05, 0.05, 0.05], [0.05, 0.1, 0.16, 0.2], times), 20);
  assert.equal(halfRecovery(0.25, 0.05, [0.05, 0.05, 0.05, 0.05], [0.05, 0.06, 0.07, 0.08], times), null);
});

test("curve decision stops unless learning, consolidation, forgetting, and a period all clear", () => {
  const base = { learns: "confirmed" as const, consolidates: "confirmed" as const, forgets: "confirmed" as const, nSeeds: 200, nUncensored: 200, meanH: 80 };
  assert.equal(curveDecision({ ...base, learns: "inconclusive" }).decision, "no-learning");
  assert.equal(curveDecision({ ...base, consolidates: "refuted" }).decision, "no-consolidation");
  assert.equal(curveDecision({ ...base, forgets: "inconclusive" }).decision, "no-forgetting");
  assert.equal(curveDecision({ ...base, nUncensored: 100 }).decision, "period-censored");
  assert.equal(curveDecision({ ...base, meanH: 19.4 }).decision, "period-censored");
  const locked = curveDecision(base);
  assert.equal(locked.decision, "run");
  assert.equal(locked.half, 80);
  assert.equal(locked.period, 160);
  assert.equal(locked.steps, 1600);
  assert.equal(episodeLength(400), 4800);
  assert.equal(episodeLength(19), null);
});

test("cycle shape needs both lags, and the summary keeps a blind instrument from confirming", () => {
  assert.equal(cycleShapeCall({ lo: 0.02, hi: 0.08 }, { lo: -0.1, hi: -0.01 }), "confirmed");
  assert.equal(cycleShapeCall({ lo: -0.08, hi: -0.01 }, { lo: -0.1, hi: -0.01 }), "refuted");
  assert.equal(cycleShapeCall({ lo: 0.02, hi: 0.08 }, { lo: -0.01, hi: 0.02 }), "inconclusive");
  assert.equal(instrumentCall(["inconclusive", "confirmed"]), "confirmed");
  assert.equal(instrumentCall(["refuted", "refuted"]), "refuted");
  assert.equal(instrumentCall(["inconclusive", "refuted"]), "inconclusive");
  assert.equal(smallestShapeDose([0.05, 0.15], ["inconclusive", "confirmed"]), 0.15);
  assert.equal(smallestShapeDose([0.05, 0.15], ["confirmed", "confirmed"]), 0.05);
  const others = ["inconclusive", "inconclusive", "refuted"] as const;
  assert.equal(cycleSummary({ instrument: "inconclusive", random: "inconclusive", rho: "confirmed", others }), "instrument-blind");
  assert.equal(cycleSummary({ instrument: "confirmed", random: "confirmed", rho: "confirmed", others }), "confounded");
  assert.equal(cycleSummary({ instrument: "confirmed", random: "inconclusive", rho: "confirmed", others }), "confirmed");
  assert.equal(
    cycleSummary({ instrument: "confirmed", random: "inconclusive", rho: "confirmed", others: ["confirmed", "inconclusive", "inconclusive"] }),
    "shared",
  );
  assert.equal(cycleSummary({ instrument: "confirmed", random: "inconclusive", rho: "refuted", others }), "refuted");
  assert.equal(cycleSummary({ instrument: "confirmed", random: "inconclusive", rho: "inconclusive", others }), "inconclusive");
});

test("the cycle world has two patterns, no food, and no metabolism, and decay does not move a random walk", () => {
  const built = createFamily("distractor", 15, 3000, cycleSpec().params, false);
  let foods = 0;
  let differ = 0;
  for (let i = 0; i < built.cells.length; i++) {
    if (built.cells[i] === 2) foods += 1;
    const x = i % 15;
    const y = (i / 15) | 0;
    if (built.family.region[i] === 1 && built.cells[i] !== 1) {
      assert.equal(built.family.glow[i], patternBit(x, y, CYCLE_EAST_LATENT));
    }
    if (built.family.region[i] === 0 && built.cells[i] === 0 && x < built.family.dividerX) {
      assert.equal(built.family.glow[i], patternBit(x, y, WEST_LATENT));
      if (patternBit(x, y, WEST_LATENT) !== patternBit(x, y, CYCLE_EAST_LATENT)) differ += 1;
    }
  }
  assert.equal(foods, 0);
  assert.ok(differ > 0);
  assert.equal(built.family.mode, "hold");
  const ordinary = createFamily("distractor", 15, 3000, { learnability: 1, driftRate: 0, distractorRelevance: 0 }, false);
  let ordinaryFood = 0;
  for (let i = 0; i < ordinary.cells.length; i++) if (ordinary.cells[i] === 2) ordinaryFood += 1;
  assert.equal(ordinaryFood, 5);

  const k = new Kernel("distractor", 3, undefined, { env: cycleSpec(), signal: "rho" });
  for (let t = 0; t < 180; t++) k.step();
  assert.equal(k.energy, 100);
  assert.equal(k.lives, 0);
  assert.equal(k.foods, 0);

  const episode = {
    kind: "episode" as const,
    id: 1,
    seed: 2,
    signal: "random" as const,
    steps: 40,
    period: 8,
    policyTemperature: 0.15,
    add: 0,
    salt: 9101,
  };
  const held = runCycleEpisode({ ...episode, forgettingRate: 0, arm: "held" });
  const decayed = runCycleEpisode({ ...episode, forgettingRate: CYCLE_LAMBDA, arm: "forget" });
  assert.equal(decayed.checksum, held.checksum);
  assert.equal(decayed.foods, 0);
  assert.equal(decayed.lives, 0);
  assert.equal(periodicBoostOn(0, 10), true);
  assert.equal(periodicBoostOn(5, 10), false);
  assert.equal(periodicBoostOn(10, 10), true);
  assert.throws(() => new Kernel("field", 1, undefined, { periodicBoost: { add: 0.05, region: 1, period: 1 } }), /periodicBoost/);
});

test("CI does not run the cycle sweep", () => {
  const yml = readFileSync(".github/workflows/ci.yml", "utf8");
  assert.equal(yml.includes("npm run cycle"), false);
});
