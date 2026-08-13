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
  cost: number;
  requirements: string[];
  effects: TechEffects;
  blurb: string;
}

export const TECHNOLOGIES: Technology[] = [
  { id: 'survival', name: 'Survival', cost: 10, requirements: [], effects: {}, blurb: 'Fire, tools, and shelter — the first spark.' },
  { id: 'agriculture', name: 'Agriculture', cost: 60, requirements: ['survival'], effects: { foodMult: 1.3, popGrowthMult: 1.1 }, blurb: 'Food production +30%, population growth +10%.' },
  { id: 'writing', name: 'Writing', cost: 200, requirements: ['agriculture'], effects: { cultureMult: 1.2, scienceMult: 1.1 }, blurb: 'Culture +20%, science +10%.' },
  { id: 'metallurgy', name: 'Metallurgy', cost: 500, requirements: ['writing'], effects: { militaryMult: 1.25, industryMult: 1.2 }, blurb: 'Military +25%, industry +20%.' },
  { id: 'engineering', name: 'Engineering', cost: 1200, requirements: ['metallurgy'], effects: { industryMult: 1.3, foodMult: 1.15 }, blurb: 'Industry +30%, food +15%.' },
  { id: 'navigation', name: 'Navigation', cost: 2500, requirements: ['engineering'], effects: { economyMult: 1.25, navalRange: true }, blurb: 'Economy +25%, ocean trade unlocked.' },
  { id: 'gunpowder', name: 'Gunpowder', cost: 5000, requirements: ['navigation'], effects: { militaryMult: 1.5 }, blurb: 'Military +50%.' },
  { id: 'industry', name: 'Industry', cost: 11000, requirements: ['gunpowder'], effects: { industryMult: 2, popCapacityMult: 1.5, foodMult: 1.3 }, blurb: 'Production +100%, population capacity +50%.' },
  { id: 'electricity', name: 'Electricity', cost: 20000, requirements: ['industry'], effects: { economyMult: 1.5, scienceMult: 1.3 }, blurb: 'Economy +50%, science +30%.' },
  { id: 'computing', name: 'Computing', cost: 35000, requirements: ['electricity'], effects: { scienceMult: 2 }, blurb: 'Science +100%.' },
  { id: 'ai', name: 'Artificial Intelligence', cost: 60000, requirements: ['computing'], effects: { scienceMult: 3, economyMult: 2 }, blurb: 'Science +200%, economy +100%.' },
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

export function techEraName(count: number): string {
  if (count <= 1) return 'Primitive';
  if (count <= 2) return 'Agrarian';
  if (count <= 4) return 'Classical';
  if (count <= 6) return 'Medieval';
  if (count <= 7) return 'Renaissance';
  if (count <= 8) return 'Industrial';
  if (count <= 10) return 'Modern';
  return 'Information';
}
