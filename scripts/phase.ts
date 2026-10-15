/**
 * Distractor phase sweep. Not part of CI.
 *
 *   npm run timescale
 *   npm run phase -- --seeds 20 --steps 400
 *
 * Reads the locked drift grid from bench/phase/timescale.json.
 * Writes bench/phase/phase.json, phase.csv, and the heatmap PNGs.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { CURIOSITY_SIGNALS, type CuriositySignal } from "../src/lib/kernel/signals.ts";
import { LEARNABILITY_GRID, closestRate } from "../src/lib/kernel/family.ts";
import { type PhaseRequest, type PhaseResult } from "../src/lib/kernel/phase-run.ts";
import { bootstrapMeanCI, pairedDifference, type Interval } from "../src/lib/kernel/stats.ts";
import { runPool, workerCount } from "./pool.ts";
import { drawText, fillRect, writePng } from "./png.ts";

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) return fallback;
  return process.argv[i + 1]!;
}

type Call = "confirmed" | "refuted" | "inconclusive";

function greater(diff: Interval): Call {
  if (diff.lo > 0) return "confirmed";
  if (diff.hi < 0) return "refuted";
  return "inconclusive";
}

function notGreater(diff: Interval): Call {
  if (diff.hi < 0) return "confirmed";
  if (diff.lo > 0) return "refuted";
  return "inconclusive";
}

function both(a: Call, b: Call): Call {
  if (a === "refuted" || b === "refuted") return "refuted";
  if (a === "confirmed" && b === "confirmed") return "confirmed";
  return "inconclusive";
}

function bySeed(rows: PhaseResult[], pick: (row: PhaseResult) => number) {
  const seeds = [...new Set(rows.map((row) => row.seed))].sort((a, b) => a - b);
  return seeds.map((seed) => {
    const group = rows.filter((row) => row.seed === seed);
    let s = 0;
    for (const row of group) s += pick(row);
    return group.length ? s / group.length : 0;
  });
}

function meanInterval(rows: PhaseResult[], pick: (row: PhaseResult) => number, salt: number) {
  return bootstrapMeanCI(
    rows.map(pick),
    2000,
    0.05,
    salt,
  );
}

const SIGNAL_RGB: Record<CuriositySignal, [number, number, number]> = {
  random: [140, 140, 140],
  count: [36, 104, 196],
  surprise: [214, 132, 28],
  rnd: [112, 64, 176],
  rho: [186, 42, 58],
};

function ramp(t: number): [number, number, number] {
  const u = Math.max(0, Math.min(1, t));
  return [Math.round(244 - u * 130), Math.round(239 - u * 210), Math.round(228 - u * 190)];
}

function short(n: number) {
  if (n === 0) return "0";
  if (n >= 0.1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(3);
  return n.toExponential(0);
}

function drawTime(
  summary: { signal: CuriositySignal; driftRate: number; learnability: number; distractorRelevance: number; distractorFrac: Interval }[],
  drifts: number[],
  learns: number[],
  relevance: number,
) {
  const signals = [...CURIOSITY_SIGNALS];
  const slice = summary.filter((row) => row.distractorRelevance === relevance);
  let max = 0.05;
  for (const row of slice) if (row.distractorFrac.mean > max) max = row.distractorFrac.mean;
  const cell = 26;
  const padL = 70;
  const padB = 36;
  const panelW = drifts.length * cell;
  const panelH = learns.length * cell;
  const width = padL + panelW + 16;
  const height = 18 + signals.length * (panelH + 18) + padB;
  const rgba = new Uint8Array(width * height * 4);
  rgba.fill(255);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  slice.sort((a, b) => a.learnability - b.learnability);
  signals.forEach((signal, s) => {
    const top = 16 + s * (panelH + 18);
    drawText(rgba, width, 4, top + 4, signal, SIGNAL_RGB[signal]);
    learns.forEach((learn, yi) => {
      drifts.forEach((drift, xi) => {
        const row = slice.find(
          (item) => item.signal === signal && item.driftRate === drift && Math.abs(item.learnability - learn) < 1e-9,
        );
        const t = row ? row.distractorFrac.mean / max : 0;
        fillRect(rgba, width, padL + xi * cell + 1, top + (learns.length - 1 - yi) * cell + 1, cell - 2, cell - 2, ramp(t));
      });
    });
  });
  const labelY = height - 16;
  drifts.forEach((drift, xi) => {
    drawText(rgba, width, padL + xi * cell, labelY, short(drift), [40, 40, 40]);
  });
  drawText(rgba, width, 4, height - 16, "drift", [40, 40, 40]);
  return { png: writePng(width, height, rgba), max };
}

function drawWinner(
  summary: { signal: CuriositySignal; driftRate: number; learnability: number; distractorRelevance: number; probeWorld: Interval }[],
  drifts: number[],
  learns: number[],
  relevance: number,
) {
  const cell = 36;
  const padL = 52;
  const width = padL + drifts.length * cell + 120;
  const height = 28 + learns.length * cell + 28;
  const rgba = new Uint8Array(width * height * 4);
  rgba.fill(255);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  learns.forEach((learn, yi) => {
    drifts.forEach((drift, xi) => {
      const cellRows = summary.filter(
        (item) => item.distractorRelevance === relevance && item.driftRate === drift && Math.abs(item.learnability - learn) < 1e-9,
      );
      cellRows.sort((a, b) => a.probeWorld.mean - b.probeWorld.mean);
      const winner = cellRows[0]?.signal ?? "random";
      fillRect(
        rgba,
        width,
        padL + xi * cell + 2,
        20 + (learns.length - 1 - yi) * cell + 2,
        cell - 4,
        cell - 4,
        SIGNAL_RGB[winner],
      );
    });
  });
  drifts.forEach((drift, xi) => drawText(rgba, width, padL + xi * cell, height - 16, short(drift), [40, 40, 40]));
  CURIOSITY_SIGNALS.forEach((signal, i) => {
    const y = 24 + i * 14;
    fillRect(rgba, width, padL + drifts.length * cell + 12, y, 10, 10, SIGNAL_RGB[signal]);
    drawText(rgba, width, padL + drifts.length * cell + 26, y + 1, signal, [30, 30, 30]);
  });
  return writePng(width, height, rgba);
}

async function main() {
  const timescale = JSON.parse(readFileSync("bench/phase/timescale.json", "utf8")) as {
    tauUsed: number;
    driftRates: number[];
  };
  const drifts = timescale.driftRates;
  const learns = [...LEARNABILITY_GRID];
  const relevances = [0, 1];
  const nSeeds = Math.max(1, Number(arg("seeds", "20")));
  const steps = Math.max(1, Number(arg("steps", "400")));
  const workers = workerCount(Number(arg("workers", "0")));
  const seeds = Array.from({ length: nSeeds }, (_, i) => i + 1);
  const critical = closestRate(drifts, 1 / timescale.tauUsed);
  const jobs: PhaseRequest[] = [];
  let id = 0;
  for (const distractorRelevance of relevances) {
    for (const learnability of learns) {
      for (const driftRate of drifts) {
        for (const signal of CURIOSITY_SIGNALS) {
          for (const seed of seeds) {
            jobs.push({ id: id++, seed, signal, steps, learnability, driftRate, distractorRelevance });
          }
        }
      }
    }
  }
  console.error(`phase ${jobs.length} episodes, ${workers} workers, ${steps} steps, critical drift ${critical}`);
  const t0 = Date.now();
  const rows = await runPool<PhaseRequest, PhaseResult>(jobs, new URL("./phase-worker.ts", import.meta.url), workers);
  console.error(`phase finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const summary = [];
  let salt = 20;
  for (const distractorRelevance of relevances) {
    for (const learnability of learns) {
      for (const driftRate of drifts) {
        for (const signal of CURIOSITY_SIGNALS) {
          const group = rows.filter(
            (row) =>
              row.signal === signal &&
              row.driftRate === driftRate &&
              row.distractorRelevance === distractorRelevance &&
              Math.abs(row.learnability - learnability) < 1e-9,
          );
          summary.push({
            signal,
            learnability,
            driftRate,
            distractorRelevance,
            n: group.length,
            distractorFrac: meanInterval(group, (row) => row.distractorFrac, salt++),
            probeWorld: meanInterval(group, (row) => row.probeWorld, salt++),
            probeDistractor: meanInterval(group, (row) => row.probeDistractor, salt++),
            usefulCells: meanInterval(group, (row) => row.usefulCells, salt++),
            distinctCells: meanInterval(group, (row) => row.distinctCells, salt++),
            foods: meanInterval(group, (row) => row.foods, salt++),
            distractorFoods: meanInterval(group, (row) => row.distractorFoods, salt++),
          });
        }
      }
    }
  }

  const at = (signal: CuriositySignal, drift: number, rel: number) =>
    rows.filter((row) => row.signal === signal && row.driftRate === drift && row.distractorRelevance === rel);

  const frac = (signal: CuriositySignal, drift: number, rel: number) => bySeed(at(signal, drift, rel), (row) => row.distractorFrac);
  const surpriseRho0 = pairedDifference(frac("surprise", 0, 0), frac("rho", 0, 0), 101);
  const rhoRandom0 = pairedDifference(frac("rho", 0, 0), frac("random", 0, 0), 102);
  const rhoRandomC = pairedDifference(frac("rho", critical, 0), frac("random", critical, 0), 103);
  const rhoCountC = pairedDifference(frac("rho", critical, 0), frac("count", critical, 0), 104);
  const rhoSurpriseC = pairedDifference(frac("rho", critical, 0), frac("surprise", critical, 0), 105);
  const rhoDrift = pairedDifference(frac("rho", critical, 0), frac("rho", 0, 0), 106);
  const countRelevance = pairedDifference(frac("count", 0, 1), frac("count", 0, 0), 107);
  const a1Surprise = greater(surpriseRho0);
  const a1Rho = notGreater(rhoRandom0);
  const a2Alloc =
    greater(rhoRandomC) === "confirmed" && greater(rhoCountC) === "confirmed" && greater(rhoSurpriseC) === "confirmed"
      ? "confirmed"
      : greater(rhoRandomC) === "refuted" || greater(rhoCountC) === "refuted" || greater(rhoSurpriseC) === "refuted"
        ? "refuted"
        : "inconclusive";
  const a2Drift = greater(rhoDrift);

  const winners = [];
  for (const distractorRelevance of relevances) {
    for (const learnability of learns) {
      for (const driftRate of drifts) {
        const cell = summary
          .filter(
            (row) =>
              row.distractorRelevance === distractorRelevance &&
              row.driftRate === driftRate &&
              Math.abs(row.learnability - learnability) < 1e-9,
          )
          .slice()
          .sort((a, b) => a.probeWorld.mean - b.probeWorld.mean);
        const best = cell[0]!;
        const second = cell[1]!;
        const bestRows = rows
          .filter(
            (row) =>
              row.signal === best.signal &&
              row.driftRate === driftRate &&
              row.distractorRelevance === distractorRelevance &&
              Math.abs(row.learnability - learnability) < 1e-9,
          )
          .sort((a, b) => a.seed - b.seed);
        const secondRows = rows
          .filter(
            (row) =>
              row.signal === second.signal &&
              row.driftRate === driftRate &&
              row.distractorRelevance === distractorRelevance &&
              Math.abs(row.learnability - learnability) < 1e-9,
          )
          .sort((a, b) => a.seed - b.seed);
        const gap = pairedDifference(
          secondRows.map((row) => row.probeWorld),
          bestRows.map((row) => row.probeWorld),
          200 + winners.length,
        );
        winners.push({
          distractorRelevance,
          learnability,
          driftRate,
          winner: best.signal,
          probe: best.probeWorld.mean,
          runnerUp: second.signal,
          gap,
          separated: gap.lo > 0,
        });
      }
    }
  }

  const perLearn = learns.map((learnability) => {
    const pick = (signal: CuriositySignal) =>
      bySeed(
        rows.filter(
          (row) =>
            row.signal === signal &&
            row.driftRate === 0 &&
            row.distractorRelevance === 0 &&
            Math.abs(row.learnability - learnability) < 1e-9,
        ),
        (row) => row.distractorFrac,
      );
    return {
      learnability,
      surpriseMinusRho: pairedDifference(pick("surprise"), pick("rho"), 300 + Math.round(learnability * 10)),
      rhoMinusRandom: pairedDifference(pick("rho"), pick("random"), 400 + Math.round(learnability * 10)),
    };
  });

  const report = {
    date: new Date().toISOString(),
    steps,
    seeds,
    tauUsed: timescale.tauUsed,
    criticalDrift: critical,
    driftRates: drifts,
    learnability: learns,
    relevances,
    note: "distractorFrac is the fraction of steps in the east room. probeWorld is live probe error on the west room (lower is better). probeDistractor is the east room. Predictions were locked before this run.",
    contrasts: {
      a1: {
        scope: "relevance 0, drift 0, mean over learnability, paired on seeds",
        surpriseMinusRho: surpriseRho0,
        rhoMinusRandom: rhoRandom0,
        surpriseCall: a1Surprise,
        rhoCall: a1Rho,
        call: both(a1Surprise, a1Rho),
        perLearnability: perLearn,
      },
      a2: {
        scope: "relevance 0, drift nearest 1/tau, mean over learnability",
        criticalDrift: critical,
        rhoMinusRandom: rhoRandomC,
        rhoMinusCount: rhoCountC,
        rhoMinusSurprise: rhoSurpriseC,
        rhoCriticalMinusStationary: rhoDrift,
        allocationCall: a2Alloc,
        driftCall: a2Drift,
        call: both(a2Alloc, a2Drift),
      },
      a3: {
        scope: "count, drift 0, relevance 1 minus relevance 0. Positive control that edible east food is used.",
        countRelevanceMinusZero: countRelevance,
        call: greater(countRelevance),
      },
    },
    summary,
    winners,
  };

  mkdirSync("bench/phase", { recursive: true });
  writeFileSync("bench/phase/phase.json", `${JSON.stringify(report, null, 2)}\n`);
  const header = [
    "learnability",
    "drift",
    "relevance",
    "signal",
    "seed",
    "distractor_frac",
    "probe_world",
    "probe_distractor",
    "useful_cells",
    "distinct_cells",
    "foods",
    "distractor_foods",
    "lives",
  ];
  const csv = [header.join(",")];
  for (const row of rows) {
    csv.push(
      [
        row.learnability,
        row.driftRate,
        row.distractorRelevance,
        row.signal,
        row.seed,
        row.distractorFrac.toFixed(6),
        row.probeWorld.toFixed(6),
        row.probeDistractor.toFixed(6),
        row.usefulCells,
        row.distinctCells,
        row.foods,
        row.distractorFoods,
        row.lives,
      ].join(","),
    );
  }
  writeFileSync("bench/phase/phase.csv", `${csv.join("\n")}\n`);

  const time0 = drawTime(summary, drifts, learns, 0);
  const time1 = drawTime(summary, drifts, learns, 1);
  writeFileSync("bench/phase/heatmap-time-rel0.png", time0.png);
  writeFileSync("bench/phase/heatmap-time-rel1.png", time1.png);
  writeFileSync("bench/phase/heatmap-winner-rel0.png", drawWinner(summary, drifts, learns, 0));
  writeFileSync("bench/phase/heatmap-winner-rel1.png", drawWinner(summary, drifts, learns, 1));
  console.log(
    JSON.stringify(
      {
        critical,
        a1: report.contrasts.a1.call,
        a2: report.contrasts.a2.call,
        a3: report.contrasts.a3.call,
        timeScaleRel0: time0.max,
        timeScaleRel1: time1.max,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
