/**
 * Preregistered instrument check. See JOURNAL.md "Preregister instrument".
 *
 *   node --experimental-transform-types --disable-warning=ExperimentalWarning scripts/instrument.ts
 *
 * Writes bench/instrument.json. Count versus random is the sweep's job;
 * this file is the floor table and the uniform-versus-walk comparison.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { MLP } from "../src/lib/kernel/mlp.ts";
import { Kernel, ACTS, CH, HIDDEN, IN, OBS, OUT, SIZE } from "../src/lib/kernel/kernel.ts";
import { CANONICAL_ENV, makeBody, senseGrid, stepGrid } from "../src/lib/kernel/env.ts";
import { buildProbe, type ProbeSet } from "../src/lib/kernel/probe.ts";
import { mulberry32 } from "../src/lib/kernel/presets.ts";
import { TRANSITION_LR } from "../src/lib/kernel/loop.ts";
import { pairedDifference } from "../src/lib/kernel/stats.ts";

const VIEW_R = 2;
const UNIFORM_STEPS = 4000;
const WALK_STEPS = 280;
const SEEDS = 20;

function scored(pred: ArrayLike<number>, target: ArrayLike<number>) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < OBS; i++) {
    if (i % CH === 2) continue;
    const d = pred[i]! - target[i]!;
    sum += d * d;
    n += 1;
  }
  return n ? sum / n : 0;
}

function meanScore(probe: ProbeSet, predict: (obs: Float32Array, action: number, into: Float32Array) => void) {
  const into = new Float32Array(OBS);
  let sum = 0;
  for (const tr of probe.transitions) {
    predict(tr.obs, tr.action, into);
    sum += scored(into, tr.nextObs);
  }
  return sum / probe.transitions.length;
}

function floors(kind: "field" | "rooms") {
  const probe = buildProbe(CANONICAL_ENV[kind]);
  const half = meanScore(probe, (_o, _a, into) => into.fill(0.5));
  const zero = meanScore(probe, (_o, _a, into) => into.fill(0));
  const acc = new Float64Array(OBS);
  for (const tr of probe.transitions) for (let i = 0; i < OBS; i++) acc[i] += tr.nextObs[i]!;
  const meanPred = new Float32Array(OBS);
  for (let i = 0; i < OBS; i++) meanPred[i] = acc[i]! / probe.transitions.length;
  const mean = meanScore(probe, (_o, _a, into) => into.set(meanPred));
  const identity = meanScore(probe, (obs, _a, into) => into.set(obs));
  const prev = Math.random;
  Math.random = mulberry32(1);
  const net = new MLP(IN, HIDDEN, OUT);
  Math.random = prev;
  const untrained = meanScore(probe, (obs, action, into) => {
    const x = new Float32Array(IN);
    x.set(obs);
    x[OBS + action] = 1;
    x[OBS + ACTS] = 1;
    net.forward(x, into);
  });
  return { half, zero, mean, identity, untrained };
}

type Sample = { obs: Float32Array; action: number; next: Float32Array; energy: number };

function uniformSamples(n: number, seed: number): Sample[] {
  const spec = CANONICAL_ENV.field;
  const rand = mulberry32(seed);
  const origin = makeBody(spec.kind, SIZE, spec.layoutSeed, mulberry32(spec.layoutSeed));
  const out: Sample[] = [];
  for (let i = 0; i < n; i++) {
    const body = makeBody(spec.kind, SIZE, spec.layoutSeed, rand);
    body.cells = origin.cells.slice();
    body.scent.fill(0);
    const action = (rand() * ACTS) | 0;
    const obs = senseGrid(body.cells, body.scent, body.x, body.y, SIZE, VIEW_R, new Float32Array(OBS));
    const energy = body.energy;
    stepGrid(body, spec.kind, action, SIZE, rand, spec.params);
    const next = senseGrid(body.cells, body.scent, body.x, body.y, SIZE, VIEW_R, new Float32Array(OBS));
    out.push({ obs, action, next, energy });
  }
  return out;
}

function walkSamples(n: number, seed: number): Sample[] {
  const spec = CANONICAL_ENV.field;
  const rand = mulberry32(0x5a17 + seed);
  const body = makeBody(spec.kind, SIZE, spec.layoutSeed, rand);
  const out: Sample[] = [];
  for (let i = 0; i < n; i++) {
    const action = (rand() * ACTS) | 0;
    const obs = senseGrid(body.cells, body.scent, body.x, body.y, SIZE, VIEW_R, new Float32Array(OBS));
    const energy = body.energy;
    stepGrid(body, spec.kind, action, SIZE, rand, spec.params);
    const next = senseGrid(body.cells, body.scent, body.x, body.y, SIZE, VIEW_R, new Float32Array(OBS));
    out.push({ obs, action, next, energy });
  }
  return out;
}

function trainOffline(samples: Sample[], seed: number, probe: ProbeSet) {
  const prev = Math.random;
  Math.random = mulberry32(seed >>> 0);
  const net = new MLP(IN, HIDDEN, OUT);
  Math.random = prev;
  const into = new Float32Array(OUT);
  for (const s of samples) {
    const x = new Float32Array(IN);
    for (let i = 0; i < OBS; i++) x[i] = s.obs[i]!;
    x[OBS + s.action] = 1;
    x[OBS + ACTS] = Math.min(1, s.energy / 100);
    net.forward(x, into);
    const target = into.slice();
    for (let i = 0; i < OBS; i++) if (i % CH !== 2) target[i] = s.next[i]!;
    net.train(x, target, TRANSITION_LR);
  }
  return meanScore(probe, (obs, action, dest) => {
    const x = new Float32Array(IN);
    x.set(obs);
    x[OBS + action] = 1;
    x[OBS + ACTS] = 1;
    net.forward(x, dest);
  });
}

function main() {
  const probe = buildProbe(CANONICAL_ENV.field);
  const walk: number[] = [];
  const uniform: number[] = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    walk.push(trainOffline(walkSamples(WALK_STEPS, seed), seed, probe));
    uniform.push(trainOffline(uniformSamples(UNIFORM_STEPS, seed), seed, probe));
    console.error(`seed ${seed} walk ${walk[walk.length - 1]!.toFixed(4)} uniform ${uniform[uniform.length - 1]!.toFixed(4)}`);
  }
  const paired = pairedDifference(walk, uniform, 9);
  const report = {
    preregister: "instrument",
    field: floors("field"),
    rooms: floors("rooms"),
    uniformSteps: UNIFORM_STEPS,
    walkSteps: WALK_STEPS,
    lr: TRANSITION_LR,
    seeds: SEEDS,
    walk,
    uniform,
    walkMinusUniform: paired,
    pass: paired.lo > 0,
  };
  mkdirSync("bench", { recursive: true });
  writeFileSync("bench/instrument.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ pass: report.pass, walkMinusUniform: paired }, null, 2));
  if (!report.pass) process.exit(1);
}

main();
