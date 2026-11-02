/**
 * Worker for the imagined-residual source sweep. Not part of CI.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runSourceEpisode, type SourceRequest, type SourceResult } from "../src/lib/kernel/source-run.ts";

const jobs = (workerData as { jobs: SourceRequest[] }).jobs;
const results: SourceResult[] = [];
for (const job of jobs) results.push(runSourceEpisode(job));
parentPort?.postMessage(results);
