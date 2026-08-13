// Right-hand inspector: tabbed panels for everything that isn't the map.
import { useMemo, useState } from 'react';
import { ArrowLeft, Crosshair, Swords } from 'lucide-react';
import { Rule } from '../simulation/types';
import { InspectorTab, Universe, useSimulatorStore } from '../state/simulatorStore';
import { fmtNum, fmtPct } from '../utils/format';
import { techEraKey } from '../simulation/Technology';
import { useT } from '../i18n';
import { CivilizationPanel } from './CivilizationPanel';
import { Timeline } from './Timeline';
import { Statistics } from './Statistics';
import { TechnologyTree } from './TechnologyTree';
import { ComparePanel } from './ComparePanel';
import { RuleBuilder } from './RuleBuilder';
import { FaithPanel } from './FaithPanel';

const TABS: InspectorTab[] = ['overview', 'nations', 'cities', 'technology', 'faith', 'history', 'stats', 'rules', 'compare'];

export function Inspector({ universe }: { universe: Universe }): JSX.Element {
  const tab = useSimulatorStore((s) => s.inspectorTab);
  const setTab = useSimulatorStore((s) => s.setInspectorTab);
  const t = useT();

  return (
    <aside className="inspector" data-tutorial="inspector">
      <div className="tabs inspector-tabs">
        {TABS.map((id) => (
          <button key={id} className={`tab ${tab === id ? 'tab-active' : ''}`} onClick={() => setTab(id)}>
            {t(`tab.${id === 'compare' ? 'compare' : id}`)}
          </button>
        ))}
      </div>
      <div className="inspector-body">
        {tab === 'overview' && <OverviewPanel universe={universe} />}
        {tab === 'nations' && <NationsPanel universe={universe} />}
        {tab === 'cities' && <CitiesPanel universe={universe} />}
        {tab === 'technology' && <TechnologyTree universe={universe} />}
        {tab === 'faith' && <FaithPanel universe={universe} />}
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
  const t = useT();
  const { mapStatic, snapshot } = universe;
  const info = useMemo(() => {
    if (!selectedTile || !mapStatic || !snapshot) return null;
    const i = selectedTile.y * mapStatic.width + selectedTile.x;
    const terrainKeys = ['ocean', 'plains', 'forest', 'desert', 'mountain', 'tundra'];
    const ownerIdx = snapshot.owner[i];
    const bits = mapStatic.resources[i];
    const res: string[] = [];
    if (bits & 1) res.push('food');
    if (bits & 2) res.push('wood');
    if (bits & 4) res.push('stone');
    if (bits & 8) res.push('iron');
    if (bits & 16) res.push('gold');
    return {
      terrain: terrainKeys[mapStatic.terrain[i]],
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
      <div className="section-title">{t('tile.title', { x: selectedTile.x, y: selectedTile.y })}</div>
      <div className="kv"><span>{t('tile.terrain')}</span><b>{t(`terrain.${info.terrain}`)}</b></div>
      <div className="kv"><span>{t('tile.fertility')}</span><b>{Math.round(info.fertility * 100)}%</b></div>
      {info.pop >= 1 && <div className="kv"><span>{t('tile.population')}</span><b>{Math.round(info.pop).toLocaleString('en-US')}</b></div>}
      {info.owner && (
        <div className="kv"><span>{t('tile.owner')}</span><b style={{ color: info.owner.color }}>{info.owner.name}</b></div>
      )}
      {info.city && <div className="kv"><span>{t('tile.city')}</span><b>{info.city.name}</b></div>}
      {info.res.length > 0 && <div className="kv"><span>{t('tile.resources')}</span><b>{info.res.map((r) => t(`res.${r}`)).join(', ')}</b></div>}
    </div>
  );
}

function OverviewPanel({ universe }: { universe: Universe }): JSX.Element {
  const snapshot = universe.snapshot;
  const selectCiv = useSimulatorStore((s) => s.selectCiv);
  const setTab = useSimulatorStore((s) => s.setInspectorTab);
  const t = useT();
  if (!snapshot) return <div className="empty-note">{t('ov.generating')}</div>;
  const alive = snapshot.civs.filter((c) => c.alive);
  const totalPop = alive.reduce((s, c) => s + c.population, 0);
  const activeWars = snapshot.wars.filter((w) => w.endYear === null);
  const sorted = [...alive].sort((a, b) => b.population - a.population);

  return (
    <div>
      <SelectedTileCard universe={universe} />
      <div className="big-stats">
        <div className="big-stat"><span className="big-stat-value">{fmtNum(totalPop)}</span><span className="big-stat-label">{t('ov.population')}</span></div>
        <div className="big-stat"><span className="big-stat-value">{alive.length}</span><span className="big-stat-label">{t('ov.civilizations')}</span></div>
        <div className="big-stat"><span className="big-stat-value">{snapshot.cities.length}</span><span className="big-stat-label">{t('ov.cities')}</span></div>
        <div className="big-stat"><span className="big-stat-value">{activeWars.length}</span><span className="big-stat-label">{t('ov.activeWars')}</span></div>
      </div>

      <div className="section-title">{t('ov.byPop')}</div>
      {sorted.map((c) => (
        <button key={c.id} className="civ-row" onClick={() => { selectCiv(c.id); setTab('nations'); }}>
          <span className="dot" style={{ background: c.color }} />
          <span className="civ-row-name">{c.name}</span>
          <span className="muted small">{t(`era.${techEraKey(c.technologyLevel)}`)}</span>
          <span className="civ-row-pop">{fmtNum(c.population)}</span>
          <span className="civ-row-territory muted">{fmtPct(c.territoryPct)}</span>
        </button>
      ))}
      {alive.length === 0 && (
        <div className="empty-note">
          {t('ov.allDead')}
          {snapshot.year > 0 && t('ov.allDeadHint')}
        </div>
      )}

      {activeWars.length > 0 && (
        <>
          <div className="section-title">{t('ov.warsSection')}</div>
          {activeWars.map((w) => {
            const a = snapshot.civs.find((c) => c.id === w.attackerId);
            const b = snapshot.civs.find((c) => c.id === w.defenderId);
            return (
              <div key={w.id} className="war-row">
                <span className="war-name">{w.name}</span>
                <span>
                  <b style={{ color: a?.color }}>{a?.name}</b> <Swords size={11} className="inline-icon" /> <b style={{ color: b?.color }}>{b?.name}</b>
                  <span className="muted small"> · {t('ov.since', { y: w.startYear })}</span>
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
  const t = useT();
  if (!snapshot) return <div className="empty-note">{t('ov.generating')}</div>;

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
          <span className="muted small">{t('nat.citiesCount', { n: c.cityCount })}</span>
          <span className="civ-row-pop">{fmtNum(c.population)}</span>
        </button>
      ))}
      {dead.length > 0 && (
        <>
          <div className="section-title">{t('nat.fallen')}</div>
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
  const t = useT();
  if (!snapshot) return <div className="empty-note">{t('ov.generating')}</div>;

  const cities = [...snapshot.cities].sort((a, b) => b.population - a.population);
  const selected = cities.find((c) => c.id === selectedCityId);

  if (selected) {
    const owner = snapshot.civs.find((c) => c.id === selected.ownerId);
    return (
      <div className="city-detail">
        <div className="civ-panel-head">
          <button className="icon-btn" onClick={() => selectCity(null)} title={t('nat.back')}><ArrowLeft size={14} /></button>
          <span className="civ-panel-name">{selected.name}</span>
          <span className="tag">{t(`level.${selected.level}`)}</span>
          <button className="icon-btn" onClick={() => focusOn(selected.x, selected.y)} title={t('nat.locate')}>
            <Crosshair size={14} />
          </button>
        </div>
        <div className="kv"><span>{t('city.owner')}</span><b style={{ color: owner?.color }}>{owner?.name ?? '—'}</b></div>
        <div className="kv"><span>{t('city.population')}</span><b>{fmtNum(selected.population)}</b></div>
        <div className="kv"><span>{t('city.founded')}</span><b>{t('city.foundedYear', { y: selected.foundedYear })}</b></div>
        <div className="kv"><span>{t('city.food')}</span><b>{fmtNum(selected.foodProduction)}</b></div>
        <div className="kv"><span>{t('city.industry')}</span><b>{fmtNum(selected.industry)}</b></div>
        <div className="kv"><span>{t('city.science')}</span><b>{fmtNum(selected.science)}</b></div>
      </div>
    );
  }

  return (
    <div>
      {cities.length === 0 && <div className="empty-note">{t('city.none')}</div>}
      {cities.slice(0, 80).map((c) => {
        const owner = snapshot.civs.find((cv) => cv.id === c.ownerId);
        return (
          <button key={c.id} className="civ-row" onClick={() => { selectCity(c.id); focusOn(c.x, c.y); }}>
            <span className="dot" style={{ background: owner?.color ?? '#888' }} />
            <span className="civ-row-name">{c.name}</span>
            <span className="muted small">{t(`level.${c.level}`)}</span>
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
  const t = useT();
  const [draft, setDraft] = useState<Rule[] | null>(null);
  const civIds = (universe.snapshot?.civs ?? []).filter((c) => c.alive).map((c) => ({ id: c.id, name: c.name }));
  const rules = draft ?? universe.config.rules;
  const dirty = draft !== null;

  return (
    <div>
      <p className="hint">{t('rules.hint')}</p>
      <RuleBuilder rules={rules} civs={universe.config.civs} civIds={civIds} onChange={setDraft} />
      <div className="rules-apply">
        <button
          className="btn btn-primary btn-sm"
          disabled={!dirty}
          onClick={() => {
            if (draft) {
              updateRules(draft);
              setDraft(null);
              showToast(t('rules.applied'));
            }
          }}
        >
          {t('rules.apply')}
        </button>
        {dirty && (
          <button className="btn btn-ghost btn-sm" onClick={() => setDraft(null)}>
            {t('rules.discard')}
          </button>
        )}
      </div>
    </div>
  );
}
