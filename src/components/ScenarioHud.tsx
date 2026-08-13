// Scenario goal chip over the map + win/fail settlement modal.
import { Universe, useSimulatorStore } from '../state/simulatorStore';
import { getScenario } from '../utils/scenarios';
import { useLang, useT } from '../i18n';
import { fmtNum } from '../utils/format';

export function ScenarioHud({ universe }: { universe: Universe }): JSX.Element | null {
  const t = useT();
  const lang = useLang();
  const ackScenario = useSimulatorStore((s) => s.ackScenario);
  const createUniverse = useSimulatorStore((s) => s.createUniverse);
  const pause = useSimulatorStore((s) => s.pause);

  const sc = universe.scenario;
  if (!sc) return null;
  const def = getScenario(sc.id);
  if (!def) return null;
  const text = lang === 'zh' ? def.zh : def.en;
  const snapshot = universe.snapshot;
  const interventions = snapshot ? snapshot.interventions.filter((iv) => iv.year <= snapshot.year).length : 0;

  return (
    <>
      <div className={`scenario-chip ${sc.outcome === 'win' ? 'scenario-win' : sc.outcome === 'fail' ? 'scenario-fail' : ''}`} title={text.desc}>
        <span>{def.icon}</span>
        <span className="scenario-chip-name">{text.name}</span>
        {sc.outcome === 'win' && <span>✓</span>}
        {sc.outcome === 'fail' && <span>✕</span>}
      </div>

      {sc.outcome && !sc.acknowledged && snapshot && (
        <div className="modal-overlay">
          <div className="modal scenario-modal">
            <div className={`scenario-verdict ${sc.outcome === 'win' ? 'verdict-win' : 'verdict-fail'}`}>
              {def.icon} {sc.outcome === 'win' ? t('sc.win') : t('sc.fail')}
            </div>
            <h2 className="scenario-modal-name">{text.name}</h2>
            <p className="scenario-modal-desc">{text.desc}</p>
            <div className="summary-headline">
              <div className="big-stat"><span className="big-stat-value">{snapshot.year.toLocaleString('en-US')}</span><span className="big-stat-label">{t('cmp.year')}</span></div>
              <div className="big-stat"><span className="big-stat-value">{fmtNum(snapshot.civs.filter((c) => c.alive).reduce((sum, c) => sum + c.population, 0))}</span><span className="big-stat-label">{t('ov.population')}</span></div>
              <div className="big-stat"><span className="big-stat-value">{snapshot.civs.filter((c) => c.alive).length}</span><span className="big-stat-label">{t('ov.civilizations')}</span></div>
              <div className="big-stat"><span className="big-stat-value">{interventions}</span><span className="big-stat-label">{t('sc.interventions')}</span></div>
            </div>
            <div className="scenario-modal-actions">
              <button
                className="btn btn-primary"
                onClick={() => {
                  createUniverse(def.config(), undefined, true, def.id);
                }}
              >
                {t('sc.retry')}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  ackScenario(universe.id);
                  pause();
                }}
              >
                {t('sc.keepWatching')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
