// Proxy minimal vers l'API Albert (DINUM/Etalab) — endpoint OpenAI-compatible.
// Auth Bearer + JSON mode forcé pour que la sortie soit toujours un objet JSON
// parsable. La clé reste dans `.env` du serveur, jamais exposée au front.

export interface AlbertConfig {
  readonly apiUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly temperature: number;
}

export function createAlbertFromEnv(): AlbertConfig | null {
  const apiUrl = process.env.ALBERT_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.ALBERT_API_KEY;
  if (!apiUrl || !apiKey) return null;
  return {
    apiUrl,
    apiKey,
    model: process.env.ALBERT_MODEL ?? 'gpt-oss-120b',
    temperature: Number(process.env.ALBERT_TEMPERATURE ?? '0.3'),
  };
}

export interface ChatCompletionResult {
  readonly raw: string;
  readonly finishReason: string | null;
  readonly usage: unknown;
  readonly latencyMs: number;
}

interface OpenAIChoice {
  readonly message?: { readonly content?: string };
  readonly finish_reason?: string;
}
interface OpenAIChatResponse {
  readonly choices?: readonly OpenAIChoice[];
  readonly usage?: unknown;
}

export async function chatCompletion(
  cfg: AlbertConfig,
  system: string,
  user: string,
): Promise<ChatCompletionResult> {
  const startedAt = Date.now();
  const res = await fetch(`${cfg.apiUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: cfg.temperature,
      response_format: { type: 'json_object' },
    }),
  });
  const latencyMs = Date.now() - startedAt;
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`albert_http_${res.status}: ${errText.slice(0, 500)}`);
  }
  const data = (await res.json()) as OpenAIChatResponse;
  const first = data.choices?.[0];
  const content = first?.message?.content ?? '';
  return {
    raw: content,
    finishReason: first?.finish_reason ?? null,
    usage: data.usage ?? null,
    latencyMs,
  };
}

// Le `response_format: json_object` d'OpenAI-compat garantit normalement un
// JSON valide en sortie. Mais Albert peut tomber sur des providers moins
// stricts ; on accepte donc 3 formes : (1) JSON pur, (2) bloc fencé
// ```json ... ```, (3) le premier {...} trouvé. Renvoie null si rien de
// parsable.
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fallthrough
    }
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fenced && fenced[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // fallthrough
    }
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      // fallthrough
    }
  }
  return null;
}
