// Rule templates and ready-made world presets.
import { makeRule } from './Rules';
import { Rule, Traits, WorldConfig, CivConfig, SIM_VERSION } from './types';
import { CIV_COLORS } from './names';

export interface RuleTemplate {
  id: string;
  name: string;
  description: string;
  rules: () => Rule[];
}

export const RULE_TEMPLATES: RuleTemplate[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Sensible survival instincts: migrate when starving, seek peace when weak.',
    rules: () => [
      makeRule({
        name: 'Flee famine',
        conditions: [{ metric: 'foodPerCapita', op: '<', value: 0.5 }],
        action: { type: 'increaseMigration', amount: 30 },
      }),
      makeRule({
        name: 'Peace when fragile',
        conditions: [{ metric: 'stability', op: '<', value: 30 }],
        action: { type: 'seekPeace', amount: 40 },
      }),
      makeRule({
        name: 'Crowding pushes people out',
        logic: 'and',
        conditions: [
          { metric: 'populationDensity', op: '>', value: 500 },
          { metric: 'foodPerCapita', op: '<', value: 1 },
        ],
        action: { type: 'increaseMigration', amount: 20 },
      }),
    ],
  },
  {
    id: 'peaceful',
    name: 'Peaceful',
    description: 'Aggression is suppressed; prosperity and diplomacy rule.',
    rules: () => [
      makeRule({
        name: 'Renounce war',
        conditions: [{ metric: 'year', op: '>', value: 0 }],
        action: { type: 'decreaseAggression', amount: 30 },
      }),
      makeRule({
        name: 'Always seek peace',
        conditions: [{ metric: 'year', op: '>', value: 0 }],
        action: { type: 'seekPeace', amount: 30 },
      }),
      makeRule({
        name: 'Trade with everyone',
        conditions: [{ metric: 'economy', op: '>', value: 10 }],
        action: { type: 'startTrade', amount: 30 },
      }),
    ],
  },
  {
    id: 'militaristic',
    name: 'Militaristic',
    description: 'Strength decides everything. The strong prey on the weak.',
    rules: () => [
      makeRule({
        name: 'Strike the weak',
        conditions: [{ metric: 'neighborStrength', op: '<', value: 0.7 }],
        action: { type: 'declareWar', amount: 15 },
      }),
      makeRule({
        name: 'Militarize society',
        conditions: [{ metric: 'year', op: '>', value: 0 }],
        action: { type: 'increaseAggression', amount: 25 },
      }),
      makeRule({
        name: 'War economy',
        conditions: [{ metric: 'military', op: '>', value: 40 }],
        action: { type: 'increasePopulation', amount: 1 },
      }),
    ],
  },
  {
    id: 'merchant',
    name: 'Merchant',
    description: 'Wealth above all: trade constantly, avoid costly wars.',
    rules: () => [
      makeRule({
        name: 'Open every market',
        conditions: [{ metric: 'year', op: '>', value: 0 }],
        action: { type: 'startTrade', amount: 40 },
      }),
      makeRule({
        name: 'War is bad for business',
        conditions: [{ metric: 'economy', op: '>', value: 30 }],
        action: { type: 'decreaseAggression', amount: 20 },
      }),
      makeRule({
        name: 'Wealthy cities',
        conditions: [{ metric: 'economy', op: '>', value: 50 }],
        action: { type: 'buildCity', amount: 30 },
      }),
    ],
  },
  {
    id: 'scientific',
    name: 'Scientific',
    description: 'Knowledge is destiny. Research at any cost.',
    rules: () => [
      makeRule({
        name: 'Fund the academies',
        conditions: [{ metric: 'year', op: '>', value: 0 }],
        action: { type: 'researchTechnology', amount: 30 },
      }),
      makeRule({
        name: 'Stability breeds science',
        conditions: [{ metric: 'stability', op: '>', value: 60 }],
        action: { type: 'researchTechnology', amount: 20 },
      }),
      makeRule({
        name: 'Avoid distracting wars',
        conditions: [{ metric: 'technology', op: '<', value: 8 }],
        action: { type: 'decreaseAggression', amount: 15 },
      }),
    ],
  },
  {
    id: 'nomadic',
    name: 'Nomadic',
    description: 'Never settle. The horizon always promises better land.',
    rules: () => [
      makeRule({
        name: 'Wanderlust',
        conditions: [{ metric: 'year', op: '>', value: 0 }],
        action: { type: 'increaseMigration', amount: 40 },
      }),
      makeRule({
        name: 'Follow the food',
        conditions: [{ metric: 'foodPerCapita', op: '<', value: 1 }],
        action: { type: 'movePopulation', amount: 30 },
      }),
    ],
  },
  {
    id: 'expansionist',
    name: 'Expansionist',
    description: 'Claim everything. Borders exist to be pushed.',
    rules: () => [
      makeRule({
        name: 'Manifest destiny',
        conditions: [{ metric: 'population', op: '>', value: 1000 }],
        action: { type: 'increasePopulation', amount: 2 },
      }),
      makeRule({
        name: 'Settle the frontier',
        conditions: [{ metric: 'populationDensity', op: '>', value: 100 }],
        action: { type: 'increaseMigration', amount: 25 },
      }),
      makeRule({
        name: 'Cities anchor the land',
        conditions: [{ metric: 'territory', op: '>', value: 50 }],
        action: { type: 'buildCity', amount: 25 },
      }),
    ],
  },
  {
    id: 'isolationist',
    name: 'Isolationist',
    description: 'Wall out the world: no trade, no wars, no wandering.',
    rules: () => [
      makeRule({
        name: 'Close the borders',
        conditions: [{ metric: 'year', op: '>', value: 0 }],
        action: { type: 'decreaseAggression', amount: 20 },
      }),
      makeRule({
        name: 'Stay home',
        conditions: [{ metric: 'foodPerCapita', op: '>', value: 0.7 }],
        action: { type: 'increaseMigration', amount: -30 },
      }),
      makeRule({
        name: 'Self-sufficiency',
        conditions: [{ metric: 'stability', op: '>', value: 50 }],
        action: { type: 'researchTechnology', amount: 10 },
      }),
    ],
  },
  {
    id: 'survivalist',
    name: 'Survivalist',
    description: 'Endure at all costs: hoard food, dodge conflict, breed in good times.',
    rules: () => [
      makeRule({
        name: 'Famine response',
        conditions: [{ metric: 'foodPerCapita', op: '<', value: 0.7 }],
        action: { type: 'increaseMigration', amount: 40 },
      }),
      makeRule({
        name: 'Never fight uphill',
        conditions: [{ metric: 'neighborStrength', op: '>', value: 1.2 }],
        action: { type: 'seekPeace', amount: 50 },
      }),
      makeRule({
        name: 'Boom in plenty',
        conditions: [{ metric: 'foodPerCapita', op: '>', value: 1.3 }],
        action: { type: 'increasePopulation', amount: 2 },
      }),
    ],
  },
];

function civ(name: string, colorIdx: number, traits: Partial<Traits>, pop = 1200): CivConfig {
  return {
    name,
    color: CIV_COLORS[colorIdx % CIV_COLORS.length],
    startPopulation: pop,
    traits: {
      aggression: 50,
      trade: 50,
      science: 50,
      migration: 50,
      expansion: 50,
      diplomacy: 50,
      birthRate: 50,
      riskTaking: 50,
      ...traits,
    },
    startTechs: ['survival'],
  };
}

function baseConfig(seed: string, civs: CivConfig[], rules: Rule[]): WorldConfig {
  return {
    simVersion: SIM_VERSION,
    seed,
    width: 200,
    height: 200,
    seaLevel: 0.5,
    resourceRichness: 1,
    disasterFrequency: 1,
    civs,
    rules,
  };
}

export interface WorldPreset {
  id: string;
  name: string;
  description: string;
  config: () => WorldConfig;
}

export const WORLD_PRESETS: WorldPreset[] = [
  {
    id: 'example',
    name: 'Example World',
    description: '5 civilizations · 200×200 · balanced rules · seed 928374',
    config: () =>
      baseConfig(
        '928374',
        [
          civ('Aurelia', 0, { aggression: 20, trade: 90, science: 80, migration: 30, expansion: 40, diplomacy: 90, riskTaking: 20, birthRate: 60 }),
          civ('Boria', 1, { aggression: 90, trade: 20, science: 30, migration: 70, expansion: 90, diplomacy: 20, riskTaking: 90, birthRate: 80 }),
          civ('Kareth', 2, { aggression: 50, trade: 60, science: 60, migration: 40, expansion: 60, diplomacy: 50, riskTaking: 50, birthRate: 55 }),
          civ('Noria', 3, { aggression: 35, trade: 70, science: 45, migration: 60, expansion: 50, diplomacy: 70, riskTaking: 40, birthRate: 65 }),
          civ('Valen', 4, { aggression: 70, trade: 40, science: 70, migration: 30, expansion: 70, diplomacy: 40, riskTaking: 70, birthRate: 50 }),
        ],
        RULE_TEMPLATES[0].rules(),
      ),
  },
  {
    id: 'peaceful',
    name: 'Peaceful World',
    description: 'Diplomatic civilizations under pacifist rules. Do utopias last?',
    config: () =>
      baseConfig(
        '111111',
        [
          civ('Solara', 5, { aggression: 10, diplomacy: 90, trade: 80, science: 70 }),
          civ('Eryndor', 6, { aggression: 15, diplomacy: 85, trade: 70, science: 60 }),
          civ('Tavria', 7, { aggression: 20, diplomacy: 80, trade: 90, science: 50 }),
          civ('Lumina', 8, { aggression: 10, diplomacy: 90, trade: 60, science: 85 }),
          civ('Serath', 9, { aggression: 25, diplomacy: 75, trade: 75, science: 55 }),
        ],
        RULE_TEMPLATES[1].rules(),
      ),
  },
  {
    id: 'war',
    name: 'War World',
    description: 'Aggressive warlords under militaristic rules. Only the strong survive.',
    config: () =>
      baseConfig(
        '666666',
        [
          civ('Drakmar', 0, { aggression: 90, riskTaking: 85, expansion: 80, diplomacy: 15 }),
          civ('Vorgath', 1, { aggression: 85, riskTaking: 90, expansion: 85, diplomacy: 10 }),
          civ('Khorren', 2, { aggression: 95, riskTaking: 70, expansion: 75, diplomacy: 20 }),
          civ('Malgrim', 3, { aggression: 80, riskTaking: 80, expansion: 90, diplomacy: 15 }),
          civ('Thargol', 4, { aggression: 88, riskTaking: 75, expansion: 70, diplomacy: 25 }),
          civ('Uzgor', 5, { aggression: 92, riskTaking: 95, expansion: 80, diplomacy: 5 }),
        ],
        RULE_TEMPLATES[2].rules(),
      ),
  },
  {
    id: 'merchant',
    name: 'Merchant World',
    description: 'Trading republics under merchant rules. Gold flows, borders blur.',
    config: () =>
      baseConfig(
        '777000',
        [
          civ('Vendria', 10, { trade: 95, diplomacy: 70, aggression: 25, science: 60 }),
          civ('Ordamar', 11, { trade: 90, diplomacy: 65, aggression: 30, science: 55 }),
          civ('Silvane', 12, { trade: 85, diplomacy: 75, aggression: 20, science: 65 }),
          civ('Goldreth', 13, { trade: 92, diplomacy: 60, aggression: 35, science: 50 }),
          civ('Portia', 14, { trade: 88, diplomacy: 80, aggression: 15, science: 70 }),
        ],
        RULE_TEMPLATES[3].rules(),
      ),
  },
  {
    id: 'science',
    name: 'Science World',
    description: 'A race to Artificial Intelligence under scientific rules.',
    config: () =>
      baseConfig(
        '424242',
        [
          civ('Aurelia', 0, { science: 95, trade: 60, aggression: 20, diplomacy: 70 }),
          civ('Celesta', 6, { science: 90, trade: 55, aggression: 25, diplomacy: 65 }),
          civ('Novaris', 9, { science: 92, trade: 50, aggression: 30, diplomacy: 60 }),
          civ('Mindara', 12, { science: 88, trade: 65, aggression: 15, diplomacy: 75 }),
          civ('Quorra', 15, { science: 93, trade: 45, aggression: 35, diplomacy: 55 }),
        ],
        RULE_TEMPLATES[4].rules(),
      ),
  },
  {
    id: 'chaotic',
    name: 'Chaotic World',
    description: 'Wildly different personalities, frequent disasters, high stakes.',
    config: () => {
      const cfg = baseConfig(
        '999999',
        [
          civ('Zephyra', 0, { aggression: 90, trade: 10, science: 20, migration: 80, riskTaking: 95 }),
          civ('Placida', 5, { aggression: 5, trade: 90, science: 80, migration: 10, diplomacy: 95 }),
          civ('Vagrantis', 10, { migration: 95, expansion: 90, aggression: 50, riskTaking: 80 }),
          civ('Hermita', 8, { migration: 5, expansion: 10, science: 90, diplomacy: 20 }),
          civ('Fortuna', 3, { riskTaking: 99, aggression: 60, trade: 60, birthRate: 90 }),
          civ('Prudentia', 13, { riskTaking: 5, aggression: 20, science: 60, birthRate: 30 }),
          civ('Rapax', 1, { aggression: 85, expansion: 95, birthRate: 85, diplomacy: 10 }),
        ],
        RULE_TEMPLATES[0].rules(),
      );
      cfg.disasterFrequency = 2;
      return cfg;
    },
  },
];

export function defaultConfig(): WorldConfig {
  return WORLD_PRESETS[0].config();
}
