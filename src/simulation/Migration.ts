// Migration: population flows from starving/overcrowded tiles toward better
// nearby land. Crossing into foreign territory triggers a diplomacy check.
import { SeededRandom } from './Random';
import { TERRAIN_INDEX } from './Terrain';
import { demonym } from './names';
import { Civilization, WorldState } from './types';
import { addEvent, claimTile, compactTiles } from './World';

export function runMigration(world: WorldState, civ: Civilization, foodRatio: number, rng: SeededRandom): void {
  const m = world.map;
  compactTiles(world, civ);
  if (civ.tiles.length === 0 || civ.population <= 0) return;

  const density = civ.population / Math.max(1, civ.territory);
  const pressure =
    (foodRatio < 0.85 ? (0.85 - foodRatio) * 2 : 0) + (density > 400 ? Math.min(1, (density - 400) / 800) : 0);
  const tendency = (civ.traits.migration + civ.modifiers.migration) / 100;
  const migrationDrive = pressure * (0.3 + tendency) + tendency * 0.05;
  if (!rng.chance(Math.min(0.9, migrationDrive))) return;

  // Sample source tiles: pick the most crowded from a deterministic sample.
  const sampleSize = Math.min(24, civ.tiles.length);
  let source = -1;
  let sourcePop = -1;
  for (let s = 0; s < sampleSize; s++) {
    const t = civ.tiles[rng.nextInt(0, civ.tiles.length - 1)];
    if (m.owner[t] !== civ.index) continue;
    if (m.population[t] > sourcePop) {
      sourcePop = m.population[t];
      source = t;
    }
  }
  if (source < 0 || sourcePop < 50) return;

  // Look for the best destination within a small radius.
  const sx = source % m.width;
  const sy = Math.floor(source / m.width);
  const radius = 4;
  let best = -1;
  let bestScore = -Infinity;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = sx + dx;
      const ny = sy + dy;
      if (nx < 0 || ny < 0 || nx >= m.width || ny >= m.height) continue;
      const nt = ny * m.width + nx;
      if (m.terrain[nt] === TERRAIN_INDEX.ocean) continue;
      const owner = m.owner[nt];
      if (owner !== -1 && owner !== civ.index) {
        // Foreign land: only attractive if relations are good.
        const rel = world.relations[civ.index]?.[owner] ?? 0;
        if (rel < 20) continue;
      }
      const score = m.fertility[nt] * 100 - m.population[nt] * 0.05 - (Math.abs(dx) + Math.abs(dy)) * 2;
      if (score > bestScore) {
        bestScore = score;
        best = nt;
      }
    }
  }
  if (best < 0) return;

  const moving = sourcePop * rng.range(0.15, 0.35);
  const destOwner = m.owner[best];

  if (destOwner === -1) {
    // Settle new land.
    claimTile(world, civ, best);
    m.population[source] -= moving;
    m.population[best] += moving;
    if (moving > 400 && rng.chance(0.25)) {
      const n = Math.round(moving).toLocaleString('en-US');
      addEvent(world, {
        year: world.year,
        type: 'migration',
        civIds: [civ.id],
        title: `${demonym(civ.name)} migrate`,
        description: `Seeking better land, ${n} ${demonym(civ.name)} settled new territory.`,
        titleZh: `${civ.name}人迁徙`,
        descriptionZh: `为寻找更好的土地，${n} 名${civ.name}人开拓了新的疆域。`,
        importance: 3,
        x: best % m.width,
        y: Math.floor(best / m.width),
      });
    }
  } else if (destOwner === civ.index) {
    // Internal resettlement.
    m.population[source] -= moving;
    m.population[best] += moving;
  } else {
    // Migration into a friendly neighbor: population is absorbed there.
    const other = world.civs[destOwner];
    m.population[source] -= moving;
    m.population[best] += moving;
    civ.population -= moving;
    other.population += moving;
    world.relations[civ.index][destOwner] += 1;
    world.relations[destOwner][civ.index] += 1;
    if (moving > 500 && rng.chance(0.3)) {
      const n = Math.round(moving).toLocaleString('en-US');
      addEvent(world, {
        year: world.year,
        type: 'migration',
        civIds: [civ.id, other.id],
        title: `Migration into ${other.name}`,
        description: `${n} ${demonym(civ.name)} crossed the border and were absorbed into ${other.name}.`,
        titleZh: `移民涌入${other.name}`,
        descriptionZh: `${n} 名${civ.name}人越过边境，被${other.name}接纳吸收。`,
        importance: 4,
        x: best % m.width,
        y: Math.floor(best / m.width),
      });
    }
  }
}
