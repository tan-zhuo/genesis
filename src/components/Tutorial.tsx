// 4-step first-run tutorial: lightweight spotlight tooltips.
import { useEffect, useState } from 'react';
import { useSimulatorStore } from '../state/simulatorStore';
import { useT } from '../i18n';

const STEPS = [
  { target: 'world', key: '1' },
  { target: 'civs', key: '2' },
  { target: 'rules', key: '3' },
  { target: 'start', key: '4' },
];

export function Tutorial(): JSX.Element | null {
  const t = useT();
  const step = useSimulatorStore((s) => s.tutorialStep);
  const setStep = useSimulatorStore((s) => s.setTutorialStep);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (step < 0 || step >= STEPS.length) return;
    const el = document.querySelector(`[data-tutorial="${STEPS[step].target}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      setPos({ top: r.bottom + 10, left: Math.max(12, Math.min(r.left, window.innerWidth - 320)) });
      el.classList.add('tutorial-highlight');
      return () => el.classList.remove('tutorial-highlight');
    }
    setPos(null);
  }, [step]);

  if (step < 0 || step >= STEPS.length) return null;
  const s = STEPS[step];

  const finish = (): void => {
    localStorage.setItem('civsim.tutorialDone', '1');
    setStep(-1);
  };

  return (
    <div className="tutorial-card" style={pos ? { top: pos.top, left: pos.left } : { bottom: 24, right: 24 }}>
      <div className="tutorial-title">{t(`tut.${s.key}.title`)}</div>
      <div className="tutorial-text">{t(`tut.${s.key}.text`)}</div>
      <div className="tutorial-actions">
        <button className="btn btn-ghost btn-sm" onClick={finish}>{t('tut.skip')}</button>
        <span className="muted small">{step + 1}/{STEPS.length}</span>
        <button className="btn btn-primary btn-sm" onClick={() => (step === STEPS.length - 1 ? finish() : setStep(step + 1))}>
          {step === STEPS.length - 1 ? t('tut.done') : t('tut.next')}
        </button>
      </div>
    </div>
  );
}
