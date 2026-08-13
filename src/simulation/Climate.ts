// Anthropogenic climate change, grounded in the real radiative-forcing law:
//   ΔT = S · log2(C/C₀)   with climate sensitivity S ≈ 3°C per CO₂ doubling.
// Industrial civilizations emit; the ocean/biosphere sink absorbs; warming
// shifts biomes (Whittaker re-classification) and raises the sea.
import { SeededRandom } from './Random';
import { TERRAIN_INDEX } from './Terrain';
import { RESOURCE_BIT, Terrain, WorldState } from './types';
import { addEvent, recomputeYields, releaseTile } from './World';

const SENSITIVITY = 3.0; // °C per CO2 doubling (IPCC central estimate)
const C0 = 280; // pre-industrial ppm

function classify(tC: number, pMm: number, e: number, seaLevel: number): Terrain {
  if (e < seaLevel) return 'ocean';
  if (e > seaLevel + 0.34) return 'mountain';
  if (tC < -4) return 'tundra';
  if (pMm < 320 && tC > 12) return 'desert';
  if (pMm < 220) return tC > 5 ? 'desert' : 'tundra';
  if (pMm > 780 && tC > 2) return 'forest';
  return 'plains';
}

function miamiFertility(tC: number, pMm: number, terr: Terrain, river: number): number {
  const nppT = 3000 / (1 + Math.exp(1.315 - 0.119 * tC));
  const nppP = 3000 * (1 - Math.exp(-0.000664 * pMm));
  const npp = Math.min(nppT, nppP) / 3000;
  let f = Math.pow(npp, 0.8) * (terr === 'mountain' ? 0.35 : terr === 'ocean' ? 0 : 1.05);
  if (river && terr !== 'ocean') f = Math.min(1, f + 0.22);
  return Math.max(0, Math.min(1, f));
}

export function runClimate(world: WorldState, rng: SeededRandom): void {
  // --- Emissions: fossil industry emits, information-age tech decarbonizes ---
  let emissions = 0;
  for (const civ of world.civs) {
    if (!civ.alive) continue;
    const techs = civ.researchedTechs;
    if (!techs.includes('industry')) continue;
    let f = 0.6;
    if (techs.includes('electricity')) f += 0.5;
    if (techs.includes('computing')) f -= 0.35; // efficiency
    if (techs.includes('spaceflight')) f -= 0.6; // clean energy
    emissions += (civ.population / 1e6) * Math.max(0, f);
  }
  world.co2 += emissions * 0.08;
  world.co2 += (C0 - world.co2) * 0.0018; // natural sink
  world.co2 = Math.max(C0, Math.min(1500, world.co2));

  const anomaly = SENSITIVITY * Math.log2(world.co2 / C0);
  world.tempAnomaly = anomaly;

  // --- Milestone events at each whole degree of warming ---
  const milestone = Math.floor(anomaly);
  if (milestone > world.climateMilestone && milestone >= 1) {
    world.climateMilestone = milestone;
    addEvent(world, {
      year: world.year, type: 'disaster', civIds: [],
      title: `The world has warmed by ${milestone}°C`,
      description:
        milestone === 1
          ? 'Old men say the winters were longer once. The glaciers have begun to retreat, and the sea creeps up the beaches.'
          : `Smoke from a thousand cities has changed the sky itself. Harvest zones drift poleward, coasts drown, and the weather grows strange.`,
      titleZh: `世界升温 ${milestone}°C`,
      descriptionZh:
        milestone === 1
          ? '老人们说从前的冬天更漫长。冰川开始退却，海水悄悄爬上沙滩。'
          : '千城的烟改变了天空本身。宜耕带向两极漂移，海岸沉没，天气变得陌生。',
      importance: milestone >= 2 ? 8 : 6,
    });
  }

  // --- Physical consequences, applied in 20-year batches ---
  if (world.year % 20 !== 0) return;
  if (Math.abs(anomaly - world.appliedAnomaly) < 0.2) return;
  world.appliedAnomaly = anomaly;

  const m = world.map;
  const seaLevel = world.config.seaLevel;
  const effSea = seaLevel + Math.max(0, anomaly) * 0.006; // ice-melt sea rise
  const dNorm = anomaly / 55; // °C anomaly in normalized temperature units
  let flooded = 0;
  let shifted = 0;

  for (let i = 0; i < m.terrain.length; i++) {
    if (m.terrain[i] === TERRAIN_INDEX.ocean) continue;
    m.temperature[i] = Math.max(0, Math.min(1, world.baseTemperature[i] + dNorm));

    // Coastal drowning
    if (m.elevation[i] < effSea) {
      if (m.owner[i] >= 0) releaseTile(world, i);
      const cityIdx = m.city[i];
      if (cityIdx >= 0) {
        const city = world.cities[cityIdx];
        if (!city.destroyed) {
          city.destroyed = true;
          addEvent(world, {
            year: world.year, type: 'disaster', civIds: [],
            title: `The sea takes ${city.name}`,
            description: `The tide came in one year and never went out. ${city.name} now belongs to the fish.`,
            titleZh: `海水吞没了${city.name}`,
            descriptionZh: `那一年潮水涌来，就再也没有退去。${city.name}如今属于鱼群。`,
            importance: 8, x: city.x, y: city.y,
          });
        }
      }
      m.terrain[i] = TERRAIN_INDEX.ocean;
      m.population[i] = 0;
      m.fertility[i] = 0;
      m.resources[i] &= ~(RESOURCE_BIT.wood | RESOURCE_BIT.stone | RESOURCE_BIT.iron | RESOURCE_BIT.gold);
      flooded++;
      continue;
    }

    // Biome drift under the new temperature (precipitation held fixed)
    const tC = m.temperature[i] * 55 - 25;
    const pMm = m.moisture[i] * 1800;
    const next = classify(tC, pMm, m.elevation[i], seaLevel);
    if (TERRAIN_INDEX[next] !== m.terrain[i] && next !== 'ocean') {
      m.terrain[i] = TERRAIN_INDEX[next];
      shifted++;
    }
    m.fertility[i] = miamiFertility(tC, pMm, next, m.river[i]);
  }

  if (flooded > 0 || shifted > 0) {
    world.mapVersion++;
    for (const civ of world.civs) recomputeYields(world, civ);
  }
  if (flooded > 8 && rng.chance(0.8)) {
    addEvent(world, {
      year: world.year, type: 'disaster', civIds: [],
      title: 'The coastlines are redrawn',
      description: `${flooded} stretches of coast slipped beneath the rising sea this generation.`,
      titleZh: '海岸线被重新绘制',
      descriptionZh: `这一代人眼睁睁看着 ${flooded} 片海岸没入上升的海水。`,
      importance: 7,
    });
  }
}
