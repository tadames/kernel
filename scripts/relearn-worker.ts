/**
 * Worker for the relearning sweep. Not part of CI.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runRelearnJob, type RelearnJob, type RelearnSample } from "../src/lib/kernel/relearn-run.ts";

const jobs = (workerData as { jobs: RelearnJob[] }).jobs;
const results: RelearnSample[] = [];
for (const job of jobs) results.push(runRelearnJob(job));
parentPort?.postMessage(results);
