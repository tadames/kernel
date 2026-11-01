/**
 * Worker for the doorway-score sweep. Not part of CI.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runDoorwayEpisode, type DoorwayRequest, type DoorwayResult } from "../src/lib/kernel/doorway-run.ts";

const jobs = (workerData as { jobs: DoorwayRequest[] }).jobs;
const results: DoorwayResult[] = [];
for (const job of jobs) results.push(runDoorwayEpisode(job));
parentPort?.postMessage(results);
