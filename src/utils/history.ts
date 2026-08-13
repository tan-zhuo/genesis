// Template-based world history narrative — no LLM, just data. Bilingual.
import { Snapshot, WorldEvent } from '../simulation/types';
import { techEraKeyOf } from '../simulation/Technology';
import { Lang, translate } from '../i18n';

function fmt(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

export interface WorldSummary {
  headline: { label: string; value: string }[];
  narrative: string[];
}

export function summarizeWorld(snapshot: Snapshot, allEvents: WorldEvent[], lang: Lang = 'en'): WorldSummary {
  const zh = lang === 'zh';
  const { year, civs, cities, stats } = snapshot;
  const alive = civs.filter((c) => c.alive);
  const dead = civs.filter((c) => !c.alive);
  const totalPop = alive.reduce((s, c) => s + c.population, 0);
  const totalWars = allEvents.filter((e) => e.type === 'war').length;
  const techsDiscovered = Math.max(0, ...alive.map((c) => c.technologyLevel));
  const majorEvents = allEvents.filter((e) => e.importance >= 7);
  const t = (k: string) => translate(lang, k);

  const headline = [
    { label: t('sum.year'), value: year.toLocaleString('en-US') },
    { label: t('sum.population'), value: fmt(totalPop) },
    { label: t('sum.civs'), value: `${alive.length}` },
    { label: t('sum.cities'), value: `${cities.length}` },
    { label: t('sum.wars'), value: `${totalWars}` },
    { label: t('sum.techs'), value: `${techsDiscovered}` },
    { label: t('sum.events'), value: `${majorEvents.length}` },
  ];

  const paragraphs: string[] = [];
  const startCivCount = civs.filter((c) => c.foundedYear === 0).length;
  paragraphs.push(
    zh ? `这个世界始于 ${startCivCount} 个文明。` : `The world began with ${startCivCount} civilizations.`,
  );

  // Early period: first agriculture and first cities.
  const firstAgri = allEvents.find((e) => e.type === 'technology' && e.title.includes('Agriculture'));
  if (firstAgri) {
    const who = civs.find((c) => c.id === firstAgri.civilizationIds[0]);
    paragraphs.push(
      zh
        ? `${firstAgri.year} 年，${who?.name ?? '早期先民'}掌握了农业，粮食盈余开始重塑日常生活。`
        : `In year ${firstAgri.year}, ${who?.name ?? 'an early people'} discovered agriculture, and food surpluses began to reshape daily life.`,
    );
  }
  const firstCity = allEvents.find((e) => e.type === 'city-founded');
  if (firstCity) {
    const cityName = firstCity.title.replace(' founded', '').replace(/ grows into.*$/, '');
    paragraphs.push(
      zh
        ? `第一座城市 ${cityName} 于 ${firstCity.year} 年建立。`
        : `The first city, ${cityName}, was founded in year ${firstCity.year}.`,
    );
  }

  // First war.
  const firstWar = allEvents.find((e) => e.type === 'war');
  if (firstWar) {
    paragraphs.push(
      zh
        ? `和平未能永续：${firstWar.year} 年，第一场战争爆发。`
        : `Peace did not last forever: ${firstWar.title.replace(' begins', '')} broke out in year ${firstWar.year}.`,
    );
  } else if (totalWars === 0 && year > 500) {
    paragraphs.push(
      zh
        ? `令人惊叹的是，${year} 年的信史中竟无一场战争。`
        : `Remarkably, not a single war was fought in ${year} years of recorded history.`,
    );
  }

  // Empires.
  const empires = allEvents.filter((e) => e.type === 'empire');
  if (empires.length > 0) {
    const first = empires[0];
    const empireName = first.title.replace(' rises', '').replace('The ', '');
    paragraphs.push(
      zh
        ? `约 ${first.year} 年，第一个大帝国崛起：${first.civilizationIds[0] ? civs.find((c) => c.id === first.civilizationIds[0])?.name ?? empireName : empireName}。`
        : `Around year ${first.year}, the first great empire emerged: ${empireName}.`,
    );
  }

  // Splits and collapses.
  const splits = allEvents.filter((e) => e.type === 'split');
  if (splits.length > 0) {
    paragraphs.push(
      zh
        ? `帝国终究脆弱。${splits.length} 场内战撕裂旧国、催生新邦，第一次分裂发生在 ${splits[0].year} 年。`
        : `Empires proved fragile. ${splits.length === 1 ? 'One civil war' : `${splits.length} civil wars`} fractured old nations and gave birth to new ones, beginning in year ${splits[0].year}.`,
    );
  }

  // Extinctions.
  if (dead.length > 0) {
    const names = dead.map((c) => c.name).join(zh ? '、' : ', ');
    paragraphs.push(
      zh
        ? `${dead.length} 个文明没能活到今天：${names}。`
        : `${dead.length === 1 ? 'One civilization' : `${dead.length} civilizations`} did not survive to the present day: ${names}.`,
    );
  }

  // Technology era.
  if (alive.length > 0) {
    const leader = [...alive].sort((a, b) => b.technologyLevel - a.technologyLevel)[0];
    const era = translate(lang, `era.${techEraKeyOf(leader.researchedTechs)}`);
    const hasAi = leader.researchedTechs.includes('ai');
    paragraphs.push(
      zh
        ? `到 ${year} 年，最先进的国家${leader.name}已进入${era}${hasAi ? '，并造出了人工智能' : ''}。`
        : `By year ${year}, the most advanced nation, ${leader.name}, had reached the ${era} era${hasAi ? ' — and built artificial minds' : ''}.`,
    );
    const biggest = [...alive].sort((a, b) => b.territoryPct - a.territoryPct)[0];
    paragraphs.push(
      zh
        ? `${biggest.name}是当今最大的强权，控制着已知世界 ${biggest.territoryPct.toFixed(1)}% 的土地，拥有 ${fmt(biggest.population)} 人口与 ${biggest.cityCount} 座城市。`
        : `${biggest.name} stands as the largest power, controlling ${biggest.territoryPct.toFixed(1)}% of the known world with ${fmt(biggest.population)} people across ${biggest.cityCount} cities.`,
    );
  } else {
    paragraphs.push(
      zh
        ? `到 ${year} 年，已无文明存续。世界归于沉寂，废墟被森林与黄沙慢慢吞没。`
        : `By year ${year}, no civilization remained. The world fell silent, its ruins slowly reclaimed by forest and sand.`,
    );
  }

  // Population trend.
  if (stats.length > 10) {
    const mid = stats[Math.floor(stats.length / 2)];
    const last = stats[stats.length - 1];
    if (last.population > mid.population * 1.5) {
      paragraphs.push(
        zh
          ? `晚近的时代是增长的时代：世界人口从 ${fmt(mid.population)} 增至 ${fmt(last.population)}。`
          : `The recent era was one of growth: world population rose from ${fmt(mid.population)} to ${fmt(last.population)}.`,
      );
    } else if (last.population < mid.population * 0.7) {
      paragraphs.push(
        zh
          ? `晚近的时代是衰退的时代：世界人口从 ${fmt(mid.population)} 跌至 ${fmt(last.population)}。`
          : `The recent era was one of decline: world population fell from ${fmt(mid.population)} to ${fmt(last.population)}.`,
      );
    }
  }

  return { headline, narrative: paragraphs };
}

/** Plain-text export of the world history. */
export function exportHistoryText(snapshot: Snapshot, allEvents: WorldEvent[], lang: Lang = 'en'): string {
  const zh = lang === 'zh';
  const summary = summarizeWorld(snapshot, allEvents, lang);
  const lines: string[] = [zh ? '世界历史 WORLD HISTORY' : 'WORLD HISTORY', '='.repeat(40), ''];
  for (const h of summary.headline) lines.push(`${h.label}: ${h.value}`);
  lines.push('', zh ? '纪事' : 'NARRATIVE', '-'.repeat(40));
  lines.push(...summary.narrative, '', zh ? '重大事件' : 'MAJOR EVENTS', '-'.repeat(40));
  for (const e of allEvents.filter((ev) => ev.importance >= 6)) {
    const title = zh && e.titleZh ? e.titleZh : e.title;
    const desc = zh && e.descriptionZh ? e.descriptionZh : e.description;
    lines.push(zh ? `${e.year} 年 — ${title}` : `Year ${e.year} — ${title}`, `  ${desc}`, '');
  }
  return lines.join('\n');
}
