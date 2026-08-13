// World-level statistics charts.
import { useMemo } from 'react';
import { Universe } from '../state/simulatorStore';
import { LineChart, Series } from './LineChart';
import { fmtNum } from '../utils/format';
import { useT } from '../i18n';

export function Statistics({ universe }: { universe: Universe }): JSX.Element {
  const snapshot = universe.snapshot;
  const stats = snapshot?.stats ?? [];
  const t = useT();

  const worldSeries = useMemo(() => {
    const xs = stats.map((s) => s.year);
    return {
      population: [{ label: t('st.worldPop'), color: '#f5a524', xs, ys: stats.map((s) => s.population) }],
      civs: [
        { label: t('st.civsSeries'), color: '#3b82f6', xs, ys: stats.map((s) => s.civilizations) },
        { label: t('st.warsSeries'), color: '#e5484d', xs, ys: stats.map((s) => s.wars) },
        { label: t('st.alliancesSeries'), color: '#30a46c', xs, ys: stats.map((s) => s.alliances) },
      ],
      cities: [{ label: t('st.citiesSeries'), color: '#12a594', xs, ys: stats.map((s) => s.cities) }],
      tech: [{ label: t('st.maxTech'), color: '#8e4ec6', xs, ys: stats.map((s) => s.technologies) }],
    };
  }, [stats, t]);

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
    return [{ label: t('st.warsPerCentury'), color: '#e5484d', xs: xs.map((c) => c * 100), ys: xs.map((c) => buckets.get(c) ?? 0) }];
  }, [snapshot, universe.events]);

  const largest = snapshot?.civs.filter((c) => c.alive).sort((a, b) => b.territory - a.territory)[0];

  if (stats.length < 3) return <div className="empty-note">{t('st.needData')}</div>;

  return (
    <div className="stats-panel">
      <LineChart title={t('st.popOverTime')} series={worldSeries.population} />
      <LineChart title={t('st.civsWars')} series={worldSeries.civs} />
      <LineChart title={t('st.citiesOverTime')} series={worldSeries.cities} />
      <LineChart title={t('st.techProgress')} series={worldSeries.tech} yFormat={(v) => `${Math.round(v)}`} />
      {warsPerCentury.length > 0 && warsPerCentury[0].xs.length > 1 && (
        <LineChart title={t('st.warsPerCentury')} series={warsPerCentury} yFormat={(v) => `${Math.round(v)}`} />
      )}
      {civPopSeries.length > 0 && <LineChart title={t('st.popByCiv')} series={civPopSeries} />}
      {civTerritorySeries.length > 0 && <LineChart title={t('st.terrByCiv')} series={civTerritorySeries} yFormat={fmtNum} />}
      {largest && (
        <div className="callout">
          <b style={{ color: largest.color }}>
            {t('st.largest', {
              name: largest.name,
              tiles: largest.territory.toLocaleString('en-US'),
              pct: largest.territoryPct.toFixed(1),
              pop: fmtNum(largest.population),
            })}
          </b>
        </div>
      )}
    </div>
  );
}
