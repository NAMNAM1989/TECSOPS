/**
 * Gemini REST client — AI chính cho TECSOPS (server-only).
 * Env: GEMINI_API_KEY, GEMINI_MODEL (mặc định gemini-2.0-flash).
 */

const DEFAULT_MODEL = "gemini-flash-latest";
const DEFAULT_TIMEOUT_MS = 45_000;

export function getGeminiModel() {
  return String(process.env.GEMINI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function stripCodeFence(text) {
  const t = String(text || "").trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return m ? m[1].trim() : t;
}

export function extractJsonFromGeminiText(raw) {
  const stripped = stripCodeFence(raw);
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(stripped.slice(start, end + 1));
    }
    throw new Error("Gemini không trả JSON hợp lệ");
  }
}

/**
 * @param {{ system?: string, user: string, schemaHint?: string, timeoutMs?: number }} opts
 * @returns {Promise<unknown>}
 */
export async function generateGeminiJson(opts) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    const err = new Error("Thiếu GEMINI_API_KEY — thêm vào .env.local hoặc Railway Variables");
    err.code = "GEMINI_NOT_CONFIGURED";
    throw err;
  }
  const model = getGeminiModel();
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const system = String(opts.system || "").trim();
  const user = String(opts.user || "").trim();
  const schemaHint = String(opts.schemaHint || "").trim();
  const promptParts = [];
  if (system) promptParts.push(system);
  if (schemaHint) promptParts.push(`Trả về ĐÚNG một JSON object theo schema:\n${schemaHint}`);
  promptParts.push(user);
  const prompt = promptParts.filter(Boolean).join("\n\n");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json",
        },
      }),
      signal: ac.signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") {
      const err = new Error(`Gemini timeout sau ${timeoutMs}ms`);
      err.code = "GEMINI_TIMEOUT";
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      body?.error?.message ||
      body?.error?.status ||
      `Gemini HTTP ${res.status}`;
    const err = new Error(String(msg));
    err.code = res.status === 429 ? "GEMINI_QUOTA" : "GEMINI_HTTP";
    err.status = res.status;
    throw err;
  }

  const text = body?.candidates?.[0]?.content?.parts
    ?.map((p) => p?.text || "")
    .join("")
    .trim();
  if (!text) {
    const err = new Error("Gemini không trả nội dung");
    err.code = "GEMINI_EMPTY";
    throw err;
  }
  return extractJsonFromGeminiText(text);
}
