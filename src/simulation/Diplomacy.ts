// Diplomacy and trade between civilizations.
import { SeededRandom } from './Random';
import { techMultipliers } from './Technology';
import { Civilization, DiplomaticStatus, Resource, WorldState } from './types';
import { addEvent } from './World';

/** Approximate adjacency via territory centroids and radii. */
export function civDistance(a: Civilization, b: Civilization): number {
  if (a.territory === 0 || b.territory === 0) return Infinity;
  const ax = a.sumX / a.territory;
  const ay = a.sumY / a.territory;
  const bx = b.sumX / b.territory;
  const by = b.sumY / b.territory;
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

export function areNeighbors(a: Civilization, b: Civilization): boolean {
  const d = civDistance(a, b);
  const ra = Math.sqrt(a.territory / Math.PI);
  const rb = Math.sqrt(b.territory / Math.PI);
  return d < (ra + rb) * 1.6 + 6;
}

export function isAtWar(world: WorldState, a: number, b: number): boolean {
  return world.wars.some(
    (w) =>
      w.endYear === null &&
      ((w.attackerId === `civ-${a}` && w.defenderId === `civ-${b}`) ||
        (w.attackerId === `civ-${b}` && w.defenderId === `civ-${a}`)),
  );
}

export function relationStatus(world: WorldState, a: number, b: number): DiplomaticStatus {
  if (isAtWar(world, a, b)) return 'war';
  if (world.alliances[a]?.[b]) return 'alliance';
  const v = world.relations[a]?.[b] ?? 0;
  if (v < -40) return 'hostile';
  if (v > 40) return 'friendly';
  return 'neutral';
}

const TRADE_RESOURCES: Resource[] = ['food', 'wood', 'stone', 'iron', 'gold'];

function stockOf(civ: Civilization, r: Resource): number {
  return civ[r];
}
function addStock(civ: Civilization, r: Resource, amount: number): void {
  civ[r] = Math.max(0, civ[r] + amount);
}

export function runTrade(world: WorldState, rng: SeededRandom): void {
  const civs = world.civs;
  for (let i = 0; i < civs.length; i++) {
    const a = civs[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < civs.length; j++) {
      const b = civs[j];
      if (!b.alive) continue;
      if (isAtWar(world, i, j)) continue;
      const rel = world.relations[i][j];
      if (rel < -20) continue;

      const dist = civDistance(a, b);
      const techA = techMultipliers(a.researchedTechs);
      const techB = techMultipliers(b.researchedTechs);
      const naval = techA.naval || techB.naval;
      const maxDist = naval ? 120 : 55;
      if (dist > maxDist) continue;

      const tradeDrive =
        ((a.traits.trade + b.traits.trade) / 2 / 100) * 0.12 +
        (rel / 100) * 0.04 +
        (a.modifiers.trade + b.modifiers.trade) / 1000;
      if (!rng.chance(Math.max(0, Math.min(0.6, tradeDrive)))) continue;

      // Find A's scarcest resource that B has in surplus (or vice versa).
      let done = false;
      for (const [buyer, seller] of [
        [a, b],
        [b, a],
      ] as [Civilization, Civilization][]) {
        if (done) break;
        for (const res of TRADE_RESOURCES) {
          if (res === 'gold') continue;
          const need = res === 'food' ? buyer.population * 0.3 : 500;
          if (stockOf(buyer, res) < need && stockOf(seller, res) > need * 2 && buyer.gold > 20) {
            const amount = Math.min(stockOf(seller, res) * 0.2, need);
            const price = Math.min(buyer.gold * 0.5, amount * 0.1 + 10);
            addStock(seller, res, -amount);
            addStock(buyer, res, amount);
            addStock(buyer, 'gold', -price);
            addStock(seller, 'gold', price);
            world.relations[i][j] = Math.min(100, world.relations[i][j] + 2);
            world.relations[j][i] = world.relations[i][j];
            a.economy = Math.min(100, a.economy + 0.5);
            b.economy = Math.min(100, b.economy + 0.5);
            world.totalTradeDeals++;
            // Maintain a visible trade route.
            const existing = world.tradeRoutes.find(
              (r) => (r.fromId === seller.id && r.toId === buyer.id) || (r.fromId === buyer.id && r.toId === seller.id),
            );
            if (!existing) {
              world.tradeRoutes.push({ fromId: seller.id, toId: buyer.id, give: res, receive: 'gold', sinceYear: world.year });
              if (rng.chance(0.5)) {
                const RES_ZH: Record<string, string> = { food: '粮食', wood: '木材', stone: '石料', iron: '铁', gold: '黄金' };
                addEvent(world, {
                  year: world.year,
                  type: 'trade',
                  civIds: [seller.id, buyer.id],
                  title: `Trade opens between ${seller.name} and ${buyer.name}`,
                  description: `${seller.name} began exporting ${res} to ${buyer.name} in exchange for gold. Both economies benefit.`,
                  titleZh: `${seller.name}与${buyer.name}开通贸易`,
                  descriptionZh: `${seller.name}开始向${buyer.name}出口${RES_ZH[res] ?? res}以换取黄金，两国经济都从中受益。`,
                  importance: 3,
                });
              }
            }
            done = true;
            break;
          }
        }
      }
    }
  }

  // Routes decay if relations sour or randomly (markets shift).
  world.tradeRoutes = world.tradeRoutes.filter((r) => {
    const ai = parseInt(r.fromId.slice(4), 10);
    const bi = parseInt(r.toId.slice(4), 10);
    const a = world.civs[ai];
    const b = world.civs[bi];
    if (!a?.alive || !b?.alive) return false;
    if (isAtWar(world, ai, bi)) return false;
    if ((world.relations[ai]?.[bi] ?? 0) < -20) return false;
    return !rng.chance(0.01);
  });
}

export function runDiplomacy(world: WorldState, rng: SeededRandom): void {
  const civs = world.civs;
  for (let i = 0; i < civs.length; i++) {
    const a = civs[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < civs.length; j++) {
      const b = civs[j];
      if (!b.alive) continue;
      let rel = world.relations[i][j];

      const neighbors = areNeighbors(a, b);
      const atWar = isAtWar(world, i, j);

      if (!atWar) {
        // Natural drift toward zero
        rel *= 0.995;
        // Diplomatic civilizations build goodwill
        rel += ((a.traits.diplomacy + b.traits.diplomacy) / 200) * 0.5;
        // Border friction scales with aggression
        if (neighbors) {
          const aggrA = a.traits.aggression + a.modifiers.aggression;
          const aggrB = b.traits.aggression + b.modifiers.aggression;
          rel -= ((Math.max(0, aggrA) + Math.max(0, aggrB)) / 200) * 0.9;
        }
        // Cultural affinity
        rel += (Math.min(a.culture, b.culture) / 100) * 0.15;
        // Active trade helps
        if (world.tradeRoutes.some((r) => (r.fromId === a.id && r.toId === b.id) || (r.fromId === b.id && r.toId === a.id))) {
          rel += 0.6;
        }
        rel += rng.range(-0.3, 0.3);
      }

      rel = Math.max(-100, Math.min(100, rel));
      world.relations[i][j] = rel;
      world.relations[j][i] = rel;

      // Alliance formation / dissolution
      if (!world.alliances[i][j] && !atWar && rel > 70 && a.traits.diplomacy > 45 && b.traits.diplomacy > 45) {
        if (rng.chance(0.05)) {
          world.alliances[i][j] = true;
          world.alliances[j][i] = true;
          addEvent(world, {
            year: world.year,
            type: 'alliance',
            civIds: [a.id, b.id],
            title: `${a.name} and ${b.name} form an alliance`,
            description: `After years of friendship and trade, ${a.name} and ${b.name} signed a pact of mutual defense.`,
            titleZh: `${a.name}与${b.name}结为同盟`,
            descriptionZh: `多年的友谊与贸易之后，${a.name}与${b.name}签署了共同防御条约。`,
            importance: 6,
          });
        }
      } else if (world.alliances[i][j] && (rel < 35 || atWar)) {
        world.alliances[i][j] = false;
        world.alliances[j][i] = false;
        addEvent(world, {
          year: world.year,
          type: 'peace',
          civIds: [a.id, b.id],
          title: `The alliance between ${a.name} and ${b.name} dissolves`,
          description: `Diverging interests ended the long-standing pact between ${a.name} and ${b.name}.`,
          titleZh: `${a.name}与${b.name}的同盟解体`,
          descriptionZh: `利益的分歧终结了${a.name}与${b.name}之间长久的盟约。`,
          importance: 4,
        });
      }
    }
  }
}
