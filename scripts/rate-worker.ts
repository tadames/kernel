/**
 * Worker for the door-logit drift ladder. Not part of CI.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runRateJob, type RateJob, type RateSample } from "../src/lib/kernel/rate-run.ts";

const jobs = (workerData as { jobs: RateJob[] }).jobs;
const results: RateSample[] = [];
for (const job of jobs) results.push(runRateJob(job));
parentPort?.postMessage(results);
