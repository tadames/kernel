/**
 * Node-only loader for the committed probe files. Kept out of `probe.ts`
 * so the browser bundle does not import `node:fs`.
 */
import { readFileSync } from "node:fs";
import { probeFromJson, type ProbeJson, type ProbeSet } from "./probe.ts";

const cache = new Map<string, ProbeSet>();

export function canonicalProbePath(kind: "field" | "rooms") {
  return `bench/probes/${kind}.json`;
}

export function loadCanonicalProbe(kind: "field" | "rooms"): ProbeSet {
  const hit = cache.get(kind);
  if (hit) return hit;
  const raw = JSON.parse(readFileSync(canonicalProbePath(kind), "utf8")) as ProbeJson;
  const probe = probeFromJson(raw);
  cache.set(kind, probe);
  return probe;
}
