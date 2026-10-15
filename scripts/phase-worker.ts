/**
 * Worker for the distractor phase sweep.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runPhaseEpisode, type PhaseRequest, type PhaseResult } from "../src/lib/kernel/phase-run.ts";

const jobs = (workerData as { jobs: PhaseRequest[] }).jobs;
const results: PhaseResult[] = [];
for (const job of jobs) results.push(runPhaseEpisode(job));
parentPort?.postMessage(results);
