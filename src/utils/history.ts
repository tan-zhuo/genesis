// Template-based world history narrative — no LLM, just data.
import { Snapshot, WorldEvent } from '../simulation/types';
import { techEraName } from '../simulation/Technology';

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

export function summarizeWorld(snapshot: Snapshot, allEvents: WorldEvent[]): WorldSummary {
  const { year, civs, cities, stats } = snapshot;
  const alive = civs.filter((c) => c.alive);
  const dead = civs.filter((c) => !c.alive);
  const totalPop = alive.reduce((s, c) => s + c.population, 0);
  const totalWars = allEvents.filter((e) => e.type === 'war').length;
  const techsDiscovered = Math.max(0, ...alive.map((c) => c.technologyLevel));
  const majorEvents = allEvents.filter((e) => e.importance >= 7);

  const headline = [
    { label: 'Simulation Year', value: year.toLocaleString('en-US') },
    { label: 'Population', value: fmt(totalPop) },
    { label: 'Civilizations', value: `${alive.length}` },
    { label: 'Cities', value: `${cities.length}` },
    { label: 'Wars', value: `${totalWars}` },
    { label: 'Technologies', value: `${techsDiscovered}` },
    { label: 'Major Events', value: `${majorEvents.length}` },
  ];

  const paragraphs: string[] = [];
  const startCivCount = civs.filter((c) => c.foundedYear === 0).length;
  paragraphs.push(`The world began with ${startCivCount} civilizations.`);

  // Early period: first agriculture and first cities.
  const firstAgri = allEvents.find((e) => e.type === 'technology' && e.title.includes('Agriculture'));
  if (firstAgri) {
    const who = civs.find((c) => c.id === firstAgri.civilizationIds[0]);
    paragraphs.push(
      `In year ${firstAgri.year}, ${who?.name ?? 'an early people'} discovered agriculture, and food surpluses began to reshape daily life.`,
    );
  }
  const firstCity = allEvents.find((e) => e.type === 'city-founded');
  if (firstCity) {
    paragraphs.push(`The first city, ${firstCity.title.replace(' founded', '')}, was founded in year ${firstCity.year}.`);
  }

  // First war.
  const firstWar = allEvents.find((e) => e.type === 'war');
  if (firstWar) {
    paragraphs.push(`Peace did not last forever: ${firstWar.title.replace(' begins', '')} broke out in year ${firstWar.year}.`);
  } else if (totalWars === 0 && year > 500) {
    paragraphs.push(`Remarkably, not a single war was fought in ${year} years of recorded history.`);
  }

  // Empires.
  const empires = allEvents.filter((e) => e.type === 'empire');
  if (empires.length > 0) {
    const first = empires[0];
    paragraphs.push(`Around year ${first.year}, the first great empire emerged: ${first.title.replace(' rises', '').replace('The ', '')}.`);
  }

  // Splits and collapses.
  const splits = allEvents.filter((e) => e.type === 'split');
  if (splits.length > 0) {
    paragraphs.push(
      `Empires proved fragile. ${splits.length === 1 ? 'One civil war' : `${splits.length} civil wars`} fractured old nations and gave birth to new ones${splits.length > 0 ? `, beginning with ${splits[0].title.split('—')[1]?.trim().replace(' is born', '') ?? 'a rebellion'} in year ${splits[0].year}` : ''}.`,
    );
  }

  // Extinctions.
  if (dead.length > 0) {
    const names = dead.map((c) => c.name).join(', ');
    paragraphs.push(`${dead.length === 1 ? 'One civilization' : `${dead.length} civilizations`} did not survive to the present day: ${names}.`);
  }

  // Technology era.
  if (alive.length > 0) {
    const leader = [...alive].sort((a, b) => b.technologyLevel - a.technologyLevel)[0];
    paragraphs.push(
      `By year ${year}, the most advanced nation, ${leader.name}, had reached the ${techEraName(leader.technologyLevel)} era${leader.researchedTechs.includes('ai') ? ' — and built artificial minds' : ''}.`,
    );
    const biggest = [...alive].sort((a, b) => b.territoryPct - a.territoryPct)[0];
    paragraphs.push(
      `${biggest.name} stands as the largest power, controlling ${biggest.territoryPct.toFixed(1)}% of the known world with ${fmt(biggest.population)} people across ${biggest.cityCount} cities.`,
    );
  } else {
    paragraphs.push(`By year ${year}, no civilization remained. The world fell silent, its ruins slowly reclaimed by forest and sand.`);
  }

  // Population trend.
  if (stats.length > 10) {
    const mid = stats[Math.floor(stats.length / 2)];
    const last = stats[stats.length - 1];
    if (last.population > mid.population * 1.5) {
      paragraphs.push(`The recent era was one of growth: world population rose from ${fmt(mid.population)} to ${fmt(last.population)}.`);
    } else if (last.population < mid.population * 0.7) {
      paragraphs.push(`The recent era was one of decline: world population fell from ${fmt(mid.population)} to ${fmt(last.population)}.`);
    }
  }

  return { headline, narrative: paragraphs };
}

/** Plain-text export of the world history. */
export function exportHistoryText(snapshot: Snapshot, allEvents: WorldEvent[]): string {
  const summary = summarizeWorld(snapshot, allEvents);
  const lines: string[] = ['WORLD HISTORY', '='.repeat(40), ''];
  for (const h of summary.headline) lines.push(`${h.label}: ${h.value}`);
  lines.push('', 'NARRATIVE', '-'.repeat(40));
  lines.push(...summary.narrative, '', 'MAJOR EVENTS', '-'.repeat(40));
  for (const e of allEvents.filter((ev) => ev.importance >= 6)) {
    lines.push(`Year ${e.year} — ${e.title}`, `  ${e.description}`, '');
  }
  return lines.join('\n');
}
