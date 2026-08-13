// Historical event timeline with filtering; click focuses the map.
import { useMemo, useState } from 'react';
import { Universe, useSimulatorStore } from '../state/simulatorStore';
import { WorldEvent, WorldEventType } from '../simulation/types';

const TYPE_ICONS: Partial<Record<WorldEventType, string>> = {
  birth: '🌱',
  'city-founded': '🏛',
  'city-captured': '🏴',
  technology: '💡',
  war: '⚔️',
  peace: '🕊',
  trade: '🪙',
  migration: '👥',
  revolution: '✊',
  split: '💥',
  collapse: '🏚',
  extinction: '💀',
  disaster: '🌋',
  alliance: '🤝',
  empire: '👑',
};

const FILTERS: { id: string; label: string; types: WorldEventType[] }[] = [
  { id: 'all', label: 'All', types: [] },
  { id: 'war', label: 'Wars', types: ['war', 'peace', 'city-captured'] },
  { id: 'tech', label: 'Tech', types: ['technology'] },
  { id: 'cities', label: 'Cities', types: ['city-founded'] },
  { id: 'nations', label: 'Nations', types: ['birth', 'split', 'extinction', 'empire', 'revolution', 'collapse'] },
  { id: 'world', label: 'World', types: ['disaster', 'migration', 'trade', 'alliance'] },
];

export function Timeline({ universe }: { universe: Universe }): JSX.Element {
  const [filter, setFilter] = useState('all');
  const [minImportance, setMinImportance] = useState(3);
  const focusOn = useSimulatorStore((s) => s.focusOn);
  const selectCiv = useSimulatorStore((s) => s.selectCiv);

  const events = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter);
    let list = universe.events;
    if (f && f.types.length > 0) list = list.filter((e) => f.types.includes(e.type));
    list = list.filter((e) => e.importance >= minImportance);
    return list.slice(-400).reverse();
  }, [universe.events, filter, minImportance]);

  const clickEvent = (e: WorldEvent): void => {
    if (e.x !== undefined && e.y !== undefined) focusOn(e.x, e.y);
    if (e.civilizationIds.length > 0) selectCiv(e.civilizationIds[0]);
  };

  return (
    <div className="timeline">
      <div className="timeline-filters">
        {FILTERS.map((f) => (
          <button key={f.id} className={`chip ${filter === f.id ? 'chip-active' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
        <select className="input input-sm" value={minImportance} onChange={(e) => setMinImportance(Number(e.target.value))} title="Minimum importance">
          <option value={1}>All events</option>
          <option value={3}>Notable+</option>
          <option value={6}>Major+</option>
          <option value={8}>Historic</option>
        </select>
      </div>
      <div className="timeline-list">
        {events.length === 0 && <div className="empty-note">History has not been written yet. Press play.</div>}
        {events.map((e) => (
          <button key={e.id} className={`event-item importance-${Math.min(9, e.importance)}`} onClick={() => clickEvent(e)}>
            <span className="event-year">Year {e.year.toLocaleString('en-US')}</span>
            <span className="event-title">
              {TYPE_ICONS[e.type] ?? '•'} {e.title}
            </span>
            <span className="event-desc">{e.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
