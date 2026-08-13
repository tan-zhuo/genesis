// The rule engine. Users compose IF/THEN rules from metrics and actions;
// every simulated year each enabled rule is evaluated per civilization and
// its action feeds the civ's yearly RuleModifiers (probability/weight nudges,
// never hard-coded outcomes).
import {
  Civilization,
  Rule,
  RuleActionType,
  RuleCondition,
  RuleMetric,
  WorldState,
} from './types';

export const RULE_METRICS: { id: RuleMetric; label: string }[] = [
  { id: 'population', label: 'Population' },
  { id: 'populationDensity', label: 'Population Density' },
  { id: 'food', label: 'Food' },
  { id: 'foodPerCapita', label: 'Food Per Capita' },
  { id: 'technology', label: 'Technology' },
  { id: 'military', label: 'Military' },
  { id: 'economy', label: 'Economy' },
  { id: 'happiness', label: 'Happiness' },
  { id: 'stability', label: 'Stability' },
  { id: 'territory', label: 'Territory' },
  { id: 'neighborStrength', label: 'Neighbor Strength' },
  { id: 'resourceAvailability', label: 'Resource Availability' },
  { id: 'year', label: 'Year' },
  { id: 'climate', label: 'Climate' },
];

export const RULE_ACTIONS: { id: RuleActionType; label: string; unit: string }[] = [
  { id: 'increasePopulation', label: 'Increase Population Growth', unit: '%' },
  { id: 'decreasePopulation', label: 'Decrease Population Growth', unit: '%' },
  { id: 'increaseMigration', label: 'Increase Migration', unit: 'pts' },
  { id: 'startTrade', label: 'Boost Trade', unit: 'pts' },
  { id: 'increaseAggression', label: 'Increase Aggression', unit: 'pts' },
  { id: 'decreaseAggression', label: 'Decrease Aggression', unit: 'pts' },
  { id: 'researchTechnology', label: 'Boost Research', unit: '%' },
  { id: 'declareWar', label: 'War Probability', unit: '+pts' },
  { id: 'seekPeace', label: 'Seek Peace', unit: 'pts' },
  { id: 'buildCity', label: 'Encourage City Building', unit: 'pts' },
  { id: 'movePopulation', label: 'Move Population', unit: 'pts' },
];

export function evaluateMetric(metric: RuleMetric, civ: Civilization, world: WorldState): number {
  switch (metric) {
    case 'population':
      return civ.population;
    case 'populationDensity':
      return civ.territory > 0 ? civ.population / civ.territory : 0;
    case 'food':
      return civ.food;
    case 'foodPerCapita':
      return civ.population > 0 ? civ.yields.food / civ.population : 0;
    case 'technology':
      return civ.technologyLevel;
    case 'military':
      return civ.military;
    case 'economy':
      return civ.economy;
    case 'happiness':
      return civ.happiness;
    case 'stability':
      return civ.stability;
    case 'territory':
      return civ.territory;
    case 'neighborStrength': {
      // Strongest neighbor military relative to ours (1 = equal)
      let maxMil = 0;
      for (const other of world.civs) {
        if (!other.alive || other.id === civ.id) continue;
        if (other.military > maxMil) maxMil = other.military;
      }
      return civ.military > 0 ? maxMil / civ.military : maxMil;
    }
    case 'resourceAvailability':
      return civ.yields.food + civ.yields.wood + civ.yields.stone + civ.yields.iron + civ.yields.gold;
    case 'year':
      return world.year;
    case 'climate': {
      // Average temperature over territory, 0-100
      if (civ.tiles.length === 0) return 50;
      let sum = 0;
      const sampleStep = Math.max(1, Math.floor(civ.tiles.length / 64));
      let count = 0;
      for (let i = 0; i < civ.tiles.length; i += sampleStep) {
        sum += world.map.temperature[civ.tiles[i]];
        count++;
      }
      return (sum / count) * 100;
    }
  }
}

function checkCondition(cond: RuleCondition, civ: Civilization, world: WorldState): boolean {
  const v = evaluateMetric(cond.metric, civ, world);
  switch (cond.op) {
    case '<':
      return v < cond.value;
    case '>':
      return v > cond.value;
    case '<=':
      return v <= cond.value;
    case '>=':
      return v >= cond.value;
    case '=':
      return Math.abs(v - cond.value) < 1e-9;
  }
}

export function ruleMatches(rule: Rule, civ: Civilization, world: WorldState): boolean {
  if (!rule.enabled || rule.conditions.length === 0) return false;
  if (rule.appliesTo !== 'all' && rule.appliesTo !== civ.id) return false;
  if (rule.logic === 'and') return rule.conditions.every((c) => checkCondition(c, civ, world));
  return rule.conditions.some((c) => checkCondition(c, civ, world));
}

/** Apply all matching rules to a civ's yearly modifiers (already reset). */
export function applyRules(world: WorldState, civ: Civilization): void {
  for (const rule of world.config.rules) {
    if (!ruleMatches(rule, civ, world)) continue;
    const amt = rule.action.amount;
    const m = civ.modifiers;
    switch (rule.action.type) {
      case 'increasePopulation':
        m.populationGrowth += amt;
        break;
      case 'decreasePopulation':
        m.populationGrowth -= amt;
        break;
      case 'increaseMigration':
        m.migration += amt;
        break;
      case 'startTrade':
        m.trade += amt;
        break;
      case 'increaseAggression':
        m.aggression += amt;
        break;
      case 'decreaseAggression':
        m.aggression -= amt;
        break;
      case 'researchTechnology':
        m.research += amt / 100;
        break;
      case 'declareWar':
        m.warProbability += amt;
        break;
      case 'seekPeace':
        m.peaceDesire += amt;
        break;
      case 'buildCity':
        m.cityFounding += amt;
        break;
      case 'movePopulation':
        m.migration += amt * 1.5;
        break;
    }
  }
}

let ruleIdCounter = 0;
export function makeRule(partial: Partial<Rule> & { name: string }): Rule {
  ruleIdCounter++;
  return {
    id: partial.id ?? `rule-${ruleIdCounter}-${partial.name.replace(/\s+/g, '-').toLowerCase()}`,
    name: partial.name,
    enabled: partial.enabled ?? true,
    logic: partial.logic ?? 'and',
    conditions: partial.conditions ?? [],
    action: partial.action ?? { type: 'increaseMigration', amount: 10 },
    appliesTo: partial.appliesTo ?? 'all',
  };
}
