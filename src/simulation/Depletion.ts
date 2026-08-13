// Finite resources: mines run dry, forests fall to the axe, soil tires under
// the plough. Scarcity — not abundance — is what writes most of history.
// Each simulated year processes a rotating 1/10 slice of every civ's tiles,
// so per-year cost stays negligible and results stay deterministic.
import { SeededRandom } from './Random';
import { TERRAIN_INDEX } from './Terrain';
import { techMultipliers } from './Technology';
import { RESOURCE_BIT, WorldState } from './types';
import { addEvent, compactTiles, recomputeYields } from './World';

const MINERAL_BITS = RESOURCE_BIT.iron | RESOURCE_BIT.gold | RESOURCE_BIT.stone;

export function runDepletion(world: WorldState, rng: SeededRandom): void {
  if (world.config.finiteResources === false) return;
  const m = world.map;
  const phase = world.year % 10;

  for (const civ of world.civs) {
    if (!civ.alive || civ.tiles.length === 0) continue;
    compactTiles(world, civ);
    const tech = techMultipliers(civ.researchedTechs);
    const mineRate = 0.0016 * tech.industry * 10; // ×10: each tile visited every 10th year
    const logRate = 0.0011 * tech.industry * 10;

    for (let i = phase; i < civ.tiles.length; i += 10) {
      const t = civ.tiles[i];
      if (m.owner[t] !== civ.index) continue;
      const pop = m.population[t];

      // --- Mines run dry ---
      if (m.resources[t] & MINERAL_BITS) {
        m.deposits[t] -= mineRate * (0.4 + Math.min(1, pop / 3000));
        if (m.deposits[t] <= 0) {
          m.deposits[t] = 0;
          m.resources[t] &= ~MINERAL_BITS;
          world.mapVersion++;
          if (rng.chance(0.35)) {
            addEvent(world, {
              year: world.year, type: 'collapse', civIds: [civ.id],
              title: `The mines of ${civ.name} run dry`,
              description: `A vein that fed generations of smiths gave its last ore. The mining towns will have to find another reason to exist.`,
              titleZh: `${civ.name}的矿脉枯竭`,
              descriptionZh: `养活了数代铁匠的矿脉挖出了最后一筐矿石。矿镇将不得不寻找新的存在理由。`,
              importance: 4,
              x: t % m.width, y: Math.floor(t / m.width),
            });
          }
        }
      }

      // --- Forests fall ---
      if (m.terrain[t] === TERRAIN_INDEX.forest && pop > 400) {
        m.deposits[t] -= logRate * Math.min(1, pop / 2500);
        if (m.deposits[t] <= 0) {
          m.deposits[t] = 0.3; // regrowth potential as farmland
          m.terrain[t] = TERRAIN_INDEX.plains;
          m.resources[t] &= ~RESOURCE_BIT.wood;
          m.fertility[t] = Math.max(0.1, m.fertility[t] - 0.12);
          world.mapVersion++;
          if (rng.chance(0.2)) {
            addEvent(world, {
              year: world.year, type: 'collapse', civIds: [civ.id],
              title: `The old forest falls in ${civ.name}`,
              description: `Where a forest older than the nation once stood, there are now fields, stumps, and wind.`,
              titleZh: `${civ.name}的古老森林倒下了`,
              descriptionZh: `一片比国家还古老的森林矗立过的地方，如今只剩下田地、树桩和风。`,
              importance: 4,
              x: t % m.width, y: Math.floor(t / m.width),
            });
          }
        }
      }

      // --- Soil tires under heavy farming, rests when left alone ---
      if (m.terrain[t] !== TERRAIN_INDEX.ocean) {
        if (pop > 1500) {
          m.fertility[t] = Math.max(0.12, m.fertility[t] - 0.00028 * 10);
        } else if (pop < 120 && m.fertility[t] < 0.55) {
          m.fertility[t] = Math.min(0.55, m.fertility[t] + 0.00006 * 10);
        }
      }
    }

    // Cached yields drift as the land changes: full refresh once a decade.
    if (phase === civ.index % 10) recomputeYields(world, civ);
  }
}
