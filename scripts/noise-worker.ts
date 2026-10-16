/**
 * Worker for the stationary-noise study. Not part of CI.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runNoiseEpisode, type NoiseRequest, type NoiseResult } from "../src/lib/kernel/noise-run.ts";

const jobs = (workerData as { jobs: NoiseRequest[] }).jobs;
const results: NoiseResult[] = [];
for (const job of jobs) results.push(runNoiseEpisode(job));
parentPort?.postMessage(results);
