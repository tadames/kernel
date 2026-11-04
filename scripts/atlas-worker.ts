/**
 * Worker for the door-scale phase diagram. Not part of CI.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runAtlasJob, type AtlasJob, type AtlasSample } from "../src/lib/kernel/atlas-run.ts";

const jobs = (workerData as { jobs: AtlasJob[] }).jobs;
const results: AtlasSample[] = [];
for (const job of jobs) results.push(runAtlasJob(job));
parentPort?.postMessage(results);
