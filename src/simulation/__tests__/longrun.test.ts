// Temporary profiling harness (kept as a slow smoke test).
import { describe, expect, it } from 'vitest';
import { createWorld, simulateYears } from '../engine';
import { WORLD_PRESETS } from '../presets';

describe('10k-year smoke run', () => {
  it('simulates 10,000 years on a 200x200 map in reasonable time', () => {
    const cfg = WORLD_PRESETS[0].config();
    const world = createWorld(cfg);
    const t0 = performance.now();
    simulateYears(world, 10000);
    const elapsed = performance.now() - t0;
    const alive = world.civs.filter((c) => c.alive);
    console.log(
      `10k years in ${(elapsed / 1000).toFixed(1)}s | civs=${world.civs.length} alive=${alive.length} cities=${world.cities.length} wars=${world.totalWars} events=${world.events.length} trades=${world.totalTradeDeals} pop=${Math.round(world.stats.at(-1)!.population)} maxTech=${world.stats.at(-1)!.technologies} splits=${world.events.filter((e) => e.type === 'split').length} extinct=${world.civs.filter((c) => !c.alive).length} empires=${world.events.filter((e) => e.type === 'empire').length}`,
    );
    expect(elapsed).toBeLessThan(120000);
    expect(world.year).toBe(10000);
  }, 180000);
});
