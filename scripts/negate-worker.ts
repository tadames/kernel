/**
 * Worker for the negation sweep. Not part of CI.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runNegateJob, type NegateJob, type NegateResult } from "../src/lib/kernel/negate-run.ts";

const jobs = (workerData as { jobs: NegateJob[] }).jobs;
const results: NegateResult[] = [];
for (const job of jobs) results.push(runNegateJob(job));
parentPort?.postMessage(results);
