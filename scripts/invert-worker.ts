/**
 * Worker for the rho-hat sign inversion sweep. Not part of CI.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runInvertEpisode, type InvertRequest, type InvertResult } from "../src/lib/kernel/invert-run.ts";

const jobs = (workerData as { jobs: InvertRequest[] }).jobs;
const results: InvertResult[] = [];
for (const job of jobs) results.push(runInvertEpisode(job));
parentPort?.postMessage(results);
