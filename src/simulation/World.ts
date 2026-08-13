// World creation and core mutation helpers shared by all simulation phases.
import { SeededRandom, subRng } from './Random';
import { generateMap, findStartLocations, TERRAIN_INDEX } from './Terrain';
import { generateCivName, generateCityName, CIV_COLORS } from './names';
import { techMultipliers } from './Technology';
import {
  Civilization,
  City,
  CivConfig,
  emptyModifiers,
  RESOURCE_BIT,
  Resource,
  Tile,
  TERRAINS,
  TERRAIN_ZH,
  Traits,
  WorldConfig,
  WorldEvent,
  WorldEventType,
  WorldState,
  SIM_VERSION,
} from './types';

export const DEFAULT_TRAITS: Traits = {
  aggression: 50,
  trade: 50,
  science: 50,
  migration: 50,
  expansion: 50,
  diplomacy: 50,
  birthRate: 50,
  riskTaking: 50,
};

/** Per-tile resource yield used for cached civ yields. Deterministic, map-only. */
export function tileYields(world: WorldState, t: number): { food: number; wood: number; stone: number; iron: number; gold: number } {
  const m = world.map;
  const bits = m.resources[t];
  const fert = m.fertility[t];
  const terr = m.terrain[t];
  let food = fert * 2.2;
  let wood = 0;
  let stone = 0;
  let iron = 0;
  let gold = 0;
  if (terr === TERRAIN_INDEX.forest) wood += 0.8;
  if (terr === TERRAIN_INDEX.plains) wood += 0.25;
  if (terr === TERRAIN_INDEX.mountain) stone += 0.6;
  // Mineral output falls as the vein thins (finite-resource worlds).
  const dep = world.config.finiteResources === false ? 1 : Math.min(1, m.deposits[t] * 1.6 + 0.1);
  if (bits & RESOURCE_BIT.food) food += 1.2;
  if (bits & RESOURCE_BIT.wood) wood += 1.0;
  if (bits & RESOURCE_BIT.stone) stone += 1.0 * dep;
  if (bits & RESOURCE_BIT.iron) iron += 1.0 * dep;
  if (bits & RESOURCE_BIT.gold) gold += 1.0 * dep;
  return { food, wood, stone, iron, gold };
}

function addYields(civ: Civilization, world: WorldState, t: number, sign: number): void {
  const y = tileYields(world, t);
  civ.yields.food += y.food * sign;
  civ.yields.wood += y.wood * sign;
  civ.yields.stone += y.stone * sign;
  civ.yields.iron += y.iron * sign;
  civ.yields.gold += y.gold * sign;
}

/** Claim an unowned tile. Any wilderness/ruins population there is absorbed. */
export function claimTile(world: WorldState, civ: Civilization, t: number): void {
  const m = world.map;
  if (m.owner[t] !== -1) return;
  m.owner[t] = civ.index;
  civ.tiles.push(t);
  civ.territory++;
  const x = t % m.width;
  const y = Math.floor(t / m.width);
  civ.sumX += x;
  civ.sumY += y;
  civ.population += m.population[t]; // population conservation: absorb locals
  addYields(civ, world, t, 1);
  // Register unowned land neighbors as future expansion candidates.
  pushFrontierNeighbors(world, civ, t);
}

export function pushFrontierNeighbors(world: WorldState, civ: Civilization, t: number): void {
  const m = world.map;
  const x = t % m.width;
  const y = Math.floor(t / m.width);
  const neighbors = [
    x > 0 ? t - 1 : -1,
    x < m.width - 1 ? t + 1 : -1,
    y > 0 ? t - m.width : -1,
    y < m.height - 1 ? t + m.width : -1,
  ];
  for (const nt of neighbors) {
    if (nt < 0) continue;
    if (m.owner[nt] === -1 && m.terrain[nt] !== TERRAIN_INDEX.ocean) {
      civ.frontier.push(nt);
    }
  }
  if (civ.frontier.length > 6000) civ.frontier.splice(0, civ.frontier.length - 4000);
}

/** Transfer an owned tile between civs (conquest / secession). Handles yields, centroid, pop bookkeeping. */
export function transferTile(world: WorldState, t: number, to: Civilization, popSurvival: number): void {
  const m = world.map;
  const fromIdx = m.owner[t];
  if (fromIdx === to.index) return;
  const x = t % m.width;
  const y = Math.floor(t / m.width);
  if (fromIdx >= 0) {
    const from = world.civs[fromIdx];
    from.territory--;
    from.sumX -= x;
    from.sumY -= y;
    addYields(from, world, t, -1);
    from.population = Math.max(0, from.population - m.population[t]);
    from.tilesDirty = true;
  }
  m.population[t] *= popSurvival;
  m.owner[t] = to.index;
  to.tiles.push(t);
  to.territory++;
  to.sumX += x;
  to.sumY += y;
  addYields(to, world, t, 1);
  to.population += m.population[t];
  pushFrontierNeighbors(world, to, t);
}

/** Release a tile to wilderness (extinction). */
export function releaseTile(world: WorldState, t: number): void {
  const m = world.map;
  const fromIdx = m.owner[t];
  if (fromIdx < 0) return;
  const from = world.civs[fromIdx];
  const x = t % m.width;
  const y = Math.floor(t / m.width);
  from.territory--;
  from.sumX -= x;
  from.sumY -= y;
  addYields(from, world, t, -1);
  from.population = Math.max(0, from.population - m.population[t]);
  from.tilesDirty = true;
  m.owner[t] = -1;
  m.population[t] *= 0.5;
}

/** Drop tiles that no longer belong to the civ (lazy cleanup after conquests). */
export function compactTiles(world: WorldState, civ: Civilization): void {
  if (!civ.tilesDirty) return;
  civ.tiles = civ.tiles.filter((t) => world.map.owner[t] === civ.index);
  civ.tilesDirty = false;
}

export interface EventInput {
  year: number;
  type: WorldEventType;
  civIds: string[];
  title: string;
  description: string;
  titleZh: string;
  descriptionZh: string;
  importance: number;
  x?: number;
  y?: number;
}

export function addEvent(world: WorldState, input: EventInput): WorldEvent {
  world.eventCounter++;
  const ev: WorldEvent = {
    id: `ev-${world.eventCounter}`,
    year: input.year,
    type: input.type,
    civilizationIds: input.civIds,
    title: input.title,
    description: input.description,
    titleZh: input.titleZh,
    descriptionZh: input.descriptionZh,
    importance: input.importance,
  };
  if (input.x !== undefined) ev.x = input.x;
  if (input.y !== undefined) ev.y = input.y;
  world.events.push(ev);
  trimEvents(world.events);
  return ev;
}

/** Shared trimming so worker log and UI mirror stay consistent. */
export function trimEvents(events: WorldEvent[]): void {
  const CAP = 8000;
  if (events.length <= CAP) return;
  // Drop the least important events from the older half.
  const half = Math.floor(events.length / 2);
  const removable = events
    .slice(0, half)
    .filter((e) => e.importance < 7)
    .sort((a, b) => a.importance - b.importance)
    .slice(0, events.length - CAP + 200);
  const ids = new Set(removable.map((e) => e.id));
  let w = 0;
  for (let i = 0; i < events.length; i++) {
    if (!ids.has(events[i].id)) events[w++] = events[i];
  }
  events.length = w;
}

export function ensureRelations(world: WorldState): void {
  const n = world.civs.length;
  while (world.relations.length < n) {
    world.relations.push(new Array(n).fill(0));
    world.alliances.push(new Array(n).fill(false));
  }
  for (let i = 0; i < n; i++) {
    while (world.relations[i].length < n) {
      world.relations[i].push(0);
      world.alliances[i].push(false);
    }
  }
}

let cityNamePool: Set<string> | null = null;

export function createCivilization(
  world: WorldState,
  cfg: { name: string; color: string; traits: Traits; startPopulation: number; startTechs: string[] },
  foundedYear: number,
  parentId: string | null,
): Civilization {
  const index = world.civs.length;
  const civ: Civilization = {
    id: `civ-${index}`,
    index,
    name: cfg.name,
    color: cfg.color,
    population: cfg.startPopulation,
    territory: 0,
    food: 500,
    wood: 100,
    stone: 50,
    iron: 0,
    gold: 50,
    technologyLevel: cfg.startTechs.length,
    researchedTechs: [...cfg.startTechs],
    researchProgress: 0,
    military: 10,
    economy: 20,
    happiness: 60,
    stability: 70,
    culture: 20,
    diplomacy: cfg.traits.diplomacy,
    aggression: cfg.traits.aggression,
    tradePreference: cfg.traits.trade,
    migrationPreference: cfg.traits.migration,
    sciencePreference: cfg.traits.science,
    traits: { ...cfg.traits },
    foundedYear,
    capitalCityId: null,
    cityIds: [],
    alive: true,
    deathYear: null,
    ascended: false,
    ascendingSince: null,
    faith: {
      devotion: 0,
      doctrine: null,
      doctrineYear: 0,
      pendingPrayer: null,
      lastPrayerYear: -1000,
      miracles: 0,
      wraths: 0,
    },
    memory: { wars: 0, disasters: 0, famineYears: 0 },
    tiles: [],
    frontier: [],
    sumX: 0,
    sumY: 0,
    isEmpire: false,
    warYears: 0,
    yields: { food: 0, wood: 0, stone: 0, iron: 0, gold: 0 },
    foodPenaltyUntil: -1,
    foodPenaltyMult: 1,
    lowStabilityYears: 0,
    modifiers: emptyModifiers(),
    parentId,
    tilesDirty: false,
    denseTile: -1,
  };
  world.civs.push(civ);
  ensureRelations(world);
  world.civHistories[civ.id] = { years: [], population: [], territory: [], technology: [], economy: [], military: [] };
  return civ;
}

export function foundCity(world: WorldState, civ: Civilization, t: number, year: number, rng: SeededRandom): City {
  if (!cityNamePool) cityNamePool = new Set();
  const m = world.map;
  const index = world.cities.length;
  const name = generateCityName(rng, cityNamePool);
  const city: City = {
    id: `city-${index}`,
    index,
    name,
    ownerId: civ.id,
    x: t % m.width,
    y: Math.floor(t / m.width),
    tile: t,
    population: m.population[t],
    level: 'village',
    foodProduction: 0,
    industry: 0,
    science: 0,
    foundedYear: year,
    destroyed: false,
  };
  world.cities.push(city);
  m.city[t] = index;
  civ.cityIds.push(city.id);
  if (!civ.capitalCityId) {
    civ.capitalCityId = city.id;
    city.level = 'capital';
  }
  return city;
}

/** Reset the module-level city-name pool (called at world creation for determinism). */
export function resetNamePools(): void {
  cityNamePool = new Set();
}

export function createWorld(config: WorldConfig): WorldState {
  resetNamePools();
  const map = generateMap(config);
  const world: WorldState = {
    version: SIM_VERSION,
    config,
    seed: config.seed,
    year: 0,
    map,
    civs: [],
    cities: [],
    relations: [],
    alliances: [],
    wars: [],
    tradeRoutes: [],
    events: [],
    eventCounter: 0,
    stats: [],
    civHistories: {},
    totalWars: 0,
    totalTradeDeals: 0,
    disasters: [],
    epitaphs: [],
    godName: null,
    mapVersion: 0,
    co2: 280,
    tempAnomaly: 0,
    appliedAnomaly: 0,
    climateMilestone: 0,
    baseTemperature: map.temperature.slice(),
  };

  const rng = subRng(config.seed, 'world-init');
  const starts = findStartLocations(map, config.civs.length, rng);

  for (let i = 0; i < config.civs.length; i++) {
    const cc = config.civs[i];
    const civ = createCivilization(world, cc, 0, null);
    const start = starts[i];
    if (start === undefined) continue;
    // Claim a small starting blob around the origin tile.
    claimTile(world, civ, start);
    const sx = start % map.width;
    const sy = Math.floor(start / map.width);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = sx + dx;
        const ny = sy + dy;
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
        const nt = ny * map.width + nx;
        if (map.owner[nt] === -1 && map.terrain[nt] !== TERRAIN_INDEX.ocean) {
          claimTile(world, civ, nt);
        }
      }
    }
    // Distribute starting population over claimed tiles.
    const per = civ.population / civ.tiles.length;
    for (const t of civ.tiles) map.population[t] = per;

    const terrainEn = TERRAINS[map.terrain[start]];
    const terrainZh = TERRAIN_ZH[terrainEn];
    addEvent(world, {
      year: 0,
      type: 'birth',
      civIds: [civ.id],
      title: `${civ.name} founded`,
      description: `The people of ${civ.name} settled in a ${terrainEn} region and began their history.`,
      titleZh: `${civ.name} 建立`,
      descriptionZh: `${civ.name}的人民在一片${terrainZh}地带定居下来，开启了他们的历史。`,
      importance: 7,
      x: sx,
      y: sy,
    });
  }

  return world;
}

/** Random full civ config used by the "randomize" button and split events. */
export function randomCivConfig(rng: SeededRandom, taken: Set<string>, colorIndex: number): CivConfig {
  const traits: Traits = {
    aggression: rng.nextInt(10, 90),
    trade: rng.nextInt(10, 90),
    science: rng.nextInt(10, 90),
    migration: rng.nextInt(10, 90),
    expansion: rng.nextInt(10, 90),
    diplomacy: rng.nextInt(10, 90),
    birthRate: rng.nextInt(30, 80),
    riskTaking: rng.nextInt(10, 90),
  };
  return {
    name: generateCivName(rng, taken),
    color: CIV_COLORS[colorIndex % CIV_COLORS.length],
    startPopulation: rng.nextInt(800, 2000),
    traits,
    startTechs: ['survival'],
  };
}

/** Build the spec-shaped Tile object for the UI inspector. */
export function getTile(world: WorldState, x: number, y: number): Tile | null {
  const m = world.map;
  if (x < 0 || y < 0 || x >= m.width || y >= m.height) return null;
  const t = y * m.width + x;
  const bits = m.resources[t];
  const res: Resource[] = [];
  if (bits & RESOURCE_BIT.food) res.push('food');
  if (bits & RESOURCE_BIT.wood) res.push('wood');
  if (bits & RESOURCE_BIT.stone) res.push('stone');
  if (bits & RESOURCE_BIT.iron) res.push('iron');
  if (bits & RESOURCE_BIT.gold) res.push('gold');
  const ownerIdx = m.owner[t];
  const cityIdx = m.city[t];
  return {
    x,
    y,
    terrain: TERRAINS[m.terrain[t]],
    fertility: m.fertility[t],
    temperature: m.temperature[t],
    moisture: m.moisture[t],
    elevation: m.elevation[t],
    resources: res,
    ownerId: ownerIdx >= 0 ? world.civs[ownerIdx].id : null,
    population: m.population[t],
    cityId: cityIdx >= 0 ? world.cities[cityIdx].id : null,
  };
}

/** Full yield recompute for one civ (after the map itself changed). */
export function recomputeYields(world: WorldState, civ: Civilization): void {
  civ.yields = { food: 0, wood: 0, stone: 0, iron: 0, gold: 0 };
  if (!civ.alive) return;
  for (const t of civ.tiles) {
    if (world.map.owner[t] !== civ.index) continue;
    const y = tileYields(world, t);
    civ.yields.food += y.food;
    civ.yields.wood += y.wood;
    civ.yields.stone += y.stone;
    civ.yields.iron += y.iron;
    civ.yields.gold += y.gold;
  }
}

/** Effective military strength index, recomputed each year in the economy phase. */
export function computeMilitary(civ: Civilization): number {
  const tech = techMultipliers(civ.researchedTechs);
  const base = Math.sqrt(Math.max(0, civ.population)) * 0.35;
  const ironFactor = 1 + Math.min(1, civ.iron / 2000) * 0.5;
  const aggrFactor = 0.6 + (civ.traits.aggression / 100) * 0.8;
  const econFactor = 0.7 + (civ.economy / 100) * 0.6;
  return base * tech.military * ironFactor * aggrFactor * econFactor;
}
