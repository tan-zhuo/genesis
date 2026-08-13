// Civilization detail: stats, history charts, relations.
import { ArrowLeft, Crosshair, Skull } from 'lucide-react';
import { Universe, useSimulatorStore } from '../state/simulatorStore';
import { CivSummary } from '../simulation/types';
import { techEraName } from '../simulation/Technology';
import { fmtNum, fmtPct } from '../utils/format';
import { LineChart } from './LineChart';
import { civProfile } from './CivEditor';

function StatBar({ label, value, color }: { label: string; value: number; color?: string }): JSX.Element {
  return (
    <div className="stat-bar">
      <span className="stat-bar-label">{label}</span>
      <div className="stat-bar-track">
        <div className="stat-bar-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color ?? 'var(--accent)' }} />
      </div>
      <span className="stat-bar-value">{Math.round(value)}</span>
    </div>
  );
}

export function CivilizationPanel({ universe, civ }: { universe: Universe; civ: CivSummary }): JSX.Element {
  const selectCiv = useSimulatorStore((s) => s.selectCiv);
  const focusOn = useSimulatorStore((s) => s.focusOn);
  const snapshot = universe.snapshot;
  const history = snapshot?.civHistories[civ.id];

  const relations = (snapshot?.relations ?? [])
    .filter((r) => r.a === civ.id || r.b === civ.id)
    .map((r) => {
      const otherId = r.a === civ.id ? r.b : r.a;
      const other = snapshot?.civs.find((c) => c.id === otherId);
      return other ? { other, value: r.value, status: r.status } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.value - a.value);

  return (
    <div className="civ-panel">
      <div className="civ-panel-head">
        <button className="icon-btn" onClick={() => selectCiv(null)} title="Back to list">
          <ArrowLeft size={14} />
        </button>
        <span className="civ-panel-name" style={{ color: civ.color }}>{civ.name.toUpperCase()}</span>
        {!civ.alive && (
          <span className="tag tag-dead"><Skull size={11} /> extinct {civ.deathYear !== null ? `· year ${civ.deathYear}` : ''}</span>
        )}
        <button className="icon-btn" onClick={() => focusOn(Math.round(civ.cx), Math.round(civ.cy))} title="Locate on map" disabled={!civ.alive}>
          <Crosshair size={14} />
        </button>
      </div>

      <div className="profile-tags">
        {civProfile(civ.traits).map((t) => (
          <span className="tag" key={t}>{t}</span>
        ))}
      </div>

      <div className="big-stats">
        <div className="big-stat"><span className="big-stat-value">{fmtNum(civ.population)}</span><span className="big-stat-label">Population</span></div>
        <div className="big-stat"><span className="big-stat-value">{fmtPct(civ.territoryPct)}</span><span className="big-stat-label">Territory</span></div>
        <div className="big-stat"><span className="big-stat-value">{civ.cityCount}</span><span className="big-stat-label">Cities</span></div>
        <div className="big-stat"><span className="big-stat-value">{techEraName(civ.technologyLevel)}</span><span className="big-stat-label">Era</span></div>
      </div>

      <div className="stat-bars">
        <StatBar label="Economy" value={civ.economy} />
        <StatBar label="Military" value={Math.min(100, civ.military)} color="#e5484d" />
        <StatBar label="Stability" value={civ.stability} color="#30a46c" />
        <StatBar label="Happiness" value={civ.happiness} color="#f5a524" />
        <StatBar label="Culture" value={civ.culture} color="#8e4ec6" />
      </div>

      <div className="resource-row">
        <span>🌾 {fmtNum(civ.food)}</span>
        <span>🪵 {fmtNum(civ.wood)}</span>
        <span>🪨 {fmtNum(civ.stone)}</span>
        <span>⛏ {fmtNum(civ.iron)}</span>
        <span>🪙 {fmtNum(civ.gold)}</span>
      </div>

      {history && history.years.length > 2 && (
        <>
          <LineChart title="Population" series={[{ label: civ.name, color: civ.color, xs: history.years, ys: history.population }]} />
          <LineChart title="Territory (tiles)" series={[{ label: civ.name, color: civ.color, xs: history.years, ys: history.territory }]} />
          <LineChart title="Technology level" series={[{ label: civ.name, color: civ.color, xs: history.years, ys: history.technology }]} />
          <LineChart title="Economy" series={[{ label: civ.name, color: civ.color, xs: history.years, ys: history.economy }]} />
        </>
      )}

      {relations.length > 0 && (
        <div className="relations-box">
          <div className="section-title">Relations</div>
          {relations.map((r) => (
            <button className="relation-row" key={r.other.id} onClick={() => selectCiv(r.other.id)}>
              <span className="dot" style={{ background: r.other.color }} />
              <span className="relation-name">{r.other.name}</span>
              <span className={`relation-value ${r.value > 0 ? 'pos' : r.value < 0 ? 'neg' : ''}`}>
                {r.value > 0 ? '+' : ''}{Math.round(r.value)}
              </span>
              <span className={`relation-status status-${r.status}`}>{r.status}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
