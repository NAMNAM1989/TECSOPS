import type { BugReport, ErrorMonitorEvent } from "./types";

/** Handshake for a future ERROR_MONITOR_AGENT — ingest only, never auto-fix blindly. */
export function bugReportFromMonitorEvent(event: ErrorMonitorEvent): BugReport {
  const files = event.file ? [event.file] : [];
  const stackFile = event.stack?.match(/(?:src|server)\/[\w./-]+\.\w+/)?.[0];
  if (stackFile && !files.includes(stackFile)) files.push(stackFile);
  return {
    bug_id: event.error_id,
    description: event.message,
    module: event.module || stackFile || "unknown",
    files,
    reproduction_steps: event.stack ? ["Replayed from ERROR_MONITOR_AGENT stack"] : [],
    actual: event.stack,
    category: "unknown",
  };
}
