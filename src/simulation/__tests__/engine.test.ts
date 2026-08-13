import { describe, expect, it } from 'vitest';
import { createWorld, simulateYears } from '../engine';
import { WORLD_PRESETS, defaultConfig } from '../presets';
import { exportConfig, importConfig, validateConfig } from '../../utils/serialization';
import { SeededRandom } from '../Random';
import { WorldState } from '../types';

function digest(world: WorldState): unknown {
  return {
    year: world.year,
    civs: world.civs.map((c) => ({
      id: c.id,
      name: c.name,
      pop: Math.round(c.population * 1000) / 1000,
      territory: c.territory,
      tech: c.technologyLevel,
      alive: c.alive,
      cities: c.cityIds.length,
    })),
    events: world.events.map((e) => `${e.year}:${e.type}:${e.title}`),
    stats: world.stats[world.stats.length - 1],
    wars: world.wars.map((w) => `${w.startYear}-${w.endYear}:${w.attackerId}>${w.defenderId}`),
  };
}

describe('SeededRandom', () => {
  it('is deterministic for the same seed', () => {
    const a = new SeededRandom('hello');
    const b = new SeededRandom('hello');
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('produces values in [0,1) and respects ranges', () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = rng.nextInt(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });
});

describe('Determinism', () => {
  it('same seed + same config => identical world after 300 years', () => {
    const cfg = defaultConfig();
    cfg.width = 120;
    cfg.height = 120;
    const w1 = simulateYears(createWorld(cfg), 300);
    const w2 = simulateYears(createWorld(cfg), 300);
    expect(digest(w1)).toEqual(digest(w2));
  });

  it('different seeds diverge', () => {
    const cfg1 = defaultConfig();
    cfg1.width = 100;
    cfg1.height = 100;
    const cfg2 = { ...cfg1, seed: 'a-different-seed' };
    const w1 = simulateYears(createWorld(cfg1), 200);
    const w2 = simulateYears(createWorld(cfg2), 200);
    expect(JSON.stringify(digest(w1))).not.toEqual(JSON.stringify(digest(w2)));
  });
});

describe('Replay', () => {
  it('replay from year 0 reproduces the identical history', () => {
    const cfg = WORLD_PRESETS[0].config();
    cfg.width = 120;
    cfg.height = 120;
    const original = simulateYears(createWorld(cfg), 500);
    const replayed = simulateYears(createWorld(cfg), 500);
    expect(digest(replayed)).toEqual(digest(original));
    // Event years must match exactly
    expect(replayed.events.map((e) => e.year)).toEqual(original.events.map((e) => e.year));
  });
});

describe('Population sanity', () => {
  it('never produces NaN, Infinity, or negative population over 2000 years', () => {
    const cfg = WORLD_PRESETS.find((p) => p.id === 'chaotic')!.config();
    cfg.width = 120;
    cfg.height = 120;
    const world = createWorld(cfg);
    for (let y = 0; y < 2000; y++) {
      simulateYears(world, 1);
      for (const civ of world.civs) {
        expect(Number.isFinite(civ.population)).toBe(true);
        expect(civ.population).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(civ.military)).toBe(true);
        expect(Number.isFinite(civ.economy)).toBe(true);
      }
      const last = world.stats[world.stats.length - 1];
      expect(Number.isFinite(last.population)).toBe(true);
    }
  });
});

describe('War', () => {
  it('wars always end (hard cap well under 50 years)', () => {
    const cfg = WORLD_PRESETS.find((p) => p.id === 'war')!.config();
    cfg.width = 120;
    cfg.height = 120;
    const world = simulateYears(createWorld(cfg), 2000);
    expect(world.totalWars).toBeGreaterThan(0);
    for (const war of world.wars) {
      if (war.endYear !== null) {
        expect(war.endYear - war.startYear).toBeLessThanOrEqual(45);
      } else {
        expect(world.year - war.startYear).toBeLessThanOrEqual(45);
      }
    }
  });
});

describe('Civilization lifecycle', () => {
  it('civilizations found cities and expand territory', () => {
    const cfg = defaultConfig();
    cfg.width = 120;
    cfg.height = 120;
    const world = simulateYears(createWorld(cfg), 600);
    const alive = world.civs.filter((c) => c.alive);
    expect(alive.length).toBeGreaterThan(0);
    expect(world.cities.length).toBeGreaterThan(0);
    const totalTerritory = world.civs.reduce((s, c) => s + c.territory, 0);
    expect(totalTerritory).toBeGreaterThan(world.config.civs.length * 9);
    expect(world.events.some((e) => e.type === 'city-founded')).toBe(true);
    expect(world.events.some((e) => e.type === 'technology')).toBe(true);
  });

  it('extinction and/or splits occur in a hostile long-running world', () => {
    const cfg = WORLD_PRESETS.find((p) => p.id === 'war')!.config();
    cfg.width = 120;
    cfg.height = 120;
    const world = simulateYears(createWorld(cfg), 5000);
    const hasDrama =
      world.events.some((e) => e.type === 'extinction' || e.type === 'split') ||
      world.civs.some((c) => !c.alive) ||
      world.civs.length > cfg.civs.length;
    expect(hasDrama).toBe(true);
  });
});

describe('Serialization', () => {
  it('export -> import roundtrips to an identical simulation', () => {
    const cfg = defaultConfig();
    cfg.width = 100;
    cfg.height = 100;
    const json = exportConfig(cfg);
    const imported = importConfig(json);
    const w1 = simulateYears(createWorld(cfg), 250);
    const w2 = simulateYears(createWorld(imported), 250);
    expect(digest(w1)).toEqual(digest(w2));
  });

  it('rejects hopeless configs and clamps bad values', () => {
    expect(() => validateConfig(null)).toThrow();
    expect(() => validateConfig({ civs: [] })).toThrow();
    const cfg = validateConfig({
      seed: 'x',
      width: 9999,
      height: -5,
      civs: [{ name: 'A' }, { name: 'B', startPopulation: 1e12, traits: { aggression: 500 } }],
      rules: [{ bogus: true }, { conditions: [{ metric: 'population', op: '>', value: 10 }], action: { type: 'declareWar', amount: 5 } }],
    });
    expect(cfg.width).toBeLessThanOrEqual(600);
    expect(cfg.height).toBeGreaterThanOrEqual(60);
    expect(cfg.civs[1].startPopulation).toBeLessThanOrEqual(100000);
    expect(cfg.civs[1].traits.aggression).toBeLessThanOrEqual(100);
    expect(cfg.rules.length).toBe(1);
  });
});

describe('Rules', () => {
  it('rules measurably change history', () => {
    const base = defaultConfig();
    base.width = 100;
    base.height = 100;
    base.rules = [];
    const modified = { ...base, rules: validateConfig({ ...base, rules: [
      { name: 'warmonger', conditions: [{ metric: 'year', op: '>', value: 0 }], action: { type: 'increaseAggression', amount: 100 }, logic: 'and', enabled: true, appliesTo: 'all', id: 'r1' },
      { name: 'war now', conditions: [{ metric: 'year', op: '>', value: 0 }], action: { type: 'declareWar', amount: 50 }, logic: 'and', enabled: true, appliesTo: 'all', id: 'r2' },
    ] }).rules };
    const w1 = simulateYears(createWorld(base), 800);
    const w2 = simulateYears(createWorld(modified), 800);
    expect(w2.totalWars).toBeGreaterThan(w1.totalWars);
  });
});
