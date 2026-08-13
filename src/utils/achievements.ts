// Achievements: light, observer-flavored goals. Purely client-side —
// checked against snapshots/events, persisted in localStorage, global
// across all worlds.
import { Snapshot, WorldEvent } from '../simulation/types';

export interface AchievementDef {
  id: string;
  icon: string;
  en: { name: string; desc: string };
  zh: { name: string; desc: string };
  check: (snapshot: Snapshot, events: WorldEvent[]) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'genesis',
    icon: '🌍',
    en: { name: 'Genesis', desc: 'Watch a world take its first steps (reach year 50).' },
    zh: { name: '创世', desc: '见证一个世界迈出最初的脚步（到达 50 年）。' },
    check: (s) => s.year >= 50,
  },
  {
    id: 'first-city',
    icon: '🏛',
    en: { name: 'The First Stones', desc: 'Witness the founding of the first city.' },
    zh: { name: '奠基之石', desc: '见证第一座城市的诞生。' },
    check: (s) => s.cities.length > 0,
  },
  {
    id: 'first-war',
    icon: '⚔️',
    en: { name: 'The First Spear', desc: 'Witness the first war in history.' },
    zh: { name: '第一支长矛', desc: '见证历史上的第一场战争。' },
    check: (_s, ev) => ev.some((e) => e.type === 'war'),
  },
  {
    id: 'empire',
    icon: '👑',
    en: { name: 'Imperium', desc: 'Watch an empire proclaim itself.' },
    zh: { name: '帝国当立', desc: '看着一个帝国宣布称帝。' },
    check: (_s, ev) => ev.some((e) => e.type === 'empire'),
  },
  {
    id: 'schism',
    icon: '💥',
    en: { name: 'Schism', desc: 'Watch a civil war tear a nation in two.' },
    zh: { name: '分崩离析', desc: '看着一场内战把国家撕成两半。' },
    check: (_s, ev) => ev.some((e) => e.type === 'split'),
  },
  {
    id: 'extinction',
    icon: '💀',
    en: { name: 'Ozymandias', desc: 'Watch a civilization vanish from history.' },
    zh: { name: '万世之基', desc: '看着一个文明从历史中彻底消失。' },
    check: (_s, ev) => ev.some((e) => e.type === 'extinction'),
  },
  {
    id: 'ai',
    icon: '🤖',
    en: { name: 'The Thinking Machine', desc: 'A civilization builds Artificial Intelligence.' },
    zh: { name: '会思考的机器', desc: '一个文明造出了人工智能。' },
    check: (s) => s.civs.some((c) => c.alive && c.researchedTechs.includes('ai')),
  },
  {
    id: 'deep-time',
    icon: '⏳',
    en: { name: 'Deep Time', desc: 'Simulate 10,000 years of history.' },
    zh: { name: '深邃时间', desc: '模拟一万年的历史。' },
    check: (s) => s.year >= 10000,
  },
  {
    id: 'dominator',
    icon: '🗺',
    en: { name: 'One Banner', desc: 'A single nation controls half the known world.' },
    zh: { name: '一统山河', desc: '一个国家控制了已知世界的一半。' },
    check: (s) => s.civs.some((c) => c.alive && c.territoryPct >= 50),
  },
  {
    id: 'last-standing',
    icon: '🏳',
    en: { name: 'Last One Standing', desc: 'Only one civilization remains alive.' },
    zh: { name: '硕果仅存', desc: '世界上只剩下一个文明。' },
    check: (s) => s.civs.length > 1 && s.civs.filter((c) => c.alive).length === 1,
  },
  {
    id: 'phoenix',
    icon: '🔥',
    en: { name: 'Phoenix', desc: 'A new nation rises long after the beginning.' },
    zh: { name: '浴火重生', desc: '在世界开始很久之后，一个新的民族崛起了。' },
    check: (_s, ev) => ev.some((e) => e.type === 'birth' && e.year > 0),
  },
  {
    id: 'hand-of-god',
    icon: '⚡',
    en: { name: 'The Hand of God', desc: 'Intervene in the world for the first time.' },
    zh: { name: '神之手', desc: '第一次亲手干预这个世界。' },
    check: (s) => s.interventions.length > 0,
  },
  {
    id: 'armageddon',
    icon: '☄️',
    en: { name: 'Armageddon', desc: 'Hurl a star at the world.' },
    zh: { name: '天降审判', desc: '向世界投下一颗陨星。' },
    check: (s) => s.interventions.some((iv) => iv.type === 'meteor'),
  },
  {
    id: 'peacemaker',
    icon: '🕊',
    en: { name: 'Peacemaker', desc: 'End a war with a wave of your hand.' },
    zh: { name: '和平缔造者', desc: '挥手之间平息一场战争。' },
    check: (s) => s.interventions.some((iv) => iv.type === 'forcePeace'),
  },
  {
    id: 'gardener',
    icon: '🌱',
    en: { name: 'The Gardener', desc: 'Bless the land, and plant a nation of your own.' },
    zh: { name: '园丁', desc: '赐福大地，并亲手栽下一个属于你的文明。' },
    check: (s) => s.interventions.some((iv) => iv.type === 'bless') && s.interventions.some((iv) => iv.type === 'spawnCiv'),
  },
  {
    id: 'stellar',
    icon: '🚀',
    en: { name: 'To Touch the Sky', desc: 'A civilization achieves Spaceflight — the planet is finite, the sky is not.' },
    zh: { name: '触摸星空', desc: '一个文明掌握了星际航行——行星是有限的，天空不是。' },
    check: (s) => s.civs.some((c) => c.researchedTechs.includes('spaceflight')),
  },
  {
    id: 'ascension',
    icon: '✨',
    en: { name: 'The Open Gate', desc: 'Witness a civilization leave this world — not by dying, but by finishing.' },
    zh: { name: '门开了', desc: '见证一个文明离开这个世界——不是因为灭亡，而是因为完成。' },
    check: (s) => s.civs.some((c) => c.ascended),
  },
  {
    id: 'world-at-war',
    icon: '🌐',
    en: { name: 'A World at War', desc: 'Three or more wars rage at the same time.' },
    zh: { name: '世界大战', desc: '三场以上的战争同时进行。' },
    check: (s) => s.wars.filter((w) => w.endYear === null).length >= 3,
  },
];

const STORAGE_KEY = 'civsim.achievements';

export function loadUnlocked(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function save(unlocked: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...unlocked]));
  } catch {
    /* ignore */
  }
}

/** Returns newly unlocked achievement defs (and persists them). */
export function checkAchievements(snapshot: Snapshot, events: WorldEvent[], unlocked: Set<string>): AchievementDef[] {
  const fresh: AchievementDef[] = [];
  for (const def of ACHIEVEMENTS) {
    if (unlocked.has(def.id)) continue;
    try {
      if (def.check(snapshot, events)) {
        unlocked.add(def.id);
        fresh.push(def);
      }
    } catch {
      /* a bad check must never break the app */
    }
  }
  if (fresh.length > 0) save(unlocked);
  return fresh;
}
