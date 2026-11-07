/**
 * Bernoulli residual and realized squared error of the same predicted
 * window, at redraw probability 0.94. Drift minus held. Not part of CI.
 *
 *   npm run window
 *
 * Seeds 1–200. Writes bench/window/window.json, window.csv, window.md,
 * and window.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { greaterCall, type Call } from "../src/lib/kernel/noise.ts";
import { bootstrapMeanCI, meanOf, type Interval } from "../src/lib/kernel/stats.ts";
import { runWindowJob, type WindowJob, type WindowSample } from "../src/lib/kernel/window-run.ts";
import { partsColumnIndex, partsPieceSalt } from "../src/lib/kernel/parts.ts";
import {
  CEILING_RATE,
  RATE_DELTA,
  WINDOW_COLOR_CLAMP,
  WINDOW_COLUMNS,
  WINDOW_IMPLIED_GAP,
  WINDOW_IMPLIED_RESIDUAL,
  windowAlignSalt,
  windowGapSalt,
  windowResidualGain,
  windowResidualSalt,
  windowSummary,
  windowVerdict,
  type WindowColumn,
  type WindowSummary,
} from "../src/lib/kernel/window.ts";
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
import { PUBLISHED_UNCERTAINTY } from "../src/lib/kernel/weights.ts";
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
const OUT = "bench/window";

type Scored = Interval & { call: Call; phaseClass: PhaseClass };

type Report = {
  n: number;
  summary: WindowSummary;
  verdict: ReturnType<typeof windowVerdict>;
  delta: number;
  matched: boolean;
  residual: Scored;
  squared: Scored;
  gap: Scored;
  align: Scored;
  uncertainty: Scored;
  logit: Record<PhaseExplorer, Scored>;
  bonus: Record<PhaseExplorer, Interval>;
};

function meanCI(xs: number[], salt: number): Interval {
  return bootstrapMeanCI(xs, 2000, 0.05, salt);
}

function abort(message: string): never {
  console.error(message);
  process.exit(1);
}

function miss(name: string, got: number, want: number, tol = 1e-9) {
  if (Math.abs(got - want) > tol) abort(`${name} ${got} does not match ${want}`);
}

function fmt(ci: Interval) {
  return `${ci.mean.toFixed(4)} [${ci.lo.toFixed(4)}, ${ci.hi.toFixed(4)}]`;
}

function scoreInterval(ci: Interval): Scored {
  return { ...ci, call: greaterCall(ci), phaseClass: phaseCellClass(ci, RATE_DELTA) };
}

function reportOf(rows: WindowSample[]): Report {
  const logit = {} as Report["logit"];
  const bonus = {} as Report["bonus"];
  for (const signal of PHASE_EXPLORERS) {
    const explorer = explorerIndex(signal);
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
  const uncertainty = scoreInterval(
    meanCI(
      rows.map((sample) => sample.uncertainty),
      partsPieceSalt(explorerIndex("rho"), partsColumnIndex("uncertainty")),
    ),
  );
  const residual = scoreInterval(
    meanCI(
      rows.map((sample) => sample.residual),
      windowResidualSalt(),
    ),
  );
  const squared = scoreInterval(
    meanCI(
      rows.map((sample) => sample.squared),
      matchDriftRawSalt(),
    ),
  );
  const gap = scoreInterval(
    meanCI(
      rows.map((sample) => sample.gap),
      windowGapSalt(),
    ),
  );
  const align = scoreInterval(
    meanCI(
      rows.map((sample) => sample.align),
      windowAlignSalt(),
    ),
  );
  const matched = rows.every((sample) => sample.matched);
  const summary = windowSummary({
    logit: logit.rho.phaseClass,
    squared: squared.phaseClass,
    uncertainty: uncertainty.phaseClass,
    matched,
    gap: gap.phaseClass,
  });
  return {
    n: rows.length,
    summary,
    verdict: windowVerdict(summary),
    delta: RATE_DELTA,
    matched,
    residual,
    squared,
    gap,
    align,
    uncertainty,
    logit,
    bonus,
  };
}

type RGB = [number, number, number];

function colorFor(mean: number, lo: number, hi: number): RGB {
  const t = Math.max(-1, Math.min(1, mean / WINDOW_COLOR_CLAMP));
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

const COLUMN_TITLE: Record<WindowColumn, string> = {
  residual: "residual",
  squared: "squared",
  gap: "gap",
};

function writeFigure(report: Report) {
  const width = 760;
  const height = 280;
  const rgba = new Uint8Array(width * height * 4);
  rgba.fill(255);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  drawText(rgba, width, 16, 16, "Predicted window at redraw probability 0.94", [20, 20, 20]);
  drawText(rgba, width, 16, 32, "Drift minus held. The gap is squared error plus one quarter of the residual.", [60, 60, 60]);
  drawText(
    rgba,
    width,
    16,
    48,
    `Color saturates at plus or minus ${WINDOW_COLOR_CLAMP.toFixed(2)}. A pale cell includes 0.`,
    [60, 60, 60],
  );
  const cellW = 220;
  const cellH = 72;
  const left = 24;
  const top = 88;
  WINDOW_COLUMNS.forEach((column, index) => {
    const x = left + index * cellW;
    drawText(rgba, width, x + 4, 72, COLUMN_TITLE[column], [20, 20, 20]);
    const point = report[column];
    const y = top;
    fillRect(rgba, width, x, y, cellW - 16, cellH - 8, colorFor(point.mean, point.lo, point.hi));
    if (point.lo > 0 || point.hi < 0) fillRect(rgba, width, x, y, cellW - 16, 3, [20, 20, 20]);
    drawText(rgba, width, x + 6, y + 16, point.mean.toFixed(4), [25, 25, 25]);
    drawText(rgba, width, x + 6, y + 32, `[${point.lo.toFixed(4)}, ${point.hi.toFixed(4)}]`, [25, 25, 25]);
    drawText(rgba, width, x + 6, y + 48, classLabel(point.phaseClass), [25, 25, 25]);
  });
  drawText(
    rgba,
    width,
    16,
    height - 22,
    `summary ${report.summary}  gap ${report.gap.mean.toFixed(4)}  rho logit ${report.logit.rho.mean.toFixed(4)}`,
    [40, 40, 40],
  );
  writeFileSync(`${OUT}/window.png`, writePng(width, height, rgba));
}

function writeCsv(report: Report) {
  const lines = ["quantity,mean,lo,hi,call,class"];
  const push = (quantity: string, ci: Interval & { call?: Call; phaseClass?: PhaseClass }) => {
    lines.push([quantity, ci.mean, ci.lo, ci.hi, ci.call ?? "", ci.phaseClass ?? ""].join(","));
  };
  for (const column of WINDOW_COLUMNS) push(column, report[column]);
  push("align", report.align);
  push("uncertainty", report.uncertainty);
  for (const signal of PHASE_EXPLORERS) push(`${signal} logit`, report.logit[signal]);
  writeFileSync(`${OUT}/window.csv`, lines.join("\n") + "\n");
}

function writeMd(report: Report) {
  const lines: string[] = [];
  lines.push(`Summary ${report.summary}. Verdict ${report.verdict}.`);
  lines.push("");
  lines.push(`Detection threshold ${report.delta.toFixed(4)}, the published plant. Not remeasured.`);
  lines.push(`Rate ${CEILING_RATE}. The gap is drift minus held. The plant is not rerun.`);
  lines.push(`Windows matched the score residual: ${report.matched}.`);
  lines.push("");
  lines.push("| residual | squared | gap | align |");
  lines.push("|---|---|---|---|");
  lines.push(`| ${fmt(report.residual)} | ${fmt(report.squared)} | ${fmt(report.gap)} | ${fmt(report.align)} |`);
  lines.push("");
  lines.push("| quantity | class |");
  lines.push("|---|---|");
  lines.push(`| residual | ${report.residual.phaseClass} |`);
  lines.push(`| squared | ${report.squared.phaseClass} |`);
  lines.push(`| gap | ${report.gap.phaseClass} |`);
  lines.push(`| align | ${report.align.phaseClass} |`);
  lines.push(`| uncertainty | ${report.uncertainty.phaseClass} |`);
  lines.push(`| rho logit | ${report.logit.rho.phaseClass} |`);
  lines.push("");
  lines.push("Rho logit of the drift door, the checksum, not the call.");
  lines.push("");
  lines.push("| rho | surprise | rnd | count |");
  lines.push("|---|---|---|---|");
  lines.push(
    `| ${fmt(report.logit.rho)} | ${fmt(report.logit.surprise)} | ${fmt(report.logit.rnd)} | ${fmt(report.logit.count)} |`,
  );
  lines.push("");
  lines.push("Unmixed bonus of the drift door, not the call.");
  lines.push("");
  lines.push("| rho | surprise | rnd | count |");
  lines.push("|---|---|---|---|");
  lines.push(
    `| ${fmt(report.bonus.rho)} | ${fmt(report.bonus.surprise)} | ${fmt(report.bonus.rnd)} | ${fmt(report.bonus.count)} |`,
  );
  writeFileSync(`${OUT}/window.md`, lines.join("\n") + "\n");
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (process.argv.includes("--figure")) {
    const saved = JSON.parse(readFileSync(`${OUT}/window.json`, "utf8")) as { report: Report };
    writeFigure(saved.report);
    return;
  }
  if (CEILING_RATE !== 0.94) abort("locked rate moved");
  const jobs: WindowJob[] = SEEDS.map((seed, id) => ({ id, seed }));
  const workers = workerCount();
  const t0 = Date.now();
  console.error(`window: ${jobs.length} seeds, 400 steps, rate ${CEILING_RATE}, ${workers} workers`);
  const rows = await runPool<WindowJob, WindowSample>(jobs, new URL("./window-worker.ts", import.meta.url), workers);
  console.error(`window: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const ordered = rows.slice().sort((a, b) => a.seed - b.seed);
  if (ordered.length !== SEEDS.length || ordered.some((row, i) => row.seed !== SEEDS[i])) abort("window did not return seeds 1–200");
  miss("rho", meanOf(ordered.map((row) => row.logit.rho)), PUBLISHED_CEILING_RHO);
  miss("surprise", meanOf(ordered.map((row) => row.logit.surprise)), PUBLISHED_CEILING_SURPRISE);
  miss("rnd", meanOf(ordered.map((row) => row.logit.rnd)), PUBLISHED_CEILING_RND);
  miss("count", meanOf(ordered.map((row) => row.logit.count)), PUBLISHED_CEILING_COUNT);
  miss("raw", meanOf(ordered.map((row) => row.raw)), PUBLISHED_CEILING_RAW);
  miss("rho bonus", meanOf(ordered.map((row) => row.bonus.rho)), PUBLISHED_CEILING_RHO_BONUS);
  miss("surprise bonus", meanOf(ordered.map((row) => row.bonus.surprise)), PUBLISHED_CEILING_SURPRISE_BONUS);
  miss("rnd bonus", meanOf(ordered.map((row) => row.bonus.rnd)), PUBLISHED_CEILING_RND_BONUS);
  miss("uncertainty", meanOf(ordered.map((row) => row.uncertainty)), PUBLISHED_UNCERTAINTY);
  const matched = ordered.every((row) => row.matched);
  if (matched) {
    miss("residual", meanOf(ordered.map((row) => row.residual)), WINDOW_IMPLIED_RESIDUAL, 1e-6);
    miss("gap", meanOf(ordered.map((row) => row.gap)), WINDOW_IMPLIED_GAP, 1e-6);
  }
  for (const row of ordered) {
    if (row.bonus.count !== 0) abort(`count bonus moved on seed ${row.seed}`);
    if (row.logit.random !== 0) abort(`random logit moved on seed ${row.seed}`);
    if (!Number.isFinite(row.residual) || !Number.isFinite(row.squared) || !Number.isFinite(row.gap)) {
      abort(`non-finite door on seed ${row.seed}`);
    }
    if (Math.abs(row.squared - row.raw) > 1e-9) abort(`squared left the realized error on seed ${row.seed}`);
    if (Math.abs(row.gap + 2 * row.align) > 1e-6) abort(`gap left alignment on seed ${row.seed}`);
    if (Math.abs(row.uncertainty - windowResidualGain(1) * row.residual) > 1e-6 && row.matched) {
      abort(`matched seed ${row.seed} left the gain`);
    }
  }
  const report = reportOf(ordered);
  console.error(`summary ${report.summary}; verdict ${report.verdict}; matched ${report.matched}`);
  console.error(
    `residual ${fmt(report.residual)} ${report.residual.phaseClass} squared ${fmt(report.squared)} ${report.squared.phaseClass} gap ${fmt(report.gap)} ${report.gap.phaseClass}`,
  );
  console.error(`align ${fmt(report.align)} ${report.align.phaseClass}`);
  console.error(`rho logit ${fmt(report.logit.rho)} ${report.logit.rho.phaseClass}`);
  const body = {
    date: new Date().toISOString(),
    seeds: SEEDS,
    seconds: (Date.now() - t0) / 1000,
    delta: RATE_DELTA,
    rate: CEILING_RATE,
    gain: windowResidualGain(1),
    impliedResidual: WINDOW_IMPLIED_RESIDUAL,
    impliedGap: WINDOW_IMPLIED_GAP,
    report,
    samples: ordered,
  };
  writeFileSync(`${OUT}/window.json`, JSON.stringify(body));
  writeCsv(report);
  writeMd(report);
  writeFigure(report);
}

main();
