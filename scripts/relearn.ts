/**
 * Why the true return pays less after a negated-target erasure, and whether
 * the doorway score sees that room. Not part of CI.
 *
 *   npm run relearn
 *
 * Seeds 1–200. Width 32. Writes bench/relearn/relearn.json, relearn.csv,
 * and relearn-gap.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { greaterCall, type Call } from "../src/lib/kernel/noise.ts";
import { bootstrapMeanCI, meanOf, type Interval } from "../src/lib/kernel/stats.ts";
import { PUBLISHED_LEARN } from "../src/lib/kernel/capacity.ts";
import { runRelearnJob, type RelearnJob, type RelearnSample } from "../src/lib/kernel/relearn-run.ts";
import {
  PUBLISHED_DROP_HELD,
  PUBLISHED_DROP_NEGATE,
  PUBLISHED_NEGATE_OVERWRITE,
  PUBLISHED_RAW_HELD,
  PUBLISHED_RAW_NEGATE,
  arrivalSalt,
  countDoorSalt,
  dropSalt,
  fallSalt,
  heldSalt,
  originSalt,
  progressSalt,
  rawDoorSalt,
  relearnSummary,
  relearnVerdict,
  rhoDoorSalt,
  rndDoorSalt,
  slopeSalt,
  slopeVerdict,
  surpriseDoorSalt,
  type RelearnSummary,
} from "../src/lib/kernel/relearn.ts";
import { drawText, fillRect, writePng } from "./png.ts";
import { runPool, workerCount } from "./pool.ts";

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const OUT = "bench/relearn";

function meanCI(xs: number[], salt: number): Interval {
  return bootstrapMeanCI(xs, 2000, 0.05, salt);
}

function diffCI(a: number[], b: number[], salt: number): Interval {
  return bootstrapMeanCI(
    a.map((v, i) => v - b[i]!),
    2000,
    0.05,
    salt,
  );
}

function callOf(ci: Interval): Call {
  return greaterCall(ci);
}

function fmt(ci: Interval) {
  return `${ci.mean.toFixed(4)} [${ci.lo.toFixed(4)}, ${ci.hi.toFixed(4)}] n=${ci.n}`;
}

function abort(message: string): never {
  console.error(message);
  process.exit(1);
}

type Report = {
  n: number;
  learnDrop: number;
  overwrite: number;
  slope: Interval & { call: Call; verdict: ReturnType<typeof slopeVerdict> };
  origin: Interval & { call: Call };
  drop: Interval & { call: Call };
  fall: Interval & { call: Call };
  arrival: Interval & { call: Call };
  progress: Interval & { call: Call };
  held: Interval & { call: Call };
  rawDoor: Interval & { call: Call };
  rhoDoor: Interval & { call: Call };
  surpriseDoor: Interval & { call: Call };
  rndDoor: Interval & { call: Call };
  countDoor: Interval & { call: Call };
  drop20Learn: Interval;
  drop20Held: Interval;
  drop20Negate: Interval;
  rawLearn: Interval;
  rawHeld: Interval;
  rawNegate: Interval;
  fallLearn: Interval;
  arrivalLearn: Interval;
  emaNegate: Interval;
  emaLearn: Interval;
  surpriseNegate: Interval;
  positiveNegate: Interval;
  positiveLearn: Interval;
  rhoGlobal: Interval;
  rhoUncertainty: Interval;
  progressEmaHeld: Interval;
  progressEmaNegate: Interval;
  progressEmaGap: Interval;
  rectLearn: Interval;
  rectHeld: Interval;
  rectNegate: Interval;
  summary: RelearnSummary;
  verdict: ReturnType<typeof relearnVerdict>;
};

function reportOf(rows: RelearnSample[]): Report {
  const slope = diffCI(
    rows.map((row) => row.negate.drop20),
    rows.map((row) => row.learn.drop20),
    slopeSalt(),
  );
  const origin = meanCI(
    rows.map((row) => row.learn.raw),
    originSalt(),
  );
  const drop = meanCI(
    rows.map((row) => row.negate.drop20),
    dropSalt(),
  );
  const fall = meanCI(
    rows.map((row) => row.negate.fall),
    fallSalt(),
  );
  const arrival = meanCI(
    rows.map((row) => row.negate.arrival),
    arrivalSalt(),
  );
  const progress = meanCI(
    rows.map((row) => row.negate.raw),
    progressSalt(),
  );
  const held = diffCI(
    rows.map((row) => row.negate.raw),
    rows.map((row) => row.held.raw),
    heldSalt(),
  );
  const rawDoor = diffCI(
    rows.map((row) => row.negateDoor.raw),
    rows.map((row) => row.heldDoor.raw),
    rawDoorSalt(),
  );
  const rhoDoor = diffCI(
    rows.map((row) => row.negateDoor.rho),
    rows.map((row) => row.heldDoor.rho),
    rhoDoorSalt(),
  );
  const surpriseDoor = diffCI(
    rows.map((row) => row.negateDoor.surprise),
    rows.map((row) => row.heldDoor.surprise),
    surpriseDoorSalt(),
  );
  const rndDoor = diffCI(
    rows.map((row) => row.negateDoor.rnd),
    rows.map((row) => row.heldDoor.rnd),
    rndDoorSalt(),
  );
  const countDoor = diffCI(
    rows.map((row) => row.negateDoor.count),
    rows.map((row) => row.heldDoor.count),
    countDoorSalt(),
  );
  const slopeCall = callOf(slope);
  const calls = {
    held: callOf(held),
    origin: callOf(origin),
    drop: callOf(drop),
    fall: callOf(fall),
    arrival: callOf(arrival),
    progress: callOf(progress),
    rawDoor: callOf(rawDoor),
    rhoDoor: callOf(rhoDoor),
    surpriseDoor: callOf(surpriseDoor),
    rndDoor: callOf(rndDoor),
    slope: slopeCall,
  };
  const summary = relearnSummary(calls);
  return {
    n: rows.length,
    learnDrop: meanOf(rows.map((row) => row.learnDrop)),
    overwrite: meanOf(rows.map((row) => row.negateOverwrite)),
    slope: { ...slope, call: slopeCall, verdict: slopeVerdict(slopeCall) },
    origin: { ...origin, call: calls.origin },
    drop: { ...drop, call: calls.drop },
    fall: { ...fall, call: calls.fall },
    arrival: { ...arrival, call: calls.arrival },
    progress: { ...progress, call: calls.progress },
    held: { ...held, call: calls.held },
    rawDoor: { ...rawDoor, call: calls.rawDoor },
    rhoDoor: { ...rhoDoor, call: calls.rhoDoor },
    surpriseDoor: { ...surpriseDoor, call: calls.surpriseDoor },
    rndDoor: { ...rndDoor, call: calls.rndDoor },
    countDoor: { ...countDoor, call: calls.countDoor },
    drop20Learn: meanCI(
      rows.map((row) => row.learn.drop20),
      39101,
    ),
    drop20Held: meanCI(
      rows.map((row) => row.held.drop20),
      39102,
    ),
    drop20Negate: meanCI(
      rows.map((row) => row.negate.drop20),
      39103,
    ),
    rawLearn: meanCI(
      rows.map((row) => row.learn.raw),
      39104,
    ),
    rawHeld: meanCI(
      rows.map((row) => row.held.raw),
      39105,
    ),
    rawNegate: meanCI(
      rows.map((row) => row.negate.raw),
      39106,
    ),
    fallLearn: meanCI(
      rows.map((row) => row.learn.fall),
      39107,
    ),
    arrivalLearn: meanCI(
      rows.map((row) => row.learn.arrival),
      39108,
    ),
    emaNegate: meanCI(
      rows.map((row) => row.negate.emaStart),
      39109,
    ),
    emaLearn: meanCI(
      rows.map((row) => row.learn.emaStart),
      39110,
    ),
    surpriseNegate: meanCI(
      rows.map((row) => row.negate.surpriseStart),
      39111,
    ),
    positiveNegate: meanCI(
      rows.map((row) => row.negate.positive),
      39112,
    ),
    positiveLearn: meanCI(
      rows.map((row) => row.learn.positive),
      39113,
    ),
    rhoGlobal: diffCI(
      rows.map((row) => row.negateDoor.rhoGlobal),
      rows.map((row) => row.heldDoor.rhoGlobal),
      39114,
    ),
    rhoUncertainty: diffCI(
      rows.map((row) => row.negateDoor.rhoUncertainty),
      rows.map((row) => row.heldDoor.rhoUncertainty),
      39115,
    ),
    progressEmaHeld: meanCI(
      rows.map((row) => row.heldDoor.progressEma),
      39116,
    ),
    progressEmaNegate: meanCI(
      rows.map((row) => row.negateDoor.progressEma),
      39117,
    ),
    progressEmaGap: diffCI(
      rows.map((row) => row.negateDoor.progressEma),
      rows.map((row) => row.heldDoor.progressEma),
      39118,
    ),
    rectLearn: meanCI(
      rows.map((row) => row.learn.rect),
      39119,
    ),
    rectHeld: meanCI(
      rows.map((row) => row.held.rect),
      39120,
    ),
    rectNegate: meanCI(
      rows.map((row) => row.negate.rect),
      39121,
    ),
    summary,
    verdict: relearnVerdict(summary),
  };
}

type RGB = [number, number, number];

function paint(width: number, height: number) {
  const rgba = new Uint8Array(width * height * 4);
  rgba.fill(255);
  return rgba;
}

function vline(rgba: Uint8Array, width: number, x: number, y0: number, y1: number, rgb: RGB) {
  fillRect(rgba, width, x, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1, rgb);
}

function bars(
  rgba: Uint8Array,
  width: number,
  originX: number,
  originY: number,
  plotW: number,
  plotH: number,
  labels: string[],
  values: Interval[],
  marks: { at: number; rgb: RGB }[],
) {
  let lo = 0;
  let hi = 0;
  for (const value of values) {
    lo = Math.min(lo, value.lo);
    hi = Math.max(hi, value.hi);
  }
  for (const mark of marks) {
    lo = Math.min(lo, mark.at);
    hi = Math.max(hi, mark.at);
  }
  const span = hi - lo || 1;
  const pad = span * 0.12;
  lo -= pad;
  hi += pad;
  const yOf = (v: number) => originY + plotH - ((v - lo) / (hi - lo)) * plotH;
  fillRect(rgba, width, originX, originY, plotW, plotH, [248, 246, 242]);
  for (const mark of marks) {
    const y = yOf(mark.at) | 0;
    fillRect(rgba, width, originX, y, plotW, mark.at === 0 ? 2 : 1, mark.rgb);
  }
  const slot = plotW / labels.length;
  values.forEach((value, i) => {
    const bw = Math.max(8, Math.round(slot * 0.44));
    const x = Math.round(originX + i * slot + (slot - bw) / 2);
    const yMean = Math.round(yOf(value.mean));
    const yZero = Math.round(yOf(0));
    const top = Math.min(yZero, yMean);
    const h = Math.max(1, Math.abs(yMean - yZero));
    fillRect(rgba, width, x, top, bw, h, [28, 54, 92]);
    const yLo = Math.round(yOf(value.lo));
    const yHi = Math.round(yOf(value.hi));
    const cx = Math.round(x + bw / 2);
    vline(rgba, width, cx, yLo, yHi, [180, 60, 40]);
    fillRect(rgba, width, cx - 4, Math.min(yLo, yHi), 9, 1, [180, 60, 40]);
    fillRect(rgba, width, cx - 4, Math.max(yLo, yHi), 9, 1, [180, 60, 40]);
    drawText(rgba, width, Math.round(originX + i * slot + 8), originY + plotH + 10, labels[i]!, [40, 40, 40]);
  });
}

function writeGapFigure(report: Report) {
  const width = 760;
  const height = 360;
  const rgba = paint(width, height);
  drawText(rgba, width, 16, 12, "20-step probe drop", [20, 20, 20]);
  drawText(rgba, width, 400, 12, "doorway  erased minus mastered", [20, 20, 20]);
  bars(
    rgba,
    width,
    16,
    36,
    340,
    250,
    ["learn", "held", "erase"],
    [report.drop20Learn, report.drop20Held, report.drop20Negate],
    [{ at: 0, rgb: [20, 20, 20] }],
  );
  bars(
    rgba,
    width,
    400,
    36,
    340,
    250,
    ["raw", "rho", "surp", "rnd", "count"],
    [report.rawDoor, report.rhoDoor, report.surpriseDoor, report.rndDoor, report.countDoor],
    [{ at: 0, rgb: [20, 20, 20] }],
  );
  drawText(rgba, width, 16, 330, "left: error fall in 20 steps. right: score into the east room.", [60, 60, 60]);
  writeFileSync(`${OUT}/relearn-gap.png`, writePng(width, height, rgba));
}

function writeCsv(report: Report) {
  const lines = [
    "quantity,mean,lo,hi,call",
    row("slope", report.slope),
    row("origin", report.origin),
    row("drop", report.drop),
    row("fall", report.fall),
    row("arrival", report.arrival),
    row("progress", report.progress),
    row("held", report.held),
    row("rawDoor", report.rawDoor),
    row("rhoDoor", report.rhoDoor),
    row("surpriseDoor", report.surpriseDoor),
    row("rndDoor", report.rndDoor),
    row("countDoor", report.countDoor),
  ];
  writeFileSync(`${OUT}/relearn.csv`, lines.join("\n") + "\n");
}

function row(name: string, ci: Interval & { call?: Call }) {
  return [name, ci.mean, ci.lo, ci.hi, ci.call ?? ""].join(",");
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (process.argv.includes("--figure")) {
    const saved = JSON.parse(readFileSync(`${OUT}/relearn.json`, "utf8")) as { report: Report };
    writeGapFigure(saved.report);
    return;
  }
  const jobs: RelearnJob[] = SEEDS.map((seed, id) => ({ kind: "sample", id, seed }));
  const workers = workerCount();
  const t0 = Date.now();
  console.error(`relearn: ${jobs.length} jobs, ${workers} workers`);
  const rows = await runPool(jobs, new URL("./relearn-worker.ts", import.meta.url), workers);
  console.error(`relearn: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const ordered = rows.slice().sort((a, b) => a.seed - b.seed);
  if (ordered.length !== SEEDS.length || ordered.some((row, i) => row.seed !== SEEDS[i])) abort("relearn did not return seeds 1–200");
  let maxAbsStay = 0;
  let maxAbsCount = 0;
  for (const row of ordered) {
    maxAbsStay = Math.max(maxAbsStay, Math.abs(row.stay));
    maxAbsCount = Math.max(maxAbsCount, Math.abs(row.negateDoor.count - row.heldDoor.count));
  }
  if (maxAbsStay > 1e-9) abort(`idle probe moved, max |stay| ${maxAbsStay}`);
  if (maxAbsCount !== 0) abort(`count doorway diverged, max |gap| ${maxAbsCount}`);
  const learnMean = meanOf(ordered.map((row) => row.learnDrop));
  const overwrite = meanOf(ordered.map((row) => row.negateOverwrite));
  const rawHeld = meanOf(ordered.map((row) => row.held.raw));
  const rawNegate = meanOf(ordered.map((row) => row.negate.raw));
  const dropHeld = meanOf(ordered.map((row) => row.held.drop20));
  const dropNegate = meanOf(ordered.map((row) => row.negate.drop20));
  const miss = (name: string, got: number, want: number) => {
    if (Math.abs(got - want) > 1e-9) abort(`${name} ${got} does not match ${want}`);
  };
  miss("learn drop", learnMean, PUBLISHED_LEARN);
  miss("overwrite", overwrite, PUBLISHED_NEGATE_OVERWRITE);
  miss("raw held", rawHeld, PUBLISHED_RAW_HELD);
  miss("raw negate", rawNegate, PUBLISHED_RAW_NEGATE);
  miss("drop held", dropHeld, PUBLISHED_DROP_HELD);
  miss("drop negate", dropNegate, PUBLISHED_DROP_NEGATE);
  const report = reportOf(ordered);
  console.error(`summary ${report.summary}; verdict ${report.verdict}; slope ${report.slope.verdict}`);
  console.error(`slope ${fmt(report.slope)} ${report.slope.call}`);
  console.error(`origin ${fmt(report.origin)} ${report.origin.call}`);
  console.error(`drop ${fmt(report.drop)} ${report.drop.call}`);
  console.error(`fall ${fmt(report.fall)} ${report.fall.call}`);
  console.error(`arrival ${fmt(report.arrival)} ${report.arrival.call}`);
  console.error(`progress ${fmt(report.progress)} ${report.progress.call}`);
  console.error(`held ${fmt(report.held)} ${report.held.call}`);
  console.error(`rawDoor ${fmt(report.rawDoor)} ${report.rawDoor.call}`);
  console.error(`rhoDoor ${fmt(report.rhoDoor)} ${report.rhoDoor.call}`);
  console.error(`surpriseDoor ${fmt(report.surpriseDoor)} ${report.surpriseDoor.call}`);
  console.error(`rndDoor ${fmt(report.rndDoor)} ${report.rndDoor.call}`);
  console.error(`countDoor ${fmt(report.countDoor)} ${report.countDoor.call}`);
  console.error(`drop20 learn ${fmt(report.drop20Learn)} held ${fmt(report.drop20Held)} erase ${fmt(report.drop20Negate)}`);
  console.error(`raw learn ${fmt(report.rawLearn)} held ${fmt(report.rawHeld)} erase ${fmt(report.rawNegate)}`);
  console.error(`fall learn ${fmt(report.fallLearn)} arrival learn ${fmt(report.arrivalLearn)}`);
  console.error(`ema learn ${fmt(report.emaLearn)} erase ${fmt(report.emaNegate)} surprise0 ${fmt(report.surpriseNegate)}`);
  console.error(`positive learn ${fmt(report.positiveLearn)} erase ${fmt(report.positiveNegate)}`);
  console.error(`rho global ${fmt(report.rhoGlobal)} uncertainty ${fmt(report.rhoUncertainty)}`);
  console.error(`progressEma held ${fmt(report.progressEmaHeld)} erase ${fmt(report.progressEmaNegate)} gap ${fmt(report.progressEmaGap)}`);
  console.error(`rect learn ${fmt(report.rectLearn)} held ${fmt(report.rectHeld)} erase ${fmt(report.rectNegate)}`);
  const body = {
    date: new Date().toISOString(),
    seeds: SEEDS,
    seconds: (Date.now() - t0) / 1000,
    report,
    samples: ordered,
  };
  writeFileSync(`${OUT}/relearn.json`, JSON.stringify(body));
  writeCsv(report);
  writeGapFigure(report);
}

main();
