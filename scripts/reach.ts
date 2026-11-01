/**
 * Where the pattern's progress edge is lost before ρ̂ is formed.
 * Not part of CI.
 *
 *   npm run reach
 *
 * Seeds 1–800, 400 steps, shipped temperature. Pattern minus matched noise.
 * The doorway sum is the chain raw ρ̂. The pieces are the call.
 * Writes bench/reach/reach.json, reach.csv, and reach-gap.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PATTERN_CHANNEL_OPEN, patternChannelCensus } from "../src/lib/kernel/family.ts";
import {
  CHAIN_RHO_HAT_HI,
  CHAIN_RHO_HAT_LO,
  CHAIN_RHO_HAT_MEAN,
  CHAIN_RHO_HAT_N,
  type ReachArm,
  type ReachRequest,
  type ReachResult,
} from "../src/lib/kernel/reach-run.ts";
import {
  CHAIN_RHO_HAT_DELTA,
  CREDIT_RHO_CONTENT_MEAN,
  CREDIT_RHO_CONTENT_N,
  CREDIT_RHO_OCCUPANCY,
  CREDIT_RHO_RECT_N,
  CREDIT_RHO_RECTIFIED,
} from "../src/lib/kernel/chain-run.ts";
import {
  chainCarry,
  creditContentClass,
  greaterCall,
  MIN_ROOM_STEPS,
  reachSummary,
  reachVerdict,
  SHIPPED_POLICY_TEMPERATURE,
  type Call,
  type CreditClass,
  type ReachLink,
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

const PLACES = ["door", "room"] as const;
type Place = (typeof PLACES)[number];

const PIECES = ["bonus", "drop2", "drop3", "sum"] as const;
type Piece = (typeof PIECES)[number];

const COLOR: RGB = [140, 60, 180];

const ARMS: ReachArm[] = ["pattern", "noise"];

function fmt(ci: { mean: number; lo: number; hi: number }) {
  return `${ci.mean.toFixed(4)} [${ci.lo.toFixed(4)}, ${ci.hi.toFixed(4)}]`;
}

function keyOf(id: ExplorerId, arm: ReachArm, seed: number) {
  return `${id}|${arm}|${seed}`;
}

type PieceRow = Interval & { klass: CreditClass; carry: boolean };

type Report = {
  temperature: number;
  steps: number;
  seeds: number;
  delta: number;
  summary: ReachLink;
  verdict: Call;
  pieces: Record<Place, Record<Piece, Record<ExplorerId, PieceRow>>>;
  rectified: Interval;
  occupancy: Interval;
  meanDoorSteps: { pattern: number; noise: number };
  meanRoomSteps: { pattern: number; noise: number };
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

const PIECE_LABEL: Record<Piece, string> = {
  bonus: "scent / bonus",
  drop2: "horizon-2 drop",
  drop3: "horizon-3 drop",
  sum: "sum, raw rho-hat",
};

type Bar = { place: Place; piece: Piece; mean: number; lo: number; hi: number };

function drawGaps(bars: Bar[], delta: number) {
  const width = 880;
  const height = 560;
  const rgba = blank(width, height);
  drawText(rgba, width, 8, 8, "rho-hat pieces, pattern minus noise", [30, 30, 30]);
  drawText(rgba, width, 8, 22, "rho, shipped temperature. gold lines are delta", [90, 60, 120]);
  const left = 188;
  const right = width - 28;
  const panels: { place: Place; title: string; top: number }[] = [
    { place: "door", title: "doorway preference", top: 52 },
    { place: "room", title: "in-room level", top: 300 },
  ];
  for (const panel of panels) {
    const panelBars = bars.filter((bar) => bar.place === panel.place);
    const top = panel.top + 22;
    const bottom = panel.top + 200;
    let xMin = -delta;
    let xMax = delta;
    for (const bar of panelBars) {
      xMin = Math.min(xMin, bar.lo, bar.mean);
      xMax = Math.max(xMax, bar.hi, bar.mean);
    }
    const pad = Math.max(0.002, (xMax - xMin) * 0.12);
    xMin -= pad;
    xMax += pad;
    const xOf = (value: number) => left + ((value - xMin) / (xMax - xMin || 1)) * (right - left);
    drawText(rgba, width, 16, panel.top, panel.title, [30, 30, 30]);
    vline(rgba, width, xOf(0), top, bottom, [170, 170, 170]);
    vline(rgba, width, xOf(delta), top, bottom, [210, 180, 80]);
    vline(rgba, width, xOf(-delta), top, bottom, [210, 180, 80]);
    panelBars.forEach((bar, i) => {
      const y = top + 8 + i * 40;
      drawText(rgba, width, 16, y - 2, PIECE_LABEL[bar.piece], [30, 30, 30]);
      const x0 = Math.round(xOf(bar.lo));
      const x1 = Math.round(xOf(bar.hi));
      fillRect(rgba, width, Math.min(x0, x1), y + 6, Math.max(2, Math.abs(x1 - x0)), 4, COLOR);
      fillRect(rgba, width, Math.round(xOf(bar.mean)) - 3, y, 6, 16, COLOR);
    });
  }
  const scaled = scaleNearest(rgba, width, height, 2);
  return writePng(scaled.width, scaled.height, scaled.rgba);
}

function writeOutputs(report: Report) {
  mkdirSync("bench/reach", { recursive: true });
  writeFileSync("bench/reach/reach.json", JSON.stringify(report, null, 2));
  const lines = ["place,piece,explorer,mean,lo,hi,n,class,carry"];
  for (const place of PLACES) {
    for (const piece of PIECES) {
      for (const explorer of EXPLORERS) {
        const row = report.pieces[place][piece][explorer.id];
        lines.push(
          [place, piece, explorer.id, row.mean, row.lo, row.hi, row.n, row.klass, row.carry ? 1 : 0].join(","),
        );
      }
    }
  }
  writeFileSync("bench/reach/reach.csv", `${lines.join("\n")}\n`);
  const bars: Bar[] = [];
  for (const place of PLACES) {
    for (const piece of PIECES) {
      const row = report.pieces[place][piece].rho;
      bars.push({ place, piece, mean: row.mean, lo: row.lo, hi: row.hi });
    }
  }
  writeFileSync("bench/reach/reach-gap.png", drawGaps(bars, report.delta));
}

function rowAt(index: Map<string, ReachResult>, id: ExplorerId, arm: ReachArm, seed: number) {
  const row = index.get(keyOf(id, arm, seed));
  if (!row) throw new Error(`missing ${id} ${arm} seed ${seed}`);
  return row;
}

function excludesZero(row: Interval) {
  return greaterCall(row) !== "inconclusive";
}

function gapOf(pattern: ReachResult, noise: ReachResult, place: Place, piece: Piece) {
  const value = (row: ReachResult) => {
    if (place === "door" && piece === "bonus") return row.doorBonus;
    if (place === "door" && piece === "drop2") return row.doorDrop2;
    if (place === "door" && piece === "drop3") return row.doorDrop3;
    if (place === "door" && piece === "sum") return row.rhoHat;
    if (place === "room" && piece === "bonus") return row.roomBonus;
    if (place === "room" && piece === "drop2") return row.roomDrop2;
    if (place === "room" && piece === "drop3") return row.roomDrop3;
    return row.roomBonus + row.roomDrop2 + row.roomDrop3;
  };
  return value(pattern) - value(noise);
}

function kept(pattern: ReachResult, noise: ReachResult, place: Place) {
  if (place === "door") return pattern.doorSteps >= 1 && noise.doorSteps >= 1;
  return pattern.roomSteps >= 1 && noise.roomSteps >= 1;
}

async function main() {
  if (process.argv.includes("--figure-only")) {
    const saved = JSON.parse(readFileSync("bench/reach/reach.json", "utf8")) as Report;
    writeOutputs(saved);
    return;
  }
  const census = patternChannelCensus("all");
  if (census.open !== PATTERN_CHANNEL_OPEN || census.kept !== PATTERN_CHANNEL_OPEN) {
    throw new Error(`pattern census ${census.open}/${census.kept} is not ${PATTERN_CHANNEL_OPEN}`);
  }

  const seedsN = Math.max(1, Number(arg("seeds", "800")));
  const steps = Math.max(1, Number(arg("steps", "400")));
  if (seedsN !== 800 || steps !== 400) {
    throw new Error(`the locked run is 800 seeds and 400 steps, got ${seedsN} and ${steps}`);
  }
  const workers = workerCount(Number(arg("workers", "0")));
  const seeds = Array.from({ length: seedsN }, (_, i) => i + 1);
  const jobs: ReachRequest[] = [];
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
        });
      }
    }
  }
  console.error(
    `reach ${jobs.length} episodes, ${workers} workers, ${steps} steps, temperature ${SHIPPED_POLICY_TEMPERATURE}`,
  );
  const t0 = Date.now();
  const rows = await runPool<ReachRequest, ReachResult>(jobs, new URL("./reach-worker.ts", import.meta.url), workers);
  const elapsedSec = (Date.now() - t0) / 1000;
  console.error(`batch finished in ${elapsedSec.toFixed(1)}s`);
  if (rows.length !== jobs.length) throw new Error(`expected ${jobs.length} rows, got ${rows.length}`);

  const index = new Map<string, ReachResult>();
  for (const row of rows) {
    const key = keyOf(row.signal as ExplorerId, row.arm, row.seed);
    if (index.has(key)) throw new Error(`duplicate ${key}`);
    index.set(key, row);
  }

  for (const seed of seeds) {
    const pattern = rowAt(index, "random", "pattern", seed);
    const noise = rowAt(index, "random", "noise", seed);
    if (
      pattern.path !== noise.path ||
      pattern.distractorFrac !== noise.distractorFrac ||
      pattern.foods !== noise.foods ||
      pattern.lives !== noise.lives
    ) {
      throw new Error(`random walk diverged at seed ${seed}`);
    }
  }

  const occ: number[] = [];
  for (const seed of seeds) {
    const pattern = rowAt(index, "rho", "pattern", seed);
    const noise = rowAt(index, "rho", "noise", seed);
    occ.push(pattern.distractorFrac - noise.distractorFrac);
  }
  const occMean = meanOf(occ);
  if (Math.abs(occMean - CREDIT_RHO_OCCUPANCY) > 1e-12) {
    throw new Error(`rho occupancy is ${occMean}, not the credit mean`);
  }

  const rectValues: number[] = [];
  for (const seed of seeds) {
    const pattern = rowAt(index, "rho", "pattern", seed);
    const noise = rowAt(index, "rho", "noise", seed);
    if (pattern.east.n < MIN_ROOM_STEPS || noise.east.n < MIN_ROOM_STEPS) continue;
    rectValues.push(pattern.east.rectifiedMean - noise.east.rectifiedMean);
  }
  if (rectValues.length !== CREDIT_RHO_RECT_N) {
    throw new Error(`rectified n is ${rectValues.length}, not ${CREDIT_RHO_RECT_N}`);
  }
  const rectMean = meanOf(rectValues);
  if (Math.abs(rectMean - CREDIT_RHO_RECTIFIED) > 1e-12) {
    throw new Error(`rectified mean is ${rectMean}, not the credit mean`);
  }

  const contentValues: number[] = [];
  for (const seed of seeds) {
    const pattern = rowAt(index, "rho", "pattern", seed);
    const noise = rowAt(index, "rho", "noise", seed);
    if (pattern.scoreSteps >= 1 && noise.scoreSteps >= 1) contentValues.push(pattern.scoreGap - noise.scoreGap);
  }
  if (contentValues.length !== CREDIT_RHO_CONTENT_N) {
    throw new Error(`doorway n is ${contentValues.length}, not ${CREDIT_RHO_CONTENT_N}`);
  }
  const contentMean = meanOf(contentValues);
  if (Math.abs(contentMean - CREDIT_RHO_CONTENT_MEAN) > 1e-12) {
    throw new Error(`doorway mean is ${contentMean}, not the credit mean`);
  }

  const saltOf: Record<Place, Record<Piece, number>> = {
    door: { bonus: 28100, drop2: 28200, drop3: 28300, sum: 27500 },
    room: { bonus: 28400, drop2: 28500, drop3: 28600, sum: 28700 },
  };

  const pieces = {} as Report["pieces"];
  for (const place of PLACES) {
    pieces[place] = {} as Record<Piece, Record<ExplorerId, PieceRow>>;
    for (const piece of PIECES) {
      pieces[place][piece] = {} as Record<ExplorerId, PieceRow>;
      for (const explorer of EXPLORERS) {
        const explorerIndex = EXPLORERS.findIndex((row) => row.id === explorer.id);
        const gap: number[] = [];
        for (const seed of seeds) {
          const pattern = rowAt(index, explorer.id, "pattern", seed);
          const noise = rowAt(index, explorer.id, "noise", seed);
          if (kept(pattern, noise, place)) gap.push(gapOf(pattern, noise, place, piece));
        }
        const ci = bootstrapMeanCI(gap, 2000, 0.05, saltOf[place][piece] + explorerIndex);
        const klass = creditContentClass(ci, ci.n, seedsN, CHAIN_RHO_HAT_DELTA);
        pieces[place][piece][explorer.id] = {
          ...ci,
          klass,
          carry: chainCarry(ci, CHAIN_RHO_HAT_DELTA),
        };
      }
    }
  }

  for (const place of PLACES) {
    for (const piece of PIECES) {
      const row = pieces[place][piece].random;
      if (row.n * 2 <= seedsN) throw new Error(`random kept too few ${place} seeds on ${piece}`);
      if (excludesZero(row)) throw new Error(`random ${place} ${piece} gap excluded 0`);
      if (row.mean !== 0) throw new Error(`random ${place} ${piece} mean is ${row.mean}`);
    }
  }

  for (const explorer of EXPLORERS) {
    if (explorer.id === "rho") continue;
    for (const place of PLACES) {
      for (const piece of ["drop2", "drop3"] as const) {
        const row = pieces[place][piece][explorer.id];
        if (row.mean !== 0) throw new Error(`${explorer.id} ${place} ${piece} mean is ${row.mean}`);
      }
    }
  }

  for (const seed of seeds) {
    for (const arm of ARMS) {
      const row = rowAt(index, "rho", arm, seed);
      if (row.doorSteps < 1) continue;
      const sum = row.doorBonus + row.doorDrop2 + row.doorDrop3;
      if (Math.abs(sum - row.rhoHat) > 1e-6) {
        throw new Error(`seed ${seed} ${arm} rho-hat pieces ${sum} do not match ${row.rhoHat}`);
      }
    }
  }

  const doorSum = pieces.door.sum.rho;
  if (doorSum.n !== CHAIN_RHO_HAT_N) throw new Error(`rho-hat n is ${doorSum.n}, not ${CHAIN_RHO_HAT_N}`);
  if (Math.abs(doorSum.mean - CHAIN_RHO_HAT_MEAN) > 1e-12) {
    throw new Error(`rho-hat mean is ${doorSum.mean}, not the chain mean`);
  }
  if (Math.abs(doorSum.lo - CHAIN_RHO_HAT_LO) > 1e-12 || Math.abs(doorSum.hi - CHAIN_RHO_HAT_HI) > 1e-12) {
    throw new Error(`rho-hat interval ${fmt(doorSum)} is not the chain interval`);
  }

  const rhoDoor = pieces.door;
  const rhoRoom = pieces.room;
  const summary = reachSummary(
    false,
    rhoDoor.bonus.rho.klass,
    rhoDoor.drop2.rho.klass,
    rhoDoor.drop3.rho.klass,
    rhoRoom.bonus.rho.klass,
    rhoRoom.drop2.rho.klass,
    rhoRoom.drop3.rho.klass,
    rhoDoor.sum.rho.klass,
    rhoRoom.sum.rho.klass,
  );
  const verdict = reachVerdict(summary);

  const meanDoor = (arm: ReachArm) => {
    let s = 0;
    for (const seed of seeds) s += rowAt(index, "rho", arm, seed).doorSteps;
    return s / seedsN;
  };
  const meanRoom = (arm: ReachArm) => {
    let s = 0;
    for (const seed of seeds) s += rowAt(index, "rho", arm, seed).roomSteps;
    return s / seedsN;
  };
  const rectified = bootstrapMeanCI(rectValues, 2000, 0.05, 26304);
  if (
    Math.abs(rectified.lo - 0.020584800349733586) > 1e-12 ||
    Math.abs(rectified.hi - 0.022222900562580226) > 1e-12
  ) {
    throw new Error(`rectified interval ${fmt(rectified)} is not the credit interval`);
  }
  const occupancy = bootstrapMeanCI(occ, 2000, 0.05, 26204);
  if (
    Math.abs(occupancy.lo - -0.008018749999999995) > 1e-12 ||
    Math.abs(occupancy.hi - 0.012543750000000003) > 1e-12
  ) {
    throw new Error(`occupancy interval ${fmt(occupancy)} is not the credit interval`);
  }

  const report: Report = {
    temperature: SHIPPED_POLICY_TEMPERATURE,
    steps,
    seeds: seedsN,
    delta: CHAIN_RHO_HAT_DELTA,
    summary,
    verdict,
    pieces,
    rectified,
    occupancy,
    meanDoorSteps: { pattern: meanDoor("pattern"), noise: meanDoor("noise") },
    meanRoomSteps: { pattern: meanRoom("pattern"), noise: meanRoom("noise") },
    harnessOk: true,
    elapsedSec,
    workers,
  };
  writeOutputs(report);
  const lines = [
    `summary ${summary}`,
    `verdict ${verdict}`,
    `delta ${CHAIN_RHO_HAT_DELTA}`,
    ...PLACES.flatMap((place) =>
      PIECES.map((piece) => {
        const row = pieces[place][piece].rho;
        return `${place} ${piece} rho ${fmt(row)} n=${row.n} ${row.klass} carry=${row.carry ? 1 : 0}`;
      }),
    ),
    `rectified ${fmt(rectified)} n=${rectified.n}`,
    `occupancy rho ${fmt(occupancy)}`,
    `door steps rho pattern ${report.meanDoorSteps.pattern.toFixed(2)} noise ${report.meanDoorSteps.noise.toFixed(2)}`,
    `room steps rho pattern ${report.meanRoomSteps.pattern.toFixed(2)} noise ${report.meanRoomSteps.noise.toFixed(2)}`,
  ];
  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
