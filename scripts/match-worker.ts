/**
 * Worker for the matched-dose door. Not part of CI.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runMatchJob, type MatchJob, type MatchSample } from "../src/lib/kernel/match-run.ts";

const jobs = (workerData as { jobs: MatchJob[] }).jobs;
const results: MatchSample[] = [];
for (const job of jobs) results.push(runMatchJob(job));
parentPort?.postMessage(results);
