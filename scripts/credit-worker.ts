/**
 * Worker for the doorway-credit sweep. Not part of CI.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runCreditEpisode, type CreditRequest, type CreditResult } from "../src/lib/kernel/credit-run.ts";

const jobs = (workerData as { jobs: CreditRequest[] }).jobs;
const results: CreditResult[] = [];
for (const job of jobs) results.push(runCreditEpisode(job));
parentPort?.postMessage(results);
