// The main simulator layout: top bar, sidebar, map, controls, inspector.
import { useCallback, useEffect, useRef } from 'react';
import {
  BookOpen,
  Clapperboard,
  Download,
  Home,
  Languages,
  Trophy,
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
import { GodToolbar } from './GodToolbar';
import { EventBanner } from './EventBanner';
import { AchievementsPanel } from './AchievementsPanel';
import { checkAchievements, loadUnlocked } from '../utils/achievements';
import { getScenario } from '../utils/scenarios';
import { ScenarioHud } from './ScenarioHud';
import { configToShareUrl, exportConfig, importConfig } from '../utils/serialization';
import { fmtNum } from '../utils/format';
import { useI18nStore, useT } from '../i18n';
import { useLang } from '../i18n';
import { STAT_ICONS } from './icons';

const MAP_MODES: MapMode[] = ['political', 'night', 'population', 'terrain', 'resources', 'technology', 'economy', 'military', 'culture'];

export function SimulatorShell(): JSX.Element {
  const universe = useActiveUniverse();
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const setLang = useI18nStore((s) => s.setLang);
  const setScreen = useSimulatorStore((s) => s.setScreen);
  const mapMode = useSimulatorStore((s) => s.mapMode);
  const setMapMode = useSimulatorStore((s) => s.setMapMode);
  const sidebarOpen = useSimulatorStore((s) => s.sidebarOpen);
  const setSidebarOpen = useSimulatorStore((s) => s.setSidebarOpen);
  const setShowSummary = useSimulatorStore((s) => s.setShowSummary);
  const setShowAchievements = useSimulatorStore((s) => s.setShowAchievements);
  const cinema = useSimulatorStore((s) => s.cinema);
  const setCinema = useSimulatorStore((s) => s.setCinema);
  const showToast = useSimulatorStore((s) => s.showToast);
  const uiLang = useLang();
  const unlockedRef = useRef<Set<string> | null>(null);
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
      } else if (e.key === 'Escape' && useSimulatorStore.getState().cinema) {
        setCinema(false);
      }
    },
    [universe?.running, play, pause, step, setCinema],
  );
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  // Scenario win/fail checks.
  const setScenarioOutcome = useSimulatorStore((s) => s.setScenarioOutcome);
  useEffect(() => {
    if (!universe?.snapshot || !universe.scenario || universe.scenario.outcome) return;
    const def = getScenario(universe.scenario.id);
    if (!def) return;
    const outcome = def.check(universe.snapshot, universe.events);
    if (outcome) setScenarioOutcome(universe.id, outcome);
  }, [universe?.snapshot, universe?.events, universe?.scenario, universe?.id, setScenarioOutcome]);

  // Achievement checks on every snapshot.
  useEffect(() => {
    if (!universe?.snapshot) return;
    if (!unlockedRef.current) unlockedRef.current = loadUnlocked();
    const fresh = checkAchievements(universe.snapshot, universe.events, unlockedRef.current);
    if (fresh.length > 0) {
      const names = fresh.map((a) => (uiLang === 'zh' ? a.zh.name : a.en.name)).join(' · ');
      showToast(`${t('ach.unlocked')}: ${names}`);
    }
  }, [universe?.snapshot, universe?.events, uiLang, showToast, t]);

  if (!universe) {
    return (
      <div className="sim-empty">
        <p>{t('misc.noUniverse')}</p>
        <button className="btn btn-primary" onClick={() => setScreen('landing')}>{t('misc.backToStart')}</button>
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
      showToast(t('toast.saved', { name }));
    } catch {
      showToast(t('toast.saveFailed'));
    }
  };

  const loadWorld = (): void => {
    try {
      const saves = JSON.parse(localStorage.getItem('civsim.saves') ?? '[]') as { name: string; config: unknown }[];
      if (saves.length === 0) {
        showToast(t('toast.noSaves'));
        return;
      }
      const names = saves.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
      const pick = window.prompt(t('toast.loadPrompt', { list: names }), '1');
      if (!pick) return;
      const idx = parseInt(pick, 10) - 1;
      const save = saves[idx];
      if (!save) return;
      const cfg = importConfig(JSON.stringify(save.config));
      createUniverse(cfg, `Loaded ${String.fromCharCode(65 + universes.length)}`, true);
      showToast(t('toast.loaded', { name: save.name }));
    } catch (err) {
      showToast(t('toast.loadFailed', { err: err instanceof Error ? err.message : 'corrupt save' }));
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
          showToast(t('toast.imported'));
        } catch (err) {
          showToast(t('setup.importFailed', { err: err instanceof Error ? err.message : 'invalid file' }));
        }
      });
    };
    input.click();
  };

  const shareLink = (): void => {
    const url = configToShareUrl(universe.config);
    navigator.clipboard
      .writeText(url)
      .then(() => showToast(t('toast.shareCopied')))
      .catch(() => window.prompt(t('toast.sharePrompt'), url));
  };

  return (
    <div className={`sim-root ${cinema ? 'cinema-mode' : ''}`}>
      <header className="topbar">
        <button className="icon-btn" onClick={() => setScreen('landing')} title={t('top.home')}>
          <Home size={16} />
        </button>
        <span className="topbar-title">Civilization Simulator</span>
        <span className="topbar-year">
          {t('top.year')} <b>{(snapshot?.year ?? 0).toLocaleString('en-US')}</b>
        </span>
        <span className={`run-dot ${universe.running ? 'run-on' : ''}`} />
        <span className="muted small">{universe.running ? t('top.running') : t('top.paused')}</span>

        <div className="topbar-stats">
          <span className="stat-chip" title={t('top.population')}><STAT_ICONS.population size={12} /> {fmtNum(totalPop)}</span>
          <span className="stat-chip" title={t('top.civs')}><STAT_ICONS.civs size={12} /> {alive.length}</span>
          <span className="stat-chip" title={t('top.cities')}><STAT_ICONS.cities size={12} /> {snapshot?.cities.length ?? 0}</span>
          <span className="stat-chip" title={t('top.wars')}><STAT_ICONS.wars size={12} /> {activeWars}</span>
          <span className="stat-chip" title={t('top.alliances')}><STAT_ICONS.alliances size={12} /> {allianceCount}</span>
          <span className="stat-chip" title={t('top.tech')}><STAT_ICONS.tech size={12} /> {maxTech}/11</span>
        </div>

        <div className="topbar-actions">
          {universes.length > 1 && (
            <select
              className="input input-sm"
              value={universe.id}
              onChange={(e) => setActiveUniverse(e.target.value)}
              title={t('top.universe')}
            >
              {universes.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          )}
          <button
            className={`icon-btn ${cinema ? 'icon-active' : ''}`}
            onClick={() => {
              setCinema(!cinema);
              if (!cinema) showToast(t('cinema.on'));
            }}
            title={t('cinema.title')}
          >
            <Clapperboard size={15} />
          </button>
          <button className="icon-btn lang-btn" onClick={() => setLang(lang === 'en' ? 'zh' : 'en')} title="Language / 语言">
            <Languages size={14} />
            <span className="lang-label">{lang === 'en' ? '中' : 'EN'}</span>
          </button>
          <button className="icon-btn" onClick={() => setShowAchievements(true)} title={t('ach.title')}>
            <Trophy size={15} />
          </button>
          <button className="icon-btn" onClick={() => setShowSummary(true)} title={t('top.summary')}>
            <BookOpen size={15} />
          </button>
          <button className="icon-btn" onClick={saveWorld} title={t('top.save')}>
            <Save size={15} />
          </button>
          <button className="icon-btn" onClick={loadWorld} title={t('top.load')}>
            <Upload size={15} />
          </button>
          <button className="icon-btn" onClick={exportJson} title={t('top.export')}>
            <Download size={15} />
          </button>
          <button className="icon-btn" onClick={importJson} title={t('top.importJson')}>
            <Upload size={15} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <button className="icon-btn" onClick={shareLink} title={t('top.share')}>
            <Link2 size={15} />
          </button>
        </div>
      </header>

      <div className="sim-main">
        <aside className={`sidebar ${sidebarOpen ? '' : 'sidebar-closed'}`}>
          <button className="icon-btn sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} title={t('misc.toggleSidebar')}>
            {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </button>
          {sidebarOpen && (
            <>
              <div className="section-title">{t('side.mapMode')}</div>
              <div className="mode-list">
                {MAP_MODES.map((m) => (
                  <button
                    key={m}
                    className={`mode-btn ${mapMode === m ? 'mode-active' : ''}`}
                    onClick={() => setMapMode(m)}
                  >
                    {t(`mode.${m}`)}
                  </button>
                ))}
              </div>
              <div className="section-title">{t('side.world')}</div>
              <div className="kv small"><span>{t('side.seed')}</span><b>{universe.config.seed}</b></div>
              <div className="kv small"><span>{t('side.size')}</span><b>{universe.config.width}×{universe.config.height}</b></div>
              <div className="kv small"><span>{t('side.rules')}</span><b>{universe.config.rules.length}</b></div>
              <div className="kv small"><span>{t('side.universe')}</span><b>{universe.name}</b></div>
            </>
          )}
        </aside>

        <div className="canvas-column">
          <WorldCanvas universe={universe} />
          <GodToolbar />
          <EventBanner universe={universe} />
          <ScenarioHud universe={universe} />
          <SimulationControls universe={universe} />
        </div>

        <Inspector universe={universe} />
      </div>

      <HistorySummary universe={universe} />
      <AchievementsPanel />
    </div>
  );
}
