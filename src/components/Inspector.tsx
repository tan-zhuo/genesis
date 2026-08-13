// Right-hand inspector: tabbed panels for everything that isn't the map.
import { useMemo, useState } from 'react';
import { Crosshair } from 'lucide-react';
import { Rule } from '../simulation/types';
import { InspectorTab, Universe, useSimulatorStore } from '../state/simulatorStore';
import { fmtNum, fmtPct } from '../utils/format';
import { techEraName } from '../simulation/Technology';
import { CivilizationPanel } from './CivilizationPanel';
import { Timeline } from './Timeline';
import { Statistics } from './Statistics';
import { TechnologyTree } from './TechnologyTree';
import { ComparePanel } from './ComparePanel';
import { RuleBuilder } from './RuleBuilder';

const TABS: { id: InspectorTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'nations', label: 'Nations' },
  { id: 'cities', label: 'Cities' },
  { id: 'technology', label: 'Technology' },
  { id: 'history', label: 'History' },
  { id: 'stats', label: 'Statistics' },
  { id: 'rules', label: 'Rules' },
  { id: 'compare', label: 'Universes' },
];

export function Inspector({ universe }: { universe: Universe }): JSX.Element {
  const tab = useSimulatorStore((s) => s.inspectorTab);
  const setTab = useSimulatorStore((s) => s.setInspectorTab);

  return (
    <aside className="inspector" data-tutorial="inspector">
      <div className="tabs inspector-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'tab-active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="inspector-body">
        {tab === 'overview' && <OverviewPanel universe={universe} />}
        {tab === 'nations' && <NationsPanel universe={universe} />}
        {tab === 'cities' && <CitiesPanel universe={universe} />}
        {tab === 'technology' && <TechnologyTree universe={universe} />}
        {tab === 'history' && <Timeline universe={universe} />}
        {tab === 'stats' && <Statistics universe={universe} />}
        {tab === 'rules' && <RulesPanel universe={universe} />}
        {tab === 'compare' && <ComparePanel universe={universe} />}
      </div>
    </aside>
  );
}

function SelectedTileCard({ universe }: { universe: Universe }): JSX.Element | null {
  const selectedTile = useSimulatorStore((s) => s.selectedTile);
  const { mapStatic, snapshot } = universe;
  const info = useMemo(() => {
    if (!selectedTile || !mapStatic || !snapshot) return null;
    const i = selectedTile.y * mapStatic.width + selectedTile.x;
    const terrainNames = ['Ocean', 'Plains', 'Forest', 'Desert', 'Mountain', 'Tundra'];
    const ownerIdx = snapshot.owner[i];
    const bits = mapStatic.resources[i];
    const res: string[] = [];
    if (bits & 1) res.push('Food');
    if (bits & 2) res.push('Wood');
    if (bits & 4) res.push('Stone');
    if (bits & 8) res.push('Iron');
    if (bits & 16) res.push('Gold');
    return {
      terrain: terrainNames[mapStatic.terrain[i]],
      fertility: mapStatic.fertility[i],
      temperature: mapStatic.temperature[i],
      owner: ownerIdx >= 0 ? snapshot.civs[ownerIdx] : null,
      pop: snapshot.population[i],
      city: snapshot.cities.find((c) => c.x === selectedTile.x && c.y === selectedTile.y) ?? null,
      res,
    };
  }, [selectedTile, mapStatic, snapshot]);

  if (!info || !selectedTile) return null;
  return (
    <div className="tile-card">
      <div className="section-title">Tile ({selectedTile.x}, {selectedTile.y})</div>
      <div className="kv"><span>Terrain</span><b>{info.terrain}</b></div>
      <div className="kv"><span>Fertility</span><b>{Math.round(info.fertility * 100)}%</b></div>
      {info.pop >= 1 && <div className="kv"><span>Population</span><b>{Math.round(info.pop).toLocaleString('en-US')}</b></div>}
      {info.owner && (
        <div className="kv"><span>Owner</span><b style={{ color: info.owner.color }}>{info.owner.name}</b></div>
      )}
      {info.city && <div className="kv"><span>City</span><b>{info.city.name}</b></div>}
      {info.res.length > 0 && <div className="kv"><span>Resources</span><b>{info.res.join(', ')}</b></div>}
    </div>
  );
}

function OverviewPanel({ universe }: { universe: Universe }): JSX.Element {
  const snapshot = universe.snapshot;
  const selectCiv = useSimulatorStore((s) => s.selectCiv);
  const setTab = useSimulatorStore((s) => s.setInspectorTab);
  if (!snapshot) return <div className="empty-note">Generating world…</div>;
  const alive = snapshot.civs.filter((c) => c.alive);
  const totalPop = alive.reduce((s, c) => s + c.population, 0);
  const activeWars = snapshot.wars.filter((w) => w.endYear === null);
  const sorted = [...alive].sort((a, b) => b.population - a.population);

  return (
    <div>
      <SelectedTileCard universe={universe} />
      <div className="big-stats">
        <div className="big-stat"><span className="big-stat-value">{fmtNum(totalPop)}</span><span className="big-stat-label">Population</span></div>
        <div className="big-stat"><span className="big-stat-value">{alive.length}</span><span className="big-stat-label">Civilizations</span></div>
        <div className="big-stat"><span className="big-stat-value">{snapshot.cities.length}</span><span className="big-stat-label">Cities</span></div>
        <div className="big-stat"><span className="big-stat-value">{activeWars.length}</span><span className="big-stat-label">Active wars</span></div>
      </div>

      <div className="section-title">Nations by population</div>
      {sorted.map((c) => (
        <button key={c.id} className="civ-row" onClick={() => { selectCiv(c.id); setTab('nations'); }}>
          <span className="dot" style={{ background: c.color }} />
          <span className="civ-row-name">{c.name}</span>
          <span className="muted small">{techEraName(c.technologyLevel)}</span>
          <span className="civ-row-pop">{fmtNum(c.population)}</span>
          <span className="civ-row-territory muted">{fmtPct(c.territoryPct)}</span>
        </button>
      ))}
      {alive.length === 0 && (
        <div className="empty-note">
          All civilizations have perished. The world is silent.
          {snapshot.year > 0 && ' Reset or replay to watch history again.'}
        </div>
      )}

      {activeWars.length > 0 && (
        <>
          <div className="section-title">Active wars</div>
          {activeWars.map((w) => {
            const a = snapshot.civs.find((c) => c.id === w.attackerId);
            const b = snapshot.civs.find((c) => c.id === w.defenderId);
            return (
              <div key={w.id} className="war-row">
                <span className="war-name">{w.name}</span>
                <span>
                  <b style={{ color: a?.color }}>{a?.name}</b> ⚔ <b style={{ color: b?.color }}>{b?.name}</b>
                  <span className="muted small"> · since year {w.startYear}</span>
                </span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function NationsPanel({ universe }: { universe: Universe }): JSX.Element {
  const snapshot = universe.snapshot;
  const selectedCivId = useSimulatorStore((s) => s.selectedCivId);
  const selectCiv = useSimulatorStore((s) => s.selectCiv);
  if (!snapshot) return <div className="empty-note">Generating world…</div>;

  const selected = snapshot.civs.find((c) => c.id === selectedCivId);
  if (selected) return <CivilizationPanel universe={universe} civ={selected} />;

  const alive = snapshot.civs.filter((c) => c.alive).sort((a, b) => b.population - a.population);
  const dead = snapshot.civs.filter((c) => !c.alive);

  return (
    <div>
      {alive.map((c) => (
        <button key={c.id} className="civ-row" onClick={() => selectCiv(c.id)}>
          <span className="dot" style={{ background: c.color }} />
          <span className="civ-row-name">{c.name}</span>
          <span className="muted small">{c.cityCount} cities</span>
          <span className="civ-row-pop">{fmtNum(c.population)}</span>
        </button>
      ))}
      {dead.length > 0 && (
        <>
          <div className="section-title">Fallen civilizations</div>
          {dead.map((c) => (
            <button key={c.id} className="civ-row civ-row-dead" onClick={() => selectCiv(c.id)}>
              <span className="dot" style={{ background: c.color }} />
              <span className="civ-row-name">{c.name}</span>
              <span className="muted small">
                {c.foundedYear} – {c.deathYear}
              </span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

function CitiesPanel({ universe }: { universe: Universe }): JSX.Element {
  const snapshot = universe.snapshot;
  const selectedCityId = useSimulatorStore((s) => s.selectedCityId);
  const selectCity = useSimulatorStore((s) => s.selectCity);
  const focusOn = useSimulatorStore((s) => s.focusOn);
  if (!snapshot) return <div className="empty-note">Generating world…</div>;

  const cities = [...snapshot.cities].sort((a, b) => b.population - a.population);
  const selected = cities.find((c) => c.id === selectedCityId);

  if (selected) {
    const owner = snapshot.civs.find((c) => c.id === selected.ownerId);
    return (
      <div className="city-detail">
        <div className="civ-panel-head">
          <button className="icon-btn" onClick={() => selectCity(null)} title="Back">←</button>
          <span className="civ-panel-name">{selected.name}</span>
          <span className="tag">{selected.level}</span>
          <button className="icon-btn" onClick={() => focusOn(selected.x, selected.y)} title="Locate">
            <Crosshair size={14} />
          </button>
        </div>
        <div className="kv"><span>Owner</span><b style={{ color: owner?.color }}>{owner?.name ?? 'none'}</b></div>
        <div className="kv"><span>Population</span><b>{fmtNum(selected.population)}</b></div>
        <div className="kv"><span>Founded</span><b>Year {selected.foundedYear}</b></div>
        <div className="kv"><span>Food production</span><b>{fmtNum(selected.foodProduction)}</b></div>
        <div className="kv"><span>Industry</span><b>{fmtNum(selected.industry)}</b></div>
        <div className="kv"><span>Science</span><b>{fmtNum(selected.science)}</b></div>
      </div>
    );
  }

  return (
    <div>
      {cities.length === 0 && <div className="empty-note">No cities yet. Cities appear when a tile's population passes ~3,000.</div>}
      {cities.slice(0, 80).map((c) => {
        const owner = snapshot.civs.find((cv) => cv.id === c.ownerId);
        return (
          <button key={c.id} className="civ-row" onClick={() => { selectCity(c.id); focusOn(c.x, c.y); }}>
            <span className="dot" style={{ background: owner?.color ?? '#888' }} />
            <span className="civ-row-name">{c.name}</span>
            <span className="muted small">{c.level}</span>
            <span className="civ-row-pop">{fmtNum(c.population)}</span>
          </button>
        );
      })}
    </div>
  );
}

function RulesPanel({ universe }: { universe: Universe }): JSX.Element {
  const updateRules = useSimulatorStore((s) => s.updateRules);
  const showToast = useSimulatorStore((s) => s.showToast);
  const [draft, setDraft] = useState<Rule[] | null>(null);
  const civIds = (universe.snapshot?.civs ?? []).filter((c) => c.alive).map((c) => ({ id: c.id, name: c.name }));
  const rules = draft ?? universe.config.rules;
  const dirty = draft !== null;

  return (
    <div>
      <p className="hint">
        Applying rule changes re-runs history from Year 0 under the new rules (deterministically), then fast-forwards
        to the current year. Watch how differently the same world unfolds.
      </p>
      <RuleBuilder rules={rules} civs={universe.config.civs} civIds={civIds} onChange={setDraft} />
      <div className="rules-apply">
        <button
          className="btn btn-primary btn-sm"
          disabled={!dirty}
          onClick={() => {
            if (draft) {
              updateRules(draft);
              setDraft(null);
              showToast('Rules applied — recomputing history…');
            }
          }}
        >
          Apply rules &amp; re-simulate
        </button>
        {dirty && (
          <button className="btn btn-ghost btn-sm" onClick={() => setDraft(null)}>
            Discard changes
          </button>
        )}
      </div>
    </div>
  );
}
