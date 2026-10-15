/**
 * Worker for the forgetting-cycle sweep.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runForgetEpisode, type ForgetRequest, type ForgetResult } from "../src/lib/kernel/phase-run.ts";

const jobs = (workerData as { jobs: ForgetRequest[] }).jobs;
const results: ForgetResult[] = [];
for (const job of jobs) results.push(runForgetEpisode(job));
parentPort?.postMessage(results);
