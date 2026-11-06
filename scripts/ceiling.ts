/**
 * Door logit at one rate past the drift ladder. The 16× cell is the
 * published checksum. The claim is drift 0.94 minus the held room.
 * Not part of CI.
 *
 *   npm run ceiling
 *
 * Seeds 1–200. Writes bench/ceiling/ceiling.json, ceiling.csv,
 * ceiling.md, and ceiling.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { greaterCall, type Call } from "../src/lib/kernel/noise.ts";
import { bootstrapMeanCI, meanOf, type Interval } from "../src/lib/kernel/stats.ts";
import { runCeilingJob, type CeilingJob, type CeilingSample } from "../src/lib/kernel/ceiling-run.ts";
import type { AtlasGaps } from "../src/lib/kernel/atlas-run.ts";
import {
  CEILING_COLOR_CLAMP,
  CEILING_LEVELS,
  CEILING_RATE,
  DOSE_AXIS_HI,
  DOSE_AXIS_LO,
  FAST_RATE,
  PUBLISHED_FAST_COUNT,
  PUBLISHED_FAST_RAW,
  PUBLISHED_FAST_RHO,
  PUBLISHED_FAST_RHO_BONUS,
  PUBLISHED_FAST_RND,
  PUBLISHED_FAST_RND_BONUS,
  PUBLISHED_FAST_SURPRISE,
  PUBLISHED_FAST_SURPRISE_BONUS,
  RATE_DELTA,
  RHO_DETECT_DOSE,
  RHO_UNDETECT_DOSE,
  ceilingBaselineSalt,
  ceilingBonusFallSalt,
  ceilingBonusSalt,
  ceilingDoseBand,
  ceilingFallSalt,
  ceilingLogitSalt,
  ceilingRawFallSalt,
  ceilingRawSalt,
  ceilingSummary,
  ceilingVerdict,
  progressDose,
  type CeilingLevel,
  type CeilingSummary,
} from "../src/lib/kernel/ceiling.ts";
import type { RhoGapBand } from "../src/lib/kernel/noise.ts";
import {
  PHASE_EXPLORERS,
  baselineContrast,
  explorerIndex,
  notAttractedCall,
  phaseCellClass,
  type NotAttracted,
  type PhaseClass,
  type PhaseExplorer,
} from "../src/lib/kernel/phase-diagram.ts";
import { drawText, fillRect, writePng } from "./png.ts";
import { runPool, workerCount } from "./pool.ts";

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const OUT = "bench/ceiling";

type Scored = Interval & { call: Call; phaseClass: PhaseClass; notAttracted: NotAttracted; contrast?: string };

type LevelReport = {
  level: CeilingLevel;
  rate: number;
  raw: Interval & { call: Call };
  logit: Record<PhaseExplorer, Scored>;
  bonus: Record<PhaseExplorer, Interval>;
  baselines: Record<Exclude<PhaseExplorer, "rho">, Scored>;
  dose: Interval & { band: RhoGapBand };
};

type Report = {
  n: number;
  summary: CeilingSummary;
  verdict: ReturnType<typeof ceilingVerdict>;
  delta: number;
  levels: LevelReport[];
  falls: Record<PhaseExplorer, Scored>;
  bonusFall: Scored;
  rawFall: Interval & { call: Call };
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

function doorOf(row: CeilingSample, level: CeilingLevel) {
  return level === "fast" ? row.fast : row.ceiling;
}

function scoreInterval(ci: Interval): Scored {
  const call = greaterCall(ci);
  const phaseClass = phaseCellClass(ci, RATE_DELTA);
  return { ...ci, call, phaseClass, notAttracted: notAttractedCall(phaseClass, false) };
}

function column(rows: CeilingSample[], level: CeilingLevel, pick: (door: AtlasGaps) => number, salt: number): Scored {
  return scoreInterval(meanCI(rows.map((row) => pick(doorOf(row, level))), salt));
}

function levelReport(rows: CeilingSample[], level: CeilingLevel, rate: number): LevelReport {
  const rawCI = meanCI(
    rows.map((row) => doorOf(row, level).raw),
    ceilingRawSalt(level),
  );
  const logit = {} as Record<PhaseExplorer, Scored>;
  const bonus = {} as Record<PhaseExplorer, Interval>;
  PHASE_EXPLORERS.forEach((signal, explorer) => {
    logit[signal] = column(rows, level, (door) => door.logit[signal], ceilingLogitSalt(level, explorer));
    bonus[signal] = meanCI(
      rows.map((row) => doorOf(row, level).bonus[signal]),
      ceilingBonusSalt(level, explorer),
    );
  });
  const baselines = {} as LevelReport["baselines"];
  (["random", "count", "surprise", "rnd"] as const).forEach((signal) => {
    const diff = column(
      rows,
      level,
      (door) => door.logit.rho - door.logit[signal],
      ceilingBaselineSalt(level, explorerIndex(signal)),
    );
    baselines[signal] = { ...diff, contrast: baselineContrast(diff) };
  });
  const dose = progressDose(bonus.rho);
  return {
    level,
    rate,
    raw: { ...rawCI, call: greaterCall(rawCI) },
    logit,
    bonus,
    baselines,
    dose: { ...dose, band: ceilingDoseBand(dose, rows.length) },
  };
}

function reportOf(rows: CeilingSample[]): Report {
  const levels = [
    levelReport(rows, "fast", FAST_RATE),
    levelReport(rows, "ceiling", CEILING_RATE),
  ];
  const falls = {} as Report["falls"];
  PHASE_EXPLORERS.forEach((signal, explorer) => {
    falls[signal] = scoreInterval(
      meanCI(
        rows.map((row) => row.ceiling.logit[signal] - row.fast.logit[signal]),
        ceilingFallSalt(explorer),
      ),
    );
  });
  const bonusFall = scoreInterval(
    meanCI(
      rows.map((row) => row.ceiling.bonus.rho - row.fast.bonus.rho),
      ceilingBonusFallSalt(),
    ),
  );
  const rawFallCI = meanCI(
    rows.map((row) => row.ceiling.raw - row.fast.raw),
    ceilingRawFallSalt(),
  );
  const ceiling = levels.find((cell) => cell.level === "ceiling")!;
  const summary = ceilingSummary({
    ceilingRho: ceiling.logit.rho.notAttracted,
    ceilingSurprise: ceiling.logit.surprise.phaseClass,
  });
  return {
    n: rows.length,
    summary,
    verdict: ceilingVerdict(summary),
    delta: RATE_DELTA,
    levels,
    falls,
    bonusFall,
    rawFall: { ...rawFallCI, call: greaterCall(rawFallCI) },
  };
}

type RGB = [number, number, number];

function colorFor(mean: number, lo: number, hi: number): RGB {
  const t = Math.max(-1, Math.min(1, mean / CEILING_COLOR_CLAMP));
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

function writeFigure(report: Report) {
  const width = 980;
  const height = 640;
  const rgba = new Uint8Array(width * height * 4);
  rgba.fill(255);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  drawText(rgba, width, 16, 16, "Door logit, drifting room minus held room", [20, 20, 20]);
  drawText(rgba, width, 16, 32, "Fast is the published 16x cell. Ceiling is redraw probability 0.94.", [60, 60, 60]);
  drawText(rgba, width, 16, 48, `Color saturates at plus or minus ${CEILING_COLOR_CLAMP.toFixed(2)}. A pale cell includes 0.`, [60, 60, 60]);
  const cellW = 280;
  const cellH = 64;
  const left = 120;
  const top = 88;
  report.levels.forEach((level, index) => {
    const x = left + index * cellW;
    drawText(rgba, width, x + 8, 68, level.level === "fast" ? "fast  checksum" : "ceiling  claim", [20, 20, 20]);
    drawText(rgba, width, x + 8, 82, level.rate.toPrecision(4), [40, 40, 40]);
  });
  PHASE_EXPLORERS.forEach((signal, row) => {
    const y = top + row * cellH;
    drawText(rgba, width, 16, y + 24, signal, [20, 20, 20]);
    report.levels.forEach((level, index) => {
      const point = level.logit[signal];
      const x = left + index * cellW;
      fillRect(rgba, width, x, y, cellW - 16, cellH - 8, colorFor(point.mean, point.lo, point.hi));
      if (point.lo > 0 || point.hi < 0) fillRect(rgba, width, x, y, cellW - 16, 3, [20, 20, 20]);
      drawText(rgba, width, x + 8, y + 12, point.mean.toFixed(4), [25, 25, 25]);
      drawText(rgba, width, x + 8, y + 26, `[${point.lo.toFixed(3)}, ${point.hi.toFixed(3)}]`, [25, 25, 25]);
      if (signal === "rho") {
        const label = point.phaseClass === "null-with-sensitivity" ? "null" : point.phaseClass === "inconclusive" ? "inconcl" : point.phaseClass;
        drawText(rgba, width, x + 8, y + 40, label, [25, 25, 25]);
      }
    });
  });
  const doseTop = top + PHASE_EXPLORERS.length * cellH + 16;
  drawText(rgba, width, 16, doseTop, "rho dose = 0.55 x unmixed bonus. Lines are 0.0169 and 0.05.", [20, 20, 20]);
  const axisX = 160;
  const axisW = 760;
  const axisY = doseTop + 28;
  const span = DOSE_AXIS_HI - DOSE_AXIS_LO;
  const xOf = (value: number) => axisX + ((value - DOSE_AXIS_LO) / span) * axisW;
  fillRect(rgba, width, axisX, axisY, axisW, 1, [180, 180, 180]);
  for (const mark of [0, RHO_UNDETECT_DOSE, RHO_DETECT_DOSE]) {
    const x = Math.round(xOf(mark));
    fillRect(rgba, width, x, axisY - 6, 1, 78, mark === 0 ? [40, 40, 40] : [180, 120, 40]);
    drawText(rgba, width, x + 4, axisY - 16, mark === 0 ? "0" : mark.toFixed(4), [80, 60, 20]);
  }
  report.levels.forEach((level, index) => {
    const y = axisY + 14 + index * 28;
    drawText(rgba, width, 16, y, level.level, [20, 20, 20]);
    const x0 = xOf(Math.min(level.dose.lo, level.dose.hi));
    const x1 = xOf(Math.max(level.dose.lo, level.dose.hi));
    fillRect(rgba, width, Math.round(x0), y + 4, Math.max(2, Math.round(x1 - x0)), 6, [40, 90, 160]);
    const xm = Math.round(xOf(level.dose.mean));
    fillRect(rgba, width, xm - 1, y, 3, 14, [20, 20, 20]);
    drawText(rgba, width, Math.min(width - 180, xm + 8), y, `${level.dose.mean.toFixed(4)}  ${bandLabel(level.dose.band)}`, [25, 25, 25]);
  });
  drawText(rgba, width, 16, height - 22, `summary ${report.summary}`, [40, 40, 40]);
  writeFileSync(`${OUT}/ceiling.png`, writePng(width, height, rgba));
}

function writeCsv(report: Report) {
  const lines = ["level,rate,signal,quantity,mean,lo,hi,call,class,band"];
  const push = (
    level: string,
    rate: number | string,
    signal: string,
    quantity: string,
    ci: Interval & { call?: Call; phaseClass?: PhaseClass },
    band = "",
  ) => {
    lines.push(
      [level, rate, signal, quantity, ci.mean, ci.lo, ci.hi, ci.call ?? "", ci.phaseClass ?? "", band].join(","),
    );
  };
  for (const level of report.levels) {
    for (const signal of PHASE_EXPLORERS) {
      push(level.level, level.rate, signal, "logit", level.logit[signal]);
      push(level.level, level.rate, signal, "bonus", level.bonus[signal]);
    }
    push(level.level, level.rate, "realized", "raw", level.raw);
    push(level.level, level.rate, "rho", "dose", level.dose, level.dose.band);
    for (const signal of ["random", "count", "surprise", "rnd"] as const) {
      push(level.level, level.rate, `rho-${signal}`, "logit", level.baselines[signal]);
    }
  }
  for (const signal of PHASE_EXPLORERS) {
    push("ceiling-minus-fast", "", signal, "logit", report.falls[signal]);
  }
  push("ceiling-minus-fast", "", "rho", "bonus", report.bonusFall);
  push("ceiling-minus-fast", "", "realized", "raw", report.rawFall);
  writeFileSync(`${OUT}/ceiling.csv`, lines.join("\n") + "\n");
}

function writeMd(report: Report) {
  const lines: string[] = [];
  lines.push(`Summary ${report.summary}. Verdict ${report.verdict}.`);
  lines.push("");
  lines.push(`Detection threshold ${report.delta.toFixed(4)}, the published plant. Not remeasured.`);
  lines.push(`Dose lines ${RHO_UNDETECT_DOSE} and ${RHO_DETECT_DOSE}, the PR #11 curve. Not remeasured.`);
  lines.push("");
  lines.push("| rate | raw error | random | count | surprise | rnd | rho | rho class |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const level of report.levels) {
    const bit = (signal: PhaseExplorer) => fmt(level.logit[signal]);
    lines.push(
      `| ${level.level} ${level.rate} | ${fmt(level.raw)} ${level.raw.call} | ${bit("random")} | ${bit("count")} | ${bit("surprise")} | ${bit("rnd")} | ${bit("rho")} | ${level.logit.rho.phaseClass} |`,
    );
  }
  lines.push("");
  lines.push("| rate | rho − random | rho − count | rho − surprise | rho − rnd |");
  lines.push("|---|---|---|---|---|");
  for (const level of report.levels) {
    const bit = (signal: Exclude<PhaseExplorer, "rho">) => `${fmt(level.baselines[signal])} ${level.baselines[signal].contrast}`;
    lines.push(`| ${level.level} | ${bit("random")} | ${bit("count")} | ${bit("surprise")} | ${bit("rnd")} |`);
  }
  lines.push("");
  lines.push("Ceiling minus the published fast cell. Reported. Not the summary.");
  lines.push("");
  lines.push("| signal | logit |");
  lines.push("|---|---|");
  for (const signal of PHASE_EXPLORERS) {
    lines.push(`| ${signal} | ${fmt(report.falls[signal])} ${report.falls[signal].call} |`);
  }
  lines.push("");
  lines.push(`Rho bonus, ceiling minus fast: ${fmt(report.bonusFall)} ${report.bonusFall.call}.`);
  lines.push(`Realized error, ceiling minus fast: ${fmt(report.rawFall)} ${report.rawFall.call}.`);
  lines.push("");
  lines.push("Unmixed bonus, not the call. The rho dose is 0.55 times that bonus.");
  lines.push("");
  lines.push("| rate | rho bonus | rho dose | band | surprise | rnd | count |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const level of report.levels) {
    lines.push(
      `| ${level.level} | ${fmt(level.bonus.rho)} | ${fmt(level.dose)} | ${level.dose.band} | ${fmt(level.bonus.surprise)} | ${fmt(level.bonus.rnd)} | ${fmt(level.bonus.count)} |`,
    );
  }
  writeFileSync(`${OUT}/ceiling.md`, lines.join("\n") + "\n");
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (process.argv.includes("--figure")) {
    const saved = JSON.parse(readFileSync(`${OUT}/ceiling.json`, "utf8")) as { report: Report };
    writeFigure(saved.report);
    return;
  }
  if (FAST_RATE !== 0.3003 || CEILING_RATE !== 0.94) abort("locked rates moved");
  const jobs: CeilingJob[] = SEEDS.map((seed, id) => ({ id, seed }));
  const workers = workerCount();
  const t0 = Date.now();
  console.error(`ceiling: ${jobs.length} seeds, 400 steps, ${FAST_RATE} ${CEILING_RATE}, ${workers} workers`);
  const rows = await runPool<CeilingJob, CeilingSample>(jobs, new URL("./ceiling-worker.ts", import.meta.url), workers);
  console.error(`ceiling: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const ordered = rows.slice().sort((a, b) => a.seed - b.seed);
  if (ordered.length !== SEEDS.length || ordered.some((row, i) => row.seed !== SEEDS[i])) abort("ceiling did not return seeds 1–200");
  miss("rho fast", meanOf(ordered.map((row) => row.fast.logit.rho)), PUBLISHED_FAST_RHO);
  miss("surprise fast", meanOf(ordered.map((row) => row.fast.logit.surprise)), PUBLISHED_FAST_SURPRISE);
  miss("rnd fast", meanOf(ordered.map((row) => row.fast.logit.rnd)), PUBLISHED_FAST_RND);
  miss("count fast", meanOf(ordered.map((row) => row.fast.logit.count)), PUBLISHED_FAST_COUNT);
  miss("raw fast", meanOf(ordered.map((row) => row.fast.raw)), PUBLISHED_FAST_RAW);
  miss("rho bonus fast", meanOf(ordered.map((row) => row.fast.bonus.rho)), PUBLISHED_FAST_RHO_BONUS);
  miss("surprise bonus fast", meanOf(ordered.map((row) => row.fast.bonus.surprise)), PUBLISHED_FAST_SURPRISE_BONUS);
  miss("rnd bonus fast", meanOf(ordered.map((row) => row.fast.bonus.rnd)), PUBLISHED_FAST_RND_BONUS);
  for (const row of ordered) {
    for (const level of CEILING_LEVELS) {
      const door = doorOf(row, level);
      if (door.bonus.count !== 0) abort(`count bonus moved on seed ${row.seed} ${level}`);
      if (door.logit.random !== 0) abort(`random logit moved on seed ${row.seed} ${level}`);
      if (!Number.isFinite(door.logit.rho) || !Number.isFinite(door.raw) || !Number.isFinite(door.bonus.rho)) {
        abort(`non-finite door on seed ${row.seed} ${level}`);
      }
    }
  }
  const report = reportOf(ordered);
  console.error(`summary ${report.summary}; verdict ${report.verdict}`);
  for (const level of report.levels) {
    console.error(
      `${level.level} ${level.rate} rho ${fmt(level.logit.rho)} ${level.logit.rho.phaseClass} surprise ${fmt(level.logit.surprise)} ${level.logit.surprise.phaseClass} dose ${fmt(level.dose)} ${level.dose.band}`,
    );
  }
  console.error(`ceiling − fast rho ${fmt(report.falls.rho)} ${report.falls.rho.call}`);
  const body = {
    date: new Date().toISOString(),
    seeds: SEEDS,
    seconds: (Date.now() - t0) / 1000,
    delta: RATE_DELTA,
    fastRate: FAST_RATE,
    ceilingRate: CEILING_RATE,
    report,
    samples: ordered,
  };
  writeFileSync(`${OUT}/ceiling.json`, JSON.stringify(body));
  writeCsv(report);
  writeMd(report);
  writeFigure(report);
}

main();
