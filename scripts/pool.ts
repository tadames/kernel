import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";

export function workerCount(requested?: number) {
  const cores = availableParallelism();
  const cap = Math.max(1, cores);
  if (!requested || requested < 1) return cap;
  return Math.max(1, Math.min(requested, cap));
}

export function runPool<J extends { id: number }, R extends { id: number }>(
  jobs: J[],
  workerUrl: URL,
  workers: number,
): Promise<R[]> {
  if (jobs.length === 0) return Promise.resolve([]);
  const n = Math.max(1, Math.min(workers, jobs.length));
  const chunks: J[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < jobs.length; i++) chunks[i % n]!.push(jobs[i]!);
  return Promise.all(
    chunks.map(
      (chunk) =>
        new Promise<R[]>((resolve, reject) => {
          const worker = new Worker(workerUrl, {
            execArgv: ["--experimental-transform-types", "--disable-warning=ExperimentalWarning"],
            workerData: { jobs: chunk },
          });
          let settled = false;
          worker.on("message", (msg: R[]) => {
            if (settled) return;
            settled = true;
            resolve(msg);
          });
          worker.on("error", (err) => {
            if (settled) return;
            settled = true;
            reject(err);
          });
          worker.on("exit", (code) => {
            if (settled) return;
            if (code !== 0) {
              settled = true;
              reject(new Error(`episode worker exited ${code}`));
            }
          });
        }),
    ),
  ).then((parts) => {
    const flat = parts.flat();
    flat.sort((a, b) => a.id - b.id);
    return flat;
  });
}
