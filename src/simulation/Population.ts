// Aggregate (macro) population model: food production, births, deaths,
// and per-tile distribution. No per-person agents.
import { SeededRandom } from './Random';
import { techMultipliers } from './Technology';
import { Civilization, WorldState } from './types';
import { compactTiles } from './World';

const BASE_FOOD_PER_TILE = 220; // people one unit of tile food yield can feed
const BASE_CAPACITY_PER_YIELD = 200;

export interface FoodReport {
  produced: number;
  needed: number;
  ratio: number; // produced / needed, clamped to [0, 2]
}

export function produceFood(world: WorldState, civ: Civilization): FoodReport {
  const tech = techMultipliers(civ.researchedTechs);
  let mult = tech.food;
  if (world.year <= civ.foodPenaltyUntil) mult *= civ.foodPenaltyMult;
  const produced = civ.yields.food * BASE_FOOD_PER_TILE * mult;
  const needed = Math.max(1, civ.population);
  const ratio = Math.max(0, Math.min(2, produced / needed));

  // Stockpile: surplus saved (with spoilage), deficit drawn down.
  const delta = produced - needed;
  civ.food = Math.max(0, Math.min(civ.population * 2 + 1000, civ.food * 0.98 + delta * 0.5));

  // Other resource stockpiles accumulate slowly, capped to avoid runaway numbers.
  const ind = tech.industry;
  // Spaceflight: orbital mining — the planet is finite, the sky is not.
  const orbital = civ.researchedTechs.includes('spaceflight') ? 6 : 0;
  civ.wood = Math.min(1e7, civ.wood + civ.yields.wood * 2 * ind);
  civ.stone = Math.min(1e7, civ.stone + (civ.yields.stone + orbital * 0.7) * 1.5 * ind);
  civ.iron = Math.min(1e7, civ.iron + (civ.yields.iron + orbital) * 1.2 * ind);
  civ.gold = Math.min(1e9, civ.gold + (civ.yields.gold + orbital * 0.5) * 1.0 * ind + civ.economy * 0.2);

  return { produced, needed, ratio };
}

export function growPopulation(world: WorldState, civ: Civilization, food: FoodReport, rng: SeededRandom): void {
  const tech = techMultipliers(civ.researchedTechs);
  const t = civ.traits;

  // Carrying capacity from territory food yield
  const capacity = Math.max(200, civ.yields.food * BASE_CAPACITY_PER_YIELD * tech.food * tech.popCapacity);
  const crowding = civ.population / capacity; // >1 = overcrowded

  // Births: logistic — birth rate collapses as population nears capacity,
  // so civilizations stabilize near abundance instead of overshooting into famine.
  const foodFactor = food.ratio >= 1 ? 1 + Math.min(0.3, (food.ratio - 1) * 0.4) : Math.pow(Math.max(0.05, food.ratio), 0.7);
  const happinessFactor = 0.6 + (civ.happiness / 100) * 0.6;
  const birthRate =
    0.04 * (0.5 + t.birthRate / 100) * foodFactor * happinessFactor * tech.popGrowth * Math.max(0, 1 - crowding * 0.72);

  // Deaths
  let deathRate = 0.019;
  if (food.ratio < 0.75) {
    deathRate += (0.75 - food.ratio) * 0.12; // true famine
    civ.memory.famineYears++;
  }
  if (crowding > 1.15) deathRate += Math.min(0.04, (crowding - 1.15) * 0.05); // density disease
  if (civ.warYears > 0) deathRate += 0.004; // wartime attrition beyond battle losses
  deathRate *= 0.9 + rng.next() * 0.2; // small deterministic yearly variance

  // Rule-driven growth modifier (percentage points on net growth)
  const ruleMod = civ.modifiers.populationGrowth / 100;
  let growth = birthRate - deathRate + ruleMod;
  growth = Math.max(-0.25, Math.min(0.12, growth));

  const before = civ.population;
  let after = before * (1 + growth);
  if (!Number.isFinite(after) || after < 0) after = 0;
  after = Math.min(after, 5e8); // hard sanity cap
  civ.population = after;

  // Distribute across tiles, tracking the densest tile for expansion seeding.
  // We rescale against the *actual* tile sum (not `before`) so the map and the
  // aggregate reconverge every year even after wars/disasters touched only one
  // of the two.
  compactTiles(world, civ);
  const pop = world.map.population;
  let denseTile = -1;
  let densePop = -1;
  let tileSum = 0;
  for (const tile of civ.tiles) tileSum += pop[tile];
  if (tileSum > 0 && civ.tiles.length > 0) {
    const ratio = after / tileSum;
    for (const tile of civ.tiles) {
      pop[tile] *= ratio;
      if (pop[tile] > densePop) {
        densePop = pop[tile];
        denseTile = tile;
      }
    }
  } else if (civ.tiles.length > 0 && after > 0) {
    const per = after / civ.tiles.length;
    for (const tile of civ.tiles) {
      pop[tile] = per;
      if (per > densePop) {
        densePop = per;
        denseTile = tile;
      }
    }
  }
  civ.denseTile = denseTile;
}
