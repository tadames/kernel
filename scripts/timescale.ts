/**
 * Measure the cell learner's adaptation timescale on a frozen east pattern.
 * Writes bench/phase/timescale.json. Not part of CI.
 *
 *   npm run timescale
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { adaptationCurve, fitTau } from "../src/lib/kernel/phase-run.ts";
import { driftRatesFromTau, forgettingRatesFromTau, FORGETTING_FACTORS } from "../src/lib/kernel/family.ts";
import { bootstrapMeanCI } from "../src/lib/kernel/stats.ts";

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) return fallback;
  return process.argv[i + 1]!;
}

const seeds = Array.from({ length: Math.max(1, Number(arg("seeds", "8"))) }, (_, i) => i + 1);
const steps = Math.max(50, Number(arg("steps", "400")));
const fits = [];
for (const seed of seeds) {
  const t0 = Date.now();
  const curve = adaptationCurve(seed, steps);
  const fit = fitTau(curve);
  const curveDecimated = curve.filter((_, index) => index % 20 === 0 || index === curve.length - 1);
  fits.push({ seed, ...fit, curve: curveDecimated });
  console.error(
    `seed ${seed} tau ${fit.tau == null ? "censored" : fit.tau.toFixed(2)} half ${fit.halfLife == null ? "—" : fit.halfLife.toFixed(1)} e0 ${fit.e0.toFixed(3)} einf ${fit.eInf.toFixed(3)} ${(Date.now() - t0) / 1000}s`,
  );
}
const finite = fits.map((row) => row.tau).filter((tau): tau is number => tau != null && Number.isFinite(tau));
const ci = bootstrapMeanCI(finite, 2000, 0.05, 5);
const tau = finite.length >= 4 ? ci.mean : steps;
const censored = finite.length < 4;
const report = {
  date: new Date().toISOString(),
  steps,
  seeds,
  definition:
    "tau is the e-folding time of excess live probe error on a frozen east pattern. The shipped transition learner takes one uniform transition per step. Scent is zero. Excess is error minus the mean of the last 15% of the curve. OLS is log(excess) on step while excess stays above 5% of the initial excess and step < 300. If that slope is not negative, tau is the half-life divided by ln 2. A curve that never halves is censored.",
  censored,
  tau: ci,
  tauUsed: tau,
  driftRates: driftRatesFromTau(tau),
  forgettingRates: forgettingRatesFromTau(tau),
  forgettingFactors: [...FORGETTING_FACTORS],
  fits,
};
mkdirSync("bench/phase", { recursive: true });
writeFileSync("bench/phase/timescale.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ tau: ci, tauUsed: tau, censored, driftRates: report.driftRates, forgettingRates: report.forgettingRates }, null, 2));
