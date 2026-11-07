/**
 * Door logit at redraw probability 0.94, against a plant of that seed's
 * own progress-channel dose on the held brain. Not part of CI.
 *
 *   npm run match
 *
 * Seeds 1–200. Writes bench/match/match.json, match.csv, match.md,
 * and match.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { greaterCall, type Call } from "../src/lib/kernel/noise.ts";
import { RHO_DETECT_DOSE, RHO_UNDETECT_DOSE, rhoGapBand, type RhoGapBand } from "../src/lib/kernel/noise.ts";
import { bootstrapMeanCI, meanOf, type Interval } from "../src/lib/kernel/stats.ts";
import { progressDose } from "../src/lib/kernel/ceiling.ts";
import { DOSE_AXIS_HI, DOSE_AXIS_LO } from "../src/lib/kernel/ceiling.ts";
import { runMatchJob, type MatchJob, type MatchSample } from "../src/lib/kernel/match-run.ts";
import {
  CEILING_RATE,
  MATCH_COLOR_CLAMP,
  PUBLISHED_CEILING_COUNT,
  PUBLISHED_CEILING_RAW,
  PUBLISHED_CEILING_RHO,
  PUBLISHED_CEILING_RHO_BONUS,
  PUBLISHED_CEILING_RND,
  PUBLISHED_CEILING_RND_BONUS,
  PUBLISHED_CEILING_SURPRISE,
  PUBLISHED_CEILING_SURPRISE_BONUS,
  RATE_DELTA,
  matchDriftBonusSalt,
  matchDriftLogitSalt,
  matchDriftRawSalt,
  matchGapSalt,
  matchPlantSalt,
  matchSummary,
  matchVerdict,
  type MatchSummary,
} from "../src/lib/kernel/match.ts";
import {
  PHASE_EXPLORERS,
  phaseCellClass,
  type PhaseClass,
  type PhaseExplorer,
} from "../src/lib/kernel/phase-diagram.ts";
import { drawText, fillRect, writePng } from "./png.ts";
import { runPool, workerCount } from "./pool.ts";

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const OUT = "bench/match";

type Scored = Interval & { call: Call; phaseClass: PhaseClass };

type Column = {
  name: string;
  logit: Record<PhaseExplorer, Scored>;
};

type Report = {
  n: number;
  summary: MatchSummary;
  verdict: ReturnType<typeof matchVerdict>;
  delta: number;
  drift: Column;
  plant: Column;
  gap: Column;
  bonus: Record<PhaseExplorer, Interval>;
  raw: Interval & { call: Call };
  dose: Interval & { band: RhoGapBand };
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

function column(
  name: string,
  rows: MatchSample[],
  pick: (row: MatchSample, signal: PhaseExplorer) => number,
  salt: (explorer: number) => number,
): Column {
  const logit = {} as Record<PhaseExplorer, Scored>;
  PHASE_EXPLORERS.forEach((signal, explorer) => {
    logit[signal] = scoreInterval(meanCI(rows.map((row) => pick(row, signal)), salt(explorer)));
  });
  return { name, logit };
}

function reportOf(rows: MatchSample[]): Report {
  const drift = column("drift", rows, (row, signal) => row.door.logit[signal], matchDriftLogitSalt);
  const plant = column("plant", rows, (row, signal) => row.plant.logit[signal], matchPlantSalt);
  const gap = column("gap", rows, (row, signal) => row.door.logit[signal] - row.plant.logit[signal], matchGapSalt);
  const bonus = {} as Record<PhaseExplorer, Interval>;
  PHASE_EXPLORERS.forEach((signal, explorer) => {
    bonus[signal] = meanCI(
      rows.map((row) => row.door.bonus[signal]),
      matchDriftBonusSalt(explorer),
    );
  });
  const rawCI = meanCI(
    rows.map((row) => row.door.raw),
    matchDriftRawSalt(),
  );
  const dose = progressDose(bonus.rho);
  const summary = matchSummary({
    driftRho: drift.logit.rho.phaseClass,
    plantRho: plant.logit.rho.phaseClass,
    gap: gap.logit.rho.phaseClass,
  });
  return {
    n: rows.length,
    summary,
    verdict: matchVerdict(summary),
    delta: RATE_DELTA,
    drift,
    plant,
    gap,
    bonus,
    raw: { ...rawCI, call: greaterCall(rawCI) },
    dose: { ...dose, band: rhoGapBand(dose, rows.length, dose.n) },
  };
}

type RGB = [number, number, number];

function colorFor(mean: number, lo: number, hi: number): RGB {
  const t = Math.max(-1, Math.min(1, mean / MATCH_COLOR_CLAMP));
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

function bandLabel(band: RhoGapBand) {
  if (band === "below-undetectable") return "below 0.0169";
  if (band === "rho-blind-band") return "rho blind";
  if (band === "at-or-above-detectable") return "at 0.05";
  if (band === "spans-detectable") return "spans 0.05";
  return "too few";
}

function classLabel(phaseClass: PhaseClass) {
  if (phaseClass === "null-with-sensitivity") return "null";
  if (phaseClass === "inconclusive") return "inconcl";
  return phaseClass;
}

function writeFigure(report: Report) {
  const width = 1100;
  const height = 620;
  const rgba = new Uint8Array(width * height * 4);
  rgba.fill(255);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  drawText(rgba, width, 16, 16, "Door logit at redraw probability 0.94", [20, 20, 20]);
  drawText(rgba, width, 16, 32, "Drift is the published ceiling. Plant is that seed's dose on the held brain.", [60, 60, 60]);
  drawText(rgba, width, 16, 48, `Color saturates at plus or minus ${MATCH_COLOR_CLAMP.toFixed(2)}. A pale cell includes 0.`, [60, 60, 60]);
  const columns = [report.drift, report.plant, report.gap];
  const titles = ["drift  checksum", "plant  dose", "drift-plant  call"];
  const cellW = 300;
  const cellH = 64;
  const left = 120;
  const top = 88;
  columns.forEach((_, index) => {
    const x = left + index * cellW;
    drawText(rgba, width, x + 8, 72, titles[index]!, [20, 20, 20]);
  });
  PHASE_EXPLORERS.forEach((signal, row) => {
    const y = top + row * cellH;
    drawText(rgba, width, 16, y + 24, signal, [20, 20, 20]);
    columns.forEach((column, index) => {
      const point = column.logit[signal];
      const x = left + index * cellW;
      fillRect(rgba, width, x, y, cellW - 16, cellH - 8, colorFor(point.mean, point.lo, point.hi));
      if (point.lo > 0 || point.hi < 0) fillRect(rgba, width, x, y, cellW - 16, 3, [20, 20, 20]);
      drawText(rgba, width, x + 8, y + 12, point.mean.toFixed(4), [25, 25, 25]);
      drawText(rgba, width, x + 8, y + 26, `[${point.lo.toFixed(3)}, ${point.hi.toFixed(3)}]`, [25, 25, 25]);
      if (signal === "rho") drawText(rgba, width, x + 8, y + 40, classLabel(point.phaseClass), [25, 25, 25]);
    });
  });
  const doseTop = top + PHASE_EXPLORERS.length * cellH + 16;
  drawText(rgba, width, 16, doseTop, "rho dose = 0.55 x unmixed bonus. Lines are 0.0169 and 0.05.", [20, 20, 20]);
  const axisX = 160;
  const axisW = 860;
  const axisY = doseTop + 28;
  const span = DOSE_AXIS_HI - DOSE_AXIS_LO;
  const xOf = (value: number) => axisX + ((value - DOSE_AXIS_LO) / span) * axisW;
  fillRect(rgba, width, axisX, axisY, axisW, 1, [180, 180, 180]);
  for (const mark of [0, RHO_UNDETECT_DOSE, RHO_DETECT_DOSE]) {
    const x = Math.round(xOf(mark));
    fillRect(rgba, width, x, axisY - 6, 1, 36, mark === 0 ? [40, 40, 40] : [180, 120, 40]);
    drawText(rgba, width, x + 4, axisY - 16, mark === 0 ? "0" : mark.toFixed(4), [80, 60, 20]);
  }
  const y = axisY + 14;
  drawText(rgba, width, 16, y, "dose", [20, 20, 20]);
  const x0 = xOf(Math.min(report.dose.lo, report.dose.hi));
  const x1 = xOf(Math.max(report.dose.lo, report.dose.hi));
  fillRect(rgba, width, Math.round(x0), y + 4, Math.max(2, Math.round(x1 - x0)), 6, [40, 90, 160]);
  const xm = Math.round(xOf(report.dose.mean));
  fillRect(rgba, width, xm - 1, y, 3, 14, [20, 20, 20]);
  drawText(rgba, width, Math.min(width - 200, xm + 8), y, `${report.dose.mean.toFixed(4)}  ${bandLabel(report.dose.band)}`, [25, 25, 25]);
  drawText(rgba, width, 16, height - 22, `summary ${report.summary}`, [40, 40, 40]);
  writeFileSync(`${OUT}/match.png`, writePng(width, height, rgba));
}

function writeCsv(report: Report) {
  const lines = ["column,signal,quantity,mean,lo,hi,call,class,band"];
  const push = (
    column: string,
    signal: string,
    quantity: string,
    ci: Interval & { call?: Call; phaseClass?: PhaseClass },
    band = "",
  ) => {
    lines.push(
      [column, signal, quantity, ci.mean, ci.lo, ci.hi, ci.call ?? "", ci.phaseClass ?? "", band].join(","),
    );
  };
  for (const column of [report.drift, report.plant, report.gap]) {
    for (const signal of PHASE_EXPLORERS) push(column.name, signal, "logit", column.logit[signal]);
  }
  for (const signal of PHASE_EXPLORERS) push("drift", signal, "bonus", report.bonus[signal]);
  push("drift", "realized", "raw", report.raw);
  push("drift", "rho", "dose", report.dose, report.dose.band);
  writeFileSync(`${OUT}/match.csv`, lines.join("\n") + "\n");
}

function writeMd(report: Report) {
  const lines: string[] = [];
  lines.push(`Summary ${report.summary}. Verdict ${report.verdict}.`);
  lines.push("");
  lines.push(`Detection threshold ${report.delta.toFixed(4)}, the published plant. Not remeasured.`);
  lines.push(`Dose lines ${RHO_UNDETECT_DOSE} and ${RHO_DETECT_DOSE}, the PR #11 curve. Not remeasured.`);
  lines.push(`Rate ${CEILING_RATE}. The gap is drift logit minus plant logit.`);
  lines.push("");
  lines.push("| column | random | count | surprise | rnd | rho | rho class |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const column of [report.drift, report.plant, report.gap]) {
    const bit = (signal: PhaseExplorer) => fmt(column.logit[signal]);
    lines.push(
      `| ${column.name} | ${bit("random")} | ${bit("count")} | ${bit("surprise")} | ${bit("rnd")} | ${bit("rho")} | ${column.logit.rho.phaseClass} |`,
    );
  }
  lines.push("");
  lines.push(`Realized-error door: ${fmt(report.raw)} ${report.raw.call}.`);
  lines.push("");
  lines.push("Unmixed bonus of the drift door, not the call. The rho dose is 0.55 times that bonus.");
  lines.push("");
  lines.push("| rho bonus | rho dose | band | surprise | rnd | count |");
  lines.push("|---|---|---|---|---|---|");
  lines.push(
    `| ${fmt(report.bonus.rho)} | ${fmt(report.dose)} | ${report.dose.band} | ${fmt(report.bonus.surprise)} | ${fmt(report.bonus.rnd)} | ${fmt(report.bonus.count)} |`,
  );
  writeFileSync(`${OUT}/match.md`, lines.join("\n") + "\n");
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (process.argv.includes("--figure")) {
    const saved = JSON.parse(readFileSync(`${OUT}/match.json`, "utf8")) as { report: Report };
    writeFigure(saved.report);
    return;
  }
  if (CEILING_RATE !== 0.94) abort("locked rate moved");
  const jobs: MatchJob[] = SEEDS.map((seed, id) => ({ id, seed }));
  const workers = workerCount();
  const t0 = Date.now();
  console.error(`match: ${jobs.length} seeds, 400 steps, rate ${CEILING_RATE}, ${workers} workers`);
  const rows = await runPool<MatchJob, MatchSample>(jobs, new URL("./match-worker.ts", import.meta.url), workers);
  console.error(`match: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const ordered = rows.slice().sort((a, b) => a.seed - b.seed);
  if (ordered.length !== SEEDS.length || ordered.some((row, i) => row.seed !== SEEDS[i])) abort("match did not return seeds 1–200");
  miss("rho", meanOf(ordered.map((row) => row.door.logit.rho)), PUBLISHED_CEILING_RHO);
  miss("surprise", meanOf(ordered.map((row) => row.door.logit.surprise)), PUBLISHED_CEILING_SURPRISE);
  miss("rnd", meanOf(ordered.map((row) => row.door.logit.rnd)), PUBLISHED_CEILING_RND);
  miss("count", meanOf(ordered.map((row) => row.door.logit.count)), PUBLISHED_CEILING_COUNT);
  miss("raw", meanOf(ordered.map((row) => row.door.raw)), PUBLISHED_CEILING_RAW);
  miss("rho bonus", meanOf(ordered.map((row) => row.door.bonus.rho)), PUBLISHED_CEILING_RHO_BONUS);
  miss("surprise bonus", meanOf(ordered.map((row) => row.door.bonus.surprise)), PUBLISHED_CEILING_SURPRISE_BONUS);
  miss("rnd bonus", meanOf(ordered.map((row) => row.door.bonus.rnd)), PUBLISHED_CEILING_RND_BONUS);
  miss("dose", meanOf(ordered.map((row) => row.dose)), 0.55 * PUBLISHED_CEILING_RHO_BONUS);
  for (const row of ordered) {
    if (row.door.bonus.count !== 0) abort(`count bonus moved on seed ${row.seed}`);
    if (row.door.logit.random !== 0 || row.plant.logit.random !== 0) abort(`random logit moved on seed ${row.seed}`);
    if (!Number.isFinite(row.door.logit.rho) || !Number.isFinite(row.plant.logit.rho) || !Number.isFinite(row.dose)) {
      abort(`non-finite door on seed ${row.seed}`);
    }
    if (Math.abs(row.dose - 0.55 * row.door.bonus.rho) > 1e-12) abort(`dose left the bonus on seed ${row.seed}`);
  }
  const report = reportOf(ordered);
  console.error(`summary ${report.summary}; verdict ${report.verdict}`);
  console.error(
    `drift rho ${fmt(report.drift.logit.rho)} ${report.drift.logit.rho.phaseClass} plant ${fmt(report.plant.logit.rho)} ${report.plant.logit.rho.phaseClass} gap ${fmt(report.gap.logit.rho)} ${report.gap.logit.rho.phaseClass} dose ${fmt(report.dose)} ${report.dose.band}`,
  );
  const body = {
    date: new Date().toISOString(),
    seeds: SEEDS,
    seconds: (Date.now() - t0) / 1000,
    delta: RATE_DELTA,
    rate: CEILING_RATE,
    report,
    samples: ordered,
  };
  writeFileSync(`${OUT}/match.json`, JSON.stringify(body));
  writeCsv(report);
  writeMd(report);
  writeFigure(report);
}

main();
