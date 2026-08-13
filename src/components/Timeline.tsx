// Historical event timeline with filtering; click focuses the map.
import { useMemo, useState } from 'react';
import { Universe, useSimulatorStore } from '../state/simulatorStore';
import { WorldEvent, WorldEventType } from '../simulation/types';
import { useLang, useT } from '../i18n';
import { EVENT_ICONS } from './icons';

const FILTERS: { id: string; key: string; types: WorldEventType[] }[] = [
  { id: 'all', key: 'tl.all', types: [] },
  { id: 'war', key: 'tl.wars', types: ['war', 'peace', 'city-captured'] },
  { id: 'tech', key: 'tl.tech', types: ['technology'] },
  { id: 'cities', key: 'tl.cities', types: ['city-founded'] },
  { id: 'nations', key: 'tl.nations', types: ['birth', 'split', 'extinction', 'empire', 'revolution', 'collapse', 'ascension'] },
  { id: 'faith', key: 'tl.faith', types: ['prayer', 'faith', 'philosophy', 'divine'] },
  { id: 'world', key: 'tl.world', types: ['disaster', 'migration', 'trade', 'alliance'] },
];

function EventIcon({ type }: { type: WorldEventType }): JSX.Element | null {
  const Icon = EVENT_ICONS[type];
  return Icon ? <Icon size={13} className="event-icon" /> : null;
}

export function Timeline({ universe }: { universe: Universe }): JSX.Element {
  const [filter, setFilter] = useState('all');
  const t = useT();
  const lang = useLang();
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
            {t(f.key)}
          </button>
        ))}
        <select className="input input-sm" value={minImportance} onChange={(e) => setMinImportance(Number(e.target.value))} title={t('tl.minImportance')}>
          <option value={1}>{t('tl.allEvents')}</option>
          <option value={3}>{t('tl.notable')}</option>
          <option value={6}>{t('tl.major')}</option>
          <option value={8}>{t('tl.historic')}</option>
        </select>
      </div>
      <div className="timeline-list">
        {events.length === 0 && <div className="empty-note">{t('tl.empty')}</div>}
        {events.map((e) => (
          <button key={e.id} className={`event-item importance-${Math.min(9, e.importance)}`} onClick={() => clickEvent(e)}>
            <span className="event-year">{t('tl.year', { y: e.year.toLocaleString('en-US') })}</span>
            <span className="event-title">
              <EventIcon type={e.type} /> {lang === 'zh' && e.titleZh ? e.titleZh : e.title}
            </span>
            <span className="event-desc">{lang === 'zh' && e.descriptionZh ? e.descriptionZh : e.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
