import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DIRS, Kernel, SIZE } from "./kernel.ts";
import { applyDrift, CANONICAL_ENV, DEFAULT_ENV_PARAMS, GRID_DIRS, senseGrid } from "./env.ts";
import { decideGate, readPreregister } from "./gate.ts";
import { g1Pass } from "./experiments.ts";
import { runMeasuredEpisode } from "./measure.ts";
import { buildProbe, probeFromJson, probeToJson, PROBE_ROLLOUT, PROBE_UNIFORM } from "./probe.ts";
import { canonicalProbePath } from "./probe-file.ts";
import { mulberry32 } from "./presets.ts";
import { RndCuriosity, signalActionBonus, type SignalView } from "./signals.ts";
import { bootstrapMeanCI, pairedDifference } from "./stats.ts";

test("probe set is fixed, has both sources, and round-trips", () => {
  const probe = buildProbe(CANONICAL_ENV.field);
  assert.equal(probe.transitions.length, PROBE_ROLLOUT + PROBE_UNIFORM);
  assert.equal(probe.transitions.filter((tr) => tr.source === "rollout").length, PROBE_ROLLOUT);
  assert.equal(probe.transitions.filter((tr) => tr.source === "uniform").length, PROBE_UNIFORM);
  const again = probeFromJson(JSON.parse(JSON.stringify(probeToJson(probe))));
  assert.equal(again.transitions.length, probe.transitions.length);
  assert.equal(again.transitions[0]!.action, probe.transitions[0]!.action);
  assert.equal(again.transitions[0]!.obs[0], probe.transitions[0]!.obs[0]);
  assert.equal(again.layoutSeed, 1000);
  assert.notEqual(buildProbe(CANONICAL_ENV.rooms).layoutSeed, probe.layoutSeed);
});

test("saved probes match the generator", () => {
  for (const kind of ["field", "rooms"] as const) {
    const disk = JSON.parse(readFileSync(canonicalProbePath(kind), "utf8"));
    const fresh = JSON.parse(JSON.stringify(probeToJson(buildProbe(CANONICAL_ENV[kind]))));
    assert.deepEqual(disk, fresh);
  }
});

test("grid sense matches the kernel window", () => {
  Math.random = mulberry32(9);
  const k = new Kernel("field", 4, undefined, { env: CANONICAL_ENV.field });
  const into = new Float32Array(k.sense().length);
  senseGrid(k.cells, k.scent, k.x, k.y, SIZE, 2, into);
  assert.deepEqual(Array.from(into), Array.from(k.sense()));
  assert.deepEqual(
    GRID_DIRS.map((d) => [d.x, d.y]),
    DIRS.map((d) => [d.x, d.y]),
  );
});

test("frozen probe eval does not move weights", () => {
  Math.random = mulberry32(11);
  const k = new Kernel("field", 5, undefined, { env: CANONICAL_ENV.field });
  for (let i = 0; i < 4; i++) k.step();
  const before = k.loop.net.exportWeights();
  const err = k.frozenProbeError(buildProbe(CANONICAL_ENV.field));
  const after = k.loop.net.exportWeights();
  assert.ok(Number.isFinite(err));
  assert.deepEqual(after, before);
});

test("RND target stays frozen while the predictor steps", () => {
  const rnd = new RndCuriosity(3, 6);
  const target = Array.from(rnd.targetW);
  const before = Array.from(rnd.predW);
  const x = Float32Array.from([0.2, 0.4, 0.6, 0.8, 0.1, 0.3]);
  rnd.train(x);
  assert.deepEqual(Array.from(rnd.targetW), target);
  assert.notDeepEqual(Array.from(rnd.predW), before);
});

test("count bonus is 1/sqrt(n+1) and falls as the cell is visited", () => {
  const counts = new Uint32Array([0, 0, 3]);
  const view = { counts, destGrid: (action: number) => action } as SignalView;
  const fresh = signalActionBonus("count", view, 1, new Float32Array());
  const seen = signalActionBonus("count", view, 2, new Float32Array());
  assert.equal(fresh, 1);
  assert.ok(Math.abs(seen - 1 / Math.sqrt(4)) < 1e-9);
  assert.ok(seen < fresh);
});

test("drift rate above zero is refused and zero is a no-op", () => {
  const cells = new Uint8Array([0, 1, 2, 0]);
  applyDrift(cells, DEFAULT_ENV_PARAMS, () => 0);
  assert.equal(cells[1], 1);
  assert.throws(() => applyDrift(cells, { ...DEFAULT_ENV_PARAMS, driftRate: 0.1 }, () => 0));
});

test("G1 thresholds are unchanged and apply to probe numbers", () => {
  assert.equal(g1Pass(0.2, 0.16), true);
  assert.equal(g1Pass(0.2, 0.18), false);
  assert.equal(g1Pass(0.2, 0.13), true);
  assert.equal(g1Pass(0.1, 0.14), false);
});

test("bootstrap CI excludes zero for a real paired shift and includes it for a tie", () => {
  const off = Array.from({ length: 20 }, () => 0.3);
  const on = Array.from({ length: 20 }, () => 0.1);
  const shift = pairedDifference(off, on, 1);
  assert.ok(shift.lo > 0);
  assert.equal(shift.excludesZero, true);
  const tie = pairedDifference(off, off, 1);
  assert.equal(tie.excludesZero, false);
  const ci = bootstrapMeanCI(off, 200, 0.05, 2);
  assert.ok(Math.abs(ci.mean - 0.3) < 1e-9);
  assert.ok(Math.abs(ci.lo - ci.mean) < 1e-9 && Math.abs(ci.hi - ci.mean) < 1e-9);
});

test("gate passes only when the probe CI clears and claims do not regress", () => {
  const n = 20;
  const pass = decideGate({
    probeOff: Array.from({ length: n }, () => 0.3),
    probeOn: Array.from({ length: n }, () => 0.1),
    g2Off: Array.from({ length: n }, () => true),
    g2On: Array.from({ length: n }, () => true),
    c2Off: Array.from({ length: n }, () => true),
    c2On: Array.from({ length: n }, () => true),
    livesOff: Array.from({ length: n }, () => 0),
    livesOn: Array.from({ length: n }, () => 0),
  });
  assert.equal(pass.pass, true);
  const flat = decideGate({
    ...{
      probeOff: Array.from({ length: n }, () => 0.2),
      probeOn: Array.from({ length: n }, () => 0.2),
      g2Off: Array.from({ length: n }, () => true),
      g2On: Array.from({ length: n }, () => true),
      c2Off: Array.from({ length: n }, () => true),
      c2On: Array.from({ length: n }, () => true),
      livesOff: Array.from({ length: n }, () => 0),
      livesOn: Array.from({ length: n }, () => 0),
    },
  });
  assert.equal(flat.pass, false);
  const short = decideGate({
    probeOff: [0.3],
    probeOn: [0.1],
    g2Off: [true],
    g2On: [true],
    c2Off: [true],
    c2On: [true],
    livesOff: [0],
    livesOn: [0],
  });
  assert.equal(short.pass, false);
});

test("preregister parser requires hypothesis and threshold", () => {
  const journal = `# Journal

### Preregister encoderMix

- hypothesis: the mix lowers probe error
- metric: probeLate
- direction: lower
- threshold: paired CI of (off - on) lies above zero
`;
  const found = readPreregister(journal, "encoderMix");
  assert.ok(found);
  assert.equal(found.metric, "probeLate");
  assert.match(found.hypothesis, /probe error/);
  assert.equal(readPreregister(journal, "wake"), null);
});

function readCommit(input: Float32Array | null, n: number) {
  assert.ok(input);
  return Array.from(input.subarray(0, n));
}

test("transition commits the window from before the move", () => {
  Math.random = mulberry32(8);
  const k = new Kernel("blank", 1, { transition: true }, { signal: "random" });
  k.cells.fill(0);
  for (let i = 0; i < SIZE; i++) {
    k.cells[i] = 1;
    k.cells[(SIZE - 1) * SIZE + i] = 1;
    k.cells[i * SIZE] = 1;
    k.cells[i * SIZE + SIZE - 1] = 1;
  }
  k.x = 7;
  k.y = 7;
  k.loop.prevInput = null;
  let moved = false;
  for (let t = 0; t < 12; t++) {
    const before = Array.from(k.sense());
    const x = k.x;
    const y = k.y;
    k.step();
    const committed = readCommit(k.loop.prevInput, before.length);
    assert.deepEqual(committed, before);
    if (k.x !== x || k.y !== y) {
      assert.notDeepEqual(committed, Array.from(k.sense()));
      moved = true;
      break;
    }
  }
  assert.equal(moved, true);

  Math.random = mulberry32(8);
  const copy = new Kernel("blank", 1, { transition: false }, { signal: "random" });
  copy.cells.fill(0);
  for (let i = 0; i < SIZE; i++) {
    copy.cells[i] = 1;
    copy.cells[(SIZE - 1) * SIZE + i] = 1;
    copy.cells[i * SIZE] = 1;
    copy.cells[i * SIZE + SIZE - 1] = 1;
  }
  copy.x = 7;
  copy.y = 7;
  let copyMoved = false;
  for (let t = 0; t < 12; t++) {
    const before = Array.from(copy.sense());
    copy.step();
    const after = Array.from(copy.sense());
    const stored = readCommit(copy.loop.prevInput, before.length);
    assert.deepEqual(stored, after);
    if (before.join() !== after.join()) {
      copyMoved = true;
      break;
    }
  }
  assert.equal(copyMoved, true);
});

test("a two-step episode reports a finite probe and coverage", () => {
  Math.random = mulberry32(21);
  const row = runMeasuredEpisode(
    { id: 1, env: "field", seed: 1, steps: 2, signal: "random" },
    buildProbe(CANONICAL_ENV.field),
  );
  assert.ok(Number.isFinite(row.probeLate));
  assert.ok(row.distinctCells >= 1);
  assert.equal(row.signal, "random");
  assert.ok(row.foods >= 0);
});
