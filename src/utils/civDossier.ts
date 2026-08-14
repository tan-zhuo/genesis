// Builds a compact, LLM-ready dossier for one civilization: traits, numeric
// trajectories, tech path, wars, faith, major events, epitaph, world context.
// Deliberately budget-capped (~4k tokens) so it fits small free models.
import { CivSummary, Snapshot, WorldConfig, WorldEvent } from '../simulation/types';
import { TECH_BY_ID } from '../simulation/Technology';
import { DOCTRINES } from '../simulation/Faith';
import { Lang } from '../i18n';

function fmt(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

/** Sample a history series down to at most `k` points, always keeping the last. */
function sampleSeries(years: number[], values: number[], k = 14): string {
  if (years.length === 0) return '—';
  const step = Math.max(1, Math.floor(years.length / k));
  const parts: string[] = [];
  for (let i = 0; i < years.length; i += step) {
    parts.push(`y${years[i]}:${fmt(values[i])}`);
  }
  const last = years.length - 1;
  if ((last % step) !== 0) parts.push(`y${years[last]}:${fmt(values[last])}`);
  return parts.join(', ');
}

function doctrineName(id: string | null, lang: Lang): string {
  if (!id) return lang === 'zh' ? '无信条' : 'no doctrine';
  const d = DOCTRINES.find((x) => x.id === id);
  return d ? (lang === 'zh' ? d.nameZh : d.nameEn) : id;
}

function techName(id: string, lang: Lang): string {
  const t = TECH_BY_ID.get(id);
  return t ? (lang === 'zh' ? t.nameZh : t.name) : id;
}

/** Events that belong to this civ, most important first, capped. */
function civEvents(events: WorldEvent[], civId: string, cap: number): WorldEvent[] {
  const mine = events.filter((e) => e.civilizationIds.includes(civId));
  // Keep chronology but drop the least important when over budget.
  if (mine.length <= cap) return mine;
  const sorted = [...mine].sort((a, b) => b.importance - a.importance).slice(0, cap);
  const keep = new Set(sorted.map((e) => e.id));
  return mine.filter((e) => keep.has(e.id));
}

export function buildCivDossier(
  snapshot: Snapshot,
  events: WorldEvent[],
  config: WorldConfig,
  civId: string,
  lang: Lang,
): string {
  const zh = lang === 'zh';
  const civ = snapshot.civs.find((c) => c.id === civId);
  if (!civ) return zh ? '（未找到该文明）' : '(civilization not found)';
  const hist = snapshot.civHistories[civId];
  const lines: string[] = [];
  const L = (s: string) => lines.push(s);

  // --- Identity ---
  L(zh ? `# 文明档案：${civ.name}` : `# Civilization dossier: ${civ.name}`);
  const status = civ.ascended
    ? (zh ? `已升维（超越, ${civ.deathYear ?? '?'} 年）` : `ascended (transcended, year ${civ.deathYear ?? '?'})`)
    : civ.alive
      ? (zh ? '存活' : 'alive')
      : (zh ? `已灭亡（${civ.deathYear} 年）` : `extinct (year ${civ.deathYear})`);
  L(zh
    ? `状态: ${status}；建立于 ${civ.foundedYear} 年；当前世界年份 ${snapshot.year}`
    : `Status: ${status}; founded year ${civ.foundedYear}; current world year ${snapshot.year}`);
  const t = civ.traits;
  L(zh
    ? `性格(0-100): 侵略${t.aggression} 贸易${t.trade} 科研${t.science} 迁徙${t.migration} 扩张${t.expansion} 外交${t.diplomacy} 生育${t.birthRate} 冒险${t.riskTaking}`
    : `Traits(0-100): aggression ${t.aggression}, trade ${t.trade}, science ${t.science}, migration ${t.migration}, expansion ${t.expansion}, diplomacy ${t.diplomacy}, birthRate ${t.birthRate}, riskTaking ${t.riskTaking}`);
  L(zh
    ? `信仰: ${doctrineName(civ.doctrine, lang)}，虔诚度 ${Math.round(civ.devotion)}`
    : `Faith: ${doctrineName(civ.doctrine, lang)}, devotion ${Math.round(civ.devotion)}`);

  // --- Current numbers ---
  L(zh ? `\n## 末期/当前数值` : `\n## Final/current numbers`);
  L(zh
    ? `人口 ${fmt(civ.population)}；领土 ${civ.territory} 格 (${civ.territoryPct.toFixed(1)}%)；城市 ${civ.cityCount}；科技 ${civ.researchedTechs.length}/47`
    : `Population ${fmt(civ.population)}; territory ${civ.territory} tiles (${civ.territoryPct.toFixed(1)}%); cities ${civ.cityCount}; techs ${civ.researchedTechs.length}/47`);
  L(zh
    ? `经济 ${Math.round(civ.economy)}，军事 ${Math.round(civ.military)}，稳定 ${Math.round(civ.stability)}，幸福 ${Math.round(civ.happiness)}，文化 ${Math.round(civ.culture)}`
    : `Economy ${Math.round(civ.economy)}, military ${Math.round(civ.military)}, stability ${Math.round(civ.stability)}, happiness ${Math.round(civ.happiness)}, culture ${Math.round(civ.culture)}`);

  // --- Resources & sustainability (the ground is finite) ---
  L(zh ? `\n## 资源与永续` : `\n## Resources & sustainability`);
  L(zh
    ? `库存: 粮 ${fmt(civ.food)}，木 ${fmt(civ.wood)}，石 ${fmt(civ.stone)}，铁 ${fmt(civ.iron)}，金 ${fmt(civ.gold)}`
    : `Stocks: food ${fmt(civ.food)}, wood ${fmt(civ.wood)}, stone ${fmt(civ.stone)}, iron ${fmt(civ.iron)}, gold ${fmt(civ.gold)}`);
  L(zh
    ? `国土家底: 剩余森林 ${civ.forestTiles} 格，未枯竭矿脉 ${civ.mineTiles} 处，土壤平均肥力 ${(civ.avgFertility * 100).toFixed(0)}%（矿会挖空、林会砍尽、地力会耗竭，且不可再生）`
    : `The land itself: ${civ.forestTiles} forest tiles left, ${civ.mineTiles} unexhausted ore seams, mean soil fertility ${(civ.avgFertility * 100).toFixed(0)}% (mines empty, forests fall, soil tires — none of it comes back easily)`);
  const latestStats = snapshot.stats[snapshot.stats.length - 1];
  if (latestStats && latestStats.co2 > 300) {
    L(zh
      ? `气候: CO₂ ${Math.round(latestStats.co2)}ppm，全球已升温 ${latestStats.tempAnomaly.toFixed(1)}°C —— 工业排放正在改变气候，海岸与农业带都会迁移`
      : `Climate: CO₂ ${Math.round(latestStats.co2)}ppm, ${latestStats.tempAnomaly.toFixed(1)}°C of warming — industry is shifting coastlines and harvest zones`);
  }

  // --- Trajectories ---
  if (hist && hist.years.length > 1) {
    L(zh ? `\n## 数值轨迹（年份:值 采样）` : `\n## Trajectories (year:value samples)`);
    L(`${zh ? '人口' : 'population'}: ${sampleSeries(hist.years, hist.population)}`);
    L(`${zh ? '领土' : 'territory'}: ${sampleSeries(hist.years, hist.territory)}`);
    L(`${zh ? '科技数' : 'tech count'}: ${sampleSeries(hist.years, hist.technology)}`);
    L(`${zh ? '经济' : 'economy'}: ${sampleSeries(hist.years, hist.economy)}`);
    L(`${zh ? '军事' : 'military'}: ${sampleSeries(hist.years, hist.military)}`);
  }

  // --- Tech path in unlock order (from events) ---
  const techEvents = events.filter(
    (e) => e.type === 'technology' && e.civilizationIds.includes(civId),
  );
  if (techEvents.length > 0 || civ.researchedTechs.length > 0) {
    L(zh ? `\n## 科技路径（按解锁顺序）` : `\n## Tech path (unlock order)`);
    if (techEvents.length >= 3) {
      L(techEvents.map((e) => `${zh ? e.titleZh ?? e.title : e.title}(y${e.year})`).join(' → '));
    } else {
      L(civ.researchedTechs.map((id) => techName(id, lang)).join(' → ') || '—');
    }
    if (civ.currentResearch) {
      L(zh
        ? `研究中: ${techName(civ.currentResearch, lang)}（进度 ${fmt(civ.researchProgress)}/${fmt(civ.nextTechCost)}）`
        : `Researching: ${techName(civ.currentResearch, lang)} (${fmt(civ.researchProgress)}/${fmt(civ.nextTechCost)})`);
    }
  }

  // --- Wars ---
  const wars = snapshot.wars.filter((w) => w.attackerId === civId || w.defenderId === civId);
  if (wars.length > 0) {
    L(zh ? `\n## 战争史（正分=进攻方占优）` : `\n## Wars (positive score favours attacker)`);
    const nameOf = (id: string) => snapshot.civs.find((c) => c.id === id)?.name ?? id;
    for (const w of wars.slice(-14)) {
      const role = w.attackerId === civId ? (zh ? '进攻' : 'attacker') : (zh ? '防守' : 'defender');
      const foe = nameOf(w.attackerId === civId ? w.defenderId : w.attackerId);
      const span = w.endYear === null ? `y${w.startYear}–${zh ? '进行中' : 'ongoing'}` : `y${w.startYear}–${w.endYear}`;
      L(`- ${w.name} (${span}) vs ${foe}, ${role}, ${zh ? '战争分' : 'score'} ${Math.round(w.warScore)}`);
    }
    if (wars.length > 14) L(zh ? `（另有 ${wars.length - 14} 场更早的战争）` : `(${wars.length - 14} earlier wars omitted)`);
  }

  // --- Major events ---
  const mine = civEvents(events, civId, 45);
  if (mine.length > 0) {
    L(zh ? `\n## 大事记` : `\n## Chronicle`);
    for (const e of mine) {
      L(`- y${e.year} [${e.type}] ${zh ? e.titleZh ?? e.title : e.title}`);
    }
  }

  // --- Epitaph ---
  const epitaph = snapshot.epitaphs.find((e) => e.civId === civId);
  if (epitaph) {
    L(zh ? `\n## 墓志铭` : `\n## Epitaph`);
    L(zh ? epitaph.textZh : epitaph.textEn);
  }

  // --- World context ---
  L(zh ? `\n## 世界背景` : `\n## World context`);
  const latest = snapshot.stats[snapshot.stats.length - 1];
  if (latest) {
    L(zh
      ? `世界总人口 ${fmt(latest.population)}，${latest.civilizations} 个文明，CO₂ ${Math.round(latest.co2)}ppm，升温 ${latest.tempAnomaly.toFixed(1)}°C`
      : `World population ${fmt(latest.population)}, ${latest.civilizations} civilizations, CO₂ ${Math.round(latest.co2)}ppm, warming ${latest.tempAnomaly.toFixed(1)}°C`);
  }
  L(zh
    ? `地图 ${config.width}×${config.height}，种子 ${config.seed}，灾害频率 ${config.disasterFrequency}，资源丰度 ${config.resourceRichness}`
    : `Map ${config.width}×${config.height}, seed ${config.seed}, disaster frequency ${config.disasterFrequency}, resource richness ${config.resourceRichness}`);
  const others = snapshot.civs.filter((c) => c.id !== civId);
  for (const o of others.slice(0, 10)) {
    const st = o.ascended ? (zh ? '升维' : 'ascended') : o.alive ? (zh ? '存活' : 'alive') : (zh ? `灭亡于y${o.deathYear}` : `extinct y${o.deathYear}`);
    L(zh
      ? `- ${o.name}: ${st}，人口 ${fmt(o.population)}，科技 ${o.researchedTechs.length}，军事 ${Math.round(o.military)}`
      : `- ${o.name}: ${st}, pop ${fmt(o.population)}, techs ${o.researchedTechs.length}, military ${Math.round(o.military)}`);
  }

  return lines.join('\n');
}

export function analystSystemPrompt(lang: Lang, civ: CivSummary, dossier: string): string {
  const zh = lang === 'zh';
  const head = zh
    ? `你是"文明模拟器"（一个确定性历史模拟沙盒）的首席历史分析师。用户会就文明「${civ.name}」向你提问。
规则：
1. 只依据下方档案中的数据回答，引用具体年份和数值来支撑论点；不要编造档案之外的事件或数字。
2. 分析要指出因果链（例如：性格→战争→人口坍缩→灭亡），像史学家兼数据科学家那样写。
3. 若档案数据不足以下结论，直言"档案未记录"，并说明还需要什么数据。
4. 简洁有力：默认 300 字以内，除非用户要求展开。用中文回答。`
    : `You are the chief historical analyst of the Civilization Simulator (a deterministic history sandbox). The user asks about the civilization "${civ.name}".
Rules:
1. Ground every claim in the dossier below; cite specific years and numbers. Never invent events or figures not in the dossier.
2. Trace causal chains (e.g. traits → war → population collapse → extinction), writing as a historian-cum-data-scientist.
3. If the dossier lacks the data for a conclusion, say so plainly and name what data would be needed.
4. Be concise: under ~250 words unless asked to elaborate. Answer in English.`;
  return `${head}\n\n===== ${zh ? '档案' : 'DOSSIER'} =====\n${dossier}`;
}
