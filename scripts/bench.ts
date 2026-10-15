/**
 * `npm run bench:json`
 * Runs G1, G2, S1–S3, C1, C2, Field late ema, Rooms foods, and lives
 * on seeds 1..5 for the default flags and for each single-flag ablation.
 * Writes bench/latest.json and appends bench/history.csv.
 * `--baseline-all` measures the pre-prune stack into bench/stack-ablation.json.
 * Exits non-zero when loop.ts is under 2 KB, or when G2/S1/S2/S3/C1/C2
 * fail on a majority of seeds. G1 is recorded either way: it does not pass
 * yet, and loosening it is not allowed.
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

function stdev(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  let v = 0;
  for (const x of xs) v += (x - m) * (x - m);
  return Math.sqrt(v / (xs.length - 1));
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

type Verdict = "keep" | "remove" | "keep-noisy";

function ablationTable(configs: ConfigReport[]) {
  const base = configs.find((row) => row.name === "default");
  if (!base) return [];
  const rows: {
    feature: LoopFeatureKey;
    onLate: number;
    offLate: number;
    improvePct: number;
    spreadPct: number;
    onLives: number;
    offLives: number;
    onG2: string;
    offG2: string;
    onRooms: number;
    offRooms: number;
    verdict: Verdict;
    reason: string;
  }[] = [];
  for (const key of LOOP_FEATURE_KEYS) {
    const flippedName = base.features[key] ? `off-${key}` : `on-${key}`;
    const flipped = configs.find((row) => row.name === flippedName);
    if (!flipped) continue;
    const on = base.features[key] ? base : flipped;
    const off = base.features[key] ? flipped : base;
    const perSeed: number[] = [];
    for (const seedRow of on.seeds) {
      const other = off.seeds.find((row) => row.seed === seedRow.seed);
      if (!other || other.fieldLate === 0) continue;
      perSeed.push((other.fieldLate - seedRow.fieldLate) / other.fieldLate);
    }
    const improve = perSeed.reduce((s, x) => s + x, 0) / Math.max(1, perSeed.length);
    const spread = stdev(perSeed);
    const hurtsG2 = on.passCount.g2 < off.passCount.g2;
    const livesUp = on.mean.fieldLives - off.mean.fieldLives;
    const upper = improve + spread;
    const lower = improve - spread;
    let verdict: Verdict = "keep-noisy";
    let reason = "seed band crosses a gain and does not clear 5%";
    if (hurtsG2) {
      verdict = "remove";
      reason = "hurts G2";
    } else if (livesUp >= 0.4) {
      verdict = "remove";
      reason = "Field lives rise by at least 0.4";
    } else if (lower >= 0.05) {
      verdict = "keep";
      reason = "clears 5% on Field late ema";
    } else if (upper <= 0) {
      verdict = "remove";
      reason = "noise band is zero or worse on Field late ema";
    } else if (upper < 0.005 && Math.abs(improve) < 0.005) {
      verdict = "remove";
      reason = "measured null on Field late ema";
    }
    rows.push({
      feature: key,
      onLate: on.mean.fieldLate,
      offLate: off.mean.fieldLate,
      improvePct: improve * 100,
      spreadPct: spread * 100,
      onLives: on.mean.fieldLives,
      offLives: off.mean.fieldLives,
      onG2: `${on.passCount.g2}/${on.seeds.length}`,
      offG2: `${off.passCount.g2}/${off.seeds.length}`,
      onRooms: on.mean.roomsFoods,
      offRooms: off.mean.roomsFoods,
      verdict,
      reason,
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
      `default  field late ${m.fieldLate.toFixed(4)}  early ${m.fieldEarly.toFixed(4)}  foods ${m.fieldFoods.toFixed(2)}  lives ${m.fieldLives.toFixed(2)}  rooms foods ${m.roomsFoods.toFixed(2)}  rooms lives ${m.roomsLives.toFixed(2)}`,
    );
    console.log(
      `claims   G1 ${p.g1 ? "pass" : "FAIL"} (${base.passCount.g1}/${base.seeds.length})  G2 ${p.g2 ? "pass" : "FAIL"} (${base.passCount.g2}/5)  S1 ${p.s1 ? "pass" : "FAIL"}  S2 ${p.s2 ? "pass" : "FAIL"}  S3 ${p.s3 ? "pass" : "FAIL"}  C1 ${p.c1 ? "pass" : "FAIL"}  C2 ${p.c2 ? "pass" : "FAIL"}`,
    );
  }
  console.log("feature          onLate  offLate  improve%  spread%  livesOn  livesOff  G2on  G2off  roomsOn  roomsOff  verdict");
  for (const row of verdicts) {
    console.log(
      [
        row.feature.padEnd(16),
        row.onLate.toFixed(4).padStart(7),
        row.offLate.toFixed(4).padStart(8),
        row.improvePct.toFixed(2).padStart(8),
        row.spreadPct.toFixed(2).padStart(8),
        row.onLives.toFixed(2).padStart(8),
        row.offLives.toFixed(2).padStart(9),
        row.onG2.padStart(5),
        row.offG2.padStart(6),
        row.onRooms.toFixed(2).padStart(8),
        row.offRooms.toFixed(2).padStart(9),
        row.verdict,
      ].join("  "),
    );
    console.log(`  ${row.reason}`);
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
      `G1 is open: Field late ema ${base.mean.fieldLate.toFixed(4)} did not fall on a majority of seeds (need late < 0.85·early or late < 0.14). Recorded, not loosened.`,
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
