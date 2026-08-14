// Minimal OpenAI-compatible chat client (streaming), bring-your-own-key.
// The key lives ONLY in this browser's localStorage; requests go directly
// from the browser to the provider you choose. Ollama runs locally and
// needs no key at all.

export interface AiSettings {
  provider: string; // preset id
  baseUrl: string; // .../v1
  model: string;
  apiKey: string;
}

export interface AiProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  needsKey: boolean;
  note: string;
  noteZh: string;
}

export const AI_PRESETS: AiProviderPreset[] = [
  {
    id: 'ollama',
    label: 'Ollama (本地/local)',
    baseUrl: 'http://localhost:11434/v1',
    model: 'qwen2.5:7b',
    needsKey: false,
    note: 'Free & private. Install ollama.com, run `ollama pull qwen2.5:7b`. If blocked by CORS, start with OLLAMA_ORIGINS=* ollama serve.',
    noteZh: '免费且私密。安装 ollama.com 后执行 `ollama pull qwen2.5:7b`。若被 CORS 拦截，用 OLLAMA_ORIGINS=* ollama serve 启动。',
  },
  {
    id: 'zhipu',
    label: '智谱 GLM-4-Flash (免费)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    needsKey: true,
    note: 'Free model tier. Get a key at bigmodel.cn.',
    noteZh: '免费模型档位。在 bigmodel.cn 注册获取密钥。',
  },
  {
    id: 'siliconflow',
    label: 'SiliconFlow (免费 Qwen)',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    needsKey: true,
    note: 'Free Qwen models. Get a key at siliconflow.cn.',
    noteZh: '提供免费 Qwen 模型。在 siliconflow.cn 注册获取密钥。',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    needsKey: true,
    note: 'Very cheap. Key at platform.deepseek.com.',
    noteZh: '价格极低。在 platform.deepseek.com 获取密钥。',
  },
  {
    id: 'groq',
    label: 'Groq (免费额度)',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    needsKey: true,
    note: 'Fast free tier. Key at console.groq.com.',
    noteZh: '高速免费额度。在 console.groq.com 获取密钥。',
  },
  {
    id: 'custom',
    label: 'Custom / 自定义',
    baseUrl: 'http://localhost:8000/v1',
    model: 'model-name',
    needsKey: false,
    note: 'Any OpenAI-compatible endpoint (vLLM, LM Studio, one-api…).',
    noteZh: '任何 OpenAI 兼容端点（vLLM、LM Studio、one-api…）。',
  },
];

const STORAGE_KEY = 'civsim.ai';

export function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultSettings(), ...(JSON.parse(raw) as Partial<AiSettings>) };
  } catch {
    /* ignore */
  }
  return defaultSettings();
}

function defaultSettings(): AiSettings {
  const p = AI_PRESETS[0];
  return { provider: p.id, baseUrl: p.baseUrl, model: p.model, apiKey: '' };
}

export function saveAiSettings(s: AiSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Streaming chat completion. Calls onDelta with incremental text.
 * Returns the full response; throws with a readable message on failure.
 */
export async function chatStream(
  settings: AiSettings,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const url = `${settings.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        model: settings.model,
        messages,
        stream: true,
        temperature: 0.5,
        max_tokens: 1600,
      }),
    });
  } catch (err) {
    throw new Error(`NETWORK: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  // SSE stream of `data: {...}` lines.
  const reader = res.body?.getReader();
  if (!reader) throw new Error('NO_STREAM');
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload) as { choices?: { delta?: { content?: string }; message?: { content?: string } }[] };
        const delta = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? '';
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      } catch {
        /* partial line; ignore */
      }
    }
  }
  return full;
}
