// War: declaration, yearly resolution with territory changes and casualties,
// peace treaties, and extinction when a civilization is wiped out.
import { SeededRandom } from './Random';
import { techMultipliers } from './Technology';
import { TERRAIN_INDEX } from './Terrain';
import { demonym } from './names';
import { Civilization, War, WorldState } from './types';
import { addEvent, compactTiles, releaseTile, transferTile } from './World';
import { areNeighbors, isAtWar } from './Diplomacy';

const WAR_NAMES = ['War', 'Conflict', 'Struggle', 'Campaign', 'Crusade'];
const WAR_ADJECTIVES = ['Great', 'Long', 'Bitter', 'Bloody', 'Silent', 'Burning', 'Iron', 'Broken', 'Endless', 'Red'];

export function runWarDeclarations(world: WorldState, rng: SeededRandom): void {
  const civs = world.civs;
  for (let i = 0; i < civs.length; i++) {
    const a = civs[i];
    if (!a.alive) continue;
    for (let j = 0; j < civs.length; j++) {
      if (i === j) continue;
      const b = civs[j];
      if (!b.alive) continue;
      if (isAtWar(world, i, j)) continue;
      if (world.alliances[i][j]) continue;
      if (!areNeighbors(a, b)) continue;
      const rel = world.relations[i][j];
      if (rel > -45) continue;

      const aggr = Math.max(0, Math.min(150, a.traits.aggression + a.modifiers.aggression));
      const powerRatio = b.military > 0 ? a.military / b.military : 2;
      const risk = a.traits.riskTaking / 100;
      let prob = (aggr / 100) * 0.04;
      prob += Math.max(0, powerRatio - 1) * 0.03 * (0.5 + risk);
      prob += a.modifiers.warProbability / 100;
      prob += ((-rel - 45) / 100) * 0.02;
      if (powerRatio < 0.7 && risk < 0.6) prob *= 0.2; // don't pick fights you'll lose
      if (a.stability < 30) prob *= 0.4; // unstable nations avoid new wars
      prob = Math.max(0, Math.min(0.5, prob));

      if (rng.chance(prob)) {
        declareWar(world, a, b, rng);
      }
    }
  }
}

export function declareWar(world: WorldState, a: Civilization, b: Civilization, rng: SeededRandom): War {
  const adj = rng.pick(WAR_ADJECTIVES);
  const noun = rng.pick(WAR_NAMES);
  const name = `The ${adj} ${noun}`;
  const war: War = {
    id: `war-${world.totalWars + 1}`,
    attackerId: a.id,
    defenderId: b.id,
    startYear: world.year,
    endYear: null,
    warScore: 0,
    name,
  };
  world.wars.push(war);
  world.totalWars++;
  world.relations[a.index][b.index] = -85;
  world.relations[b.index][a.index] = -85;
  world.alliances[a.index][b.index] = false;
  world.alliances[b.index][a.index] = false;
  addEvent(
    world,
    world.year,
    'war',
    [a.id, b.id],
    `${name} begins`,
    `${a.name} declared war on ${b.name} after years of rising tension along their borders.`,
    8,
    b.territory > 0 ? Math.round(b.sumX / b.territory) : undefined,
    b.territory > 0 ? Math.round(b.sumY / b.territory) : undefined,
  );
  return war;
}

/** Tiles of `loser` that border `winner` territory. */
function borderTiles(world: WorldState, loser: Civilization, winner: Civilization): number[] {
  const m = world.map;
  compactTiles(world, loser);
  const out: number[] = [];
  for (const t of loser.tiles) {
    if (m.owner[t] !== loser.index) continue;
    const x = t % m.width;
    const y = Math.floor(t / m.width);
    if (
      (x > 0 && m.owner[t - 1] === winner.index) ||
      (x < m.width - 1 && m.owner[t + 1] === winner.index) ||
      (y > 0 && m.owner[t - m.width] === winner.index) ||
      (y < m.height - 1 && m.owner[t + m.width] === winner.index)
    ) {
      out.push(t);
    }
  }
  return out;
}

function terrainDefenseBonus(world: WorldState, civ: Civilization): number {
  // Sample owned tiles: mountains/forests make a nation harder to conquer.
  const m = world.map;
  if (civ.tiles.length === 0) return 1;
  let bonus = 0;
  const samples = Math.min(20, civ.tiles.length);
  for (let s = 0; s < samples; s++) {
    const t = civ.tiles[Math.floor((s / samples) * civ.tiles.length)];
    const terr = m.terrain[t];
    if (terr === TERRAIN_INDEX.mountain) bonus += 0.35;
    else if (terr === TERRAIN_INDEX.forest) bonus += 0.15;
  }
  return 1 + (bonus / samples) * 1.2;
}

export function runWars(world: WorldState, rng: SeededRandom): void {
  for (const war of world.wars) {
    if (war.endYear !== null) continue;
    const a = world.civs[parseInt(war.attackerId.slice(4), 10)];
    const b = world.civs[parseInt(war.defenderId.slice(4), 10)];
    if (!a.alive || !b.alive) {
      war.endYear = world.year;
      continue;
    }
    a.warYears++;
    b.warYears++;

    const techA = techMultipliers(a.researchedTechs);
    const techB = techMultipliers(b.researchedTechs);
    const moraleA = 0.5 + (a.stability / 100) * 0.7;
    const moraleB = 0.5 + (b.stability / 100) * 0.7;
    const powerA = Math.max(0.01, a.military * techA.military * moraleA * rng.range(0.8, 1.2));
    const powerB = Math.max(0.01, b.military * techB.military * moraleB * terrainDefenseBonus(world, b) * rng.range(0.8, 1.2));

    const yearScore = ((powerA - powerB) / (powerA + powerB)) * 10;
    war.warScore += yearScore;

    // Casualties and costs on both sides
    const intensity = Math.min(1, (powerA + powerB) / 200);
    for (const [civ, enemyPower, ownPower] of [
      [a, powerB, powerA],
      [b, powerA, powerB],
    ] as [Civilization, number, number][]) {
      const lossRate = 0.004 + 0.012 * intensity * (enemyPower / (enemyPower + ownPower));
      civ.population *= 1 - lossRate;
      civ.military *= 0.97;
      civ.economy = Math.max(0, civ.economy - 0.8);
      civ.stability = Math.max(0, civ.stability - 0.6);
      civ.food = Math.max(0, civ.food - civ.population * 0.05);
    }
    // Scale tile populations down to match aggregate losses (cheap approximation:
    // applied during next growth distribution via aggregate ratio).

    // Territory changes: the year's winner takes border tiles.
    const winner = yearScore > 0 ? a : b;
    const loser = yearScore > 0 ? b : a;
    const advance = Math.min(6, 1 + Math.floor(Math.abs(war.warScore) / 12));
    const border = borderTiles(world, loser, winner);
    for (let k = 0; k < Math.min(advance, border.length); k++) {
      const t = border[k];
      transferTile(world, t, winner, 0.7);
      const cityIdx = world.map.city[t];
      if (cityIdx >= 0) {
        const city = world.cities[cityIdx];
        if (!city.destroyed && city.ownerId === loser.id) {
          city.ownerId = winner.id;
          loser.cityIds = loser.cityIds.filter((id) => id !== city.id);
          winner.cityIds.push(city.id);
          if (loser.capitalCityId === city.id) {
            loser.capitalCityId = loser.cityIds[0] ?? null;
          }
          if (city.level === 'capital') city.level = 'city';
          addEvent(
            world,
            world.year,
            'city-captured',
            [winner.id, loser.id],
            `${city.name} falls to ${winner.name}`,
            `After fierce fighting in ${war.name}, the city of ${city.name} was captured by ${demonym(winner.name)} forces.`,
            7,
            city.x,
            city.y,
          );
        }
      }
    }

    // Peace conditions
    const exhaustionA = a.stability < 18 || a.population < 200;
    const exhaustionB = b.stability < 18 || b.population < 200;
    const duration = world.year - war.startYear;
    const peaceDesire = (a.modifiers.peaceDesire + b.modifiers.peaceDesire) / 200;
    let peace = false;
    let victor: Civilization | null = null;

    if (war.warScore > 35) {
      peace = true;
      victor = a;
    } else if (war.warScore < -35) {
      peace = true;
      victor = b;
    } else if (exhaustionA || exhaustionB) {
      peace = true;
      victor = exhaustionA && !exhaustionB ? b : exhaustionB && !exhaustionA ? a : null;
    } else if (duration > 6 && rng.chance(0.08 + duration * 0.015 + peaceDesire)) {
      peace = true;
    } else if (duration >= 40) {
      peace = true; // hard guarantee: no eternal wars
    }

    // Extinction check before treaty
    compactTiles(world, a);
    compactTiles(world, b);
    for (const [civ, other] of [
      [a, b],
      [b, a],
    ] as [Civilization, Civilization][]) {
      if (civ.territory <= 0 || civ.population < 60) {
        annihilate(world, civ, other, war, rng);
        peace = true;
        victor = other;
        break;
      }
    }

    if (peace) {
      war.endYear = world.year;
      a.warYears = 0;
      b.warYears = 0;
      world.relations[a.index][b.index] = -20;
      world.relations[b.index][a.index] = -20;
      if (a.alive && b.alive) {
        if (victor) {
          const vanquished = victor === a ? b : a;
          const tribute = Math.min(vanquished.gold * 0.3, 500);
          vanquished.gold -= tribute;
          victor.gold += tribute;
          addEvent(
            world,
            world.year,
            'peace',
            [a.id, b.id],
            `${war.name} ends in victory for ${victor.name}`,
            `After ${duration} years of fighting, ${vanquished.name} sued for peace. ${victor.name} gained territory and tribute.`,
            7,
          );
        } else {
          addEvent(
            world,
            world.year,
            'peace',
            [a.id, b.id],
            `${war.name} ends in stalemate`,
            `Exhausted after ${duration} years, ${a.name} and ${b.name} signed a peace treaty with no clear victor.`,
            6,
          );
        }
      }
    }
  }

  // Clear war weariness for civs no longer in any war
  for (const civ of world.civs) {
    if (!civ.alive) continue;
    const inWar = world.wars.some((w) => w.endYear === null && (w.attackerId === civ.id || w.defenderId === civ.id));
    if (!inWar) civ.warYears = 0;
  }
}

function annihilate(world: WorldState, civ: Civilization, conqueror: Civilization, war: War, _rng: SeededRandom): void {
  compactTiles(world, civ);
  // Remaining tiles go to the conqueror.
  for (const t of [...civ.tiles]) {
    if (world.map.owner[t] === civ.index) transferTile(world, t, conqueror, 0.6);
  }
  for (const cid of [...civ.cityIds]) {
    const city = world.cities[parseInt(cid.slice(5), 10)];
    if (city && city.ownerId === civ.id) {
      city.ownerId = conqueror.id;
      conqueror.cityIds.push(city.id);
      if (city.level === 'capital') city.level = 'city';
    }
  }
  civ.cityIds = [];
  civ.tiles = [];
  civ.territory = 0;
  civ.population = 0;
  civ.alive = false;
  civ.deathYear = world.year;
  civ.capitalCityId = null;
  war.endYear = world.year;
  addEvent(
    world,
    world.year,
    'extinction',
    [civ.id, conqueror.id],
    `${civ.name} is destroyed`,
    `${war.name} ended with the total conquest of ${civ.name}. After ${world.year - civ.foundedYear} years of history, the ${demonym(civ.name)} ceased to exist as a nation. Their lands now belong to ${conqueror.name}.`,
    10,
  );
}

/** Starvation-driven collapse outside war (no conqueror). */
export function checkExtinction(world: WorldState, civ: Civilization): void {
  if (!civ.alive) return;
  compactTiles(world, civ);
  if (civ.population >= 60 && civ.territory > 0) return;
  for (const t of [...civ.tiles]) {
    if (world.map.owner[t] === civ.index) releaseTile(world, t);
  }
  for (const cid of civ.cityIds) {
    const city = world.cities[parseInt(cid.slice(5), 10)];
    if (city && city.ownerId === civ.id) city.destroyed = true;
  }
  civ.tiles = [];
  civ.territory = 0;
  civ.population = 0;
  civ.cityIds = [];
  civ.capitalCityId = null;
  civ.alive = false;
  civ.deathYear = world.year;
  addEvent(
    world,
    world.year,
    'extinction',
    [civ.id],
    `${civ.name} fades away`,
    `Famine and decline extinguished ${civ.name}. Its lands returned to wilderness after ${world.year - civ.foundedYear} years.`,
    9,
  );
}
