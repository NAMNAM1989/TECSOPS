import { SENSITIVE_KEY_RE } from "./permissions";
import type { AgentEvent, AgentEventType } from "./types";

const SENSITIVE_VALUE_RE =
  /((?:password|passwd|secret|token|api[_-]?key|authorization)\s*[:=]\s*\S+|bearer\s+[a-z0-9._-]+|postgres(?:ql)?:\/\/\S+)/gi;

export function redactSecrets(value: string): string {
  return String(value || "").replace(SENSITIVE_VALUE_RE, "[REDACTED]");
}

export function sanitizeData(raw: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (SENSITIVE_KEY_RE.test(key)) continue;
    out[key] = sanitizeUnknown(value);
  }
  return out;
}

function sanitizeUnknown(value: unknown): unknown {
  if (typeof value === "string") return redactSecrets(value).slice(0, 400);
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeUnknown(item));
  if (typeof value === "object") {
    return sanitizeData(value as Record<string, unknown>) ?? {};
  }
  return String(value).slice(0, 120);
}

export function createEvent(
  type: AgentEventType,
  message: string,
  at: string,
  data?: Record<string, unknown>,
): AgentEvent {
  return {
    type,
    at,
    message: redactSecrets(message).slice(0, 500),
    data: sanitizeData(data),
  };
}

export class StructuredLogger {
  readonly events: AgentEvent[] = [];

  constructor(private readonly now: () => string) {}

  emit(type: AgentEventType, message: string, data?: Record<string, unknown>): AgentEvent {
    const event = createEvent(type, message, this.now(), data);
    this.events.push(event);
    return event;
  }
}
