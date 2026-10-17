/**
 * Worker for the drift progress-gap sweep. Not part of CI.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runDriftGapEpisode, type DriftGapRequest, type DriftGapResult } from "../src/lib/kernel/drift-gap-run.ts";

const jobs = (workerData as { jobs: DriftGapRequest[] }).jobs;
const results: DriftGapResult[] = [];
for (const job of jobs) results.push(runDriftGapEpisode(job));
parentPort?.postMessage(results);
