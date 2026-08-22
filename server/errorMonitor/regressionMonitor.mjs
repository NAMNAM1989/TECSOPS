/**
 * RegressionMonitor — fingerprint đã RESOLVED xuất hiện lại → REGRESSION + reopen.
 * Lặp fix thất bại → HUMAN_REVIEW_REQUIRED.
 */

import { DEFAULTS, INCIDENT_STATUS, OBS_EVENTS } from "./constants.mjs";

export function createRegressionMonitor({
  store,
  observability = null,
  now = () => Date.now(),
  observationWindowMs = DEFAULTS.observationWindowMs,
  maxFixAttempts = DEFAULTS.maxFixAttempts,
} = {}) {
  function onNewOccurrence(incident) {
    const resolvedLike = new Set([
      INCIDENT_STATUS.RESOLVED,
      INCIDENT_STATUS.FIXED_PENDING_OBSERVATION,
    ]);
    if (!resolvedLike.has(incident.status)) {
      return { regression: false, incident };
    }
    incident.status = INCIDENT_STATUS.REGRESSION;
    incident.reopened_at = new Date(now()).toISOString();
    incident.fix_attempt_count = (incident.fix_attempt_count || 0) + 1;
    observability?.emit(OBS_EVENTS.REGRESSION_DETECTED, {
      incident_id: incident.incident_id,
      fingerprint: incident.fingerprint,
      bug_id: incident.bug_id,
    });
    if (incident.fix_attempt_count >= maxFixAttempts) {
      incident.status = INCIDENT_STATUS.HUMAN_REVIEW_REQUIRED;
      observability?.emit(OBS_EVENTS.REPEATED_FIX_FAILURE, {
        incident_id: incident.incident_id,
        attempts: incident.fix_attempt_count,
      });
      observability?.emit(OBS_EVENTS.HUMAN_REVIEW_REQUIRED, {
        incident_id: incident.incident_id,
        reason: "REPEATED_FIX_FAILURE",
      });
    }
    store.putIncident(incident);
    const bug = incident.bug_id ? store.getBug(incident.bug_id) : null;
    if (bug) {
      bug.status = incident.status;
      bug.last_seen = incident.last_seen;
      bug.occurrence_count = incident.occurrence_count;
      store.putBug(bug);
    }
    return { regression: true, incident, humanReview: incident.status === INCIDENT_STATUS.HUMAN_REVIEW_REQUIRED };
  }

  function observePending() {
    const ts = now();
    const resolved = [];
    for (const incident of store.listIncidents()) {
      if (incident.status !== INCIDENT_STATUS.FIXED_PENDING_OBSERVATION) continue;
      const start = Date.parse(incident.observation_started_at || "");
      if (!Number.isFinite(start) || ts - start < observationWindowMs) continue;
      const last = Date.parse(incident.last_seen || "");
      if (Number.isFinite(last) && last > start) continue;
      incident.status = INCIDENT_STATUS.RESOLVED;
      incident.resolved_at = new Date(ts).toISOString();
      store.putIncident(incident);
      const bug = incident.bug_id ? store.getBug(incident.bug_id) : null;
      if (bug) {
        bug.status = INCIDENT_STATUS.RESOLVED;
        store.putBug(bug);
      }
      observability?.emit(OBS_EVENTS.INCIDENT_RESOLVED, {
        incident_id: incident.incident_id,
        bug_id: incident.bug_id,
      });
      resolved.push(incident);
    }
    return resolved;
  }

  return { onNewOccurrence, observePending };
}
