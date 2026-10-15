/**
 * Probe-floor diagnosis. Not a gate. Prints the trivial baselines, an
 * offline upper bound of this MLP, and online learning curves.
 *
 *   node --experimental-transform-types --disable-warning=ExperimentalWarning scripts/diagnose-probe.ts
 */
import { MLP } from "../src/lib/kernel/mlp.ts";
import { Loop } from "../src/lib/kernel/loop.ts";
import { Kernel, ACTS, CH, HIDDEN, IN, OBS, OUT, SIZE } from "../src/lib/kernel/kernel.ts";
import { makeBody, senseGrid, stepGrid, CANONICAL_ENV } from "../src/lib/kernel/env.ts";
import { buildProbe, type ProbeSet } from "../src/lib/kernel/probe.ts";
import { mulberry32 } from "../src/lib/kernel/presets.ts";

const VIEW = 5;
const R = 2;
const MOVES = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: 0 },
];

function cellIndex(dx: number, dy: number, ch: number) {
  return ((dy + R) * VIEW + (dx + R)) * CH + ch;
}

function scoredMse(pred: ArrayLike<number>, target: ArrayLike<number>) {
  let sum = 0;
  let n = 0;
  let wall = 0;
  let wallN = 0;
  let food = 0;
  let foodN = 0;
  for (let i = 0; i < OBS; i++) {
    if (i % CH === 2) continue;
    const d = pred[i]! - target[i]!;
    const e = d * d;
    sum += e;
    n += 1;
    if (i % CH === 0) {
      wall += e;
      wallN += 1;
    } else {
      food += e;
      foodN += 1;
    }
  }
  return { all: n ? sum / n : 0, wall: wallN ? wall / wallN : 0, food: foodN ? food / foodN : 0 };
}

function scoreConstant(probe: ProbeSet, value: number) {
  const pred = new Float32Array(OBS);
  pred.fill(value);
  let sum = 0;
  let wall = 0;
  let food = 0;
  let n = 0;
  let wn = 0;
  let fn = 0;
  for (const tr of probe.transitions) {
    const m = scoredMse(pred, tr.nextObs);
    sum += m.all;
    wall += m.wall;
    food += m.food;
    n += 1;
    wn += 1;
    fn += 1;
  }
  return { all: sum / n, wall: wall / wn, food: food / fn };
}

function scoreMean(probe: ProbeSet) {
  const acc = new Float64Array(OBS);
  for (const tr of probe.transitions) {
    for (let i = 0; i < OBS; i++) acc[i] += tr.nextObs[i]!;
  }
  const pred = new Float32Array(OBS);
  for (let i = 0; i < OBS; i++) pred[i] = acc[i]! / probe.transitions.length;
  let all = 0;
  let wall = 0;
  let food = 0;
  for (const tr of probe.transitions) {
    const m = scoredMse(pred, tr.nextObs);
    all += m.all;
    wall += m.wall;
    food += m.food;
  }
  const n = probe.transitions.length;
  let wallP = 0;
  let foodP = 0;
  let wn = 0;
  let fn = 0;
  for (let i = 0; i < OBS; i++) {
    if (i % CH === 2) continue;
    if (i % CH === 0) {
      wallP += pred[i]!;
      wn += 1;
    } else {
      foodP += pred[i]!;
      fn += 1;
    }
  }
  return {
    all: all / n,
    wall: wall / n,
    food: food / n,
    wallMean: wallP / wn,
    foodMean: foodP / fn,
  };
}

function scoreIdentity(probe: ProbeSet) {
  let all = 0;
  let wall = 0;
  let food = 0;
  for (const tr of probe.transitions) {
    const m = scoredMse(tr.obs, tr.nextObs);
    all += m.all;
    wall += m.wall;
    food += m.food;
  }
  const n = probe.transitions.length;
  return { all: all / n, wall: wall / n, food: food / n };
}

/** Shift the visible window. Unseen strip uses the probe marginal. Food under the agent is consumed. */
function scoreShiftOracle(probe: ProbeSet) {
  const means = scoreMean(probe);
  const marginal = [means.wallMean, means.foodMean];
  const into = new Float32Array(OBS);
  let all = 0;
  let wall = 0;
  let food = 0;
  let overlap = 0;
  let overlapN = 0;
  let edge = 0;
  let edgeN = 0;
  for (const tr of probe.transitions) {
    const move = MOVES[tr.action] ?? MOVES[4]!;
    into.fill(0);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const sx = dx + move.x;
        const sy = dy + move.y;
        const seen = sx >= -R && sx <= R && sy >= -R && sy <= R;
        for (let ch = 0; ch < 2; ch++) {
          const dest = cellIndex(dx, dy, ch);
          let v: number;
          if (seen) {
            v = tr.obs[cellIndex(sx, sy, ch)]!;
            if (ch === 1 && dx === 0 && dy === 0 && (move.x !== 0 || move.y !== 0)) v = 0;
          } else {
            v = marginal[ch]!;
          }
          into[dest] = v;
          const e = (v - tr.nextObs[dest]!) ** 2;
          if (seen) {
            overlap += e;
            overlapN += 1;
          } else {
            edge += e;
            edgeN += 1;
          }
        }
      }
    }
    const m = scoredMse(into, tr.nextObs);
    all += m.all;
    wall += m.wall;
    food += m.food;
  }
  const n = probe.transitions.length;
  return {
    all: all / n,
    wall: wall / n,
    food: food / n,
    overlap: overlapN ? overlap / overlapN : 0,
    edge: edgeN ? edge / edgeN : 0,
    edgeFrac: edgeN / (overlapN + edgeN),
  };
}

function encode(obs: ArrayLike<number>, action: number, energy = 100) {
  const x = new Float32Array(IN);
  for (let i = 0; i < OBS; i++) x[i] = obs[i]!;
  x[OBS + action] = 1;
  x[OBS + ACTS] = Math.min(1, energy / 100);
  return x;
}

function trainTarget(pred: Float32Array, next: ArrayLike<number>) {
  const t = new Float32Array(OUT);
  for (let i = 0; i < OBS; i++) t[i] = i % CH === 2 ? pred[i]! : next[i]!;
  return t;
}

function scoreNet(net: MLP, probe: ProbeSet) {
  const into = new Float32Array(OUT);
  let all = 0;
  let wall = 0;
  let food = 0;
  for (const tr of probe.transitions) {
    net.forward(encode(tr.obs, tr.action), into);
    const m = scoredMse(into, tr.nextObs);
    all += m.all;
    wall += m.wall;
    food += m.food;
  }
  const n = probe.transitions.length;
  return { all: all / n, wall: wall / n, food: food / n };
}

function freshNet(seed: number) {
  const prev = Math.random;
  Math.random = mulberry32(seed >>> 0);
  const net = new MLP(IN, HIDDEN, OUT);
  Math.random = prev;
  return net;
}

type Sample = { obs: Float32Array; action: number; next: Float32Array; energy: number };

function takeUniform(kind: "field" | "rooms", n: number, seed: number): Sample[] {
  const spec = CANONICAL_ENV[kind];
  const rand = mulberry32(seed);
  const origin = makeBody(spec.kind, SIZE, spec.layoutSeed, mulberry32(spec.layoutSeed));
  const out: Sample[] = [];
  for (let i = 0; i < n; i++) {
    const body = makeBody(spec.kind, SIZE, spec.layoutSeed, rand);
    body.cells = origin.cells.slice();
    body.scent.fill(0);
    const action = (rand() * ACTS) | 0;
    const obs = senseGrid(body.cells, body.scent, body.x, body.y, SIZE, R, new Float32Array(OBS));
    const energy = body.energy;
    stepGrid(body, spec.kind, action, SIZE, rand, spec.params);
    const next = senseGrid(body.cells, body.scent, body.x, body.y, SIZE, R, new Float32Array(OBS));
    out.push({ obs, action, next, energy });
  }
  return out;
}

function takeWalk(kind: "field" | "rooms", n: number, seed: number): Sample[] {
  const spec = CANONICAL_ENV[kind];
  const rand = mulberry32(seed);
  const body = makeBody(spec.kind, SIZE, spec.layoutSeed, rand);
  const out: Sample[] = [];
  for (let i = 0; i < n; i++) {
    const action = (rand() * ACTS) | 0;
    const obs = senseGrid(body.cells, body.scent, body.x, body.y, SIZE, R, new Float32Array(OBS));
    const energy = body.energy;
    stepGrid(body, spec.kind, action, SIZE, rand, spec.params);
    const next = senseGrid(body.cells, body.scent, body.x, body.y, SIZE, R, new Float32Array(OBS));
    out.push({ obs, action, next, energy });
  }
  return out;
}

function offline(samples: Sample[], probe: ProbeSet, lr: number, seed: number, epochs = 1) {
  const net = freshNet(seed);
  const curve: { step: number; probe: number }[] = [];
  const into = new Float32Array(OUT);
  let step = 0;
  for (let ep = 0; ep < epochs; ep++) {
    for (const s of samples) {
      const x = encode(s.obs, s.action, s.energy);
      net.forward(x, into);
      net.train(x, trainTarget(into, s.next), lr);
      step += 1;
      if (step === 40 || step === 280 || step === 1000 || step % 4000 === 0 || step === samples.length * epochs) {
        curve.push({ step, probe: scoreNet(net, probe).all });
      }
    }
  }
  return { final: scoreNet(net, probe), curve, energy: net.weightEnergy() };
}

function onlineKernel(kind: "field" | "rooms", steps: number, lr: number, seed: number) {
  const prev = Math.random;
  Math.random = mulberry32(seed * 10007);
  const spec = CANONICAL_ENV[kind];
  const probe = buildProbe(spec);
  const k = new Kernel(kind, seed, undefined, { signal: "random", env: spec });
  k.params.lr = lr;
  const curve: { step: number; probe: number; ema: number }[] = [];
  for (let t = 1; t <= steps; t++) {
    k.step();
    if (t === 40 || t === 280 || t === steps || (t % 400 === 0 && t < steps)) {
      curve.push({ step: t, probe: k.frozenProbeError(probe), ema: k.ema });
    }
  }
  Math.random = prev;
  return { curve, foods: k.foods, lives: k.lives, energy: k.loop.weightEnergy };
}

/** Same body as Kernel.step, but the committed input is the pre-move window. */
function onlineTransition(kind: "field" | "rooms", steps: number, lr: number, seed: number) {
  const prev = Math.random;
  Math.random = mulberry32(seed * 10007);
  const spec = CANONICAL_ENV[kind];
  const probe = buildProbe(spec);
  const rand = mulberry32(seed);
  const body = makeBody(spec.kind, SIZE, spec.layoutSeed, rand);
  const loop = new Loop(IN, HIDDEN, OUT, ACTS);
  const obs0 = senseGrid(body.cells, body.scent, body.x, body.y, SIZE, R, new Float32Array(OBS));
  loop.commit(encode(obs0, 4, body.energy));
  const curve: { step: number; probe: number; ema: number }[] = [];
  const into = new Float32Array(OUT);
  for (let t = 1; t <= steps; t++) {
    const action = (rand() * ACTS) | 0;
    const obs = senseGrid(body.cells, body.scent, body.x, body.y, SIZE, R, new Float32Array(OBS));
    const energy = body.energy;
    loop.commit(encode(obs, action, energy));
    stepGrid(body, spec.kind, action, SIZE, rand, spec.params);
    const next = senseGrid(body.cells, body.scent, body.x, body.y, SIZE, R, new Float32Array(OBS));
    loop.assimilate(next, lr);
    if (t === 40 || t === 280 || t === 1000 || t === steps || (steps > 2000 && t % 2000 === 0)) {
      let sum = 0;
      let n = 0;
      for (const tr of probe.transitions) {
        loop.imagine(encode(tr.obs, tr.action), into);
        for (let i = 0; i < OBS; i++) {
          if (i % CH === 2) continue;
          const d = into[i]! - tr.nextObs[i]!;
          sum += d * d;
          n += 1;
        }
      }
      curve.push({ step: t, probe: n ? sum / n : 0, ema: loop.ema });
    }
  }
  Math.random = prev;
  return { curve, energy: loop.weightEnergy };
}

function main() {
  const report: Record<string, unknown> = {};
  for (const kind of ["field", "rooms"] as const) {
    const probe = buildProbe(CANONICAL_ENV[kind]);
    const t0 = Date.now();
    const uniform = takeUniform(kind, 8000, 7);
    const walk = takeWalk(kind, 280, 7);
    const walkLong = takeWalk(kind, 4000, 7);
    report[kind] = {
      constantHalf: scoreConstant(probe, 0.5),
      constantZero: scoreConstant(probe, 0),
      predictMean: scoreMean(probe),
      identity: scoreIdentity(probe),
      shiftOracle: scoreShiftOracle(probe),
      untrained: scoreNet(freshNet(1), probe),
      offlineUniformLr0035: offline(uniform, probe, 0.035, 1),
      offlineUniformLr035: offline(uniform, probe, 0.35, 1),
      offlineUniformLr1: offline(uniform, probe, 1, 1),
      offlineUniformLr2: offline(uniform, probe, 2, 1),
      offlineWalk280Lr1: offline(walk, probe, 1, 1, 8),
      offlineWalk4000Lr1: offline(walkLong, probe, 1, 1),
      ms: Date.now() - t0,
    };
    console.error(kind, "baselines done", Date.now() - t0, "ms");
  }
  console.error("online curves");
  report.online = {
    kernel280: onlineKernel("field", 280, 0.035, 1),
    kernel2000: onlineKernel("field", 2000, 0.035, 1),
    kernel280Lr1: onlineKernel("field", 280, 1, 1),
    transition280Lr0035: onlineTransition("field", 280, 0.035, 1),
    transition280Lr035: onlineTransition("field", 280, 0.35, 1),
    transition280Lr1: onlineTransition("field", 280, 1, 1),
    transition280Lr2: onlineTransition("field", 280, 2, 1),
    transition2000Lr1: onlineTransition("field", 2000, 1, 1),
    transition8000Lr1: onlineTransition("field", 8000, 1, 1),
  };
  console.log(JSON.stringify(report, null, 2));
}

main();
