// Economy, happiness, stability, culture, military index, research,
// and territorial expansion.
import { SeededRandom } from './Random';
import { availableTechs, techCost, techMultipliers, TechCategory, Technology, TECH_BY_ID } from './Technology';
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

/**
 * What a civilization chooses to research is shaped by where it lives, how it
 * lives, and what it believes — coastal traders reach for sails and banks,
 * mountain warlords for bronze and gunpowder, crowded river valleys for
 * irrigation and medicine.
 */
function researchWeight(world: WorldState, civ: Civilization, tech: Technology): number {
  // Geography sample (deterministic stride over owned tiles)
  const m = world.map;
  let coast = 0;
  let mountain = 0;
  let river = 0;
  let sampled = 0;
  const nTiles = civ.tiles.length;
  const step = Math.max(1, Math.floor(nTiles / 30));
  for (let i = 0; i < nTiles; i += step) {
    const t = civ.tiles[i];
    if (m.owner[t] !== civ.index) continue;
    sampled++;
    const x = t % m.width;
    const y = Math.floor(t / m.width);
    if (m.terrain[t] === 4) mountain++;
    if (m.river[t]) river++;
    if (
      (x > 0 && m.terrain[t - 1] === 0) ||
      (x < m.width - 1 && m.terrain[t + 1] === 0) ||
      (y > 0 && m.terrain[t - m.width] === 0) ||
      (y < m.height - 1 && m.terrain[t + m.width] === 0)
    ) {
      coast++;
    }
  }
  const denom = Math.max(1, sampled);
  const coastFrac = coast / denom;
  const mountainFrac = mountain / denom;
  const riverFrac = river / denom;
  const density = civ.population / Math.max(1, civ.territory);
  const doctrine = civ.faith.doctrine;

  let w = 1;
  const cat: TechCategory = tech.category;
  if (cat === 'maritime') {
    w += coastFrac * 6;
    if (coastFrac < 0.02) w *= 0.08; // a landlocked nation has no use for sails
  } else if (cat === 'military') {
    w += civ.traits.aggression / 45 + civ.memory.wars * 0.15;
    if (doctrine === 'war' || doctrine === 'storm') w += 1.2;
  } else if (cat === 'agrarian') {
    w += riverFrac * 3 + Math.max(0, 1 - civ.yields.food / Math.max(1, civ.population / 180));
    if (doctrine === 'harvest') w += 1.2;
  } else if (cat === 'economy') {
    w += civ.traits.trade / 40;
    if (doctrine === 'gold') w += 1.5;
  } else if (cat === 'knowledge') {
    w += civ.traits.science / 40;
    if (doctrine === 'void') w += 1.5;
  } else if (cat === 'industry') {
    w += mountainFrac * 3 + civ.economy / 80;
  } else if (cat === 'health') {
    w += Math.min(2.5, density / 400) + civ.memory.disasters * 0.2;
    if (doctrine === 'ash') w += 0.8;
  } else if (cat === 'apex') {
    w += civ.traits.science / 30;
  }
  return Math.max(0.05, w);
}

export function runResearch(world: WorldState, civ: Civilization, rng: SeededRandom): void {
  const tech = techMultipliers(civ.researchedTechs);

  // Pick (or re-pick) a research target via geography/culture-weighted choice.
  if (!civ.currentResearch || civ.researchedTechs.includes(civ.currentResearch)) {
    const candidates = availableTechs(civ.researchedTechs);
    if (candidates.length === 0) return;
    const weights = candidates.map((c) => researchWeight(world, civ, c));
    let total = 0;
    for (const w of weights) total += w;
    let roll = rng.next() * total;
    let chosen = candidates[0];
    for (let i = 0; i < candidates.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        chosen = candidates[i];
        break;
      }
    }
    civ.currentResearch = chosen.id;
    civ.researchProgress = 0;
  }

  const upcoming = TECH_BY_ID.get(civ.currentResearch);
  if (!upcoming) {
    civ.currentResearch = null;
    return;
  }

  let cityScience = 0;
  for (const cid of civ.cityIds) {
    const c = world.cities[parseInt(cid.slice(5), 10)];
    if (c && !c.destroyed && c.ownerId === civ.id) cityScience += c.science;
  }

  const popFactor = Math.log10(Math.max(10, civ.population)); // 1..~8
  const points =
    (popFactor * 0.5 + Math.sqrt(Math.max(0, cityScience)) * 0.7 + civ.economy * 0.015) *
    (0.3 + civ.traits.science / 70) *
    tech.science *
    (1 + civ.modifiers.research) *
    rng.range(0.9, 1.1);
  civ.researchProgress += Math.max(0, points);

  const cost = techCost(upcoming);
  if (civ.researchProgress >= cost) {
    civ.researchProgress = 0;
    civ.researchedTechs.push(upcoming.id);
    civ.technologyLevel = civ.researchedTechs.length;
    civ.currentResearch = null;
    addEvent(world, {
      year: world.year,
      type: 'technology',
      civIds: [civ.id],
      title: `${civ.name} discovers ${upcoming.name}`,
      description: `The ${demonym(civ.name)} mastered ${upcoming.name}.`,
      titleZh: `${civ.name}掌握了「${upcoming.nameZh}」`,
      descriptionZh: `${civ.name}人掌握了${upcoming.nameZh}。`,
      importance: ['agriculture', 'writing', 'gunpowder', 'industry', 'electricity', 'ai', 'spaceflight', 'transcendence'].includes(upcoming.id) ? 7 : 4,
    });
  }
}

/**
 * The Age of Sail: a coastal nation with sailing (short range) or navigation
 * (open ocean) can load settlers onto ships and found a colony on a distant,
 * unclaimed shore — from there, normal expansion devours the new continent.
 */
function runColonization(world: WorldState, civ: Civilization, rng: SeededRandom): void {
  const tech = techMultipliers(civ.researchedTechs);
  const hasSail = civ.researchedTechs.includes('sailing');
  if (!hasSail && !tech.naval) return;
  const m = world.map;

  // Pressure to leave: crowded land or an exhausted frontier.
  const density = civ.population / Math.max(1, civ.territory);
  const pressure = Math.min(1, density / 500) + (civ.frontier.length < 5 ? 0.5 : 0) + civ.traits.expansion / 300;
  if (!rng.chance(0.012 * pressure * (0.5 + civ.traits.riskTaking / 150))) return;

  // A port is required: at least one owned coastal tile.
  let hasPort = false;
  const checkN = Math.min(40, civ.tiles.length);
  for (let s = 0; s < checkN; s++) {
    const t = civ.tiles[Math.floor((s / checkN) * civ.tiles.length)];
    if (m.owner[t] !== civ.index) continue;
    const x = t % m.width;
    const y = Math.floor(t / m.width);
    if (
      (x > 0 && m.terrain[t - 1] === 0) ||
      (x < m.width - 1 && m.terrain[t + 1] === 0) ||
      (y > 0 && m.terrain[t - m.width] === 0) ||
      (y < m.height - 1 && m.terrain[t + m.width] === 0)
    ) {
      hasPort = true;
      break;
    }
  }
  if (!hasPort) return;

  const cx = civ.sumX / Math.max(1, civ.territory);
  const cy = civ.sumY / Math.max(1, civ.territory);
  const range = tech.naval ? Math.max(m.width, m.height) : Math.min(m.width, m.height) * 0.3;

  // Scout candidate shores (deterministic sample of the world's coasts).
  let best = -1;
  let bestScore = 0.25;
  const tries = 30;
  for (let k = 0; k < tries; k++) {
    const t = world.coastalTiles[rng.nextInt(0, world.coastalTiles.length - 1)];
    if (m.owner[t] !== -1 || m.terrain[t] === 0) continue;
    const x = t % m.width;
    const y = Math.floor(t / m.width);
    const d = Math.hypot(x - cx, y - cy);
    if (d < 12 || d > range) continue; // too close = walk there; too far = beyond the ships
    const score = m.fertility[t] * (1 - (d / range) * 0.4);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  if (best < 0) return;

  // Land the settlers: claim a beachhead and move people onto it.
  const bx = best % m.width;
  const by = Math.floor(best / m.width);
  let claimed = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = bx + dx;
      const ny = by + dy;
      if (nx < 0 || ny < 0 || nx >= m.width || ny >= m.height) continue;
      const t = ny * m.width + nx;
      if (m.owner[t] === -1 && m.terrain[t] !== TERRAIN_INDEX.ocean) {
        claimTile(world, civ, t);
        claimed++;
      }
    }
  }
  if (claimed === 0) return;
  if (civ.denseTile >= 0 && m.owner[civ.denseTile] === civ.index) {
    const settlers = Math.min(m.population[civ.denseTile] * 0.15, 900);
    m.population[civ.denseTile] -= settlers;
    m.population[best] += settlers;
  }
  addEvent(world, {
    year: world.year,
    type: 'migration',
    civIds: [civ.id],
    title: `${civ.name} founds an overseas colony`,
    description: `Settler ships from ${civ.name} crossed the open sea and raised their flag on a distant shore. A new world begins to fill.`,
    titleZh: `${civ.name}建立海外殖民地`,
    descriptionZh: `${civ.name}的殖民船队横渡大洋，在遥远的海岸升起了旗帜。新大陆开始有了人烟。`,
    importance: 6,
    x: bx,
    y: by,
  });
}

export function runExpansion(world: WorldState, civ: Civilization, rng: SeededRandom): void {
  const m = world.map;
  if (civ.territory === 0) return;
  runColonization(world, civ, rng);
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
