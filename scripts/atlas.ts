/**
 * Door-scale phase diagram. Rho versus the baselines at one door, on
 * stationary noise, drift at 1/τ, and a negated-target erasure, plus the
 * planted dose the occupancy instrument can see. Not part of CI.
 *
 *   npm run atlas
 *
 * Seeds 1–200. Writes bench/atlas/atlas.json, atlas.csv, atlas.md, and
 * atlas.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { greaterCall, type Call } from "../src/lib/kernel/noise.ts";
import { bootstrapMeanCI, meanOf, type Interval } from "../src/lib/kernel/stats.ts";
import { runAtlasJob, type AtlasJob, type AtlasSample } from "../src/lib/kernel/atlas-run.ts";
import {
  ATLAS_CELLS,
  ATLAS_COLOR_CLAMP,
  ATLAS_CONTENT_STEPS,
  ATLAS_DRIFT,
  PHASE_DOSE,
  PUBLISHED_RAW_DOOR,
  PUBLISHED_RND_BONUS,
  PUBLISHED_RHO_DOOR,
  PUBLISHED_SURPRISE_BONUS,
  atlasBaselineSalt,
  atlasBonusSalt,
  atlasClassTag,
  atlasLogitSalt,
  atlasPlantBaselineSalt,
  atlasPlantSalt,
  atlasRawSalt,
  atlasSummary,
  atlasVerdict,
  type AtlasCell,
  type AtlasSummary,
} from "../src/lib/kernel/atlas.ts";
import { PUBLISHED_LEARN } from "../src/lib/kernel/capacity.ts";
import {
  PUBLISHED_DROP_HELD,
  PUBLISHED_DROP_NEGATE,
  PUBLISHED_NEGATE_OVERWRITE,
  PUBLISHED_RAW_HELD,
  PUBLISHED_RAW_NEGATE,
} from "../src/lib/kernel/relearn.ts";
import {
  PHASE_EXPLORERS,
  baselineContrast,
  explorerIndex,
  instrumentDelta,
  notAttractedCall,
  phaseCellClass,
  type NotAttracted,
  type PhaseClass,
  type PhaseExplorer,
} from "../src/lib/kernel/phase-diagram.ts";
import { drawText, fillRect, writePng } from "./png.ts";
import { runPool, workerCount } from "./pool.ts";

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const OUT = "bench/atlas";

type Scored = Interval & { call: Call; phaseClass: PhaseClass; notAttracted: NotAttracted; contrast?: string };

type CellReport = {
  cell: AtlasCell;
  separated: boolean;
  raw: Interval & { call: Call };
  logit: Record<PhaseExplorer, Scored>;
  bonus: Record<PhaseExplorer, Interval>;
  baselines: Record<Exclude<PhaseExplorer, "rho">, Scored>;
};

type Report = {
  n: number;
  summary: AtlasSummary;
  verdict: ReturnType<typeof atlasVerdict>;
  delta: number | null;
  plantCall: Call;
  noiseSeparated: boolean;
  cells: CellReport[];
  plant: CellReport;
};

function meanCI(xs: number[], salt: number): Interval {
  return bootstrapMeanCI(xs, 2000, 0.05, salt);
}

function abort(message: string): never {
  console.error(message);
  process.exit(1);
}

function miss(name: string, got: number, want: number) {
  if (Math.abs(got - want) > 1e-9) abort(`${name} ${got} does not match ${want}`);
}

function fmt(ci: Interval) {
  return `${ci.mean.toFixed(4)} [${ci.lo.toFixed(4)}, ${ci.hi.toFixed(4)}]`;
}

function scoreInterval(ci: Interval, delta: number | null, confounded: boolean): Scored {
  const call = greaterCall(ci);
  const phaseClass = phaseCellClass(ci, delta);
  return { ...ci, call, phaseClass, notAttracted: notAttractedCall(phaseClass, confounded) };
}

function column(rows: AtlasSample[], pick: (row: AtlasSample) => number, salt: number, delta: number | null): Scored {
  return scoreInterval(meanCI(rows.map(pick), salt), delta, false);
}

function cellReport(
  rows: AtlasSample[],
  cell: AtlasCell,
  delta: number | null,
  logitOf: (row: AtlasSample, signal: PhaseExplorer) => number,
  bonusOf: (row: AtlasSample, signal: PhaseExplorer) => number,
  rawOf: (row: AtlasSample) => number,
  logitSalt: (explorer: number) => number,
  bonusSalt: (explorer: number) => number,
  rawSalt: number,
  baseSalt: (baseline: number) => number,
): CellReport {
  const rawCI = meanCI(rows.map(rawOf), rawSalt);
  const logit = {} as Record<PhaseExplorer, Scored>;
  const bonus = {} as Record<PhaseExplorer, Interval>;
  PHASE_EXPLORERS.forEach((signal, explorer) => {
    logit[signal] = column(rows, (row) => logitOf(row, signal), logitSalt(explorer), delta);
    bonus[signal] = meanCI(rows.map((row) => bonusOf(row, signal)), bonusSalt(explorer));
  });
  const baselines = {} as CellReport["baselines"];
  (["random", "count", "surprise", "rnd"] as const).forEach((signal) => {
    const diff = column(
      rows,
      (row) => logitOf(row, "rho") - logitOf(row, signal),
      baseSalt(explorerIndex(signal)),
      delta,
    );
    baselines[signal] = { ...diff, contrast: baselineContrast(diff) };
  });
  return {
    cell,
    separated: greaterCall(rawCI) === "confirmed",
    raw: { ...rawCI, call: greaterCall(rawCI) },
    logit,
    bonus,
    baselines,
  };
}

function reportOf(rows: AtlasSample[]): Report {
  const plant = cellReport(
    rows,
    "noise",
    null,
    (row, signal) => row.plant.logit[signal],
    (row, signal) => row.plant.bonus[signal],
    (row) => row.plant.raw,
    atlasPlantSalt,
    (explorer) => 41400 + explorer,
    41390,
    atlasPlantBaselineSalt,
  );
  const delta = instrumentDelta(plant.logit.rho.call, plant.logit.rho.lo);
  const cells = ATLAS_CELLS.map((cell) =>
    cellReport(
      rows,
      cell,
      delta,
      (row, signal) => row[cell].logit[signal],
      (row, signal) => row[cell].bonus[signal],
      (row) => row[cell].raw,
      (explorer) => atlasLogitSalt(cell, explorer),
      (explorer) => atlasBonusSalt(cell, explorer),
      atlasRawSalt(cell),
      (baseline) => atlasBaselineSalt(cell, baseline),
    ),
  );
  const noise = cells[0]!;
  const drift = cells[1]!;
  const forget = cells[2]!;
  const summary = atlasSummary({
    plant: plant.logit.rho.call,
    noise: noise.logit.rho.notAttracted,
    drift: drift.logit.rho.notAttracted,
    forget: forget.logit.rho.notAttracted,
    noiseSeparated: noise.separated,
  });
  return {
    n: rows.length,
    summary,
    verdict: atlasVerdict(summary),
    delta,
    plantCall: plant.logit.rho.call,
    noiseSeparated: noise.separated,
    cells,
    plant: { ...plant, cell: "noise" },
  };
}

type RGB = [number, number, number];

function colorFor(mean: number, lo: number, hi: number): RGB {
  const t = Math.max(-1, Math.min(1, mean / ATLAS_COLOR_CLAMP));
  const solid = lo > 0 || hi < 0;
  const strength = Math.abs(t) * (solid ? 1 : 0.38);
  if (t > 0) {
    return [Math.round(255 - strength * 40), Math.round(255 - strength * 175), Math.round(255 - strength * 175)];
  }
  if (t < 0) {
    return [Math.round(255 - strength * 190), Math.round(255 - strength * 145), Math.round(255 - strength * 55)];
  }
  return [246, 246, 246];
}

function writeFigure(report: Report) {
  const width = 760;
  const height = 460;
  const rgba = new Uint8Array(width * height * 4);
  rgba.fill(255);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  drawText(rgba, width, 12, 10, "Door logit, manipulated room minus matched control", [20, 20, 20]);
  const deltaText = report.delta == null ? "detection threshold unavailable" : `detection threshold ${report.delta.toFixed(4)}`;
  drawText(rgba, width, 430, 10, deltaText, [40, 40, 40]);
  drawText(rgba, width, 12, 24, "Color saturates at plus or minus 0.04. A pale cell has a CI that includes 0.", [60, 60, 60]);
  const columns: Array<{ label: string; logit: Record<PhaseExplorer, Scored> }> = [
    ...report.cells.map((cell) => ({ label: cell.cell === "forget" ? "erase" : cell.cell, logit: cell.logit })),
    { label: "plant", logit: report.plant.logit },
  ];
  const cellW = 150;
  const cellH = 64;
  const left = 88;
  const top = 78;
  columns.forEach((column, index) => {
    drawText(rgba, width, left + index * cellW + 8, 52, column.label, [20, 20, 20]);
  });
  PHASE_EXPLORERS.forEach((signal, row) => {
    const y = top + row * cellH;
    drawText(rgba, width, 12, y + 24, signal, [20, 20, 20]);
    columns.forEach((column, index) => {
      const point = column.logit[signal];
      const x = left + index * cellW;
      fillRect(rgba, width, x, y, cellW - 8, cellH - 6, colorFor(point.mean, point.lo, point.hi));
      if (point.lo > 0 || point.hi < 0) fillRect(rgba, width, x, y, cellW - 8, 3, [20, 20, 20]);
      drawText(rgba, width, x + 6, y + 10, point.mean.toFixed(4), [25, 25, 25]);
      drawText(rgba, width, x + 6, y + 24, `[${point.lo.toFixed(3)},${point.hi.toFixed(3)}]`, [25, 25, 25]);
      if (signal === "rho") drawText(rgba, width, x + 6, y + 40, atlasClassTag(point.phaseClass), [25, 25, 25]);
    });
  });
  drawText(rgba, width, 12, top + PHASE_EXPLORERS.length * cellH + 8, `summary ${report.summary}`, [40, 40, 40]);
  writeFileSync(`${OUT}/atlas.png`, writePng(width, height, rgba));
}

function writeCsv(report: Report) {
  const lines = ["cell,signal,quantity,mean,lo,hi,call,class"];
  const push = (cell: string, signal: string, quantity: string, ci: Interval & { call?: Call; phaseClass?: PhaseClass }) => {
    lines.push([cell, signal, quantity, ci.mean, ci.lo, ci.hi, ci.call ?? "", ci.phaseClass ?? ""].join(","));
  };
  for (const cell of report.cells) {
    for (const signal of PHASE_EXPLORERS) {
      push(cell.cell, signal, "logit", cell.logit[signal]);
      push(cell.cell, signal, "bonus", cell.bonus[signal]);
    }
    push(cell.cell, "realized", "raw", cell.raw);
    for (const signal of ["random", "count", "surprise", "rnd"] as const) {
      push(cell.cell, `rho-${signal}`, "logit", cell.baselines[signal]);
    }
  }
  for (const signal of PHASE_EXPLORERS) push("plant", signal, "logit", report.plant.logit[signal]);
  writeFileSync(`${OUT}/atlas.csv`, lines.join("\n") + "\n");
}

function writeMd(report: Report) {
  const lines: string[] = [];
  lines.push(`Summary ${report.summary}. Verdict ${report.verdict}.`);
  lines.push("");
  lines.push(`Instrument ${report.plantCall}. Detection threshold ${report.delta == null ? "unavailable" : report.delta.toFixed(4)}.`);
  lines.push("");
  lines.push("| cell | raw error | random | count | surprise | rnd | rho | rho class |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const cell of report.cells) {
    const bit = (signal: PhaseExplorer) => fmt(cell.logit[signal]);
    lines.push(
      `| ${cell.cell} | ${fmt(cell.raw)} ${cell.raw.call} | ${bit("random")} | ${bit("count")} | ${bit("surprise")} | ${bit("rnd")} | ${bit("rho")} | ${cell.logit.rho.phaseClass} |`,
    );
  }
  const plant = report.plant;
  lines.push(
    `| plant ${PHASE_DOSE} | ${fmt(plant.raw)} | ${fmt(plant.logit.random)} | ${fmt(plant.logit.count)} | ${fmt(plant.logit.surprise)} | ${fmt(plant.logit.rnd)} | ${fmt(plant.logit.rho)} | ${plant.logit.rho.phaseClass} |`,
  );
  lines.push("");
  lines.push("| cell | rho − random | rho − count | rho − surprise | rho − rnd |");
  lines.push("|---|---|---|---|---|");
  for (const cell of report.cells) {
    const bit = (signal: Exclude<PhaseExplorer, "rho">) => `${fmt(cell.baselines[signal])} ${cell.baselines[signal].contrast}`;
    lines.push(`| ${cell.cell} | ${bit("random")} | ${bit("count")} | ${bit("surprise")} | ${bit("rnd")} |`);
  }
  lines.push("");
  lines.push("Unmixed bonus, not the call. Forget surprise and RND are the published doorway.");
  lines.push("");
  lines.push("| cell | rho | surprise | rnd | count |");
  lines.push("|---|---|---|---|---|");
  for (const cell of report.cells) {
    lines.push(`| ${cell.cell} | ${fmt(cell.bonus.rho)} | ${fmt(cell.bonus.surprise)} | ${fmt(cell.bonus.rnd)} | ${fmt(cell.bonus.count)} |`);
  }
  writeFileSync(`${OUT}/atlas.md`, lines.join("\n") + "\n");
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (process.argv.includes("--figure")) {
    const saved = JSON.parse(readFileSync(`${OUT}/atlas.json`, "utf8")) as { report: Report };
    writeFigure(saved.report);
    return;
  }
  if (ATLAS_DRIFT !== 0.01877) abort(`drift cell ${ATLAS_DRIFT} is not 0.01877`);
  const jobs: AtlasJob[] = SEEDS.map((seed, id) => ({ id, seed }));
  const workers = workerCount();
  const t0 = Date.now();
  console.error(`atlas: ${jobs.length} seeds, ${ATLAS_CONTENT_STEPS} content steps, dose ${PHASE_DOSE}, ${workers} workers`);
  const rows = await runPool(jobs, new URL("./atlas-worker.ts", import.meta.url), workers);
  console.error(`atlas: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const ordered = rows.slice().sort((a, b) => a.seed - b.seed);
  if (ordered.length !== SEEDS.length || ordered.some((row, i) => row.seed !== SEEDS[i])) abort("atlas did not return seeds 1–200");
  miss("learn drop", meanOf(ordered.map((row) => row.learnDrop)), PUBLISHED_LEARN);
  miss("overwrite", meanOf(ordered.map((row) => row.overwrite)), PUBLISHED_NEGATE_OVERWRITE);
  miss("raw held", meanOf(ordered.map((row) => row.rawHeld)), PUBLISHED_RAW_HELD);
  miss("raw negate", meanOf(ordered.map((row) => row.rawNegate)), PUBLISHED_RAW_NEGATE);
  miss("drop held", meanOf(ordered.map((row) => row.dropHeld)), PUBLISHED_DROP_HELD);
  miss("drop negate", meanOf(ordered.map((row) => row.dropNegate)), PUBLISHED_DROP_NEGATE);
  miss("rho door", meanOf(ordered.map((row) => row.forget.logit.rho)), PUBLISHED_RHO_DOOR);
  miss("surprise bonus", meanOf(ordered.map((row) => row.forget.bonus.surprise)), PUBLISHED_SURPRISE_BONUS);
  miss("rnd bonus", meanOf(ordered.map((row) => row.forget.bonus.rnd)), PUBLISHED_RND_BONUS);
  miss("raw door", meanOf(ordered.map((row) => row.forget.raw)), PUBLISHED_RAW_DOOR);
  for (const row of ordered) {
    if (row.noise.bonus.count !== 0 || row.drift.bonus.count !== 0 || row.forget.bonus.count !== 0) {
      abort(`count bonus moved on seed ${row.seed}`);
    }
    if (row.stay !== 0 && Math.abs(row.stay) > 1e-9) abort(`idle probe moved on seed ${row.seed}`);
  }
  const report = reportOf(ordered);
  console.error(`summary ${report.summary}; verdict ${report.verdict}; delta ${report.delta}`);
  for (const cell of report.cells) {
    console.error(
      `${cell.cell} rho ${fmt(cell.logit.rho)} ${cell.logit.rho.phaseClass} raw ${fmt(cell.raw)} ${cell.raw.call}`,
    );
  }
  console.error(`plant rho ${fmt(report.plant.logit.rho)} ${report.plant.logit.rho.call}`);
  const body = {
    date: new Date().toISOString(),
    seeds: SEEDS,
    seconds: (Date.now() - t0) / 1000,
    drift: ATLAS_DRIFT,
    dose: PHASE_DOSE,
    report,
    samples: ordered,
  };
  writeFileSync(`${OUT}/atlas.json`, JSON.stringify(body));
  writeCsv(report);
  writeMd(report);
  writeFigure(report);
}

main();
