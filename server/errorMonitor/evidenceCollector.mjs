/**
 * EvidenceCollector — thu thập bằng chứng, không suy diễn thành RCA.
 */

import { sanitizeSecrets } from "./secretSanitizer.mjs";

export function collectEvidence(event, extras = {}) {
  const auto = event.automation || {};
  const raw = {
    http: event.http,
    url: event.url,
    user_flow: event.user_flow,
    request_id: event.request_id,
    trace_id: event.trace_id,
    job_id: event.job_id,
    module: event.module,
    source: event.source,
    release: event.release,
    git_commit: event.git_commit,
    environment: event.environment,
    browser: event.browser,
    stack_present: Boolean(event.stack_trace),
    stack_preview: event.stack_trace ? String(event.stack_trace).slice(0, 800) : null,
    automation: auto
      ? {
          automation_id: auto.automation_id,
          run_id: auto.run_id,
          workflow: auto.workflow,
          step: auto.step,
          selector: auto.selector,
          page_url: auto.page_url,
          screenshot: auto.screenshot,
          console_errors: auto.console_errors,
          network_errors: auto.network_errors,
        }
      : null,
    health: extras.health || null,
    related_logs: extras.related_logs || [],
  };
  const { sanitized } = sanitizeSecrets(raw);
  return sanitized;
}

export function suspectedArea(event, classified) {
  if (classified.classification === "INFRASTRUCTURE_ERROR") return "server/dbPool.mjs + Postgres";
  if (classified.classification === "AUTOMATION_ERROR") {
    const wf = event.automation?.workflow || "";
    if (/scsc|ecargo/i.test(wf) || /scsc/i.test(event.automation?.page_url || "")) {
      return "chrome-extension-scsc / ext_scsc locators";
    }
    if (/tcs|esid/i.test(wf) || /tcs\.com/i.test(event.automation?.page_url || "")) {
      return "chrome-extension-tcs / ext_tcs locators";
    }
    return "automation worker / extension locators";
  }
  if (event.module && event.module !== "unknown") return event.module;
  if (event.http?.path) return `HTTP ${event.http.method || "GET"} ${event.http.path}`;
  return "unknown";
}
