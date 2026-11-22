// Provider-agnostic AI chat completions (OpenAI-compatible API).
// Defaults to Google Gemini's OpenAI-compatible endpoint, which keeps the
// same model the app used on Lovable (gemini-2.5-flash).
//
// Env:
//   AI_API_KEY   - required (e.g. a Google AI Studio key)
//   AI_BASE_URL  - optional, default https://generativelanguage.googleapis.com/v1beta/openai
//   AI_MODEL     - optional, default gemini-2.5-flash

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
const DEFAULT_MODEL = "gemini-2.5-flash";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function getAiConfig(): { apiKey: string; baseUrl: string; model: string } | null {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (process.env.AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    model: process.env.AI_MODEL || DEFAULT_MODEL,
  };
}

/** POST /chat/completions. Returns the raw fetch Response so callers keep their own error handling. */
export async function aiChatCompletion(
  messages: ChatMessage[],
  opts: { json?: boolean } = {},
): Promise<Response> {
  const cfg = getAiConfig();
  if (!cfg) throw new Error("missing_AI_API_KEY");
  return fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
}
