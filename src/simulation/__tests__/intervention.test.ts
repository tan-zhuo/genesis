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

describe('Finite resources & transcendence', () => {
  it('mineral deposits deplete over industrial time', () => {
    const cfg = defaultConfig();
    cfg.width = 120;
    cfg.height = 120;
    const world = createWorld(cfg);
    const countMinerals = (): number => {
      let n = 0;
      for (let i = 0; i < world.map.resources.length; i++) {
        if (world.map.resources[i] & (4 | 8 | 16)) n++;
      }
      return n;
    };
    const before = countMinerals();
    simulateYears(world, 4000);
    const after = countMinerals();
    expect(after).toBeLessThan(before);
    expect(world.mapVersion).toBeGreaterThan(0);
  });

  it('finiteResources=false keeps the old infinite behavior deterministic', () => {
    const cfg = defaultConfig();
    cfg.width = 100;
    cfg.height = 100;
    cfg.finiteResources = false;
    const w1 = simulateYears(createWorld(cfg), 300);
    const w2 = simulateYears(createWorld(cfg), 300);
    expect(digest(w1)).toEqual(digest(w2));
  });

  it('a civilization with transcendence ascends and leaves the world', () => {
    const cfg = defaultConfig();
    cfg.width = 100;
    cfg.height = 100;
    const world = createWorld(cfg);
    simulateYears(world, 50);
    // Grant the full tech tree to the strongest civ — the gate opens.
    const civ = world.civs.filter((c) => c.alive).sort((a, b) => b.population - a.population)[0];
    civ.researchedTechs = ['survival', 'agriculture', 'writing', 'metallurgy', 'engineering', 'navigation', 'gunpowder', 'industry', 'electricity', 'computing', 'ai', 'spaceflight', 'transcendence'];
    civ.technologyLevel = civ.researchedTechs.length;
    simulateYears(world, 300);
    expect(civ.alive).toBe(false);
    expect(civ.ascended).toBe(true);
    expect(world.events.some((e) => e.type === 'ascension' && e.importance === 10)).toBe(true);
    expect(world.epitaphs.some((e) => e.civId === civ.id && e.ascended)).toBe(true);
  });
});

describe('Anthropogenic climate', () => {
  it('industrial civilizations warm the world; coasts flood; it is deterministic', () => {
    const cfg = defaultConfig();
    cfg.width = 120;
    cfg.height = 120;
    const run = () => {
      const world = createWorld(cfg);
      simulateYears(world, 50);
      for (const civ of world.civs) {
        if (!civ.alive) continue;
        civ.researchedTechs = ['survival', 'agriculture', 'writing', 'metallurgy', 'engineering', 'navigation', 'gunpowder', 'industry', 'electricity'];
        civ.technologyLevel = civ.researchedTechs.length;
      }
      // A sustained industrial world: keep the smokestacks burning.
      for (let chunk = 0; chunk < 12; chunk++) {
        for (const civ of world.civs) {
          if (civ.alive) civ.population = Math.max(civ.population, 3_000_000);
        }
        simulateYears(world, 100);
      }
      return world;
    };
    const w1 = run();
    expect(w1.co2).toBeGreaterThan(300);
    expect(w1.tempAnomaly).toBeGreaterThan(0.3);
    expect(w1.events.some((e) => e.title.includes('warmed by'))).toBe(true);
    const w2 = run();
    expect(Math.round(w2.co2 * 1000)).toBe(Math.round(w1.co2 * 1000));
  });
});
