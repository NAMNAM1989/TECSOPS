/**
 * ErrorNormalizer — chuẩn hóa sự kiện thô thành Error Event schema.
 */

import crypto from "node:crypto";
import { AGENT_NAME, DEFAULTS, SCHEMA_VERSION } from "./constants.mjs";
import { sanitizeSecrets, sanitizeText } from "./secretSanitizer.mjs";

function asString(value, max = 2_000) {
  if (value == null) return "";
  return String(value).slice(0, max);
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function pickHttp(raw) {
  const http = asObject(raw.http);
  const status = Number(http.status ?? raw.status ?? raw.statusCode);
  return {
    method: asString(http.method || raw.method, 12).toUpperCase() || null,
    status: Number.isFinite(status) && status > 0 ? status : null,
    path: asString(http.path || raw.path || raw.url, 400) || null,
    route: asString(http.route, 200) || null,
  };
}

function pickAutomation(raw) {
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
      ? auto.console_errors.slice(0, 12).map((x) => asString(x, 240))
      : [],
    network_errors: Array.isArray(auto.network_errors)
      ? auto.network_errors.slice(0, 12).map((x) => asString(x, 240))
      : [],
  };
}

/**
 * @param {Record<string, unknown>} raw
 * @param {{ now?: () => number, environment?: string, release?: string, git_commit?: string }} [ctx]
 */
export function normalizeErrorEvent(raw, ctx = {}) {
  const source = asObject(raw);
  const { sanitized } = sanitizeSecrets(source);
  const now = ctx.now ? ctx.now() : Date.now();
  const http = pickHttp(sanitized);
  const automation = pickAutomation(sanitized);
  const message = sanitizeText(
    asString(sanitized.message || sanitized.error || sanitized.msg || "Unknown error", 1_500),
  );
  const stack = sanitizeText(asString(sanitized.stack_trace || sanitized.stack, 6_000));
  const metaRaw = asObject(sanitized.metadata || sanitized.meta);
  const { sanitized: metadata } = sanitizeSecrets(metaRaw);

  return {
    schema_version: SCHEMA_VERSION,
    event_id: asString(sanitized.event_id, 80) || crypto.randomUUID(),
    timestamp: asString(sanitized.timestamp) || new Date(now).toISOString(),
    environment:
      asString(sanitized.environment || ctx.environment || process.env.NODE_ENV, 32) ||
      "development",
    source: asString(sanitized.source, 40) || "unknown",
    service: asString(sanitized.service || ctx.service || DEFAULTS.service, 40),
    module: asString(sanitized.module || sanitized.component, 80) || "unknown",
    error_type: asString(sanitized.error_type || sanitized.name || sanitized.code, 80) || "Error",
    message,
    stack_trace: stack || null,
    request_id: asString(sanitized.request_id || sanitized.requestId, 80) || null,
    trace_id: asString(sanitized.trace_id || sanitized.traceId, 80) || null,
    user_flow: asString(sanitized.user_flow || sanitized.userFlow, 80) || null,
    url: asString(sanitized.url || http.path, 400) || null,
    http,
    job_id: asString(sanitized.job_id || sanitized.jobId, 80) || null,
    automation,
    browser: asString(sanitized.browser, 80) || null,
    release: asString(sanitized.release || ctx.release, 80) || null,
    git_commit: asString(sanitized.git_commit || ctx.git_commit || process.env.RAILWAY_GIT_COMMIT, 80) || null,
    collected_by: AGENT_NAME,
    metadata,
  };
}
