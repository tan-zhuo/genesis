// Civilization detail: stats, history charts, relations.
import { ArrowLeft, Bot, Crosshair, Skull, Star } from 'lucide-react';
import { Universe, useSimulatorStore } from '../state/simulatorStore';
import { CivSummary } from '../simulation/types';
import { techEraKeyOf } from '../simulation/Technology';
import { useLang, useT } from '../i18n';
import { EVENT_ICONS } from './icons';
import { fmtNum, fmtPct } from '../utils/format';
import { LineChart } from './LineChart';
import { civProfile } from './CivEditor';
import { RESOURCE_ICONS } from './icons';

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
  const t = useT();
  const lang = useLang();
  const selectCiv = useSimulatorStore((s) => s.selectCiv);
  const focusOn = useSimulatorStore((s) => s.focusOn);
  const followedCivId = useSimulatorStore((s) => s.followedCivId);
  const setFollowedCiv = useSimulatorStore((s) => s.setFollowedCiv);
  const setAiAnalystCiv = useSimulatorStore((s) => s.setAiAnalystCiv);
  const following = followedCivId === civ.id;
  const snapshot = universe.snapshot;
  const history = snapshot?.civHistories[civ.id];
  const chronicle = universe.events.filter((e) => e.civilizationIds.includes(civ.id)).slice(-30).reverse();

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
        <button className="icon-btn" onClick={() => selectCiv(null)} title={t('nat.back')}>
          <ArrowLeft size={14} />
        </button>
        <span className="civ-panel-name" style={{ color: civ.color }}>{civ.name.toUpperCase()}</span>
        {!civ.alive && civ.ascended && (
          <span className="tag tag-ascended">{t('nat.ascended')} {civ.deathYear !== null ? `· ${civ.deathYear}` : ''}</span>
        )}
        {!civ.alive && !civ.ascended && (
          <span className="tag tag-dead"><Skull size={11} /> {t('nat.extinct')} {civ.deathYear !== null ? `· ${civ.deathYear}` : ''}</span>
        )}
        <button
          className={`icon-btn ${following ? 'icon-active' : ''}`}
          onClick={() => setFollowedCiv(following ? null : civ.id)}
          title={following ? t('follow.stop') : t('follow.start')}
        >
          <Star size={14} fill={following ? 'currentColor' : 'none'} />
        </button>
        <button className="icon-btn" onClick={() => focusOn(Math.round(civ.cx), Math.round(civ.cy))} title={t('nat.locate')} disabled={!civ.alive}>
          <Crosshair size={14} />
        </button>
        <button className="icon-btn" onClick={() => setAiAnalystCiv(civ.id)} title={t('ai.open')}>
          <Bot size={14} />
        </button>
      </div>

      <div className="profile-tags">
        {civProfile(civ.traits).map((tag) => (
          <span className="tag" key={tag}>{t(`tag.${tag}`)}</span>
        ))}
      </div>

      <div className="big-stats">
        <div className="big-stat"><span className="big-stat-value">{fmtNum(civ.population)}</span><span className="big-stat-label">{t('ov.population')}</span></div>
        <div className="big-stat"><span className="big-stat-value">{fmtPct(civ.territoryPct)}</span><span className="big-stat-label">{t('nat.territory')}</span></div>
        <div className="big-stat"><span className="big-stat-value">{civ.cityCount}</span><span className="big-stat-label">{t('ov.cities')}</span></div>
        <div className="big-stat"><span className="big-stat-value">{t(`era.${techEraKeyOf(civ.researchedTechs)}`)}</span><span className="big-stat-label">{t('nat.era')}</span></div>
      </div>

      <div className="stat-bars">
        <StatBar label={t('nat.economy')} value={civ.economy} />
        <StatBar label={t('nat.military')} value={Math.min(100, civ.military)} color="#e5484d" />
        <StatBar label={t('nat.stability')} value={civ.stability} color="#30a46c" />
        <StatBar label={t('nat.happiness')} value={civ.happiness} color="#f5a524" />
        <StatBar label={t('nat.culture')} value={civ.culture} color="#8e4ec6" />
      </div>

      <div className="resource-row">
        <span><RESOURCE_ICONS.food size={12} /> {fmtNum(civ.food)}</span>
        <span><RESOURCE_ICONS.wood size={12} /> {fmtNum(civ.wood)}</span>
        <span><RESOURCE_ICONS.stone size={12} /> {fmtNum(civ.stone)}</span>
        <span><RESOURCE_ICONS.iron size={12} /> {fmtNum(civ.iron)}</span>
        <span><RESOURCE_ICONS.gold size={12} /> {fmtNum(civ.gold)}</span>
      </div>

      {history && history.years.length > 2 && (
        <>
          <LineChart title={t('nat.popHistory')} series={[{ label: civ.name, color: civ.color, xs: history.years, ys: history.population }]} />
          <LineChart title={t('nat.terrHistory')} series={[{ label: civ.name, color: civ.color, xs: history.years, ys: history.territory }]} />
          <LineChart title={t('nat.techHistory')} series={[{ label: civ.name, color: civ.color, xs: history.years, ys: history.technology }]} />
          <LineChart title={t('nat.ecoHistory')} series={[{ label: civ.name, color: civ.color, xs: history.years, ys: history.economy }]} />
        </>
      )}

      {chronicle.length > 0 && (
        <div className="civ-chronicle">
          <div className="section-title">{t('follow.chronicle', { name: civ.name })}</div>
          <div className="civ-chronicle-list">
            {chronicle.map((e) => {
              const Icon = EVENT_ICONS[e.type];
              return (
                <div key={e.id} className={`event-item importance-${Math.min(9, e.importance)}`}>
                  <span className="event-year">{t('tl.year', { y: e.year.toLocaleString('en-US') })}</span>
                  <span className="event-title">
                    {Icon && <Icon size={12} className="event-icon" />} {lang === 'zh' && e.titleZh ? e.titleZh : e.title}
                  </span>
                  <span className="event-desc">{lang === 'zh' && e.descriptionZh ? e.descriptionZh : e.description}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {relations.length > 0 && (
        <div className="relations-box">
          <div className="section-title">{t('nat.relations')}</div>
          {relations.map((r) => (
            <button className="relation-row" key={r.other.id} onClick={() => selectCiv(r.other.id)}>
              <span className="dot" style={{ background: r.other.color }} />
              <span className="relation-name">{r.other.name}</span>
              <span className={`relation-value ${r.value > 0 ? 'pos' : r.value < 0 ? 'neg' : ''}`}>
                {r.value > 0 ? '+' : ''}{Math.round(r.value)}
              </span>
              <span className={`relation-status status-${r.status}`}>{t(`status.${r.status}`)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
