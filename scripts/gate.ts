/**
 * Preregistered ablation gate.
 *
 *   npm run gate -- --flag encoderMix --seeds 20
 *   npm run gate -- --flags encoderMix,wake --seeds 20
 *   npm run gate -- --ci
 *
 * Exits nonzero unless every requested flag, on versus off, lowers Field
 * probe error with a paired 95% CI above zero and no claim regresses.
 * The journal must already contain `### Preregister <flag>`.
 *
 * `--ci` runs only when a kernel mechanism file differs from the base
 * branch, and only for flags that default on. No kept flags is a pass:
 * failed mechanisms are journal entries, not fixtures.
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { LOOP_FEATURE_KEYS, resolveLoopFeatures, type LoopFeatureKey } from "../src/lib/kernel/loop.ts";
import { decideGate, readPreregister, GATE_MIN_SEEDS } from "../src/lib/kernel/gate.ts";
import type { EpisodeRequest, EpisodeResult } from "../src/lib/kernel/measure.ts";
import type { CuriositySignal } from "../src/lib/kernel/signals.ts";
import { runPool, workerCount } from "./pool.ts";

const MECHANISM = /src\/lib\/kernel\/(loop|policy|signals|kernel|scent-rho-hat|horizon)\.ts$/;

function arg(name: string, fallback = "") {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1] || process.argv[i + 1]!.startsWith("--")) return fallback;
  return process.argv[i + 1]!;
}

function has(name: string) {
  return process.argv.includes(`--${name}`);
}

function kernelTouched() {
  const base = process.env.GITHUB_BASE_REF || "main";
  try {
    const diff = execSync(`git diff --name-only origin/${base}...HEAD`, { encoding: "utf8" });
    return diff.split("\n").filter(Boolean).some((file) => MECHANISM.test(file));
  } catch (err) {
    console.error(`could not diff against origin/${base}: ${err instanceof Error ? err.message : err}`);
    return true;
  }
}

function flagsFromArgs(): LoopFeatureKey[] {
  const one = arg("flag");
  const many = arg("flags");
  const text = [one, many].filter(Boolean).join(",");
  if (!text && has("defaults")) {
    const features = resolveLoopFeatures();
    return LOOP_FEATURE_KEYS.filter((key) => features[key]);
  }
  if (!text) return [];
  const out: LoopFeatureKey[] = [];
  for (const part of text.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (!(LOOP_FEATURE_KEYS as readonly string[]).includes(part)) {
      throw new Error(`unknown flag ${part}`);
    }
    out.push(part as LoopFeatureKey);
  }
  return out;
}

async function main() {
  if (has("ci")) {
    if (!kernelTouched()) {
      console.log("gate: no kernel mechanism changes, skipping");
      return;
    }
    const features = resolveLoopFeatures();
    const kept = LOOP_FEATURE_KEYS.filter((key) => features[key]);
    if (kept.length === 0) {
      console.log("gate: kernel changed and no flag defaults on. Failed mechanisms stay off. Pass.");
      return;
    }
    process.argv.push("--flags", kept.join(","));
  }

  const flags = flagsFromArgs();
  if (flags.length === 0) {
    console.error("pass --flag <name> or --flags a,b");
    process.exit(2);
  }
  const seedsN = Math.max(1, Number(arg("seeds", String(GATE_MIN_SEEDS))));
  if (seedsN < GATE_MIN_SEEDS && !has("allow-short")) {
    console.error(`gate requires at least ${GATE_MIN_SEEDS} seeds (got ${seedsN}).`);
    process.exit(2);
  }
  const steps = Math.max(1, Number(arg("steps", "280")));
  const workers = workerCount(Number(arg("workers", "0")));
  const journal = readFileSync("JOURNAL.md", "utf8");
  for (const flag of flags) {
    const pre = readPreregister(journal, flag);
    if (!pre) {
      console.error(
        `JOURNAL.md has no \`### Preregister ${flag}\` block with hypothesis and threshold. Write that before running.`,
      );
      process.exit(2);
    }
    if (pre.metric !== "probeLate" || pre.direction !== "lower") {
      console.error(`${flag} preregister must use metric probeLate and direction lower`);
      process.exit(2);
    }
    console.error(`preregistered ${flag}: ${pre.hypothesis}`);
  }

  const seeds = Array.from({ length: seedsN }, (_, i) => i + 1);
  const signal: CuriositySignal = "rho";
  const jobs: EpisodeRequest[] = [];
  let id = 0;
  const baseFeatures = resolveLoopFeatures();
  for (const seed of seeds) {
    jobs.push({ id: id++, env: "field", seed, steps, signal, features: baseFeatures });
    for (const flag of flags) {
      const on = { ...baseFeatures, [flag]: true };
      const off = { ...baseFeatures, [flag]: false };
      if (baseFeatures[flag]) {
        jobs.push({ id: id++, env: "field", seed, steps, signal, features: off });
      } else {
        jobs.push({ id: id++, env: "field", seed, steps, signal, features: on });
        jobs.push({ id: id++, env: "field", seed, steps, signal, features: off });
      }
    }
  }

  // The default stack is the "on" arm when the flag defaults on. Don't run it twice.
  const seen = new Set<string>();
  const unique: EpisodeRequest[] = [];
  for (const job of jobs) {
    const key = `${job.seed}:${JSON.stringify(job.features)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ ...job, id: unique.length });
  }

  console.error(`gate ${unique.length} episodes, ${workers} workers, flags ${flags.join(",")}`);
  const t0 = Date.now();
  const rows = await runPool<EpisodeRequest, EpisodeResult>(
    unique,
    new URL("./episode-worker.ts", import.meta.url),
    workers,
  );
  console.error(`gate finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const same = (row: EpisodeResult, features: Record<string, boolean>, seed: number) =>
    row.seed === seed && LOOP_FEATURE_KEYS.every((key) => row.features[key] === features[key]);

  const results = [];
  let failed = 0;
  for (const flag of flags) {
    const onFeatures = { ...baseFeatures, [flag]: true };
    const offFeatures = { ...baseFeatures, [flag]: false };
    const onRows = seeds.map((seed) => rows.find((row) => same(row, onFeatures, seed)));
    const offRows = seeds.map((seed) => rows.find((row) => same(row, offFeatures, seed)));
    if (onRows.some((row) => !row) || offRows.some((row) => !row)) {
      console.error(`missing rows for ${flag}`);
      process.exit(1);
    }
    const on = onRows as EpisodeResult[];
    const off = offRows as EpisodeResult[];
    const decision = decideGate({
      probeOff: off.map((row) => row.probeLate),
      probeOn: on.map((row) => row.probeLate),
      g2Off: off.map((row) => row.g2),
      g2On: on.map((row) => row.g2),
      c2Off: off.map((row) => row.c2),
      c2On: on.map((row) => row.c2),
      livesOff: off.map((row) => row.lives),
      livesOn: on.map((row) => row.lives),
    }, 3);
    if (!decision.pass) failed += 1;
    const pre = readPreregister(journal, flag)!;
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    results.push({
      flag,
      hypothesis: pre.hypothesis,
      threshold: pre.threshold,
      pass: decision.pass,
      probeOff: avg(off.map((row) => row.probeLate)),
      probeOn: avg(on.map((row) => row.probeLate)),
      probeOffSeeds: off.map((row) => row.probeLate),
      probeOnSeeds: on.map((row) => row.probeLate),
      discardOff: avg(off.map((row) => row.discardFraction)),
      discardOn: avg(on.map((row) => row.discardFraction)),
      decodeOff: avg(off.map((row) => row.decodeResidual)),
      decodeOn: avg(on.map((row) => row.decodeResidual)),
      diff: decision.probe,
      lives: decision.lives,
      g2On: on.filter((row) => row.g2).length,
      g2Off: off.filter((row) => row.g2).length,
      c2On: on.filter((row) => row.c2).length,
      c2Off: off.filter((row) => row.c2).length,
      reasons: decision.reasons,
    });
    console.log(
      `${flag}  on ${results[results.length - 1]!.probeOn.toFixed(4)}  off ${results[results.length - 1]!.probeOff.toFixed(4)}  diff(off-on) ${decision.probe.mean.toFixed(4)} [${decision.probe.lo.toFixed(4)}, ${decision.probe.hi.toFixed(4)}]  ${decision.pass ? "PASS" : "FAIL"}`,
    );
    for (const reason of decision.reasons) console.log(`  ${reason}`);
  }

  mkdirSync("bench", { recursive: true });
  writeFileSync(
    "bench/gate.json",
    `${JSON.stringify({ date: new Date().toISOString(), seeds, steps, flags, results }, null, 2)}\n`,
  );
  if (failed > 0) {
    console.error(`${failed} flag(s) failed the gate`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
