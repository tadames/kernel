/**
 * Worker for the score-piece door. Not part of CI.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runPartsJob, type PartsJob, type PartsSample } from "../src/lib/kernel/parts-run.ts";

const jobs = (workerData as { jobs: PartsJob[] }).jobs;
const results: PartsSample[] = [];
for (const job of jobs) results.push(runPartsJob(job));
parentPort?.postMessage(results);
