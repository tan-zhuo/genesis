// Scenario challenges: a reason to watch, a way to win — or to fail.
import { Snapshot, WorldConfig, WorldEvent } from '../simulation/types';
import { WORLD_PRESETS } from '../simulation/presets';

export type ScenarioOutcome = 'win' | 'fail' | null;

export interface ScenarioDef {
  id: string;
  icon: string;
  en: { name: string; desc: string };
  zh: { name: string; desc: string };
  config: () => WorldConfig;
  check: (snapshot: Snapshot, events: WorldEvent[]) => ScenarioOutcome;
}

function preset(id: string): WorldConfig {
  const p = WORLD_PRESETS.find((x) => x.id === id) ?? WORLD_PRESETS[0];
  return p.config();
}

function interventionsUsed(s: Snapshot): number {
  return s.interventions.filter((iv) => iv.year <= s.year).length;
}

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'guardian',
    icon: '🛡',
    en: {
      name: 'The Guardian',
      desc: 'Touch nothing. Every founding civilization must still live in year 5,000. Extinction — or a single intervention — is failure.',
    },
    zh: {
      name: '守望者',
      desc: '什么都不要碰。所有初始文明必须活到 5000 年。任何一国灭亡——或你的任何一次干预——都是失败。',
    },
    config: () => preset('example'),
    check: (s) => {
      if (interventionsUsed(s) > 0) return 'fail';
      const founders = s.civs.filter((c) => c.foundedYear === 0);
      if (founders.some((c) => !c.alive)) return 'fail';
      if (s.year >= 5000) return 'win';
      return null;
    },
  },
  {
    id: 'arsonist',
    icon: '🔥',
    en: {
      name: 'The Arsonist',
      desc: 'A world built for peace. Using at most 3 interventions, make three wars burn at once before year 3,000.',
    },
    zh: {
      name: '纵火者',
      desc: '一个为和平而生的世界。最多动用 3 次干预，在 3000 年前让三场战争同时燃烧。',
    },
    config: () => preset('peaceful'),
    check: (s) => {
      if (interventionsUsed(s) > 3) return 'fail';
      if (s.wars.filter((w) => w.endYear === null).length >= 3) return 'win';
      if (s.year >= 3000) return 'fail';
      return null;
    },
  },
  {
    id: 'accelerationist',
    icon: '🚀',
    en: {
      name: 'The Accelerationist',
      desc: 'Any civilization must build Artificial Intelligence before year 3,000. Intervene as much as you like.',
    },
    zh: {
      name: '加速主义者',
      desc: '任意文明必须在 3000 年前造出人工智能。你可以随意干预。',
    },
    config: () => preset('science'),
    check: (s) => {
      if (s.civs.some((c) => c.alive && c.researchedTechs.includes('ai'))) return 'win';
      if (s.year >= 3000) return 'fail';
      return null;
    },
  },
  {
    id: 'worldmother',
    icon: '🏕',
    en: {
      name: 'The Worldmother',
      desc: 'Fill the world with peoples: eight or more civilizations alive at once before year 4,000. Creation is permitted — survival is not guaranteed.',
    },
    zh: {
      name: '造物之母',
      desc: '让世界住满民族：在 4000 年前同时存在 8 个以上的文明。允许创生——但不保证它们能活下来。',
    },
    config: () => preset('example'),
    check: (s) => {
      if (s.civs.filter((c) => c.alive).length >= 8) return 'win';
      if (s.year >= 4000) return 'fail';
      return null;
    },
  },
  {
    id: 'silent-god',
    icon: '🌑',
    en: {
      name: 'The Silent God',
      desc: 'In a chaotic world, intervene never. Witness an empire rise — and then witness it break or die — before year 6,000.',
    },
    zh: {
      name: '沉默之神',
      desc: '在一个混沌的世界里，永不干预。在 6000 年前见证一个帝国崛起——然后见证它分裂或死亡。',
    },
    config: () => preset('chaotic'),
    check: (s, ev) => {
      if (interventionsUsed(s) > 0) return 'fail';
      const empires = ev.filter((e) => e.type === 'empire');
      for (const emp of empires) {
        const civId = emp.civilizationIds[0];
        if (!civId) continue;
        const civ = s.civs.find((c) => c.id === civId);
        const broke = ev.some(
          (e) => e.year > emp.year && (e.type === 'split' || e.type === 'extinction') && e.civilizationIds.includes(civId),
        );
        if (broke || (civ && !civ.alive)) return 'win';
      }
      if (s.year >= 6000) return 'fail';
      return null;
    },
  },
  {
    id: 'ark',
    icon: '🌊',
    en: {
      name: 'After the Flood',
      desc: 'A world battered by constant disasters. Shepherd it: total population must exceed 5 million in year 8,000.',
    },
    zh: {
      name: '大洪水之后',
      desc: '一个被灾难反复蹂躏的世界。牧养它：8000 年时世界总人口必须超过 500 万。',
    },
    config: () => {
      const cfg = preset('example');
      cfg.seed = '40404';
      cfg.disasterFrequency = 2;
      return cfg;
    },
    check: (s) => {
      const pop = s.civs.filter((c) => c.alive).reduce((sum, c) => sum + c.population, 0);
      if (s.year >= 8000) return pop >= 5_000_000 ? 'win' : 'fail';
      return null;
    },
  },
];

export function getScenario(id: string): ScenarioDef | null {
  return SCENARIOS.find((s) => s.id === id) ?? null;
}
