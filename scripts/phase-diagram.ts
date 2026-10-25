/**
 * Where rho's occupancy fails against the baselines.
 * Not part of CI.
 *
 *   npm run phase-diagram
 *
 * One instrument: matched control rooms, temperature 0.15, 400 steps,
 * seeds 1–200, stream seed * 10007 + 18101. Axes are stationary noise,
 * drift around τ, and forgetting around τ. Writes bench/phase-diagram/.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { greaterCall } from "../src/lib/kernel/noise.ts";
import { runPhaseEpisode, type PhaseJob, type PhaseResult } from "../src/lib/kernel/phase-diagram-run.ts";
import {
  PHASE_AXES,
  PHASE_DOSE,
  PHASE_EXPLORERS,
  PHASE_STEPS,
  PHASE_STREAM,
  PHASE_TEMPERATURE,
  LOCKED_DRIFT_TAU,
  baselineContrast,
  baselineSalt,
  excessSalt,
  explorerIndex,
  instrumentDelta,
  notAttractedCall,
  phaseCells,
  phaseCellClass,
  phaseDriftLevels,
  phaseForgetLevels,
  phaseKey,
  positiveBaselineSalt,
  positiveSalt,
  positiveSpecs,
  type CellDef,
  type PhaseAxis,
  type PhaseClass,
  type PhaseExplorer,
  type PhaseSpec,
} from "../src/lib/kernel/phase-diagram.ts";
import { pairedDifference, type Interval } from "../src/lib/kernel/stats.ts";
import { drawText, fillRect, writePng } from "./png.ts";
import { runPool, workerCount } from "./pool.ts";

const SEEDS = 200;
const OUT = "bench/phase-diagram";

type RGB = [number, number, number];

type Stored = {
  mean: number;
  lo: number;
  hi: number;
  n: number;
};

type CellRow = {
  axis: PhaseAxis;
  level: number;
  label: string;
  value: number;
  primary: boolean;
  confounded: boolean;
  explorers: Record<
    PhaseExplorer,
    Stored & { class: PhaseClass | null }
  >;
  baselines: Record<
    Exclude<PhaseExplorer, "rho">,
    Stored & { contrast: ReturnType<typeof baselineContrast> }
  >;
};

function fmt(ci: Stored) {
  const sign = (value: number) => {
    const text = value.toFixed(4);
    return value < 0 ? text.replace("-", "−") : text;
  };
  return `${sign(ci.mean)} [${sign(ci.lo)}, ${sign(ci.hi)}]`;
}

function resultKey(signal: string, seed: number, spec: PhaseSpec) {
  return `${signal}|${seed}|${phaseKey(spec)}`;
}

function buildJobs() {
  const jobs: PhaseJob[] = [];
  const seen = new Set<string>();
  const add = (seed: number, signal: PhaseExplorer, spec: PhaseSpec) => {
    const key = resultKey(signal, seed, spec);
    if (seen.has(key)) return;
    seen.add(key);
    jobs.push({ id: jobs.length, seed, signal, spec });
  };
  for (const cell of phaseCells()) {
    for (const signal of PHASE_EXPLORERS) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        add(seed, signal, cell.target);
        add(seed, signal, cell.control);
      }
    }
  }
  const positive = positiveSpecs();
  for (const signal of PHASE_EXPLORERS) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      add(seed, signal, positive.target);
      add(seed, signal, positive.control);
    }
  }
  return jobs;
}

function requireRow(byKey: Map<string, PhaseResult>, signal: string, seed: number, spec: PhaseSpec) {
  const row = byKey.get(resultKey(signal, seed, spec));
  if (!row) throw new Error(`missing episode ${signal} seed ${seed} ${phaseKey(spec)}`);
  return row;
}

function series(byKey: Map<string, PhaseResult>, signal: string, spec: PhaseSpec) {
  const out: number[] = [];
  for (let seed = 1; seed <= SEEDS; seed++) out.push(requireRow(byKey, signal, seed, spec).frac);
  return out;
}

function assertWalk(byKey: Map<string, PhaseResult>, label: string, target: PhaseSpec, control: PhaseSpec) {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const a = requireRow(byKey, "random", seed, target);
    const b = requireRow(byKey, "random", seed, control);
    if (a.frac !== b.frac || a.foods !== b.foods || a.lives !== b.lives) {
      throw new Error(
        `random walk diverged on ${label} seed ${seed}: frac ${a.frac} vs ${b.frac}, foods ${a.foods} vs ${b.foods}, lives ${a.lives} vs ${b.lives}`,
      );
    }
  }
}

function assertLevelZero(byKey: Map<string, PhaseResult>, cell: CellDef) {
  for (const signal of PHASE_EXPLORERS) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const a = requireRow(byKey, signal, seed, cell.target);
      const b = requireRow(byKey, signal, seed, cell.control);
      if (a.frac !== b.frac || a.foods !== b.foods || a.lives !== b.lives) {
        throw new Error(
          `level 0 is not one episode on ${cell.axis} ${signal} seed ${seed}: frac ${a.frac} vs ${b.frac}`,
        );
      }
    }
  }
}

function store(diff: Interval): Stored {
  return { mean: diff.mean, lo: diff.lo, hi: diff.hi, n: diff.n };
}

type Point = {
  axis: PhaseAxis | "bonus";
  level: number;
  explorer: PhaseExplorer;
  mean: number;
  lo: number;
  hi: number;
  phaseClass: PhaseClass | null;
};

/** Diverging fill. Saturates at ±0.06. A CI that includes 0 is faded toward white. */
function colorFor(mean: number, lo: number, hi: number): RGB {
  const clamp = 0.06;
  const t = Math.max(-1, Math.min(1, mean / clamp));
  const solid = lo > 0 || hi < 0;
  const strength = Math.abs(t) * (solid ? 1 : 0.38);
  if (t > 0) {
    return [
      Math.round(255 - strength * 40),
      Math.round(255 - strength * 175),
      Math.round(255 - strength * 175),
    ];
  }
  if (t < 0) {
    return [
      Math.round(255 - strength * 190),
      Math.round(255 - strength * 145),
      Math.round(255 - strength * 55),
    ];
  }
  return [246, 246, 246];
}

function drawDiagram(points: Point[], delta: number | null) {
  const width = 1540;
  const height = 470;
  const rgba = new Uint8Array(width * height * 4);
  rgba.fill(255);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  drawText(rgba, width, 12, 10, "Occupancy contrast, target room minus matched control", [20, 20, 20]);
  const deltaText =
    delta == null ? "detection threshold unavailable" : `detection threshold ${delta.toFixed(4)}`;
  drawText(rgba, width, 620, 10, deltaText, [40, 40, 40]);
  drawText(rgba, width, 12, 26, "Color saturates at plus or minus 0.06. Pale cells have a CI that includes 0.", [60, 60, 60]);

  const groups: Array<{ name: string; levels: string[]; axis: PhaseAxis | "bonus" }> = [
    { name: "noise", levels: ["0", "1/3", "2/3", "1"], axis: "noise" },
    { name: "drift", levels: ["0", "below", "at", "above"], axis: "drift" },
    { name: "forget", levels: ["0", "slow", "at", "fast"], axis: "forget" },
    { name: "bonus", levels: ["0.0085"], axis: "bonus" },
  ];
  const cellW = 108;
  const cellH = 64;
  const labelW = 72;
  const left = 12 + labelW;
  const top = 58;
  let x = left;
  const columns: Array<{ x: number; axis: PhaseAxis | "bonus"; level: number; label: string }> = [];
  for (const group of groups) {
    drawText(rgba, width, x + 4, 40, group.name, [20, 20, 20]);
    group.levels.forEach((label, level) => {
      columns.push({ x, axis: group.axis, level, label });
      drawText(rgba, width, x + 4, 50, label, [50, 50, 50]);
      x += cellW;
    });
    x += 14;
  }
  PHASE_EXPLORERS.forEach((explorer, row) => {
    const y = top + row * cellH;
    drawText(rgba, width, 12, y + 24, explorer, [20, 20, 20]);
    for (const column of columns) {
      const point = points.find(
        (item) => item.axis === column.axis && item.level === column.level && item.explorer === explorer,
      );
      if (!point) continue;
      const rgb = colorFor(point.mean, point.lo, point.hi);
      fillRect(rgba, width, column.x, y, cellW - 4, cellH - 4, rgb);
      const excludes = point.lo > 0 || point.hi < 0;
      if (excludes) fillRect(rgba, width, column.x, y, cellW - 4, 3, [20, 20, 20]);
      const ink: RGB = [25, 25, 25];
      drawText(rgba, width, column.x + 4, y + 8, point.mean.toFixed(4), ink);
      drawText(rgba, width, column.x + 4, y + 20, `[${point.lo.toFixed(3)},${point.hi.toFixed(3)}]`, ink);
      if (explorer === "rho" && point.phaseClass) {
        const tag =
          point.phaseClass === "null-with-sensitivity" ? "null" : point.phaseClass === "inconclusive" ? "inconcl" : point.phaseClass.slice(0, 8);
        drawText(rgba, width, column.x + 4, y + 36, tag, ink);
      }
    }
  });
  drawText(rgba, width, 12, top + PHASE_EXPLORERS.length * cellH + 8, "rho tags: attracted, repelled, null, inconcl", [40, 40, 40]);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/phase-diagram.png`, writePng(width, height, rgba));
}

function mainText(rows: CellRow[], positive: CellRow["explorers"], delta: number | null, instrument: string) {
  const lines: string[] = [];
  lines.push(`Instrument ${instrument}. Detection threshold ${delta == null ? "unavailable" : delta.toFixed(4)}.`);
  lines.push("");
  lines.push("| axis | level | random | count | surprise | rnd | rho | rho class |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const row of rows) {
    const cell = (id: PhaseExplorer) => fmt(row.explorers[id]);
    lines.push(
      `| ${row.axis} | ${row.label} | ${cell("random")} | ${cell("count")} | ${cell("surprise")} | ${cell("rnd")} | ${cell("rho")} | ${row.explorers.rho.class}${row.confounded ? " confounded" : ""} |`,
    );
  }
  lines.push("");
  lines.push("| control | random | count | surprise | rnd | rho | rho class |");
  lines.push("|---|---|---|---|---|---|---|");
  const pos = (id: PhaseExplorer) => fmt(positive[id]);
  lines.push(
    `| dose ${PHASE_DOSE} | ${pos("random")} | ${pos("count")} | ${pos("surprise")} | ${pos("rnd")} | ${pos("rho")} | ${positive.rho.class} |`,
  );
  lines.push("");
  lines.push("| axis | level | rho − random | rho − count | rho − surprise | rho − rnd |");
  lines.push("|---|---|---|---|---|---|");
  for (const row of rows) {
    const bit = (id: Exclude<PhaseExplorer, "rho">) => `${fmt(row.baselines[id])} ${row.baselines[id].contrast}`;
    lines.push(`| ${row.axis} | ${row.label} | ${bit("random")} | ${bit("count")} | ${bit("surprise")} | ${bit("rnd")} |`);
  }
  return lines.join("\n") + "\n";
}

function redrawFromJson() {
  const raw = JSON.parse(readFileSync(`${OUT}/phase.json`, "utf8")) as {
    delta: number | null;
    rows: CellRow[];
    positive: { explorers: CellRow["explorers"] };
  };
  const points: Point[] = [];
  for (const row of raw.rows) {
    for (const signal of PHASE_EXPLORERS) {
      const item = row.explorers[signal];
      points.push({
        axis: row.axis,
        level: row.level,
        explorer: signal,
        mean: item.mean,
        lo: item.lo,
        hi: item.hi,
        phaseClass: item.class,
      });
    }
  }
  for (const signal of PHASE_EXPLORERS) {
    const item = raw.positive.explorers[signal];
    points.push({
      axis: "bonus",
      level: 0,
      explorer: signal,
      mean: item.mean,
      lo: item.lo,
      hi: item.hi,
      phaseClass: item.class,
    });
  }
  drawDiagram(points, raw.delta);
}

async function main() {
  if (process.argv.includes("--figure-only")) {
    redrawFromJson();
    return;
  }
  const started = Date.now();
  const cells = phaseCells();
  const jobs = buildJobs();
  const workers = workerCount();
  console.log(
    `phase diagram: ${jobs.length} episodes, ${SEEDS} seeds, ${PHASE_STEPS} steps, ${workers} workers`,
  );
  console.log(`drift levels ${phaseDriftLevels().join(", ")}`);
  console.log(`forget levels ${phaseForgetLevels().join(", ")}`);
  const results = await runPool<PhaseJob, PhaseResult>(
    jobs,
    new URL("./phase-diagram-worker.ts", import.meta.url),
    workers,
  );
  const byKey = new Map<string, PhaseResult>();
  for (const result of results) {
    if (byKey.has(result.key)) throw new Error(`duplicate result ${result.key}`);
    byKey.set(result.key, result);
  }
  for (const cell of cells) {
    assertWalk(byKey, `${cell.axis} ${cell.label}`, cell.target, cell.control);
    if (cell.level === 0) assertLevelZero(byKey, cell);
  }
  const positive = positiveSpecs();
  assertWalk(byKey, "bonus", positive.target, positive.control);

  const positiveExplorers = {} as CellRow["explorers"];
  for (const signal of PHASE_EXPLORERS) {
    const diff = pairedDifference(
      series(byKey, signal, positive.target),
      series(byKey, signal, positive.control),
      positiveSalt(explorerIndex(signal)),
    );
    const call = greaterCall(diff);
    positiveExplorers[signal] = {
      ...store(diff),
      class: signal === "rho" ? null : null,
    };
    if (signal === "rho") {
      void call;
    }
  }
  const rhoBoost = pairedDifference(
    series(byKey, "rho", positive.target),
    series(byKey, "rho", positive.control),
    positiveSalt(explorerIndex("rho")),
  );
  const instrument = greaterCall(rhoBoost);
  const delta = instrumentDelta(instrument, rhoBoost.lo);
  for (const signal of PHASE_EXPLORERS) {
    const row = positiveExplorers[signal];
    row.class = signal === "rho" ? phaseCellClass(row, delta) : null;
  }

  const rows: CellRow[] = [];
  for (const cell of cells) {
    const explorers = {} as CellRow["explorers"];
    const excesses: Partial<Record<PhaseExplorer, number[]>> = {};
    for (const signal of PHASE_EXPLORERS) {
      const target = series(byKey, signal, cell.target);
      const control = series(byKey, signal, cell.control);
      const diff = target.map((value, i) => value - control[i]!);
      excesses[signal] = diff;
      const ci = pairedDifference(target, control, excessSalt(cell.axisIndex, cell.level, explorerIndex(signal)));
      explorers[signal] = {
        ...store(ci),
        class: signal === "rho" ? phaseCellClass(ci, delta) : null,
      };
    }
    const random = explorers.random;
    const confounded = random.lo > 0 || random.hi < 0;
    const baselines = {} as CellRow["baselines"];
    for (const signal of ["random", "count", "surprise", "rnd"] as const) {
      const ci = pairedDifference(
        excesses.rho!,
        excesses[signal]!,
        baselineSalt(cell.axisIndex, cell.level, explorerIndex(signal)),
      );
      baselines[signal] = { ...store(ci), contrast: baselineContrast(ci) };
    }
    rows.push({
      axis: cell.axis,
      level: cell.level,
      label: cell.label,
      value: cell.value,
      primary: cell.primary,
      confounded,
      explorers,
      baselines,
    });
  }

  const positiveBaselines = {} as CellRow["baselines"];
  const rhoExcess = series(byKey, "rho", positive.target).map(
    (value, i) => value - series(byKey, "rho", positive.control)[i]!,
  );
  for (const signal of ["random", "count", "surprise", "rnd"] as const) {
    const other = series(byKey, signal, positive.target).map(
      (value, i) => value - series(byKey, signal, positive.control)[i]!,
    );
    const ci = pairedDifference(rhoExcess, other, positiveBaselineSalt(explorerIndex(signal)));
    positiveBaselines[signal] = { ...store(ci), contrast: baselineContrast(ci) };
  }

  const predictions = {
    instrument,
    noise: notAttractedCall(
      rows.find((row) => row.axis === "noise" && row.primary)!.explorers.rho.class!,
      rows.find((row) => row.axis === "noise" && row.primary)!.confounded,
    ),
    drift: notAttractedCall(
      rows.find((row) => row.axis === "drift" && row.primary)!.explorers.rho.class!,
      rows.find((row) => row.axis === "drift" && row.primary)!.confounded,
    ),
    forget: notAttractedCall(
      rows.find((row) => row.axis === "forget" && row.primary)!.explorers.rho.class!,
      rows.find((row) => row.axis === "forget" && row.primary)!.confounded,
    ),
  };

  const counts = { attracted: 0, repelled: 0, "null-with-sensitivity": 0, inconclusive: 0 };
  for (const row of rows) {
    if (row.level === 0) continue;
    counts[row.explorers.rho.class!] += 1;
  }

  const points: Point[] = [];
  for (const row of rows) {
    for (const signal of PHASE_EXPLORERS) {
      const item = row.explorers[signal];
      points.push({
        axis: row.axis,
        level: row.level,
        explorer: signal,
        mean: item.mean,
        lo: item.lo,
        hi: item.hi,
        phaseClass: item.class,
      });
    }
  }
  for (const signal of PHASE_EXPLORERS) {
    const item = positiveExplorers[signal];
    points.push({
      axis: "bonus",
      level: 0,
      explorer: signal,
      mean: item.mean,
      lo: item.lo,
      hi: item.hi,
      phaseClass: item.class,
    });
  }
  drawDiagram(points, delta);

  const seconds = (Date.now() - started) / 1000;
  const payload = {
    seeds: SEEDS,
    steps: PHASE_STEPS,
    temperature: PHASE_TEMPERATURE,
    stream: `seed * 10007 + ${PHASE_STREAM}`,
    tau: LOCKED_DRIFT_TAU,
    dose: PHASE_DOSE,
    driftLevels: phaseDriftLevels(),
    forgetLevels: phaseForgetLevels(),
    delta,
    instrument,
    predictions,
    nonzeroCounts: counts,
    seconds,
    episodes: jobs.length,
    workers,
    rows,
    positive: {
      dose: PHASE_DOSE,
      explorers: positiveExplorers,
      baselines: positiveBaselines,
    },
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/phase.json`, JSON.stringify(payload, null, 2));
  const csv = ["axis,level,label,value,explorer,mean,lo,hi,n,class,confounded"];
  for (const row of rows) {
    for (const signal of PHASE_EXPLORERS) {
      const item = row.explorers[signal];
      csv.push(
        [
          row.axis,
          row.level,
          row.label,
          row.value,
          signal,
          item.mean,
          item.lo,
          item.hi,
          item.n,
          item.class ?? "",
          row.confounded ? 1 : 0,
        ].join(","),
      );
    }
  }
  for (const signal of PHASE_EXPLORERS) {
    const item = positiveExplorers[signal];
    csv.push(
      ["bonus", 0, String(PHASE_DOSE), PHASE_DOSE, signal, item.mean, item.lo, item.hi, item.n, item.class ?? "", 0].join(
        ",",
      ),
    );
  }
  writeFileSync(`${OUT}/phase.csv`, csv.join("\n") + "\n");
  const contrast = ["axis,level,baseline,mean,lo,hi,contrast"];
  for (const row of rows) {
    for (const signal of ["random", "count", "surprise", "rnd"] as const) {
      const item = row.baselines[signal];
      contrast.push([row.axis, row.label, signal, item.mean, item.lo, item.hi, item.contrast].join(","));
    }
  }
  for (const signal of ["random", "count", "surprise", "rnd"] as const) {
    const item = positiveBaselines[signal];
    contrast.push(["bonus", String(PHASE_DOSE), signal, item.mean, item.lo, item.hi, item.contrast].join(","));
  }
  writeFileSync(`${OUT}/contrasts.csv`, contrast.join("\n") + "\n");
  const md = mainText(rows, positiveExplorers, delta, instrument);
  writeFileSync(`${OUT}/phase.md`, md);
  console.log(md);
  console.log(JSON.stringify({ predictions, counts, delta, instrument, seconds, episodes: jobs.length }, null, 2));
  for (const axis of PHASE_AXES) {
    const primary = rows.find((row) => row.axis === axis && row.primary)!;
    console.log(`${axis} primary ${primary.label} ${fmt(primary.explorers.rho)} ${primary.explorers.rho.class}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
