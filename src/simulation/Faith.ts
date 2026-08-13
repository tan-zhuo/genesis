// The philosophical layer: belief emerges from history, civilizations pray to
// the observer and remember every answer — or every silence. The dead leave
// epitaphs; thinkers ask questions their history taught them to ask.
import { SeededRandom } from './Random';
import { techMultipliers } from './Technology';
import { Civilization, WorldState } from './types';
import { addEvent } from './World';

// ---- Doctrines: worldviews that crystallize out of lived history ----

export interface Doctrine {
  id: string;
  icon: string;
  nameEn: string;
  nameZh: string;
  creedEn: string;
  creedZh: string;
  // permanent trait nudges applied at adoption — belief reshapes a people
  traits: Partial<Record<'aggression' | 'trade' | 'science' | 'birthRate' | 'riskTaking' | 'diplomacy', number>>;
}

export const DOCTRINES: Doctrine[] = [
  {
    id: 'harvest', icon: '🌾', nameEn: 'The Way of Plenty', nameZh: '丰饶之道',
    creedEn: 'The soil gives to those who give to each other.',
    creedZh: '大地馈赠那些彼此馈赠的人。',
    traits: { birthRate: 12, aggression: -10, diplomacy: 8 },
  },
  {
    id: 'storm', icon: '🌩', nameEn: 'The Storm Cult', nameZh: '风暴崇拜',
    creedEn: 'What the sky spares, the sky owns.',
    creedZh: '凡上天未取走的，皆为上天所有。',
    traits: { aggression: 12, riskTaking: 10, science: -5 },
  },
  {
    id: 'void', icon: '🌑', nameEn: 'The Silent Sky', nameZh: '寂空之思',
    creedEn: 'No one is watching. That is why it matters what we do.',
    creedZh: '无人注视。正因如此，我们的所作所为才有意义。',
    traits: { science: 15, riskTaking: -5, birthRate: -5 },
  },
  {
    id: 'gold', icon: '🪙', nameEn: 'The Golden Scale', nameZh: '金秤信条',
    creedEn: 'Every debt is repaid; every kindness is a loan.',
    creedZh: '凡债必偿，凡善皆贷。',
    traits: { trade: 15, diplomacy: 8, aggression: -5 },
  },
  {
    id: 'ash', icon: '🕯', nameEn: 'The Order of Ashes', nameZh: '灰烬教团',
    creedEn: 'All things end. Live so the ending finds you unashamed.',
    creedZh: '万物皆有终局。活着，是为了在终局来临时问心无愧。',
    traits: { riskTaking: 12, birthRate: 8, science: 5 },
  },
  {
    id: 'war', icon: '⚔️', nameEn: 'The Iron Creed', nameZh: '铁血信条',
    creedEn: 'Peace is the interval in which the strong grow careless.',
    creedZh: '和平，不过是强者放松警惕的间隙。',
    traits: { aggression: 15, riskTaking: 8, diplomacy: -10 },
  },
];

const DOCTRINE_BY_ID = new Map(DOCTRINES.map((d) => [d.id, d]));
export function getDoctrine(id: string | null): Doctrine | null {
  return id ? DOCTRINE_BY_ID.get(id) ?? null : null;
}

// ---- God names: what the world comes to call you ----

export interface GodTitle {
  id: string;
  nameEn: string;
  nameZh: string;
}

export const GOD_TITLES: Record<string, GodTitle> = {
  silent: { id: 'silent', nameEn: 'The Silent One', nameZh: '沉默者' },
  meteor: { id: 'meteor', nameEn: 'The Star-Hurler', nameZh: '掷星者' },
  plague: { id: 'plague', nameEn: 'The Plague-Sower', nameZh: '播疫者' },
  quake: { id: 'quake', nameEn: 'The Earth-Shaker', nameZh: '撼地者' },
  blight: { id: 'blight', nameEn: 'The Witherer', nameZh: '枯萎之主' },
  bless: { id: 'bless', nameEn: 'The Gardener', nameZh: '播绿者' },
  goldenAge: { id: 'goldenAge', nameEn: 'The Gilded Hand', nameZh: '鎏金之手' },
  spawnCiv: { id: 'spawnCiv', nameEn: 'The Worldmother', nameZh: '造物之母' },
  inciteWar: { id: 'inciteWar', nameEn: 'The War-Whisperer', nameZh: '燃战者' },
  forcePeace: { id: 'forcePeace', nameEn: 'The Peace-Bringer', nameZh: '抚剑者' },
};

function computeGodTitle(world: WorldState): string | null {
  const counts = new Map<string, number>();
  let total = 0;
  for (const iv of world.config.interventions ?? []) {
    if (iv.year > world.year) continue;
    counts.set(iv.type, (counts.get(iv.type) ?? 0) + 1);
    total++;
  }
  if (total === 0) return world.year >= 500 ? 'silent' : null;
  if (total < 3) return null;
  let best = '';
  let bestN = 0;
  for (const [type, n] of [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (n > bestN) {
      bestN = n;
      best = type;
    }
  }
  return best;
}

// ---- Philosopher questions, shaped by a civilization's own history ----

interface Musing {
  cond: (civ: Civilization, world: WorldState) => boolean;
  en: (civ: Civilization) => string;
  zh: (civ: Civilization) => string;
}

const MUSINGS: Musing[] = [
  {
    cond: (c) => c.memory.wars >= 3,
    en: () => 'If war made us who we are, will peace unmake us?',
    zh: () => '若战争造就了我们，和平会否将我们消解？',
  },
  {
    cond: (c) => c.traits.trade >= 65,
    en: () => 'We can price everything now. Was anything worth more before we could?',
    zh: () => '如今我们能为万物标价。可在我们学会标价之前，是否有些东西曾更贵重？',
  },
  {
    cond: (c) => c.faith.devotion >= 40,
    en: () => 'The god answers our prayers. Does that make us children, or pets?',
    zh: () => '神回应了我们的祈祷。这让我们成了神的孩子，还是神的宠物？',
  },
  {
    cond: (c) => c.faith.devotion <= -30,
    en: () => 'The sky never answered. Perhaps that was the answer.',
    zh: () => '天空从未回答。或许，沉默本身就是回答。',
  },
  {
    cond: (c) => c.memory.disasters >= 2,
    en: () => 'The mountain does not hate the village it buries. Is that mercy, or something worse?',
    zh: () => '山崩并不憎恨它掩埋的村庄。这算仁慈，还是比憎恨更可怕的东西？',
  },
  {
    cond: (c) => c.technologyLevel >= 9,
    en: () => 'We built minds that think faster than ours. What exactly did we finish building?',
    zh: () => '我们造出了比我们思考更快的头脑。我们究竟完成了什么的建造？',
  },
  {
    cond: (c) => c.isEmpire,
    en: (c) => `Maps now name half the world "${c.name}". Who will remember what the other names were?`,
    zh: (c) => `如今地图上半个世界都写着「${c.name}」。谁还会记得其余的名字曾是什么？`,
  },
  {
    cond: (c, w) => w.epitaphs.length > 0 && c.alive,
    en: () => 'We plough fields over the bones of nations. One day, whose plough passes over ours?',
    zh: () => '我们在亡国的白骨之上耕田。有朝一日，谁的犁铧会从我们的白骨上经过？',
  },
  {
    cond: (c) => c.happiness >= 70 && c.stability >= 70,
    en: () => 'The granaries are full and the borders quiet. Why do the songs turn sad in good years?',
    zh: () => '谷仓已满，边境无事。为何越是好年景，歌谣越是悲伤？',
  },
  {
    cond: () => true,
    en: () => 'A single life is too short to see history move. Perhaps that is history\'s kindness.',
    zh: () => '一个人的一生太短，看不见历史移动。也许，这正是历史的仁慈。',
  },
];

// ---- Epitaphs ----

function dominantTraitLine(civ: Civilization): { en: string; zh: string } {
  const t = civ.traits;
  const entries: [string, number, string, string][] = [
    ['aggression', t.aggression, 'It loved the sword more than the plough.', '它爱刀剑，胜过爱犁铧。'],
    ['trade', t.trade, 'It loved gold more than grain.', '它爱黄金，胜过爱麦田。'],
    ['science', t.science, 'It loved questions more than comfort.', '它爱追问，胜过爱安逸。'],
    ['migration', t.migration, 'It loved the horizon more than any home.', '它爱地平线，胜过爱任何家园。'],
    ['diplomacy', t.diplomacy, 'It loved its neighbors, for better and worse.', '它爱它的邻人——无论结局好坏。'],
    ['expansion', t.expansion, 'It measured itself in miles.', '它用疆土的里程丈量自己。'],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return { en: entries[0][2], zh: entries[0][3] };
}

export function writeEpitaph(world: WorldState, civ: Civilization, cause: 'conquest' | 'famine'): void {
  const lifespan = world.year - civ.foundedYear;
  const h = world.civHistories[civ.id];
  const peak = h ? Math.max(0, ...h.population) : civ.population;
  const doctrine = getDoctrine(civ.faith.doctrine);
  const trait = dominantTraitLine(civ);
  const peakStr = peak >= 1e6 ? `${(peak / 1e6).toFixed(1)}M` : peak >= 1e3 ? `${(peak / 1e3).toFixed(0)}K` : `${Math.round(peak)}`;

  const causeEn = cause === 'conquest' ? 'It fell to the sword.' : 'It starved in silence.';
  const causeZh = cause === 'conquest' ? '它亡于刀兵。' : '它在无声中饿殁。';
  const doctrineEn = doctrine ? ` It believed: "${doctrine.creedEn}"` : '';
  const doctrineZh = doctrine ? `它曾坚信：「${doctrine.creedZh}」` : '';

  const textEn = `Here lay ${civ.name}, ${lifespan} years a nation, ${peakStr} souls at its height. ${trait.en} ${causeEn}${doctrineEn}`;
  const textZh = `${civ.name}长眠于此。立国 ${lifespan} 年，盛时人口 ${peakStr}。${trait.zh}${causeZh}${doctrineZh}`;

  const x = civ.territory > 0 ? Math.round(civ.sumX / civ.territory) : Math.round(civ.sumX) || 0;
  const y = civ.territory > 0 ? Math.round(civ.sumY / civ.territory) : Math.round(civ.sumY) || 0;
  // Prefer the (former) capital's location if we still know it.
  const cap = civ.capitalCityId ? world.cities[parseInt(civ.capitalCityId.slice(5), 10)] : null;
  world.epitaphs.push({
    civId: civ.id,
    name: civ.name,
    color: civ.color,
    x: cap ? cap.x : x,
    y: cap ? cap.y : y,
    foundedYear: civ.foundedYear,
    deathYear: world.year,
    textEn,
    textZh,
  });
  if (world.epitaphs.length > 48) world.epitaphs.shift();
}

// ---- Faith bookkeeping from interventions (called by Intervention.ts) ----

export function receiveWrath(civ: Civilization): void {
  civ.faith.wraths++;
  // High-culture peoples resent; harsher, younger cultures learn to fear-worship.
  if (civ.culture < 40) civ.faith.devotion = Math.min(100, civ.faith.devotion + 12);
  else civ.faith.devotion = Math.max(-100, civ.faith.devotion - 15);
}

export function receiveMiracle(world: WorldState, civ: Civilization, kinds: string[] | 'any'): void {
  civ.faith.miracles++;
  civ.faith.devotion = Math.min(100, civ.faith.devotion + 15);
  const prayer = civ.faith.pendingPrayer;
  if (prayer && (kinds === 'any' || kinds.includes(prayer.kind))) {
    civ.faith.devotion = Math.min(100, civ.faith.devotion + 20);
    civ.faith.pendingPrayer = null;
    addEvent(world, {
      year: world.year, type: 'faith', civIds: [civ.id],
      title: `The prayers of ${civ.name} are answered`,
      description: `What they begged the sky for came to pass. In ${civ.name}, no one doubts anymore — though some now fear what listens.`,
      titleZh: `${civ.name}的祈祷得到了回应`,
      descriptionZh: `他们向上天恳求的事，应验了。在${civ.name}，再没有人怀疑——尽管有些人开始害怕那个正在倾听的存在。`,
      importance: 7,
    });
  }
}

// ---- The yearly faith phase ----

export function runFaith(world: WorldState, rng: SeededRandom): void {
  // World: does the god have a name yet?
  const titleId = computeGodTitle(world);
  if (titleId && world.godName?.id !== titleId) {
    const first = world.godName === null;
    world.godName = { id: titleId, sinceYear: world.year };
    const t = GOD_TITLES[titleId];
    if (t) {
      addEvent(world, {
        year: world.year, type: 'faith', civIds: [],
        title: first ? `The world names its god: ${t.nameEn}` : `The world renames its god: ${t.nameEn}`,
        description:
          titleId === 'silent'
            ? 'Generations watched the sky and nothing ever moved. The priests have begun to speak, carefully, of The Silent One.'
            : `From what the sky has done, the prophets have deduced what the sky must be. They call you ${t.nameEn}.`,
        titleZh: first ? `世界为它的神取了名字：${t.nameZh}` : `世界重新为神命名：${t.nameZh}`,
        descriptionZh:
          titleId === 'silent'
            ? '数代人仰望天空，天空从未动过。祭司们开始小心翼翼地谈论「沉默者」。'
            : `根据上天的所作所为，先知们推断出了上天的本性。他们称你为「${t.nameZh}」。`,
        importance: 8,
      });
    }
  }

  for (const civ of world.civs) {
    if (!civ.alive) continue;
    const f = civ.faith;

    // Devotion decays slowly toward zero — faith must be fed.
    f.devotion *= 0.997;

    // Faith shapes society: the devout are cohesive, the defiant are curious.
    if (f.devotion > 30) civ.stability = Math.min(100, civ.stability + 0.05);
    if (f.devotion < -30) civ.researchProgress += 0.4; // "they stopped watching the sky and studied the stars"

    // --- Prayers ---
    let foodMult = techMultipliers(civ.researchedTechs).food;
    if (world.year <= civ.foodPenaltyUntil) foodMult *= civ.foodPenaltyMult;
    const foodRatio = civ.population > 0 ? (civ.yields.food * 220 * foodMult) / civ.population : 1;
    let prayerKind: 'famine' | 'war' | 'plague' | 'decline' | null = null;
    if (foodRatio < 0.55) prayerKind = 'famine';
    else if (civ.warYears >= 5 && civ.stability < 40) prayerKind = 'war';
    else if (world.year <= civ.foodPenaltyUntil && civ.foodPenaltyMult < 0.8) prayerKind = 'plague';
    else if (civ.stability < 22 && civ.population < 5000) prayerKind = 'decline';

    if (prayerKind && !f.pendingPrayer && world.year - f.lastPrayerYear >= 40 && rng.chance(0.25)) {
      f.pendingPrayer = { year: world.year, kind: prayerKind };
      f.lastPrayerYear = world.year;
      const texts: Record<string, { en: string; zh: string }> = {
        famine: {
          en: `The granaries of ${civ.name} are empty. Their priests climb the hills and beg the sky for fertile land.`,
          zh: `${civ.name}的谷仓空了。祭司们登上山丘，向天空乞求丰饶的土地。`,
        },
        war: {
          en: `Bled white by war, the people of ${civ.name} light candles and pray for the fighting to end.`,
          zh: `被战争放干了血的${civ.name}人点起蜡烛，祈求战火止息。`,
        },
        plague: {
          en: `As the sickness spreads, ${civ.name} prays for deliverance — or at least an explanation.`,
          zh: `疫病蔓延之际，${civ.name}祈求拯救——或者至少，一个解释。`,
        },
        decline: {
          en: `${civ.name} is fading, and knows it. Their last temples ask only to be remembered.`,
          zh: `${civ.name}正在凋零，他们自己也知道。最后的神庙里，他们只求被记住。`,
        },
      };
      const tx = texts[prayerKind];
      addEvent(world, {
        year: world.year, type: 'prayer', civIds: [civ.id],
        title: `${civ.name} prays`,
        description: tx.en,
        titleZh: `${civ.name}在祈祷`,
        descriptionZh: tx.zh,
        importance: 8,
        x: civ.territory > 0 ? Math.round(civ.sumX / civ.territory) : undefined,
        y: civ.territory > 0 ? Math.round(civ.sumY / civ.territory) : undefined,
      });
    }

    // Unanswered prayers curdle into doubt.
    if (f.pendingPrayer && world.year - f.pendingPrayer.year > 15) {
      f.pendingPrayer = null;
      f.devotion = Math.max(-100, f.devotion - 10);
      if (rng.chance(0.5)) {
        addEvent(world, {
          year: world.year, type: 'faith', civIds: [civ.id],
          title: `The sky did not answer ${civ.name}`,
          description: `They prayed, and the world went on exactly as before. In ${civ.name}, the temples are a little emptier this year.`,
          titleZh: `天空没有回答${civ.name}`,
          descriptionZh: `他们祈祷了，而世界一切如常。今年，${civ.name}的神庙冷清了一些。`,
          importance: 5,
        });
      }
    }

    // --- Doctrine adoption / conversion ---
    if (world.year > 120 && world.year - civ.faith.doctrineYear > 250 && rng.chance(0.012)) {
      const scores: [string, number][] = [
        ['harvest', f.miracles * 3 + (civ.happiness > 65 ? 2 : 0) + civ.traits.birthRate / 40],
        ['storm', f.wraths * 3 + civ.memory.disasters],
        ['void', (f.devotion < -15 ? 4 : 0) + civ.traits.science / 25 + (f.miracles + f.wraths === 0 ? 2 : 0)],
        ['gold', civ.traits.trade / 20 + (civ.economy > 60 ? 2 : 0)],
        ['ash', civ.memory.disasters * 2 + world.epitaphs.length * 0.5 + civ.memory.famineYears / 30],
        ['war', civ.memory.wars * 1.5 + civ.traits.aggression / 30],
      ];
      scores.sort((a, b) => b[1] - a[1]);
      const [bestId, bestScore] = scores[0];
      if (bestScore >= 4 && bestId !== civ.faith.doctrine) {
        const doctrine = DOCTRINE_BY_ID.get(bestId)!;
        const old = getDoctrine(civ.faith.doctrine);
        civ.faith.doctrine = bestId;
        civ.faith.doctrineYear = world.year;
        // Belief reshapes the people — permanent trait drift.
        for (const [k, v] of Object.entries(doctrine.traits)) {
          const key = k as keyof typeof doctrine.traits;
          civ.traits[key] = Math.max(0, Math.min(100, civ.traits[key] + (v as number)));
        }
        addEvent(world, {
          year: world.year, type: 'faith', civIds: [civ.id],
          title: old
            ? `${civ.name} abandons ${old.nameEn} for ${doctrine.nameEn}`
            : `${civ.name} embraces ${doctrine.nameEn}`,
          description: `A generation of hardship and wonder has settled into belief. Their creed: "${doctrine.creedEn}"`,
          titleZh: old ? `${civ.name}背弃${old.nameZh}，皈依${doctrine.nameZh}` : `${civ.name}皈依${doctrine.nameZh}`,
          descriptionZh: `一整代人的苦难与奇迹，最终沉淀为信仰。他们的信条是：「${doctrine.creedZh}」`,
          importance: 7,
        });
      }
    }

    // --- Philosophers ---
    if (civ.culture > 30 && rng.chance(0.0022 * (civ.culture / 50))) {
      const candidates = MUSINGS.filter((m) => m.cond(civ, world));
      if (candidates.length > 0) {
        const m = rng.pick(candidates);
        addEvent(world, {
          year: world.year, type: 'philosophy', civIds: [civ.id],
          title: `A thinker rises in ${civ.name}`,
          description: `"${m.en(civ)}"`,
          titleZh: `${civ.name}诞生了一位思想家`,
          descriptionZh: `「${m.zh(civ)}」`,
          importance: 6,
        });
      }
    }
  }
}
