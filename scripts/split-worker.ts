/**
 * Worker for the coordinate-split sweep. Not part of CI.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runSplitEpisode } from "../src/lib/kernel/split-run.ts";
import type { OnsetRequest, OnsetResult } from "../src/lib/kernel/onset-run.ts";

const jobs = (workerData as { jobs: OnsetRequest[] }).jobs;
const results: OnsetResult[] = [];
for (const job of jobs) results.push(runSplitEpisode(job));
parentPort?.postMessage(results);
