/**
 * SecretSanitizer — redaction trước khi lưu / gửi AI / bàn giao Bug Fix.
 * Không log password, token, cookie, Authorization, DB creds, .env.
 */

const REDACTED = "[REDACTED]";

const SENSITIVE_KEY_RE =
  /^(authorization|cookie|set-cookie|x-api-key|x-auth-token|proxy-authorization)$|password|passwd|secret|token|otp|apikey|api[_-]?key|access[_-]?key|refresh[_-]?token|bearer|database_url|db_pass|db_password|connectionstring|private[_-]?key|credential|\.env|imap_pass|ecargo_imap|tcs_password|portal_worker_secret|railway_token|gemini_api/i;

const JWT_RE = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._\-+=/]{8,}/gi;
const BASIC_RE = /\bBasic\s+[A-Za-z0-9+/=]{8,}/gi;
const CONN_RE =
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s"'`]+/gi;
const KEY_EQ_RE =
  /\b((?:password|passwd|secret|token|authorization|api[_-]?key|access[_-]?key|database_url|imap_pass|tcs_password)\s*[:=]\s*)([^\s,;]+)/gi;
const ENV_ASSIGN_RE =
  /\b([A-Z][A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|API_KEY|DATABASE_URL|PASS)\s*=\s*)([^\s,;]+)/g;
const COOKIE_PAIR_RE = /\b(tecsops_session|connect\.sid|sessionid)=([^;\s]+)/gi;

function redactString(value) {
  if (typeof value !== "string" || !value) return value;
  let out = value;
  const before = out;
  out = out.replace(JWT_RE, REDACTED);
  out = out.replace(BEARER_RE, `Bearer ${REDACTED}`);
  out = out.replace(BASIC_RE, `Basic ${REDACTED}`);
  out = out.replace(CONN_RE, REDACTED);
  out = out.replace(KEY_EQ_RE, `$1${REDACTED}`);
  out = out.replace(ENV_ASSIGN_RE, `$1${REDACTED}`);
  out = out.replace(COOKIE_PAIR_RE, `$1=${REDACTED}`);
  return { value: out, redacted: out !== before };
}

function walk(value, stats, depth = 0) {
  if (depth > 8) return REDACTED;
  if (value == null) return value;
  if (typeof value === "string") {
    const { value: next, redacted } = redactString(value);
    if (redacted) stats.count += 1;
    return next;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 40).map((item) => walk(item, stats, depth + 1));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [key, raw] of Object.entries(value)) {
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

/**
 * @param {unknown} input
 * @returns {{ sanitized: any, redacted_count: number }}
 */
export function sanitizeSecrets(input) {
  const stats = { count: 0 };
  const sanitized = walk(input, stats, 0);
  return { sanitized, redacted_count: stats.count };
}

export function sanitizeText(text) {
  return redactString(String(text || "")).value;
}

export function containsSecret(text) {
  const raw = String(text || "");
  if (!raw) return false;
  return (
    JWT_RE.test(raw) ||
    BEARER_RE.test(raw) ||
    BASIC_RE.test(raw) ||
    CONN_RE.test(raw) ||
    KEY_EQ_RE.test(raw) ||
    ENV_ASSIGN_RE.test(raw)
  );
}

export { REDACTED, SENSITIVE_KEY_RE };
