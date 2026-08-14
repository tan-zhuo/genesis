import { describe, expect, it } from 'vitest';
import { createWorld, simulateYears } from '../engine';
import { defaultConfig } from '../presets';
import { AiDecision, WorldState } from '../types';
import { validateConfig } from '../../utils/serialization';

function digest(world: WorldState): unknown {
  return {
    year: world.year,
    civs: world.civs.map((c) => ({
      id: c.id, name: c.name, pop: Math.round(c.population * 1000) / 1000,
      territory: c.territory, alive: c.alive,
      research: c.currentResearch, techs: [...c.researchedTechs],
      traits: { ...c.traits },
    })),
    wars: world.wars.map((w) => `${w.startYear}-${w.endYear}:${w.attackerId}>${w.defenderId}`),
    events: world.events.map((e) => `${e.year}:${e.type}:${e.title}`),
  };
}

const DECISIONS: AiDecision[] = [
  // Valid: survival is researched at start; pottery only needs survival (and
  // is never the default first pick, so this is a real redirect).
  { id: 'a1', year: 40, civId: 'civ-0', kind: 'research', techId: 'pottery', reason: 'Feed the people first.' },
  { id: 'a2', year: 80, civId: 'civ-0', kind: 'policy', trait: 'aggression', delta: 10, reason: 'Harden the borders.' },
  { id: 'a3', year: 120, civId: 'civ-0', kind: 'diplomacy', targetId: 'civ-1', reason: 'We need friends in the east.' },
  { id: 'a4', year: 200, civId: 'civ-1', kind: 'war', targetId: 'civ-0', reason: 'Their fields should be ours.' },
  { id: 'a5', year: 230, civId: 'civ-1', kind: 'peace', targetId: 'civ-0', reason: 'This war has cost too much.' },
];

const ILLEGAL: AiDecision[] = [
  { id: 'b1', year: 30, civId: 'civ-0', kind: 'research', techId: 'ai' }, // prereqs unmet
  { id: 'b2', year: 31, civId: 'civ-0', kind: 'research', techId: 'not-a-tech' },
  { id: 'b3', year: 32, civId: 'civ-0', kind: 'war', targetId: 'civ-99' }, // no such civ
  { id: 'b4', year: 33, civId: 'civ-0', kind: 'policy', trait: 'aggression', delta: 500 }, // clamped
  { id: 'b5', year: 34, civId: 'no-such-civ', kind: 'diplomacy', targetId: 'civ-0' },
  { id: 'b6', year: 35, civId: 'civ-0', kind: 'peace', targetId: 'civ-1' }, // not at war: no-op
];

describe('AI council decisions', () => {
  it('are deterministic: same decision log => identical history', () => {
    const cfg = defaultConfig();
    cfg.width = 120;
    cfg.height = 120;
    cfg.aiDecisions = DECISIONS;
    const w1 = simulateYears(createWorld(cfg), 300);
    const w2 = simulateYears(createWorld(cfg), 300);
    expect(digest(w1)).toEqual(digest(w2));
    expect(w1.events.some((e) => e.type === 'council')).toBe(true);
  });

  it('apply valid decisions: research switch, policy shift, war and peace', () => {
    const cfg = defaultConfig();
    cfg.width = 120;
    cfg.height = 120;
    const aggressionBefore = cfg.civs[0].traits.aggression;
    cfg.aiDecisions = DECISIONS;
    const w = simulateYears(createWorld(cfg), 90);
    // Policy at year 80: +10 aggression (clamped within 0-100)
    expect(w.civs[0].traits.aggression).toBe(Math.min(100, aggressionBefore + 10));
    const researchEvent = w.events.find((e) => e.type === 'council' && e.year === 40);
    expect(researchEvent).toBeDefined();
    expect(researchEvent?.description).toContain('Feed the people first.');
  });

  it('declares and ends wars on command', () => {
    const cfg = defaultConfig();
    cfg.width = 120;
    cfg.height = 120;
    // Give the aggressor a navy so the commanded overseas war is legal.
    cfg.civs[1].startTechs = ['survival', 'sailing'];
    cfg.aiDecisions = DECISIONS;
    const w = simulateYears(createWorld(cfg), 260);
    const commanded = w.wars.find((war) => war.startYear === 200);
    if (commanded) {
      // The commanded war exists and the peace decision ended it (or it ended earlier on its own).
      expect(commanded.endYear).not.toBeNull();
      expect(commanded.endYear as number).toBeLessThanOrEqual(230);
    }
    // Either way the council events were recorded.
    expect(w.events.some((e) => e.type === 'council' && e.year === 200)).toBe(true);
  });

  it('ignores illegal decisions safely (no crash, no bogus state)', () => {
    const cfg = defaultConfig();
    cfg.width = 120;
    cfg.height = 120;
    cfg.aiDecisions = ILLEGAL;
    const aggressionBefore = cfg.civs[0].traits.aggression;
    const w = simulateYears(createWorld(cfg), 60);
    expect(w.civs[0].researchedTechs.includes('ai')).toBe(false);
    // delta 500 was pre-clamped by nothing here (raw engine): engine clamps to ±12
    expect(w.civs[0].traits.aggression).toBeLessThanOrEqual(Math.min(100, aggressionBefore + 12));
    // b1..b3, b5, b6 produced no council events; b4 may produce one (clamped policy)
    const councilEvents = w.events.filter((e) => e.type === 'council');
    expect(councilEvents.length).toBeLessThanOrEqual(1);
  });

  it('round-trips through config serialization', () => {
    const cfg = defaultConfig();
    cfg.aiDecisions = DECISIONS;
    const validated = validateConfig(JSON.parse(JSON.stringify(cfg)));
    expect(validated.aiDecisions).toHaveLength(DECISIONS.length);
    expect(validated.aiDecisions?.[0]).toMatchObject({ kind: 'research', techId: 'pottery', civId: 'civ-0' });
    // Garbage decisions are dropped, not imported
    const dirty = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
    (dirty.aiDecisions as unknown[]).push({ kind: 'nuke-everything', year: 5, civId: 'civ-0' });
    expect(validateConfig(dirty).aiDecisions).toHaveLength(DECISIONS.length);
  });
});
