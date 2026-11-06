/**
 * Worker for the ceiling door. Not part of CI.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runCeilingJob, type CeilingJob, type CeilingSample } from "../src/lib/kernel/ceiling-run.ts";

const jobs = (workerData as { jobs: CeilingJob[] }).jobs;
const results: CeilingSample[] = [];
for (const job of jobs) results.push(runCeilingJob(job));
parentPort?.postMessage(results);
