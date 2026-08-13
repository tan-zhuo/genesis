// The main simulator layout: top bar, sidebar, map, controls, inspector.
import { useCallback, useEffect } from 'react';
import {
  BookOpen,
  Download,
  Home,
  Link2,
  PanelLeftClose,
  PanelLeftOpen,
  Save,
  Upload,
} from 'lucide-react';
import { MapMode, useActiveUniverse, useSimulatorStore } from '../state/simulatorStore';
import { WorldCanvas } from './WorldCanvas';
import { SimulationControls } from './SimulationControls';
import { Inspector } from './Inspector';
import { HistorySummary } from './HistorySummary';
import { configToShareUrl, exportConfig, importConfig } from '../utils/serialization';
import { fmtNum } from '../utils/format';

const MAP_MODES: { id: MapMode; label: string }[] = [
  { id: 'political', label: 'Political' },
  { id: 'population', label: 'Population' },
  { id: 'terrain', label: 'Terrain' },
  { id: 'resources', label: 'Resources' },
  { id: 'technology', label: 'Technology' },
  { id: 'economy', label: 'Economy' },
  { id: 'military', label: 'Military' },
  { id: 'culture', label: 'Culture' },
];

export function SimulatorShell(): JSX.Element {
  const universe = useActiveUniverse();
  const setScreen = useSimulatorStore((s) => s.setScreen);
  const mapMode = useSimulatorStore((s) => s.mapMode);
  const setMapMode = useSimulatorStore((s) => s.setMapMode);
  const sidebarOpen = useSimulatorStore((s) => s.sidebarOpen);
  const setSidebarOpen = useSimulatorStore((s) => s.setSidebarOpen);
  const setShowSummary = useSimulatorStore((s) => s.setShowSummary);
  const showToast = useSimulatorStore((s) => s.showToast);
  const universes = useSimulatorStore((s) => s.universes);
  const setActiveUniverse = useSimulatorStore((s) => s.setActiveUniverse);
  const createUniverse = useSimulatorStore((s) => s.createUniverse);

  // Keyboard shortcuts
  const play = useSimulatorStore((s) => s.play);
  const pause = useSimulatorStore((s) => s.pause);
  const step = useSimulatorStore((s) => s.step);
  const onKey = useCallback(
    (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === ' ') {
        e.preventDefault();
        if (universe?.running) pause();
        else play();
      } else if (e.key === '.') {
        step();
      }
    },
    [universe?.running, play, pause, step],
  );
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  if (!universe) {
    return (
      <div className="sim-empty">
        <p>No universe loaded.</p>
        <button className="btn btn-primary" onClick={() => setScreen('landing')}>Back to start</button>
      </div>
    );
  }

  const snapshot = universe.snapshot;
  const alive = snapshot?.civs.filter((c) => c.alive) ?? [];
  const totalPop = alive.reduce((s, c) => s + c.population, 0);
  const activeWars = snapshot?.wars.filter((w) => w.endYear === null).length ?? 0;
  const allianceCount = snapshot?.relations.filter((r) => r.status === 'alliance').length ?? 0;
  const maxTech = Math.max(0, ...alive.map((c) => c.technologyLevel));

  const saveWorld = (): void => {
    try {
      const saves = JSON.parse(localStorage.getItem('civsim.saves') ?? '[]') as { name: string; config: unknown; savedAt: string }[];
      const name = `${universe.name} · seed ${universe.config.seed} · year ${snapshot?.year ?? 0}`;
      saves.unshift({ name, config: universe.config, savedAt: new Date().toISOString() });
      localStorage.setItem('civsim.saves', JSON.stringify(saves.slice(0, 20)));
      showToast(`Saved "${name}" (browser storage).`);
    } catch {
      showToast('Save failed — browser storage unavailable.');
    }
  };

  const loadWorld = (): void => {
    try {
      const saves = JSON.parse(localStorage.getItem('civsim.saves') ?? '[]') as { name: string; config: unknown }[];
      if (saves.length === 0) {
        showToast('No saved worlds yet.');
        return;
      }
      const names = saves.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
      const pick = window.prompt(`Load which world?\n${names}\n\nEnter a number:`, '1');
      if (!pick) return;
      const idx = parseInt(pick, 10) - 1;
      const save = saves[idx];
      if (!save) return;
      const cfg = importConfig(JSON.stringify(save.config));
      createUniverse(cfg, `Loaded ${String.fromCharCode(65 + universes.length)}`, true);
      showToast(`Loaded "${save.name}".`);
    } catch (err) {
      showToast(`Load failed: ${err instanceof Error ? err.message : 'corrupt save'}`);
    }
  };

  const exportJson = (): void => {
    const blob = new Blob([exportConfig(universe.config)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `civsim-world-${universe.config.seed}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (): void => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      file.text().then((text) => {
        try {
          const cfg = importConfig(text);
          createUniverse(cfg, `Imported ${String.fromCharCode(65 + universes.length)}`, true);
          showToast('World imported — simulation starting.');
        } catch (err) {
          showToast(`Import failed: ${err instanceof Error ? err.message : 'invalid file'}`);
        }
      });
    };
    input.click();
  };

  const shareLink = (): void => {
    const url = configToShareUrl(universe.config);
    navigator.clipboard
      .writeText(url)
      .then(() => showToast('Share link copied — same seed, same history, anywhere.'))
      .catch(() => window.prompt('Copy this link:', url));
  };

  return (
    <div className="sim-root">
      <header className="topbar">
        <button className="icon-btn" onClick={() => setScreen('landing')} title="Home">
          <Home size={16} />
        </button>
        <span className="topbar-title">Civilization Simulator</span>
        <span className="topbar-year">
          Year <b>{(snapshot?.year ?? 0).toLocaleString('en-US')}</b>
        </span>
        <span className={`run-dot ${universe.running ? 'run-on' : ''}`} />
        <span className="muted small">{universe.running ? 'Running' : 'Paused'}</span>

        <div className="topbar-stats">
          <span className="stat-chip" title="World population">👥 {fmtNum(totalPop)}</span>
          <span className="stat-chip" title="Civilizations">🏳 {alive.length}</span>
          <span className="stat-chip" title="Cities">🏛 {snapshot?.cities.length ?? 0}</span>
          <span className="stat-chip" title="Active wars">⚔ {activeWars}</span>
          <span className="stat-chip" title="Alliances">🤝 {allianceCount}</span>
          <span className="stat-chip" title="Max technologies">💡 {maxTech}/11</span>
        </div>

        <div className="topbar-actions">
          {universes.length > 1 && (
            <select
              className="input input-sm"
              value={universe.id}
              onChange={(e) => setActiveUniverse(e.target.value)}
              title="Active universe"
            >
              {universes.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          )}
          <button className="icon-btn" onClick={() => setShowSummary(true)} title="World history summary">
            <BookOpen size={15} />
          </button>
          <button className="icon-btn" onClick={saveWorld} title="Save world (browser)">
            <Save size={15} />
          </button>
          <button className="icon-btn" onClick={loadWorld} title="Load saved world">
            <Upload size={15} />
          </button>
          <button className="icon-btn" onClick={exportJson} title="Export config JSON">
            <Download size={15} />
          </button>
          <button className="icon-btn" onClick={importJson} title="Import config JSON">
            <Upload size={15} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <button className="icon-btn" onClick={shareLink} title="Copy share link">
            <Link2 size={15} />
          </button>
        </div>
      </header>

      <div className="sim-main">
        <aside className={`sidebar ${sidebarOpen ? '' : 'sidebar-closed'}`}>
          <button className="icon-btn sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} title="Toggle sidebar">
            {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </button>
          {sidebarOpen && (
            <>
              <div className="section-title">Map mode</div>
              <div className="mode-list">
                {MAP_MODES.map((m) => (
                  <button
                    key={m.id}
                    className={`mode-btn ${mapMode === m.id ? 'mode-active' : ''}`}
                    onClick={() => setMapMode(m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="section-title">World</div>
              <div className="kv small"><span>Seed</span><b>{universe.config.seed}</b></div>
              <div className="kv small"><span>Size</span><b>{universe.config.width}×{universe.config.height}</b></div>
              <div className="kv small"><span>Rules</span><b>{universe.config.rules.length}</b></div>
              <div className="kv small"><span>Universe</span><b>{universe.name}</b></div>
            </>
          )}
        </aside>

        <div className="canvas-column">
          <WorldCanvas universe={universe} />
          <SimulationControls universe={universe} />
        </div>

        <Inspector universe={universe} />
      </div>

      <HistorySummary universe={universe} />
    </div>
  );
}
