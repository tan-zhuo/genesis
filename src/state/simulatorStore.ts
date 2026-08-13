// UI-side state: universes (each backed by its own worker), snapshots,
// selection, and view options. React components read this store; the
// simulation itself lives entirely in workers.
import { create } from 'zustand';
import { MapStatic, Snapshot, WorldConfig, WorldEvent } from '../simulation/types';
import { trimEvents } from '../simulation/World';
import { MainToWorker, WorkerToMain } from '../worker/protocol';

export type MapMode = 'political' | 'population' | 'terrain' | 'resources' | 'technology' | 'economy' | 'military' | 'culture';

export interface Universe {
  id: string;
  name: string;
  config: WorldConfig;
  worker: Worker;
  mapStatic: MapStatic | null;
  snapshot: Snapshot | null;
  events: WorldEvent[]; // accumulated event log (mirrors worker, capped)
  running: boolean;
  speed: number;
  replaying: boolean;
  runToTarget: number | null;
}

export type Screen = 'landing' | 'setup' | 'simulator';

export type InspectorTab = 'overview' | 'nations' | 'cities' | 'technology' | 'history' | 'rules' | 'stats' | 'compare';

interface SimulatorState {
  screen: Screen;
  universes: Universe[];
  activeUniverseId: string | null;
  compareUniverseId: string | null;

  mapMode: MapMode;
  selectedCivId: string | null;
  selectedCityId: string | null;
  selectedTile: { x: number; y: number } | null;
  focusTile: { x: number; y: number; nonce: number } | null;
  inspectorTab: InspectorTab;
  sidebarOpen: boolean;
  showSummary: boolean;
  tutorialStep: number; // -1 = off
  toast: string | null;

  setScreen: (s: Screen) => void;
  createUniverse: (config: WorldConfig, name?: string, autoplay?: boolean) => string;
  branchUniverse: (fromId: string, config: WorldConfig, name: string) => void;
  removeUniverse: (id: string) => void;
  setActiveUniverse: (id: string) => void;
  setCompareUniverse: (id: string | null) => void;

  play: () => void;
  pause: () => void;
  step: () => void;
  reset: () => void;
  replay: () => void;
  setSpeed: (yearsPerSecond: number) => void;
  runToYear: (year: number) => void;
  updateRules: (rules: WorldConfig['rules']) => void;

  setMapMode: (m: MapMode) => void;
  selectCiv: (id: string | null) => void;
  selectCity: (id: string | null) => void;
  selectTile: (t: { x: number; y: number } | null) => void;
  focusOn: (x: number, y: number) => void;
  setInspectorTab: (t: InspectorTab) => void;
  setSidebarOpen: (open: boolean) => void;
  setShowSummary: (show: boolean) => void;
  setTutorialStep: (step: number) => void;
  showToast: (msg: string) => void;
}

let universeCounter = 0;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function makeWorker(): Worker {
  return new Worker(new URL('../worker/simulation.worker.ts', import.meta.url), { type: 'module' });
}

export const useSimulatorStore = create<SimulatorState>((set, get) => {
  function activeUniverse(): Universe | null {
    const { universes, activeUniverseId } = get();
    return universes.find((u) => u.id === activeUniverseId) ?? null;
  }

  function sendToActive(msg: MainToWorker): void {
    const u = activeUniverse();
    if (u) u.worker.postMessage(msg);
  }

  function patchUniverse(id: string, patch: Partial<Universe>): void {
    set((state) => ({
      universes: state.universes.map((u) => (u.id === id ? { ...u, ...patch } : u)),
    }));
  }

  function attachWorker(universeId: string, worker: Worker): void {
    worker.onmessage = (e: MessageEvent<WorkerToMain>) => {
      const msg = e.data;
      const state = get();
      const u = state.universes.find((x) => x.id === universeId);
      if (!u) return;
      switch (msg.type) {
        case 'ready': {
          // Fresh world (init/reset/replay): clear the accumulated event log.
          patchUniverse(universeId, {
            mapStatic: msg.mapStatic,
            snapshot: msg.snapshot,
            events: [...msg.snapshot.events],
            running: false,
            runToTarget: null,
          });
          break;
        }
        case 'snapshot': {
          const events = u.events.concat(msg.snapshot.events);
          trimEvents(events);
          patchUniverse(universeId, {
            snapshot: msg.snapshot,
            events,
            running: msg.snapshot.running,
          });
          break;
        }
        case 'runToDone': {
          patchUniverse(universeId, { running: false, runToTarget: null, replaying: false });
          break;
        }
        case 'error': {
          console.error('[simulation worker]', msg.message);
          get().showToast(`Simulation error: ${msg.message}`);
          patchUniverse(universeId, { running: false, replaying: false, runToTarget: null });
          break;
        }
      }
    };
    worker.onerror = (e) => {
      console.error('Worker crashed', e);
      const u = get().universes.find((x) => x.id === universeId);
      if (!u) return;
      get().showToast('Simulation worker crashed — restarting it.');
      // Restart the worker and rebuild the world from config (deterministic).
      try {
        u.worker.terminate();
      } catch {
        /* ignore */
      }
      const fresh = makeWorker();
      attachWorker(universeId, fresh);
      patchUniverse(universeId, { worker: fresh, running: false, replaying: false, runToTarget: null });
      fresh.postMessage({ type: 'init', config: u.config } satisfies MainToWorker);
    };
  }

  return {
    screen: 'landing',
    universes: [],
    activeUniverseId: null,
    compareUniverseId: null,
    mapMode: 'political',
    selectedCivId: null,
    selectedCityId: null,
    selectedTile: null,
    focusTile: null,
    inspectorTab: 'overview',
    sidebarOpen: true,
    showSummary: false,
    tutorialStep: -1,
    toast: null,

    setScreen: (s) => set({ screen: s }),

    createUniverse: (config, name, autoplay = false) => {
      universeCounter++;
      const id = `universe-${universeCounter}`;
      const worker = makeWorker();
      const universe: Universe = {
        id,
        name: name ?? `Universe ${String.fromCharCode(64 + universeCounter)}`,
        config,
        worker,
        mapStatic: null,
        snapshot: null,
        events: [],
        running: false,
        speed: 20,
        replaying: false,
        runToTarget: null,
      };
      attachWorker(id, worker);
      set((state) => ({
        universes: [...state.universes, universe],
        activeUniverseId: id,
        selectedCivId: null,
        selectedCityId: null,
        selectedTile: null,
      }));
      worker.postMessage({ type: 'init', config } satisfies MainToWorker);
      if (autoplay) {
        worker.postMessage({ type: 'setSpeed', yearsPerSecond: 20 } satisfies MainToWorker);
        worker.postMessage({ type: 'play' } satisfies MainToWorker);
        patchUniverse(id, { running: true });
      }
      return id;
    },

    branchUniverse: (fromId, config, name) => {
      const from = get().universes.find((u) => u.id === fromId);
      const currentYear = from?.snapshot?.year ?? 0;
      const id = get().createUniverse(config, name);
      // Bring the branch up to the same year so comparison is apples-to-apples.
      const u = get().universes.find((x) => x.id === id);
      if (u && currentYear > 0) {
        u.worker.postMessage({ type: 'runTo', year: currentYear } satisfies MainToWorker);
        patchUniverse(id, { running: true, runToTarget: currentYear });
      }
    },

    removeUniverse: (id) => {
      const { universes, activeUniverseId, compareUniverseId } = get();
      if (universes.length <= 1) return;
      const u = universes.find((x) => x.id === id);
      if (u) u.worker.terminate();
      const remaining = universes.filter((x) => x.id !== id);
      set({
        universes: remaining,
        activeUniverseId: activeUniverseId === id ? remaining[0].id : activeUniverseId,
        compareUniverseId: compareUniverseId === id ? null : compareUniverseId,
      });
    },

    setActiveUniverse: (id) => set({ activeUniverseId: id, selectedCivId: null, selectedCityId: null, selectedTile: null }),
    setCompareUniverse: (id) => set({ compareUniverseId: id }),

    play: () => {
      sendToActive({ type: 'play' });
      const u = activeUniverse();
      if (u) patchUniverse(u.id, { running: true });
    },
    pause: () => {
      sendToActive({ type: 'pause' });
      const u = activeUniverse();
      if (u) patchUniverse(u.id, { running: false, runToTarget: null });
    },
    step: () => sendToActive({ type: 'step' }),
    reset: () => {
      sendToActive({ type: 'reset' });
      const u = activeUniverse();
      if (u) patchUniverse(u.id, { running: false, runToTarget: null, events: [] });
    },
    replay: () => {
      const u = activeUniverse();
      if (!u || !u.snapshot) return;
      const toYear = u.snapshot.year;
      patchUniverse(u.id, { replaying: true, events: [], running: toYear > 0, runToTarget: toYear });
      u.worker.postMessage({ type: 'replay', toYear } satisfies MainToWorker);
    },
    setSpeed: (yearsPerSecond) => {
      sendToActive({ type: 'setSpeed', yearsPerSecond });
      const u = activeUniverse();
      if (u) patchUniverse(u.id, { speed: yearsPerSecond });
    },
    runToYear: (year) => {
      const u = activeUniverse();
      if (!u) return;
      patchUniverse(u.id, { running: true, runToTarget: year });
      u.worker.postMessage({ type: 'runTo', year } satisfies MainToWorker);
    },
    updateRules: (rules) => {
      // Rules apply going forward; a replay/reset uses the updated config.
      const u = activeUniverse();
      if (!u) return;
      const config: WorldConfig = { ...u.config, rules };
      const wasRunning = u.running;
      const year = u.snapshot?.year ?? 0;
      // Restart the worker world with new config, then fast-forward to the
      // current year — history is recomputed under the new rules.
      patchUniverse(u.id, { config, events: [], replaying: year > 0, runToTarget: year > 0 ? year : null });
      u.worker.postMessage({ type: 'init', config } satisfies MainToWorker);
      if (year > 0) {
        u.worker.postMessage({ type: 'runTo', year } satisfies MainToWorker);
        patchUniverse(u.id, { running: true });
      } else if (wasRunning) {
        u.worker.postMessage({ type: 'play' } satisfies MainToWorker);
      }
    },

    setMapMode: (m) => set({ mapMode: m }),
    selectCiv: (id) => set({ selectedCivId: id, selectedCityId: null }),
    selectCity: (id) => set({ selectedCityId: id }),
    selectTile: (t) => set({ selectedTile: t }),
    focusOn: (x, y) => set((s) => ({ focusTile: { x, y, nonce: (s.focusTile?.nonce ?? 0) + 1 } })),
    setInspectorTab: (t) => set({ inspectorTab: t }),
    setSidebarOpen: (open) => set({ sidebarOpen: open }),
    setShowSummary: (show) => set({ showSummary: show }),
    setTutorialStep: (step) => set({ tutorialStep: step }),
    showToast: (msg) => {
      set({ toast: msg });
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => set({ toast: null }), 3500);
    },
  };
});

export function useActiveUniverse(): Universe | null {
  return useSimulatorStore((s) => s.universes.find((u) => u.id === s.activeUniverseId) ?? null);
}
