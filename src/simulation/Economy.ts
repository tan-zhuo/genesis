// Economy, happiness, stability, culture, military index, research,
// and territorial expansion.
import { SeededRandom } from './Random';
import { nextTech, techMultipliers, TECH_BY_ID } from './Technology';
import { TERRAIN_INDEX } from './Terrain';
import { demonym } from './names';
import { Civilization, WorldState } from './types';
import { addEvent, claimTile, computeMilitary } from './World';

export function runEconomy(world: WorldState, civ: Civilization, foodRatio: number): void {
  const tech = techMultipliers(civ.researchedTechs);

  // Economy: resource wealth + cities + trade routes + tech
  let cityIndustry = 0;
  for (const cid of civ.cityIds) {
    const c = world.cities[parseInt(cid.slice(5), 10)];
    if (c && !c.destroyed && c.ownerId === civ.id) cityIndustry += c.industry;
  }
  const routeCount = world.tradeRoutes.filter((r) => r.fromId === civ.id || r.toId === civ.id).length;
  const resourceScore =
    civ.yields.food * 0.5 + civ.yields.wood + civ.yields.stone + civ.yields.iron * 1.5 + civ.yields.gold * 2;
  const target = Math.min(
    100,
    (resourceScore * 0.35 + cityIndustry * 0.12 + routeCount * 6 + (civ.traits.trade / 100) * 10) * tech.economy * 0.35,
  );
  civ.economy += (target - civ.economy) * 0.08;

  // Happiness
  const density = civ.population / Math.max(1, civ.territory);
  let happyTarget = 50;
  happyTarget += Math.max(-25, Math.min(20, (foodRatio - 1) * 40));
  happyTarget -= civ.warYears * 3;
  happyTarget -= Math.max(0, density - 500) * 0.01;
  happyTarget += civ.culture * 0.15;
  happyTarget += civ.economy * 0.1;
  happyTarget = Math.max(0, Math.min(100, happyTarget));
  civ.happiness += (happyTarget - civ.happiness) * 0.1;

  // Culture grows with tech + cities, capped
  civ.culture = Math.min(100, civ.culture + 0.02 * tech.culture * (1 + civ.cityIds.length * 0.1));

  // Stability: pulled by happiness, hurt by war and over-extension
  const sizeStrain = Math.max(0, civ.territory - (200 + civ.culture * 12 + civ.technologyLevel * 60)) * 0.02;
  let stabTarget = civ.happiness * 0.8 + 20 - civ.warYears * 4 - sizeStrain;
  stabTarget = Math.max(0, Math.min(100, stabTarget));
  civ.stability += (stabTarget - civ.stability) * 0.07;

  // Military index
  const targetMil = computeMilitary(civ);
  civ.military += (targetMil - civ.military) * 0.15;
  if (!Number.isFinite(civ.military) || civ.military < 0) civ.military = 0;
}

export function runResearch(world: WorldState, civ: Civilization, rng: SeededRandom): void {
  const tech = techMultipliers(civ.researchedTechs);
  const upcoming = nextTech(civ.researchedTechs);
  if (!upcoming) return;

  let cityScience = 0;
  for (const cid of civ.cityIds) {
    const c = world.cities[parseInt(cid.slice(5), 10)];
    if (c && !c.destroyed && c.ownerId === civ.id) cityScience += c.science;
  }

  const popFactor = Math.log10(Math.max(10, civ.population)); // 1..~8
  const points =
    (popFactor * 0.8 + Math.sqrt(Math.max(0, cityScience)) * 1.1 + civ.economy * 0.02) *
    (0.3 + civ.traits.science / 70) *
    tech.science *
    (1 + civ.modifiers.research) *
    rng.range(0.9, 1.1);
  civ.researchProgress += Math.max(0, points);

  if (civ.researchProgress >= upcoming.cost) {
    civ.researchProgress -= upcoming.cost;
    civ.researchedTechs.push(upcoming.id);
    civ.technologyLevel = civ.researchedTechs.length;
    const t = TECH_BY_ID.get(upcoming.id);
    addEvent(
      world,
      world.year,
      'technology',
      [civ.id],
      `${civ.name} discovers ${upcoming.name}`,
      `The ${demonym(civ.name)} mastered ${upcoming.name}. ${t?.blurb ?? ''}`,
      upcoming.id === 'agriculture' || upcoming.id === 'industry' || upcoming.id === 'ai' ? 7 : 5,
    );
  }
}

export function runExpansion(world: WorldState, civ: Civilization, rng: SeededRandom): void {
  const m = world.map;
  if (civ.territory === 0) return;
  const density = civ.population / Math.max(1, civ.territory);
  const drive =
    ((civ.traits.expansion + civ.modifiers.expansion) / 100) * 0.5 +
    Math.min(0.5, density / 900) +
    (civ.traits.riskTaking / 100) * 0.1;
  let claims = 0;
  const maxClaims = drive > 0.75 ? 3 : drive > 0.45 ? 2 : 1;
  if (!rng.chance(Math.min(0.95, drive))) return;

  while (claims < maxClaims && civ.frontier.length > 0) {
    // Examine a window of frontier candidates, claim the most fertile.
    const windowSize = Math.min(30, civ.frontier.length);
    let bestI = -1;
    let bestScore = -Infinity;
    for (let i = civ.frontier.length - windowSize; i < civ.frontier.length; i++) {
      const t = civ.frontier[i];
      if (m.owner[t] !== -1 || m.terrain[t] === TERRAIN_INDEX.ocean) continue;
      const score = m.fertility[t] + (m.resources[t] ? 0.3 : 0) + m.river[t] * 0.2;
      if (score > bestScore) {
        bestScore = score;
        bestI = i;
      }
    }
    if (bestI < 0) {
      // Window was all stale; drop it and retry once.
      civ.frontier.length = Math.max(0, civ.frontier.length - windowSize);
      if (civ.frontier.length === 0) break;
      continue;
    }
    const tile = civ.frontier[bestI];
    civ.frontier.splice(bestI, 1);
    claimTile(world, civ, tile);
    // Seed settlers from the densest tile so new land actually has people.
    if (civ.denseTile >= 0 && m.owner[civ.denseTile] === civ.index) {
      const settlers = Math.min(m.population[civ.denseTile] * 0.04, 300);
      m.population[civ.denseTile] -= settlers;
      m.population[tile] += settlers;
    }
    claims++;
  }
}
