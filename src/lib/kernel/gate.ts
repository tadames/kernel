/**
 * Preregistered ablation rule. Lower probe error is the success direction.
 * A feature that does not beat its own absence fails. A hard claim that
 * passed with the feature off and fails with it on is a regression.
 */
import { majority, pairedDifference } from "./stats.ts";

export const GATE_MIN_SEEDS = 20;

export type GateArms = {
  probeOff: number[];
  probeOn: number[];
  g2Off: boolean[];
  g2On: boolean[];
  c2Off: boolean[];
  c2On: boolean[];
  livesOff: number[];
  livesOn: number[];
};

export type GateDecision = {
  pass: boolean;
  probe: ReturnType<typeof pairedDifference>;
  lives: ReturnType<typeof pairedDifference>;
  g2Regress: boolean;
  c2Regress: boolean;
  reasons: string[];
};

export function decideGate(arms: GateArms, seed = 1): GateDecision {
  const reasons: string[] = [];
  const n = arms.probeOn.length;
  if (n < GATE_MIN_SEEDS || arms.probeOff.length < GATE_MIN_SEEDS) {
    reasons.push(`need at least ${GATE_MIN_SEEDS} paired seeds`);
  }
  if (arms.probeOn.length !== arms.probeOff.length) reasons.push("on and off seed counts differ");
  const probe = pairedDifference(arms.probeOff, arms.probeOn, seed);
  const lives = pairedDifference(arms.livesOn, arms.livesOff, seed + 1);
  const g2Regress = majority(arms.g2Off) && !majority(arms.g2On);
  const c2Regress = majority(arms.c2Off) && !majority(arms.c2On);
  if (!(probe.lo > 0)) {
    reasons.push(
      `probe CI of (off − on) is [${probe.lo.toFixed(4)}, ${probe.hi.toFixed(4)}]; on must be lower and the interval must exclude zero`,
    );
  }
  if (g2Regress) reasons.push("G2 passed off and fails on");
  if (c2Regress) reasons.push("C2 passed off and fails on");
  if (lives.lo > 0) reasons.push("Field lives rise: paired CI of (on − off) lies above zero");
  return { pass: reasons.length === 0, probe, lives, g2Regress, c2Regress, reasons };
}

export type Preregister = {
  flag: string;
  hypothesis: string;
  threshold: string;
  metric: string;
  direction: string;
};

/** Pull `### Preregister <flag>` blocks out of the journal. The run happens after this text exists. */
export function readPreregister(journal: string, flag: string): Preregister | null {
  const lines = journal.split(/\r?\n/);
  const heading = `### Preregister ${flag}`;
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return null;
  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("### ") || line.startsWith("## ")) break;
    body.push(line);
  }
  const field = (name: string) => {
    const row = body.find((line) => line.trim().toLowerCase().startsWith(`- ${name}:`));
    if (!row) return "";
    return row.slice(row.indexOf(":") + 1).trim();
  };
  const hypothesis = field("hypothesis");
  const threshold = field("threshold");
  const metric = field("metric") || "probeLate";
  const direction = field("direction") || "lower";
  if (!hypothesis || !threshold) return null;
  return { flag, hypothesis, threshold, metric, direction };
}
