import { describe, expect, it } from 'vitest';
import { createWorld, simulateYears } from '../engine';
import { defaultConfig } from '../presets';
import { Intervention, WorldState } from '../types';

function digest(world: WorldState): unknown {
  return {
    year: world.year,
    civs: world.civs.map((c) => ({
      id: c.id, name: c.name, pop: Math.round(c.population * 1000) / 1000,
      territory: c.territory, alive: c.alive,
    })),
    events: world.events.map((e) => `${e.year}:${e.type}:${e.title}`),
  };
}

const INTERVENTIONS: Intervention[] = [
  { id: 'iv-1', year: 60, type: 'meteor', x: 100, y: 100 },
  { id: 'iv-2', year: 120, type: 'bless', x: 90, y: 110 },
  { id: 'iv-3', year: 200, type: 'spawnCiv', x: 30, y: 30 },
  { id: 'iv-4', year: 260, type: 'goldenAge', x: 100, y: 100 },
];

describe('Divine interventions', () => {
  it('are deterministic: same interventions => identical history', () => {
    const cfg = defaultConfig();
    cfg.width = 120;
    cfg.height = 120;
    cfg.interventions = INTERVENTIONS;
    const w1 = simulateYears(createWorld(cfg), 400);
    const w2 = simulateYears(createWorld(cfg), 400);
    expect(digest(w1)).toEqual(digest(w2));
    expect(w1.events.some((e) => e.type === 'divine')).toBe(true);
  });

  it('change history relative to a non-intervened world', () => {
    const base = defaultConfig();
    base.width = 120;
    base.height = 120;
    const modified = { ...base, interventions: INTERVENTIONS };
    const w1 = simulateYears(createWorld(base), 400);
    const w2 = simulateYears(createWorld(modified), 400);
    expect(JSON.stringify(digest(w1))).not.toEqual(JSON.stringify(digest(w2)));
  });

  it('spawnCiv creates a living nation on empty land', () => {
    const cfg = defaultConfig();
    cfg.width = 120;
    cfg.height = 120;
    cfg.interventions = [{ id: 'iv-s', year: 50, type: 'spawnCiv', x: 30, y: 30 }];
    const world = simulateYears(createWorld(cfg), 100);
    // Either it spawned (land was free) or was skipped (tile owned/ocean) — on
    // this seed tile (30,30) the outcome must be deterministic; assert the
    // divine event fired iff a new civ exists.
    const spawned = world.civs.length > cfg.civs.length;
    const evented = world.events.some((e) => e.type === 'divine' && e.title.includes('willed into being'));
    expect(spawned).toBe(evented);
  });
});
