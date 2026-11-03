/**
 * Worker for the rho-hat locus sweep. Not part of CI.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runReachEpisode, type ReachRequest, type ReachResult } from "../src/lib/kernel/reach-run.ts";

const jobs = (workerData as { jobs: ReachRequest[] }).jobs;
const results: ReachResult[] = [];
for (const job of jobs) results.push(runReachEpisode(job));
parentPort?.postMessage(results);
