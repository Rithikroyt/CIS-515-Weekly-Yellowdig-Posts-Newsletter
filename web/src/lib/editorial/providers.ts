// Provider-neutral model adapter. Exactly one provider is selected explicitly (EDITORIAL_AI_PROVIDER);
// there is no automatic fallback between providers. Keys are read server-side only and never logged,
// returned or placed in requests other than the provider's own auth header.
import type { ModelRequest, ModelResponse } from "./machine";
import { EditorialError, type ProviderName } from "./types";

export interface EditorialModelProvider {
  readonly name: ProviderName;
  readonly model: string;
  /** Never throws: transport problems come back as MODEL_TIMEOUT / MODEL_PROVIDER_ERROR responses. */
  generate(request: ModelRequest): Promise<ModelResponse>;
}

export const DEFAULT_MODELS: Record<ProviderName, string> = {
  // 2026-11-01: gemini-2.5-flash returns 404 for new keys, and gemini-3.5-flash allows only 20 free-tier requests per
  // day (one newsletter needs 6-10). gemini-3.5-flash-lite completed a full synthetic run with every claim supported.
  gemini: "gemini-3.5-flash-lite",
  openai: "unconfigured",
  anthropic: "unconfigured",
  mock: "mock-synthetic-v1",
};

// ---------- Gemini (pure request/response helpers, shared with n8n workflow 04) ----------
export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

export function geminiRequest(req: ModelRequest) {
  if (!/^[a-z0-9.-]{3,60}$/.test(req.model)) throw new EditorialError("PROVIDER_NOT_CONFIGURED", "invalid model name");
  return {
    url: GEMINI_BASE + req.model + ":generateContent",
    body: {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts: [{ text: req.user }] }],
      // Low thinking keeps the whole run inside n8n Cloud's 300 s execution cap; thinking tokens count toward the limit.
      generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 16384, thinkingConfig: { thinkingLevel: "low" } },
    },
  };
}

/** Extracts the JSON text from a Gemini generateContent response (or an n8n HTTP error item). */
export function parseGeminiResponse(raw: unknown): ModelResponse {
  const r = (raw ?? {}) as Record<string, unknown>;
  // Gemini API errors are objects; n8n's continue-on-fail items carry a string.
  const err = typeof r.error === "string" ? { message: r.error } : (r.error as Record<string, unknown> | undefined);
  if (err) {
    const msg = String(err.message ?? err.description ?? "provider error").slice(0, 160);
    return { ok: false, code: /timeout|timed out|ETIMEDOUT|ECONNABORTED/i.test(msg) ? "MODEL_TIMEOUT" : "MODEL_PROVIDER_ERROR", detail: msg };
  }
  const blocked = (r.promptFeedback as Record<string, unknown> | undefined)?.blockReason;
  if (blocked) return { ok: false, code: "MODEL_PROVIDER_ERROR", detail: "blocked by provider: " + String(blocked) };
  const cand = (r.candidates as Array<Record<string, unknown>> | undefined)?.[0];
  const parts = ((cand?.content as Record<string, unknown> | undefined)?.parts as Array<{ text?: string }> | undefined) ?? [];
  const text = parts.map((p) => p.text ?? "").join("");
  if (!text) return { ok: false, code: "MODEL_PROVIDER_ERROR", detail: "empty response (finishReason " + String(cand?.finishReason ?? "unknown") + ")" };
  return { ok: true, text };
}

export function createGeminiProvider(o: { apiKey: string; model?: string; timeoutMs?: number; fetchImpl?: typeof fetch }): EditorialModelProvider {
  const model = o.model || DEFAULT_MODELS.gemini;
  const doFetch = o.fetchImpl ?? fetch;
  return {
    name: "gemini",
    model,
    async generate(req) {
      const { url, body } = geminiRequest({ ...req, model });
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 90_000);
      try {
        const res = await doFetch(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": o.apiKey }, body: JSON.stringify(body), signal: ctrl.signal });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, code: "MODEL_PROVIDER_ERROR", detail: "HTTP " + res.status };
        return parseGeminiResponse(json);
      } catch (e) {
        const aborted = (e as Error).name === "AbortError";
        return { ok: false, code: aborted ? "MODEL_TIMEOUT" : "MODEL_PROVIDER_ERROR", detail: aborted ? "request timed out" : "network error" };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * Chooses the single configured provider. No fallback: an unset, unknown or unconfigured provider is an error.
 * "mock" is refused in production. OpenAI and Anthropic are reserved names without an adapter yet.
 */
export function selectProvider(
  env: Record<string, string | undefined>,
  o: { nodeEnv?: string; mock?: () => EditorialModelProvider } = {},
): EditorialModelProvider {
  const name = (env.EDITORIAL_AI_PROVIDER ?? "").trim().toLowerCase();
  if (!name) throw new EditorialError("PROVIDER_NOT_CONFIGURED", "EDITORIAL_AI_PROVIDER is not set");
  if (name === "gemini") {
    if (!env.GEMINI_API_KEY) throw new EditorialError("PROVIDER_NOT_CONFIGURED", "GEMINI_API_KEY is not configured");
    return createGeminiProvider({ apiKey: env.GEMINI_API_KEY, model: env.EDITORIAL_AI_MODEL });
  }
  if (name === "openai" || name === "anthropic") throw new EditorialError("PROVIDER_NOT_IMPLEMENTED", name + " has no adapter yet; select gemini or mock");
  if (name === "mock") {
    if (o.nodeEnv === "production") throw new EditorialError("PROVIDER_NOT_CONFIGURED", "the mock provider is development and test only");
    if (!o.mock) throw new EditorialError("PROVIDER_NOT_CONFIGURED", "no mock scenario supplied");
    return o.mock();
  }
  throw new EditorialError("PROVIDER_NOT_CONFIGURED", "unknown EDITORIAL_AI_PROVIDER");
}
