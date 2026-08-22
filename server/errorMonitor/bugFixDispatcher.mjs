/**
 * BugFixDispatcher — bàn giao BugReport, nhận kết quả.
 * KHÔNG tự đóng RESOLVED. Chuyển FIXED_PENDING_OBSERVATION.
 *
 * Nếu BUG_FIX_AGENT chưa có trên main: file-queue + in-memory stub.
 * Contract: .agents/error-monitor-agent/README.md
 */

import fs from "node:fs";
import path from "node:path";
import { INCIDENT_STATUS, OBS_EVENTS } from "./constants.mjs";
import { ensureQueueDirs, writeJsonAtomic } from "./store.mjs";

/**
 * @typedef {{ bug_id: string, status: string, root_cause?: string, fix?: unknown, verification?: unknown, remaining_risk?: string }} BugFixResult
 */

export function createBugFixDispatcher({
  store,
  queueDir = null,
  sink = null,
  observability = null,
  now = () => Date.now(),
} = {}) {
  const dirs = queueDir ? ensureQueueDirs(queueDir) : null;

  function dispatch(report) {
    store.putBug(report);
    store.dispatched.push({
      bug_id: report.bug_id,
      at: new Date(now()).toISOString(),
      classification: report.classification,
    });
    if (dirs) {
      writeJsonAtomic(path.join(dirs.outbox, `${report.bug_id}.json`), {
        kind: "BUG_REPORT",
        consumed_by: "BUG_FIX_AGENT",
        report,
      });
    }
    if (typeof sink === "function") sink(report);
    observability?.emit(OBS_EVENTS.BUG_DISPATCHED, {
      bug_id: report.bug_id,
      fingerprint: report.fingerprint,
      severity: report.severity,
    });
    return { ok: true, bug_id: report.bug_id, queued: Boolean(dirs) };
  }

  /**
   * Bug Fix trả về — không đóng incident. Observation do Error Monitor.
   * @param {BugFixResult} result
   */
  function acceptResult(result) {
    const bugId = String(result?.bug_id || "");
    const bug = store.getBug(bugId);
    if (!bug) {
      return { ok: false, reason: "unknown_bug" };
    }
    const incoming = String(result.status || "").toUpperCase();
    bug.fix_result = {
      status: incoming,
      root_cause: result.root_cause || null,
      fix: result.fix || null,
      verification: result.verification || null,
      remaining_risk: result.remaining_risk || null,
      received_at: new Date(now()).toISOString(),
    };

    const incident = store.listIncidents().find((i) => i.bug_id === bugId);
    if (incoming === "RESOLVED" || incoming === "FIXED") {
      bug.status = INCIDENT_STATUS.FIXED_PENDING_OBSERVATION;
      if (incident) {
        incident.status = INCIDENT_STATUS.FIXED_PENDING_OBSERVATION;
        incident.observation_started_at = new Date(now()).toISOString();
        store.putIncident(incident);
      }
      observability?.emit(OBS_EVENTS.POST_FIX_OBSERVATION_STARTED, { bug_id: bugId });
    } else if (incoming === "FAILED" || incoming === "REPEATED_FIX_FAILURE") {
      if (incident) {
        incident.fix_attempt_count = (incident.fix_attempt_count || 0) + 1;
        store.putIncident(incident);
      }
    } else if (incoming === "IN_PROGRESS") {
      bug.status = INCIDENT_STATUS.IN_PROGRESS;
      if (incident) {
        incident.status = INCIDENT_STATUS.IN_PROGRESS;
        store.putIncident(incident);
      }
    }

    store.putBug(bug);
    observability?.emit(OBS_EVENTS.FIX_RESULT_ACCEPTED, {
      bug_id: bugId,
      incoming_status: incoming,
      stored_status: bug.status,
    });
    return { ok: true, bug, incident: incident || null };
  }

  function drainInbox() {
    if (!dirs) return [];
    const files = fs.readdirSync(dirs.inbox).filter((f) => f.endsWith(".json"));
    const results = [];
    for (const file of files) {
      const full = path.join(dirs.inbox, file);
      try {
        const raw = JSON.parse(fs.readFileSync(full, "utf8"));
        const payload = raw.result || raw;
        results.push(acceptResult(payload));
        fs.renameSync(full, path.join(dirs.processed, file));
      } catch (err) {
        results.push({ ok: false, file, error: String(err?.message || err) });
      }
    }
    return results;
  }

  return { dispatch, acceptResult, drainInbox, dirs };
}
