/**
 * Door logit across the locked drift ladder. Rho versus the baselines
 * at one door, at 1/16, 1/4, 1, 4, and 16 times 1/τ. The adaptation-rate
 * cell is the published atlas drift cell. Not part of CI.
 *
 *   npm run rate
 *
 * Seeds 1–200. Writes bench/rate/rate.json, rate.csv, rate.md, and rate.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { greaterCall, type Call } from "../src/lib/kernel/noise.ts";
import { bootstrapMeanCI, meanOf, type Interval } from "../src/lib/kernel/stats.ts";
import { runRateJob, type RateJob, type RateSample } from "../src/lib/kernel/rate-run.ts";
import {
  PUBLISHED_AT_COUNT,
  PUBLISHED_AT_RAW,
  PUBLISHED_AT_RHO,
  PUBLISHED_AT_RHO_BONUS,
  PUBLISHED_AT_RND,
  PUBLISHED_AT_RND_BONUS,
  PUBLISHED_AT_SURPRISE,
  PUBLISHED_AT_SURPRISE_BONUS,
  RATE_COLOR_CLAMP,
  RATE_DELTA,
  RATE_LEVELS,
  rateBaselineSalt,
  rateBonusSalt,
  rateLadder,
  rateLogitSalt,
  ratePeakSalt,
  rateRawSalt,
  rateRiseSalt,
  rateSummary,
  rateVerdict,
  type RateLevel,
  type RateSummary,
} from "../src/lib/kernel/rate.ts";
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
const OUT = "bench/rate";

type Scored = Interval & { call: Call; phaseClass: PhaseClass; notAttracted: NotAttracted; contrast?: string };

type LevelReport = {
  level: RateLevel;
  rate: number;
  factor: number;
  raw: Interval & { call: Call };
  logit: Record<PhaseExplorer, Scored>;
  bonus: Record<PhaseExplorer, Interval>;
  baselines: Record<Exclude<PhaseExplorer, "rho">, Scored>;
};

type Report = {
  n: number;
  summary: RateSummary;
  verdict: ReturnType<typeof rateVerdict>;
  delta: number;
  levels: LevelReport[];
  peaks: Record<Exclude<RateLevel, "at">, Scored>;
  rises: Record<"surprise" | "rnd" | "count", Scored>;
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
  const call = greaterCall(ci);
  const phaseClass = phaseCellClass(ci, RATE_DELTA);
  return { ...ci, call, phaseClass, notAttracted: notAttractedCall(phaseClass, false) };
}

function column(rows: RateSample[], pick: (row: RateSample) => number, salt: number): Scored {
  return scoreInterval(meanCI(rows.map(pick), salt));
}

function levelReport(rows: RateSample[], level: RateLevel, rate: number, factor: number): LevelReport {
  const rawCI = meanCI(
    rows.map((row) => row.doors[level].raw),
    rateRawSalt(level),
  );
  const logit = {} as Record<PhaseExplorer, Scored>;
  const bonus = {} as Record<PhaseExplorer, Interval>;
  PHASE_EXPLORERS.forEach((signal, explorer) => {
    logit[signal] = column(rows, (row) => row.doors[level].logit[signal], rateLogitSalt(level, explorer));
    bonus[signal] = meanCI(
      rows.map((row) => row.doors[level].bonus[signal]),
      rateBonusSalt(level, explorer),
    );
  });
  const baselines = {} as LevelReport["baselines"];
  (["random", "count", "surprise", "rnd"] as const).forEach((signal) => {
    const diff = column(
      rows,
      (row) => row.doors[level].logit.rho - row.doors[level].logit[signal],
      rateBaselineSalt(level, explorerIndex(signal)),
    );
    baselines[signal] = { ...diff, contrast: baselineContrast(diff) };
  });
  return {
    level,
    rate,
    factor,
    raw: { ...rawCI, call: greaterCall(rawCI) },
    logit,
    bonus,
    baselines,
  };
}

function reportOf(rows: RateSample[]): Report {
  const ladder = rateLadder();
  const levels = ladder.map((cell) => levelReport(rows, cell.level, cell.rate, cell.factor));
  const peaks = {} as Report["peaks"];
  for (const level of ["slow", "below", "above", "fast"] as const) {
    peaks[level] = column(
      rows,
      (row) => row.doors.at.logit.rho - row.doors[level].logit.rho,
      ratePeakSalt(level),
    );
  }
  const rises = {} as Report["rises"];
  for (const signal of ["surprise", "rnd", "count"] as const) {
    rises[signal] = column(
      rows,
      (row) => row.doors.fast.logit[signal] - row.doors.at.logit[signal],
      rateRiseSalt(signal),
    );
  }
  const at = levels.find((cell) => cell.level === "at")!;
  const fast = levels.find((cell) => cell.level === "fast")!;
  const summary = rateSummary({
    atAttracted: at.logit.rho.phaseClass === "attracted",
    peakSlow: peaks.slow.call,
    peakFast: peaks.fast.call,
    fastRho: fast.logit.rho.notAttracted,
    fastSurprise: fast.logit.surprise.phaseClass,
  });
  return {
    n: rows.length,
    summary,
    verdict: rateVerdict(summary),
    delta: RATE_DELTA,
    levels,
    peaks,
    rises,
  };
}

type RGB = [number, number, number];

function colorFor(mean: number, lo: number, hi: number): RGB {
  const t = Math.max(-1, Math.min(1, mean / RATE_COLOR_CLAMP));
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
  const width = 900;
  const height = 500;
  const rgba = new Uint8Array(width * height * 4);
  rgba.fill(255);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  drawText(rgba, width, 12, 10, "Door logit, drifting room minus held room", [20, 20, 20]);
  drawText(rgba, width, 12, 24, `Color saturates at plus or minus ${RATE_COLOR_CLAMP.toFixed(2)}. A pale cell has a CI that includes 0.`, [60, 60, 60]);
  drawText(rgba, width, 520, 10, `detection threshold ${report.delta.toFixed(4)}`, [40, 40, 40]);
  const cellW = 150;
  const cellH = 64;
  const left = 88;
  const top = 92;
  report.levels.forEach((level, index) => {
    const x = left + index * cellW;
    drawText(rgba, width, x + 8, 48, level.level, [20, 20, 20]);
    drawText(rgba, width, x + 8, 62, level.rate.toPrecision(4), [40, 40, 40]);
  });
  PHASE_EXPLORERS.forEach((signal, row) => {
    const y = top + row * cellH;
    drawText(rgba, width, 12, y + 24, signal, [20, 20, 20]);
    report.levels.forEach((level, index) => {
      const point = level.logit[signal];
      const x = left + index * cellW;
      fillRect(rgba, width, x, y, cellW - 8, cellH - 6, colorFor(point.mean, point.lo, point.hi));
      if (point.lo > 0 || point.hi < 0) fillRect(rgba, width, x, y, cellW - 8, 3, [20, 20, 20]);
      drawText(rgba, width, x + 6, y + 10, point.mean.toFixed(4), [25, 25, 25]);
      drawText(rgba, width, x + 6, y + 24, `[${point.lo.toFixed(3)},${point.hi.toFixed(3)}]`, [25, 25, 25]);
      if (signal === "rho") drawText(rgba, width, x + 6, y + 40, point.phaseClass === "null-with-sensitivity" ? "null" : point.phaseClass === "inconclusive" ? "inconcl" : point.phaseClass, [25, 25, 25]);
    });
  });
  drawText(rgba, width, 12, top + PHASE_EXPLORERS.length * cellH + 8, `summary ${report.summary}`, [40, 40, 40]);
  writeFileSync(`${OUT}/rate.png`, writePng(width, height, rgba));
}

function writeCsv(report: Report) {
  const lines = ["level,rate,signal,quantity,mean,lo,hi,call,class"];
  const push = (level: string, rate: number, signal: string, quantity: string, ci: Interval & { call?: Call; phaseClass?: PhaseClass }) => {
    lines.push([level, rate, signal, quantity, ci.mean, ci.lo, ci.hi, ci.call ?? "", ci.phaseClass ?? ""].join(","));
  };
  for (const level of report.levels) {
    for (const signal of PHASE_EXPLORERS) {
      push(level.level, level.rate, signal, "logit", level.logit[signal]);
      push(level.level, level.rate, signal, "bonus", level.bonus[signal]);
    }
    push(level.level, level.rate, "realized", "raw", level.raw);
    for (const signal of ["random", "count", "surprise", "rnd"] as const) {
      push(level.level, level.rate, `rho-${signal}`, "logit", level.baselines[signal]);
    }
  }
  for (const level of ["slow", "below", "above", "fast"] as const) {
    push("at-minus", report.levels.find((cell) => cell.level === level)!.rate, "rho", level, report.peaks[level]);
  }
  for (const signal of ["surprise", "rnd", "count"] as const) {
    push("fast-minus-at", report.levels.find((cell) => cell.level === "fast")!.rate, signal, "rise", report.rises[signal]);
  }
  writeFileSync(`${OUT}/rate.csv`, lines.join("\n") + "\n");
}

function writeMd(report: Report) {
  const lines: string[] = [];
  lines.push(`Summary ${report.summary}. Verdict ${report.verdict}.`);
  lines.push("");
  lines.push(`Detection threshold ${report.delta.toFixed(4)}, the published plant. Not remeasured.`);
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
  lines.push("Rho at 1/τ minus rho at the other rate. Slow and fast are the peak. The 4× rates are not.");
  lines.push("");
  lines.push("| contrast | logit |");
  lines.push("|---|---|");
  for (const level of ["slow", "below", "above", "fast"] as const) {
    lines.push(`| at − ${level} | ${fmt(report.peaks[level])} ${report.peaks[level].call} |`);
  }
  lines.push("");
  lines.push("Fast rate minus the adaptation rate. Reported. Not the summary.");
  lines.push("");
  lines.push("| signal | fast − at |");
  lines.push("|---|---|");
  for (const signal of ["surprise", "rnd", "count"] as const) {
    lines.push(`| ${signal} | ${fmt(report.rises[signal])} ${report.rises[signal].call} |`);
  }
  lines.push("");
  lines.push("Unmixed bonus, not the call.");
  lines.push("");
  lines.push("| rate | rho | surprise | rnd | count |");
  lines.push("|---|---|---|---|---|");
  for (const level of report.levels) {
    lines.push(`| ${level.level} | ${fmt(level.bonus.rho)} | ${fmt(level.bonus.surprise)} | ${fmt(level.bonus.rnd)} | ${fmt(level.bonus.count)} |`);
  }
  writeFileSync(`${OUT}/rate.md`, lines.join("\n") + "\n");
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (process.argv.includes("--figure")) {
    const saved = JSON.parse(readFileSync(`${OUT}/rate.json`, "utf8")) as { report: Report };
    writeFigure(saved.report);
    return;
  }
  const ladder = rateLadder();
  const at = ladder.find((cell) => cell.level === "at");
  if (!at || at.rate !== 0.01877) abort(`at-cell ${at?.rate} is not 0.01877`);
  const jobs: RateJob[] = SEEDS.map((seed, id) => ({ id, seed }));
  const workers = workerCount();
  const t0 = Date.now();
  console.error(`rate: ${jobs.length} seeds, 400 steps, ${ladder.map((cell) => cell.rate).join(" ")}, ${workers} workers`);
  const rows = await runPool<RateJob, RateSample>(jobs, new URL("./rate-worker.ts", import.meta.url), workers);
  console.error(`rate: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const ordered = rows.slice().sort((a, b) => a.seed - b.seed);
  if (ordered.length !== SEEDS.length || ordered.some((row, i) => row.seed !== SEEDS[i])) abort("rate did not return seeds 1–200");
  miss("rho at", meanOf(ordered.map((row) => row.doors.at.logit.rho)), PUBLISHED_AT_RHO);
  miss("surprise at", meanOf(ordered.map((row) => row.doors.at.logit.surprise)), PUBLISHED_AT_SURPRISE);
  miss("rnd at", meanOf(ordered.map((row) => row.doors.at.logit.rnd)), PUBLISHED_AT_RND);
  miss("count at", meanOf(ordered.map((row) => row.doors.at.logit.count)), PUBLISHED_AT_COUNT);
  miss("raw at", meanOf(ordered.map((row) => row.doors.at.raw)), PUBLISHED_AT_RAW);
  miss("rho bonus at", meanOf(ordered.map((row) => row.doors.at.bonus.rho)), PUBLISHED_AT_RHO_BONUS);
  miss("surprise bonus at", meanOf(ordered.map((row) => row.doors.at.bonus.surprise)), PUBLISHED_AT_SURPRISE_BONUS);
  miss("rnd bonus at", meanOf(ordered.map((row) => row.doors.at.bonus.rnd)), PUBLISHED_AT_RND_BONUS);
  for (const row of ordered) {
    for (const level of RATE_LEVELS) {
      if (row.doors[level].bonus.count !== 0) abort(`count bonus moved on seed ${row.seed} ${level}`);
      if (row.doors[level].logit.random !== 0) abort(`random logit moved on seed ${row.seed} ${level}`);
    }
  }
  const report = reportOf(ordered);
  console.error(`summary ${report.summary}; verdict ${report.verdict}`);
  for (const level of report.levels) {
    console.error(`${level.level} ${level.rate} rho ${fmt(level.logit.rho)} ${level.logit.rho.phaseClass} surprise ${fmt(level.logit.surprise)} ${level.logit.surprise.phaseClass}`);
  }
  for (const level of ["slow", "fast"] as const) console.error(`at − ${level} ${fmt(report.peaks[level])} ${report.peaks[level].call}`);
  const body = {
    date: new Date().toISOString(),
    seeds: SEEDS,
    seconds: (Date.now() - t0) / 1000,
    delta: RATE_DELTA,
    ladder,
    report,
    samples: ordered,
  };
  writeFileSync(`${OUT}/rate.json`, JSON.stringify(body));
  writeCsv(report);
  writeMd(report);
  writeFigure(report);
}

main();
