// Experiment metrics: the quantitative end-state summary of one simulation run.
// Pure function of WorldState — used by the batch worker for Monte Carlo runs.
import { WorldState } from './types';

export interface RunResult {
  seed: string;
  years: number;
  population: number;
  aliveCivs: number;
  totalCivs: number;
  extinctions: number;
  ascensions: number;
  cities: number;
  totalWars: number;
  maxTech: number;
  empires: number;
  splits: number;
  tradeDeals: number;
  firstWarYear: number | null;
  firstEmpireYear: number | null;
  aiYear: number | null;
  /** World population time series, decimated to ≤ 120 points. */
  popSeries: number[];
  popSeriesYears: number[];
}

export const RUN_METRIC_KEYS = [
  'population',
  'aliveCivs',
  'totalCivs',
  'extinctions',
  'ascensions',
  'cities',
  'totalWars',
  'maxTech',
  'empires',
  'splits',
  'tradeDeals',
] as const;

export type RunMetricKey = (typeof RUN_METRIC_KEYS)[number];

export function collectRunResult(world: WorldState, seed: string): RunResult {
  const alive = world.civs.filter((c) => c.alive);
  let cities = 0;
  for (const c of world.cities) {
    if (c.destroyed) continue;
    const owner = world.civs[parseInt(c.ownerId.slice(4), 10)];
    if (owner?.alive) cities++;
  }
  const firstWar = world.events.find((e) => e.type === 'war');
  const firstEmpire = world.events.find((e) => e.type === 'empire');
  const aiEvent = world.events.find((e) => e.type === 'technology' && e.title.includes('Artificial Intelligence'));

  const stats = world.stats;
  const step = Math.max(1, Math.floor(stats.length / 120));
  const popSeries: number[] = [];
  const popSeriesYears: number[] = [];
  for (let i = 0; i < stats.length; i += step) {
    popSeries.push(Math.round(stats[i].population));
    popSeriesYears.push(stats[i].year);
  }

  return {
    seed,
    years: world.year,
    population: Math.round(alive.reduce((s, c) => s + c.population, 0)),
    aliveCivs: alive.length,
    totalCivs: world.civs.length,
    extinctions: world.civs.filter((c) => !c.alive && !c.ascended).length,
    ascensions: world.civs.filter((c) => c.ascended).length,
    cities,
    totalWars: world.totalWars,
    maxTech: Math.max(0, ...world.civs.map((c) => c.technologyLevel)),
    empires: world.events.filter((e) => e.type === 'empire').length,
    splits: world.events.filter((e) => e.type === 'split').length,
    tradeDeals: world.totalTradeDeals,
    firstWarYear: firstWar ? firstWar.year : null,
    firstEmpireYear: firstEmpire ? firstEmpire.year : null,
    aiYear: aiEvent ? aiEvent.year : null,
    popSeries,
    popSeriesYears,
  };
}

// ---- Statistics helpers ----

export interface MetricStats {
  mean: number;
  std: number;
  min: number;
  max: number;
  median: number;
}

export function computeStats(values: number[]): MetricStats {
  if (values.length === 0) return { mean: 0, std: 0, min: 0, max: 0, median: 0 };
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    mean,
    std: Math.sqrt(variance),
    min: sorted[0],
    max: sorted[n - 1],
    median: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
  };
}

export function resultsToCsv(results: RunResult[]): string {
  const cols = ['seed', 'years', ...RUN_METRIC_KEYS, 'firstWarYear', 'firstEmpireYear', 'aiYear'];
  const lines = [cols.join(',')];
  for (const r of results) {
    lines.push(
      cols
        .map((c) => {
          const v = r[c as keyof RunResult];
          return v === null ? '' : String(v);
        })
        .join(','),
    );
  }
  return lines.join('\n');
}
