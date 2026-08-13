// Achievements modal: what history have you witnessed?
import { X } from 'lucide-react';
import { useSimulatorStore } from '../state/simulatorStore';
import { ACHIEVEMENTS, loadUnlocked } from '../utils/achievements';
import { useLang, useT } from '../i18n';

export function AchievementsPanel(): JSX.Element | null {
  const show = useSimulatorStore((s) => s.showAchievements);
  const setShow = useSimulatorStore((s) => s.setShowAchievements);
  const lang = useLang();
  const t = useT();
  if (!show) return null;
  const unlocked = loadUnlocked();

  return (
    <div className="modal-overlay" onClick={() => setShow(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t('ach.title')} · {unlocked.size}/{ACHIEVEMENTS.length}</h2>
          <button className="icon-btn" onClick={() => setShow(false)} title={t('sum.close')}>
            <X size={16} />
          </button>
        </div>
        <div className="ach-grid">
          {ACHIEVEMENTS.map((a) => {
            const has = unlocked.has(a.id);
            const text = lang === 'zh' ? a.zh : a.en;
            return (
              <div key={a.id} className={`ach-card ${has ? 'ach-unlocked' : ''}`}>
                <span className="ach-icon">{has ? a.icon : '🔒'}</span>
                <div>
                  <div className="ach-name">{text.name}</div>
                  <div className="ach-desc">{text.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
