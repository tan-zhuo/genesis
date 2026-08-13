// Core shared types for the simulation engine.
// The engine is pure TypeScript: it must never import React or DOM types.

export const SIM_VERSION = '1.3.0';

export type Terrain = 'ocean' | 'plains' | 'forest' | 'desert' | 'mountain' | 'tundra';

export const TERRAINS: Terrain[] = ['ocean', 'plains', 'forest', 'desert', 'mountain', 'tundra'];

export const TERRAIN_ZH: Record<Terrain, string> = {
  ocean: '海洋',
  plains: '平原',
  forest: '森林',
  desert: '沙漠',
  mountain: '山地',
  tundra: '冻原',
};

export type Resource = 'food' | 'wood' | 'stone' | 'iron' | 'gold';
export const RESOURCES: Resource[] = ['food', 'wood', 'stone', 'iron', 'gold'];

// Resource bitmask bits (stored per tile as a Uint8)
export const RESOURCE_BIT: Record<Resource, number> = {
  food: 1,
  wood: 2,
  stone: 4,
  iron: 8,
  gold: 16,
};

/** Object view of a single tile (built on demand; storage is typed arrays). */
export interface Tile {
  x: number;
  y: number;
  terrain: Terrain;
  fertility: number;
  temperature: number;
  moisture: number;
  elevation: number;
  resources: Resource[];
  ownerId: string | null;
  population: number;
  cityId: string | null;
}

/** Structure-of-arrays map storage for performance. */
export interface WorldMap {
  width: number;
  height: number;
  terrain: Uint8Array; // index into TERRAINS
  elevation: Float32Array;
  temperature: Float32Array;
  moisture: Float32Array;
  fertility: Float32Array;
  resources: Uint8Array; // bitmask
  river: Uint8Array; // 1 if a river passes through
  owner: Int16Array; // civ index or -1
  population: Float32Array;
  city: Int16Array; // city index or -1
  deposits: Float32Array; // finite-resource reserves (minerals) / forest health, 0..~1.3
}

export interface Traits {
  aggression: number; // 0-100
  trade: number;
  science: number;
  migration: number;
  expansion: number;
  diplomacy: number;
  birthRate: number;
  riskTaking: number;
}

export const TRAIT_KEYS: (keyof Traits)[] = [
  'aggression',
  'trade',
  'science',
  'migration',
  'expansion',
  'diplomacy',
  'birthRate',
  'riskTaking',
];

/** Per-year modifiers produced by the rule engine; reset every simulated year. */
export interface RuleModifiers {
  birthRate: number; // additive percentage points
  migration: number;
  aggression: number;
  warProbability: number;
  peaceDesire: number;
  trade: number;
  research: number; // multiplier delta (+0.2 = +20%)
  expansion: number;
  cityFounding: number;
  populationGrowth: number;
}

export function emptyModifiers(): RuleModifiers {
  return {
    birthRate: 0,
    migration: 0,
    aggression: 0,
    warProbability: 0,
    peaceDesire: 0,
    trade: 0,
    research: 0,
    expansion: 0,
    cityFounding: 0,
    populationGrowth: 0,
  };
}

export interface Civilization {
  id: string;
  index: number;
  name: string;
  color: string;

  population: number;
  territory: number; // tile count

  food: number;
  wood: number;
  stone: number;
  iron: number;
  gold: number;

  technologyLevel: number; // number of researched techs
  researchedTechs: string[];
  researchProgress: number;

  military: number; // 0-100 scale-ish strength index
  economy: number; // 0-100
  happiness: number; // 0-100
  stability: number; // 0-100
  culture: number; // 0-100
  diplomacy: number; // trait copy for convenience (0-100)

  aggression: number;
  tradePreference: number;
  migrationPreference: number;
  sciencePreference: number;

  traits: Traits;

  foundedYear: number;
  capitalCityId: string | null;
  cityIds: string[];

  alive: boolean;
  deathYear: number | null;
  ascended: boolean; // left this world through transcendence (not extinction)
  ascendingSince: number | null; // year the portal opened

  // faith & memory (the philosophical layer)
  faith: {
    devotion: number; // -100 (defiant) .. 100 (devout) — attitude toward the observer
    doctrine: string | null; // adopted doctrine id (see Faith.ts)
    doctrineYear: number;
    pendingPrayer: { year: number; kind: 'famine' | 'war' | 'plague' | 'decline' } | null;
    lastPrayerYear: number;
    miracles: number; // nurturing interventions received
    wraths: number; // destructive interventions received
  };
  memory: { wars: number; disasters: number; famineYears: number };

  // internal engine bookkeeping
  tiles: number[]; // owned tile indices (order = deterministic claim order)
  frontier: number[]; // candidate expansion tile indices
  sumX: number; // territory centroid accumulators
  sumY: number;
  tilesDirty: boolean; // tiles array needs compaction after losses
  denseTile: number; // most-populated tile (updated each growth pass)
  isEmpire: boolean;
  warYears: number; // consecutive years at war (war weariness)
  yields: { food: number; wood: number; stone: number; iron: number; gold: number };
  foodPenaltyUntil: number; // disaster effect
  foodPenaltyMult: number;
  lowStabilityYears: number;
  modifiers: RuleModifiers;
  parentId: string | null;
}

export type CityLevel = 'village' | 'town' | 'city' | 'capital';

export interface City {
  id: string;
  index: number;
  name: string;
  ownerId: string;
  x: number;
  y: number;
  tile: number;
  population: number;
  level: CityLevel;
  foodProduction: number;
  industry: number;
  science: number;
  foundedYear: number;
  destroyed: boolean;
}

export type WorldEventType =
  | 'birth'
  | 'city-founded'
  | 'city-captured'
  | 'technology'
  | 'war'
  | 'peace'
  | 'trade'
  | 'migration'
  | 'revolution'
  | 'split'
  | 'collapse'
  | 'extinction'
  | 'disaster'
  | 'alliance'
  | 'empire'
  | 'divine'
  | 'prayer'
  | 'faith'
  | 'philosophy'
  | 'ascension';

// ---- Divine interventions (the player's hand) ----
// Interventions are part of the world's "recipe": they are recorded with the
// year they take effect and replayed deterministically on reset/replay/branch.
export type InterventionType =
  | 'meteor'
  | 'plague'
  | 'quake'
  | 'bless'
  | 'blight'
  | 'spawnCiv'
  | 'inciteWar'
  | 'forcePeace'
  | 'goldenAge';

export interface Intervention {
  id: string;
  year: number; // takes effect at the START of this simulated year
  type: InterventionType;
  x?: number;
  y?: number;
}

export interface WorldEvent {
  id: string;
  year: number;
  type: WorldEventType;
  civilizationIds: string[];
  title: string; // English
  description: string; // English
  titleZh?: string; // 中文标题（生成时写入，与显示语言无关，保证确定性）
  descriptionZh?: string; // 中文描述
  importance: number; // 1-10
  x?: number;
  y?: number;
}

export type DiplomaticStatus = 'war' | 'hostile' | 'neutral' | 'friendly' | 'alliance';

export interface War {
  id: string;
  attackerId: string;
  defenderId: string;
  startYear: number;
  endYear: number | null;
  warScore: number; // + favors attacker
  name: string;
}

export interface TradeRoute {
  fromId: string;
  toId: string;
  give: Resource;
  receive: Resource;
  sinceYear: number;
}

// ---- Rules ----

export type RuleMetric =
  | 'population'
  | 'populationDensity'
  | 'food'
  | 'foodPerCapita'
  | 'technology'
  | 'military'
  | 'economy'
  | 'happiness'
  | 'stability'
  | 'territory'
  | 'neighborStrength'
  | 'resourceAvailability'
  | 'year'
  | 'climate';

export type RuleOperator = '<' | '>' | '<=' | '>=' | '=';

export type RuleActionType =
  | 'increasePopulation'
  | 'decreasePopulation'
  | 'increaseMigration'
  | 'startTrade'
  | 'increaseAggression'
  | 'decreaseAggression'
  | 'researchTechnology'
  | 'declareWar'
  | 'seekPeace'
  | 'buildCity'
  | 'movePopulation';

export interface RuleCondition {
  metric: RuleMetric;
  op: RuleOperator;
  value: number;
}

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  logic: 'and' | 'or';
  conditions: RuleCondition[];
  action: { type: RuleActionType; amount: number };
  appliesTo: 'all' | string; // 'all' or a civ id
}

// ---- Config ----

export interface CivConfig {
  name: string;
  color: string;
  startPopulation: number;
  traits: Traits;
  startTechs: string[];
}

export interface WorldConfig {
  simVersion: string;
  seed: string;
  width: number;
  height: number;
  seaLevel: number; // 0..1, default 0.5
  resourceRichness: number; // 0..2
  disasterFrequency: number; // 0..2
  civs: CivConfig[];
  rules: Rule[];
  interventions?: Intervention[];
  finiteResources?: boolean; // default true: mines exhaust, forests fall, soil tires
  continents?: number; // 0/undefined = auto (2-5); otherwise 1-6 separated landmasses
}

// ---- Statistics / history ----

export interface YearStats {
  year: number;
  population: number;
  civilizations: number;
  cities: number;
  wars: number;
  alliances: number;
  technologies: number;
  co2: number; // ppm
  tempAnomaly: number; // °C above pre-industrial
}

export interface CivHistory {
  years: number[];
  population: number[];
  territory: number[];
  technology: number[];
  economy: number[];
  military: number[];
}

export interface Epitaph {
  ascended?: boolean; // a monument, not a grave
  civId: string;
  name: string;
  color: string;
  x: number;
  y: number;
  foundedYear: number;
  deathYear: number;
  textEn: string;
  textZh: string;
}

export interface GodName {
  id: string; // title id from Faith.ts
  sinceYear: number;
}

export interface WorldState {
  version: string;
  config: WorldConfig;
  seed: string;
  year: number;
  map: WorldMap;
  civs: Civilization[];
  cities: City[];
  relations: number[][]; // [i][j] -100..100
  alliances: boolean[][];
  wars: War[];
  tradeRoutes: TradeRoute[];
  events: WorldEvent[];
  eventCounter: number;
  stats: YearStats[];
  civHistories: Record<string, CivHistory>;
  totalWars: number;
  totalTradeDeals: number;
  disasters: { untilYear: number; x: number; y: number; radius: number; type: string }[];
  epitaphs: Epitaph[];
  godName: GodName | null;
  mapVersion: number; // bumped when terrain/resources/fertility mutate
  co2: number; // atmospheric CO2, ppm
  tempAnomaly: number; // °C vs pre-industrial
  appliedAnomaly: number; // last anomaly applied to the map
  climateMilestone: number; // last whole-degree milestone announced
  baseTemperature: Float32Array; // pre-industrial temperature field
  landTilesCache?: number;
}

// ---- Snapshot sent from worker to UI ----

export interface CivSummary {
  id: string;
  name: string;
  color: string;
  population: number;
  territory: number;
  territoryPct: number;
  technologyLevel: number;
  researchedTechs: string[];
  researchProgress: number;
  nextTechCost: number;
  military: number;
  economy: number;
  happiness: number;
  stability: number;
  culture: number;
  food: number;
  wood: number;
  stone: number;
  iron: number;
  gold: number;
  traits: Traits;
  foundedYear: number;
  deathYear: number | null;
  alive: boolean;
  cityCount: number;
  capitalCityId: string | null;
  foodPerCapita: number;
  cx: number; // territory centroid (map coords)
  cy: number;
  devotion: number;
  doctrine: string | null;
  pendingPrayer: { year: number; kind: string } | null;
  ascended: boolean;
}

export interface CitySummary {
  id: string;
  name: string;
  ownerId: string;
  ownerColor: string;
  x: number;
  y: number;
  population: number;
  level: CityLevel;
  foundedYear: number;
  foodProduction: number;
  industry: number;
  science: number;
}

export interface RelationSummary {
  a: string;
  b: string;
  value: number;
  status: DiplomaticStatus;
}

export interface WarSummary {
  id: string;
  name: string;
  attackerId: string;
  defenderId: string;
  startYear: number;
  endYear: number | null;
  warScore: number;
}

export interface Snapshot {
  year: number;
  running: boolean;
  speed: number;
  owner: Int16Array;
  population: Float32Array;
  civs: CivSummary[];
  cities: CitySummary[];
  relations: RelationSummary[];
  wars: WarSummary[];
  tradeRoutes: TradeRoute[];
  stats: YearStats[];
  civHistories: Record<string, CivHistory>;
  events: WorldEvent[]; // full (capped) event log
  landTiles: number;
  interventions: Intervention[]; // recorded divine interventions (part of the recipe)
  epitaphs: Epitaph[];
  godName: GodName | null;
  mapUpdate?: { version: number; terrain: Uint8Array; resources: Uint8Array; fertility: Float32Array };
}

export interface MapStatic {
  width: number;
  height: number;
  terrain: Uint8Array;
  elevation: Float32Array;
  fertility: Float32Array;
  temperature: Float32Array;
  moisture: Float32Array;
  resources: Uint8Array;
  river: Uint8Array;
}
