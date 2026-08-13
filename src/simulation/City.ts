// City founding and growth. Cities emerge where tile population crosses a
// threshold; they upgrade village -> town -> city and add science/industry.
import { SeededRandom } from './Random';
import { techMultipliers } from './Technology';
import { demonym } from './names';
import { Civilization, CityLevel, WorldState } from './types';
import { addEvent, compactTiles, foundCity } from './World';

const CITY_POP_THRESHOLD = 2500;
const MIN_CITY_SPACING = 5;

function levelFor(pop: number, isCapital: boolean): CityLevel {
  if (isCapital) return 'capital';
  if (pop >= 60000) return 'city';
  if (pop >= 15000) return 'town';
  return 'village';
}

export function runCities(world: WorldState, civ: Civilization, rng: SeededRandom): void {
  const m = world.map;
  compactTiles(world, civ);

  // Urbanization: people drift toward the densest settlement and existing
  // cities. (The yearly tile-sum renormalization in growPopulation keeps the
  // aggregate conserved, so this concentrates rather than creates people.)
  if (civ.denseTile >= 0 && m.owner[civ.denseTile] === civ.index) {
    m.population[civ.denseTile] += civ.population * 0.004;
  }
  let livingCities = 0;
  for (const cid of civ.cityIds) {
    const c = world.cities[parseInt(cid.slice(5), 10)];
    if (c && !c.destroyed && c.ownerId === civ.id) livingCities++;
  }
  if (livingCities > 0) {
    const pull = (civ.population * 0.006) / livingCities;
    for (const cid of civ.cityIds) {
      const c = world.cities[parseInt(cid.slice(5), 10)];
      if (c && !c.destroyed && c.ownerId === civ.id && m.owner[c.tile] === civ.index) {
        m.population[c.tile] += pull;
      }
    }
  }

  // --- Found new cities ---
  const threshold = Math.max(800, CITY_POP_THRESHOLD - civ.modifiers.cityFounding * 20);
  // Scan a rotating slice of territory (cheap, deterministic).
  const scanCount = Math.min(civ.tiles.length, 60);
  const offset = civ.tiles.length > 0 ? (world.year * 31) % civ.tiles.length : 0;
  for (let s = 0; s < scanCount; s++) {
    const t = civ.tiles[(offset + s) % civ.tiles.length];
    if (m.owner[t] !== civ.index || m.city[t] !== -1) continue;
    if (m.population[t] < threshold) continue;
    // Enforce spacing from existing cities.
    const x = t % m.width;
    const y = Math.floor(t / m.width);
    let tooClose = false;
    for (const cid of civ.cityIds) {
      const c = world.cities[parseInt(cid.slice(5), 10)];
      if (!c || c.destroyed) continue;
      if (Math.abs(c.x - x) + Math.abs(c.y - y) < MIN_CITY_SPACING) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;
    const city = foundCity(world, civ, t, world.year, rng);
    const popStr = Math.round(m.population[t]).toLocaleString('en-US');
    const isCap = city.level === 'capital';
    addEvent(world, {
      year: world.year,
      type: 'city-founded',
      civIds: [civ.id],
      title: `${city.name} founded`,
      description: `The ${demonym(civ.name)} founded ${isCap ? 'their capital ' : ''}${city.name} with ${popStr} inhabitants.`,
      titleZh: `${city.name} 建城`,
      descriptionZh: `${civ.name}人建立了${isCap ? '他们的首都' : ''}${city.name}，初有居民 ${popStr} 人。`,
      importance: isCap ? 6 : 4,
      x,
      y,
    });
    break; // at most one new city per civ per year
  }

  // --- Update existing cities ---
  const tech = techMultipliers(civ.researchedTechs);
  for (const cid of civ.cityIds) {
    const c = world.cities[parseInt(cid.slice(5), 10)];
    if (!c || c.destroyed || c.ownerId !== civ.id) continue;
    c.population = m.population[c.tile];
    const prev = c.level;
    c.level = levelFor(c.population, civ.capitalCityId === c.id);
    if (prev !== c.level && (c.level === 'town' || c.level === 'city')) {
      const popStr = Math.round(c.population).toLocaleString('en-US');
      const levelZh = c.level === 'city' ? '大城市' : '城镇';
      addEvent(world, {
        year: world.year,
        type: 'city-founded',
        civIds: [civ.id],
        title: `${c.name} grows into a ${c.level}`,
        description: `${c.name} now holds ${popStr} people and has become a major ${c.level} of ${civ.name}.`,
        titleZh: `${c.name} 发展为${levelZh}`,
        descriptionZh: `${c.name}如今拥有 ${popStr} 人口，已成为${civ.name}的重要${levelZh}。`,
        importance: c.level === 'city' ? 5 : 3,
        x: c.x,
        y: c.y,
      });
    }
    c.foodProduction = m.fertility[c.tile] * 500 * tech.food;
    c.industry = (c.population / 1000) * tech.industry;
    c.science = (c.population / 1500) * tech.science;
  }
}
