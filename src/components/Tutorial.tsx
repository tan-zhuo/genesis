// 4-step first-run tutorial: lightweight spotlight tooltips.
import { useEffect, useState } from 'react';
import { useSimulatorStore } from '../state/simulatorStore';

const STEPS = [
  { target: 'world', title: '1 · Create a World', text: 'Pick a seed and shape the terrain. The same seed always creates the same world.' },
  { target: 'civs', title: '2 · Create Civilizations', text: 'Add 2–20 peoples and tune their personalities — aggression, trade, science, migration…' },
  { target: 'rules', title: '3 · Define Rules', text: 'Add IF/THEN rules that nudge how every civilization behaves, or load a template.' },
  { target: 'start', title: '4 · Run the Simulation', text: 'Press start, accelerate time, and watch thousands of years of history emerge.' },
];

export function Tutorial(): JSX.Element | null {
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
      <div className="tutorial-title">{s.title}</div>
      <div className="tutorial-text">{s.text}</div>
      <div className="tutorial-actions">
        <button className="btn btn-ghost btn-sm" onClick={finish}>Skip</button>
        <span className="muted small">{step + 1}/{STEPS.length}</span>
        <button className="btn btn-primary btn-sm" onClick={() => (step === STEPS.length - 1 ? finish() : setStep(step + 1))}>
          {step === STEPS.length - 1 ? 'Done' : 'Next'}
        </button>
      </div>
    </div>
  );
}
