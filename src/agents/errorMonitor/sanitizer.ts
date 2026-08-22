export const REDACTED = "[REDACTED]";

const SENSITIVE_KEY_RE =
  /^(authorization|cookie|set-cookie|x-api-key|x-auth-token|proxy-authorization)$|password|passwd|secret|token|otp|apikey|api[_-]?key|access[_-]?key|refresh[_-]?token|bearer|database_url|db_pass|db_password|connectionstring|private[_-]?key|credential|\.env|imap_pass|ecargo_imap|tcs_password|portal_worker_secret|railway_token|gemini_api/i;

const JWT_RE = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._\-+=/]{8,}/gi;
const BASIC_RE = /\bBasic\s+[A-Za-z0-9+/=]{8,}/gi;
const CONN_RE = /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s"'`]+/gi;
const KEY_EQ_RE =
  /\b((?:password|passwd|secret|token|authorization|api[_-]?key|access[_-]?key|database_url|imap_pass|tcs_password)\s*[:=]\s*)([^\s,;]+)/gi;
const ENV_ASSIGN_RE = /\b([A-Z][A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|API_KEY|DATABASE_URL|PASS)\s*=\s*)([^\s,;]+)/g;
const COOKIE_PAIR_RE = /\b(tecsops_session|connect\.sid|sessionid)=([^;\s]+)/gi;

function redactString(value: string): { value: string; redacted: boolean } {
  if (!value) return { value, redacted: false };
  const out = value
    .replace(JWT_RE, REDACTED)
    .replace(BEARER_RE, `Bearer ${REDACTED}`)
    .replace(BASIC_RE, `Basic ${REDACTED}`)
    .replace(CONN_RE, REDACTED)
    .replace(KEY_EQ_RE, `$1${REDACTED}`)
    .replace(ENV_ASSIGN_RE, `$1${REDACTED}`)
    .replace(COOKIE_PAIR_RE, `$1=${REDACTED}`);
  return { value: out, redacted: out !== value };
}

function walk(value: unknown, stats: { count: number }, depth = 0): unknown {
  if (depth > 8) return REDACTED;
  if (value == null) return value;
  if (typeof value === "string") {
    const next = redactString(value);
    if (next.redacted) stats.count += 1;
    return next.value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => walk(item, stats, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(key)) {
        out[key] = REDACTED;
        stats.count += 1;
        continue;
      }
      out[key] = walk(raw, stats, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 200);
}

export function sanitizeSecrets(input: unknown): { sanitized: unknown; redacted_count: number } {
  const stats = { count: 0 };
  return { sanitized: walk(input, stats, 0), redacted_count: stats.count };
}

export function sanitizeText(text: unknown): string {
  return redactString(String(text || "")).value;
}

export function sanitizeRecord(input: Record<string, unknown>): {
  sanitized: Record<string, unknown>;
  redacted_count: number;
} {
  const { sanitized, redacted_count } = sanitizeSecrets(input);
  return {
    sanitized:
      sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
        ? (sanitized as Record<string, unknown>)
        : {},
    redacted_count,
  };
}
