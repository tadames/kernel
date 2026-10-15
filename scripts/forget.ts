/**
 * Forgetting-cycle sweep on the two-room map. Not part of CI.
 *
 *   npm run timescale
 *   npm run forget -- --seeds 20 --steps 2000
 *
 * Weight decay rates are the half-lives τ×{0.5,1,2,4,8} from timescale.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { CURIOSITY_SIGNALS, type CuriositySignal } from "../src/lib/kernel/signals.ts";
import { type ForgetRequest, type ForgetResult } from "../src/lib/kernel/phase-run.ts";
import { seedLogSlope } from "../src/lib/kernel/period.ts";
import { bootstrapMeanCI, type Interval } from "../src/lib/kernel/stats.ts";
import { runPool, workerCount } from "./pool.ts";

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) return fallback;
  return process.argv[i + 1]!;
}

type Call = "confirmed" | "refuted" | "inconclusive";

function slopeCall(slope: Interval, nSeeds: number, total: number): Call {
  if (nSeeds * 2 < total) return "inconclusive";
  if (slope.hi < 0) return "confirmed";
  if (slope.lo > 0) return "refuted";
  return "inconclusive";
}

async function main() {
  const timescale = JSON.parse(readFileSync("bench/phase/timescale.json", "utf8")) as {
    tauUsed: number;
    forgettingRates: number[];
  };
  const rates = timescale.forgettingRates;
  const nSeeds = Math.max(1, Number(arg("seeds", "20")));
  const steps = Math.max(100, Number(arg("steps", "2000")));
  const workers = workerCount(Number(arg("workers", "0")));
  const seeds = Array.from({ length: nSeeds }, (_, i) => i + 1);
  const jobs: ForgetRequest[] = [];
  let id = 0;
  for (const forgettingRate of rates) {
    for (const signal of CURIOSITY_SIGNALS) {
      for (const seed of seeds) jobs.push({ id: id++, seed, signal, steps, forgettingRate });
    }
  }
  console.error(`forget ${jobs.length} episodes, ${workers} workers, ${steps} steps`);
  const t0 = Date.now();
  const rows = await runPool<ForgetRequest, ForgetResult>(jobs, new URL("./forget-worker.ts", import.meta.url), workers);
  console.error(`forget finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const signals: Record<string, unknown> = {};
  for (const signal of CURIOSITY_SIGNALS) {
    const periodsBySeed = seeds.map((seed) =>
      rates.map((rate) => {
        const row = rows.find((item) => item.signal === signal && item.seed === seed && item.forgettingRate === rate);
        return row?.period ?? null;
      }),
    );
    const fit = seedLogSlope(rates, periodsBySeed, 3, 2000, 9 + signal.length);
    const byRate = rates.map((rate, index) => {
      const detected = rows
        .filter((row) => row.signal === signal && row.forgettingRate === rate && row.period != null)
        .map((row) => row.period as number);
      return {
        forgettingRate: rate,
        halfLife: Math.LN2 / rate,
        nDetected: detected.length,
        period: bootstrapMeanCI(detected, 2000, 0.05, 50 + index),
        eastFrac: bootstrapMeanCI(
          rows.filter((row) => row.signal === signal && row.forgettingRate === rate).map((row) => row.eastFrac),
          2000,
          0.05,
          80 + index,
        ),
      };
    });
    signals[signal] = {
      nSeedsWithSlope: fit.nSeeds,
      slope: fit.slope,
      call: slopeCall(fit.slope, fit.nSeeds, seeds.length),
      byRate,
    };
  }

  const report = {
    date: new Date().toISOString(),
    steps,
    seeds,
    tauUsed: timescale.tauUsed,
    forgettingRates: rates,
    definition:
      "Period is the spectral peak of the east-room occupancy series between 20 steps and half the episode, kept only when its power is at least 3× the median power in that band. The slope is log(period) on log(weight-decay), fit per seed on rates where that seed has a period, then averaged. A seed needs periods at 3 or more rates. The call is inconclusive when fewer than half the seeds yield a slope, or when the CI of the mean slope includes zero. Confirmed means the CI lies entirely below zero.",
    signals,
  };
  mkdirSync("bench/phase", { recursive: true });
  writeFileSync("bench/phase/forget.json", `${JSON.stringify(report, null, 2)}\n`);
  const lines = ["forgetting_rate,signal,seed,period,acf_period,power_ratio,east_frac,foods,lives,series"];
  for (const row of rows) {
    lines.push(
      [
        row.forgettingRate,
        row.signal,
        row.seed,
        row.period ?? "",
        row.acfPeriod ?? "",
        row.powerRatio.toFixed(4),
        row.eastFrac.toFixed(6),
        row.foods,
        row.lives,
        row.series,
      ].join(","),
    );
  }
  writeFileSync("bench/phase/forget.csv", `${lines.join("\n")}\n`);
  const rho = signals.rho as { call: string; slope: Interval; nSeedsWithSlope: number };
  console.log(JSON.stringify({ rhoCall: rho.call, slope: rho.slope, nSeeds: rho.nSeedsWithSlope }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});