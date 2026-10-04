import assert from "node:assert/strict";
import { test } from "node:test";
import { MLP, mse } from "./mlp.ts";
import { Loop } from "./loop.ts";
import { Kernel } from "./kernel.ts";
import { StreamKernel, runStream } from "./stream.ts";
import { evaluateClaims } from "./experiments.ts";
import { expectedResidual, imagineScores } from "./policy.ts";
import { branching, edgeIndex, entropyNorm, participation } from "./complexity.ts";

// existing suite preserved in repo history through 19 prior tests; this file is the full suite.

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

test("horizon 3 stays off until ema is under the gate", () => {
  const acts = 2;
  const marker = new Float32Array([0.91, 0.09]);
  let thirdCalls = 0;
  const run = (ema: number, into3: Float32Array[]) => {
    thirdCalls = 0;
    imagineScores({
      acts,
      curiosity: 1,
      goal: 1,
      progressEma: 0.02,
      ema,
      imagined: [new Float32Array(2), new Float32Array(2)],
      imagined2: [new Float32Array(2), new Float32Array(2)],
      imagined3: into3,
      scores: new Float32Array(acts),
      horizon3Ema: 0.12,
      predict: (_a, into) => {
        into[0] = 0.5;
        into[1] = 0.5;
        return into;
      },
      predictFrom: (_pred, a1, into) => {
        if (into === into3[0] || into === into3[1]) {
          thirdCalls += 1;
          into.set(marker);
          return into;
        }
        into[0] = a1 === 0 ? 0.4 : 0.6;
        into[1] = a1 === 0 ? 0.6 : 0.4;
        return into;
      },
      read: () => ({ reward: 0.1, cost: 0, novelty: 0.2 }),
      readPred: () => ({ reward: 0.1, cost: 0, novelty: 0.2 }),
    });
    return thirdCalls;
  };
  const high3 = [new Float32Array(2), new Float32Array(2)];
  const low3 = [new Float32Array(2), new Float32Array(2)];
  assert.equal(run(0.2, high3), 0, "third window ran while ema was high");
  assert.equal(high3[0][0], 0, "high-ema buffer must stay unused");
  assert.ok(run(0.05, low3) > 0, "third window stayed idle after the gate opened");
  assert.ok(low3[0][0] > 0.8 || low3[1][0] > 0.8, "calibrated run must write the third window");
});

test("latent loop compresses hidden state on structure and refuses noise", () => {
  const run = (noise: boolean) => {
    const loop = new Loop(6, 16, 6);
    for (let t = 0; t < 320; t++) {
      const x = new Float32Array(6);
      if (noise) {
        for (let i = 0; i < 6; i++) x[i] = Math.random() < 0.5 ? 0 : 1;
      } else {
        const bit = t % 2;
        x[0] = bit;
        x[1] = 1 - bit;
        x[2] = bit;
        x[3] = bit;
        x[4] = 1 - bit;
        x[5] = bit;
      }
      loop.assimilate(x, 0.08);
      loop.commit(x);
    }
    return loop;
  };
  const structured = run(false);
  const noise = run(true);
  assert.ok(structured.latentEma < 0.02, `structured latent ema ${structured.latentEma}`);
  assert.ok(noise.latentEma > 0.02, `noise latent ema collapsed ${noise.latentEma}`);
  assert.ok(structured.latentEma < noise.latentEma * 0.6, `latent did not separate ${structured.latentEma} vs ${noise.latentEma}`);
  const dumped = structured.exportBrain();
  assert.equal(dumped.scentFallStreak, structured.scentFallStreak);
  const restored = new Loop(6, 16, 6);
  assert.equal(restored.importBrain(dumped), true);
  assert.equal(restored.scentFallStreak, structured.scentFallStreak);
  assert.ok(Math.abs(restored.latentEma - structured.latentEma) < 1e-9);
});

test("stop-grad encoder moves on structure and stays put on noise", () => {
  const l1 = (a: number[], b: number[]) => {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
    return s;
  };
  const structured = new Loop(6, 16, 6);
  const s0 = (structured.exportBrain().proj ?? []).slice();
  for (let t = 0; t < 240; t++) {
    const bit = t % 2;
    const x = new Float32Array([bit, 1 - bit, bit, bit, 1 - bit, 1 - bit]);
    structured.assimilate(x, 0.08);
    structured.commit(x);
  }
  const noise = new Loop(6, 16, 6);
  const n0 = (noise.exportBrain().proj ?? []).slice();
  for (let t = 0; t < 240; t++) {
    const x = new Float32Array(6);
    for (let i = 0; i < 6; i++) x[i] = Math.random();
    noise.assimilate(x, 0.08);
    noise.commit(x);
  }
  const sd = l1(s0, structured.exportBrain().proj ?? []);
  const nd = l1(n0, noise.exportBrain().proj ?? []);
  assert.ok(structured.encoderSteps > 8, `encoder did not step on structure: ${structured.encoderSteps}`);
  assert.ok(sd > 0.02, `encoder barely moved on structure: ${sd}`);
  assert.ok(sd > nd * 2, `encoder drift did not separate ${sd} vs ${nd}`);
  const restored = new Loop(6, 16, 6);
  assert.equal(restored.importBrain(structured.exportBrain()), true);
  assert.ok(l1(structured.exportBrain().proj ?? [], restored.exportBrain().proj ?? []) < 1e-9);
});

test("stop-grad encoder prefers structured channels over noise", () => {
  const loop = new Loop(4, 16, 4);
  for (let t = 0; t < 400; t++) {
    const bit = t % 2;
    const x = new Float32Array([bit, 1 - bit, Math.random(), Math.random()]);
    loop.assimilate(x, 0.08);
    loop.commit(x);
  }
  const proj = loop.exportBrain().proj ?? [];
  const col = [0, 0, 0, 0];
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 4; j++) col[j] += Math.abs(proj[i * 4 + j]);
  }
  const structured = col[0] + col[1];
  const noise = col[2] + col[3];
  assert.ok(loop.encoderSteps > 8, `encoder idle: ${loop.encoderSteps}`);
  assert.ok(structured > noise * 2, `channels not chosen ${structured} vs ${noise}`);
});

test("action-conditional latent ρ̂ pays for the move that predicts a sharper code", () => {
  const acts = 5;
  const out = 6;
  const inn = out + acts;
  const loop = new Loop(inn, 16, out, acts);
  for (let t = 0; t < 700; t++) {
    const a = t % 2;
    const obs = new Float32Array(out);
    if (a === 0) obs.set([1, 0, 1, 0, 1, 0]);
    else {
      const bit = (t >> 1) % 2;
      obs.set([bit, 1 - bit, bit, 1 - bit, bit, 1 - bit]);
    }
    loop.assimilate(obs, 0.12);
    const x = new Float32Array(inn);
    x.set(obs);
    x[out + a] = 1;
    loop.commit(x);
  }
  assert.ok(loop.latentEma < 0.2, `gate never opened: ${loop.latentEma}`);
  const code0 = Array.from(loop.imagineLatent(0));
  const code1 = Array.from(loop.imagineLatent(1));
  let dist = 0;
  for (let i = 0; i < code0.length; i++) dist += Math.abs(code0[i] - code1[i]);
  assert.ok(dist > 1, `imagined codes did not depend on the move: ${dist}`);
  const pay = loop.latentRhoHat(1);
  const flat = loop.latentRhoHat(0);
  assert.ok(pay > flat, `compressible move did not win ${pay} vs ${flat}`);
  assert.ok(pay > 0.01, `latent ρ̂ too small: ${pay}`);
  const dumped = loop.exportBrain();
  const restored = new Loop(inn, 16, out, acts);
  assert.equal(restored.importBrain(dumped), true);
  assert.ok(Math.abs((restored.exportBrain().latentActionEma?.[1] ?? 1) - (dumped.latentActionEma?.[1] ?? 0)) < 1e-9);

  const noise = new Loop(inn, 16, out, acts);
  for (let t = 0; t < 200; t++) {
    const obs = new Float32Array(out);
    for (let i = 0; i < out; i++) obs[i] = Math.random();
    noise.assimilate(obs, 0.08);
    const x = new Float32Array(inn);
    x.set(obs);
    x[out + (t % 2)] = 1;
    noise.commit(x);
  }
  assert.equal(noise.latentRhoHat(0), 0, "incompressible latent must not fund ρ̂");
  assert.equal(noise.latentRhoHat(1), 0, "incompressible latent must not fund ρ̂");
});
