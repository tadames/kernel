/**
 * Does the open-band expected-error inversion survive a harder pattern?
 * Not part of CI.
 *
 *   npm run hard
 *
 * Seeds 1–800, 400 steps, shipped temperature. Pattern minus matched noise.
 * Codes: stripes (published), blocks (the other period-4 rule), static
 * (a frozen fair-bit picture). The call is the open band, exposure at most 2.
 * Writes bench/hard/hard.json, hard.csv, and hard-gap.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  CREDIT_RHO_CONTENT_MEAN,
  CREDIT_RHO_CONTENT_N,
  CREDIT_RHO_OCCUPANCY,
  CREDIT_RHO_RECT_N,
  CREDIT_RHO_RECTIFIED,
} from "../src/lib/kernel/chain-run.ts";
import {
  REACH_ROOM_DROP2_HI,
  REACH_ROOM_DROP2_LO,
  REACH_ROOM_DROP2_MEAN,
  REACH_ROOM_DROP2_N,
  REACH_ROOM_DROP2_SALT,
} from "../src/lib/kernel/invert-run.ts";
import {
  INVERT_RES1_HI,
  INVERT_RES1_LO,
  INVERT_RES1_MEAN,
  INVERT_RES1_N,
  INVERT_RES1_SALT,
  INVERT_SIGNED_HI,
  INVERT_SIGNED_LO,
  INVERT_SIGNED_MEAN,
  INVERT_SIGNED_N,
  INVERT_SIGNED_SALT,
  SOURCE_ERR1_SALT,
  SOURCE_ERROR_DELTA,
  SOURCE_ERROR_SALT,
} from "../src/lib/kernel/source-run.ts";
import {
  ONSET_BIN_ERR1_SALT,
  ONSET_BIN_SALT,
  ONSET_ERR1_LATE_HI,
  ONSET_ERR1_LATE_LO,
  ONSET_ERR1_LATE_MEAN,
  ONSET_ERR1_LATE_N,
  ONSET_ERR1_OPEN_HI,
  ONSET_ERR1_OPEN_LO,
  ONSET_ERR1_OPEN_MEAN,
  ONSET_ERR1_OPEN_N,
  ONSET_ERROR_LATE_HI,
  ONSET_ERROR_LATE_LO,
  ONSET_ERROR_LATE_MEAN,
  ONSET_ERROR_LATE_N,
  ONSET_ERROR_OPEN_HI,
  ONSET_ERROR_OPEN_LO,
  ONSET_ERROR_OPEN_MEAN,
  ONSET_ERROR_OPEN_N,
  ONSET_OPEN,
  SOURCE_ERR1_HI,
  SOURCE_ERR1_LO,
  SOURCE_ERR1_MEAN,
  SOURCE_ERR1_N,
  SOURCE_ERROR_HI,
  SOURCE_ERROR_LO,
  SOURCE_ERROR_MEAN,
  SOURCE_ERROR_N,
  type OnsetArm,
  type OnsetRequest,
  type OnsetResult,
  type PatternCode,
} from "../src/lib/kernel/onset-run.ts";
import {
  creditContentClass,
  greaterCall,
  hardSummary,
  hardVerdict,
  MIN_ROOM_STEPS,
  SHIPPED_POLICY_TEMPERATURE,
  type Call,
  type CreditClass,
  type HardLink,
} from "../src/lib/kernel/noise.ts";
import type { CuriositySignal } from "../src/lib/kernel/signals.ts";
import { bootstrapMeanCI, meanOf, type Interval } from "../src/lib/kernel/stats.ts";
import { drawText, fillRect, scaleNearest, writePng } from "./png.ts";
import { runPool, workerCount } from "./pool.ts";

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) return fallback;
  return process.argv[i + 1]!;
}

type RGB = [number, number, number];

const EXPLORERS = [
  { id: "random", signal: "random" },
  { id: "count", signal: "count" },
  { id: "surprise", signal: "surprise" },
  { id: "rnd", signal: "rnd" },
  { id: "rho", signal: "rho" },
] as const;

type ExplorerId = (typeof EXPLORERS)[number]["id"];

const CODES: PatternCode[] = ["stripes", "blocks", "static"];

const COLOR: RGB = [140, 60, 180];

const ARMS: OnsetArm[] = ["pattern", "noise"];

/** Blocks, then static. Stripes reuse the onset salts. */
const OPEN_SALT: Record<PatternCode, { error: number; err1: number }> = {
  stripes: { error: ONSET_BIN_SALT[0], err1: ONSET_BIN_ERR1_SALT[0] },
  blocks: { error: 31121, err1: 31131 },
  static: { error: 31221, err1: 31231 },
};

const ALL_SALT: Record<PatternCode, { error: number; err1: number }> = {
  stripes: { error: SOURCE_ERROR_SALT, err1: SOURCE_ERR1_SALT },
  blocks: { error: 31101, err1: 31104 },
  static: { error: 31201, err1: 31204 },
};

const LATE_SALT: Record<PatternCode, { error: number; err1: number }> = {
  stripes: { error: ONSET_BIN_SALT[4], err1: ONSET_BIN_ERR1_SALT[4] },
  blocks: { error: 31125, err1: 31135 },
  static: { error: 31225, err1: 31235 },
};

const OCC_SALT: Record<PatternCode, number> = { stripes: 26204, blocks: 31140, static: 31240 };

const RECT_SALT: Record<PatternCode, number> = { stripes: 26304, blocks: 31141, static: 31241 };

function fmt(ci: { mean: number; lo: number; hi: number }) {
  return `${ci.mean.toFixed(4)} [${ci.lo.toFixed(4)}, ${ci.hi.toFixed(4)}]`;
}

function keyOf(code: PatternCode, id: ExplorerId, arm: OnsetArm, seed: number) {
  return `${code}|${id}|${arm}|${seed}`;
}

type PieceRow = Interval & { klass: CreditClass };

type CodeReport = {
  code: PatternCode;
  errorOpen: PieceRow;
  err1Open: PieceRow;
  errorAll: PieceRow;
  err1All: PieceRow;
  errorLate: PieceRow;
  err1Late: PieceRow;
  occupancy: Interval;
  rectified: Interval;
  meanRoomSteps: { pattern: number; noise: number };
  meanOpenSteps: { pattern: number; noise: number };
};

type Report = {
  temperature: number;
  steps: number;
  seeds: number;
  errorDelta: number;
  openExposure: number;
  summary: HardLink;
  verdict: Call;
  codes: CodeReport[];
  harnessOk: boolean;
  elapsedSec: number;
  workers: number;
};

function blank(width: number, height: number) {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 255;
    rgba[i + 1] = 255;
    rgba[i + 2] = 255;
    rgba[i + 3] = 255;
  }
  return rgba;
}

function vline(rgba: Uint8Array, width: number, x: number, top: number, bottom: number, rgb: RGB) {
  const px = Math.round(x);
  for (let y = top; y <= bottom; y++) {
    const i = (y * width + px) * 4;
    if (i < 0 || i + 3 >= rgba.length) continue;
    rgba[i] = rgb[0];
    rgba[i + 1] = rgb[1];
    rgba[i + 2] = rgb[2];
    rgba[i + 3] = 255;
  }
}

type Bar = { name: string; mean: number; lo: number; hi: number };

function drawPanel(rgba: Uint8Array, width: number, bars: Bar[], title: string, top: number, delta: number) {
  drawText(rgba, width, 16, top, title, [30, 30, 30]);
  const left = 160;
  const right = width - 28;
  const plotTop = top + 22;
  const plotBottom = top + 16 + bars.length * 36;
  let xMin = -delta;
  let xMax = delta;
  for (const bar of bars) {
    xMin = Math.min(xMin, bar.lo, bar.mean);
    xMax = Math.max(xMax, bar.hi, bar.mean);
  }
  const pad = Math.max(0.002, (xMax - xMin) * 0.12);
  xMin -= pad;
  xMax += pad;
  const xOf = (value: number) => left + ((value - xMin) / (xMax - xMin || 1)) * (right - left);
  vline(rgba, width, xOf(0), plotTop, plotBottom, [170, 170, 170]);
  vline(rgba, width, xOf(delta), plotTop, plotBottom, [210, 180, 80]);
  vline(rgba, width, xOf(-delta), plotTop, plotBottom, [210, 180, 80]);
  bars.forEach((bar, i) => {
    const y = plotTop + 6 + i * 36;
    drawText(rgba, width, 16, y - 2, bar.name, [30, 30, 30]);
    const x0 = Math.round(xOf(bar.lo));
    const x1 = Math.round(xOf(bar.hi));
    fillRect(rgba, width, Math.min(x0, x1), y + 6, Math.max(2, Math.abs(x1 - x0)), 4, COLOR);
    fillRect(rgba, width, Math.round(xOf(bar.mean)) - 3, y, 6, 16, COLOR);
  });
  return plotBottom;
}

function drawGaps(report: Report) {
  const width = 920;
  const height = 420;
  const rgba = blank(width, height);
  drawText(rgba, width, 8, 8, "open band by pattern code, pattern minus noise", [30, 30, 30]);
  drawText(rgba, width, 8, 22, "rho, exposure 1-2, shipped temperature. gold lines are the squared-error delta", [90, 60, 120]);
  const by = (pick: (row: CodeReport) => PieceRow): Bar[] =>
    report.codes.map((row) => ({ name: row.code, ...pick(row) }));
  const bottom = drawPanel(rgba, width, by((row) => row.errorOpen), "expected-error drop", 48, report.errorDelta);
  drawPanel(rgba, width, by((row) => row.err1Open), "first-window expected error", bottom + 28, report.errorDelta);
  const scaled = scaleNearest(rgba, width, height, 2);
  return writePng(scaled.width, scaled.height, scaled.rgba);
}

function writeOutputs(report: Report) {
  mkdirSync("bench/hard", { recursive: true });
  writeFileSync("bench/hard/hard.json", JSON.stringify(report, null, 2));
  const lines = ["code,quantity,mean,lo,hi,n,class"];
  for (const row of report.codes) {
    const push = (name: string, piece: PieceRow) => {
      lines.push([row.code, name, piece.mean, piece.lo, piece.hi, piece.n, piece.klass].join(","));
    };
    push("errorOpen", row.errorOpen);
    push("err1Open", row.err1Open);
    push("errorAll", row.errorAll);
    push("err1All", row.err1All);
    push("errorLate", row.errorLate);
    push("err1Late", row.err1Late);
    lines.push(
      [row.code, "occupancy", row.occupancy.mean, row.occupancy.lo, row.occupancy.hi, row.occupancy.n, ""].join(","),
    );
    lines.push(
      [row.code, "rectified", row.rectified.mean, row.rectified.lo, row.rectified.hi, row.rectified.n, ""].join(","),
    );
  }
  writeFileSync("bench/hard/hard.csv", `${lines.join("\n")}\n`);
  writeFileSync("bench/hard/hard-gap.png", drawGaps(report));
}

function rowAt(index: Map<string, OnsetResult>, code: PatternCode, id: ExplorerId, arm: OnsetArm, seed: number) {
  const row = index.get(keyOf(code, id, arm, seed));
  if (!row) throw new Error(`missing ${code} ${id} ${arm} seed ${seed}`);
  return row;
}

function matches(ci: Interval, mean: number, lo: number, hi: number, n: number, label: string) {
  if (ci.n !== n) throw new Error(`${label} n is ${ci.n}, not ${n}`);
  if (Math.abs(ci.mean - mean) > 1e-12) throw new Error(`${label} mean is ${ci.mean}, not ${mean}`);
  if (Math.abs(ci.lo - lo) > 1e-12 || Math.abs(ci.hi - hi) > 1e-12) {
    throw new Error(`${label} interval ${fmt(ci)} does not match`);
  }
}

async function main() {
  if (process.argv.includes("--figure-only")) {
    const saved = JSON.parse(readFileSync("bench/hard/hard.json", "utf8")) as Report;
    writeOutputs(saved);
    return;
  }
  const debug = process.argv.includes("--debug");
  const seedsN = Math.max(1, Number(arg("seeds", "800")));
  const steps = Math.max(1, Number(arg("steps", "400")));
  if (!debug && (seedsN !== 800 || steps !== 400)) {
    throw new Error(`the locked run is 800 seeds and 400 steps, got ${seedsN} and ${steps}`);
  }
  const workers = workerCount(Number(arg("workers", "0")));
  const seeds = Array.from({ length: seedsN }, (_, i) => i + 1);
  const jobs: OnsetRequest[] = [];
  let id = 0;
  for (const code of CODES) {
    for (const seed of seeds) {
      for (const explorer of EXPLORERS) {
        for (const arm of ARMS) {
          jobs.push({
            id: id++,
            seed,
            signal: explorer.signal as CuriositySignal,
            steps,
            arm,
            code,
          });
        }
      }
    }
  }
  console.error(
    `hard ${jobs.length} episodes, ${workers} workers, ${steps} steps, temperature ${SHIPPED_POLICY_TEMPERATURE}`,
  );
  const t0 = Date.now();
  const rows = await runPool<OnsetRequest, OnsetResult>(jobs, new URL("./onset-worker.ts", import.meta.url), workers);
  const elapsedSec = (Date.now() - t0) / 1000;
  console.error(`batch finished in ${elapsedSec.toFixed(1)}s`);
  if (rows.length !== jobs.length) throw new Error(`expected ${jobs.length} rows, got ${rows.length}`);

  const index = new Map<string, OnsetResult>();
  for (const row of rows) {
    if (row.code !== "stripes" && row.code !== "blocks" && row.code !== "static") {
      throw new Error(`seed ${row.seed} returned code ${String(row.code)}`);
    }
    const key = keyOf(row.code, row.signal as ExplorerId, row.arm, row.seed);
    if (index.has(key)) throw new Error(`duplicate ${key}`);
    index.set(key, row);
  }

  for (const code of CODES) {
    for (const seed of seeds) {
      const noise = rowAt(index, code, "random", "noise", seed);
      const pattern = rowAt(index, code, "random", "pattern", seed);
      if (
        pattern.path !== noise.path ||
        pattern.distractorFrac !== noise.distractorFrac ||
        pattern.foods !== noise.foods ||
        pattern.lives !== noise.lives
      ) {
        throw new Error(`random walk diverged at ${code} seed ${seed}`);
      }
      const stripe = rowAt(index, "stripes", "random", "noise", seed);
      if (
        pattern.path !== stripe.path ||
        pattern.distractorFrac !== stripe.distractorFrac ||
        pattern.foods !== stripe.foods ||
        pattern.lives !== stripe.lives
      ) {
        throw new Error(`random walk diverged across codes at ${code} seed ${seed}`);
      }
    }
  }

  for (const code of CODES) {
    for (const explorer of EXPLORERS) {
      if (explorer.id === "rho") continue;
      for (const seed of seeds) {
        for (const arm of ARMS) {
          const row = rowAt(index, code, explorer.id, arm, seed);
          if (row.roomSteps >= 1 && row.drop2 !== 0) {
            throw new Error(`${code} ${explorer.id} ${arm} seed ${seed} wrote a horizon drop`);
          }
          if (row.error !== 0 || row.err1 !== 0) {
            throw new Error(`${code} ${explorer.id} ${arm} seed ${seed} wrote an expected error`);
          }
        }
      }
    }
  }

  const present = (band: number) => (row: OnsetResult) => (row.binSteps[band]! >= 1 ? row.binError[band]! : null);
  const presentErr = (band: number) => (row: OnsetResult) => (row.binSteps[band]! >= 1 ? row.binErr1[band]! : null);
  const allError = (row: OnsetResult) => (row.roomSteps >= 1 ? row.error : null);
  const allErr1 = (row: OnsetResult) => (row.roomSteps >= 1 ? row.err1 : null);

  const gapOf = (code: PatternCode, id: ExplorerId, pick: (row: OnsetResult) => number | null) => {
    const gap: number[] = [];
    for (const seed of seeds) {
      const pattern = pick(rowAt(index, code, id, "pattern", seed));
      const noise = pick(rowAt(index, code, id, "noise", seed));
      if (pattern == null || noise == null) continue;
      gap.push(pattern - noise);
    }
    return gap;
  };

  const classGap = (gap: number[], salt: number) => {
    const ci = bootstrapMeanCI(gap, 2000, 0.05, salt);
    return { ...ci, klass: creditContentClass(ci, ci.n, seedsN, SOURCE_ERROR_DELTA) };
  };

  for (const code of CODES) {
    const codeIndex = CODES.indexOf(code);
    const randomCall = (pick: (row: OnsetResult) => number | null, salt: number, label: string) => {
      const gap = gapOf(code, "random", pick);
      if (gap.length * 2 <= seedsN) throw new Error(`${code} random kept too few seeds for ${label}`);
      if (meanOf(gap) !== 0) throw new Error(`${code} random ${label} mean is ${meanOf(gap)}`);
      const ci = bootstrapMeanCI(gap, 2000, 0.05, salt);
      if (greaterCall(ci) !== "inconclusive") throw new Error(`${code} random ${label} excluded 0`);
    };
    randomCall(present(0), 31300 + codeIndex * 10 + 1, "error open");
    randomCall(presentErr(0), 31300 + codeIndex * 10 + 2, "err1 open");
    randomCall(allError, 31300 + codeIndex * 10 + 3, "error");
    randomCall(allErr1, 31300 + codeIndex * 10 + 4, "err1");
  }

  const codes: CodeReport[] = CODES.map((code) => {
    const errorOpen = classGap(gapOf(code, "rho", present(0)), OPEN_SALT[code].error);
    const err1Open = classGap(gapOf(code, "rho", presentErr(0)), OPEN_SALT[code].err1);
    const errorAll = classGap(gapOf(code, "rho", allError), ALL_SALT[code].error);
    const err1All = classGap(gapOf(code, "rho", allErr1), ALL_SALT[code].err1);
    const errorLate = classGap(gapOf(code, "rho", present(4)), LATE_SALT[code].error);
    const err1Late = classGap(gapOf(code, "rho", presentErr(4)), LATE_SALT[code].err1);
    const occ = gapOf(code, "rho", (row) => row.distractorFrac);
    const rect = gapOf(code, "rho", (row) => (row.east.n >= MIN_ROOM_STEPS ? row.east.rectifiedMean : null));
    const meanOpen = (arm: OnsetArm) => {
      let s = 0;
      for (const seed of seeds) s += rowAt(index, code, "rho", arm, seed).binSteps[0]!;
      return s / seedsN;
    };
    const meanRoom = (arm: OnsetArm) => {
      let s = 0;
      for (const seed of seeds) s += rowAt(index, code, "rho", arm, seed).roomSteps;
      return s / seedsN;
    };
    return {
      code,
      errorOpen,
      err1Open,
      errorAll,
      err1All,
      errorLate,
      err1Late,
      occupancy: bootstrapMeanCI(occ, 2000, 0.05, OCC_SALT[code]),
      rectified: bootstrapMeanCI(rect, 2000, 0.05, RECT_SALT[code]),
      meanRoomSteps: { pattern: meanRoom("pattern"), noise: meanRoom("noise") },
      meanOpenSteps: { pattern: meanOpen("pattern"), noise: meanOpen("noise") },
    };
  });

  const stripes = codes[0]!;
  if (stripes.code !== "stripes") throw new Error("stripes is not the first code");
  if (!debug) {
    matches(stripes.errorAll, SOURCE_ERROR_MEAN, SOURCE_ERROR_LO, SOURCE_ERROR_HI, SOURCE_ERROR_N, "stripes error");
    matches(stripes.err1All, SOURCE_ERR1_MEAN, SOURCE_ERR1_LO, SOURCE_ERR1_HI, SOURCE_ERR1_N, "stripes err1");
    matches(
      stripes.errorOpen,
      ONSET_ERROR_OPEN_MEAN,
      ONSET_ERROR_OPEN_LO,
      ONSET_ERROR_OPEN_HI,
      ONSET_ERROR_OPEN_N,
      "stripes error open",
    );
    matches(
      stripes.err1Open,
      ONSET_ERR1_OPEN_MEAN,
      ONSET_ERR1_OPEN_LO,
      ONSET_ERR1_OPEN_HI,
      ONSET_ERR1_OPEN_N,
      "stripes err1 open",
    );
    matches(
      stripes.errorLate,
      ONSET_ERROR_LATE_MEAN,
      ONSET_ERROR_LATE_LO,
      ONSET_ERROR_LATE_HI,
      ONSET_ERROR_LATE_N,
      "stripes error late",
    );
    matches(
      stripes.err1Late,
      ONSET_ERR1_LATE_MEAN,
      ONSET_ERR1_LATE_LO,
      ONSET_ERR1_LATE_HI,
      ONSET_ERR1_LATE_N,
      "stripes err1 late",
    );
    if (Math.abs(stripes.occupancy.mean - CREDIT_RHO_OCCUPANCY) > 1e-12) {
      throw new Error(`stripes occupancy is ${stripes.occupancy.mean}, not the credit mean`);
    }
    if (
      Math.abs(stripes.occupancy.lo - -0.008018749999999995) > 1e-12 ||
      Math.abs(stripes.occupancy.hi - 0.012543750000000003) > 1e-12
    ) {
      throw new Error(`stripes occupancy interval ${fmt(stripes.occupancy)} is not the credit interval`);
    }
    if (stripes.rectified.n !== CREDIT_RHO_RECT_N) {
      throw new Error(`stripes rectified n is ${stripes.rectified.n}, not ${CREDIT_RHO_RECT_N}`);
    }
    if (Math.abs(stripes.rectified.mean - CREDIT_RHO_RECTIFIED) > 1e-12) {
      throw new Error(`stripes rectified mean is ${stripes.rectified.mean}, not the credit mean`);
    }
    if (
      Math.abs(stripes.rectified.lo - 0.020584800349733586) > 1e-12 ||
      Math.abs(stripes.rectified.hi - 0.022222900562580226) > 1e-12
    ) {
      throw new Error(`stripes rectified interval ${fmt(stripes.rectified)} is not the credit interval`);
    }
    const dropCi = bootstrapMeanCI(
      gapOf("stripes", "rho", (row) => (row.roomSteps >= 1 ? row.drop2 : null)),
      2000,
      0.05,
      REACH_ROOM_DROP2_SALT,
    );
    const signedCi = bootstrapMeanCI(
      gapOf("stripes", "rho", (row) => (row.roomSteps >= 1 ? row.signed : null)),
      2000,
      0.05,
      INVERT_SIGNED_SALT,
    );
    const resCi = bootstrapMeanCI(
      gapOf("stripes", "rho", (row) => (row.roomSteps >= 1 ? row.res1 : null)),
      2000,
      0.05,
      INVERT_RES1_SALT,
    );
    matches(dropCi, REACH_ROOM_DROP2_MEAN, REACH_ROOM_DROP2_LO, REACH_ROOM_DROP2_HI, REACH_ROOM_DROP2_N, "stripes drop");
    matches(signedCi, INVERT_SIGNED_MEAN, INVERT_SIGNED_LO, INVERT_SIGNED_HI, INVERT_SIGNED_N, "stripes signed");
    matches(resCi, INVERT_RES1_MEAN, INVERT_RES1_LO, INVERT_RES1_HI, INVERT_RES1_N, "stripes res1");
    const content = gapOf("stripes", "rho", (row) => (row.scoreSteps >= 1 ? row.scoreGap : null));
    if (content.length !== CREDIT_RHO_CONTENT_N) {
      throw new Error(`stripes doorway n is ${content.length}, not ${CREDIT_RHO_CONTENT_N}`);
    }
    if (Math.abs(meanOf(content) - CREDIT_RHO_CONTENT_MEAN) > 1e-12) {
      throw new Error(`stripes doorway mean is ${meanOf(content)}, not the credit mean`);
    }
  }

  const blocks = codes[1]!;
  const frozen = codes[2]!;
  if (blocks.code !== "blocks" || frozen.code !== "static") throw new Error("the code order moved");
  const summary = hardSummary(
    false,
    stripes.errorOpen.klass,
    stripes.err1Open.klass,
    blocks.errorOpen.klass,
    frozen.errorOpen.klass,
    frozen.err1Open.klass,
  );
  const verdict = hardVerdict(summary);
  const report: Report = {
    temperature: SHIPPED_POLICY_TEMPERATURE,
    steps,
    seeds: seedsN,
    errorDelta: SOURCE_ERROR_DELTA,
    openExposure: ONSET_OPEN,
    summary,
    verdict,
    codes,
    harnessOk: true,
    elapsedSec,
    workers,
  };
  writeOutputs(report);
  const lines = [
    `summary ${summary}`,
    `verdict ${verdict}`,
    `errorDelta ${SOURCE_ERROR_DELTA}`,
    ...codes.flatMap((row) => [
      `${row.code} errorOpen ${fmt(row.errorOpen)} n=${row.errorOpen.n} ${row.errorOpen.klass}`,
      `${row.code} err1Open ${fmt(row.err1Open)} n=${row.err1Open.n} ${row.err1Open.klass}`,
      `${row.code} errorAll ${fmt(row.errorAll)} n=${row.errorAll.n} ${row.errorAll.klass}`,
      `${row.code} err1All ${fmt(row.err1All)} n=${row.err1All.n} ${row.err1All.klass}`,
      `${row.code} errorLate ${fmt(row.errorLate)} n=${row.errorLate.n} ${row.errorLate.klass}`,
      `${row.code} err1Late ${fmt(row.err1Late)} n=${row.err1Late.n} ${row.err1Late.klass}`,
      `${row.code} occupancy ${fmt(row.occupancy)} n=${row.occupancy.n}`,
      `${row.code} rectified ${fmt(row.rectified)} n=${row.rectified.n}`,
      `${row.code} open steps ${row.meanOpenSteps.pattern.toFixed(2)}/${row.meanOpenSteps.noise.toFixed(2)}`,
      `${row.code} room steps ${row.meanRoomSteps.pattern.toFixed(2)}/${row.meanRoomSteps.noise.toFixed(2)}`,
    ]),
    `elapsed ${elapsedSec.toFixed(1)}s`,
  ];
  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
