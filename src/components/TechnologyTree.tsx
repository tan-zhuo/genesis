// Technology tree: linear ladder with per-civ progress.
import { Universe } from '../state/simulatorStore';
import { TECHNOLOGIES } from '../simulation/Technology';
import { useSimulatorStore } from '../state/simulatorStore';
import { useLang, useT } from '../i18n';

export function TechnologyTree({ universe }: { universe: Universe }): JSX.Element {
  const snapshot = universe.snapshot;
  const selectedCivId = useSimulatorStore((s) => s.selectedCivId);
  const selectCiv = useSimulatorStore((s) => s.selectCiv);
  const t = useT();
  const lang = useLang();
  if (!snapshot) return <div className="empty-note">{t('tech.waiting')}</div>;

  const civs = snapshot.civs.filter((c) => c.alive);
  const focus = civs.find((c) => c.id === selectedCivId) ?? null;

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

      <div className="tech-ladder">
        {TECHNOLOGIES.map((tech, i) => {
          const holders = civs.filter((c) => c.researchedTechs.includes(tech.id));
          const researched = focus ? focus.researchedTechs.includes(tech.id) : holders.length > 0;
          const isNext = focus && !researched && (i === 0 || focus.researchedTechs.includes(TECHNOLOGIES[i - 1]?.id));
          const progress = isNext && focus ? Math.min(1, focus.researchProgress / tech.cost) : 0;
          return (
            <div key={tech.id} className={`tech-node ${researched ? 'tech-done' : ''} ${isNext ? 'tech-next' : ''}`}>
              <div className="tech-node-head">
                <span className="tech-name">{lang === 'zh' ? tech.nameZh : tech.name}</span>
                <span className="tech-cost muted">{tech.cost.toLocaleString('en-US')} 🔬</span>
              </div>
              <div className="tech-blurb">{lang === 'zh' ? tech.blurbZh : tech.blurb}</div>
              {isNext && focus && (
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
              {i < TECHNOLOGIES.length - 1 && <div className="tech-arrow">↓</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
