// Messages between the UI thread and the simulation worker.
import { AiDecision, InterventionType, MapStatic, Snapshot, WorldConfig } from '../simulation/types';

export type MainToWorker =
  | { type: 'init'; config: WorldConfig }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'step' }
  | { type: 'setSpeed'; yearsPerSecond: number }
  | { type: 'runTo'; year: number }
  | { type: 'reset' } // back to year 0 with same config
  | { type: 'replay'; toYear: number } // reset then run to year, verifying determinism
  | { type: 'intervene'; interventionType: InterventionType; x?: number; y?: number }
  | { type: 'aiDecision'; decision: Omit<AiDecision, 'id' | 'year'> } // worker assigns id + effect year
  | { type: 'requestSnapshot' };

export type WorkerToMain =
  | { type: 'ready'; mapStatic: MapStatic; snapshot: Snapshot }
  | { type: 'snapshot'; snapshot: Snapshot }
  | { type: 'runToDone'; year: number }
  | { type: 'error'; message: string };
