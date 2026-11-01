/**
 * Worker for the doorway-chain sweep. Not part of CI.
 */
import { parentPort, workerData } from "node:worker_threads";
import { runChainEpisode, type ChainRequest, type ChainResult } from "../src/lib/kernel/chain-run.ts";

const jobs = (workerData as { jobs: ChainRequest[] }).jobs;
const results: ChainResult[] = [];
for (const job of jobs) results.push(runChainEpisode(job));
parentPort?.postMessage(results);
