/**
 * `npm run bench:json`
 * Runs G1 (held-out probe), G2, S1–S3, C1, C2, on-policy Field ema, Rooms foods, and lives
 * on seeds 1..5 for the default flags and for each single-flag ablation.
 * The map is canonical per environment. Seeds reseed weights, not the layout.
 * Writes bench/latest.json and appends bench/history.csv.
 * `--baseline-all` measures the pre-prune stack into bench/stack-ablation.json.
 * Exits non-zero when loop.ts is under 2 KB, or when G2/S1/S2/S3/C1/C2
 * fail on a majority of seeds. G1 is recorded either way. The threshold is not loosened.
 * Keep/remove decisions are not made here. They go through `npm run gate`.
 */
import { appendFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { ablationConfigs, measureConfig, type BenchReport, type ConfigReport } from "../src/lib/kernel/bench.ts";
import { LOOP_FEATURE_KEYS, type LoopFeatureKey, type LoopFeatures } from "../src/lib/kernel/loop.ts";

const LOOP_PATH = "src/lib/kernel/loop.ts";
const MIN_LOOP_BYTES = 2048;

function loopBytes() {
  return statSync(LOOP_PATH).size;
}

function gitSha() {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function round(n: number, digits = 4) {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

function csvCell(value: string | number | boolean) {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function historyRow(date: string, sha: string, report: ConfigReport) {
  const m = report.mean;
  const cells = [
    date,
    sha,
    report.name,
    round(m.fieldEarly),
    round(m.fieldLate),
    round(m.fieldFoods, 2),
    round(m.fieldLives, 2),
    round(m.roomsFoods, 2),
    round(m.roomsLives, 2),
    report.passes.g1 ? 1 : 0,
    report.passes.g2 ? 1 : 0,
    report.passes.s1 ? 1 : 0,
    report.passes.s2 ? 1 : 0,
    report.passes.s3 ? 1 : 0,
    report.passes.c1 ? 1 : 0,
    report.passes.c2 ? 1 : 0,
  ];
  return cells.map(csvCell).join(",");
}

type ProbeRow = {
  feature: LoopFeatureKey;
  onProbe: number;
  offProbe: number;
  onPolicyOn: number;
  onPolicyOff: number;
  onLives: number;
  offLives: number;
  onG2: string;
  offG2: string;
  note: string;
};

/** Descriptive only. The 5% on-policy ema rule is retired. `npm run gate` decides. */
function ablationTable(configs: ConfigReport[]): ProbeRow[] {
  const base = configs.find((row) => row.name === "default");
  if (!base) return [];
  const rows: ProbeRow[] = [];
  for (const key of LOOP_FEATURE_KEYS) {
    const flippedName = base.features[key] ? `off-${key}` : `on-${key}`;
    const flipped = configs.find((row) => row.name === flippedName);
    if (!flipped) continue;
    const on = base.features[key] ? base : flipped;
    const off = base.features[key] ? flipped : base;
    const delta = off.mean.fieldProbeLate - on.mean.fieldProbeLate;
    rows.push({
      feature: key,
      onProbe: on.mean.fieldProbeLate,
      offProbe: off.mean.fieldProbeLate,
      onPolicyOn: on.mean.fieldLate,
      onPolicyOff: off.mean.fieldLate,
      onLives: on.mean.fieldLives,
      offLives: off.mean.fieldLives,
      onG2: `${on.passCount.g2}/${on.seeds.length}`,
      offG2: `${off.passCount.g2}/${off.seeds.length}`,
      note: `probe (off−on) ${delta.toFixed(4)}; decision is npm run gate, not this 5-seed table`,
    });
  }
  return rows;
}

function printReport(report: BenchReport, verdicts: ReturnType<typeof ablationTable>) {
  const base = report.configs.find((row) => row.name === "default");
  console.log(`bench ${report.date} ${report.sha} seeds ${report.seeds.join(",")}`);
  if (base) {
    const m = base.mean;
    const p = base.passes;
    console.log(
      `default  probe late ${m.fieldProbeLate.toFixed(4)}  probe early ${m.fieldProbeEarly.toFixed(4)}  on-policy late ${m.fieldLate.toFixed(4)}  on-policy early ${m.fieldEarly.toFixed(4)}  foods ${m.fieldFoods.toFixed(2)}  lives ${m.fieldLives.toFixed(2)}  rooms foods ${m.roomsFoods.toFixed(2)}  rooms lives ${m.roomsLives.toFixed(2)}`,
    );
    console.log(
      `claims   G1 ${p.g1 ? "pass" : "FAIL"} (${base.passCount.g1}/${base.seeds.length})  G2 ${p.g2 ? "pass" : "FAIL"} (${base.passCount.g2}/5)  S1 ${p.s1 ? "pass" : "FAIL"}  S2 ${p.s2 ? "pass" : "FAIL"}  S3 ${p.s3 ? "pass" : "FAIL"}  C1 ${p.c1 ? "pass" : "FAIL"}  C2 ${p.c2 ? "pass" : "FAIL"}`,
    );
  }
  console.log("feature          onProbe  offProbe  onPolicyOn  onPolicyOff  livesOn  livesOff  G2on  G2off");
  for (const row of verdicts) {
    console.log(
      [
        row.feature.padEnd(16),
        row.onProbe.toFixed(4).padStart(7),
        row.offProbe.toFixed(4).padStart(8),
        row.onPolicyOn.toFixed(4).padStart(10),
        row.onPolicyOff.toFixed(4).padStart(11),
        row.onLives.toFixed(2).padStart(8),
        row.offLives.toFixed(2).padStart(9),
        row.onG2.padStart(5),
        row.offG2.padStart(6),
      ].join("  "),
    );
    console.log(`  ${row.note}`);
  }
}

function main() {
  const bytes = loopBytes();
  if (bytes < MIN_LOOP_BYTES) {
    console.error(`${LOOP_PATH} is ${bytes} bytes, under ${MIN_LOOP_BYTES}. Refusing to record a bench.`);
    process.exit(1);
  }

  const baselineAll = process.argv.includes("--baseline-all");
  const forced: Partial<LoopFeatures> | undefined = baselineAll
    ? (Object.fromEntries(LOOP_FEATURE_KEYS.map((key) => [key, true])) as Partial<LoopFeatures>)
    : undefined;
  const date = new Date().toISOString();
  const sha = gitSha();
  const seeds = [1, 2, 3, 4, 5];
  const configs = ablationConfigs(forced);
  const measured = configs.map((config, index) => {
    console.error(`measuring ${index + 1}/${configs.length} ${config.name}`);
    return measureConfig(config, seeds);
  });
  const report: BenchReport = {
    date,
    sha,
    seeds,
    fieldSteps: 280,
    streamSteps: 220,
    configs: measured,
  };
  const verdicts = ablationTable(measured);
  mkdirSync("bench", { recursive: true });
  const payload = `${JSON.stringify({ ...report, ablation: verdicts }, null, 2)}\n`;
  if (baselineAll) writeFileSync("bench/stack-ablation.json", payload);
  else writeFileSync("bench/latest.json", payload);
  const header =
    "date,sha,config,field_early_ema,field_late_ema,field_foods,field_lives,rooms_foods,rooms_lives,g1,g2,s1,s2,s3,c1,c2\n";
  const historyPath = "bench/history.csv";
  if (!existsSync(historyPath) || statSync(historyPath).size === 0) writeFileSync(historyPath, header);
  const prefix = baselineAll ? "stack" : "kept";
  for (const config of measured) {
    const row = { ...config, name: `${prefix}:${config.name}` };
    appendFileSync(historyPath, `${historyRow(date.slice(0, 10), sha, row)}\n`);
  }
  printReport(report, verdicts);

  const base = measured.find((row) => row.name === "default");
  if (!base) {
    console.error("default config missing");
    process.exit(1);
  }
  if (!base.passes.g1) {
    console.error(
      `G1 is open on the probe: late ${base.mean.fieldProbeLate.toFixed(4)} early ${base.mean.fieldProbeEarly.toFixed(4)} (on-policy ema ${base.mean.fieldLate.toFixed(4)}). Need probe late < 0.85·early or probe late < 0.14. Recorded, not loosened.`,
    );
  }
  const hard = ["g2", "s1", "s2", "s3", "c1", "c2"] as const;
  const failed = hard.filter((id) => !base.passes[id]);
  if (failed.length > 0) {
    console.error(`default config failed claims on a majority of seeds: ${failed.join(", ")}`);
    process.exit(1);
  }
}

main();
