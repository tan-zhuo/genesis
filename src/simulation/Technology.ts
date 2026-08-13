// A simple linear technology tree. Research emerges from simulation
// conditions (population, science preference, economy) — never from fixed years.

export interface TechEffects {
  foodMult?: number;
  popGrowthMult?: number;
  cultureMult?: number;
  scienceMult?: number;
  militaryMult?: number;
  industryMult?: number;
  economyMult?: number;
  popCapacityMult?: number;
  navalRange?: boolean;
}

export interface Technology {
  id: string;
  name: string;
  nameZh: string;
  cost: number;
  requirements: string[];
  effects: TechEffects;
  blurb: string;
  blurbZh: string;
}

export const TECHNOLOGIES: Technology[] = [
  { id: 'survival', name: 'Survival', nameZh: '生存', cost: 10, requirements: [], effects: {}, blurb: 'Fire, tools, and shelter — the first spark.', blurbZh: '火、工具与庇护所 — 文明的第一粒火种。' },
  { id: 'agriculture', name: 'Agriculture', nameZh: '农业', cost: 60, requirements: ['survival'], effects: { foodMult: 1.3, popGrowthMult: 1.1 }, blurb: 'Food production +30%, population growth +10%.', blurbZh: '粮食产量 +30%，人口增长 +10%。' },
  { id: 'writing', name: 'Writing', nameZh: '文字', cost: 200, requirements: ['agriculture'], effects: { cultureMult: 1.2, scienceMult: 1.1 }, blurb: 'Culture +20%, science +10%.', blurbZh: '文化 +20%，科研 +10%。' },
  { id: 'metallurgy', name: 'Metallurgy', nameZh: '冶金', cost: 500, requirements: ['writing'], effects: { militaryMult: 1.25, industryMult: 1.2 }, blurb: 'Military +25%, industry +20%.', blurbZh: '军事 +25%，工业 +20%。' },
  { id: 'engineering', name: 'Engineering', nameZh: '工程学', cost: 1200, requirements: ['metallurgy'], effects: { industryMult: 1.3, foodMult: 1.15 }, blurb: 'Industry +30%, food +15%.', blurbZh: '工业 +30%，粮食 +15%。' },
  { id: 'navigation', name: 'Navigation', nameZh: '航海', cost: 2500, requirements: ['engineering'], effects: { economyMult: 1.25, navalRange: true }, blurb: 'Economy +25%, ocean trade unlocked.', blurbZh: '经济 +25%，解锁跨洋贸易。' },
  { id: 'gunpowder', name: 'Gunpowder', nameZh: '火药', cost: 5000, requirements: ['navigation'], effects: { militaryMult: 1.5 }, blurb: 'Military +50%.', blurbZh: '军事 +50%。' },
  { id: 'industry', name: 'Industry', nameZh: '工业化', cost: 11000, requirements: ['gunpowder'], effects: { industryMult: 2, popCapacityMult: 1.5, foodMult: 1.3 }, blurb: 'Production +100%, population capacity +50%.', blurbZh: '生产 +100%，人口容量 +50%。' },
  { id: 'electricity', name: 'Electricity', nameZh: '电力', cost: 20000, requirements: ['industry'], effects: { economyMult: 1.5, scienceMult: 1.3 }, blurb: 'Economy +50%, science +30%.', blurbZh: '经济 +50%，科研 +30%。' },
  { id: 'computing', name: 'Computing', nameZh: '计算机', cost: 35000, requirements: ['electricity'], effects: { scienceMult: 2 }, blurb: 'Science +100%.', blurbZh: '科研 +100%。' },
  { id: 'ai', name: 'Artificial Intelligence', nameZh: '人工智能', cost: 60000, requirements: ['computing'], effects: { scienceMult: 3, economyMult: 2 }, blurb: 'Science +200%, economy +100%.', blurbZh: '科研 +200%，经济 +100%。' },
];

export const TECH_BY_ID: Map<string, Technology> = new Map(TECHNOLOGIES.map((t) => [t.id, t]));

export function nextTech(researched: string[]): Technology | null {
  for (const tech of TECHNOLOGIES) {
    if (researched.includes(tech.id)) continue;
    if (tech.requirements.every((r) => researched.includes(r))) return tech;
  }
  return null;
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
  naval: boolean;
}

export function techMultipliers(researched: string[]): TechMultipliers {
  const m: TechMultipliers = { food: 1, popGrowth: 1, culture: 1, science: 1, military: 1, industry: 1, economy: 1, popCapacity: 1, naval: false };
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
    if (e.navalRange) m.naval = true;
  }
  return m;
}

/** Era key for the i18n dictionary (`era.<key>`). */
export function techEraKey(count: number): string {
  if (count <= 1) return 'primitive';
  if (count <= 2) return 'agrarian';
  if (count <= 4) return 'classical';
  if (count <= 6) return 'medieval';
  if (count <= 7) return 'renaissance';
  if (count <= 8) return 'industrial';
  if (count <= 10) return 'modern';
  return 'information';
}
