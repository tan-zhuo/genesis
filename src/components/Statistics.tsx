// World-level statistics charts.
import { useMemo } from 'react';
import { Universe } from '../state/simulatorStore';
import { LineChart, Series } from './LineChart';
import { fmtNum } from '../utils/format';

export function Statistics({ universe }: { universe: Universe }): JSX.Element {
  const snapshot = universe.snapshot;
  const stats = snapshot?.stats ?? [];

  const worldSeries = useMemo(() => {
    const xs = stats.map((s) => s.year);
    return {
      population: [{ label: 'World population', color: '#f5a524', xs, ys: stats.map((s) => s.population) }],
      civs: [
        { label: 'Civilizations', color: '#3b82f6', xs, ys: stats.map((s) => s.civilizations) },
        { label: 'Active wars', color: '#e5484d', xs, ys: stats.map((s) => s.wars) },
        { label: 'Alliances', color: '#30a46c', xs, ys: stats.map((s) => s.alliances) },
      ],
      cities: [{ label: 'Cities', color: '#12a594', xs, ys: stats.map((s) => s.cities) }],
      tech: [{ label: 'Max technology', color: '#8e4ec6', xs, ys: stats.map((s) => s.technologies) }],
    };
  }, [stats]);

  const civPopSeries: Series[] = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.civs
      .filter((c) => c.alive || c.population > 0)
      .slice(0, 8)
      .map((c) => {
        const h = snapshot.civHistories[c.id];
        return h ? { label: c.name, color: c.color, xs: h.years, ys: h.population } : null;
      })
      .filter((s): s is Series => s !== null);
  }, [snapshot]);

  const civTerritorySeries: Series[] = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.civs
      .filter((c) => c.alive)
      .slice(0, 8)
      .map((c) => {
        const h = snapshot.civHistories[c.id];
        return h ? { label: c.name, color: c.color, xs: h.years, ys: h.territory } : null;
      })
      .filter((s): s is Series => s !== null);
  }, [snapshot]);

  const warsPerCentury = useMemo(() => {
    if (!snapshot) return [];
    const buckets = new Map<number, number>();
    for (const e of universe.events) {
      if (e.type !== 'war') continue;
      const c = Math.floor(e.year / 100);
      buckets.set(c, (buckets.get(c) ?? 0) + 1);
    }
    const xs = [...buckets.keys()].sort((a, b) => a - b);
    return [{ label: 'Wars per century', color: '#e5484d', xs: xs.map((c) => c * 100), ys: xs.map((c) => buckets.get(c) ?? 0) }];
  }, [snapshot, universe.events]);

  const largest = snapshot?.civs.filter((c) => c.alive).sort((a, b) => b.territory - a.territory)[0];

  if (stats.length < 3) return <div className="empty-note">Run the simulation to gather statistics.</div>;

  return (
    <div className="stats-panel">
      <LineChart title="Population over time" series={worldSeries.population} />
      <LineChart title="Civilizations · wars · alliances" series={worldSeries.civs} />
      <LineChart title="Cities over time" series={worldSeries.cities} />
      <LineChart title="Technology progress" series={worldSeries.tech} yFormat={(v) => `${Math.round(v)}`} />
      {warsPerCentury.length > 0 && warsPerCentury[0].xs.length > 1 && (
        <LineChart title="Wars per century" series={warsPerCentury} yFormat={(v) => `${Math.round(v)}`} />
      )}
      {civPopSeries.length > 0 && <LineChart title="Population by civilization" series={civPopSeries} />}
      {civTerritorySeries.length > 0 && <LineChart title="Territory by civilization" series={civTerritorySeries} yFormat={fmtNum} />}
      {largest && (
        <div className="callout">
          Largest empire: <b style={{ color: largest.color }}>{largest.name}</b> — {largest.territory.toLocaleString('en-US')} tiles
          ({largest.territoryPct.toFixed(1)}% of land), {fmtNum(largest.population)} people.
        </div>
      )}
    </div>
  );
}
