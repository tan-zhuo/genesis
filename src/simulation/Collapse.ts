// Empires rise; overextended, unstable empires fracture into new nations —
// and from the ruins of dead worlds, new peoples occasionally emerge.
import { SeededRandom } from './Random';
import { generateCivName, CIV_COLORS, demonym } from './names';
import { Civilization, Traits, WorldState } from './types';
import { addEvent, claimTile, compactTiles, createCivilization, randomCivConfig, transferTile } from './World';
import { TERRAIN_INDEX } from './Terrain';
import { declareWar } from './Warfare';
import { writeEpitaph } from './Faith';

const civNamePool = new Set<string>();

export function resetCollapseNamePool(): void {
  civNamePool.clear();
}

export function seedCivNames(names: string[]): void {
  civNamePool.clear();
  for (const n of names) civNamePool.add(n);
}

export function getCivNamePool(): Set<string> {
  return civNamePool;
}

export function runEmpireAndCollapse(world: WorldState, civ: Civilization, landTiles: number, rng: SeededRandom): void {
  if (!civ.alive) return;

  // --- Empire declaration ---
  const share = civ.territory / Math.max(1, landTiles);
  if (!civ.isEmpire && share > 0.12 && civ.cityIds.length >= 3) {
    civ.isEmpire = true;
    const pct = (share * 100).toFixed(1);
    addEvent(world, {
      year: world.year,
      type: 'empire',
      civIds: [civ.id],
      title: `The ${civ.name} Empire rises`,
      description: `Controlling ${pct}% of the known world with ${civ.cityIds.length} cities, ${civ.name} proclaimed itself an empire.`,
      titleZh: `${civ.name}帝国崛起`,
      descriptionZh: `坐拥已知世界 ${pct}% 的土地与 ${civ.cityIds.length} 座城市，${civ.name}宣布称帝。`,
      importance: 8,
      x: civ.territory > 0 ? Math.round(civ.sumX / civ.territory) : undefined,
      y: civ.territory > 0 ? Math.round(civ.sumY / civ.territory) : undefined,
    });
  }
  if (civ.isEmpire && share < 0.06) civ.isEmpire = false;

  // --- Stability tracking ---
  if (civ.stability < 22) civ.lowStabilityYears++;
  else civ.lowStabilityYears = Math.max(0, civ.lowStabilityYears - 1);

  // --- Civil war / split ---
  const bigEnough = civ.territory > 120 && civ.cityIds.length >= 2;
  if (bigEnough && civ.lowStabilityYears > 8) {
    const riskFactor = 0.04 + (100 - civ.happiness) / 1500 + (civ.isEmpire ? 0.03 : 0);
    if (rng.chance(riskFactor)) {
      splitCivilization(world, civ, rng);
      return;
    }
  }

  // Small unstable nations suffer unrest instead of splitting.
  if (civ.lowStabilityYears > 15 && !bigEnough && rng.chance(0.05)) {
    civ.population *= 0.92;
    civ.stability = Math.min(100, civ.stability + 15);
    civ.lowStabilityYears = 0;
    addEvent(world, {
      year: world.year,
      type: 'revolution',
      civIds: [civ.id],
      title: `Uprising in ${civ.name}`,
      description: `Years of hardship boiled over into revolt. The old order of ${civ.name} was overthrown, and a new regime restored a fragile calm.`,
      titleZh: `${civ.name}爆发起义`,
      descriptionZh: `多年的困苦终于酿成暴动。${civ.name}的旧秩序被推翻，新政权勉强恢复了平静。`,
      importance: 5,
    });
  }
}

/**
 * Transcendence: a civilization that mastered Dimensional Transcendence opens
 * a gate and, over a few generations, leaves this world entirely. Not death —
 * departure. The map is finite; the destinations are not.
 */
export function runAscension(world: WorldState, rng: SeededRandom): void {
  for (const civ of world.civs) {
    if (!civ.alive || !civ.researchedTechs.includes('transcendence')) continue;

    if (civ.ascendingSince === null) {
      civ.ascendingSince = world.year;
      addEvent(world, {
        year: world.year, type: 'ascension', civIds: [civ.id],
        title: `${civ.name} opens the Gate`,
        description: `In the capital of ${civ.name}, a door was opened onto somewhere that is not this world. The first volunteers stepped through and did not come back — but they sent word: come.`,
        titleZh: `${civ.name}打开了「门」`,
        descriptionZh: `在${civ.name}的都城，一扇通往"别处"的门被打开了。第一批志愿者走了进去，没有回来——但他们传回了讯息：来吧。`,
        importance: 9,
        x: civ.territory > 0 ? Math.round(civ.sumX / civ.territory) : undefined,
        y: civ.territory > 0 ? Math.round(civ.sumY / civ.territory) : undefined,
      });
      continue;
    }

    // The exodus: population flows through the gate, year after year.
    civ.population *= 0.96;
    civ.happiness = Math.min(100, civ.happiness + 0.5);

    const finished = civ.population < 800 || world.year - civ.ascendingSince > 200;
    if (finished) {
      const age = world.year - civ.foundedYear;
      writeEpitaph(world, civ, 'conquest'); // placeholder, immediately rewritten below
      const ep = world.epitaphs[world.epitaphs.length - 1];
      if (ep && ep.civId === civ.id) {
        ep.ascended = true;
        ep.textEn = `Here rose ${civ.name}, ${age} years a nation. They did not fall. They finished, and went elsewhere. The gate still hums at dusk.`;
        ep.textZh = `${civ.name}在此崛起，立国 ${age} 年。他们没有灭亡——他们完成了，然后去了别处。黄昏时分，那扇门仍在低鸣。`;
      }
      compactTiles(world, civ);
      for (const t of [...civ.tiles]) {
        if (world.map.owner[t] === civ.index) {
          // Those who chose to stay remain in the wilderness.
          world.map.owner[t] = -1;
          world.map.population[t] *= 0.25;
        }
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
      civ.ascended = true;
      civ.deathYear = world.year;
      addEvent(world, {
        year: world.year, type: 'ascension', civIds: [civ.id],
        title: `${civ.name} leaves this world`,
        description: `After ${age} years, the last of the ${civ.name} stepped through the Gate and closed it gently behind them. Their cities stand empty, their fields grow wild, and somewhere beyond geometry, their story continues.`,
        titleZh: `${civ.name}离开了这个世界`,
        descriptionZh: `${age} 年的历史之后，最后一批${civ.name}人穿过了那扇门，并轻轻将它带上。他们的城市空了，田野重归荒芜——而在几何之外的某处，他们的故事仍在继续。`,
        importance: 10,
      });
      void rng;
    }
  }
}

/**
 * Rebirth: wilderness populations (ruins of extinct nations, or migrants who
 * settled unclaimed land) can coalesce into a brand-new civilization.
 * Keeps 10,000-year histories alive: collapse -> dark age -> new peoples.
 */
export function runRebirth(world: WorldState, rng: SeededRandom): void {
  if (world.year < 60) return;
  const aliveCount = world.civs.reduce((s, c) => s + (c.alive ? 1 : 0), 0);
  if (aliveCount >= 25 || world.civs.length >= 120) return; // bound the roster
  const prob = aliveCount === 0 ? 0.03 : aliveCount < 3 ? 0.008 : 0.0015;
  if (!rng.chance(prob)) return;

  // Find the most promising unowned site: populated ruins on fertile land.
  const m = world.map;
  let best = -1;
  let bestScore = 90; // minimum (population × fertility) to found a nation
  for (let i = 0; i < m.owner.length; i++) {
    if (m.owner[i] !== -1 || m.terrain[i] === TERRAIN_INDEX.ocean) continue;
    if (m.fertility[i] < 0.35 || m.population[i] < 180) continue;
    const score = m.population[i] * m.fertility[i];
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best < 0) return;

  const cfg = randomCivConfig(rng, civNamePool, world.civs.length);
  const civ = createCivilization(world, { ...cfg, startPopulation: 0 }, world.year, null);
  const bx = best % m.width;
  const by = Math.floor(best / m.width);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = bx + dx;
      const ny = by + dy;
      if (nx < 0 || ny < 0 || nx >= m.width || ny >= m.height) continue;
      const t = ny * m.width + nx;
      if (m.owner[t] === -1 && m.terrain[t] !== TERRAIN_INDEX.ocean) {
        claimTile(world, civ, t); // absorbs the ruins population
      }
    }
  }
  if (civ.population < 150) {
    // Seed a small founding population if the ruins were too sparse.
    const boost = 300 / Math.max(1, civ.tiles.length);
    for (const t of civ.tiles) m.population[t] += boost;
    civ.population += 300;
  }
  const nearRuin = world.epitaphs.find((e) => (e.x - bx) ** 2 + (e.y - by) ** 2 <= 144);
  addEvent(world, {
    year: world.year,
    type: 'birth',
    civIds: [civ.id],
    title: `${civ.name} emerges`,
    description:
      aliveCount === 0
        ? `Out of a silent world, survivors gathered among old ruins. They call themselves the ${demonym(civ.name)} — and history begins again.`
        : nearRuin
          ? `Among the ruins of ${nearRuin.name}, wanderers found old writing and called the ancients giants. They named themselves ${civ.name}, and swore to do better.`
          : `In the unclaimed wilds, scattered peoples united into a new nation: ${civ.name}.`,
    titleZh: `${civ.name}崛起`,
    descriptionZh:
      aliveCount === 0
        ? `在一片死寂的世界上，幸存者聚集于古老的废墟之间。他们自称${civ.name}人 — 历史再次开始。`
        : nearRuin
          ? `在${nearRuin.name}的废墟之间，流浪者发现了旧日的文字，并把先民称作巨人。他们自名为${civ.name}，并发誓要做得更好。`
          : `在无主的荒野中，散落的部族联合成一个新的国家：${civ.name}。`,
    importance: 8,
    x: bx,
    y: by,
  });
}

export function splitCivilization(world: WorldState, civ: Civilization, rng: SeededRandom): Civilization | null {
  compactTiles(world, civ);
  if (civ.tiles.length < 20) return null;
  const m = world.map;

  // Rebellion seeds at the city (or tile) farthest from the capital.
  const capital = civ.capitalCityId ? world.cities[parseInt(civ.capitalCityId.slice(5), 10)] : null;
  const cx = capital ? capital.x : civ.sumX / Math.max(1, civ.territory);
  const cy = capital ? capital.y : civ.sumY / Math.max(1, civ.territory);
  let seedTile = -1;
  let bestD = -1;
  const rebelCities = civ.cityIds
    .map((id) => world.cities[parseInt(id.slice(5), 10)])
    .filter((c) => c && !c.destroyed && c.id !== civ.capitalCityId);
  if (rebelCities.length > 0) {
    for (const c of rebelCities) {
      const d = (c.x - cx) ** 2 + (c.y - cy) ** 2;
      if (d > bestD) {
        bestD = d;
        seedTile = c.tile;
      }
    }
  } else {
    for (let s = 0; s < Math.min(40, civ.tiles.length); s++) {
      const t = civ.tiles[rng.nextInt(0, civ.tiles.length - 1)];
      const d = ((t % m.width) - cx) ** 2 + (Math.floor(t / m.width) - cy) ** 2;
      if (d > bestD) {
        bestD = d;
        seedTile = t;
      }
    }
  }
  if (seedTile < 0) return null;

  // Plan the secession region FIRST — only create the rebel nation if viable.
  // BFS from seed tile over the parent's territory, taking ~40% of tiles.
  const takeTarget = Math.floor(civ.tiles.length * 0.4);
  const visited = new Set<number>([seedTile]);
  const queue = [seedTile];
  const taken: number[] = [];
  while (queue.length > 0 && taken.length < takeTarget) {
    const cur = queue.shift()!;
    if (m.owner[cur] === civ.index) {
      taken.push(cur);
      const x = cur % m.width;
      const y = Math.floor(cur / m.width);
      const neigh = [
        x > 0 ? cur - 1 : -1,
        x < m.width - 1 ? cur + 1 : -1,
        y > 0 ? cur - m.width : -1,
        y < m.height - 1 ? cur + m.width : -1,
      ];
      for (const nt of neigh) {
        if (nt >= 0 && !visited.has(nt) && m.owner[nt] === civ.index) {
          visited.add(nt);
          queue.push(nt);
        }
      }
    }
  }
  if (taken.length < 10 || civ.population < 1500) return null;

  // Mutated traits: the breakaway rejects its parent culture.
  const t = civ.traits;
  const mut = (v: number) => Math.max(5, Math.min(95, v + rng.nextInt(-25, 25)));
  const traits: Traits = {
    aggression: mut(t.aggression + 10),
    trade: mut(t.trade),
    science: mut(t.science),
    migration: mut(t.migration),
    expansion: mut(t.expansion),
    diplomacy: mut(t.diplomacy - 10),
    birthRate: mut(t.birthRate),
    riskTaking: mut(t.riskTaking + 10),
  };
  const name = generateCivName(rng, civNamePool);
  const color = CIV_COLORS[world.civs.length % CIV_COLORS.length];
  const rebel = createCivilization(
    world,
    { name, color, traits, startPopulation: 0, startTechs: [...civ.researchedTechs] },
    world.year,
    civ.id,
  );
  rebel.technologyLevel = rebel.researchedTechs.length;
  rebel.culture = civ.culture * 0.6;
  rebel.economy = civ.economy * 0.7;

  const parentPopBefore = civ.population;
  const parentTilesBefore = civ.tiles.length;
  for (const tile of taken) transferTile(world, tile, rebel, 1);

  // Rebels take a population share proportional to the land they seized —
  // outlying provinces are sparse, so bolster them from the parent's masses.
  const share = Math.min(0.45, taken.length / Math.max(1, parentTilesBefore));
  const desired = parentPopBefore * share * 0.85;
  if (rebel.population < desired && rebel.tiles.length > 0) {
    const parentPopNow = civ.population;
    const delta = Math.min(desired - rebel.population, parentPopNow * 0.4);
    civ.population = parentPopNow - delta;
    // Thin the parent's tiles uniformly; settle the migrants on rebel land.
    if (parentPopNow > 0) {
      const parentRatio = civ.population / parentPopNow;
      for (const t of civ.tiles) {
        if (m.owner[t] === civ.index) m.population[t] *= parentRatio;
      }
    }
    const per = delta / rebel.tiles.length;
    for (const t of rebel.tiles) m.population[t] += per;
    rebel.population += delta;
  }
  // Transfer cities inside the taken region.
  for (const cid of [...civ.cityIds]) {
    const c = world.cities[parseInt(cid.slice(5), 10)];
    if (c && !c.destroyed && m.owner[c.tile] === rebel.index) {
      c.ownerId = rebel.id;
      civ.cityIds = civ.cityIds.filter((id) => id !== c.id);
      rebel.cityIds.push(c.id);
      if (civ.capitalCityId === c.id) civ.capitalCityId = civ.cityIds[0] ?? null;
    }
  }
  if (rebel.cityIds.length > 0) {
    rebel.capitalCityId = rebel.cityIds[0];
    const cap = world.cities[parseInt(rebel.capitalCityId.slice(5), 10)];
    if (cap) cap.level = 'capital';
  }

  rebel.military = civ.military * 0.5;
  civ.military *= 0.6;
  civ.stability = Math.min(100, civ.stability + 25); // the pressure is released
  civ.lowStabilityYears = 0;
  civ.isEmpire = false;

  const rebelPopStr = Math.round(rebel.population).toLocaleString('en-US');
  addEvent(world, {
    year: world.year,
    type: 'split',
    civIds: [civ.id, rebel.id],
    title: `${civ.name} fractures — ${rebel.name} is born`,
    description: `Civil war tore ${civ.name} apart. The ${demonym(rebel.name)} broke away with ${rebel.cityIds.length} cities and ${rebelPopStr} people, declaring independence.`,
    titleZh: `${civ.name}分裂 — ${rebel.name}诞生`,
    descriptionZh: `内战撕裂了${civ.name}。${rebel.name}人带着 ${rebel.cityIds.length} 座城市与 ${rebelPopStr} 人口宣布独立。`,
    importance: 9,
    x: seedTile % m.width,
    y: Math.floor(seedTile / m.width),
  });

  // The divorce is rarely amicable.
  world.relations[civ.index][rebel.index] = -70;
  world.relations[rebel.index][civ.index] = -70;
  if (rng.chance(0.5)) {
    declareWar(world, civ, rebel, rng);
  }
  return rebel;
}
