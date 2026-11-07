/**
 * Worker for the predicted-window door. Not part of CI.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runWindowJob, type WindowJob, type WindowSample } from "../src/lib/kernel/window-run.ts";

const jobs = (workerData as { jobs: WindowJob[] }).jobs;
const results: WindowSample[] = [];
for (const job of jobs) results.push(runWindowJob(job));
parentPort?.postMessage(results);
