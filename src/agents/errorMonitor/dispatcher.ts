/**
 * BugFixDispatcher — map xuống ErrorMonitorEvent rồi gọi contract thật của bugFix.
 * Không tự đóng khi Bug Fix trả RESOLVED.
 */

import { bugReportFromMonitorEvent, runBugFixAgent } from "../bugFix";
import type { BugFixOutput, BugReport, ErrorMonitorEvent } from "../bugFix";
import type { BugFixAgentOptions } from "../bugFix/types";
import { extractFile } from "./fingerprint";
import { sanitizeSecrets } from "./sanitizer";
import type {
  Classification,
  ErrorClass,
  InternalBugReport,
  MonitorIncident,
  NormalizedErrorEvent,
  RunBugFixFn,
  Severity,
} from "./types";
import { AGENT_NAME, SCHEMA_VERSION } from "./types";

export function toErrorMonitorEvent(
  event: NormalizedErrorEvent,
  errorId: string,
): ErrorMonitorEvent {
  return {
    source: "ERROR_MONITOR_AGENT",
    error_id: errorId,
    message: event.message,
    stack: event.stack_trace || undefined,
    module: event.module,
    file: extractFile(event.stack_trace, event.module),
    timestamp: event.timestamp,
  };
}

export function bugFixCategory(classification: ErrorClass): BugReport["category"] {
  if (classification === "SOFTWARE_ERROR" || classification === "UNKNOWN") return "code";
  if (classification === "AUTOMATION_ERROR") return "ui";
  if (classification === "INFRASTRUCTURE_ERROR" || classification === "SECURITY_EVENT") return "ops";
  return "unknown";
}

export function enrichBugFixReport(
  mapped: BugReport,
  event: NormalizedErrorEvent,
  classified: Classification,
  evidence: Record<string, unknown>,
): BugReport {
  const files = [...(mapped.files || [])];
  const extraFile = extractFile(event.stack_trace, event.module);
  if (extraFile && !files.includes(extraFile)) files.push(extraFile);
  return {
    ...mapped,
    description: mapped.description || event.message,
    module: mapped.module || event.module,
    files,
    reproduction_steps:
      mapped.reproduction_steps && mapped.reproduction_steps.length
        ? mapped.reproduction_steps
        : [
            `Source ${event.source}`,
            event.http?.path ? `HTTP ${event.http.method || "GET"} ${event.http.path}` : "No HTTP path",
            event.user_flow || "unknown user flow",
          ],
    expected: "No unhandled software error",
    actual: event.stack_trace || event.message,
    category: bugFixCategory(classified.classification),
    ui_workflow: event.automation?.workflow ? [event.automation.workflow] : undefined,
    base_url: event.automation?.page_url || event.url || undefined,
    requested_operations: evidence.http ? ["logs.read"] : undefined,
  };
}

export function suspectedArea(event: NormalizedErrorEvent, classified: Classification): string {
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

export function buildInternalBugReport(input: {
  incident: MonitorIncident;
  event: NormalizedErrorEvent;
  classified: Classification;
  severity: Severity;
  evidence: Record<string, unknown>;
  requiresImmediate: boolean;
  bugId: string;
}): InternalBugReport {
  const { incident, event, classified, severity, evidence, requiresImmediate, bugId } = input;
  const monitorEvent = toErrorMonitorEvent(event, bugId);
  const mapped = bugReportFromMonitorEvent(monitorEvent);
  const bugFixReport = enrichBugFixReport(mapped, event, classified, evidence);
  const report: InternalBugReport = {
    schema_version: SCHEMA_VERSION,
    bug_id: bugId,
    incident_id: incident.incident_id,
    fingerprint: incident.fingerprint,
    created_by: AGENT_NAME,
    created_at: event.timestamp,
    severity,
    classification: classified.classification,
    subtype: classified.subtype,
    status: "OPEN",
    summary: `[${classified.classification}] ${event.http?.status ? `HTTP ${event.http.status}` : event.error_type} · ${event.module}: ${event.message}`.slice(0, 240),
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
    evidence,
    suspected_area: suspectedArea(event, classified),
    monitor_analysis: {
      probable_cause:
        classified.classification === "INFRASTRUCTURE_ERROR"
          ? "Postgres/pool không kết nối được — kiểm tra DATABASE_URL, network, SSL."
          : classified.classification === "SOFTWARE_ERROR"
            ? "Lỗi phần mềm backend (5xx/exception). Bug Fix cần RCA trên stack + module."
            : "Chưa đủ bằng chứng. Bug Fix sở hữu RCA.",
      confidence: Number(classified.confidence || 0.3) * 0.5,
      classification_reason: classified.reason,
      classification_confidence: classified.confidence,
      note: "probable_cause là giả thuyết. BUG_FIX_AGENT sở hữu RCA.",
    },
    requires_immediate_action: requiresImmediate,
    correlated_incident_ids: [...incident.correlated_ids],
    error_monitor_event: monitorEvent,
    bug_fix_report: bugFixReport,
  };
  return sanitizeSecrets(report).sanitized as InternalBugReport;
}

export async function dispatchToBugFix(input: {
  report: InternalBugReport;
  runBugFix?: RunBugFixFn | null;
  bugFixOptions?: BugFixAgentOptions | null;
}): Promise<{ event: ErrorMonitorEvent; mapped: BugReport; output?: BugFixOutput }> {
  const event = input.report.error_monitor_event;
  if (!event || event.source !== "ERROR_MONITOR_AGENT") {
    throw new Error("BugFixDispatcher yêu cầu ErrorMonitorEvent hợp lệ");
  }
  const mapped = input.report.bug_fix_report || bugReportFromMonitorEvent(event);
  if (input.runBugFix) {
    const output = await input.runBugFix(mapped, event);
    return { event, mapped, output };
  }
  if (input.bugFixOptions) {
    const output = await runBugFixAgent(mapped, input.bugFixOptions);
    return { event, mapped, output };
  }
  return { event, mapped };
}
