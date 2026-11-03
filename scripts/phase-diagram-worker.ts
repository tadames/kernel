/**
 * Worker for the phase-diagram sweep. Not part of CI.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runPhaseEpisode, type PhaseJob, type PhaseResult } from "../src/lib/kernel/phase-diagram-run.ts";

const jobs = (workerData as { jobs: PhaseJob[] }).jobs;
const results: PhaseResult[] = [];
for (const job of jobs) results.push(runPhaseEpisode(job));
parentPort?.postMessage(results);
