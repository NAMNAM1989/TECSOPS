/**
 * DeduplicationEngine — 100 (hoặc 10_000) lỗi giống nhau = 1 incident.
 */

import { DEFAULTS, INCIDENT_STATUS, OBS_EVENTS } from "./constants.mjs";
import { newIncidentId } from "./store.mjs";

export function createDeduplicationEngine({
  store,
  now = () => Date.now(),
  maxEvents = DEFAULTS.maxStoredEventsPerIncident,
  observability = null,
} = {}) {
  function rememberEvent(incident, event) {
    const slim = {
      event_id: event.event_id,
      timestamp: event.timestamp,
      message: event.message,
      http: event.http,
    };
    incident.recent_events.push(slim);
    if (incident.recent_events.length > maxEvents) {
      incident.recent_events.splice(0, incident.recent_events.length - maxEvents);
    }
  }

  /**
   * @returns {{ incident: any, isNew: boolean, aggregated: boolean }}
   */
  function upsert(event, fingerprint, classified, severity) {
    const existing = store.getIncidentByFingerprint(fingerprint);
    const ts = event.timestamp || new Date(now()).toISOString();
    if (existing) {
      existing.occurrence_count += 1;
      existing.last_seen = ts;
      existing.last_event = event;
      rememberEvent(existing, event);
      if (severityRank(severity) < severityRank(existing.severity)) {
        existing.severity = severity;
      }
      store.putIncident(existing);
      observability?.emit(OBS_EVENTS.INCIDENT_UPDATED, {
        incident_id: existing.incident_id,
        occurrence_count: existing.occurrence_count,
      });
      return { incident: existing, isNew: false, aggregated: true };
    }

    const incident = {
      incident_id: newIncidentId(),
      fingerprint,
      status: INCIDENT_STATUS.OPEN,
      classification: classified.classification,
      subtype: classified.subtype || null,
      severity,
      first_seen: ts,
      last_seen: ts,
      occurrence_count: 1,
      dispatch_count: 0,
      fix_attempt_count: 0,
      bug_id: null,
      correlated_ids: [],
      recent_events: [],
      first_event: event,
      last_event: event,
      monitor_notes: [],
    };
    rememberEvent(incident, event);
    store.putIncident(incident);
    observability?.emit(OBS_EVENTS.INCIDENT_OPENED, {
      incident_id: incident.incident_id,
      fingerprint,
    });
    return { incident, isNew: true, aggregated: false };
  }

  return { upsert };
}

function severityRank(sev) {
  const map = { "SEV-0": 0, "SEV-1": 1, "SEV-2": 2, "SEV-3": 3, "SEV-4": 4 };
  return map[sev] ?? 3;
}
