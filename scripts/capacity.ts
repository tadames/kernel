/**
 * Where rho fails to revisit a room that a small net forgot while away.
 * Not part of CI.
 *
 *   npm run capacity
 *
 * Seeds 1–200. Width 32 is the shipped net. Widths 16, 8, 4, 2, and 1 are
 * the capacity ladder. Occupancy runs only when a narrow width erases the
 * mastered room, renews shipped progress past the wide net, and clears the
 * dose the temperature-0.15 curve can see. Writes bench/capacity/capacity.json,
 * capacity.csv, and capacity-gap.png. capacity-amplitude.png is written
 * when the planted wave or the occupancy contrast runs.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { greaterCall, type Call } from "../src/lib/kernel/noise.ts";
import { bootstrapMeanCI, meanOf, type Interval } from "../src/lib/kernel/stats.ts";
import type { CuriositySignal } from "../src/lib/kernel/signals.ts";
import {
  CAPACITY_WIDTHS,
  DOSE_VISIBLE,
  INSTRUMENT_DOSE,
  OCCUPANCY_SALT,
  PRIMARY_TEMPERATURE,
  PUBLISHED_INTERFERENCE,
  PUBLISHED_LEARN,
  SENSITIVITY_DOSE,
  SHIPPED_HIDDEN,
  WAVE_SALT,
  amplitudeSalt,
  capacityInstrument,
  capacitySummary,
  capacityVerdict,
  dropSalt,
  eastSalt,
  erasureGap,
  erasureSalt,
  exceedsSalt,
  gapVisible,
  gateWidth,
  halfSalt,
  learnSalt,
  overwriteSalt,
  periodLock,
  phaseSalt,
  rawSalt,
  rectSalt,
  selectWidth,
  waveEastSalt,
  wavePhaseSalt,
  waveSalt,
  type CapacityReason,
  type CapacitySummary,
} from "../src/lib/kernel/capacity.ts";
import {
  runCapacityJob,
  type CapacityEpisode,
  type CapacityEpisodeResult,
  type CapacityJob,
  type CapacitySample,
} from "../src/lib/kernel/capacity-run.ts";
import { drawText, fillRect, writePng } from "./png.ts";
import { runPool, workerCount } from "./pool.ts";

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const EXPLORERS = ["random", "count", "surprise", "rnd", "rho"] as const;
const OUT = "bench/capacity";

function meanCI(xs: number[], salt: number): Interval {
  return bootstrapMeanCI(xs, 2000, 0.05, salt);
}

function diffCI(a: number[], b: number[], salt: number): Interval {
  const d = a.map((v, i) => v - b[i]!);
  return bootstrapMeanCI(d, 2000, 0.05, salt);
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

function bySeed(rows: CapacitySample[]) {
  return rows.slice().sort((a, b) => a.seed - b.seed);
}

async function run(jobs: CapacityJob[], label: string) {
  const workers = workerCount();
  const t0 = Date.now();
  console.error(`${label}: ${jobs.length} jobs, ${workers} workers`);
  const out = await runPool(jobs, new URL("./capacity-worker.ts", import.meta.url), workers);
  console.error(`${label}: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return out;
}

type WidthReport = {
  hidden: number;
  n: number;
  learn: Interval & { call: Call };
  overwrite: Interval;
  erasure: Interval & { call: Call };
  rectGap: Interval & { call: Call };
  rawGap: Interval;
  drop20Gap: Interval;
  exceeds: (Interval & { call: Call }) | null;
  visible: boolean;
  half: Interval | null;
  period: ReturnType<typeof periodLock>;
  score: number;
  reason: CapacityReason;
  maxAbsStay: number;
};

function reportWidth(hidden: number, rows: CapacitySample[], wide: CapacitySample[] | null): WidthReport {
  const learn = meanCI(rows.map((row) => row.learnDrop), learnSalt(hidden));
  const overwrite = meanCI(rows.map((row) => row.overwrite), overwriteSalt(hidden));
  const erasure = meanCI(
    rows.map((row) => erasureGap(row.overwrite, row.learnDrop)),
    erasureSalt(hidden),
  );
  const rectGap = diffCI(
    rows.map((row) => row.returnRectInter),
    rows.map((row) => row.returnRectHeld),
    rectSalt(hidden),
  );
  const rawGap = diffCI(
    rows.map((row) => row.returnRawInter),
    rows.map((row) => row.returnRawHeld),
    rawSalt(hidden),
  );
  const drop20Gap = diffCI(
    rows.map((row) => row.drop20Inter),
    rows.map((row) => row.drop20Held),
    dropSalt(hidden),
  );
  const halves = rows.map((row) => row.half);
  const period = periodLock(halves, rows.length);
  const halfValues = halves.filter((h): h is number => h != null);
  const half = halfValues.length > 0 ? meanCI(halfValues, halfSalt(hidden)) : null;
  let exceeds: WidthReport["exceeds"] = null;
  if (wide) {
    const ci = diffCI(
      rows.map((row, i) => row.returnRectInter - row.returnRectHeld),
      wide.map((row) => row.returnRectInter - row.returnRectHeld),
      exceedsSalt(hidden),
    );
    exceeds = { ...ci, call: callOf(ci) };
  }
  const learns = callOf(learn);
  const forgets = callOf(erasure);
  const renews = callOf(rectGap);
  const exceedsCall: Call = exceeds ? exceeds.call : "inconclusive";
  const visible = exceeds ? gapVisible(exceeds) : false;
  const gate = gateWidth({
    learns,
    forgets,
    renews,
    exceeds: exceedsCall,
    visible,
    period: period.ok ? "ok" : "censored",
  });
  let maxAbsStay = 0;
  for (const row of rows) maxAbsStay = Math.max(maxAbsStay, Math.abs(row.stay));
  return {
    hidden,
    n: rows.length,
    learn: { ...learn, call: learns },
    overwrite,
    erasure: { ...erasure, call: forgets },
    rectGap: { ...rectGap, call: renews },
    rawGap,
    drop20Gap,
    exceeds,
    visible,
    half,
    period,
    score: gate.score,
    reason: gate.reason,
    maxAbsStay,
  };
}

function explorerIndex(signal: CuriositySignal) {
  return EXPLORERS.indexOf(signal as (typeof EXPLORERS)[number]);
}

function doseIndex(dose: number) {
  if (dose === SENSITIVITY_DOSE) return 0;
  if (dose === INSTRUMENT_DOSE) return 1;
  throw new Error(`dose ${dose} is not on the ladder`);
}

type ArmGap = {
  signal: CuriositySignal;
  amplitude: Interval & { call: Call };
  phase: Interval;
  east: Interval;
  n: number;
};

function episodeGaps(
  left: CapacityEpisodeResult[],
  right: CapacityEpisodeResult[],
  saltFor: (signal: CuriositySignal) => { amplitude: number; phase: number; east: number },
): ArmGap[] {
  const gaps: ArmGap[] = [];
  for (const signal of EXPLORERS) {
    const a = left.filter((row) => row.signal === signal).sort((x, y) => x.seed - y.seed);
    const b = right.filter((row) => row.signal === signal).sort((x, y) => x.seed - y.seed);
    if (a.length === 0 && b.length === 0) continue;
    if (a.length !== b.length || a.some((row, i) => row.seed !== b[i]!.seed)) {
      abort(`${signal} arms are not paired`);
    }
    const salts = saltFor(signal);
    const amplitude = diffCI(
      a.map((row) => row.amplitude),
      b.map((row) => row.amplitude),
      salts.amplitude,
    );
    gaps.push({
      signal,
      amplitude: { ...amplitude, call: callOf(amplitude) },
      phase: diffCI(
        a.map((row) => row.phasePeriod),
        b.map((row) => row.phasePeriod),
        salts.phase,
      ),
      east: diffCI(
        a.map((row) => row.eastFrac),
        b.map((row) => row.eastFrac),
        salts.east,
      ),
      n: a.length,
    });
  }
  return gaps;
}

function samePath(a: CapacityEpisodeResult[], b: CapacityEpisodeResult[], label: string) {
  const left = a.filter((row) => row.signal === "random").sort((x, y) => x.seed - y.seed);
  const right = b.filter((row) => row.signal === "random").sort((x, y) => x.seed - y.seed);
  if (left.length !== right.length) abort(`${label}: random seed count differs`);
  for (let i = 0; i < left.length; i++) {
    const x = left[i]!;
    const y = right[i]!;
    if (x.seed !== y.seed || x.checksum !== y.checksum || x.eastFrac !== y.eastFrac || x.foods !== y.foods || x.lives !== y.lives) {
      abort(`${label}: random path diverged at seed ${x.seed}`);
    }
    if (x.foods !== 0 || x.lives !== 0) abort(`${label}: cycle world recorded a meal or a death`);
  }
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
    drawText(rgba, width, Math.round(originX + i * slot + 6), originY + plotH + 10, labels[i]!, [40, 40, 40]);
  });
}

function writeGapFigure(reports: WidthReport[]) {
  const width = 760;
  const height = 360;
  const rgba = paint(width, height);
  drawText(rgba, width, 16, 12, "overwrite  interference minus held", [20, 20, 20]);
  drawText(rgba, width, 400, 12, "return progress  interference minus held", [20, 20, 20]);
  const labels = reports.map((row) => String(row.hidden));
  bars(rgba, width, 16, 36, 340, 250, labels, reports.map((row) => row.overwrite), [
    { at: 0, rgb: [20, 20, 20] },
  ]);
  bars(rgba, width, 400, 36, 340, 250, labels, reports.map((row) => row.rectGap), [
    { at: 0, rgb: [20, 20, 20] },
    { at: DOSE_VISIBLE, rgb: [180, 140, 40] },
  ]);
  drawText(rgba, width, 16, 320, "width. whisker is the 95% CI. gold is dose 0.0085", [80, 80, 80]);
  writeFileSync(`${OUT}/capacity-gap.png`, writePng(width, height, rgba));
}

function writeAmplitudeFigure(title: string, gaps: ArmGap[], file: string) {
  const width = 640;
  const height = 320;
  const rgba = paint(width, height);
  drawText(rgba, width, 16, 12, title, [20, 20, 20]);
  bars(
    rgba,
    width,
    24,
    40,
    590,
    220,
    gaps.map((row) => row.signal),
    gaps.map((row) => row.amplitude),
    [{ at: 0, rgb: [20, 20, 20] }],
  );
  drawText(rgba, width, 16, 290, "amplitude gap. whisker is the 95% CI", [80, 80, 80]);
  writeFileSync(`${OUT}/${file}`, writePng(width, height, rgba));
}

function writeCsv(reports: WidthReport[]) {
  const lines = [
    "hidden,learn,learnLo,learnHi,overwrite,overwriteLo,overwriteHi,erasure,erasureLo,erasureHi,rect,rectLo,rectHi,raw,rawLo,rawHi,reason",
  ];
  for (const row of reports) {
    lines.push(
      [
        row.hidden,
        row.learn.mean,
        row.learn.lo,
        row.learn.hi,
        row.overwrite.mean,
        row.overwrite.lo,
        row.overwrite.hi,
        row.erasure.mean,
        row.erasure.lo,
        row.erasure.hi,
        row.rectGap.mean,
        row.rectGap.lo,
        row.rectGap.hi,
        row.rawGap.mean,
        row.rawGap.lo,
        row.rawGap.hi,
        row.reason,
      ].join(","),
    );
  }
  writeFileSync(`${OUT}/capacity.csv`, lines.join("\n") + "\n");
}

function mainSummary(fed: boolean, instrument: Call, gaps: ArmGap[] | null): CapacitySummary {
  if (!fed) return "unfed";
  const find = (signal: CuriositySignal) => gaps?.find((row) => row.signal === signal)?.amplitude.call ?? "inconclusive";
  return capacitySummary({
    fed,
    instrument,
    random: find("random"),
    rho: find("rho"),
    others: (["count", "surprise", "rnd"] as const).map((signal) => find(signal)),
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (process.argv.includes("--figure")) {
    const saved = JSON.parse(readFileSync(`${OUT}/capacity.json`, "utf8")) as { reports: WidthReport[] };
    writeGapFigure(saved.reports);
    return;
  }
  const jobs: CapacityJob[] = [];
  let id = 0;
  for (const hidden of CAPACITY_WIDTHS) {
    for (const seed of SEEDS) jobs.push({ kind: "sample", id: id++, seed, hidden });
  }
  const t0 = Date.now();
  const samples = (await run(jobs, "curve")).filter((row): row is CapacitySample => row.kind === "sample");
  const grouped = new Map<number, CapacitySample[]>();
  for (const hidden of CAPACITY_WIDTHS) grouped.set(hidden, []);
  for (const row of samples) grouped.get(row.hidden)!.push(row);
  for (const hidden of CAPACITY_WIDTHS) {
    const rows = bySeed(grouped.get(hidden)!);
    grouped.set(hidden, rows);
    if (rows.length !== SEEDS.length || rows.some((row, i) => row.seed !== SEEDS[i])) {
      abort(`width ${hidden} did not return seeds 1–200`);
    }
    let maxAbsStay = 0;
    for (const row of rows) maxAbsStay = Math.max(maxAbsStay, Math.abs(row.stay));
    if (maxAbsStay > 1e-9) abort(`width ${hidden} changed the probe while idle, max |stay| ${maxAbsStay}`);
  }
  const wide = grouped.get(SHIPPED_HIDDEN)!;
  const learnMean = meanOf(wide.map((row) => row.learnDrop));
  const interMean = meanOf(wide.map((row) => row.overwrite));
  if (Math.abs(learnMean - PUBLISHED_LEARN) > 1e-9 || Math.abs(interMean - PUBLISHED_INTERFERENCE) > 1e-9) {
    abort(
      `width 32 does not match the published curve: learn ${learnMean} vs ${PUBLISHED_LEARN}, interference ${interMean} vs ${PUBLISHED_INTERFERENCE}`,
    );
  }
  const reports = CAPACITY_WIDTHS.map((hidden) =>
    reportWidth(hidden, grouped.get(hidden)!, hidden === SHIPPED_HIDDEN ? null : wide),
  );
  for (const row of reports) {
    console.error(
      `width ${row.hidden}: learn ${fmt(row.learn)} ${row.learn.call}; erasure ${fmt(row.erasure)} ${row.erasure.call}; rect ${fmt(row.rectGap)} ${row.rectGap.call}; raw ${fmt(row.rawGap)}; ${row.reason}`,
    );
  }
  const choice = selectWidth(
    reports.filter((row) => row.hidden !== SHIPPED_HIDDEN).map((row) => ({
      hidden: row.hidden,
      score: row.score,
      reason: row.reason,
    })),
  );
  console.error(`feeder: ${choice.reason} width ${choice.hidden ?? "none"}`);

  let instrument: Call = "inconclusive";
  let waveGaps: ArmGap[] | null = null;
  let sensitivity: ArmGap | null = null;
  let occupancy: ArmGap[] | null = null;
  let period: ReturnType<typeof periodLock> | null = null;

  if (choice.hidden != null) {
    const selected = reports.find((row) => row.hidden === choice.hidden)!;
    period = selected.period;
    if (!period.ok || period.period == null || period.steps == null) abort("selected width has no period");
    const waveJobs: CapacityEpisode[] = [];
    const pushWave = (signal: (typeof EXPLORERS)[number], add: number) => {
      for (const seed of SEEDS) {
        waveJobs.push({
          kind: "episode",
          id: id++,
          seed,
          signal,
          steps: period.steps!,
          period: period.period!,
          hidden: SHIPPED_HIDDEN,
          policyTemperature: PRIMARY_TEMPERATURE,
          add,
          salt: WAVE_SALT,
          tag: add === 0 ? "flat" : "wave",
        });
      }
    };
    for (const signal of EXPLORERS) pushWave(signal, 0);
    for (const signal of EXPLORERS) pushWave(signal, INSTRUMENT_DOSE);
    pushWave("rho", SENSITIVITY_DOSE);
    const waveRows = (await run(waveJobs, "wave")).filter((row): row is CapacityEpisodeResult => row.kind === "episode");
    for (const row of waveRows) {
      if (row.foods !== 0 || row.lives !== 0) abort("planted wave recorded a meal or a death");
    }
    const flat = waveRows.filter((row) => row.add === 0);
    const wave05 = waveRows.filter((row) => row.add === INSTRUMENT_DOSE);
    const waveSens = waveRows.filter((row) => row.add === SENSITIVITY_DOSE);
    samePath(flat, wave05, "planted wave");
    waveGaps = episodeGaps(wave05, flat, (signal) => ({
      amplitude: waveSalt(doseIndex(INSTRUMENT_DOSE), explorerIndex(signal)),
      phase: wavePhaseSalt(doseIndex(INSTRUMENT_DOSE), explorerIndex(signal)),
      east: waveEastSalt(doseIndex(INSTRUMENT_DOSE), explorerIndex(signal)),
    }));
    const rhoSens = episodeGaps(waveSens, flat.filter((row) => row.signal === "rho"), () => ({
      amplitude: waveSalt(doseIndex(SENSITIVITY_DOSE), explorerIndex("rho")),
      phase: wavePhaseSalt(doseIndex(SENSITIVITY_DOSE), explorerIndex("rho")),
      east: waveEastSalt(doseIndex(SENSITIVITY_DOSE), explorerIndex("rho")),
    }));
    sensitivity = rhoSens.find((row) => row.signal === "rho") ?? null;
    const rhoGate = waveGaps.find((row) => row.signal === "rho");
    if (!rhoGate) abort("planted wave did not score rho");
    instrument = capacityInstrument(rhoGate.amplitude.call);
    console.error(`instrument ${instrument}: rho amplitude ${fmt(rhoGate.amplitude)}`);
    if (sensitivity) console.error(`sensitivity 0.0085: ${fmt(sensitivity.amplitude)} ${sensitivity.amplitude.call}`);
    writeAmplitudeFigure("planted wave minus flat, dose 0.05", waveGaps, "capacity-wave.png");

    if (instrument === "confirmed") {
      const occJobs: CapacityEpisode[] = [];
      for (const hidden of [choice.hidden, SHIPPED_HIDDEN]) {
        for (const signal of EXPLORERS) {
          for (const seed of SEEDS) {
            occJobs.push({
              kind: "episode",
              id: id++,
              seed,
              signal,
              steps: period.steps,
              period: period.period,
              hidden,
              policyTemperature: PRIMARY_TEMPERATURE,
              add: 0,
              salt: OCCUPANCY_SALT,
              tag: hidden === SHIPPED_HIDDEN ? "wide" : "narrow",
            });
          }
        }
      }
      const occRows = (await run(occJobs, "occupancy")).filter((row): row is CapacityEpisodeResult => row.kind === "episode");
      for (const row of occRows) {
        if (row.foods !== 0 || row.lives !== 0) abort("occupancy recorded a meal or a death");
      }
      const narrow = occRows.filter((row) => row.tag === "narrow");
      const wideRows = occRows.filter((row) => row.tag === "wide");
      samePath(narrow, wideRows, "occupancy");
      occupancy = episodeGaps(narrow, wideRows, (signal) => ({
        amplitude: amplitudeSalt(explorerIndex(signal)),
        phase: phaseSalt(explorerIndex(signal)),
        east: eastSalt(explorerIndex(signal)),
      }));
      for (const row of occupancy) console.error(`${row.signal} amplitude ${fmt(row.amplitude)} ${row.amplitude.call}`);
      writeAmplitudeFigure(`width ${choice.hidden} minus 32`, occupancy, "capacity-amplitude.png");
    }
  }

  const summary = mainSummary(choice.hidden != null, instrument, occupancy);
  const verdict = capacityVerdict(summary);
  const body = {
    date: new Date().toISOString(),
    seeds: SEEDS,
    temperature: PRIMARY_TEMPERATURE,
    doseVisible: DOSE_VISIBLE,
    publishedLearn: learnMean,
    publishedInterference: interMean,
    samples,
    reports,
    choice,
    period,
    instrument,
    wave: waveGaps,
    sensitivity,
    occupancy,
    summary,
    verdict,
    seconds: (Date.now() - t0) / 1000,
  };
  writeFileSync(`${OUT}/capacity.json`, JSON.stringify(body, null, 2));
  writeCsv(reports);
  writeGapFigure(reports);
  console.error(`summary ${summary}; verdict ${verdict}; ${body.seconds.toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
