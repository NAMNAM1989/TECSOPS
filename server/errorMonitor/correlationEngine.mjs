/**
 * CorrelationEngine — gom sự kiện liên quan vào một incident khi có bằng chứng.
 */

import { DEFAULTS } from "./constants.mjs";

function tsMs(value, fallback) {
  const n = Date.parse(value || "");
  return Number.isFinite(n) ? n : fallback;
}

export function createCorrelationEngine({
  store,
  now = () => Date.now(),
  windowMs = DEFAULTS.correlationWindowMs,
} = {}) {
  /**
   * Liên kết incident hiện tại với incident khác cùng request/trace/job/automation run.
   */
  function correlate(incident, event) {
    const keys = [
      event.request_id && `req:${event.request_id}`,
      event.trace_id && `tr:${event.trace_id}`,
      event.job_id && `job:${event.job_id}`,
      event.automation?.run_id && `run:${event.automation.run_id}`,
    ].filter(Boolean);
    if (!keys.length) return incident;

    const nowMs = now();
    for (const other of store.listIncidents()) {
      if (other.incident_id === incident.incident_id) continue;
      const otherEvent = other.last_event || other.first_event;
      if (!otherEvent) continue;
      if (Math.abs(nowMs - tsMs(other.last_seen, nowMs)) > windowMs) continue;
      const otherKeys = [
        otherEvent.request_id && `req:${otherEvent.request_id}`,
        otherEvent.trace_id && `tr:${otherEvent.trace_id}`,
        otherEvent.job_id && `job:${otherEvent.job_id}`,
        otherEvent.automation?.run_id && `run:${otherEvent.automation.run_id}`,
      ].filter(Boolean);
      const hit = keys.some((k) => otherKeys.includes(k));
      if (!hit) continue;
      if (!incident.correlated_ids.includes(other.incident_id)) {
        incident.correlated_ids.push(other.incident_id);
      }
      if (!other.correlated_ids.includes(incident.incident_id)) {
        other.correlated_ids.push(incident.incident_id);
        store.putIncident(other);
      }
    }
    store.putIncident(incident);
    return incident;
  }

  return { correlate };
}
