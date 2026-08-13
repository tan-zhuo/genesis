// Build the render payload the worker posts to the UI thread.
// Long series are decimated before sending so snapshots stay light even
// after 10,000 simulated years.
import { techCost, TECH_BY_ID } from './Technology';
import { relationStatus } from './Diplomacy';
import {
  CivHistory,
  CivSummary,
  CitySummary,
  MapStatic,
  RelationSummary,
  Snapshot,
  WarSummary,
  WorldEvent,
  WorldState,
  YearStats,
} from './types';
import { countLandTiles } from './engine';

function decimate<T>(arr: T[], maxLen: number): T[] {
  if (arr.length <= maxLen) return arr;
  const out: T[] = [];
  const step = arr.length / maxLen;
  for (let i = 0; i < maxLen; i++) out.push(arr[Math.floor(i * step)]);
  out[out.length - 1] = arr[arr.length - 1];
  return out;
}

function decimateHistory(h: CivHistory, maxLen: number): CivHistory {
  if (h.years.length <= maxLen) return h;
  const idx: number[] = [];
  const step = h.years.length / maxLen;
  for (let i = 0; i < maxLen; i++) idx.push(Math.floor(i * step));
  idx[idx.length - 1] = h.years.length - 1;
  return {
    years: idx.map((i) => h.years[i]),
    population: idx.map((i) => h.population[i]),
    territory: idx.map((i) => h.territory[i]),
    technology: idx.map((i) => h.technology[i]),
    economy: idx.map((i) => h.economy[i]),
    military: idx.map((i) => h.military[i]),
  };
}

export function buildMapStatic(world: WorldState): MapStatic {
  const m = world.map;
  return {
    width: m.width,
    height: m.height,
    terrain: m.terrain.slice(),
    elevation: m.elevation.slice(),
    fertility: m.fertility.slice(),
    temperature: m.temperature.slice(),
    moisture: m.moisture.slice(),
    resources: m.resources.slice(),
    river: m.river.slice(),
  };
}

export function buildSnapshot(
  world: WorldState,
  running: boolean,
  speed: number,
  newEvents: WorldEvent[],
  includeMapUpdate = false,
): Snapshot {
  const landTiles = countLandTiles(world);
  const civs: CivSummary[] = world.civs.map((c) => {
    const upcoming = c.currentResearch ? TECH_BY_ID.get(c.currentResearch) : null;
    return {
      id: c.id,
      name: c.name,
      color: c.color,
      population: c.population,
      territory: c.territory,
      territoryPct: landTiles > 0 ? (c.territory / landTiles) * 100 : 0,
      technologyLevel: c.technologyLevel,
      researchedTechs: [...c.researchedTechs],
      researchProgress: c.researchProgress,
      currentResearch: c.currentResearch,
      nextTechCost: upcoming ? techCost(upcoming) : 0,
      military: c.military,
      economy: c.economy,
      happiness: c.happiness,
      stability: c.stability,
      culture: c.culture,
      food: c.food,
      wood: c.wood,
      stone: c.stone,
      iron: c.iron,
      gold: c.gold,
      traits: { ...c.traits },
      foundedYear: c.foundedYear,
      deathYear: c.deathYear,
      alive: c.alive,
      cityCount: c.cityIds.length,
      capitalCityId: c.capitalCityId,
      foodPerCapita: c.population > 0 ? c.yields.food / c.population : 0,
      cx: c.territory > 0 ? c.sumX / c.territory : 0,
      cy: c.territory > 0 ? c.sumY / c.territory : 0,
      devotion: c.faith.devotion,
      doctrine: c.faith.doctrine,
      pendingPrayer: c.faith.pendingPrayer ? { ...c.faith.pendingPrayer } : null,
      ascended: c.ascended,
    };
  });

  const cities: CitySummary[] = world.cities
    .filter((c) => !c.destroyed)
    .map((c) => ({
      id: c.id,
      name: c.name,
      ownerId: c.ownerId,
      ownerColor: world.civs[parseInt(c.ownerId.slice(4), 10)]?.color ?? '#888',
      x: c.x,
      y: c.y,
      population: c.population,
      level: c.level,
      foundedYear: c.foundedYear,
      foodProduction: c.foodProduction,
      industry: c.industry,
      science: c.science,
    }));

  const relations: RelationSummary[] = [];
  for (let i = 0; i < world.civs.length; i++) {
    if (!world.civs[i].alive) continue;
    for (let j = i + 1; j < world.civs.length; j++) {
      if (!world.civs[j].alive) continue;
      relations.push({
        a: world.civs[i].id,
        b: world.civs[j].id,
        value: world.relations[i][j],
        status: relationStatus(world, i, j),
      });
    }
  }

  const wars: WarSummary[] = world.wars.slice(-80).map((w) => ({
    id: w.id,
    name: w.name,
    attackerId: w.attackerId,
    defenderId: w.defenderId,
    startYear: w.startYear,
    endYear: w.endYear,
    warScore: w.warScore,
  }));

  const stats: YearStats[] = decimate(world.stats, 800);
  const civHistories: Record<string, CivHistory> = {};
  for (const [id, h] of Object.entries(world.civHistories)) {
    civHistories[id] = decimateHistory(h, 500);
  }

  return {
    year: world.year,
    running,
    speed,
    owner: world.map.owner.slice(),
    population: world.map.population.slice(),
    civs,
    cities,
    relations,
    wars,
    tradeRoutes: [...world.tradeRoutes],
    stats,
    civHistories,
    events: newEvents,
    landTiles,
    interventions: [...(world.config.interventions ?? [])],
    epitaphs: [...world.epitaphs],
    godName: world.godName ? { ...world.godName } : null,
    ...(includeMapUpdate
      ? {
          mapUpdate: {
            version: world.mapVersion,
            terrain: world.map.terrain.slice(),
            resources: world.map.resources.slice(),
            fertility: world.map.fertility.slice(),
          },
        }
      : {}),
  };
}
