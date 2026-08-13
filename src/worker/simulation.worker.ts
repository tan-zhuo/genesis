// Simulation worker: owns the WorldState and the tick loop.
// The UI thread only ever sees Snapshots. Timing here controls *pacing* only —
// simulation results depend exclusively on (seed, config, year).
import { createWorld, simulateYear } from '../simulation/engine';
import { buildMapStatic, buildSnapshot } from '../simulation/snapshot';
import { Intervention, WorldConfig, WorldEvent, WorldState } from '../simulation/types';
import { MainToWorker, WorkerToMain } from './protocol';

let interventionCounter = 0;

let world: WorldState | null = null;
let config: WorldConfig | null = null;
let running = false;
let yearsPerSecond = 20;
let targetYear: number | null = null;
let lastEventIndex = 0;
let loopHandle: ReturnType<typeof setTimeout> | null = null;
let lastTickTime = 0;
let yearCarry = 0;
let lastSnapshotTime = 0;
let lastMapVersionSent = -1;
let lastMapUpdateTime = 0;

const MAX_YEARS_PER_SLICE = 600;
const SNAPSHOT_INTERVAL_MS = 90;

function post(msg: WorkerToMain, transfer: Transferable[] = []): void {
  (self as unknown as Worker).postMessage(msg, transfer);
}

function takeNewEvents(): WorldEvent[] {
  if (!world) return [];
  // Event log can be trimmed; clamp index defensively.
  if (lastEventIndex > world.events.length) lastEventIndex = world.events.length;
  const fresh = world.events.slice(lastEventIndex);
  lastEventIndex = world.events.length;
  return fresh;
}

function sendSnapshot(): void {
  if (!world) return;
  const now = performance.now();
  // Terrain/resources/fertility mutate slowly (depletion, blessings): ship a
  // map refresh at most every 3s of real time when the version moved.
  const includeMap = world.mapVersion !== lastMapVersionSent && now - lastMapUpdateTime > 3000;
  const snapshot = buildSnapshot(world, running, yearsPerSecond, takeNewEvents(), includeMap);
  const transfer: Transferable[] = [snapshot.owner.buffer, snapshot.population.buffer];
  if (snapshot.mapUpdate) {
    transfer.push(snapshot.mapUpdate.terrain.buffer, snapshot.mapUpdate.resources.buffer, snapshot.mapUpdate.fertility.buffer);
    lastMapVersionSent = snapshot.mapUpdate.version;
    lastMapUpdateTime = now;
  }
  post({ type: 'snapshot', snapshot }, transfer);
  lastSnapshotTime = now;
}

function initWorld(cfg: WorldConfig): void {
  config = cfg;
  world = createWorld(cfg);
  running = false;
  targetYear = null;
  lastEventIndex = 0;
  yearCarry = 0;
  lastMapVersionSent = -1;
  lastMapUpdateTime = 0;
  const mapStatic = buildMapStatic(world);
  const snapshot = buildSnapshot(world, running, yearsPerSecond, takeNewEvents());
  post({ type: 'ready', mapStatic, snapshot }, [
    mapStatic.terrain.buffer,
    mapStatic.elevation.buffer,
    mapStatic.fertility.buffer,
    mapStatic.temperature.buffer,
    mapStatic.moisture.buffer,
    mapStatic.resources.buffer,
    mapStatic.river.buffer,
    snapshot.owner.buffer,
    snapshot.population.buffer,
  ]);
}

function scheduleLoop(): void {
  if (loopHandle !== null) return;
  lastTickTime = performance.now();
  const tick = (): void => {
    loopHandle = null;
    if (!world || !running) return;
    const now = performance.now();

    let toRun: number;
    if (targetYear !== null) {
      // Run-to-year: full speed in bounded slices.
      toRun = Math.min(MAX_YEARS_PER_SLICE, targetYear - world.year);
    } else {
      const dt = Math.min(0.25, (now - lastTickTime) / 1000);
      yearCarry += dt * yearsPerSecond;
      toRun = Math.min(MAX_YEARS_PER_SLICE, Math.floor(yearCarry));
      yearCarry -= toRun;
    }
    lastTickTime = now;

    for (let i = 0; i < toRun; i++) {
      simulateYear(world);
      if (targetYear !== null && world.year >= targetYear) break;
    }

    if (targetYear !== null && world.year >= targetYear) {
      running = false;
      const finished = targetYear;
      targetYear = null;
      sendSnapshot();
      post({ type: 'runToDone', year: finished });
      return;
    }

    if (performance.now() - lastSnapshotTime > SNAPSHOT_INTERVAL_MS) {
      sendSnapshot();
    }
    loopHandle = setTimeout(tick, toRun >= MAX_YEARS_PER_SLICE ? 0 : 16);
  };
  loopHandle = setTimeout(tick, 0);
}

self.onmessage = (e: MessageEvent<MainToWorker>): void => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'init':
        initWorld(msg.config);
        break;
      case 'play':
        if (!world) return;
        running = true;
        yearCarry = 0;
        scheduleLoop();
        break;
      case 'pause':
        running = false;
        targetYear = null;
        sendSnapshot();
        break;
      case 'step':
        if (!world) return;
        running = false;
        simulateYear(world);
        sendSnapshot();
        break;
      case 'setSpeed':
        yearsPerSecond = Math.max(1, Math.min(100000, msg.yearsPerSecond));
        sendSnapshot();
        break;
      case 'runTo':
        if (!world) return;
        if (msg.year <= world.year) {
          sendSnapshot();
          post({ type: 'runToDone', year: world.year });
          return;
        }
        targetYear = Math.min(msg.year, world.year + 100000);
        running = true;
        scheduleLoop();
        break;
      case 'reset':
        if (config) initWorld(config);
        break;
      case 'replay': {
        // Deterministic replay: rebuild from year 0 and run to the given year.
        if (!config) return;
        const toYear = Math.max(0, Math.min(msg.toYear, 100000));
        initWorld(config);
        if (toYear > 0) {
          targetYear = toYear;
          running = true;
          scheduleLoop();
        }
        break;
      }
      case 'intervene': {
        // Record the intervention to take effect at the START of the next
        // simulated year (keeps replays deterministic), then — if paused —
        // immediately step one year so the player sees the consequence.
        if (!world || !config) return;
        interventionCounter++;
        const iv: Intervention = {
          id: `iv-${interventionCounter}`,
          year: world.year + 1,
          type: msg.interventionType,
        };
        if (msg.x !== undefined) iv.x = msg.x;
        if (msg.y !== undefined) iv.y = msg.y;
        if (!config.interventions) config.interventions = [];
        config.interventions.push(iv);
        if (world.config !== config) {
          world.config.interventions = config.interventions;
        }
        if (!running) {
          simulateYear(world);
          sendSnapshot();
        }
        break;
      }
      case 'requestSnapshot':
        sendSnapshot();
        break;
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
