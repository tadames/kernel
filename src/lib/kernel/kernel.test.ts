import assert from "node:assert/strict";
import { test } from "node:test";
import { MLP, mse } from "./mlp.ts";
import { Loop, DEFAULT_LOOP_FEATURES, TRANSITION_LR } from "./loop.ts";
import { mulberry32 } from "./presets.ts";

// Weight init uses Math.random. Pin it so the suite does not flicker in CI.
Math.random = mulberry32(20261015);
import { Kernel, OPTION_SPAN } from "./kernel.ts";
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

test("uncertainty off removes the Bernoulli term and progress still scales novelty", () => {
  const score = (uncertainty: boolean, progressEma: number, novelty: number) => {
    const scores = new Float32Array(2);
    imagineScores({
      acts: 2,
      curiosity: 1,
      goal: 0,
      progressEma,
      ema: 0.2,
      uncertainty,
      horizonRho: false,
      imagined: [new Float32Array(2), new Float32Array(2)],
      scores,
      predict: (a, into) => {
        if (a === 0) {
          into[0] = 0.5;
          into[1] = 0.5;
        } else {
          into[0] = 0.99;
          into[1] = 0.01;
        }
        return into;
      },
      read: () => ({ reward: 0, cost: 0, novelty }),
    });
    return [scores[0]!, scores[1]!];
  };
  const on = score(true, 0.05, 0);
  assert.ok(on[0] > on[1], `uncertain action should win: ${on[0]} vs ${on[1]}`);
  const off = score(false, 0.05, 0);
  assert.ok(Math.abs(off[0]) < 1e-12 && Math.abs(off[1]) < 1e-12, `curiosity should be zero: ${off}`);
  const scaled = score(false, 0.05, 1);
  const flat = score(false, 0, 1);
  assert.ok(scaled[0] > flat[0], `progress should scale novelty: ${scaled[0]} vs ${flat[0]}`);
  assert.ok(Math.abs(scaled[0] - scaled[1]) < 1e-12, "equal novelty should tie once residual is gone");
});

test("a zero progress-channel bonus matches the shipped score and a positive bonus is local", () => {
  const score = (extra?: (action: number) => number) => {
    const scores = new Float32Array(2);
    imagineScores({
      acts: 2,
      curiosity: 1,
      goal: 0,
      progressEma: 0.02,
      ema: 0.2,
      horizonRho: false,
      imagined: [new Float32Array(2), new Float32Array(2)],
      scores,
      predict: (a, into) => {
        into[0] = a === 0 ? 0.5 : 0.9;
        into[1] = a === 0 ? 0.5 : 0.1;
        return into;
      },
      read: () => ({ reward: 0, cost: 0, novelty: 0.4 }),
      progExtra: extra,
    });
    return [scores[0]!, scores[1]!];
  };
  const base = score();
  const zero = score(() => 0);
  assert.equal(zero[0], base[0]);
  assert.equal(zero[1], base[1]);
  const boosted = score((action) => (action === 0 ? 0.5 : 0));
  assert.ok(boosted[0] > base[0], `boosted ${boosted[0]} base ${base[0]}`);
  assert.equal(boosted[1], base[1]);
});

test("horizon residual drop can be removed without changing a flat residual", () => {
  const run = (horizonRho: boolean) => {
    const into2 = [new Float32Array(2), new Float32Array(2)];
    const scores = new Float32Array(2);
    imagineScores({
      acts: 2,
      curiosity: 1,
      goal: 0,
      progressEma: 0,
      ema: 0.2,
      uncertainty: true,
      horizonRho,
      horizon3Ema: 0.12,
      imagined: [new Float32Array(2), new Float32Array(2)],
      imagined2: into2,
      scores,
      predict: (_a, into) => {
        into[0] = 0.5;
        into[1] = 0.5;
        return into;
      },
      predictFrom: (_pred, _a1, into) => {
        if (into === into2[0]) {
          into[0] = 0.99;
          into[1] = 0.01;
        } else {
          into[0] = 0.5;
          into[1] = 0.5;
        }
        return into;
      },
      read: () => ({ reward: 0, cost: 0, novelty: 0 }),
      readPred: () => ({ reward: 0, cost: 0, novelty: 0 }),
    });
    return [scores[0]!, scores[1]!];
  };
  const on = run(true);
  const off = run(false);
  assert.ok(on[0] > off[0], `drop should raise the falling action: ${on[0]} vs ${off[0]}`);
  assert.ok(Math.abs(on[1] - off[1]) < 1e-12, `flat residual must not move: ${on[1]} vs ${off[1]}`);
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
  assert.ok(structured.latentEma < 0.03, `structured latent ema ${structured.latentEma}`);
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
  const learn = { encoder: true } as const;
  const structured = new Loop(6, 16, 6, 5, learn);
  const s0 = (structured.exportBrain().proj ?? []).slice();
  for (let t = 0; t < 240; t++) {
    const bit = t % 2;
    const x = new Float32Array([bit, 1 - bit, bit, bit, 1 - bit, 1 - bit]);
    structured.assimilate(x, 0.08);
    structured.commit(x);
  }
  const noise = new Loop(6, 16, 6, 5, learn);
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
  const loop = new Loop(4, 16, 4, 5, { encoder: true });
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

test("slow code predicts the latent, not cells, and stays shut on noise", () => {
  const acts = 5;
  const out = 6;
  const inn = out + acts;
  const loop = new Loop(inn, 16, out, acts);
  let paid = 0;
  let progressed = 0;
  for (let t = 0; t < 900; t++) {
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
    if (loop.slowRho() > 0.001) progressed += 1;
    if (loop.slowRhoHat(a) > 0) paid += 1;
  }
  assert.ok(loop.latentEma < 0.2, `level-1 gate never opened: ${loop.latentEma}`);
  assert.ok(loop.slowSteps > 40, `slow loop idle: ${loop.slowSteps}`);
  assert.ok(loop.slowEma < 0.05, `slow code did not compress the latent: ${loop.slowEma}`);
  assert.ok(progressed > 10, `slow progress did not pay while falling: ${progressed}`);
  assert.ok(paid > 5, `slow ρ̂ paid neither move while falling: ${paid}`);
  const dumped = loop.exportBrain();
  const restored = new Loop(inn, 16, out, acts);
  assert.equal(restored.importBrain(dumped), true);
  assert.ok(Math.abs((restored.exportBrain().slowEma ?? 1) - (dumped.slowEma ?? 0)) < 1e-9);
  assert.ok(
    Math.abs((restored.exportBrain().slowActionEma?.[1] ?? 1) - (dumped.slowActionEma?.[1] ?? 0)) < 1e-9,
  );

  const noise = new Loop(inn, 16, out, acts, { wake: true });
  for (let t = 0; t < 240; t++) {
    const obs = new Float32Array(out);
    for (let i = 0; i < out; i++) obs[i] = Math.random();
    noise.assimilate(obs, 0.08);
    const x = new Float32Array(inn);
    x.set(obs);
    x[out + (t % 2)] = 1;
    noise.commit(x);
  }
  assert.equal(noise.slowRho(), 0, "incompressible slow code must not fund ρ");
  assert.equal(noise.slowRhoHat(0), 0, "incompressible slow code must not fund ρ̂");
  assert.equal(noise.slowRhoHat(1), 0, "incompressible slow code must not fund ρ̂");
  assert.equal(noise.slowWakes, 0, "noise residual that tracks its ema must not wake the slow step");
});

test("level-1 residual wakes the slow step and does not pay", () => {
  const acts = 5;
  const out = 6;
  const inn = out + acts;
  const loop = new Loop(inn, 16, out, acts, { encoder: true, slowEncoder: true, encoderMix: true, wake: true });
  const step = (obs: Float32Array, a: number) => {
    loop.assimilate(obs, 0.12);
    const x = new Float32Array(inn);
    x.set(obs);
    x[out + a] = 1;
    loop.commit(x);
  };
  for (let t = 0; t < 700; t++) {
    const a = t % 2;
    const obs = new Float32Array(out);
    if (a === 0) obs.set([1, 0, 1, 0, 1, 0]);
    else {
      const bit = (t >> 1) % 2;
      obs.set([bit, 1 - bit, bit, 1 - bit, bit, 1 - bit]);
    }
    step(obs, a);
  }
  assert.ok(loop.latentEma < 0.2, `level-1 gate never opened: ${loop.latentEma}`);
  assert.equal(loop.slowWakes, 0, "a compressing latent must not count as a wake");
  const before = loop.slow.exportWeights().w1.reduce((s, v) => s + v, 0);
  for (let t = 0; t < 80; t++) {
    const obs = new Float32Array(out);
    for (let i = 0; i < out; i++) obs[i] = (t * 3 + i * 5) % 2;
    step(obs, t % 2);
  }
  const after = loop.slow.exportWeights().w1.reduce((s, v) => s + v, 0);
  assert.ok(loop.slowWakes > 0, `downstairs residual did not wake the slow step: ${loop.slowWakes}`);
  assert.ok(Math.abs(after - before) > 1e-6, "wake did not move the slower code");
  assert.equal(loop.slowRho(), 0, "a wake while the latent gate is shut must not fund ρ");
  assert.equal(loop.slowRhoHat(0), 0, "a wake while the latent gate is shut must not fund ρ̂");
  const dumped = loop.exportBrain();
  const restored = new Loop(inn, 16, out, acts);
  assert.equal(restored.importBrain(dumped), true);
  assert.equal(restored.exportBrain().slowWakes, dumped.slowWakes);
});

test("slow window scores one imagined latent step, not only the current code", () => {
  const acts = 5;
  const out = 6;
  const inn = out + acts;
  const loop = new Loop(inn, 16, out, acts, { encoder: true, slowEncoder: true, encoderMix: true });
  const step = (obs: Float32Array, a: number) => {
    loop.assimilate(obs, 0.12);
    const x = new Float32Array(inn);
    x.set(obs);
    x[out + a] = 1;
    loop.commit(x);
  };
  for (let t = 0; t < 900; t++) {
    const a = t % 2;
    const obs = new Float32Array(out);
    if (a === 0) obs.set([1, 0, 1, 0, 1, 0]);
    else {
      const bit = (t >> 1) % 2;
      obs.set([bit, 1 - bit, bit, 1 - bit, bit, 1 - bit]);
    }
    step(obs, a);
  }
  assert.ok(loop.latentEma < 0.2, `level-1 gate never opened: ${loop.latentEma}`);
  assert.ok(loop.slowEma < 0.2, `slow gate never opened: ${loop.slowEma}`);
  const window = Math.max(loop.slowWindowRhoHat(0), loop.slowWindowRhoHat(1));
  assert.ok(window > 0.001, `slower window did not pay: ${window}`);
  const held = loop.lastHidden.slice();
  loop.lastHidden.fill(0.5);
  const collapsed = Math.max(loop.slowWindowRhoHat(0), loop.slowWindowRhoHat(1));
  loop.lastHidden.set(held);
  assert.ok(window > collapsed, `collapsed latent still matched the structured window ${window} vs ${collapsed}`);
  const dumped = loop.exportBrain();
  const restored = new Loop(inn, 16, out, acts);
  assert.equal(restored.importBrain(dumped), true);
  assert.ok(Math.abs((restored.exportBrain().slowWindow ?? 0) - (dumped.slowWindow ?? 0)) < 1e-9);

  const noise = new Loop(inn, 16, out, acts);
  for (let t = 0; t < 240; t++) {
    const obs = new Float32Array(out);
    for (let i = 0; i < out; i++) obs[i] = Math.random();
    noise.assimilate(obs, 0.08);
    const x = new Float32Array(inn);
    x.set(obs);
    x[out + (t % 2)] = 1;
    noise.commit(x);
  }
  assert.equal(noise.slowWindowRhoHat(0), 0, "incompressible slow window must not fund ρ̂");
  assert.equal(noise.slowWindowRhoHat(1), 0, "incompressible slow window must not fund ρ̂");
});

test("slow window scores a second latent step past a wall the first window refuses", () => {
  const acts = 2;
  const out = 4;
  const inn = out + acts;
  const hidden = 8;
  const loop = new Loop(inn, hidden, out, acts);
  const brain = loop.exportBrain();
  brain.latentW1 = brain.latentW1.map(() => 0);
  brain.latentB1 = brain.latentB1.map(() => 0);
  brain.latentW2 = brain.latentW2.map(() => 0);
  brain.latentB2 = brain.latentB2.map(() => 0);
  brain.slowW1 = (brain.slowW1 ?? []).map(() => 0);
  brain.slowB1 = (brain.slowB1 ?? []).map(() => 0);
  brain.slowW2 = (brain.slowW2 ?? []).map(() => 0);
  brain.slowB2 = (brain.slowB2 ?? []).map(() => 0);
  brain.latentEma = 0.05;
  brain.slowEma = 0.05;
  brain.slowCode = Array.from({ length: hidden }, () => 0);
  const bias = new Array(acts * hidden).fill(0);
  // Action 0 imagines a collapsed zero code: the first window is a wall.
  for (let i = 0; i < hidden; i++) bias[i] = -1;
  // Action 1 imagines a structured code the slow prediction (½) is closer to.
  for (let i = 0; i < hidden; i++) bias[hidden + i] = i % 2 === 0 ? 1 : -1;
  brain.latentActBias = bias;
  brain.slowActBias = new Array(acts * hidden).fill(0);
  // Action 1 has the lower level-1 residual, so it is eligible as a follow-up.
  brain.latentActionEma = [0.20, 0.05];
  assert.equal(loop.importBrain(brain), true);
  assert.equal(loop.slowWindowRhoHat(0), 0, "first window must refuse the collapsed step");
  const past = loop.slowWindow2RhoHat(0);
  assert.ok(past > 0.001, `second latent step did not pay past the wall: ${past}`);
  const dumped = loop.exportBrain();
  // Same brain, but action 0 now imagines a structured code the first window can score.
  const open = dumped.latentActBias!.slice();
  for (let i = 0; i < hidden; i++) open[i] = i % 2 === 0 ? 1 : -1;
  dumped.latentActBias = open;
  assert.equal(loop.importBrain(dumped), true);
  assert.ok(loop.slowWindowRhoHat(0) > 0.001, "control: first window should pay once the step is structured");
  assert.equal(loop.slowWindow2RhoHat(0), 0, "a paying first window must keep the second step shut");
  const restored = new Loop(inn, hidden, out, acts);
  assert.equal(restored.importBrain(dumped), true);
  assert.ok(Math.abs((restored.exportBrain().slowWindow2 ?? 0) - (dumped.slowWindow2 ?? 0)) < 1e-9);

  const noise = new Loop(inn, hidden, out, acts);
  for (let t = 0; t < 80; t++) {
    const obs = new Float32Array(out);
    for (let i = 0; i < out; i++) obs[i] = Math.random();
    noise.assimilate(obs, 0.08);
    const x = new Float32Array(inn);
    x.set(obs);
    x[out + (t % 2)] = 1;
    noise.commit(x);
  }
  assert.equal(noise.slowWindow2RhoHat(0), 0, "incompressible second step must not fund ρ̂");
  assert.equal(noise.slowWindow2RhoHat(1), 0, "incompressible second step must not fund ρ̂");
});

test("slow window 2 stays shut until slowEma is under 0.12", () => {
  const inn = 6;
  const hidden = 4;
  const out = 4;
  const acts = 2;
  const loop = new Loop(inn, hidden, out, acts);
  const brain = loop.exportBrain();
  brain.latentW1 = brain.latentW1.map(() => 0);
  brain.latentB1 = brain.latentB1.map(() => 0);
  brain.latentW2 = brain.latentW2.map(() => 0);
  brain.latentB2 = brain.latentB2.map(() => 0);
  brain.slowW1 = (brain.slowW1 ?? []).map(() => 0);
  brain.slowB1 = (brain.slowB1 ?? []).map(() => 0);
  brain.slowW2 = (brain.slowW2 ?? []).map(() => 0);
  brain.slowB2 = (brain.slowB2 ?? []).map(() => 0);
  brain.latentEma = 0.05;
  brain.slowEma = 0.15;
  brain.slowCode = Array.from({ length: hidden }, () => 0);
  const bias = new Array(acts * hidden).fill(0);
  for (let i = 0; i < hidden; i++) bias[i] = -1;
  for (let i = 0; i < hidden; i++) bias[hidden + i] = i % 2 === 0 ? 1 : -1;
  brain.latentActBias = bias;
  brain.slowActBias = new Array(acts * hidden).fill(0);
  brain.latentActionEma = [0.20, 0.05];
  assert.equal(loop.importBrain(brain), true);
  assert.equal(loop.slowWindow2RhoHat(0), 0, "uncalibrated slow code must not imagine past the wall");
  assert.equal(loop.exportBrain().slowWindow2 ?? 0, 0, "a closed gate must not write the second-step trace");
  brain.slowEma = 0.11;
  assert.equal(loop.importBrain(brain), true);
  const past = loop.slowWindow2RhoHat(0);
  assert.ok(past > 0.001, `second step should pay once slowEma is under the gate: ${past}`);
});

test("slow window 2 follow-up must lower the level-1 residual", () => {
  const acts = 2;
  const out = 4;
  const inn = out + acts;
  const hidden = 8;
  const loop = new Loop(inn, hidden, out, acts);
  const brain = loop.exportBrain();
  brain.latentW1 = brain.latentW1.map(() => 0);
  brain.latentB1 = brain.latentB1.map(() => 0);
  brain.latentW2 = brain.latentW2.map(() => 0);
  brain.latentB2 = brain.latentB2.map(() => 0);
  brain.slowW1 = (brain.slowW1 ?? []).map(() => 0);
  brain.slowB1 = (brain.slowB1 ?? []).map(() => 0);
  brain.slowW2 = (brain.slowW2 ?? []).map(() => 0);
  brain.slowB2 = (brain.slowB2 ?? []).map(() => 0);
  brain.latentEma = 0.05;
  brain.slowEma = 0.05;
  brain.slowCode = Array.from({ length: hidden }, () => 0);
  const bias = new Array(acts * hidden).fill(0);
  // Action 0 imagines a collapsed zero code: the first window is a wall.
  for (let i = 0; i < hidden; i++) bias[i] = -1;
  // Action 1 imagines a structured code the slow prediction (½) is closer to.
  for (let i = 0; i < hidden; i++) bias[hidden + i] = i % 2 === 0 ? 1 : -1;
  brain.latentActBias = bias;
  brain.slowActBias = new Array(acts * hidden).fill(0);
  // Both actions have the same level-1 residual: no follow-up lowers it.
  brain.latentActionEma = [0.15, 0.15];
  assert.equal(loop.importBrain(brain), true);
  assert.equal(loop.slowWindowRhoHat(0), 0, "first window must refuse the collapsed step");
  assert.equal(loop.slowWindow2RhoHat(0), 0, "second step must not pay when no follow-up lowers the level-1 residual");
  // Now make action 1 lower the residual. It should pay.
  brain.latentActionEma = [0.20, 0.05];
  assert.equal(loop.importBrain(brain), true);
  const past = loop.slowWindow2RhoHat(0);
  assert.ok(past > 0.001, `second step should pay once the follow-up lowers level-1 residual: ${past}`);
});

test("slow window 3 scores one more step under the residual constraint", () => {
  const acts = 3;
  const out = 4;
  const inn = out + acts;
  const hidden = 8;
  const loop = new Loop(inn, hidden, out, acts);
  const brain = loop.exportBrain();
  brain.latentW1 = brain.latentW1.map(() => 0);
  brain.latentB1 = brain.latentB1.map(() => 0);
  brain.latentW2 = brain.latentW2.map(() => 0);
  brain.latentB2 = brain.latentB2.map(() => 0);
  brain.slowW1 = (brain.slowW1 ?? []).map(() => 0);
  brain.slowB1 = (brain.slowB1 ?? []).map(() => 0);
  brain.slowW2 = (brain.slowW2 ?? []).map(() => 0);
  brain.slowB2 = (brain.slowB2 ?? []).map(() => 0);
  brain.latentEma = 0.05;
  brain.slowEma = 0.05;
  brain.slowCode = Array.from({ length: hidden }, () => 0);
  const bias = new Array(acts * hidden).fill(0);
  // Action 0 imagines a collapsed zero code: the first window is a wall.
  for (let i = 0; i < hidden; i++) bias[i] = -1;
  // Action 1 imagines a structured code the slow prediction is closer to (second pays).
  for (let i = 0; i < hidden; i++) bias[hidden + i] = i % 2 === 0 ? 1 : -1;
  // Action 2 imagines a code even closer to ½ (third incremental).
  for (let i = 0; i < hidden; i++) bias[2 * hidden + i] = i % 2 === 0 ? 0.2 : -0.2;
  brain.latentActBias = bias;
  brain.slowActBias = new Array(acts * hidden).fill(0);
  // Residuals decrease so each follow-up is eligible.
  brain.latentActionEma = [0.30, 0.15, 0.05];
  assert.equal(loop.importBrain(brain), true);
  assert.equal(loop.slowWindowRhoHat(0), 0, "first window must refuse the collapsed step");
  const second = loop.slowWindow2RhoHat(0);
  assert.ok(second > 0.001, `second step should pay: ${second}`);
  const third = loop.slowWindow3RhoHat(0);
  assert.ok(third > 0.001, `third step should pay the incremental drop: ${third}`);
  // Same residual on the third action: constraint refuses it.
  brain.latentActionEma = [0.30, 0.15, 0.15];
  assert.equal(loop.importBrain(brain), true);
  assert.equal(loop.slowWindow3RhoHat(0), 0, "third step must not pay when no follow-up lowers the level-1 residual");
  // Restore and check persistence.
  brain.latentActionEma = [0.30, 0.15, 0.05];
  assert.equal(loop.importBrain(brain), true);
  const paid = loop.slowWindow3RhoHat(0);
  const dumped = loop.exportBrain();
  const restored = new Loop(inn, hidden, out, acts);
  assert.equal(restored.importBrain(dumped), true);
  assert.ok(Math.abs((restored.exportBrain().slowWindow3 ?? 0) - (dumped.slowWindow3 ?? 0)) < 1e-9);
  assert.ok(paid > 0.001);
});

test("slow self window scores the slow code's own next step, not a latent-imagined code", () => {
  const acts = 2;
  const out = 4;
  const inn = out + acts;
  const hidden = 8;
  const loop = new Loop(inn, hidden, out, acts);
  const brain = loop.exportBrain();
  // Zero weights so bias dominates the self-prediction.
  brain.slowW1 = (brain.slowW1 ?? []).map(() => 0);
  brain.slowB1 = (brain.slowB1 ?? []).map(() => 0);
  brain.slowW2 = (brain.slowW2 ?? []).map(() => 0);
  brain.slowB2 = (brain.slowB2 ?? []).map(() => 0);
  brain.latentEma = 0.05;
  brain.slowEma = 0.05;
  brain.slowCode = Array.from({ length: hidden }, () => 0.5);
  const bias = new Array(acts * hidden).fill(0);
  // Action 0 imagines a collapsed code: residual does not drop.
  for (let i = 0; i < hidden; i++) bias[i] = -1;
  // Action 1 imagines a structured code closer to the prediction (½).
  for (let i = 0; i < hidden; i++) bias[hidden + i] = i % 2 === 0 ? 0.1 : -0.1;
  brain.slowActBias = bias;
  assert.equal(loop.importBrain(brain), true);
  assert.equal(loop.slowSelfWindowRhoHat(0), 0, "collapsed self-code must not fund ρ̂");
  const paid = loop.slowSelfWindowRhoHat(1);
  assert.ok(paid > 0.001, `self window should pay on a structured self-prediction: ${paid}`);
  // Noise / uncalibrated must refuse.
  brain.slowEma = 0.25;
  assert.equal(loop.importBrain(brain), true);
  assert.equal(loop.slowSelfWindowRhoHat(1), 0, "uncalibrated slow code must not fund the self window");
  // Persistence.
  brain.slowEma = 0.05;
  assert.equal(loop.importBrain(brain), true);
  const again = loop.slowSelfWindowRhoHat(1);
  const dumped = loop.exportBrain();
  const restored = new Loop(inn, hidden, out, acts);
  assert.equal(restored.importBrain(dumped), true);
  assert.ok(Math.abs((restored.exportBrain().slowSelfWindow ?? 0) - (dumped.slowSelfWindow ?? 0)) < 1e-9);
  assert.ok(again > 0.001);
});

test("slow self window 2 scores a second self-step past a wall the first treats as a wall", () => {
  const acts = 2;
  const out = 4;
  const inn = out + acts;
  const hidden = 8;
  const loop = new Loop(inn, hidden, out, acts);
  const brain = loop.exportBrain();
  brain.slowW1 = (brain.slowW1 ?? []).map(() => 0);
  brain.slowB1 = (brain.slowB1 ?? []).map(() => 0);
  brain.slowW2 = (brain.slowW2 ?? []).map(() => 0);
  brain.slowB2 = (brain.slowB2 ?? []).map(() => 0);
  brain.latentEma = 0.05;
  brain.slowEma = 0.05;
  brain.slowCode = Array.from({ length: hidden }, () => 0.5);
  const bias = new Array(acts * hidden).fill(0);
  // Action 0 imagines a collapsed code: first self-window is a wall.
  for (let i = 0; i < hidden; i++) bias[i] = -1;
  // Action 1 imagines a structured code closer to ½ so the second self-step pays.
  for (let i = 0; i < hidden; i++) bias[hidden + i] = i % 2 === 0 ? 0.1 : -0.1;
  brain.slowActBias = bias;
  assert.equal(loop.importBrain(brain), true);
  assert.equal(loop.slowSelfWindowRhoHat(0), 0, "first self-window must refuse the collapsed step");
  const past = loop.slowSelfWindow2RhoHat(0);
  assert.ok(past > 0.001, `second self-step should pay past the wall: ${past}`);
  // When first already pays, second stays shut.
  brain.slowActBias = bias.map((v, i) => i < hidden ? (i % 2 === 0 ? 0.1 : -0.1) : v);
  assert.equal(loop.importBrain(brain), true);
  assert.ok(loop.slowSelfWindowRhoHat(0) > 0.001, "first should now pay");
  assert.equal(loop.slowSelfWindow2RhoHat(0), 0, "second self-step must not pay when first already pays");
  // Uncalibrated gate.
  brain.slowEma = 0.15;
  brain.slowActBias = bias;
  assert.equal(loop.importBrain(brain), true);
  assert.equal(loop.slowSelfWindow2RhoHat(0), 0, "uncalibrated slow code must not fund the second self-window");
  // Persistence.
  brain.slowEma = 0.05;
  assert.equal(loop.importBrain(brain), true);
  const paid = loop.slowSelfWindow2RhoHat(0);
  const dumped = loop.exportBrain();
  const restored = new Loop(inn, hidden, out, acts);
  assert.equal(restored.importBrain(dumped), true);
  assert.ok(Math.abs((restored.exportBrain().slowSelfWindow2 ?? 0) - (dumped.slowSelfWindow2 ?? 0)) < 1e-9);
  assert.ok(paid > 0.001);
});

test("slow encoder invents features on structure and stays put on noise", () => {
  const acts = 5;
  const out = 6;
  const inn = out + acts;
  const hidden = 16;
  const loop = new Loop(inn, hidden, out, acts, { slowEncoder: true, encoderMix: true });
  const start = Array.from(loop.exportBrain().slowProj ?? []);
  for (let t = 0; t < 400; t++) {
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
  assert.ok(loop.slowEncoderSteps > 5, `slow encoder idle on structure: ${loop.slowEncoderSteps}`);
  const moved = Array.from(loop.exportBrain().slowProj ?? []).some((w, i) => Math.abs(w - start[i]) > 0.01);
  assert.ok(moved, "slow encoder did not move on structure");
});

test("feature flags default to the kept set and a shut encoder does not step", () => {
  const open = new Loop(4, 8, 4);
  assert.deepEqual(open.features, DEFAULT_LOOP_FEATURES);
  const shut = new Loop(4, 8, 4, 5, { encoder: false, wake: false });
  assert.equal(shut.features.encoder, false);
  assert.equal(shut.features.wake, false);
  assert.equal(shut.features.slowWindow, DEFAULT_LOOP_FEATURES.slowWindow);
  for (let t = 0; t < 80; t++) {
    const bit = t % 2;
    const x = new Float32Array([bit, 1 - bit, bit, 1 - bit]);
    shut.assimilate(x, 0.2);
    shut.commit(x);
  }
  assert.equal(shut.encoderSteps, 0);
  assert.equal(shut.slowWakes, 0);
});

test("discard drops a channel that loses to its mean and stays shut until the warmup", () => {
  const target = new Float32Array([0, 1, 0.2, 1, 0, 0.7]);
  const on = new Loop(8, 4, 6, 5, { discard: true });
  on.lastPred.fill(0.5);
  on.assimilateSteps = Loop.DISCARD_WARMUP;
  on.residualEma[0] = 0.3;
  on.marginalEma[0] = 0.05;
  on.residualEma[1] = 0.02;
  on.marginalEma[1] = 0.2;
  on.residualEma[3] = 0.19;
  on.marginalEma[3] = 0.19;
  on.residualEma[4] = 0.1;
  on.marginalEma[4] = 0.3;
  const train = on.cellTrainTarget(target);
  assert.equal(train[0], 0.5, "a channel worse than its mean is copied from the prediction");
  assert.equal(train[1], 1, "a channel better than its mean keeps its target");
  assert.equal(train[2], 0.5, "family 2 stays out of the cell loss");
  assert.equal(train[3], 0.5, "a tie with the mean is not a compression");
  assert.equal(train[4], 0);
  assert.equal(train[5], 0.5);
  assert.equal(on.discardFraction, 0.5);

  on.assimilateSteps = Loop.DISCARD_WARMUP - 1;
  const warm = on.cellTrainTarget(target);
  assert.equal(warm[0], 0, "the first 40 training steps still fit every non-scent channel");
  assert.equal(on.discardFraction, 0);

  const off = new Loop(8, 4, 6, 5);
  off.lastPred.fill(0.5);
  off.assimilateSteps = Loop.DISCARD_WARMUP;
  off.residualEma[0] = 0.3;
  off.marginalEma[0] = 0.05;
  const kept = off.cellTrainTarget(target);
  assert.equal(kept[0], 0);
  assert.equal(kept[2], 0.5);
  assert.equal(off.discardFraction, 0);
  assert.equal(DEFAULT_LOOP_FEATURES.discard, false);
});

test("discard does not step a dropped output, and the warmup matches the flag off", () => {
  Math.random = mulberry32(11);
  const on = new Loop(8, 4, 6, 5, { discard: true });
  Math.random = mulberry32(11);
  const off = new Loop(8, 4, 6, 5);
  const input = new Float32Array(8);
  input[0] = 1;
  on.commit(input);
  off.commit(input.slice());
  on.assimilateSteps = Loop.DISCARD_WARMUP;
  on.residualEma.fill(0);
  on.marginalEma.fill(1);
  on.targetMean.fill(0);
  on.residualEma[0] = 0.4;
  on.marginalEma[0] = 0.01;
  const row0 = Array.from(on.net.w2.subarray(0, on.net.h));
  const b0 = on.net.b2[0];
  const row1 = Array.from(on.net.w2.subarray(on.net.h, on.net.h * 2));
  const target = new Float32Array(6);
  target[1] = 1;
  on.assimilate(target, 0.5);
  off.assimilate(target, 0.5);
  for (let j = 0; j < on.net.h; j++) assert.equal(on.net.w2[j], row0[j]);
  assert.equal(on.net.b2[0], b0);
  let moved = false;
  for (let j = 0; j < on.net.h; j++) if (on.net.w2[on.net.h + j] !== row1[j]) moved = true;
  assert.ok(moved, "a channel the model is beating still takes a gradient");
  assert.equal(on.surprise, off.surprise);
  assert.equal(on.assimilateSteps, Loop.DISCARD_WARMUP + 1);
  assert.equal(off.assimilateSteps, 0);

  const dumped = on.exportBrain();
  const restored = new Loop(8, 4, 6, 5, { discard: true });
  assert.equal(restored.importBrain(dumped), true);
  assert.equal(restored.assimilateSteps, on.assimilateSteps);
  assert.ok(Math.abs(restored.marginalEma[0]! - on.marginalEma[0]!) < 1e-9);

  const walk = (features?: { discard: boolean }) => {
    Math.random = mulberry32(4);
    const loop = new Loop(6, 8, 6, 5, features);
    for (let t = 0; t < 30; t++) {
      const x = new Float32Array(6);
      x[0] = t % 2;
      x[1] = 1 - (t % 2);
      loop.assimilate(x, 0.2);
      const committed = new Float32Array(6 + 5);
      committed.set(x);
      committed[6] = 1;
      loop.commit(committed);
    }
    return { w2: Array.from(loop.net.w2), steps: loop.assimilateSteps };
  };
  const plain = walk();
  const explicitOff = walk({ discard: false });
  const duringWarmup = walk({ discard: true });
  assert.deepEqual(explicitOff.w2, plain.w2);
  assert.deepEqual(duringWarmup.w2, plain.w2);
  assert.equal(plain.steps, 0);
  assert.equal(duringWarmup.steps, 29);
});

test("decode matches the hidden to a stop-grad code and does not backprop cell error into it", () => {
  Math.random = mulberry32(21);
  const loop = new Loop(4, 2, 4, 2, { decode: true });
  const input = new Float32Array(4);
  input[0] = 1;
  input[1] = 0.25;
  loop.commit(input);
  loop.net.w1.fill(0);
  loop.net.b1[0] = 0.3;
  loop.net.b1[1] = -0.4;
  loop.decW.fill(0);
  loop.decB[0] = 0.3;
  loop.decB[1] = -0.4;
  const w1 = Array.from(loop.net.w1);
  const b1 = Array.from(loop.net.b1);
  const w2 = Array.from(loop.net.w2);
  const target = new Float32Array([1, 0, 1, 0]);
  loop.assimilate(target, 0.5);
  assert.deepEqual(Array.from(loop.net.w1), w1);
  assert.deepEqual(Array.from(loop.net.b1), b1);
  assert.equal(loop.decodeResidual, 0);
  let moved = false;
  for (let i = 0; i < w2.length; i++) if (loop.net.w2[i] !== w2[i]) moved = true;
  assert.ok(moved, "the readout still fits cells");
  assert.equal(DEFAULT_LOOP_FEATURES.decode, false);
});

test("decode leaves the readout alone when the cell target is already the prediction", () => {
  Math.random = mulberry32(22);
  const loop = new Loop(4, 2, 4, 2, { decode: true });
  const input = new Float32Array(4);
  input[0] = 0.8;
  loop.commit(input);
  loop.net.b1[0] = 0.5;
  const pred = new Float32Array(4);
  loop.net.forward(input, pred);
  loop.decW.fill(0);
  loop.decB.fill(0);
  const w1 = Array.from(loop.net.w1);
  const b1 = Array.from(loop.net.b1);
  const w2 = Array.from(loop.net.w2);
  const b2 = Array.from(loop.net.b2);
  loop.assimilate(pred, 0.5);
  assert.deepEqual(Array.from(loop.net.w2), w2);
  assert.deepEqual(Array.from(loop.net.b2), b2);
  let moved = false;
  for (let i = 0; i < w1.length; i++) if (loop.net.w1[i] !== w1[i]) moved = true;
  for (let i = 0; i < b1.length; i++) if (loop.net.b1[i] !== b1[i]) moved = true;
  assert.ok(moved, "a zero code still pulls the hidden");
});

test("decode encoder ignores the predictor hidden and family 2", () => {
  const make = () => {
    Math.random = mulberry32(23);
    return new Loop(6, 4, 6, 2, { decode: true });
  };
  const a = make();
  const b = make();
  b.net.w1[0] += 0.4;
  b.net.b1[0] += 0.2;
  for (let j = 0; j < b.net.h; j++) b.net.w2[2 * b.net.h + j]! += 0.5;
  b.net.b2[2] += 0.3;
  const input = new Float32Array(6);
  input[0] = 1;
  input[2] = 0.5;
  a.commit(input.slice());
  b.commit(input.slice());
  const target = new Float32Array([0.2, 0.8, 0.4, 0.7, 0.3, 0.6]);
  a.assimilate(target, 0.25);
  b.assimilate(target, 0.25);
  assert.deepEqual(Array.from(a.decW), Array.from(b.decW));
  assert.deepEqual(Array.from(a.decB), Array.from(b.decB));
  const fresh = make();
  let moved = false;
  for (let i = 0; i < a.decW.length; i++) if (a.decW[i] !== fresh.decW[i]) moved = true;
  assert.ok(moved, "encoder did not step");
});

test("decode off matches the cell loss, and surprise stays the real residual", () => {
  const walk = (features?: { decode: boolean }) => {
    Math.random = mulberry32(24);
    const loop = new Loop(6, 8, 6, 5, features);
    let surprise = 0;
    for (let t = 0; t < 30; t++) {
      const x = new Float32Array(6);
      x[0] = t % 2;
      x[1] = 1 - (t % 2);
      x[3] = t % 2;
      loop.assimilate(x, 0.4);
      surprise = loop.surprise;
      const committed = new Float32Array(6 + 5);
      committed.set(x);
      committed[6] = 1;
      loop.commit(committed);
    }
    return { w1: Array.from(loop.net.w1), w2: Array.from(loop.net.w2), surprise, residual: loop.decodeResidual };
  };
  const plain = walk();
  const explicitOff = walk({ decode: false });
  const on = walk({ decode: true });
  assert.deepEqual(explicitOff.w1, plain.w1);
  assert.deepEqual(explicitOff.w2, plain.w2);
  assert.equal(explicitOff.surprise, plain.surprise);
  assert.equal(plain.residual, 0);
  assert.equal(explicitOff.residual, 0);
  assert.notDeepEqual(on.w1, plain.w1);

  Math.random = mulberry32(25);
  const left = new Loop(4, 3, 4, 2, { decode: true });
  Math.random = mulberry32(25);
  const right = new Loop(4, 3, 4, 2, { decode: false });
  const input = new Float32Array(4);
  input[0] = 1;
  left.commit(input.slice());
  right.commit(input.slice());
  const target = new Float32Array([1, 0, 1, 0]);
  left.assimilate(target, 4);
  right.assimilate(target, 4);
  assert.equal(left.surprise, right.surprise);
  assert.ok(Number.isFinite(left.decodeResidual));
  for (let i = 0; i < left.net.w1.length; i++) assert.ok(Number.isFinite(left.net.w1[i]));
  for (let i = 0; i < left.decW.length; i++) assert.ok(Number.isFinite(left.decW[i]));

  const dumped = left.exportBrain();
  const restored = new Loop(4, 3, 4, 2, { decode: true });
  assert.equal(restored.importBrain(dumped), true);
  assert.deepEqual(Array.from(restored.decW), Array.from(left.decW));
  assert.deepEqual(Array.from(restored.decB), Array.from(left.decB));
});

test("option holds the sampled direction for a second tick and the off path samples every tick", () => {
  assert.equal(DEFAULT_LOOP_FEATURES.option, true);
  assert.equal(OPTION_SPAN, 2);

  const walk = (features?: { option: boolean }) => {
    Math.random = mulberry32(31);
    const k = new Kernel("field", 9, features);
    const actions: number[] = [];
    for (let t = 0; t < 24; t++) {
      k.step();
      actions.push(k.lastAction);
    }
    return {
      actions,
      x: k.x,
      y: k.y,
      foods: k.foods,
      lives: k.lives,
      energy: k.energy,
      surprise: k.surprise,
      w1: Array.from(k.loop.net.w1),
      w2: Array.from(k.loop.net.w2),
      held: k.optionHeld,
    };
  };
  const offA = walk({ option: false });
  const offB = walk({ option: false });
  const on = walk({ option: true });
  const shipped = walk();
  assert.deepEqual(offA, offB);
  assert.deepEqual(on, shipped);
  assert.equal(offA.held, 0);
  assert.equal(on.held, 12);
  assert.equal(on.actions[0], offA.actions[0], "the commitment tick is the same sample as the flag off");
  for (let i = 0; i < on.actions.length; i += OPTION_SPAN) {
    assert.equal(on.actions[i + 1], on.actions[i]);
  }
  assert.notDeepEqual(on.actions, offA.actions);

  Math.random = mulberry32(33);
  const held = new Kernel("field", 4, { option: true });
  held.step();
  const committed = held.lastAction;
  const branching = held.branching;
  assert.equal(held.optionHeld, 0);
  held.step();
  assert.equal(held.lastAction, committed);
  assert.equal(held.branching, branching, "a held tick does not consult the policy");
  assert.equal(held.optionHeld, 1);

  Math.random = mulberry32(32);
  const reset = new Kernel("blank", 3, { option: true });
  reset.step();
  assert.equal(reset.optionHeld, 0);
  reset.resetBrain();
  assert.equal(reset.optionHeld, 0);
  reset.step();
  assert.equal(reset.optionHeld, 0, "a new mind samples; it does not finish the old hold");
});

test("horizon-2 follow index is the first strict winner and does not change the score", () => {
  const acts = 3;
  const base = {
    acts,
    curiosity: 0,
    goal: 1,
    progressEma: 0,
    ema: 0.2,
    horizonRho: false,
    uncertainty: false,
    imagined: [new Float32Array(2), new Float32Array(2), new Float32Array(2)],
    imagined2: [new Float32Array(2), new Float32Array(2), new Float32Array(2)],
    predict: (a: number, into: Float32Array) => {
      into[0] = a;
      into[1] = 0;
      return into;
    },
    predictFrom: (pred: Float32Array, a1: number, into: Float32Array) => {
      into[0] = a1;
      into[1] = pred[0]!;
      return into;
    },
    read: () => ({ reward: 0, cost: 0, novelty: 0 }),
  };
  const score = (readPred: (pred: Float32Array, a: number) => { reward: number; cost: number; novelty: number }, follow?: Int32Array) => {
    const scores = new Float32Array(acts);
    imagineScores({
      ...base,
      imagined: [new Float32Array(2), new Float32Array(2), new Float32Array(2)],
      imagined2: [new Float32Array(2), new Float32Array(2), new Float32Array(2)],
      scores,
      readPred,
      follow,
    });
    return scores;
  };
  const winner = (pred: Float32Array) => (pred[1]! + 1) % acts;
  const readPred = (pred: Float32Array, a: number) => ({
    reward: a === winner(pred) ? 5 : 0,
    cost: 0,
    novelty: 0,
  });
  const follow = new Int32Array(acts);
  const withFollow = score(readPred, follow);
  const plain = score(readPred);
  assert.deepEqual(Array.from(withFollow), Array.from(plain));
  for (let a = 0; a < acts; a++) assert.equal(follow[a], (a + 1) % acts);

  const tied = new Int32Array(acts);
  score((_pred, a) => ({ reward: a === 0 || a === 1 ? 3 : 0, cost: 0, novelty: 0 }), tied);
  for (let a = 0; a < acts; a++) assert.equal(tied[a], 0, "a tie keeps the earlier follow-up");

  const omitted = new Int32Array(acts);
  omitted.fill(7);
  score(readPred);
  for (let a = 0; a < acts; a++) assert.equal(omitted[a], 7, "omitted buffer is not written");
});

test("rollout executes the imagined follow-up on the second tick and the off path matches the option", () => {
  assert.equal(DEFAULT_LOOP_FEATURES.rollout, false);

  const walk = (features?: { option?: boolean; rollout?: boolean }) => {
    Math.random = mulberry32(31);
    const k = new Kernel("field", 9, features);
    const actions: number[] = [];
    for (let t = 0; t < 24; t++) {
      k.step();
      actions.push(k.lastAction);
    }
    return {
      actions,
      x: k.x,
      y: k.y,
      foods: k.foods,
      lives: k.lives,
      energy: k.energy,
      surprise: k.surprise,
      w1: Array.from(k.loop.net.w1),
      w2: Array.from(k.loop.net.w2),
      held: k.optionHeld,
      switched: k.rolloutSwitched,
      follow: k.rolloutFollow,
    };
  };
  const shipped = walk();
  const explicitOff = walk({ rollout: false });
  const optionOff = walk({ option: false });
  const rolloutWithoutOption = walk({ option: false, rollout: true });
  assert.deepEqual(explicitOff, shipped);
  assert.equal(shipped.switched, 0);
  assert.equal(shipped.held, 12);
  assert.deepEqual(rolloutWithoutOption, optionOff, "rollout does nothing when the option is off");

  Math.random = mulberry32(31);
  const off = new Kernel("field", 9, { rollout: false });
  Math.random = mulberry32(31);
  const on = new Kernel("field", 9, { rollout: true });
  off.step();
  on.step();
  assert.equal(on.lastAction, off.lastAction, "the commitment tick is the same sample");
  assert.deepEqual(Array.from(on.loop.net.w1), Array.from(off.loop.net.w1));
  const committed = on.lastAction;
  const follow = on.rolloutFollow;
  const branching = on.branching;
  assert.equal(on.rolloutSwitched, 0);
  assert.equal(on.optionHeld, 0);
  on.step();
  assert.equal(on.lastAction, follow, "the second tick is the stored follow-up");
  assert.equal(on.branching, branching, "a roll-out tick does not consult the policy");
  if (follow === committed) assert.equal(on.optionHeld, 1);
  else assert.equal(on.rolloutSwitched, 1);
  off.step();
  assert.equal(off.lastAction, committed, "the option still repeats the primitive");

  let switched = 0;
  for (let seed = 1; seed <= 20; seed++) {
    Math.random = mulberry32(40 + seed);
    const k = new Kernel("field", seed, { rollout: true });
    let seen = 0;
    for (let t = 0; t < 40; t++) {
      const before = k.rolloutFollow;
      k.step();
      if (t % OPTION_SPAN === 0) {
        assert.equal(k.rolloutSwitched, seen);
      } else {
        assert.equal(k.lastAction, before);
        seen = k.rolloutSwitched;
      }
    }
    assert.equal(k.optionHeld + k.rolloutSwitched, 20);
    switched += k.rolloutSwitched;
  }
  assert.ok(switched > 0, "the follow-up was never a different action");

  Math.random = mulberry32(11);
  const random = new Kernel("field", 3, { rollout: true }, { signal: "random" });
  const actions: number[] = [];
  for (let t = 0; t < 8; t++) {
    random.step();
    actions.push(random.lastAction);
  }
  assert.equal(random.rolloutSwitched, 0, "no imagination, so the second tick repeats");
  for (let i = 0; i < actions.length; i += OPTION_SPAN) assert.equal(actions[i + 1], actions[i]);

  Math.random = mulberry32(32);
  const reset = new Kernel("blank", 3, { rollout: true });
  reset.step();
  reset.step();
  reset.resetBrain();
  assert.equal(reset.rolloutSwitched, 0);
  assert.equal(reset.optionHeld, 0);
  reset.step();
  assert.equal(reset.rolloutSwitched, 0, "a new mind samples; it does not finish the old roll-out");
});

test("revise scales the cell step from the sign of progress and the off path stays the constant", () => {
  assert.equal(DEFAULT_LOOP_FEATURES.revise, false);

  const x = new Float32Array([1, 0, 1, 0]);
  const target = new Float32Array([0, 1, 0, 1]);
  const up = 1 + 0.05;

  Math.random = mulberry32(7);
  const shipped = new Loop(4, 4, 4, 5);
  Math.random = mulberry32(7);
  const explicitOff = new Loop(4, 4, 4, 5, { revise: false });
  Math.random = mulberry32(7);
  const constructed = new Loop(4, 4, 4, 5, { revise: true });
  assert.deepEqual(Array.from(constructed.net.w1), Array.from(shipped.net.w1), "the constructor draws no extra random number");
  shipped.commit(x);
  explicitOff.commit(x);
  shipped.assimilate(target, TRANSITION_LR);
  explicitOff.assimilate(target, TRANSITION_LR);
  shipped.commit(x);
  explicitOff.commit(x);
  shipped.assimilate(target, TRANSITION_LR);
  explicitOff.assimilate(target, TRANSITION_LR);
  assert.equal(shipped.revisedLr, 0);
  assert.equal(shipped.stepGain, 1);
  assert.equal(explicitOff.revisedLr, 0);
  assert.deepEqual(Array.from(explicitOff.net.w1), Array.from(shipped.net.w1));
  assert.deepEqual(Array.from(explicitOff.net.w2), Array.from(shipped.net.w2));

  Math.random = mulberry32(7);
  const on = new Loop(4, 4, 4, 5, { revise: true });
  Math.random = mulberry32(7);
  const off = new Loop(4, 4, 4, 5, { revise: false });
  on.commit(x);
  off.commit(x);
  assert.equal(on.stepGain, 1);
  assert.equal(on.revisedLr, 0, "no training step yet, so no rate is recorded");
  on.ema = 1;
  off.ema = 1;
  on.assimilate(target, TRANSITION_LR);
  off.assimilate(target, TRANSITION_LR);
  assert.ok(on.progress > 0);
  assert.ok(on.stepGain > 1 && on.stepGain <= TRANSITION_LR);
  assert.equal(on.revisedLr, TRANSITION_LR, "the first training step is still the constant");
  assert.deepEqual(Array.from(on.net.w1), Array.from(off.net.w1));
  assert.equal(off.stepGain, 1);
  assert.equal(off.revisedLr, 0);

  const gain = on.stepGain;
  on.ema = 1;
  off.ema = 1;
  on.commit(x);
  off.commit(x);
  on.assimilate(target, TRANSITION_LR);
  off.assimilate(target, TRANSITION_LR);
  assert.ok(on.progress > 0);
  assert.ok(Math.abs(on.stepGain - Math.min(gain * up, TRANSITION_LR)) < 1e-12);
  assert.ok(on.stepGain > gain);
  let differ = false;
  for (let i = 0; i < on.net.w1.length; i++) if (on.net.w1[i] !== off.net.w1[i]) differ = true;
  assert.equal(differ, true, "the next step uses the revised gain");
  assert.ok(on.revisedLr > TRANSITION_LR);

  const shrunkFrom = on.stepGain;
  on.ema = 0;
  on.commit(x);
  on.assimilate(target, TRANSITION_LR);
  assert.ok(on.progress < 0);
  assert.ok(Math.abs(on.stepGain - Math.max(shrunkFrom / up, 1 / TRANSITION_LR)) < 1e-12);
  assert.ok(on.stepGain < shrunkFrom);

  on.stepGain = TRANSITION_LR;
  on.ema = 1;
  on.commit(x);
  on.assimilate(target, TRANSITION_LR);
  assert.equal(on.stepGain, TRANSITION_LR, "positive progress cannot leave the top of the band");
  on.stepGain = 1 / TRANSITION_LR;
  on.ema = 0;
  on.commit(x);
  on.assimilate(target, TRANSITION_LR);
  assert.equal(on.stepGain, 1 / TRANSITION_LR, "negative progress cannot leave the bottom of the band");

  const pred = new Float32Array(on.out);
  on.commit(x);
  on.net.forward(x, pred);
  let s = 0;
  for (let i = 0; i < on.out; i++) {
    const d = pred[i]! - target[i]!;
    s += d * d;
  }
  on.ema = s / on.out;
  const held = on.stepGain;
  on.assimilate(target, TRANSITION_LR);
  assert.equal(on.progress, 0);
  assert.equal(on.stepGain, held, "zero progress leaves the gain");

  const dumped = on.exportBrain();
  assert.equal(dumped.stepGain, held);
  const restored = new Loop(4, 4, 4, 5, { revise: true });
  assert.equal(restored.importBrain(dumped), true);
  assert.equal(restored.stepGain, held);
  const older = { ...dumped };
  delete older.stepGain;
  const legacy = new Loop(4, 4, 4, 5, { revise: true });
  assert.equal(legacy.importBrain(older), true);
  assert.equal(legacy.stepGain, 1, "a brain from before self-revision keeps the constant");
  const wild = { ...dumped, stepGain: 100 };
  const clipped = new Loop(4, 4, 4, 5, { revise: true });
  assert.equal(clipped.importBrain(wild), true);
  assert.equal(clipped.stepGain, TRANSITION_LR);

  Math.random = mulberry32(11);
  const kernelOff = new Kernel("field", 4, { revise: false });
  Math.random = mulberry32(11);
  const kernelDefault = new Kernel("field", 4);
  for (let t = 0; t < 16; t++) {
    kernelOff.step();
    kernelDefault.step();
  }
  assert.equal(kernelOff.loop.revisedLr, 0);
  assert.equal(kernelDefault.loop.revisedLr, 0);
  assert.deepEqual(Array.from(kernelOff.loop.net.w1), Array.from(kernelDefault.loop.net.w1));
  assert.equal(kernelOff.x, kernelDefault.x);
  assert.equal(kernelOff.y, kernelDefault.y);
  assert.equal(kernelOff.lives, kernelDefault.lives);

  Math.random = mulberry32(12);
  const kernelOn = new Kernel("field", 4, { revise: true });
  for (let t = 0; t < 8; t++) kernelOn.step();
  assert.ok(kernelOn.loop.revisedLr > 0);
  assert.ok(kernelOn.loop.stepGain !== 1, "a field episode moves the gain");
  kernelOn.resetBrain();
  assert.equal(kernelOn.loop.stepGain, 1);
  assert.equal(kernelOn.loop.revisedLr, 0, "a new mind does not keep the old rate");

  Math.random = mulberry32(20261015);
});

test("food, stream, and band claims hold under a pinned init", () => {
  Math.random = mulberry32(20261015);
  const claims = evaluateClaims();
  const byId = new Map(claims.map((claim) => [claim.id, claim]));
  for (const id of ["G2", "S1", "S2", "S3", "C1", "C2"]) {
    const claim = byId.get(id);
    assert.ok(claim, `missing ${id}`);
    assert.equal(claim.pass, true, `${id} ${claim.detail}`);
  }
});
