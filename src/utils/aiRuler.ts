// AI rulers: the main-thread side. Watches simulation snapshots, convenes a
// "council" for each AI-governed civilization on a cadence (or when war /
// disaster strikes), asks the configured LLM for ONE strategic decision as
// strict JSON, validates it, and posts it to the worker — where it is
// recorded into the world recipe and applied deterministically.
//
// The model is a player, not part of the engine: if it is slow, offline, or
// answers garbage, the civilization simply continues under the default rules.
import { useEffect } from 'react';
import { Universe, useSimulatorStore } from '../state/simulatorStore';
import { AiDecision, CivSummary, Snapshot, WorldEvent } from '../simulation/types';
import { availableTechs, TECH_BY_ID } from '../simulation/Technology';
import { Lang, useLang } from '../i18n';
import { chatStream, loadAiSettings } from './aiClient';
import { buildCivDossier } from './civDossier';

export const COUNCIL_CADENCE = 40; // years between regular councils
const EVENT_MIN_GAP = 12; // min years between event-triggered councils
const MAX_INFLIGHT = 2; // concurrent LLM calls across all civs

export function rulerKey(universeId: string, civId: string): string {
  return `${universeId}/${civId}`;
}

interface CouncilState {
  lastYear: number;
  busy: boolean;
}

const councils = new Map<string, CouncilState>();
let inflight = 0;

/** A pending-decision marker so the UI can show "the council is deliberating". */
export function isCouncilBusy(universeId: string, civId: string): boolean {
  return councils.get(rulerKey(universeId, civId))?.busy ?? false;
}

function actionMenu(snapshot: Snapshot, civ: CivSummary, lang: Lang): string {
  const zh = lang === 'zh';
  const lines: string[] = [];
  const avail = availableTechs(civ.researchedTechs).slice(0, 14);
  lines.push(zh ? '可选动作（只能选一个）:' : 'Available actions (choose exactly one):');
  lines.push(zh
    ? `1. research — 改变研究方向。可选 techId: ${avail.map((t) => `${t.id}(${t.nameZh},T${t.tier})`).join(', ') || '无'}`
    : `1. research — redirect research. Valid techId: ${avail.map((t) => `${t.id}(${t.name},T${t.tier})`).join(', ') || 'none'}`);
  const others = snapshot.civs.filter((c) => c.alive && c.id !== civ.id);
  const relOf = (id: string): number => {
    const r = snapshot.relations.find((x) => (x.a === civ.id && x.b === id) || (x.b === civ.id && x.a === id));
    return r ? Math.round(r.value) : 0;
  };
  const atWarWith = new Set(
    snapshot.wars.filter((w) => w.endYear === null && (w.attackerId === civ.id || w.defenderId === civ.id))
      .map((w) => (w.attackerId === civ.id ? w.defenderId : w.attackerId)),
  );
  const civList = others
    .map((c) => `${c.id}(${c.name}, ${zh ? '关系' : 'rel'} ${relOf(c.id)}${atWarWith.has(c.id) ? (zh ? ', 交战中' : ', AT WAR') : ''}, ${zh ? '军力' : 'mil'} ${Math.round(c.military)})`)
    .join(', ');
  lines.push(zh
    ? `2. war — 向 targetId 宣战（需接壤或有航海科技）。3. peace — 与 targetId 停战（须在交战中）。4. diplomacy — 向 targetId 派使团改善关系。可选 targetId: ${civList || '无'}`
    : `2. war — declare war on targetId (needs a border or naval tech). 3. peace — end the war with targetId (must be at war). 4. diplomacy — send envoys to targetId. Valid targetId: ${civList || 'none'}`);
  lines.push(zh
    ? '5. policy — 调整国民性格。trait ∈ {aggression, trade, science, migration, expansion, diplomacy, birthRate, riskTaking}，delta ∈ [-12, 12]。6. none — 本届不作为。'
    : '5. policy — shift national character. trait ∈ {aggression, trade, science, migration, expansion, diplomacy, birthRate, riskTaking}, delta ∈ [-12, 12]. 6. none — do nothing this council.');
  return lines.join('\n');
}

export function buildCouncilPrompt(
  snapshot: Snapshot,
  events: WorldEvent[],
  universe: Universe,
  civ: CivSummary,
  lang: Lang,
): string {
  const zh = lang === 'zh';
  const dossier = buildCivDossier(snapshot, events, universe.config, civ.id, lang);
  const head = zh
    ? `你是文明「${civ.name}」的执政议会。根据下方档案，为未来数十年做出一个最有利于本文明长期存续与繁荣的战略决策。
只输出一个 JSON 对象，不要输出任何其他文字、解释或代码块标记。格式：
{"kind":"research|war|peace|diplomacy|policy|none","techId":"...","targetId":"...","trait":"...","delta":0,"reason":"不超过60字的决策理由"}
只填写与所选 kind 相关的字段。reason 用中文，要具体引用局势。`
    : `You are the ruling council of the civilization "${civ.name}". Based on the dossier below, make ONE strategic decision that best serves the nation's long-term survival and prosperity over the coming decades.
Output ONLY a single JSON object — no prose, no explanations, no code fences. Format:
{"kind":"research|war|peace|diplomacy|policy|none","techId":"...","targetId":"...","trait":"...","delta":0,"reason":"one concrete sentence, max 25 words"}
Fill only the fields relevant to your chosen kind. The reason must cite the actual situation.`;
  return `${head}\n\n${actionMenu(snapshot, civ, lang)}\n\n===== ${zh ? '档案' : 'DOSSIER'} =====\n${dossier}`;
}

const TRAITS = ['aggression', 'trade', 'science', 'migration', 'expansion', 'diplomacy', 'birthRate', 'riskTaking'];

/** Tolerantly extract + validate the model's JSON decision. Null on garbage. */
export function parseDecision(
  text: string,
  civ: CivSummary,
  snapshot: Snapshot,
): Omit<AiDecision, 'id' | 'year'> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const kind = raw.kind;
  const reason = typeof raw.reason === 'string' ? raw.reason.slice(0, 220) : undefined;
  const base = { civId: civ.id, reason };
  switch (kind) {
    case 'research': {
      const techId = typeof raw.techId === 'string' ? raw.techId : '';
      const tech = TECH_BY_ID.get(techId);
      if (!tech || civ.researchedTechs.includes(techId)) return null;
      if (!tech.requirements.every((r) => civ.researchedTechs.includes(r))) return null;
      return { ...base, kind, techId };
    }
    case 'war':
    case 'peace':
    case 'diplomacy': {
      const targetId = typeof raw.targetId === 'string' ? raw.targetId : '';
      const target = snapshot.civs.find((c) => c.id === targetId && c.alive);
      if (!target || targetId === civ.id) return null;
      return { ...base, kind, targetId };
    }
    case 'policy': {
      const trait = typeof raw.trait === 'string' && TRAITS.includes(raw.trait) ? raw.trait : null;
      const delta = typeof raw.delta === 'number' ? Math.max(-12, Math.min(12, Math.round(raw.delta))) : 0;
      if (!trait || delta === 0) return null;
      return { ...base, kind, trait: trait as AiDecision['trait'], delta };
    }
    case 'none':
      return { ...base, kind: 'none' };
    default:
      return null;
  }
}

function shouldConvene(state: CouncilState, civ: CivSummary, snapshot: Snapshot, events: WorldEvent[]): boolean {
  const year = snapshot.year;
  if (state.busy) return false;
  if (year - state.lastYear >= COUNCIL_CADENCE) return true;
  if (year - state.lastYear < EVENT_MIN_GAP) return false;
  // Emergency session: war / disaster / collapse touching this civ since the last council.
  return events.some(
    (e) => e.year > state.lastYear && e.importance >= 7 && e.civilizationIds.includes(civ.id)
      && (e.type === 'war' || e.type === 'disaster' || e.type === 'collapse' || e.type === 'split'),
  );
}

async function convene(universe: Universe, civ: CivSummary, lang: Lang, state: CouncilState): Promise<void> {
  const snapshot = universe.snapshot;
  if (!snapshot) return;
  state.busy = true;
  state.lastYear = snapshot.year;
  inflight++;
  try {
    const settings = loadAiSettings();
    const prompt = buildCouncilPrompt(snapshot, universe.events, universe, civ, lang);
    const text = await chatStream(settings, [{ role: 'user', content: prompt }], () => undefined);
    const decision = parseDecision(text, civ, snapshot);
    if (decision) {
      universe.worker.postMessage({ type: 'aiDecision', decision });
    } else {
      console.warn(`[aiRuler] unparseable decision for ${civ.name}:`, text.slice(0, 200));
    }
  } catch (err) {
    console.warn(`[aiRuler] council failed for ${civ.name}:`, err);
  } finally {
    inflight--;
    state.busy = false;
  }
}

/** Drive councils for all AI-ruled civs of this universe. Call from the shell. */
export function useAiRulers(universe: Universe | null): void {
  const aiRuled = useSimulatorStore((s) => s.aiRuledKeys);
  const lang = useLang();
  const year = universe?.snapshot?.year ?? -1;

  useEffect(() => {
    if (!universe?.snapshot || year < 0) return;
    // During a replay the recorded log speaks; convening new councils would fork history.
    if (universe.replaying) return;
    for (const key of aiRuled) {
      if (!key.startsWith(`${universe.id}/`)) continue;
      if (inflight >= MAX_INFLIGHT) break;
      const civId = key.slice(universe.id.length + 1);
      const civ = universe.snapshot.civs.find((c) => c.id === civId);
      if (!civ || !civ.alive) continue;
      let state = councils.get(key);
      if (!state) {
        // First council convenes promptly after enabling (short grace period).
        state = { lastYear: year - COUNCIL_CADENCE + 2, busy: false };
        councils.set(key, state);
      }
      if (shouldConvene(state, civ, universe.snapshot, universe.events)) {
        void convene(universe, civ, lang, state);
      }
    }
  }, [year, aiRuled, universe, lang]);
}
