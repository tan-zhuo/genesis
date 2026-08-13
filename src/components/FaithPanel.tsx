// The Faith tab: what the world believes — and what it believes about YOU.
import { Universe, useSimulatorStore } from '../state/simulatorStore';
import { DOCTRINES, GOD_TITLES, getDoctrine } from '../simulation/Faith';
import { useLang, useT } from '../i18n';
import { fmtNum } from '../utils/format';
import { DOCTRINE_ICONS, EVENT_ICONS } from './icons';
import { Church, HeartHandshake, Landmark } from 'lucide-react';

export function FaithPanel({ universe }: { universe: Universe }): JSX.Element {
  const t = useT();
  const lang = useLang();
  const zh = lang === 'zh';
  const selectCiv = useSimulatorStore((s) => s.selectCiv);
  const focusOn = useSimulatorStore((s) => s.focusOn);
  const snapshot = universe.snapshot;
  if (!snapshot) return <div className="empty-note">{t('ov.generating')}</div>;

  const title = snapshot.godName ? GOD_TITLES[snapshot.godName.id] : null;
  const alive = snapshot.civs.filter((c) => c.alive);
  const interventionCount = snapshot.interventions.filter((iv) => iv.year <= snapshot.year).length;
  const faithEvents = universe.events
    .filter((e) => e.type === 'faith' || e.type === 'prayer' || e.type === 'philosophy')
    .slice(-24)
    .reverse();

  return (
    <div className="faith-panel">
      <div className="god-card">
        <div className="god-card-label">{t('faith.theyCallYou')}</div>
        <div className="god-card-name">{title ? (zh ? title.nameZh : title.nameEn) : t('faith.nameless')}</div>
        <div className="god-card-sub muted small">
          {t('faith.interventionCount', { n: interventionCount })}
          {snapshot.godName && ` · ${t('faith.since', { y: snapshot.godName.sinceYear })}`}
        </div>
      </div>

      <div className="section-title">{t('faith.civBeliefs')}</div>
      {alive.map((c) => {
        const doctrine = getDoctrine(c.doctrine);
        const dev = Math.round(c.devotion);
        return (
          <button key={c.id} className="faith-row" onClick={() => selectCiv(c.id)}>
            <div className="faith-row-head">
              <span className="dot" style={{ background: c.color }} />
              <span className="faith-row-name">{c.name}</span>
              {doctrine ? (
                <span className="faith-doctrine" title={zh ? doctrine.creedZh : doctrine.creedEn}>
                  {(() => {
                    const Icon = DOCTRINE_ICONS[doctrine.id] ?? Church;
                    return <Icon size={12} className="inline-icon" />;
                  })()}{' '}
                  {zh ? doctrine.nameZh : doctrine.nameEn}
                </span>
              ) : (
                <span className="muted small">{t('faith.noDoctrine')}</span>
              )}
            </div>
            <div className="devotion-track" title={t('faith.devotion')}>
              <div className="devotion-zero" />
              <div
                className={`devotion-fill ${dev >= 0 ? 'devotion-pos' : 'devotion-neg'}`}
                style={
                  dev >= 0
                    ? { left: '50%', width: `${dev / 2}%` }
                    : { right: '50%', width: `${-dev / 2}%` }
                }
              />
            </div>
            <div className="faith-row-foot muted small">
              <span>{dev >= 25 ? t('faith.devout') : dev <= -25 ? t('faith.defiant') : t('faith.indifferent')} ({dev > 0 ? '+' : ''}{dev})</span>
              {c.pendingPrayer && (
                <span className="prayer-flag"><HeartHandshake size={11} className="inline-icon" /> {t(`faith.prays.${c.pendingPrayer.kind}`)}</span>
              )}
            </div>
          </button>
        );
      })}

      {snapshot.epitaphs.length > 0 && (
        <>
          <div className="section-title">{t('faith.ruins')} · {snapshot.epitaphs.length}</div>
          {snapshot.epitaphs.slice(-8).reverse().map((e) => (
            <button key={e.civId} className={`epitaph-row ${e.ascended ? 'epitaph-ascended' : ''}`} onClick={() => focusOn(e.x, e.y)}>
              <span className="epitaph-marker"><Landmark size={15} /></span>
              <div>
                <div className="epitaph-name" style={{ color: e.color }}>{e.name} · {e.foundedYear}–{e.deathYear}</div>
                <div className="epitaph-text">{zh ? e.textZh : e.textEn}</div>
              </div>
            </button>
          ))}
        </>
      )}

      {faithEvents.length > 0 && (
        <>
          <div className="section-title">{t('faith.chronicle')}</div>
          {faithEvents.map((e) => (
            <div key={e.id} className="event-item importance-6">
              <span className="event-year">{t('tl.year', { y: e.year.toLocaleString('en-US') })}</span>
              <span className="event-title">
                {(() => {
                  const Icon = EVENT_ICONS[e.type] ?? Church;
                  return <Icon size={13} className="event-icon" />;
                })()}{' '}
                {zh && e.titleZh ? e.titleZh : e.title}
              </span>
              <span className="event-desc">{zh && e.descriptionZh ? e.descriptionZh : e.description}</span>
            </div>
          ))}
        </>
      )}

      <div className="section-title">{t('faith.doctrines')}</div>
      <div className="doctrine-legend">
        {DOCTRINES.map((d) => (
          <div key={d.id} className="doctrine-item" title={zh ? d.creedZh : d.creedEn}>
            <span>
              {(() => {
                const Icon = DOCTRINE_ICONS[d.id] ?? Church;
                return <Icon size={15} />;
              })()}
            </span>
            <div>
              <b>{zh ? d.nameZh : d.nameEn}</b>
              <div className="muted small">「{zh ? d.creedZh : d.creedEn}」</div>
            </div>
          </div>
        ))}
      </div>
      <p className="hint">{t('faith.hint', { pop: fmtNum(alive.reduce((s, c) => s + c.population, 0)) })}</p>
    </div>
  );
}
