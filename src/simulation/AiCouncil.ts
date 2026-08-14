// AI-ruled civilizations: an external model governs a nation by issuing
// strategic decisions. Decisions are recorded into the world's recipe
// (config.aiDecisions) and applied here at the start of their effect year —
// exactly like divine interventions — so replays and branches reproduce the
// same history without ever calling the model again.
//
// The engine is the referee: every decision is validated against the rules
// (tech prerequisites, living targets, trait bounds). An illegal decision is
// silently ignored — the model cannot cheat, and a broken model degrades to
// the default rule-driven behaviour.
import { SeededRandom } from './Random';
import { TECH_BY_ID } from './Technology';
import { AiDecision, Civilization, TRAIT_KEYS, WorldState } from './types';
import { addEvent } from './World';
import { areNeighbors, isAtWar } from './Diplomacy';
import { declareWar } from './Warfare';

const POLICY_MAX_SHIFT = 12;

function findCiv(world: WorldState, id: string | undefined): Civilization | null {
  if (!id) return null;
  const civ = world.civs.find((c) => c.id === id);
  return civ && civ.alive ? civ : null;
}

function reasonText(d: AiDecision): string {
  const r = (d.reason ?? '').trim().slice(0, 220);
  return r;
}

function councilEvent(
  world: WorldState,
  civ: Civilization,
  d: AiDecision,
  title: string,
  titleZh: string,
  body: string,
  bodyZh: string,
  importance: number,
  extraCivIds: string[] = [],
): void {
  const reason = reasonText(d);
  const en = reason ? `${body} The council's records state: "${reason}"` : body;
  const zh = reason ? `${bodyZh} 枢密院记载的理由是：「${reason}」` : bodyZh;
  addEvent(world, {
    year: world.year,
    type: 'council',
    civIds: [civ.id, ...extraCivIds],
    title,
    titleZh,
    description: en,
    descriptionZh: zh,
    importance,
    x: Math.round(civ.sumX / Math.max(1, civ.tiles.length)),
    y: Math.round(civ.sumY / Math.max(1, civ.tiles.length)),
  });
}

function applyDecision(world: WorldState, d: AiDecision, rng: SeededRandom): void {
  const civ = findCiv(world, d.civId);
  if (!civ) return;

  switch (d.kind) {
    case 'research': {
      const tech = d.techId ? TECH_BY_ID.get(d.techId) : null;
      if (!tech) return;
      if (civ.researchedTechs.includes(tech.id)) return;
      if (!tech.requirements.every((r) => civ.researchedTechs.includes(r))) return;
      if (civ.currentResearch === tech.id) return;
      civ.currentResearch = tech.id;
      civ.researchProgress = 0;
      councilEvent(
        world, civ, d,
        `${civ.name} redirects its scholars toward ${tech.name}`,
        `${civ.name}的学者们转向「${tech.nameZh}」`,
        `By decree of the ruling council, every academy in ${civ.name} now bends its effort toward ${tech.name}.`,
        `执政议会颁布法令，${civ.name}的所有学院即刻转攻「${tech.nameZh}」。`,
        5,
      );
      return;
    }
    case 'war': {
      const target = findCiv(world, d.targetId);
      if (!target || target.index === civ.index) return;
      if (isAtWar(world, civ.index, target.index)) return;
      // A land border, or the reach of a navy, is required to make war.
      const naval = civ.researchedTechs.includes('navigation') || civ.researchedTechs.includes('sailing');
      if (!areNeighbors(civ, target) && !naval) return;
      world.relations[civ.index][target.index] = Math.min(world.relations[civ.index][target.index], -80);
      world.relations[target.index][civ.index] = Math.min(world.relations[target.index][civ.index], -60);
      councilEvent(
        world, civ, d,
        `The council of ${civ.name} votes for war against ${target.name}`,
        `${civ.name}议会表决：对${target.name}开战`,
        `After a long and bitter session, the rulers of ${civ.name} chose the sword.`,
        `经过漫长而激烈的廷议，${civ.name}的统治者们选择了刀剑。`,
        8,
        [target.id],
      );
      declareWar(world, civ, target, rng);
      return;
    }
    case 'peace': {
      const target = findCiv(world, d.targetId);
      let ended = 0;
      for (const war of world.wars) {
        if (war.endYear !== null) continue;
        if (war.attackerId !== civ.id && war.defenderId !== civ.id) continue;
        const otherId = war.attackerId === civ.id ? war.defenderId : war.attackerId;
        if (target && otherId !== target.id) continue;
        war.endYear = world.year;
        const other = world.civs[parseInt(otherId.slice(4), 10)];
        world.relations[civ.index][other.index] = Math.max(world.relations[civ.index][other.index], -10);
        world.relations[other.index][civ.index] = Math.max(world.relations[other.index][civ.index], -10);
        civ.warYears = 0;
        other.warYears = 0;
        ended++;
      }
      if (ended === 0) return;
      councilEvent(
        world, civ, d,
        `${civ.name} sues for peace`,
        `${civ.name}主动求和`,
        `Envoys rode out under white banners; the council judged that this war had cost more than it could ever return.`,
        `使节们打着白旗策马而出——议会断定，这场战争的代价已远超它可能带来的一切。`,
        7,
        target ? [target.id] : [],
      );
      return;
    }
    case 'diplomacy': {
      const target = findCiv(world, d.targetId);
      if (!target || target.index === civ.index) return;
      if (isAtWar(world, civ.index, target.index)) return;
      world.relations[civ.index][target.index] = Math.min(100, world.relations[civ.index][target.index] + 22);
      world.relations[target.index][civ.index] = Math.min(100, world.relations[target.index][civ.index] + 16);
      councilEvent(
        world, civ, d,
        `${civ.name} sends a grand embassy to ${target.name}`,
        `${civ.name}向${target.name}派出盛大使团`,
        `Gifts, marriages and treaties: the council of ${civ.name} has decided that ${target.name} is worth befriending.`,
        `礼物、联姻与盟约——${civ.name}的议会认定，${target.name}值得深交。`,
        5,
        [target.id],
      );
      return;
    }
    case 'policy': {
      if (!d.trait || !TRAIT_KEYS.includes(d.trait)) return;
      const delta = Math.max(-POLICY_MAX_SHIFT, Math.min(POLICY_MAX_SHIFT, Math.round(d.delta ?? 0)));
      if (delta === 0) return;
      const before = civ.traits[d.trait];
      civ.traits[d.trait] = Math.max(0, Math.min(100, before + delta));
      if (civ.traits[d.trait] === before) return;
      councilEvent(
        world, civ, d,
        `${civ.name} reforms its national character`,
        `${civ.name}推行国策改革`,
        `New laws, new schools, new sermons: the council steers the temperament of a whole people (${d.trait} ${delta > 0 ? '+' : ''}${delta}).`,
        `新的律法、新的学堂、新的布道——议会在悄然扭转整个民族的性情（${d.trait} ${delta > 0 ? '+' : ''}${delta}）。`,
        4,
      );
      return;
    }
    case 'none':
      return;
  }
}

/** Apply every AI-ruler decision recorded for the current year (called by simulateYear). */
export function runAiCouncil(world: WorldState, rng: SeededRandom): void {
  const list = world.config.aiDecisions;
  if (!list || list.length === 0) return;
  for (const d of list) {
    if (d.year === world.year) applyDecision(world, d, rng);
  }
}
