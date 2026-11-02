/**
 * Worker for the exposure-clock sweep. Not part of CI.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runOnsetEpisode, type OnsetRequest, type OnsetResult } from "../src/lib/kernel/onset-run.ts";

const jobs = (workerData as { jobs: OnsetRequest[] }).jobs;
const results: OnsetResult[] = [];
for (const job of jobs) results.push(runOnsetEpisode(job));
parentPort?.postMessage(results);
