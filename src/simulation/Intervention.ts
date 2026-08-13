// Divine interventions — the observer's hand reaching into the world.
// Every intervention is applied at the START of its recorded year inside
// simulateYear, so replays and branches reproduce it exactly.
import { SeededRandom } from './Random';
import { TERRAIN_INDEX } from './Terrain';
import { techCost, TECH_BY_ID } from './Technology';
import { Civilization, Intervention, WorldState } from './types';
import { addEvent, claimTile, createCivilization, randomCivConfig, tileYields } from './World';
import { areNeighbors, isAtWar } from './Diplomacy';
import { declareWar } from './Warfare';
import { getCivNamePool } from './Collapse';
import { receiveMiracle, receiveWrath } from './Faith';

/** Rebuild every civ's cached yields after the map itself changed (bless/blight). */
function recomputeAllYields(world: WorldState): void {
  for (const civ of world.civs) {
    civ.yields = { food: 0, wood: 0, stone: 0, iron: 0, gold: 0 };
    if (!civ.alive) continue;
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
}

/** Kill population in a radius; returns affected civ indices -> lost pop. */
function smite(world: WorldState, cx: number, cy: number, radius: number, lossAtCenter: number): Map<number, number> {
  const m = world.map;
  const affected = new Map<number, number>();
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= m.width || ny >= m.height) continue;
      const t = ny * m.width + nx;
      if (m.population[t] <= 0) continue;
      const falloff = 1 - Math.sqrt(dx * dx + dy * dy) / (radius + 1);
      const lost = m.population[t] * lossAtCenter * falloff;
      m.population[t] -= lost;
      const owner = m.owner[t];
      if (owner >= 0) affected.set(owner, (affected.get(owner) ?? 0) + lost);
    }
  }
  for (const [idx, lost] of [...affected.entries()].sort((a, b) => a[0] - b[0])) {
    const civ = world.civs[idx];
    civ.population = Math.max(0, civ.population - lost);
    civ.happiness = Math.max(0, civ.happiness - 12);
    civ.stability = Math.max(0, civ.stability - 8);
  }
  return affected;
}

function ownerAt(world: WorldState, x: number | undefined, y: number | undefined): Civilization | null {
  if (x === undefined || y === undefined) return null;
  const m = world.map;
  if (x < 0 || y < 0 || x >= m.width || y >= m.height) return null;
  const idx = m.owner[y * m.width + x];
  return idx >= 0 && world.civs[idx].alive ? world.civs[idx] : null;
}

export function applyIntervention(world: WorldState, iv: Intervention, rng: SeededRandom): void {
  const m = world.map;
  const x = iv.x ?? 0;
  const y = iv.y ?? 0;

  switch (iv.type) {
    case 'meteor': {
      const radius = 4;
      const affected = smite(world, x, y, radius, 0.75);
      for (const idx of affected.keys()) {
        const civ = world.civs[idx];
        civ.foodPenaltyUntil = world.year + 5;
        civ.foodPenaltyMult = 0.6;
        receiveWrath(civ);
      }
      addEvent(world, {
        year: world.year, type: 'divine', civIds: [...affected.keys()].map((i) => world.civs[i].id),
        title: 'The heavens hurl a star',
        description: 'A burning star fell from a clear sky, obliterating everything near its impact. The survivors speak of an angry god.',
        titleZh: '天罚陨星',
        descriptionZh: '晴空之中一颗燃烧的星辰轰然坠落，将周遭化为焦土。幸存者们说，那是神明的怒火。',
        importance: 9, x, y,
      });
      break;
    }
    case 'plague': {
      const radius = 14;
      const affected = smite(world, x, y, radius, 0.3);
      for (const idx of affected.keys()) {
        const civ = world.civs[idx];
        civ.foodPenaltyUntil = world.year + 4;
        civ.foodPenaltyMult = 0.85;
        receiveWrath(civ);
      }
      addEvent(world, {
        year: world.year, type: 'divine', civIds: [...affected.keys()].map((i) => world.civs[i].id),
        title: 'A plague is unleashed',
        description: 'A pestilence of unknown origin swept the region, emptying villages and silencing cities.',
        titleZh: '降下瘟疫',
        descriptionZh: '一场来历不明的瘟疫席卷此地，村庄十室九空，城市陷入死寂。',
        importance: 8, x, y,
      });
      break;
    }
    case 'quake': {
      const radius = 6;
      const affected = smite(world, x, y, radius, 0.35);
      for (const idx of affected.keys()) receiveWrath(world.civs[idx]);
      // Quakes can level cities on the spot.
      for (const city of world.cities) {
        if (city.destroyed) continue;
        if ((city.x - x) ** 2 + (city.y - y) ** 2 <= radius * radius) {
          m.population[city.tile] *= 0.5;
        }
      }
      addEvent(world, {
        year: world.year, type: 'divine', civIds: [...affected.keys()].map((i) => world.civs[i].id),
        title: 'The earth is torn open',
        description: 'The ground convulsed without warning. Walls fell, roads split, and the old certainties fell with them.',
        titleZh: '大地撕裂',
        descriptionZh: '大地毫无预兆地剧烈震颤，城墙倒塌，道路断裂，旧日的安稳一夜崩解。',
        importance: 8, x, y,
      });
      break;
    }
    case 'bless':
    case 'blight': {
      const radius = 7;
      const delta = iv.type === 'bless' ? 0.3 : -0.3;
      const civIds = new Set<string>();
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > radius * radius) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= m.width || ny >= m.height) continue;
          const t = ny * m.width + nx;
          if (m.terrain[t] === TERRAIN_INDEX.ocean) continue;
          m.fertility[t] = Math.max(0.02, Math.min(1, m.fertility[t] + delta));
          const owner = m.owner[t];
          if (owner >= 0) civIds.add(world.civs[owner].id);
        }
      }
      recomputeAllYields(world);
      for (const cid of civIds) {
        const civ = world.civs[parseInt(cid.slice(4), 10)];
        if (iv.type === 'bless') receiveMiracle(world, civ, ['famine', 'plague', 'decline']);
        else receiveWrath(civ);
      }
      addEvent(world, {
        year: world.year, type: 'divine', civIds: [...civIds],
        title: iv.type === 'bless' ? 'The land is blessed' : 'The land is blighted',
        description:
          iv.type === 'bless'
            ? 'Rain came gentle and rivers ran clear. For generations, this soil will feed all who till it.'
            : 'The soil turned grey and the wells brackish. Whatever grows here now grows twisted.',
        titleZh: iv.type === 'bless' ? '沃土之赐' : '大地枯萎',
        descriptionZh:
          iv.type === 'bless'
            ? '甘霖普降，河水清澈。此后数代人，这片土地都将回报每一个耕耘者。'
            : '土壤变得灰败，井水泛苦。这片土地上生长的一切，都开始扭曲。',
        importance: 7, x, y,
      });
      break;
    }
    case 'spawnCiv': {
      if (world.civs.length >= 120) break;
      if (x < 0 || y < 0 || x >= m.width || y >= m.height) break;
      const center = y * m.width + x;
      if (m.terrain[center] === TERRAIN_INDEX.ocean || m.owner[center] !== -1) break;
      const cfg = randomCivConfig(rng, getCivNamePool(), world.civs.length);
      const civ = createCivilization(world, { ...cfg, startPopulation: 0 }, world.year, null);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= m.width || ny >= m.height) continue;
          const t = ny * m.width + nx;
          if (m.owner[t] === -1 && m.terrain[t] !== TERRAIN_INDEX.ocean) claimTile(world, civ, t);
        }
      }
      if (civ.tiles.length === 0) {
        civ.alive = false;
        civ.deathYear = world.year;
        break;
      }
      const boost = Math.max(0, 1600 - civ.population) / civ.tiles.length;
      for (const t of civ.tiles) m.population[t] += boost;
      civ.population = Math.max(civ.population, 1600);
      addEvent(world, {
        year: world.year, type: 'divine', civIds: [civ.id],
        title: `${civ.name} is willed into being`,
        description: `Wanderers from every direction were drawn to one valley, as if called. They woke one morning as a nation: ${civ.name}.`,
        titleZh: `神启之民：${civ.name}`,
        descriptionZh: `四方的流浪者仿佛受到某种召唤，汇聚于同一片谷地。一夜之间，他们成为了一个民族：${civ.name}。`,
        importance: 8, x, y,
      });
      break;
    }
    case 'inciteWar': {
      const civ = ownerAt(world, iv.x, iv.y);
      if (!civ) break;
      // The incited nation turns on its most-hated (or nearest) living neighbor.
      let target: Civilization | null = null;
      let worst = Infinity;
      for (const other of world.civs) {
        if (!other.alive || other.index === civ.index) continue;
        if (!areNeighbors(civ, other) || isAtWar(world, civ.index, other.index)) continue;
        const rel = world.relations[civ.index][other.index];
        if (rel < worst) {
          worst = rel;
          target = other;
        }
      }
      if (!target) break;
      world.relations[civ.index][target.index] = -95;
      world.relations[target.index][civ.index] = -95;
      addEvent(world, {
        year: world.year, type: 'divine', civIds: [civ.id, target.id],
        title: `Whispers of war in ${civ.name}`,
        description: `Old grievances against ${target.name} resurfaced everywhere at once — in taverns, in courts, in dreams. War became inevitable.`,
        titleZh: `战争的低语笼罩${civ.name}`,
        descriptionZh: `对${target.name}的旧怨忽然在酒馆、朝堂乃至梦境中同时苏醒。战争已不可避免。`,
        importance: 8, x: iv.x, y: iv.y,
      });
      declareWar(world, civ, target, rng);
      break;
    }
    case 'forcePeace': {
      const civ = ownerAt(world, iv.x, iv.y);
      if (!civ) break;
      let ended = 0;
      for (const war of world.wars) {
        if (war.endYear !== null) continue;
        if (war.attackerId !== civ.id && war.defenderId !== civ.id) continue;
        war.endYear = world.year;
        const otherId = war.attackerId === civ.id ? war.defenderId : war.attackerId;
        const other = world.civs[parseInt(otherId.slice(4), 10)];
        world.relations[civ.index][other.index] = 0;
        world.relations[other.index][civ.index] = 0;
        civ.warYears = 0;
        other.warYears = 0;
        ended++;
      }
      if (ended === 0) break;
      receiveMiracle(world, civ, ['war']);
      addEvent(world, {
        year: world.year, type: 'divine', civIds: [civ.id],
        title: `An unnatural calm settles over ${civ.name}`,
        description: `On the same dawn, on every front, soldiers laid down their arms — none could later say why. ${ended > 1 ? 'All wars' : 'The war'} simply ended.`,
        titleZh: `不可思议的和平降临${civ.name}`,
        descriptionZh: `同一个黎明，所有前线的士兵不约而同放下了武器——事后没有人说得清原因。战争就这样结束了。`,
        importance: 7, x: iv.x, y: iv.y,
      });
      break;
    }
    case 'goldenAge': {
      const civ = ownerAt(world, iv.x, iv.y);
      if (!civ) break;
      civ.happiness = Math.min(100, civ.happiness + 25);
      civ.stability = Math.min(100, civ.stability + 30);
      civ.food += civ.population * 0.5;
      civ.gold += 800;
      const upcoming = civ.currentResearch ? TECH_BY_ID.get(civ.currentResearch) : null;
      if (upcoming) civ.researchProgress += techCost(upcoming) * 0.35;
      civ.lowStabilityYears = 0;
      receiveMiracle(world, civ, 'any');
      addEvent(world, {
        year: world.year, type: 'divine', civIds: [civ.id],
        title: `A golden age dawns in ${civ.name}`,
        description: `Harvests overflowed, disputes dissolved, and inventors woke with answers already in their heads. The people of ${civ.name} call it the Blessed Years.`,
        titleZh: `${civ.name}迎来黄金时代`,
        descriptionZh: `谷仓满溢，纷争消弭，发明家们一觉醒来便得到了答案。${civ.name}人称之为「蒙福之年」。`,
        importance: 7, x: iv.x, y: iv.y,
      });
      break;
    }
  }
}

/** Apply every intervention recorded for the current year (called by simulateYear). */
export function runInterventions(world: WorldState, rng: SeededRandom): void {
  const list = world.config.interventions;
  if (!list || list.length === 0) return;
  for (const iv of list) {
    if (iv.year === world.year) applyIntervention(world, iv, rng);
  }
}
