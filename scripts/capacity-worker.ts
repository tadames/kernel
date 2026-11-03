/**
 * Worker for the capacity sweep. Not part of CI.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runCapacityJob, type CapacityJob, type CapacityResult } from "../src/lib/kernel/capacity-run.ts";

const jobs = (workerData as { jobs: CapacityJob[] }).jobs;
const results: CapacityResult[] = [];
for (const job of jobs) results.push(runCapacityJob(job));
parentPort?.postMessage(results);
