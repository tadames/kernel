/**
 * Worker for the pattern-channel sweep. Not part of CI.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runCompeteEpisode, type CompeteRequest, type CompeteResult } from "../src/lib/kernel/compete-run.ts";

const jobs = (workerData as { jobs: CompeteRequest[] }).jobs;
const results: CompeteResult[] = [];
for (const job of jobs) results.push(runCompeteEpisode(job));
parentPort?.postMessage(results);
