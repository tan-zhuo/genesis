// The technology web: 37 real technologies grouped by era tier.
// Pick a civilization to see its personal path — done / researching / available
// / locked. Different geographies and cultures grow visibly different trees.
import { Universe } from '../state/simulatorStore';
import { availableTechs, techCost, TECHNOLOGIES, TECH_UNLOCKS, Technology } from '../simulation/Technology';
import { useSimulatorStore } from '../state/simulatorStore';
import { useLang, useT } from '../i18n';
import { FlaskConical } from 'lucide-react';

const TIER_KEYS = ['primitive', 'agrarian', 'classical', 'classical', 'medieval', 'renaissance', 'industrial', 'modern', 'information', 'information', 'stellar'];

export function TechnologyTree({ universe }: { universe: Universe }): JSX.Element {
  const snapshot = universe.snapshot;
  const selectedCivId = useSimulatorStore((s) => s.selectedCivId);
  const selectCiv = useSimulatorStore((s) => s.selectCiv);
  const t = useT();
  const lang = useLang();
  if (!snapshot) return <div className="empty-note">{t('tech.waiting')}</div>;

  const civs = snapshot.civs.filter((c) => c.alive);
  const focus = civs.find((c) => c.id === selectedCivId) ?? null;
  const focusAvailable = focus ? new Set(availableTechs(focus.researchedTechs).map((x) => x.id)) : null;

  const tiers = new Map<number, Technology[]>();
  for (const tech of TECHNOLOGIES) {
    const list = tiers.get(tech.tier) ?? [];
    list.push(tech);
    tiers.set(tech.tier, list);
  }

  const reqNames = (tech: Technology): string =>
    tech.requirements
      .map((r) => {
        const rt = TECHNOLOGIES.find((x) => x.id === r);
        return rt ? (lang === 'zh' ? rt.nameZh : rt.name) : r;
      })
      .join(' + ');

  return (
    <div className="tech-tree">
      <div className="tech-civ-select">
        <button className={`chip ${!focus ? 'chip-active' : ''}`} onClick={() => selectCiv(null)}>{t('tech.all')}</button>
        {civs.map((c) => (
          <button
            key={c.id}
            className={`chip ${focus?.id === c.id ? 'chip-active' : ''}`}
            onClick={() => selectCiv(c.id)}
          >
            <span className="dot" style={{ background: c.color }} /> {c.name}
          </button>
        ))}
      </div>
      {focus && (
        <p className="hint">
          {t('tech.pathHint', { name: focus.name, n: focus.researchedTechs.length, total: TECHNOLOGIES.length })}
        </p>
      )}

      {[...tiers.entries()].sort((a, b) => a[0] - b[0]).map(([tier, techs]) => (
        <div key={tier} className="tech-tier">
          <div className="tech-tier-label">{t(`era.${TIER_KEYS[tier] ?? 'information'}`)}</div>
          <div className="tech-tier-grid">
            {techs.map((tech) => {
              const holders = civs.filter((c) => c.researchedTechs.includes(tech.id));
              const done = focus ? focus.researchedTechs.includes(tech.id) : holders.length > 0;
              const current = focus?.currentResearch === tech.id;
              const available = focus ? focusAvailable!.has(tech.id) : false;
              const progress = current && focus ? Math.min(1, focus.researchProgress / techCost(tech)) : 0;
              return (
                <div
                  key={tech.id}
                  className={`tech-node ${done ? 'tech-done' : ''} ${current ? 'tech-next' : ''} ${focus && !done && !current && !available ? 'tech-locked' : ''}`}
                  title={`${lang === 'zh' ? tech.nameZh : tech.name} · ${techCost(tech).toLocaleString('en-US')}${tech.requirements.length ? `\n${t('tech.requires')}: ${reqNames(tech)}` : ''}`}
                >
                  <div className="tech-node-head">
                    <span className="tech-name">{lang === 'zh' ? tech.nameZh : tech.name}</span>
                    <span className="tech-cost muted">
                      {techCost(tech) >= 1000 ? `${Math.round(techCost(tech) / 1000)}k` : techCost(tech)}{' '}
                      <FlaskConical size={10} className="inline-icon" />
                    </span>
                  </div>
                  {tech.requirements.length > 0 && (
                    <div className="tech-blurb">{reqNames(tech)}</div>
                  )}
                  {TECH_UNLOCKS[tech.id] && (
                    <div className="tech-unlock">
                      {lang === 'zh' ? TECH_UNLOCKS[tech.id].zh : TECH_UNLOCKS[tech.id].en}
                    </div>
                  )}
                  {current && focus && (
                    <div className="tech-progress">
                      <div className="tech-progress-fill" style={{ width: `${progress * 100}%`, background: focus.color }} />
                    </div>
                  )}
                  {!focus && holders.length > 0 && (
                    <div className="tech-holders">
                      {holders.map((h) => (
                        <span key={h.id} className="dot" style={{ background: h.color }} title={h.name} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
