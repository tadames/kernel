/**
 * Where rho fails to revisit a room whose glow targets were negated.
 * Not part of CI.
 *
 *   npm run negate
 *
 * Seeds 1–200. Width 32 is the shipped net. Width 1 is the net that does
 * not store the pattern. Occupancy runs only when negation erases at least
 * half the learn drop, the true-target continuation does not, the glow
 * carries the rise, and the return renews shipped progress past the dose
 * the temperature-0.15 curve can see. Writes bench/negate/negate.json,
 * negate.csv, and negate-gap.png. negate-wave.png and negate-amplitude.png
 * are written when those stages run.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { greaterCall, type Call } from "../src/lib/kernel/noise.ts";
import { bootstrapMeanCI, meanOf, type Interval } from "../src/lib/kernel/stats.ts";
import type { CuriositySignal } from "../src/lib/kernel/signals.ts";
import { PUBLISHED_INTERFERENCE, PUBLISHED_LEARN } from "../src/lib/kernel/capacity.ts";
import { runCapacityJob, type CapacityJob, type CapacitySample } from "../src/lib/kernel/capacity-run.ts";
import {
  DOSE_VISIBLE,
  INSTRUMENT_DOSE,
  NEGATE_WIDTHS,
  OCCUPANCY_SALT,
  PRIMARY_TEMPERATURE,
  SENSITIVITY_DOSE,
  SHIPPED_HIDDEN,
  WAVE_SALT,
  amplitudeSalt,
  contErasureSalt,
  contOverwriteSalt,
  dropSalt,
  eastSalt,
  erasureGap,
  glowRiseSalt,
  halfSalt,
  learnSalt,
  manipulateVerdict,
  negateErasureSalt,
  negateInstrument,
  negateOverwriteSalt,
  negateSummary,
  negateVerdict,
  periodLock,
  phaseSalt,
  rawSalt,
  rectSalt,
  renewalVisible,
  gateNegate,
  selectNegate,
  storeSalt,
  waveEastSalt,
  wavePhaseSalt,
  waveSalt,
  type ManipulateVerdict,
  type NegateReason,
  type NegateSummary,
} from "../src/lib/kernel/negate.ts";
import {
  runNegateJob,
  type NegateEpisode,
  type NegateEpisodeResult,
  type NegateJob,
  type NegateSample,
} from "../src/lib/kernel/negate-run.ts";
import { drawText, fillRect, writePng } from "./png.ts";
import { runPool, workerCount } from "./pool.ts";

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const EXPLORERS = ["random", "count", "surprise", "rnd", "rho"] as const;
const OUT = "bench/negate";

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

function bySeed<T extends { seed: number }>(rows: T[]) {
  return rows.slice().sort((a, b) => a.seed - b.seed);
}

async function run(jobs: NegateJob[], label: string) {
  const workers = workerCount();
  const t0 = Date.now();
  console.error(`${label}: ${jobs.length} jobs, ${workers} workers`);
  const out = await runPool(jobs, new URL("./negate-worker.ts", import.meta.url), workers);
  console.error(`${label}: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return out;
}

type WidthReport = {
  hidden: number;
  n: number;
  learn: Interval & { call: Call };
  store: Interval & { call: Call };
  negateOverwrite: Interval;
  erasure: Interval & { call: Call };
  glowRise: Interval & { call: Call };
  contOverwrite: Interval;
  contErasure: Interval & { call: Call };
  rectGap: Interval & { call: Call };
  rawGap: Interval;
  drop20Gap: Interval;
  visible: boolean;
  half: Interval | null;
  period: ReturnType<typeof periodLock>;
  score: number;
  reason: NegateReason;
  maxAbsStay: number;
};

function reportWidth(hidden: number, rows: NegateSample[]): WidthReport {
  const learn = meanCI(rows.map((row) => row.learnDrop), learnSalt(hidden));
  const store = meanCI(
    rows.map((row) => row.glow0 - row.glowLearn),
    storeSalt(hidden),
  );
  const negateOverwrite = meanCI(rows.map((row) => row.negateOverwrite), negateOverwriteSalt(hidden));
  const erasure = meanCI(
    rows.map((row) => erasureGap(row.negateOverwrite, row.learnDrop)),
    negateErasureSalt(hidden),
  );
  const glowRise = meanCI(
    rows.map((row) => row.glowNegate - row.glowLearn),
    glowRiseSalt(hidden),
  );
  const contOverwrite = meanCI(rows.map((row) => row.contOverwrite), contOverwriteSalt(hidden));
  const contErasure = meanCI(
    rows.map((row) => erasureGap(row.contOverwrite, row.learnDrop)),
    contErasureSalt(hidden),
  );
  const rectGap = diffCI(
    rows.map((row) => row.returnRectNegate),
    rows.map((row) => row.returnRectHeld),
    rectSalt(hidden),
  );
  const rawGap = diffCI(
    rows.map((row) => row.returnRawNegate),
    rows.map((row) => row.returnRawHeld),
    rawSalt(hidden),
  );
  const drop20Gap = diffCI(
    rows.map((row) => row.drop20Negate),
    rows.map((row) => row.drop20Held),
    dropSalt(hidden),
  );
  const halves = rows.map((row) => row.half);
  const period = periodLock(halves, rows.length);
  const halfValues = halves.filter((h): h is number => h != null);
  const half = halfValues.length > 0 ? meanCI(halfValues, halfSalt(hidden)) : null;
  const learns = callOf(learn);
  const stores = callOf(store);
  const forgets = callOf(erasure);
  const pattern = callOf(glowRise);
  const absent = callOf(contErasure);
  const renews = callOf(rectGap);
  const visible = renewalVisible(rectGap);
  const gate = gateNegate({
    learns,
    stores,
    forgets,
    pattern,
    absent,
    renews,
    visible,
    period: period.ok ? "ok" : "censored",
  });
  let maxAbsStay = 0;
  for (const row of rows) maxAbsStay = Math.max(maxAbsStay, Math.abs(row.stay));
  return {
    hidden,
    n: rows.length,
    learn: { ...learn, call: learns },
    store: { ...store, call: stores },
    negateOverwrite,
    erasure: { ...erasure, call: forgets },
    glowRise: { ...glowRise, call: pattern },
    contOverwrite,
    contErasure: { ...contErasure, call: absent },
    rectGap: { ...rectGap, call: renews },
    rawGap,
    drop20Gap,
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
  left: NegateEpisodeResult[],
  right: NegateEpisodeResult[],
  saltFor: (signal: CuriositySignal) => { amplitude: number; phase: number; east: number },
): ArmGap[] {
  const gaps: ArmGap[] = [];
  for (const signal of EXPLORERS) {
    const a = left.filter((row) => row.signal === signal).sort((x, y) => x.seed - y.seed);
    const b = right.filter((row) => row.signal === signal).sort((x, y) => x.seed - y.seed);
    if (a.length === 0 && b.length === 0) continue;
    if (a.length !== b.length || a.some((row, i) => row.seed !== b[i]!.seed)) abort(`${signal} arms are not paired`);
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

function samePath(a: NegateEpisodeResult[], b: NegateEpisodeResult[], label: string) {
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
    drawText(rgba, width, Math.round(originX + i * slot + 4), originY + plotH + 10, labels[i]!, [40, 40, 40]);
  });
}

function writeGapFigure(reports: WidthReport[]) {
  const width = 760;
  const height = 360;
  const rgba = paint(width, height);
  drawText(rgba, width, 16, 12, "erasure  overwrite minus half the learn drop", [20, 20, 20]);
  drawText(rgba, width, 400, 12, "return progress  negate minus held", [20, 20, 20]);
  const labels = reports.map((row) => String(row.hidden));
  bars(rgba, width, 16, 36, 340, 250, labels, reports.map((row) => row.erasure), [{ at: 0, rgb: [20, 20, 20] }]);
  bars(rgba, width, 400, 36, 340, 250, labels, reports.map((row) => row.rectGap), [
    { at: 0, rgb: [20, 20, 20] },
    { at: DOSE_VISIBLE, rgb: [180, 140, 40] },
  ]);
  drawText(rgba, width, 16, 320, "width. whisker is the 95% CI. gold is dose 0.0085", [80, 80, 80]);
  writeFileSync(`${OUT}/negate-gap.png`, writePng(width, height, rgba));
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
    "hidden,learn,learnLo,learnHi,store,storeLo,storeHi,erasure,erasureLo,erasureHi,glowRise,glowLo,glowHi,contErasure,contLo,contHi,rect,rectLo,rectHi,reason",
  ];
  for (const row of reports) {
    lines.push(
      [
        row.hidden,
        row.learn.mean,
        row.learn.lo,
        row.learn.hi,
        row.store.mean,
        row.store.lo,
        row.store.hi,
        row.erasure.mean,
        row.erasure.lo,
        row.erasure.hi,
        row.glowRise.mean,
        row.glowRise.lo,
        row.glowRise.hi,
        row.contErasure.mean,
        row.contErasure.lo,
        row.contErasure.hi,
        row.rectGap.mean,
        row.rectGap.lo,
        row.rectGap.hi,
        row.reason,
      ].join(","),
    );
  }
  writeFileSync(`${OUT}/negate.csv`, lines.join("\n") + "\n");
}

function mainSummary(fed: boolean, instrument: Call, gaps: ArmGap[] | null): NegateSummary {
  if (!fed) return "unfed";
  const find = (signal: CuriositySignal) => gaps?.find((row) => row.signal === signal)?.amplitude.call ?? "inconclusive";
  return negateSummary({
    fed,
    instrument,
    random: find("random"),
    rho: find("rho"),
    others: (["count", "surprise", "rnd"] as const).map((signal) => find(signal)),
  });
}

async function publishedCurve() {
  const jobs: CapacityJob[] = SEEDS.map((seed, id) => ({ kind: "sample", id, seed, hidden: SHIPPED_HIDDEN }));
  const workers = workerCount();
  console.error(`published: ${jobs.length} jobs, ${workers} workers`);
  const t0 = Date.now();
  const rows = await runPool(jobs, new URL("./capacity-worker.ts", import.meta.url), workers);
  console.error(`published: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const samples = rows.filter((row): row is CapacitySample => row.kind === "sample");
  const ordered = bySeed(samples);
  if (ordered.length !== SEEDS.length || ordered.some((row, i) => row.seed !== SEEDS[i])) abort("published curve did not return seeds 1–200");
  const learnMean = meanOf(ordered.map((row) => row.learnDrop));
  const interMean = meanOf(ordered.map((row) => row.overwrite));
  if (Math.abs(learnMean - PUBLISHED_LEARN) > 1e-9 || Math.abs(interMean - PUBLISHED_INTERFERENCE) > 1e-9) {
    abort(
      `width 32 does not match the published curve: learn ${learnMean} vs ${PUBLISHED_LEARN}, interference ${interMean} vs ${PUBLISHED_INTERFERENCE}`,
    );
  }
  return { learnMean, interMean };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (process.argv.includes("--figure")) {
    const saved = JSON.parse(readFileSync(`${OUT}/negate.json`, "utf8")) as { reports: WidthReport[] };
    writeGapFigure(saved.reports);
    return;
  }
  const t0 = Date.now();
  const published = await publishedCurve();
  const jobs: NegateJob[] = [];
  let id = 0;
  for (const hidden of NEGATE_WIDTHS) {
    for (const seed of SEEDS) jobs.push({ kind: "sample", id: id++, seed, hidden });
  }
  const samples = (await run(jobs, "curve")).filter((row): row is NegateSample => row.kind === "sample");
  const grouped = new Map<number, NegateSample[]>();
  for (const hidden of NEGATE_WIDTHS) grouped.set(hidden, []);
  for (const row of samples) grouped.get(row.hidden)!.push(row);
  for (const hidden of NEGATE_WIDTHS) {
    const rows = bySeed(grouped.get(hidden)!);
    grouped.set(hidden, rows);
    if (rows.length !== SEEDS.length || rows.some((row, i) => row.seed !== SEEDS[i])) abort(`width ${hidden} did not return seeds 1–200`);
    let maxAbsStay = 0;
    for (const row of rows) maxAbsStay = Math.max(maxAbsStay, Math.abs(row.stay));
    if (maxAbsStay > 1e-9) abort(`width ${hidden} changed the probe while idle, max |stay| ${maxAbsStay}`);
  }
  const learnMean = meanOf(grouped.get(SHIPPED_HIDDEN)!.map((row) => row.learnDrop));
  if (Math.abs(learnMean - PUBLISHED_LEARN) > 1e-9) {
    abort(`width 32 learn drop ${learnMean} does not match the published learn ${PUBLISHED_LEARN}`);
  }
  const reports = NEGATE_WIDTHS.map((hidden) => reportWidth(hidden, grouped.get(hidden)!));
  for (const row of reports) {
    console.error(
      `width ${row.hidden}: learn ${fmt(row.learn)} ${row.learn.call}; store ${fmt(row.store)} ${row.store.call}; erasure ${fmt(row.erasure)} ${row.erasure.call}; glow ${fmt(row.glowRise)} ${row.glowRise.call}; cont ${fmt(row.contErasure)} ${row.contErasure.call}; rect ${fmt(row.rectGap)} ${row.rectGap.call}; ${row.reason}`,
    );
  }
  const shipped = reports.find((row) => row.hidden === SHIPPED_HIDDEN)!;
  const manipulation: ManipulateVerdict = manipulateVerdict({
    learns: shipped.learn.call,
    stores: shipped.store.call,
    forgets: shipped.erasure.call,
    pattern: shipped.glowRise.call,
    absent: shipped.contErasure.call,
  });
  console.error(`manipulation ${manipulation}`);
  const choice = selectNegate(reports.map((row) => ({ hidden: row.hidden, score: row.score, reason: row.reason })));
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
    const waveJobs: NegateEpisode[] = [];
    const pushWave = (signal: (typeof EXPLORERS)[number], add: number) => {
      for (const seed of SEEDS) {
        waveJobs.push({
          kind: "episode",
          id: id++,
          seed,
          signal,
          steps: period!.steps!,
          period: period!.period!,
          hidden: SHIPPED_HIDDEN,
          policyTemperature: PRIMARY_TEMPERATURE,
          add,
          replay: 0,
          salt: WAVE_SALT,
          tag: add === 0 ? "flat" : "wave",
        });
      }
    };
    for (const signal of EXPLORERS) pushWave(signal, 0);
    for (const signal of EXPLORERS) pushWave(signal, INSTRUMENT_DOSE);
    pushWave("rho", SENSITIVITY_DOSE);
    const waveRows = (await run(waveJobs, "wave")).filter((row): row is NegateEpisodeResult => row.kind === "episode");
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
    instrument = negateInstrument(rhoGate.amplitude.call);
    console.error(`instrument ${instrument}: rho amplitude ${fmt(rhoGate.amplitude)}`);
    if (sensitivity) console.error(`sensitivity 0.0085: ${fmt(sensitivity.amplitude)} ${sensitivity.amplitude.call}`);
    writeAmplitudeFigure("planted wave minus flat, dose 0.05", waveGaps, "negate-wave.png");

    if (instrument === "confirmed") {
      const occJobs: NegateEpisode[] = [];
      for (const replay of [1, 0]) {
        for (const signal of EXPLORERS) {
          for (const seed of SEEDS) {
            occJobs.push({
              kind: "episode",
              id: id++,
              seed,
              signal,
              steps: period.steps,
              period: period.period,
              hidden: choice.hidden,
              policyTemperature: PRIMARY_TEMPERATURE,
              add: 0,
              replay,
              salt: OCCUPANCY_SALT,
              tag: replay === 1 ? "on" : "off",
            });
          }
        }
      }
      const occRows = (await run(occJobs, "occupancy")).filter((row): row is NegateEpisodeResult => row.kind === "episode");
      for (const row of occRows) {
        if (row.foods !== 0 || row.lives !== 0) abort("occupancy recorded a meal or a death");
      }
      const on = occRows.filter((row) => row.tag === "on");
      const off = occRows.filter((row) => row.tag === "off");
      samePath(on, off, "occupancy");
      occupancy = episodeGaps(on, off, (signal) => ({
        amplitude: amplitudeSalt(explorerIndex(signal)),
        phase: phaseSalt(explorerIndex(signal)),
        east: eastSalt(explorerIndex(signal)),
      }));
      for (const row of occupancy) console.error(`${row.signal} amplitude ${fmt(row.amplitude)} ${row.amplitude.call}`);
      writeAmplitudeFigure("negate replay on minus off", occupancy, "negate-amplitude.png");
    }
  }

  const summary = mainSummary(choice.hidden != null, instrument, occupancy);
  const verdict = negateVerdict(summary);
  const body = {
    date: new Date().toISOString(),
    seeds: SEEDS,
    temperature: PRIMARY_TEMPERATURE,
    doseVisible: DOSE_VISIBLE,
    publishedLearn: published.learnMean,
    publishedInterference: published.interMean,
    negateLearn: learnMean,
    manipulation,
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
  writeFileSync(`${OUT}/negate.json`, JSON.stringify(body));
  writeCsv(reports);
  writeGapFigure(reports);
  console.error(`summary ${summary}; verdict ${verdict}; manipulation ${manipulation}; ${body.seconds.toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
