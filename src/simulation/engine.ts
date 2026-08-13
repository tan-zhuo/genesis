// The simulation engine: one call = one simulated year, with a strictly
// fixed phase order so deterministic replay is reliable.
//
//  1. Rules            -> yearly modifiers
//  2. Disasters        -> regional damage
//  3. Food & resources -> production from cached territory yields
//  4. Population       -> births/deaths, per-tile distribution
//  5. Migration        -> people move to better land
//  6. Cities           -> founding & growth
//  7. Research         -> technology emerges from conditions
//  8. Economy          -> economy/happiness/stability/culture/military
//  9. Trade            -> exchanges + trade routes
// 10. Diplomacy        -> relations, alliances
// 11. War declarations
// 12. War resolution   -> battles, conquest, peace, extinction
// 13. Expansion        -> frontier claims
// 14. Empire/Collapse  -> empires rise, unstable ones split
// 15. Extinction check
// 16. Statistics
import { yearRng } from './Random';
import { applyRules } from './Rules';
import { produceFood, growPopulation } from './Population';
import { runMigration } from './Migration';
import { runCities } from './City';
import { runEconomy, runResearch, runExpansion } from './Economy';
import { runTrade, runDiplomacy } from './Diplomacy';
import { runWarDeclarations, runWars, checkExtinction } from './Warfare';
import { runAscension, runEmpireAndCollapse, runRebirth, seedCivNames } from './Collapse';
import { runDisasters } from './Events';
import { runInterventions } from './Intervention';
import { runDepletion } from './Depletion';
import { runFaith } from './Faith';
import { createWorld as createWorldBase } from './World';
import { emptyModifiers, WorldConfig, WorldState } from './types';
import { TERRAIN_INDEX } from './Terrain';

export function createWorld(config: WorldConfig): WorldState {
  seedCivNames(config.civs.map((c) => c.name));
  return createWorldBase(config);
}

export function countLandTiles(world: WorldState): number {
  let land = 0;
  const terr = world.map.terrain;
  for (let i = 0; i < terr.length; i++) if (terr[i] !== TERRAIN_INDEX.ocean) land++;
  return land;
}

const HISTORY_SAMPLE_INTERVAL = 4;

export function simulateYear(world: WorldState): WorldState {
  world.year++;
  const year = world.year;
  const rng = yearRng(world.seed, year);

  // 0. Divine interventions recorded for this year (deterministic on replay)
  runInterventions(world, rng);

  // 1. Rules
  for (const civ of world.civs) {
    civ.modifiers = emptyModifiers();
    if (civ.alive) applyRules(world, civ);
  }

  // 2. Disasters
  runDisasters(world, rng);

  // 3-8: per-civ phases in fixed index order
  const foodRatios: number[] = new Array(world.civs.length).fill(1);
  for (const civ of world.civs) {
    if (!civ.alive) continue;
    const food = produceFood(world, civ);
    foodRatios[civ.index] = food.ratio;
    growPopulation(world, civ, food, rng);
  }
  for (const civ of world.civs) {
    if (!civ.alive) continue;
    runMigration(world, civ, foodRatios[civ.index], rng);
  }
  for (const civ of world.civs) {
    if (!civ.alive) continue;
    runCities(world, civ, rng);
  }
  for (const civ of world.civs) {
    if (!civ.alive) continue;
    runResearch(world, civ, rng);
  }
  for (const civ of world.civs) {
    if (!civ.alive) continue;
    runEconomy(world, civ, foodRatios[civ.index]);
  }

  // 9-12: interactions
  runTrade(world, rng);
  runDiplomacy(world, rng);
  runWarDeclarations(world, rng);
  runWars(world, rng);

  // 13. Expansion
  for (const civ of world.civs) {
    if (!civ.alive) continue;
    runExpansion(world, civ, rng);
  }

  // 14. Empire & collapse
  const landTiles = world.landTilesCache ?? (world.landTilesCache = countLandTiles(world));
  const civCount = world.civs.length; // splits append; don't process newborns this year
  for (let i = 0; i < civCount; i++) {
    runEmpireAndCollapse(world, world.civs[i], landTiles, rng);
  }

  // 14.5 Finite resources: mines, forests, soil
  runDepletion(world, rng);
  if (world.config.finiteResources !== false && world.year % 25 === 0) world.mapVersion++;

  // 14.7 Transcendence: the way out of a finite world
  runAscension(world, rng);

  // 15. Extinction sweep, then possible rebirth from the wilderness
  for (const civ of world.civs) {
    if (!civ.ascended) checkExtinction(world, civ);
  }
  runRebirth(world, rng);

  // 16. Faith, prayers, doctrine, philosophers
  runFaith(world, rng);

  // 17. Statistics
  recordStats(world);

  return world;
}

function recordStats(world: WorldState): void {
  let population = 0;
  let civilizations = 0;
  let cities = 0;
  let technologies = 0;
  for (const civ of world.civs) {
    if (!civ.alive) continue;
    civilizations++;
    population += civ.population;
    technologies = Math.max(technologies, civ.technologyLevel);
  }
  for (const c of world.cities) {
    if (!c.destroyed) {
      const owner = world.civs[parseInt(c.ownerId.slice(4), 10)];
      if (owner?.alive) cities++;
    }
  }
  let alliances = 0;
  for (let i = 0; i < world.civs.length; i++) {
    for (let j = i + 1; j < world.civs.length; j++) {
      if (world.alliances[i]?.[j]) alliances++;
    }
  }
  const activeWars = world.wars.filter((w) => w.endYear === null).length;
  world.stats.push({
    year: world.year,
    population,
    civilizations,
    cities,
    wars: activeWars,
    alliances,
    technologies,
  });

  if (world.year % HISTORY_SAMPLE_INTERVAL === 0 || world.year === 1) {
    for (const civ of world.civs) {
      const h = world.civHistories[civ.id];
      if (!h) continue;
      if (!civ.alive && h.years.length > 0 && h.population[h.population.length - 1] === 0) continue;
      h.years.push(world.year);
      h.population.push(Math.round(civ.population));
      h.territory.push(civ.territory);
      h.technology.push(civ.technologyLevel);
      h.economy.push(Math.round(civ.economy * 10) / 10);
      h.military.push(Math.round(civ.military * 10) / 10);
    }
  }
}

/** Run N years (used by tests and run-to-year). */
export function simulateYears(world: WorldState, years: number): WorldState {
  for (let i = 0; i < years; i++) simulateYear(world);
  return world;
}
