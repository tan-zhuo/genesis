// AI Analyst: chat with an LLM about one civilization, grounded in a
// numeric dossier (traits, trajectories, tech path, wars, chronicle, epitaph).
// Bring-your-own endpoint: Ollama local by default; any OpenAI-compatible API.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Send, Settings2, Square, X } from 'lucide-react';
import { useSimulatorStore } from '../state/simulatorStore';
import { useLang, useT } from '../i18n';
import {
  AI_PRESETS,
  AiSettings,
  ChatMessage,
  chatStream,
  loadAiSettings,
  saveAiSettings,
} from '../utils/aiClient';
import { analystSystemPrompt, buildCivDossier } from '../utils/civDossier';

interface UiMessage {
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
}

export function AiAnalyst(): JSX.Element | null {
  const t = useT();
  const lang = useLang();
  const civId = useSimulatorStore((s) => s.aiAnalystCivId);
  const close = useSimulatorStore((s) => s.setAiAnalystCiv);
  const universes = useSimulatorStore((s) => s.universes);
  const activeUniverseId = useSimulatorStore((s) => s.activeUniverseId);
  const universe = universes.find((u) => u.id === activeUniverseId) ?? null;

  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());
  const [showSettings, setShowSettings] = useState(false);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const civIdRef = useRef<string | null>(null);

  const civ = universe?.snapshot?.civs.find((c) => c.id === civId) ?? null;

  // Reset the conversation when the target civilization changes.
  useEffect(() => {
    if (civId !== civIdRef.current) {
      civIdRef.current = civId;
      setMessages([]);
      abortRef.current?.abort();
      setBusy(false);
    }
  }, [civId]);

  // The dossier is frozen at open/ask time from the latest snapshot.
  const dossier = useMemo(() => {
    if (!universe?.snapshot || !civ) return '';
    return buildCivDossier(universe.snapshot, universe.events, universe.config, civ.id, lang);
  }, [universe?.snapshot?.year, civ?.id, lang]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  if (!civId || !civ || !universe?.snapshot) return null;

  const preset = AI_PRESETS.find((p) => p.id === settings.provider) ?? AI_PRESETS[0];
  const keyMissing = preset.needsKey && !settings.apiKey;

  const quickQuestions: string[] = civ.alive
    ? [t('ai.q.state'), t('ai.q.risk'), t('ai.q.tech')]
    : civ.ascended
      ? [t('ai.q.ascend'), t('ai.q.turning'), t('ai.q.tech')]
      : [t('ai.q.death'), t('ai.q.turning'), t('ai.q.avoid')];

  const ask = (question: string): void => {
    const q = question.trim();
    if (!q || busy) return;
    const history = [...messages, { role: 'user', content: q } as UiMessage];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setInput('');
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;

    const chat: ChatMessage[] = [
      { role: 'system', content: analystSystemPrompt(lang, civ, dossier) },
      ...history
        .filter((m) => !m.error)
        .map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
    ];

    void chatStream(settings, chat, (delta) => {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + delta };
        return next;
      });
    }, controller.signal)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : String(err);
        const hint = msg.startsWith('NETWORK')
          ? `\n${t('ai.err.network')}`
          : msg.includes('401') || msg.includes('403')
            ? `\n${t('ai.err.auth')}`
            : '';
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', content: `${t('ai.err.head')}: ${msg}${hint}`, error: true };
          return next;
        });
      })
      .finally(() => {
        if (abortRef.current === controller) abortRef.current = null;
        setBusy(false);
      });
  };

  const stop = (): void => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  };

  const applyPreset = (id: string): void => {
    const p = AI_PRESETS.find((x) => x.id === id) ?? AI_PRESETS[0];
    const next = { ...settings, provider: p.id, baseUrl: p.baseUrl, model: p.model };
    setSettings(next);
    saveAiSettings(next);
  };

  const patchSettings = (patch: Partial<AiSettings>): void => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveAiSettings(next);
  };

  return (
    <div className="modal-overlay" onClick={() => close(null)}>
      <div className="modal ai-analyst" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>
            <Bot size={16} /> {t('ai.title')} · <span style={{ color: civ.color }}>{civ.name}</span>
          </h2>
          <div className="ai-head-actions">
            <button className={`icon-btn ${showSettings ? 'icon-active' : ''}`} onClick={() => setShowSettings(!showSettings)} title={t('ai.settings')}>
              <Settings2 size={14} />
            </button>
            <button className="icon-btn" onClick={() => close(null)}>
              <X size={14} />
            </button>
          </div>
        </div>

        {showSettings && (
          <div className="ai-settings">
            <label>
              {t('ai.provider')}
              <select value={settings.provider} onChange={(e) => applyPreset(e.target.value)}>
                {AI_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>
            <label>
              Base URL
              <input value={settings.baseUrl} onChange={(e) => patchSettings({ baseUrl: e.target.value })} spellCheck={false} />
            </label>
            <label>
              {t('ai.model')}
              <input value={settings.model} onChange={(e) => patchSettings({ model: e.target.value })} spellCheck={false} />
            </label>
            <label>
              API Key {preset.needsKey ? '' : `(${t('ai.optional')})`}
              <input
                type="password"
                value={settings.apiKey}
                onChange={(e) => patchSettings({ apiKey: e.target.value })}
                placeholder={preset.needsKey ? 'sk-…' : t('ai.nokey')}
                spellCheck={false}
              />
            </label>
            <p className="ai-note">{lang === 'zh' ? preset.noteZh : preset.note}</p>
            <p className="ai-note">{t('ai.privacy')}</p>
          </div>
        )}

        <div className="ai-messages" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="ai-empty">
              <Bot size={28} />
              <p>{t('ai.intro', { name: civ.name })}</p>
              {keyMissing && <p className="ai-warn">{t('ai.needkey')}</p>}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`ai-msg ai-msg-${m.role} ${m.error ? 'ai-msg-error' : ''}`}>
              {m.content || (busy && i === messages.length - 1 ? '…' : '')}
            </div>
          ))}
        </div>

        <div className="ai-quick">
          {quickQuestions.map((q) => (
            <button key={q} className="chip" disabled={busy} onClick={() => ask(q)}>{q}</button>
          ))}
        </div>

        <div className="ai-input-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') ask(input); }}
            placeholder={t('ai.placeholder')}
            disabled={busy}
          />
          {busy ? (
            <button className="icon-btn" onClick={stop} title={t('ai.stop')}>
              <Square size={14} />
            </button>
          ) : (
            <button className="icon-btn" onClick={() => ask(input)} disabled={!input.trim()} title={t('ai.send')}>
              <Send size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
