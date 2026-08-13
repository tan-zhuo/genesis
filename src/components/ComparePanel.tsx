// Parallel universes: branch with modified config, compare outcomes.
import { useState } from 'react';
import { GitBranch, Trash2 } from 'lucide-react';
import { Universe, useSimulatorStore } from '../state/simulatorStore';
import { fmtNum } from '../utils/format';
import { LineChart, Series } from './LineChart';

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

  const other = universes.find((u) => u.id === compareUniverseId && u.id !== universe.id) ?? null;

  const branch = (mutate: 'same' | 'seed'): void => {
    if (universes.length >= 4) {
      showToast('Maximum 4 parallel universes.');
      return;
    }
    const config = structuredClone(universe.config);
    if (mutate === 'seed' && seedEdit.trim()) config.seed = seedEdit.trim();
    const name = `Universe ${String.fromCharCode(65 + universes.length)}`;
    branchUniverse(universe.id, config, name);
    showToast(`${name} created${mutate === 'seed' ? ` with seed ${config.seed}` : ' — edit its rules or civs, then compare'}.`);
  };

  const metrics = (u: Universe): { label: string; value: string }[] => {
    const s = u.snapshot;
    if (!s) return [];
    const alive = s.civs.filter((c) => c.alive);
    const totalWars = u.events.filter((e) => e.type === 'war').length;
    return [
      { label: 'Year', value: s.year.toLocaleString('en-US') },
      { label: 'Population', value: fmtNum(alive.reduce((sum, c) => sum + c.population, 0)) },
      { label: 'Civilizations', value: `${alive.length}` },
      { label: 'Cities', value: `${s.cities.length}` },
      { label: 'Wars fought', value: `${totalWars}` },
      { label: 'Max technology', value: `${Math.max(0, ...alive.map((c) => c.technologyLevel))}/11` },
      { label: 'Extinctions', value: `${s.civs.filter((c) => !c.alive).length}` },
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
      <div className="section-title">Parallel universes</div>
      <p className="hint">
        Branch this universe (same seed &amp; config), tweak its rules or civilizations, and watch history diverge.
      </p>

      <div className="universe-list">
        {universes.map((u) => (
          <div key={u.id} className={`universe-row ${u.id === activeUniverseId ? 'universe-active' : ''}`}>
            <button className="universe-name" onClick={() => setActiveUniverse(u.id)}>
              {u.name} <span className="muted small">seed {u.config.seed} · year {u.snapshot?.year ?? 0}</span>
            </button>
            {u.id !== universe.id && (
              <button
                className={`chip ${compareUniverseId === u.id ? 'chip-active' : ''}`}
                onClick={() => setCompareUniverse(compareUniverseId === u.id ? null : u.id)}
              >
                compare
              </button>
            )}
            {universes.length > 1 && (
              <button className="icon-btn" onClick={() => removeUniverse(u.id)} title="Delete universe">
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="branch-actions">
        <button className="btn btn-ghost btn-sm" onClick={() => branch('same')}>
          <GitBranch size={13} /> Branch (same seed)
        </button>
        <div className="seed-row">
          <input
            className="input input-sm"
            placeholder="new seed…"
            value={seedEdit}
            onChange={(e) => setSeedEdit(e.target.value)}
          />
          <button className="btn btn-ghost btn-sm" onClick={() => branch('seed')} disabled={!seedEdit.trim()}>
            <GitBranch size={13} /> Branch with seed
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
          {popSeries.length === 2 && <LineChart title="Population: both universes" series={popSeries} />}
        </>
      ) : (
        universes.length > 1 && <div className="empty-note">Pick a universe above to compare against.</div>
      )}
    </div>
  );
}
