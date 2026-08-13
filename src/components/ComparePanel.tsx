// Parallel universes: branch with modified config, compare outcomes.
import { useState } from 'react';
import { GitBranch, Trash2 } from 'lucide-react';
import { Universe, useSimulatorStore } from '../state/simulatorStore';
import { fmtNum } from '../utils/format';
import { LineChart, Series } from './LineChart';
import { useT } from '../i18n';

export function ComparePanel({ universe }: { universe: Universe }): JSX.Element {
  const universes = useSimulatorStore((s) => s.universes);
  const activeUniverseId = useSimulatorStore((s) => s.activeUniverseId);
  const compareUniverseId = useSimulatorStore((s) => s.compareUniverseId);
  const setCompareUniverse = useSimulatorStore((s) => s.setCompareUniverse);
  const setActiveUniverse = useSimulatorStore((s) => s.setActiveUniverse);
  const branchUniverse = useSimulatorStore((s) => s.branchUniverse);
  const removeUniverse = useSimulatorStore((s) => s.removeUniverse);
  const showToast = useSimulatorStore((s) => s.showToast);
  const [seedEdit, setSeedEdit] = useState('');
  const t = useT();

  const other = universes.find((u) => u.id === compareUniverseId && u.id !== universe.id) ?? null;

  const branch = (mutate: 'same' | 'seed'): void => {
    if (universes.length >= 4) {
      showToast(t('cmp.max'));
      return;
    }
    const config = structuredClone(universe.config);
    if (mutate === 'seed' && seedEdit.trim()) config.seed = seedEdit.trim();
    const name = `Universe ${String.fromCharCode(65 + universes.length)}`;
    branchUniverse(universe.id, config, name);
    showToast(t('cmp.created', { name, extra: mutate === 'seed' ? t('cmp.createdSeed', { seed: config.seed }) : t('cmp.createdSame') }));
  };

  const metrics = (u: Universe): { label: string; value: string }[] => {
    const s = u.snapshot;
    if (!s) return [];
    const alive = s.civs.filter((c) => c.alive);
    const totalWars = u.events.filter((e) => e.type === 'war').length;
    return [
      { label: t('cmp.year'), value: s.year.toLocaleString('en-US') },
      { label: t('cmp.population'), value: fmtNum(alive.reduce((sum, c) => sum + c.population, 0)) },
      { label: t('cmp.civilizations'), value: `${alive.length}` },
      { label: t('cmp.cities'), value: `${s.cities.length}` },
      { label: t('cmp.warsFought'), value: `${totalWars}` },
      { label: t('cmp.maxTech'), value: `${Math.max(0, ...alive.map((c) => c.technologyLevel))}/13` },
      { label: t('cmp.extinctions'), value: `${s.civs.filter((c) => !c.alive).length}` },
    ];
  };

  const popSeries: Series[] = [];
  if (universe.snapshot) {
    popSeries.push({
      label: universe.name,
      color: '#f5a524',
      xs: universe.snapshot.stats.map((s) => s.year),
      ys: universe.snapshot.stats.map((s) => s.population),
    });
  }
  if (other?.snapshot) {
    popSeries.push({
      label: other.name,
      color: '#3b82f6',
      xs: other.snapshot.stats.map((s) => s.year),
      ys: other.snapshot.stats.map((s) => s.population),
    });
  }

  return (
    <div className="compare-panel">
      <div className="section-title">{t('cmp.title')}</div>
      <p className="hint">{t('cmp.hint')}</p>

      <div className="universe-list">
        {universes.map((u) => (
          <div key={u.id} className={`universe-row ${u.id === activeUniverseId ? 'universe-active' : ''}`}>
            <button className="universe-name" onClick={() => setActiveUniverse(u.id)}>
              {u.name} <span className="muted small">{t('cmp.seedYear', { seed: u.config.seed, y: u.snapshot?.year ?? 0 })}</span>
            </button>
            {u.id !== universe.id && (
              <button
                className={`chip ${compareUniverseId === u.id ? 'chip-active' : ''}`}
                onClick={() => setCompareUniverse(compareUniverseId === u.id ? null : u.id)}
              >
                {t('cmp.compare')}
              </button>
            )}
            {universes.length > 1 && (
              <button className="icon-btn" onClick={() => removeUniverse(u.id)} title={t('cmp.delete')}>
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="branch-actions">
        <button className="btn btn-ghost btn-sm" onClick={() => branch('same')}>
          <GitBranch size={13} /> {t('cmp.branchSame')}
        </button>
        <div className="seed-row">
          <input
            className="input input-sm"
            placeholder={t('cmp.seedPlaceholder')}
            value={seedEdit}
            onChange={(e) => setSeedEdit(e.target.value)}
          />
          <button className="btn btn-ghost btn-sm" onClick={() => branch('seed')} disabled={!seedEdit.trim()}>
            <GitBranch size={13} /> {t('cmp.branchSeed')}
          </button>
        </div>
      </div>

      {other ? (
        <>
          <div className="compare-grid">
            <div className="compare-col">
              <div className="compare-title">{universe.name}</div>
              {metrics(universe).map((m) => (
                <div className="compare-row" key={m.label}>
                  <span className="muted">{m.label}</span>
                  <b>{m.value}</b>
                </div>
              ))}
            </div>
            <div className="compare-col">
              <div className="compare-title">{other.name}</div>
              {metrics(other).map((m) => (
                <div className="compare-row" key={m.label}>
                  <span className="muted">{m.label}</span>
                  <b>{m.value}</b>
                </div>
              ))}
            </div>
          </div>
          {popSeries.length === 2 && <LineChart title={t('cmp.bothPop')} series={popSeries} />}
        </>
      ) : (
        universes.length > 1 && <div className="empty-note">{t('cmp.pick')}</div>
      )}
    </div>
  );
}
