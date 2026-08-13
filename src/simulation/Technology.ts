// The human technology web: 37 real technologies in a dependency DAG.
// Civilizations do NOT walk a fixed ladder — each one picks its next research
// by weighted choice, biased by geography (coasts, mountains, rivers, soil),
// population pressure, traits, and doctrine. Two nations in the same world
// grow different trees.

export type TechCategory =
  | 'agrarian'
  | 'craft'
  | 'knowledge'
  | 'military'
  | 'maritime'
  | 'economy'
  | 'industry'
  | 'health'
  | 'apex';

export interface TechEffects {
  foodMult?: number;
  popGrowthMult?: number;
  cultureMult?: number;
  scienceMult?: number;
  militaryMult?: number;
  industryMult?: number;
  economyMult?: number;
  popCapacityMult?: number;
  healthMult?: number; // divides the death rate
  navalRange?: boolean;
}

export interface Technology {
  id: string;
  name: string;
  nameZh: string;
  tier: number; // 0..10 — sets cost and era
  category: TechCategory;
  requirements: string[]; // ALL must be researched
  effects: TechEffects;
}

const TIER_COST = [10, 70, 200, 480, 1100, 2400, 5200, 10000, 19000, 60000, 150000];

export function techCost(t: Technology): number {
  if (t.id === 'transcendence') return 400000;
  if (t.id === 'fusion') return 70000;
  return TIER_COST[Math.min(t.tier, TIER_COST.length - 1)];
}

// prettier-ignore
export const TECHNOLOGIES: Technology[] = [
  { id: 'survival', name: 'Survival', nameZh: '生存', tier: 0, category: 'craft', requirements: [], effects: {} },

  // -- Neolithic --
  { id: 'agriculture', name: 'Agriculture', nameZh: '农业', tier: 1, category: 'agrarian', requirements: ['survival'], effects: { foodMult: 1.3, popGrowthMult: 1.1 } },
  { id: 'animal-husbandry', name: 'Animal Husbandry', nameZh: '畜牧', tier: 1, category: 'agrarian', requirements: ['survival'], effects: { foodMult: 1.12 } },
  { id: 'pottery', name: 'Pottery', nameZh: '制陶', tier: 1, category: 'craft', requirements: ['survival'], effects: { cultureMult: 1.1, foodMult: 1.05 } },
  { id: 'fishing', name: 'Fishing', nameZh: '渔猎', tier: 1, category: 'maritime', requirements: ['survival'], effects: { foodMult: 1.1 } },
  { id: 'weaving', name: 'Weaving', nameZh: '纺织', tier: 1, category: 'craft', requirements: ['survival'], effects: { economyMult: 1.08 } },

  // -- Bronze age --
  { id: 'irrigation', name: 'Irrigation', nameZh: '灌溉', tier: 2, category: 'agrarian', requirements: ['agriculture'], effects: { foodMult: 1.2 } },
  { id: 'mining', name: 'Mining', nameZh: '采矿', tier: 2, category: 'industry', requirements: ['pottery'], effects: { industryMult: 1.15 } },
  { id: 'metallurgy', name: 'Bronze Working', nameZh: '青铜冶炼', tier: 2, category: 'military', requirements: ['mining'], effects: { militaryMult: 1.2, industryMult: 1.1 } },
  { id: 'wheel', name: 'The Wheel', nameZh: '车轮', tier: 2, category: 'economy', requirements: ['animal-husbandry'], effects: { economyMult: 1.1 } },
  { id: 'sailing', name: 'Sailing', nameZh: '帆船', tier: 2, category: 'maritime', requirements: ['fishing'], effects: { economyMult: 1.1 } },
  { id: 'writing', name: 'Writing', nameZh: '文字', tier: 2, category: 'knowledge', requirements: ['agriculture'], effects: { cultureMult: 1.2, scienceMult: 1.1 } },
  { id: 'masonry', name: 'Masonry', nameZh: '石作', tier: 2, category: 'craft', requirements: ['mining'], effects: { industryMult: 1.1 } },

  // -- Classical --
  { id: 'iron-working', name: 'Iron Working', nameZh: '冶铁', tier: 3, category: 'military', requirements: ['metallurgy'], effects: { militaryMult: 1.25 } },
  { id: 'mathematics', name: 'Mathematics', nameZh: '数学', tier: 3, category: 'knowledge', requirements: ['writing'], effects: { scienceMult: 1.2 } },
  { id: 'currency', name: 'Currency', nameZh: '货币', tier: 3, category: 'economy', requirements: ['writing', 'wheel'], effects: { economyMult: 1.2 } },
  { id: 'philosophy', name: 'Philosophy', nameZh: '哲学', tier: 3, category: 'knowledge', requirements: ['writing'], effects: { cultureMult: 1.25, scienceMult: 1.1 } },
  { id: 'medicine', name: 'Medicine', nameZh: '医术', tier: 3, category: 'health', requirements: ['philosophy'], effects: { healthMult: 1.12 } },
  { id: 'roads', name: 'Roads', nameZh: '道路', tier: 3, category: 'economy', requirements: ['wheel', 'masonry'], effects: { economyMult: 1.15 } },
  { id: 'astronomy', name: 'Astronomy', nameZh: '天文学', tier: 3, category: 'knowledge', requirements: ['mathematics'], effects: { scienceMult: 1.15 } },
  { id: 'siegecraft', name: 'Siegecraft', nameZh: '攻城术', tier: 3, category: 'military', requirements: ['masonry', 'metallurgy'], effects: { militaryMult: 1.15 } },

  // -- Medieval --
  { id: 'navigation', name: 'Navigation', nameZh: '航海', tier: 4, category: 'maritime', requirements: ['sailing', 'astronomy'], effects: { economyMult: 1.25, navalRange: true } },
  { id: 'engineering', name: 'Engineering', nameZh: '工程学', tier: 4, category: 'industry', requirements: ['mathematics', 'iron-working'], effects: { industryMult: 1.3, foodMult: 1.1 } },
  { id: 'printing', name: 'Printing Press', nameZh: '印刷术', tier: 4, category: 'knowledge', requirements: ['philosophy'], effects: { scienceMult: 1.3, cultureMult: 1.15 } },
  { id: 'gunpowder', name: 'Gunpowder', nameZh: '火药', tier: 4, category: 'military', requirements: ['iron-working', 'siegecraft'], effects: { militaryMult: 1.5 } },
  { id: 'banking', name: 'Banking', nameZh: '银行', tier: 4, category: 'economy', requirements: ['currency'], effects: { economyMult: 1.25 } },
  { id: 'universities', name: 'Universities', nameZh: '大学', tier: 4, category: 'knowledge', requirements: ['philosophy', 'mathematics'], effects: { scienceMult: 1.25 } },

  // -- Renaissance --
  { id: 'cartography', name: 'Cartography', nameZh: '制图学', tier: 5, category: 'maritime', requirements: ['navigation', 'printing'], effects: { economyMult: 1.12 } },
  { id: 'optics', name: 'Optics', nameZh: '光学', tier: 5, category: 'knowledge', requirements: ['universities'], effects: { scienceMult: 1.12 } },
  { id: 'scientific-method', name: 'Scientific Method', nameZh: '科学方法', tier: 5, category: 'knowledge', requirements: ['printing', 'universities'], effects: { scienceMult: 1.5 } },
  { id: 'chemistry', name: 'Chemistry', nameZh: '化学', tier: 5, category: 'knowledge', requirements: ['optics', 'scientific-method'], effects: { scienceMult: 1.2 } },

  // -- Industrial --
  { id: 'steam-engine', name: 'Steam Engine', nameZh: '蒸汽机', tier: 6, category: 'industry', requirements: ['scientific-method', 'engineering'], effects: { industryMult: 1.5 } },
  { id: 'industry', name: 'Factory System', nameZh: '工厂体系', tier: 6, category: 'industry', requirements: ['steam-engine'], effects: { industryMult: 2, popCapacityMult: 1.5, foodMult: 1.3 } },
  { id: 'railroads', name: 'Railroads', nameZh: '铁路', tier: 6, category: 'economy', requirements: ['steam-engine', 'roads'], effects: { economyMult: 1.4 } },
  { id: 'vaccination', name: 'Vaccination', nameZh: '疫苗', tier: 6, category: 'health', requirements: ['medicine', 'chemistry'], effects: { healthMult: 1.25, popGrowthMult: 1.1 } },

  // -- Modern --
  { id: 'electricity', name: 'Electricity', nameZh: '电力', tier: 7, category: 'industry', requirements: ['industry', 'scientific-method'], effects: { economyMult: 1.5, scienceMult: 1.3 } },
  { id: 'internal-combustion', name: 'Internal Combustion', nameZh: '内燃机', tier: 7, category: 'economy', requirements: ['industry', 'chemistry'], effects: { economyMult: 1.3 } },
  { id: 'flight', name: 'Flight', nameZh: '飞行', tier: 7, category: 'military', requirements: ['internal-combustion'], effects: { militaryMult: 1.3, economyMult: 1.15 } },
  { id: 'antibiotics', name: 'Antibiotics', nameZh: '抗生素', tier: 7, category: 'health', requirements: ['vaccination'], effects: { healthMult: 1.35 } },
  { id: 'radio', name: 'Radio', nameZh: '无线电', tier: 7, category: 'knowledge', requirements: ['electricity'], effects: { scienceMult: 1.2, cultureMult: 1.2 } },

  // -- Information --
  { id: 'computing', name: 'Computing', nameZh: '计算机', tier: 8, category: 'knowledge', requirements: ['electricity', 'mathematics'], effects: { scienceMult: 2 } },
  { id: 'internet', name: 'Internet', nameZh: '互联网', tier: 8, category: 'knowledge', requirements: ['computing', 'radio'], effects: { scienceMult: 1.4, economyMult: 1.3 } },
  { id: 'genetics', name: 'Genetic Engineering', nameZh: '基因工程', tier: 8, category: 'health', requirements: ['antibiotics', 'computing'], effects: { healthMult: 1.3, foodMult: 1.15 } },

  // -- Apex --
  { id: 'ai', name: 'Artificial Intelligence', nameZh: '人工智能', tier: 9, category: 'apex', requirements: ['computing', 'internet'], effects: { scienceMult: 3, economyMult: 2 } },
  { id: 'fusion', name: 'Fusion Power', nameZh: '聚变能源', tier: 9, category: 'apex', requirements: ['ai'], effects: { industryMult: 1.5, economyMult: 1.4 } },
  { id: 'spaceflight', name: 'Spaceflight', nameZh: '星际航行', tier: 10, category: 'apex', requirements: ['ai', 'flight'], effects: { scienceMult: 1.5, economyMult: 1.5 } },
  { id: 'transcendence', name: 'Dimensional Transcendence', nameZh: '维度跃迁', tier: 10, category: 'apex', requirements: ['spaceflight', 'fusion', 'genetics'], effects: {} },
];

export const TECH_COUNT = TECHNOLOGIES.length;
export const TECH_BY_ID: Map<string, Technology> = new Map(TECHNOLOGIES.map((t) => [t.id, t]));
export const MAX_TIER = 10;

/** All techs whose requirements are satisfied and are not yet researched. */
export function availableTechs(researched: string[]): Technology[] {
  const has = new Set(researched);
  return TECHNOLOGIES.filter((t) => !has.has(t.id) && t.requirements.every((r) => has.has(r)));
}

/** Combined multiplicative effects of a researched tech list. */
export interface TechMultipliers {
  food: number;
  popGrowth: number;
  culture: number;
  science: number;
  military: number;
  industry: number;
  economy: number;
  popCapacity: number;
  health: number;
  naval: boolean;
}

export function techMultipliers(researched: string[]): TechMultipliers {
  const m: TechMultipliers = { food: 1, popGrowth: 1, culture: 1, science: 1, military: 1, industry: 1, economy: 1, popCapacity: 1, health: 1, naval: false };
  for (const id of researched) {
    const t = TECH_BY_ID.get(id);
    if (!t) continue;
    const e = t.effects;
    if (e.foodMult) m.food *= e.foodMult;
    if (e.popGrowthMult) m.popGrowth *= e.popGrowthMult;
    if (e.cultureMult) m.culture *= e.cultureMult;
    if (e.scienceMult) m.science *= e.scienceMult;
    if (e.militaryMult) m.military *= e.militaryMult;
    if (e.industryMult) m.industry *= e.industryMult;
    if (e.economyMult) m.economy *= e.economyMult;
    if (e.popCapacityMult) m.popCapacity *= e.popCapacityMult;
    if (e.healthMult) m.health *= e.healthMult;
    if (e.navalRange) m.naval = true;
  }
  return m;
}

/** Highest tier a civilization has reached. */
export function techTier(researched: string[]): number {
  let tier = 0;
  for (const id of researched) {
    const t = TECH_BY_ID.get(id);
    if (t && t.tier > tier) tier = t.tier;
  }
  return tier;
}

/** Era key for the i18n dictionary (`era.<key>`), from the tech list. */
export function techEraKeyOf(researched: string[]): string {
  if (researched.includes('transcendence')) return 'transcendent';
  if (researched.includes('spaceflight')) return 'stellar';
  const tier = techTier(researched);
  if (tier <= 0) return 'primitive';
  if (tier === 1) return 'agrarian';
  if (tier <= 3) return 'classical';
  if (tier === 4) return 'medieval';
  if (tier === 5) return 'renaissance';
  if (tier === 6) return 'industrial';
  if (tier === 7) return 'modern';
  return 'information';
}
