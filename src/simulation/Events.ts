// Natural disasters: seeded, configurable frequency, regional impact.
import { SeededRandom } from './Random';
import { demonym } from './names';
import { WorldState } from './types';
import { addEvent } from './World';
import { TERRAIN_INDEX } from './Terrain';

interface DisasterDef {
  type: string;
  title: (region: string) => string;
  titleZh: string;
  describe: (years: number, severity: number) => string;
  describeZh: (years: number, severity: number) => string;
  weight: number;
  popLoss: [number, number]; // fraction range within radius
  foodPenalty: [number, number]; // production multiplier range
  years: [number, number];
  radius: [number, number];
  importance: number;
}

const DISASTERS: DisasterDef[] = [
  {
    type: 'drought',
    title: () => 'The Great Drought',
    titleZh: '大旱灾',
    describe: (y, s) => `Rains failed and rivers thinned. Food production fell by ${Math.round(s * 100)}% for ${y} years.`,
    describeZh: (y, s) => `雨季失约，河流干涸。粮食产量下降 ${Math.round(s * 100)}%，持续了 ${y} 年。`,
    weight: 30,
    popLoss: [0.02, 0.08],
    foodPenalty: [0.5, 0.75],
    years: [3, 9],
    radius: [6, 14],
    importance: 6,
  },
  {
    type: 'flood',
    title: () => 'Catastrophic Floods',
    titleZh: '特大洪水',
    describe: (y) => `Rivers burst their banks, drowning fields and villages. Recovery took ${y} years.`,
    describeZh: (y) => `河水决堤，田野与村庄尽没于洪流。灾后恢复用了 ${y} 年。`,
    weight: 20,
    popLoss: [0.03, 0.1],
    foodPenalty: [0.65, 0.85],
    years: [1, 4],
    radius: [4, 8],
    importance: 5,
  },
  {
    type: 'earthquake',
    title: () => 'The Great Earthquake',
    titleZh: '大地震',
    describe: () => `The earth split and cities crumbled in moments.`,
    describeZh: () => `大地开裂，城池在顷刻间倾覆。`,
    weight: 15,
    popLoss: [0.05, 0.15],
    foodPenalty: [0.85, 0.95],
    years: [1, 2],
    radius: [3, 7],
    importance: 6,
  },
  {
    type: 'volcano',
    title: () => 'Volcanic Eruption',
    titleZh: '火山爆发',
    describe: (y) => `Ash darkened the sky for ${y} years, poisoning harvests across the region.`,
    describeZh: (y) => `火山灰遮蔽天空长达 ${y} 年，整个地区的收成尽毁。`,
    weight: 8,
    popLoss: [0.08, 0.2],
    foodPenalty: [0.5, 0.7],
    years: [2, 6],
    radius: [5, 10],
    importance: 7,
  },
  {
    type: 'plague',
    title: () => 'The Great Plague',
    titleZh: '大瘟疫',
    describe: (y, s) => `A terrible pestilence spread along the trade roads, killing ${Math.round(s * 100)}% of those it touched over ${y} years.`,
    describeZh: (y, s) => `可怕的瘟疫沿着商路蔓延，${y} 年间夺走了所到之处 ${Math.round(s * 100)}% 的生命。`,
    weight: 18,
    popLoss: [0.15, 0.35],
    foodPenalty: [0.8, 0.95],
    years: [2, 5],
    radius: [10, 20],
    importance: 8,
  },
  {
    type: 'meteor',
    title: () => 'A Star Falls',
    titleZh: '天星坠落',
    describe: () => `A burning stone fell from the heavens, obliterating everything near its impact.`,
    describeZh: () => `一块燃烧的巨石自天而降，将坠落之处的一切夷为平地。`,
    weight: 2,
    popLoss: [0.4, 0.8],
    foodPenalty: [0.4, 0.6],
    years: [3, 8],
    radius: [2, 5],
    importance: 9,
  },
  {
    type: 'winter',
    title: () => 'The Long Winter',
    titleZh: '漫长寒冬',
    describe: (y) => `Summer never came. Crops froze in the fields for ${y} consecutive years.`,
    describeZh: (y) => `夏天再未到来。连续 ${y} 年，庄稼冻毙于田野之中。`,
    weight: 12,
    popLoss: [0.04, 0.12],
    foodPenalty: [0.55, 0.75],
    years: [2, 6],
    radius: [8, 16],
    importance: 6,
  },
];

const TOTAL_WEIGHT = DISASTERS.reduce((s, d) => s + d.weight, 0);

export function runDisasters(world: WorldState, rng: SeededRandom): void {
  const freq = world.config.disasterFrequency;
  if (freq <= 0) return;
  if (!rng.chance(0.02 * freq)) return;

  // Weighted pick
  let roll = rng.next() * TOTAL_WEIGHT;
  let def = DISASTERS[0];
  for (const d of DISASTERS) {
    roll -= d.weight;
    if (roll <= 0) {
      def = d;
      break;
    }
  }

  const m = world.map;
  // Epicenter: prefer inhabited land so disasters matter.
  let epicenter = -1;
  for (let attempt = 0; attempt < 30; attempt++) {
    const t = rng.nextInt(0, m.width * m.height - 1);
    if (m.terrain[t] === TERRAIN_INDEX.ocean) continue;
    epicenter = t;
    if (m.owner[t] >= 0) break; // found inhabited land
  }
  if (epicenter < 0) return;

  const ex = epicenter % m.width;
  const ey = Math.floor(epicenter / m.width);
  const radius = rng.nextInt(def.radius[0], def.radius[1]);
  const years = rng.nextInt(def.years[0], def.years[1]);
  const popLoss = rng.range(def.popLoss[0], def.popLoss[1]);
  const foodPenalty = rng.range(def.foodPenalty[0], def.foodPenalty[1]);

  // Apply population loss within radius; track affected civs.
  const affected = new Map<number, number>(); // civIndex -> pop lost
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const nx = ex + dx;
      const ny = ey + dy;
      if (nx < 0 || ny < 0 || nx >= m.width || ny >= m.height) continue;
      const t = ny * m.width + nx;
      const owner = m.owner[t];
      if (m.population[t] > 0) {
        const falloff = 1 - Math.sqrt(dx * dx + dy * dy) / (radius + 1);
        const lost = m.population[t] * popLoss * falloff;
        m.population[t] -= lost;
        if (owner >= 0) affected.set(owner, (affected.get(owner) ?? 0) + lost);
      }
    }
  }

  const civIds: string[] = [];
  let totalLost = 0;
  for (const [idx, lost] of [...affected.entries()].sort((p, q) => p[0] - q[0])) {
    const civ = world.civs[idx];
    civ.population = Math.max(0, civ.population - lost);
    civ.foodPenaltyUntil = world.year + years;
    civ.foodPenaltyMult = foodPenalty;
    civ.happiness = Math.max(0, civ.happiness - 10);
    civ.stability = Math.max(0, civ.stability - 5);
    civ.memory.disasters++;
    civIds.push(civ.id);
    totalLost += lost;
  }

  world.disasters.push({ untilYear: world.year + years, x: ex, y: ey, radius, type: def.type });
  if (world.disasters.length > 20) world.disasters.shift();

  const affectedNames = civIds.map((id) => demonym(world.civs[parseInt(id.slice(4), 10)].name)).join(', ');
  const affectedNamesZh = civIds.map((id) => world.civs[parseInt(id.slice(4), 10)].name).join('、');
  const lostStr = Math.round(totalLost).toLocaleString('en-US');
  addEvent(world, {
    year: world.year,
    type: 'disaster',
    civIds,
    title: def.title(''),
    description: `${def.describe(years, popLoss)}${totalLost > 100 ? ` Around ${lostStr} people perished.` : ''}${affectedNames ? ` The ${affectedNames} suffered most.` : ''}`,
    titleZh: def.titleZh,
    descriptionZh: `${def.describeZh(years, popLoss)}${totalLost > 100 ? `约 ${lostStr} 人罹难。` : ''}${affectedNamesZh ? `${affectedNamesZh}受灾最重。` : ''}`,
    importance: def.importance,
    x: ex,
    y: ey,
  });
}
