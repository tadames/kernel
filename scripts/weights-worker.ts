/**
 * Worker for the uncertainty-weight door. Not part of CI.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runWeightsJob, type WeightsJob, type WeightsSample } from "../src/lib/kernel/weights-run.ts";

const jobs = (workerData as { jobs: WeightsJob[] }).jobs;
const results: WeightsSample[] = [];
for (const job of jobs) results.push(runWeightsJob(job));
parentPort?.postMessage(results);
