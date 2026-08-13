// Deterministic procedural name generation for civilizations and cities.
import { SeededRandom } from './Random';

const CIV_STARTS = ['Au', 'Bo', 'Ka', 'No', 'Va', 'Ery', 'Ta', 'So', 'Mar', 'Ther', 'Lu', 'Qua', 'Zel', 'Or', 'Hal', 'Cel', 'Dra', 'Fen', 'Gal', 'Ish'];
const CIV_MIDS = ['re', 'ri', 'ra', 'lan', 'ven', 'mor', 'ndo', 'lis', 'var', 'the', 'sa', 'ne', 'mi', 'to', 'ka'];
const CIV_ENDS = ['lia', 'ria', 'reth', 'ria', 'len', 'ndor', 'vria', 'lara', 'nia', 'thia', 'dor', 'mar', 'sia', 'na', 'ros'];

const CITY_STARTS = ['Al', 'Ber', 'Cor', 'Dun', 'El', 'Fal', 'Gar', 'Hol', 'Il', 'Jor', 'Kel', 'Lor', 'Mel', 'Nor', 'Ost', 'Pel', 'Rav', 'Sel', 'Tor', 'Ul', 'Vel', 'Wyn', 'Yor', 'Zan'];
const CITY_MIDS = ['a', 'e', 'i', 'o', 'u', 'ar', 'en', 'or', 'ith', 'and', 'ave', 'ora'];
const CITY_ENDS = ['burg', 'ford', 'haven', 'gard', 'holm', 'mar', 'moor', 'port', 'stead', 'ton', 'wick', 'dale', 'fell', 'grad', 'mund'];

export function generateCivName(rng: SeededRandom, taken: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let name = rng.pick(CIV_STARTS);
    if (rng.chance(0.45)) name += rng.pick(CIV_MIDS);
    name += rng.pick(CIV_ENDS);
    name = name[0].toUpperCase() + name.slice(1);
    if (!taken.has(name)) {
      taken.add(name);
      return name;
    }
  }
  // Deterministic fallback
  const name = `Terra-${taken.size + 1}`;
  taken.add(name);
  return name;
}

export function generateCityName(rng: SeededRandom, taken: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let name = rng.pick(CITY_STARTS);
    if (rng.chance(0.5)) name += rng.pick(CITY_MIDS);
    name += rng.pick(CITY_ENDS);
    if (!taken.has(name)) {
      taken.add(name);
      return name;
    }
  }
  const name = `Settlement ${taken.size + 1}`;
  taken.add(name);
  return name;
}

/** People-adjective for narrative text: "Aurelia" -> "Aurelians". */
export function demonym(civName: string): string {
  if (civName.endsWith('a') || civName.endsWith('e')) return `${civName}ns`;
  if (civName.endsWith('s')) return civName;
  return `${civName}ians`;
}

export const CIV_COLORS = [
  '#e5484d', '#3b82f6', '#30a46c', '#f5a524', '#8e4ec6',
  '#0ea5e9', '#e93d82', '#a3be3c', '#f76b15', '#12a594',
  '#6e56cf', '#ffc53d', '#46a758', '#d6409f', '#00a2c7',
  '#f0785a', '#7ce2fe', '#bdee63', '#eb9091', '#9eb1ff',
];
