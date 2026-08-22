import { sanitizeRecord, sanitizeSecrets, sanitizeText } from "./sanitizer";
import { AGENT_NAME, DEFAULT_CONFIG } from "./types";
import type { AutomationInfo, ErrorMonitorHost, HttpInfo, NormalizedErrorEvent } from "./types";

function asString(value: unknown, max = 2_000): string {
  if (value == null) return "";
  return String(value).slice(0, max);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function pickHttp(raw: Record<string, unknown>): HttpInfo {
  const http = asObject(raw.http);
  const status = Number(http.status ?? raw.status ?? raw.statusCode);
  return {
    method: asString(http.method || raw.method, 12).toUpperCase() || null,
    status: Number.isFinite(status) && status > 0 ? status : null,
    path: asString(http.path || raw.path || raw.url, 400) || null,
    route: asString(http.route, 200) || null,
  };
}

function pickAutomation(raw: Record<string, unknown>): AutomationInfo | null {
  const auto = asObject(raw.automation || raw.job);
  if (!raw.automation && !raw.job && !raw.automation_id && !raw.workflow) return null;
  return {
    automation_id: asString(auto.automation_id || raw.automation_id, 80) || null,
    run_id: asString(auto.run_id || raw.run_id, 80) || null,
    workflow: asString(auto.workflow || raw.workflow, 80) || null,
    step: asString(auto.step || raw.step, 120) || null,
    selector: asString(auto.selector || raw.selector, 240) || null,
    page_url: asString(auto.page_url || raw.page_url, 400) || null,
    screenshot: asString(auto.screenshot || raw.screenshot, 400) || null,
    console_errors: Array.isArray(auto.console_errors)
      ? auto.console_errors.slice(0, 12).map((item) => asString(item, 240))
      : [],
    network_errors: Array.isArray(auto.network_errors)
      ? auto.network_errors.slice(0, 12).map((item) => asString(item, 240))
      : [],
  };
}

export function normalizeErrorEvent(
  raw: Record<string, unknown>,
  host: ErrorMonitorHost,
  ctx: { environment?: string; release?: string; git_commit?: string; service?: string } = {},
): NormalizedErrorEvent {
  const { sanitized } = sanitizeRecord(raw);
  const http = pickHttp(sanitized);
  const automation = pickAutomation(sanitized);
  const metaRaw = asObject(sanitized.metadata || sanitized.meta);
  const { sanitized: metadata } = sanitizeSecrets(metaRaw);
  return {
    event_id: asString(sanitized.event_id, 80) || host.randomId("evt"),
    timestamp: asString(sanitized.timestamp) || host.now(),
    environment: asString(sanitized.environment || ctx.environment, 32) || "development",
    source: asString(sanitized.source, 40) || "unknown",
    service: asString(sanitized.service || ctx.service || DEFAULT_CONFIG.service, 40),
    module: asString(sanitized.module || sanitized.component, 80) || "unknown",
    error_type: asString(sanitized.error_type || sanitized.name || sanitized.code, 80) || "Error",
    message: sanitizeText(asString(sanitized.message || sanitized.error || sanitized.msg || "Unknown error", 1_500)),
    stack_trace: sanitizeText(asString(sanitized.stack_trace || sanitized.stack, 6_000)) || null,
    request_id: asString(sanitized.request_id || sanitized.requestId, 80) || null,
    trace_id: asString(sanitized.trace_id || sanitized.traceId, 80) || null,
    user_flow: asString(sanitized.user_flow || sanitized.userFlow, 80) || null,
    url: asString(sanitized.url || http.path, 400) || null,
    http,
    job_id: asString(sanitized.job_id || sanitized.jobId, 80) || null,
    automation,
    browser: asString(sanitized.browser, 80) || null,
    release: asString(sanitized.release || ctx.release, 80) || null,
    git_commit: asString(sanitized.git_commit || ctx.git_commit, 80) || null,
    collected_by: AGENT_NAME,
    metadata:
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>)
        : {},
  };
}
