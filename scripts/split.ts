/**
 * Which coordinates pay the frozen picture's open-band noise preference?
 * Not part of CI.
 *
 *   npm run split
 *
 * Seeds 1–800, 400 steps, shipped temperature. Picture minus matched noise.
 * The picture is one frozen fair-bit draw. Fixed channels are walls, food,
 * and the west pattern. East bits are the region-1 glow. The call is the
 * open band, exposure at most 2. Writes bench/split/split.json, split.csv,
 * and split-gap.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  STATIC_ERR1_HI,
  STATIC_ERR1_LATE_HI,
  STATIC_ERR1_LATE_LO,
  STATIC_ERR1_LATE_MEAN,
  STATIC_ERR1_LATE_N,
  STATIC_ERR1_LO,
  STATIC_ERR1_MEAN,
  STATIC_ERR1_N,
  STATIC_ERR1_OPEN_HI,
  STATIC_ERR1_OPEN_LO,
  STATIC_ERR1_OPEN_MEAN,
  STATIC_ERR1_OPEN_N,
  STATIC_ERROR_HI,
  STATIC_ERROR_LATE_HI,
  STATIC_ERROR_LATE_LO,
  STATIC_ERROR_LATE_MEAN,
  STATIC_ERROR_LATE_N,
  STATIC_ERROR_LO,
  STATIC_ERROR_MEAN,
  STATIC_ERROR_N,
  STATIC_ERROR_OPEN_HI,
  STATIC_ERROR_OPEN_LO,
  STATIC_ERROR_OPEN_MEAN,
  STATIC_ERROR_OPEN_N,
  STATIC_OCCUPANCY_HI,
  STATIC_OCCUPANCY_LO,
  STATIC_OCCUPANCY_MEAN,
  STATIC_RECT_HI,
  STATIC_RECT_LO,
  STATIC_RECT_MEAN,
  STATIC_RECT_N,
  runSplitEpisode,
} from "../src/lib/kernel/split-run.ts";
import { ONSET_OPEN, type OnsetArm, type OnsetRequest, type OnsetResult } from "../src/lib/kernel/onset-run.ts";
import {
  creditContentClass,
  greaterCall,
  MIN_ROOM_STEPS,
  SHIPPED_POLICY_TEMPERATURE,
  splitSummary,
  splitVerdict,
  type Call,
  type CreditClass,
  type SplitLink,
} from "../src/lib/kernel/noise.ts";
import type { CuriositySignal } from "../src/lib/kernel/signals.ts";
import { bootstrapMeanCI, meanOf, type Interval } from "../src/lib/kernel/stats.ts";
import { SOURCE_ERROR_DELTA } from "../src/lib/kernel/source-run.ts";
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

const COLOR: RGB = [140, 60, 180];

const ARMS: OnsetArm[] = ["pattern", "noise"];

/** Open-band salts. Totals reuse the static hard salts. Pieces are new. */
const OPEN_SALT = { error: 31221, err1: 31231, fixed: 32121, east: 32122, fixedErr1: 32131, eastErr1: 32132 };

const ALL_SALT = { error: 31201, err1: 31204, fixed: 32101, east: 32102, fixedErr1: 32104, eastErr1: 32105 };

const LATE_SALT = { error: 31225, err1: 31235, fixed: 32125, east: 32126, fixedErr1: 32135, eastErr1: 32136 };

const OCC_SALT = 31240;

const RECT_SALT = 31241;

function fmt(ci: { mean: number; lo: number; hi: number }) {
  return `${ci.mean.toFixed(4)} [${ci.lo.toFixed(4)}, ${ci.hi.toFixed(4)}]`;
}

function keyOf(id: ExplorerId, arm: OnsetArm, seed: number) {
  return `${id}|${arm}|${seed}`;
}

type PieceRow = Interval & { klass: CreditClass };

type BandReport = {
  error: PieceRow;
  err1: PieceRow;
  fixed: PieceRow;
  east: PieceRow;
  fixedErr1: PieceRow;
  eastErr1: PieceRow;
};

type Report = {
  temperature: number;
  steps: number;
  seeds: number;
  errorDelta: number;
  openExposure: number;
  summary: SplitLink;
  verdict: Call;
  open: BandReport;
  all: BandReport;
  late: BandReport;
  occupancy: Interval;
  rectified: Interval;
  meanRoomSteps: { pattern: number; noise: number };
  meanOpenSteps: { pattern: number; noise: number };
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
  drawText(rgba, width, 8, 8, "frozen picture, open band, picture minus noise", [30, 30, 30]);
  drawText(rgba, width, 8, 22, "rho, exposure 1-2, shipped temperature. gold lines are the squared-error delta", [90, 60, 120]);
  const bars = (drop: boolean): Bar[] => [
    { name: "fixed", ...(drop ? report.open.fixed : report.open.fixedErr1) },
    { name: "east", ...(drop ? report.open.east : report.open.eastErr1) },
    { name: "total", ...(drop ? report.open.error : report.open.err1) },
  ];
  const bottom = drawPanel(rgba, width, bars(true), "expected-error drop", 48, report.errorDelta);
  drawPanel(rgba, width, bars(false), "first-window expected error", bottom + 28, report.errorDelta);
  const scaled = scaleNearest(rgba, width, height, 2);
  return writePng(scaled.width, scaled.height, scaled.rgba);
}

function writeOutputs(report: Report) {
  mkdirSync("bench/split", { recursive: true });
  writeFileSync("bench/split/split.json", JSON.stringify(report, null, 2));
  const lines = ["band,piece,mean,lo,hi,n,class"];
  const pushBand = (name: string, band: BandReport) => {
    for (const piece of ["error", "err1", "fixed", "east", "fixedErr1", "eastErr1"] as const) {
      const row = band[piece];
      lines.push([name, piece, row.mean, row.lo, row.hi, row.n, row.klass].join(","));
    }
  };
  pushBand("open", report.open);
  pushBand("all", report.all);
  pushBand("late", report.late);
  lines.push(
    ["occupancy", "gap", report.occupancy.mean, report.occupancy.lo, report.occupancy.hi, report.occupancy.n, ""].join(
      ",",
    ),
  );
  lines.push(
    ["rectified", "gap", report.rectified.mean, report.rectified.lo, report.rectified.hi, report.rectified.n, ""].join(
      ",",
    ),
  );
  writeFileSync("bench/split/split.csv", `${lines.join("\n")}\n`);
  writeFileSync("bench/split/split-gap.png", drawGaps(report));
}

function rowAt(index: Map<string, OnsetResult>, id: ExplorerId, arm: OnsetArm, seed: number) {
  const row = index.get(keyOf(id, arm, seed));
  if (!row) throw new Error(`missing ${id} ${arm} seed ${seed}`);
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
    const saved = JSON.parse(readFileSync("bench/split/split.json", "utf8")) as Report;
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
  for (const seed of seeds) {
    for (const explorer of EXPLORERS) {
      for (const arm of ARMS) {
        jobs.push({
          id: id++,
          seed,
          signal: explorer.signal as CuriositySignal,
          steps,
          arm,
          code: "static",
          traceSplit: true,
        });
      }
    }
  }
  console.error(
    `split ${jobs.length} episodes, ${workers} workers, ${steps} steps, temperature ${SHIPPED_POLICY_TEMPERATURE}`,
  );
  const t0 = Date.now();
  const rows = await runPool<OnsetRequest, OnsetResult>(jobs, new URL("./split-worker.ts", import.meta.url), workers);
  const elapsedSec = (Date.now() - t0) / 1000;
  console.error(`batch finished in ${elapsedSec.toFixed(1)}s`);
  if (rows.length !== jobs.length) throw new Error(`expected ${jobs.length} rows, got ${rows.length}`);

  const index = new Map<string, OnsetResult>();
  for (const row of rows) {
    if (row.code !== "static") throw new Error(`seed ${row.seed} returned code ${row.code}`);
    const key = keyOf(row.signal as ExplorerId, row.arm, row.seed);
    if (index.has(key)) throw new Error(`duplicate ${key}`);
    index.set(key, row);
  }

  for (const seed of seeds) {
    const noise = rowAt(index, "random", "noise", seed);
    const pattern = rowAt(index, "random", "pattern", seed);
    if (
      pattern.path !== noise.path ||
      pattern.distractorFrac !== noise.distractorFrac ||
      pattern.foods !== noise.foods ||
      pattern.lives !== noise.lives
    ) {
      throw new Error(`random walk diverged at seed ${seed}`);
    }
  }

  for (const explorer of EXPLORERS) {
    if (explorer.id === "rho") continue;
    for (const seed of seeds) {
      for (const arm of ARMS) {
        const row = rowAt(index, explorer.id, arm, seed);
        if (row.roomSteps >= 1 && row.drop2 !== 0) {
          throw new Error(`${explorer.id} ${arm} seed ${seed} wrote a horizon drop`);
        }
        if (row.error !== 0 || row.err1 !== 0 || row.fixedDrop !== 0 || row.eastDrop !== 0) {
          throw new Error(`${explorer.id} ${arm} seed ${seed} wrote an expected error`);
        }
        if (row.fixedErr1 !== 0 || row.eastErr1 !== 0) {
          throw new Error(`${explorer.id} ${arm} seed ${seed} wrote a first-window split`);
        }
      }
    }
  }

  const present = (pick: (row: OnsetResult) => number, band: number) => (row: OnsetResult) =>
    row.binSteps[band]! >= 1 ? pick(row) : null;

  const gapOf = (id: ExplorerId, pick: (row: OnsetResult) => number | null) => {
    const gap: number[] = [];
    for (const seed of seeds) {
      const pattern = pick(rowAt(index, id, "pattern", seed));
      const noise = pick(rowAt(index, id, "noise", seed));
      if (pattern == null || noise == null) continue;
      gap.push(pattern - noise);
    }
    return gap;
  };

  const classGap = (gap: number[], salt: number) => {
    const ci = bootstrapMeanCI(gap, 2000, 0.05, salt);
    return { ...ci, klass: creditContentClass(ci, ci.n, seedsN, SOURCE_ERROR_DELTA) };
  };

  const randomSlots: Array<{ pick: (row: OnsetResult) => number | null; salt: number; label: string }> = [
    { pick: present((row) => row.binError[0]!, 0), salt: 32301, label: "error open" },
    { pick: present((row) => row.binErr1[0]!, 0), salt: 32302, label: "err1 open" },
    { pick: (row) => (row.roomSteps >= 1 ? row.error : null), salt: 32303, label: "error" },
    { pick: (row) => (row.roomSteps >= 1 ? row.err1 : null), salt: 32304, label: "err1" },
    { pick: present((row) => row.binError[4]!, 4), salt: 32305, label: "error late" },
    { pick: present((row) => row.binErr1[4]!, 4), salt: 32306, label: "err1 late" },
    { pick: present((row) => row.binFixedDrop[0]!, 0), salt: 32307, label: "fixed open" },
    { pick: present((row) => row.binEastDrop[0]!, 0), salt: 32308, label: "east open" },
    { pick: present((row) => row.binFixedErr1[0]!, 0), salt: 32309, label: "fixed err1 open" },
    { pick: present((row) => row.binEastErr1[0]!, 0), salt: 32310, label: "east err1 open" },
    { pick: (row) => (row.roomSteps >= 1 ? row.fixedDrop : null), salt: 32311, label: "fixed" },
    { pick: (row) => (row.roomSteps >= 1 ? row.eastDrop : null), salt: 32312, label: "east" },
    { pick: (row) => (row.roomSteps >= 1 ? row.fixedErr1 : null), salt: 32313, label: "fixed err1" },
    { pick: (row) => (row.roomSteps >= 1 ? row.eastErr1 : null), salt: 32314, label: "east err1" },
    { pick: present((row) => row.binFixedDrop[4]!, 4), salt: 32315, label: "fixed late" },
    { pick: present((row) => row.binEastDrop[4]!, 4), salt: 32316, label: "east late" },
    { pick: present((row) => row.binFixedErr1[4]!, 4), salt: 32317, label: "fixed err1 late" },
    { pick: present((row) => row.binEastErr1[4]!, 4), salt: 32318, label: "east err1 late" },
  ];
  let randomExcludesZero = false;
  for (const slot of randomSlots) {
    const gap = gapOf("random", slot.pick);
    if (gap.length * 2 <= seedsN) throw new Error(`random kept too few seeds for ${slot.label}`);
    if (meanOf(gap) !== 0) throw new Error(`random ${slot.label} mean is ${meanOf(gap)}`);
    const ci = bootstrapMeanCI(gap, 2000, 0.05, slot.salt);
    if (greaterCall(ci) !== "inconclusive") {
      randomExcludesZero = true;
      console.error(`random ${slot.label} excluded 0`);
    }
  }
  if (randomExcludesZero) throw new Error("random excluded 0");

  const bandOf = (
    salts: { error: number; err1: number; fixed: number; east: number; fixedErr1: number; eastErr1: number },
    pickError: (row: OnsetResult) => number | null,
    pickErr1: (row: OnsetResult) => number | null,
    pickFixed: (row: OnsetResult) => number | null,
    pickEast: (row: OnsetResult) => number | null,
    pickFixedErr1: (row: OnsetResult) => number | null,
    pickEastErr1: (row: OnsetResult) => number | null,
  ): BandReport => ({
    error: classGap(gapOf("rho", pickError), salts.error),
    err1: classGap(gapOf("rho", pickErr1), salts.err1),
    fixed: classGap(gapOf("rho", pickFixed), salts.fixed),
    east: classGap(gapOf("rho", pickEast), salts.east),
    fixedErr1: classGap(gapOf("rho", pickFixedErr1), salts.fixedErr1),
    eastErr1: classGap(gapOf("rho", pickEastErr1), salts.eastErr1),
  });

  const open = bandOf(
    OPEN_SALT,
    present((row) => row.binError[0]!, 0),
    present((row) => row.binErr1[0]!, 0),
    present((row) => row.binFixedDrop[0]!, 0),
    present((row) => row.binEastDrop[0]!, 0),
    present((row) => row.binFixedErr1[0]!, 0),
    present((row) => row.binEastErr1[0]!, 0),
  );
  const all = bandOf(
    ALL_SALT,
    (row) => (row.roomSteps >= 1 ? row.error : null),
    (row) => (row.roomSteps >= 1 ? row.err1 : null),
    (row) => (row.roomSteps >= 1 ? row.fixedDrop : null),
    (row) => (row.roomSteps >= 1 ? row.eastDrop : null),
    (row) => (row.roomSteps >= 1 ? row.fixedErr1 : null),
    (row) => (row.roomSteps >= 1 ? row.eastErr1 : null),
  );
  const late = bandOf(
    LATE_SALT,
    present((row) => row.binError[4]!, 4),
    present((row) => row.binErr1[4]!, 4),
    present((row) => row.binFixedDrop[4]!, 4),
    present((row) => row.binEastDrop[4]!, 4),
    present((row) => row.binFixedErr1[4]!, 4),
    present((row) => row.binEastErr1[4]!, 4),
  );

  const occ = gapOf("rho", (row) => row.distractorFrac);
  const rect = gapOf("rho", (row) => (row.east.n >= MIN_ROOM_STEPS ? row.east.rectifiedMean : null));
  const occupancy = bootstrapMeanCI(occ, 2000, 0.05, OCC_SALT);
  const rectified = bootstrapMeanCI(rect, 2000, 0.05, RECT_SALT);

  if (!debug) {
    matches(open.error, STATIC_ERROR_OPEN_MEAN, STATIC_ERROR_OPEN_LO, STATIC_ERROR_OPEN_HI, STATIC_ERROR_OPEN_N, "open drop");
    matches(open.err1, STATIC_ERR1_OPEN_MEAN, STATIC_ERR1_OPEN_LO, STATIC_ERR1_OPEN_HI, STATIC_ERR1_OPEN_N, "open err1");
    matches(all.error, STATIC_ERROR_MEAN, STATIC_ERROR_LO, STATIC_ERROR_HI, STATIC_ERROR_N, "error");
    matches(all.err1, STATIC_ERR1_MEAN, STATIC_ERR1_LO, STATIC_ERR1_HI, STATIC_ERR1_N, "err1");
    matches(
      late.error,
      STATIC_ERROR_LATE_MEAN,
      STATIC_ERROR_LATE_LO,
      STATIC_ERROR_LATE_HI,
      STATIC_ERROR_LATE_N,
      "late drop",
    );
    matches(
      late.err1,
      STATIC_ERR1_LATE_MEAN,
      STATIC_ERR1_LATE_LO,
      STATIC_ERR1_LATE_HI,
      STATIC_ERR1_LATE_N,
      "late err1",
    );
    matches(occupancy, STATIC_OCCUPANCY_MEAN, STATIC_OCCUPANCY_LO, STATIC_OCCUPANCY_HI, seedsN, "occupancy");
    matches(rectified, STATIC_RECT_MEAN, STATIC_RECT_LO, STATIC_RECT_HI, STATIC_RECT_N, "rectified");
  }

  const summary = splitSummary(false, open.error.klass, open.fixed.klass, open.east.klass);
  const verdict = splitVerdict(summary);
  const meanOpen = (arm: OnsetArm) => {
    let s = 0;
    for (const seed of seeds) s += rowAt(index, "rho", arm, seed).binSteps[0]!;
    return s / seedsN;
  };
  const meanRoom = (arm: OnsetArm) => {
    let s = 0;
    for (const seed of seeds) s += rowAt(index, "rho", arm, seed).roomSteps;
    return s / seedsN;
  };
  const report: Report = {
    temperature: SHIPPED_POLICY_TEMPERATURE,
    steps,
    seeds: seedsN,
    errorDelta: SOURCE_ERROR_DELTA,
    openExposure: ONSET_OPEN,
    summary,
    verdict,
    open,
    all,
    late,
    occupancy,
    rectified,
    meanRoomSteps: { pattern: meanRoom("pattern"), noise: meanRoom("noise") },
    meanOpenSteps: { pattern: meanOpen("pattern"), noise: meanOpen("noise") },
    harnessOk: true,
    elapsedSec,
    workers,
  };
  writeOutputs(report);
  const lineOf = (name: string, band: BandReport) =>
    [
      `${name} drop ${fmt(band.error)} n=${band.error.n} ${band.error.klass}`,
      `${name} err1 ${fmt(band.err1)} n=${band.err1.n} ${band.err1.klass}`,
      `${name} fixed ${fmt(band.fixed)} n=${band.fixed.n} ${band.fixed.klass}`,
      `${name} east ${fmt(band.east)} n=${band.east.n} ${band.east.klass}`,
      `${name} fixedErr1 ${fmt(band.fixedErr1)} n=${band.fixedErr1.n} ${band.fixedErr1.klass}`,
      `${name} eastErr1 ${fmt(band.eastErr1)} n=${band.eastErr1.n} ${band.eastErr1.klass}`,
    ];
  console.log(
    [
      `summary ${summary}`,
      `verdict ${verdict}`,
      `errorDelta ${SOURCE_ERROR_DELTA}`,
      ...lineOf("open", open),
      ...lineOf("all", all),
      ...lineOf("late", late),
      `occupancy ${fmt(occupancy)} n=${occupancy.n}`,
      `rectified ${fmt(rectified)} n=${rectified.n}`,
      `open steps ${report.meanOpenSteps.pattern.toFixed(2)}/${report.meanOpenSteps.noise.toFixed(2)}`,
      `room steps ${report.meanRoomSteps.pattern.toFixed(2)}/${report.meanRoomSteps.noise.toFixed(2)}`,
      `elapsed ${elapsedSec.toFixed(1)}s`,
    ].join("\n"),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
