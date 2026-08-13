// Batch experiment worker: runs full simulations head-down (no snapshots,
// no pacing) and reports one RunResult per job. Several of these run in
// parallel to Monte Carlo a configuration.
import { createWorld, simulateYears } from '../simulation/engine';
import { collectRunResult, RunResult } from '../simulation/metrics';
import { WorldConfig } from '../simulation/types';

export interface BatchJob {
  index: number; // global job index (for result ordering)
  seed: string;
  years: number;
  config: WorldConfig; // already has its own seed set = job seed
}

export type BatchIn = { type: 'run'; jobs: BatchJob[] };
export type BatchOut =
  | { type: 'result'; index: number; result: RunResult }
  | { type: 'progress'; index: number; year: number }
  | { type: 'done' }
  | { type: 'error'; index: number; message: string };

function post(msg: BatchOut): void {
  (self as unknown as Worker).postMessage(msg);
}

self.onmessage = (e: MessageEvent<BatchIn>): void => {
  if (e.data.type !== 'run') return;
  for (const job of e.data.jobs) {
    try {
      const world = createWorld(job.config);
      // Chunked so progress can stream out on long runs.
      const chunk = 1000;
      let done = 0;
      while (done < job.years) {
        const n = Math.min(chunk, job.years - done);
        simulateYears(world, n);
        done += n;
        post({ type: 'progress', index: job.index, year: done });
      }
      post({ type: 'result', index: job.index, result: collectRunResult(world, job.seed) });
    } catch (err) {
      post({ type: 'error', index: job.index, message: err instanceof Error ? err.message : String(err) });
    }
  }
  post({ type: 'done' });
};
