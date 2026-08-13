// Landing page: cinematic entry with a slowly-drifting world-lights canvas.
import { useEffect, useRef } from 'react';
import { Globe2, Compass, ChevronRight } from 'lucide-react';
import { useSimulatorStore } from '../state/simulatorStore';
import { WORLD_PRESETS } from '../simulation/presets';

export function Landing(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const setScreen = useSimulatorStore((s) => s.setScreen);
  const createUniverse = useSimulatorStore((s) => s.createUniverse);
  const setTutorialStep = useSimulatorStore((s) => s.setTutorialStep);

  // Ambient background: drifting "civilization lights". Pure decoration —
  // Math.random is fine here, it never touches the simulation.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const dots: { x: number; y: number; r: number; p: number; s: number }[] = [];
    const resize = (): void => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    for (let i = 0; i < 140; i++) {
      dots.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: 0.6 + Math.random() * 1.8,
        p: Math.random() * Math.PI * 2,
        s: 0.2 + Math.random() * 0.5,
      });
    }
    let t = 0;
    const draw = (): void => {
      t += 0.008;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const d of dots) {
        const alpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * d.s * 4 + d.p));
        const drift = Math.sin(t * d.s + d.p) * 6;
        ctx.beginPath();
        ctx.arc(d.x + drift, d.y + Math.cos(t * d.s * 0.7 + d.p) * 4, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(245, 180, 80, ${alpha * 0.7})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const startExample = (): void => {
    const preset = WORLD_PRESETS[0];
    createUniverse(preset.config(), undefined, true);
    setScreen('simulator');
  };

  const startPreset = (id: string): void => {
    const preset = WORLD_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    createUniverse(preset.config(), undefined, true);
    setScreen('simulator');
  };

  const startCreate = (): void => {
    if (localStorage.getItem('civsim.tutorialDone') !== '1') {
      setTutorialStep(0);
    }
    setScreen('setup');
  };

  return (
    <div className="landing">
      <canvas ref={canvasRef} className="landing-canvas" />
      <div className="landing-content">
        <div className="landing-brand">CIVILIZATION<br />SIMULATOR</div>
        <p className="landing-tagline">Build the rules. Run the world. Watch history emerge.</p>
        <p className="landing-sub">
          Create a world. Define its rules.<br />Let history unfold.
        </p>
        <div className="landing-actions">
          <button className="btn btn-primary btn-lg" onClick={startCreate}>
            <Globe2 size={18} /> Create New World
          </button>
          <button className="btn btn-ghost btn-lg" onClick={startExample}>
            <Compass size={18} /> Explore Example World
          </button>
        </div>
        <div className="landing-presets">
          <div className="landing-presets-label">or begin from a preset</div>
          <div className="preset-row">
            {WORLD_PRESETS.slice(1).map((p) => (
              <button key={p.id} className="preset-card" onClick={() => startPreset(p.id)} title={p.description}>
                <span>{p.name}</span>
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
