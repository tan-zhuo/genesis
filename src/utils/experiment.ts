// Experiment definitions: sweepable parameters and job planning.
// Seeds are derived deterministically from the experiment recipe, so an
// experiment is exactly as reproducible as a single run.
import { Traits, WorldConfig } from '../simulation/types';

export interface SweepParam {
  id: string;
  min: number;
  max: number;
  integer?: boolean;
  apply: (config: WorldConfig, value: number) => void;
}

function traitParam(key: keyof Traits): SweepParam {
  return {
    id: `trait.${key}`,
    min: 0,
    max: 100,
    integer: true,
    apply: (config, value) => {
      for (const civ of config.civs) civ.traits[key] = Math.round(value);
    },
  };
}

export const SWEEP_PARAMS: SweepParam[] = [
  traitParam('aggression'),
  traitParam('trade'),
  traitParam('science'),
  traitParam('migration'),
  traitParam('expansion'),
  traitParam('diplomacy'),
  traitParam('birthRate'),
  traitParam('riskTaking'),
  {
    id: 'disasterFrequency',
    min: 0,
    max: 2,
    apply: (config, value) => {
      config.disasterFrequency = value;
    },
  },
  {
    id: 'resourceRichness',
    min: 0,
    max: 2,
    apply: (config, value) => {
      config.resourceRichness = value;
    },
  },
  {
    id: 'seaLevel',
    min: 0.3,
    max: 0.7,
    apply: (config, value) => {
      config.seaLevel = value;
    },
  },
];

export interface PlannedJob {
  index: number;
  seed: string;
  years: number;
  config: WorldConfig;
  sweepStep: number; // -1 for plain batch
  sweepValue: number | null;
}

/** Plain Monte Carlo: same config, N derived seeds. */
export function planBatch(base: WorldConfig, runs: number, years: number): PlannedJob[] {
  const jobs: PlannedJob[] = [];
  for (let i = 0; i < runs; i++) {
    const config = structuredClone(base);
    config.seed = `${base.seed}-mc${i}`;
    config.interventions = []; // experiments measure the laws, not the player's hand
    jobs.push({ index: i, seed: config.seed, years, config, sweepStep: -1, sweepValue: null });
  }
  return jobs;
}

/** Parameter sweep: K steps × M seeds per step. */
export function planSweep(
  base: WorldConfig,
  param: SweepParam,
  steps: number,
  runsPerStep: number,
  years: number,
): PlannedJob[] {
  const jobs: PlannedJob[] = [];
  let index = 0;
  for (let s = 0; s < steps; s++) {
    const value = steps === 1 ? param.min : param.min + ((param.max - param.min) * s) / (steps - 1);
    const v = param.integer ? Math.round(value) : Math.round(value * 100) / 100;
    for (let m = 0; m < runsPerStep; m++) {
      const config = structuredClone(base);
      config.seed = `${base.seed}-sw${s}m${m}`;
      config.interventions = [];
      param.apply(config, v);
      jobs.push({ index: index++, seed: config.seed, years, config, sweepStep: s, sweepValue: v });
    }
  }
  return jobs;
}

/** Rough wall-clock estimate for the whole experiment. */
export function estimateSeconds(jobs: PlannedJob[], workers: number): number {
  if (jobs.length === 0) return 0;
  const tiles = jobs[0].config.width * jobs[0].config.height;
  const perYearMs = 0.5 * (tiles / 40000);
  const totalMs = jobs.reduce((s, j) => s + j.years * perYearMs, 0);
  return Math.round(totalMs / Math.max(1, workers) / 1000);
}

export function workerCount(): number {
  const hw = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  return Math.max(2, Math.min(8, hw - 1));
}
