/**
 * Worker for the matched drift sweep. Not part of CI.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runDriftEpisode, type DriftRequest, type DriftResult } from "../src/lib/kernel/drift-run.ts";

const jobs = (workerData as { jobs: DriftRequest[] }).jobs;
const results: DriftResult[] = [];
for (const job of jobs) results.push(runDriftEpisode(job));
parentPort?.postMessage(results);
