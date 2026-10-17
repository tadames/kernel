/**
 * Worker for the place-bonus sweep. Not part of CI.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runBoostEpisode, type BoostRequest, type BoostResult } from "../src/lib/kernel/boost-run.ts";

const jobs = (workerData as { jobs: BoostRequest[] }).jobs;
const results: BoostResult[] = [];
for (const job of jobs) results.push(runBoostEpisode(job));
parentPort?.postMessage(results);
