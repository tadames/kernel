/**
 * Worker for the forgetting-cycle sweep. Not part of CI.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runCycleJob, type CycleJob, type CycleResult } from "../src/lib/kernel/cycle-run.ts";

const jobs = (workerData as { jobs: CycleJob[] }).jobs;
const results: CycleResult[] = [];
for (const job of jobs) results.push(runCycleJob(job));
parentPort?.postMessage(results);
