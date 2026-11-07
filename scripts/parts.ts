/**
 * Door logit at redraw probability 0.94, split into the additive score
 * pieces. Drift minus held. Not part of CI.
 *
 *   npm run parts
 *
 * Seeds 1–200. Writes bench/parts/parts.json, parts.csv, parts.md,
 * and parts.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { greaterCall, type Call } from "../src/lib/kernel/noise.ts";
import { bootstrapMeanCI, meanOf, type Interval } from "../src/lib/kernel/stats.ts";
import { runPartsJob, type PartsJob, type PartsSample } from "../src/lib/kernel/parts-run.ts";
import { SCORE_PIECE_NAMES, type ScorePieceName } from "../src/lib/kernel/atlas-run.ts";
import {
  CEILING_RATE,
  PARTS_COLOR_CLAMP,
  PARTS_COLUMNS,
  RATE_DELTA,
  partsColumnIndex,
  partsOutsideSalt,
  partsPieceSalt,
  partsProgressSalt,
  partsSummary,
  partsVerdict,
  type PartsColumn,
  type PartsSummary,
} from "../src/lib/kernel/parts.ts";
import {
  PUBLISHED_CEILING_COUNT,
  PUBLISHED_CEILING_RAW,
  PUBLISHED_CEILING_RHO,
  PUBLISHED_CEILING_RHO_BONUS,
  PUBLISHED_CEILING_RND,
  PUBLISHED_CEILING_RND_BONUS,
  PUBLISHED_CEILING_SURPRISE,
  PUBLISHED_CEILING_SURPRISE_BONUS,
  matchDriftBonusSalt,
  matchDriftLogitSalt,
  matchDriftRawSalt,
} from "../src/lib/kernel/match.ts";
import {
  PHASE_EXPLORERS,
  explorerIndex,
  phaseCellClass,
  type PhaseClass,
  type PhaseExplorer,
} from "../src/lib/kernel/phase-diagram.ts";
import { drawText, fillRect, writePng } from "./png.ts";
import { runPool, workerCount } from "./pool.ts";

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const OUT = "bench/parts";

type Scored = Interval & { call: Call; phaseClass: PhaseClass };

type Report = {
  n: number;
  summary: PartsSummary;
  verdict: ReturnType<typeof partsVerdict>;
  delta: number;
  pieces: Record<PhaseExplorer, Record<PartsColumn, Scored>>;
  progress: Record<PhaseExplorer, Scored>;
  outside: Record<PhaseExplorer, Scored>;
  logit: Record<PhaseExplorer, Scored>;
  bonus: Record<PhaseExplorer, Interval>;
  raw: Interval & { call: Call };
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

function scoreInterval(ci: Interval): Scored {
  return { ...ci, call: greaterCall(ci), phaseClass: phaseCellClass(ci, RATE_DELTA) };
}

function reportOf(rows: PartsSample[]): Report {
  const pieces = {} as Report["pieces"];
  const progress = {} as Report["progress"];
  const outside = {} as Report["outside"];
  const logit = {} as Report["logit"];
  const bonus = {} as Report["bonus"];
  for (const signal of PHASE_EXPLORERS) {
    const explorer = explorerIndex(signal);
    const row = {} as Record<PartsColumn, Scored>;
    for (const column of PARTS_COLUMNS) {
      row[column] = scoreInterval(
        meanCI(
          rows.map((sample) => sample.pieces[signal][column]),
          partsPieceSalt(explorer, partsColumnIndex(column)),
        ),
      );
    }
    pieces[signal] = row;
    progress[signal] = scoreInterval(
      meanCI(
        rows.map((sample) => sample.progress[signal]),
        partsProgressSalt(explorer),
      ),
    );
    outside[signal] = scoreInterval(
      meanCI(
        rows.map((sample) => sample.outside[signal]),
        partsOutsideSalt(explorer),
      ),
    );
    logit[signal] = scoreInterval(
      meanCI(
        rows.map((sample) => sample.logit[signal]),
        matchDriftLogitSalt(explorer),
      ),
    );
    bonus[signal] = meanCI(
      rows.map((sample) => sample.bonus[signal]),
      matchDriftBonusSalt(explorer),
    );
  }
  const rawCI = meanCI(
    rows.map((sample) => sample.raw),
    matchDriftRawSalt(),
  );
  const summary = partsSummary({
    logit: logit.rho.phaseClass,
    progress: progress.rho.phaseClass,
    outside: outside.rho.phaseClass,
  });
  return {
    n: rows.length,
    summary,
    verdict: partsVerdict(summary),
    delta: RATE_DELTA,
    pieces,
    progress,
    outside,
    logit,
    bonus,
    raw: { ...rawCI, call: greaterCall(rawCI) },
  };
}

type RGB = [number, number, number];

function colorFor(mean: number, lo: number, hi: number): RGB {
  const t = Math.max(-1, Math.min(1, mean / PARTS_COLOR_CLAMP));
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

function classLabel(phaseClass: PhaseClass) {
  if (phaseClass === "null-with-sensitivity") return "null";
  if (phaseClass === "inconclusive") return "inconcl";
  return phaseClass;
}

const COLUMN_TITLE: Record<PartsColumn | "progress" | "outside", string> = {
  rho: "rho hat",
  global: "global",
  uncertainty: "uncertainty",
  extrinsic: "extrinsic",
  follow: "follow",
  progress: "progress",
  outside: "outside",
};

function writeFigure(report: Report) {
  const width = 1280;
  const height = 560;
  const rgba = new Uint8Array(width * height * 4);
  rgba.fill(255);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  drawText(rgba, width, 16, 16, "Score pieces at redraw probability 0.94", [20, 20, 20]);
  drawText(rgba, width, 16, 32, "Drift minus held. Pieces sum to the logit. Progress is rho hat plus global.", [60, 60, 60]);
  drawText(rgba, width, 16, 48, `Color saturates at plus or minus ${PARTS_COLOR_CLAMP.toFixed(2)}. A pale cell includes 0.`, [60, 60, 60]);
  const columns: (PartsColumn | "progress" | "outside")[] = [...PARTS_COLUMNS, "progress", "outside"];
  const cellW = 156;
  const cellH = 64;
  const left = 120;
  const top = 88;
  columns.forEach((column, index) => {
    const x = left + index * cellW;
    drawText(rgba, width, x + 4, 72, COLUMN_TITLE[column], [20, 20, 20]);
  });
  PHASE_EXPLORERS.forEach((signal, row) => {
    const y = top + row * cellH;
    drawText(rgba, width, 16, y + 24, signal, [20, 20, 20]);
    columns.forEach((column, index) => {
      const point = column === "progress" || column === "outside" ? report[column][signal] : report.pieces[signal][column];
      const x = left + index * cellW;
      fillRect(rgba, width, x, y, cellW - 8, cellH - 8, colorFor(point.mean, point.lo, point.hi));
      if (point.lo > 0 || point.hi < 0) fillRect(rgba, width, x, y, cellW - 8, 3, [20, 20, 20]);
      drawText(rgba, width, x + 6, y + 14, point.mean.toFixed(4), [25, 25, 25]);
      drawText(rgba, width, x + 6, y + 28, `[${point.lo.toFixed(3)}, ${point.hi.toFixed(3)}]`, [25, 25, 25]);
      if (signal === "rho") drawText(rgba, width, x + 6, y + 42, classLabel(point.phaseClass), [25, 25, 25]);
    });
  });
  drawText(
    rgba,
    width,
    16,
    height - 22,
    `summary ${report.summary}  rho logit ${report.logit.rho.mean.toFixed(4)} ${classLabel(report.logit.rho.phaseClass)}`,
    [40, 40, 40],
  );
  writeFileSync(`${OUT}/parts.png`, writePng(width, height, rgba));
}

function writeCsv(report: Report) {
  const lines = ["signal,quantity,mean,lo,hi,call,class"];
  const push = (signal: string, quantity: string, ci: Interval & { call?: Call; phaseClass?: PhaseClass }) => {
    lines.push([signal, quantity, ci.mean, ci.lo, ci.hi, ci.call ?? "", ci.phaseClass ?? ""].join(","));
  };
  for (const signal of PHASE_EXPLORERS) {
    for (const column of PARTS_COLUMNS) push(signal, column, report.pieces[signal][column]);
    push(signal, "progress", report.progress[signal]);
    push(signal, "outside", report.outside[signal]);
    push(signal, "logit", report.logit[signal]);
    push(signal, "bonus", report.bonus[signal]);
  }
  push("realized", "raw", report.raw);
  writeFileSync(`${OUT}/parts.csv`, lines.join("\n") + "\n");
}

function writeMd(report: Report) {
  const lines: string[] = [];
  lines.push(`Summary ${report.summary}. Verdict ${report.verdict}.`);
  lines.push("");
  lines.push(`Detection threshold ${report.delta.toFixed(4)}, the published plant. Not remeasured.`);
  lines.push(`Rate ${CEILING_RATE}. The gap is drift minus held. The plant is not rerun.`);
  lines.push("");
  lines.push("| signal | rho hat | global | uncertainty | follow | extrinsic | progress | outside |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const signal of PHASE_EXPLORERS) {
    const bit = (column: PartsColumn) => fmt(report.pieces[signal][column]);
    lines.push(
      `| ${signal} | ${bit("rho")} | ${bit("global")} | ${bit("uncertainty")} | ${bit("follow")} | ${bit("extrinsic")} | ${fmt(report.progress[signal])} | ${fmt(report.outside[signal])} |`,
    );
  }
  lines.push("");
  lines.push("| signal | logit | class | progress class | outside class |");
  lines.push("|---|---|---|---|---|");
  for (const signal of PHASE_EXPLORERS) {
    lines.push(
      `| ${signal} | ${fmt(report.logit[signal])} | ${report.logit[signal].phaseClass} | ${report.progress[signal].phaseClass} | ${report.outside[signal].phaseClass} |`,
    );
  }
  lines.push("");
  lines.push(`Realized-error door: ${fmt(report.raw)} ${report.raw.call}.`);
  lines.push("");
  lines.push("Unmixed bonus of the drift door, not the call.");
  lines.push("");
  lines.push("| rho | surprise | rnd | count |");
  lines.push("|---|---|---|---|");
  lines.push(
    `| ${fmt(report.bonus.rho)} | ${fmt(report.bonus.surprise)} | ${fmt(report.bonus.rnd)} | ${fmt(report.bonus.count)} |`,
  );
  writeFileSync(`${OUT}/parts.md`, lines.join("\n") + "\n");
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (process.argv.includes("--figure")) {
    const saved = JSON.parse(readFileSync(`${OUT}/parts.json`, "utf8")) as { report: Report };
    writeFigure(saved.report);
    return;
  }
  if (CEILING_RATE !== 0.94) abort("locked rate moved");
  for (const name of SCORE_PIECE_NAMES) {
    if (name === "extra") continue;
    if (!(PARTS_COLUMNS as readonly ScorePieceName[]).includes(name)) abort(`column ${name} is missing`);
  }
  const jobs: PartsJob[] = SEEDS.map((seed, id) => ({ id, seed }));
  const workers = workerCount();
  const t0 = Date.now();
  console.error(`parts: ${jobs.length} seeds, 400 steps, rate ${CEILING_RATE}, ${workers} workers`);
  const rows = await runPool<PartsJob, PartsSample>(jobs, new URL("./parts-worker.ts", import.meta.url), workers);
  console.error(`parts: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const ordered = rows.slice().sort((a, b) => a.seed - b.seed);
  if (ordered.length !== SEEDS.length || ordered.some((row, i) => row.seed !== SEEDS[i])) abort("parts did not return seeds 1–200");
  miss("rho", meanOf(ordered.map((row) => row.logit.rho)), PUBLISHED_CEILING_RHO);
  miss("surprise", meanOf(ordered.map((row) => row.logit.surprise)), PUBLISHED_CEILING_SURPRISE);
  miss("rnd", meanOf(ordered.map((row) => row.logit.rnd)), PUBLISHED_CEILING_RND);
  miss("count", meanOf(ordered.map((row) => row.logit.count)), PUBLISHED_CEILING_COUNT);
  miss("raw", meanOf(ordered.map((row) => row.raw)), PUBLISHED_CEILING_RAW);
  miss("rho bonus", meanOf(ordered.map((row) => row.bonus.rho)), PUBLISHED_CEILING_RHO_BONUS);
  miss("surprise bonus", meanOf(ordered.map((row) => row.bonus.surprise)), PUBLISHED_CEILING_SURPRISE_BONUS);
  miss("rnd bonus", meanOf(ordered.map((row) => row.bonus.rnd)), PUBLISHED_CEILING_RND_BONUS);
  for (const row of ordered) {
    if (row.bonus.count !== 0) abort(`count bonus moved on seed ${row.seed}`);
    if (row.logit.random !== 0) abort(`random logit moved on seed ${row.seed}`);
    if (!Number.isFinite(row.logit.rho) || !Number.isFinite(row.progress.rho) || !Number.isFinite(row.outside.rho)) {
      abort(`non-finite door on seed ${row.seed}`);
    }
    for (const signal of PHASE_EXPLORERS) {
      if (Math.abs(row.pieces[signal].extra) > 1e-9) abort(`place bonus on seed ${row.seed} ${signal}`);
      const sum = row.progress[signal] + row.outside[signal];
      if (Math.abs(sum - row.logit[signal]) > 1e-6) abort(`pieces left the logit on seed ${row.seed} ${signal}`);
    }
  }
  const report = reportOf(ordered);
  console.error(`summary ${report.summary}; verdict ${report.verdict}`);
  console.error(
    `rho logit ${fmt(report.logit.rho)} ${report.logit.rho.phaseClass} progress ${fmt(report.progress.rho)} ${report.progress.rho.phaseClass} outside ${fmt(report.outside.rho)} ${report.outside.rho.phaseClass}`,
  );
  for (const column of PARTS_COLUMNS) {
    console.error(`rho ${column} ${fmt(report.pieces.rho[column])} ${report.pieces.rho[column].phaseClass}`);
  }
  const body = {
    date: new Date().toISOString(),
    seeds: SEEDS,
    seconds: (Date.now() - t0) / 1000,
    delta: RATE_DELTA,
    rate: CEILING_RATE,
    report,
    samples: ordered,
  };
  writeFileSync(`${OUT}/parts.json`, JSON.stringify(body));
  writeCsv(report);
  writeMd(report);
  writeFigure(report);
}

main();
