// Playback controls: pause/play/step/reset/replay, speeds, run-to-year.
import { useState } from 'react';
import { Pause, Play, StepForward, RotateCcw, History, FastForward } from 'lucide-react';
import { Universe, useSimulatorStore } from '../state/simulatorStore';

const SPEEDS = [1, 5, 20, 100, 1000, 10000];

export function SimulationControls({ universe }: { universe: Universe }): JSX.Element {
  const play = useSimulatorStore((s) => s.play);
  const pause = useSimulatorStore((s) => s.pause);
  const step = useSimulatorStore((s) => s.step);
  const reset = useSimulatorStore((s) => s.reset);
  const replay = useSimulatorStore((s) => s.replay);
  const setSpeed = useSimulatorStore((s) => s.setSpeed);
  const runToYear = useSimulatorStore((s) => s.runToYear);
  const showToast = useSimulatorStore((s) => s.showToast);
  const [runTo, setRunTo] = useState('10000');

  const year = universe.snapshot?.year ?? 0;
  const running = universe.running;

  const doRunTo = (): void => {
    const target = parseInt(runTo, 10);
    if (!Number.isFinite(target) || target <= year) {
      showToast(`Target year must be greater than ${year}.`);
      return;
    }
    runToYear(Math.min(target, 100000));
  };

  return (
    <div className="controls-bar" data-tutorial="controls">
      <div className="controls-left">
        <button className="ctrl-btn ctrl-primary" onClick={running ? pause : play} title={running ? 'Pause' : 'Play'}>
          {running ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button className="ctrl-btn" onClick={step} title="Step one year" disabled={running}>
          <StepForward size={15} />
        </button>
        <button
          className="ctrl-btn"
          onClick={() => {
            if (window.confirm('Reset the world to Year 0? History will be recomputed from the same seed.')) reset();
          }}
          title="Reset to year 0"
        >
          <RotateCcw size={15} />
        </button>
        <button
          className="ctrl-btn"
          onClick={replay}
          disabled={year === 0 || universe.replaying}
          title="Replay: re-run from year 0 to now — deterministically identical"
        >
          <History size={15} />
        </button>
        {universe.replaying && <span className="replay-note">replaying…</span>}
      </div>

      <div className="speed-group">
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={`speed-btn ${universe.speed === s ? 'speed-active' : ''}`}
            onClick={() => setSpeed(s)}
          >
            {s >= 1000 ? `${s / 1000}k` : s}x
          </button>
        ))}
      </div>

      <div className="runto-group">
        <span className="muted small">Run to</span>
        <input
          className="input input-sm input-num"
          value={runTo}
          onChange={(e) => setRunTo(e.target.value.replace(/[^0-9]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && doRunTo()}
        />
        <button className="ctrl-btn" onClick={doRunTo} title="Run to year, then pause">
          <FastForward size={15} />
        </button>
        {universe.runToTarget !== null && (
          <span className="runto-progress">→ {universe.runToTarget.toLocaleString('en-US')}</span>
        )}
      </div>

      <div className="controls-year">
        Year <b>{year.toLocaleString('en-US')}</b>
      </div>
    </div>
  );
}
