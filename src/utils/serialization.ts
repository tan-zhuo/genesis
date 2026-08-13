// Config serialization: export/import JSON, share URLs.
// Only the *recipe* (seed + configs) is serialized — never the full world
// state. Opening a share link recomputes the identical world.
import { Intervention, InterventionType, Rule, RuleActionType, RuleMetric, RuleOperator, Traits, WorldConfig, CivConfig, SIM_VERSION } from '../simulation/types';
import { CIV_COLORS } from '../simulation/names';
import { TECH_BY_ID } from '../simulation/Technology';

const METRICS: RuleMetric[] = [
  'population', 'populationDensity', 'food', 'foodPerCapita', 'technology', 'military',
  'economy', 'happiness', 'stability', 'territory', 'neighborStrength', 'resourceAvailability', 'year', 'climate',
];
const OPS: RuleOperator[] = ['<', '>', '<=', '>=', '='];
const ACTIONS: RuleActionType[] = [
  'increasePopulation', 'decreasePopulation', 'increaseMigration', 'startTrade', 'increaseAggression',
  'decreaseAggression', 'researchTechnology', 'declareWar', 'seekPeace', 'buildCity', 'movePopulation',
];

function clamp(v: unknown, min: number, max: number, dflt: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : dflt;
  return Math.max(min, Math.min(max, n));
}

function str(v: unknown, dflt: string, maxLen = 40): string {
  return typeof v === 'string' && v.length > 0 ? v.slice(0, maxLen) : dflt;
}

function validTraits(v: unknown): Traits {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    aggression: clamp(o.aggression, 0, 100, 50),
    trade: clamp(o.trade, 0, 100, 50),
    science: clamp(o.science, 0, 100, 50),
    migration: clamp(o.migration, 0, 100, 50),
    expansion: clamp(o.expansion, 0, 100, 50),
    diplomacy: clamp(o.diplomacy, 0, 100, 50),
    birthRate: clamp(o.birthRate, 0, 100, 50),
    riskTaking: clamp(o.riskTaking, 0, 100, 50),
  };
}

const VALID_TECHS = [...TECH_BY_ID.keys()];

function validCiv(v: unknown, index: number): CivConfig {
  const o = (v ?? {}) as Record<string, unknown>;
  const startTechs = Array.isArray(o.startTechs)
    ? (o.startTechs.filter((t) => typeof t === 'string' && VALID_TECHS.includes(t)) as string[])
    : ['survival'];
  if (!startTechs.includes('survival')) startTechs.unshift('survival');
  return {
    name: str(o.name, `Nation ${index + 1}`),
    color: /^#[0-9a-fA-F]{6}$/.test(String(o.color)) ? String(o.color) : CIV_COLORS[index % CIV_COLORS.length],
    startPopulation: clamp(o.startPopulation, 100, 100000, 1200),
    traits: validTraits(o.traits),
    startTechs,
  };
}

function validRule(v: unknown, index: number): Rule | null {
  const o = (v ?? {}) as Record<string, unknown>;
  if (!Array.isArray(o.conditions)) return null;
  const conditions = o.conditions
    .map((c) => {
      const co = (c ?? {}) as Record<string, unknown>;
      const metric = METRICS.includes(co.metric as RuleMetric) ? (co.metric as RuleMetric) : null;
      const op = OPS.includes(co.op as RuleOperator) ? (co.op as RuleOperator) : null;
      if (!metric || !op) return null;
      return { metric, op, value: clamp(co.value, -1e9, 1e9, 0) };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);
  if (conditions.length === 0) return null;
  const action = (o.action ?? {}) as Record<string, unknown>;
  const type = ACTIONS.includes(action.type as RuleActionType) ? (action.type as RuleActionType) : null;
  if (!type) return null;
  return {
    id: str(o.id, `rule-imported-${index}`, 80),
    name: str(o.name, `Rule ${index + 1}`, 80),
    enabled: o.enabled !== false,
    logic: o.logic === 'or' ? 'or' : 'and',
    conditions,
    action: { type, amount: clamp(action.amount, -100, 100, 10) },
    appliesTo: str(o.appliesTo, 'all', 20),
  };
}

const INTERVENTION_TYPES: InterventionType[] = [
  'meteor', 'plague', 'quake', 'bless', 'blight', 'spawnCiv', 'inciteWar', 'forcePeace', 'goldenAge',
];

function validIntervention(v: unknown, index: number): Intervention | null {
  const o = (v ?? {}) as Record<string, unknown>;
  if (!INTERVENTION_TYPES.includes(o.type as InterventionType)) return null;
  const year = Math.round(clamp(o.year, 1, 1e6, -1));
  if (year < 1) return null;
  const iv: Intervention = {
    id: str(o.id, `iv-imported-${index}`, 40),
    year,
    type: o.type as InterventionType,
  };
  if (typeof o.x === 'number') iv.x = Math.round(clamp(o.x, 0, 1000, 0));
  if (typeof o.y === 'number') iv.y = Math.round(clamp(o.y, 0, 1000, 0));
  return iv;
}

/** Validate arbitrary JSON into a safe WorldConfig. Throws on hopeless input. */
export function validateConfig(raw: unknown): WorldConfig {
  if (raw === null || typeof raw !== 'object') throw new Error('Config must be an object');
  const o = raw as Record<string, unknown>;
  const civsRaw = Array.isArray(o.civs) ? o.civs.slice(0, 20) : [];
  if (civsRaw.length < 2) throw new Error('Config needs at least 2 civilizations');
  const rulesRaw = Array.isArray(o.rules) ? o.rules.slice(0, 50) : [];
  const interventionsRaw = Array.isArray(o.interventions) ? o.interventions.slice(0, 500) : [];
  return {
    simVersion: SIM_VERSION,
    seed: str(o.seed, '928374', 64),
    width: Math.round(clamp(o.width, 60, 600, 200)),
    height: Math.round(clamp(o.height, 60, 600, 200)),
    seaLevel: clamp(o.seaLevel, 0.3, 0.7, 0.5),
    resourceRichness: clamp(o.resourceRichness, 0, 2, 1),
    disasterFrequency: clamp(o.disasterFrequency, 0, 2, 1),
    finiteResources: o.finiteResources !== false,
    continents: Math.round(clamp(o.continents, 0, 6, 0)),
    civs: civsRaw.map((c, i) => validCiv(c, i)),
    rules: rulesRaw.map((r, i) => validRule(r, i)).filter((r): r is Rule => r !== null),
    interventions: interventionsRaw
      .map((iv, i) => validIntervention(iv, i))
      .filter((iv): iv is Intervention => iv !== null),
  };
}

export function exportConfig(config: WorldConfig): string {
  return JSON.stringify(config, null, 2);
}

export function importConfig(json: string): WorldConfig {
  return validateConfig(JSON.parse(json));
}

// --- URL sharing (base64url of the config JSON) ---

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function configToShareUrl(config: WorldConfig): string {
  const encoded = toBase64Url(JSON.stringify(config));
  const base = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';
  return `${base}?seed=${encodeURIComponent(config.seed)}&config=${encoded}`;
}

export function configFromUrl(search: string): WorldConfig | null {
  try {
    const params = new URLSearchParams(search);
    const encoded = params.get('config');
    if (!encoded) return null;
    return validateConfig(JSON.parse(fromBase64Url(encoded)));
  } catch {
    return null;
  }
}
