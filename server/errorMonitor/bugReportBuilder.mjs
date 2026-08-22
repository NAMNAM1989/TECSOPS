/**
 * BugReportBuilder — payload bàn giao BUG_FIX_AGENT.
 * probable_cause là giả thuyết, không phải RCA.
 */

import { AGENT_NAME, SCHEMA_VERSION } from "./constants.mjs";
import { newBugId } from "./store.mjs";
import { collectEvidence, suspectedArea } from "./evidenceCollector.mjs";
import { sanitizeSecrets, sanitizeText } from "./secretSanitizer.mjs";

function summarize(event, classified) {
  const status = event.http?.status ? `HTTP ${event.http.status}` : event.error_type;
  const where = event.module !== "unknown" ? event.module : event.source;
  return sanitizeText(
    `[${classified.classification}] ${status} · ${where}: ${event.message}`.slice(0, 240),
  );
}

export function probableCauseHypothesis(event, classified) {
  switch (classified.classification) {
    case "INFRASTRUCTURE_ERROR":
      return {
        probable_cause: "Postgres/pool không kết nối được — kiểm tra DATABASE_URL, network, SSL.",
        confidence: 0.55,
      };
    case "SOFTWARE_ERROR":
      return {
        probable_cause: "Lỗi phần mềm backend (5xx/exception). Bug Fix cần RCA trên stack + module.",
        confidence: 0.4,
      };
    case "AUTOMATION_ERROR":
      return {
        probable_cause:
          classified.subtype === "EXTERNAL_UI_CHANGE"
            ? "Portal TCS/SCSC đổi DOM/selector — chưa kết luận bug code nội bộ."
            : "Automation/ext locator hoặc bước workflow thất bại.",
        confidence: 0.45,
      };
    case "SECURITY_EVENT":
      return {
        probable_cause: "Sự kiện bảo mật/auth — ưu tiên điều tra, không auto-patch mù.",
        confidence: 0.35,
      };
    default:
      return {
        probable_cause: "Chưa đủ bằng chứng. Bug Fix sở hữu RCA.",
        confidence: Number(classified.confidence || 0.3) * 0.5,
      };
  }
}

export function buildBugReport({
  incident,
  event,
  classified,
  severity,
  evidence,
  requiresImmediate = false,
}) {
  const hypo = probableCauseHypothesis(event, classified);
  const report = {
    schema_version: SCHEMA_VERSION,
    bug_id: incident.bug_id || newBugId(),
    incident_id: incident.incident_id,
    fingerprint: incident.fingerprint,
    created_by: AGENT_NAME,
    created_at: new Date().toISOString(),
    severity,
    classification: classified.classification,
    subtype: classified.subtype || null,
    status: "OPEN",
    summary: summarize(event, classified),
    first_seen: incident.first_seen,
    last_seen: incident.last_seen,
    occurrence_count: incident.occurrence_count,
    affected: {
      service: event.service,
      module: event.module,
      environment: event.environment,
      user_flow: event.user_flow,
      url: event.url,
    },
    error: {
      type: event.error_type,
      message: event.message,
      stack_trace: event.stack_trace,
      http: event.http,
    },
    reproduction_context: {
      source: event.source,
      request_id: event.request_id,
      trace_id: event.trace_id,
      job_id: event.job_id,
      automation: event.automation,
      browser: event.browser,
      release: event.release,
      git_commit: event.git_commit,
    },
    evidence: evidence || collectEvidence(event),
    suspected_area: suspectedArea(event, classified),
    monitor_analysis: {
      probable_cause: hypo.probable_cause,
      confidence: hypo.confidence,
      classification_reason: classified.reason,
      classification_confidence: classified.confidence,
      note: "probable_cause là giả thuyết của Error Monitor. BUG_FIX_AGENT sở hữu RCA.",
    },
    requires_immediate_action: Boolean(requiresImmediate),
    correlated_incident_ids: [...(incident.correlated_ids || [])],
  };
  return sanitizeSecrets(report).sanitized;
}
