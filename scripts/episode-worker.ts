/**
 * Child process / worker entry. Receives episode jobs, returns metrics.
 * Started with --experimental-transform-types by the parent.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runMeasuredEpisode, type EpisodeRequest, type EpisodeResult } from "../src/lib/kernel/measure.ts";

const jobs = (workerData as { jobs: EpisodeRequest[] }).jobs;
const results: EpisodeResult[] = [];
for (const job of jobs) {
  results.push(runMeasuredEpisode(job));
}
parentPort?.postMessage(results);
