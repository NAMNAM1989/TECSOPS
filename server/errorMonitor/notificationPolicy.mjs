/**
 * NotificationPolicy — không spam. Escalate SEV-0/1, gộp phần còn lại.
 */

import { OBS_EVENTS, SEVERITY } from "./constants.mjs";

const IMMEDIATE = new Set([SEVERITY.SEV_0, SEVERITY.SEV_1]);

export function createNotificationPolicy({ store, observability = null, now = () => Date.now() } = {}) {
  /**
   * @returns {{ sent: boolean, channel: string, reason: string } | null}
   */
  function notify({ incident, event, kind, force = false }) {
    const last = incident.last_notification_at
      ? Date.parse(incident.last_notification_at)
      : 0;
    const cooldown = IMMEDIATE.has(incident.severity) ? 60_000 : 15 * 60_000;
    if (!force && last && now() - last < cooldown && kind !== "ESCALATED") {
      return { sent: false, channel: "none", reason: "cooldown" };
    }

    const note = {
      at: new Date(now()).toISOString(),
      kind,
      severity: incident.severity,
      incident_id: incident.incident_id,
      bug_id: incident.bug_id,
      fingerprint: incident.fingerprint,
      message: event?.message || incident.last_event?.message || "",
      immediate: IMMEDIATE.has(incident.severity),
    };
    store.notifications.push(note);
    incident.last_notification_at = note.at;
    if (kind === "ESCALATED" || IMMEDIATE.has(incident.severity)) {
      observability?.emit(OBS_EVENTS.ESCALATED, {
        incident_id: incident.incident_id,
        severity: incident.severity,
      });
    }
    return { sent: true, channel: note.immediate ? "pager" : "digest", reason: kind };
  }

  return { notify, isImmediate: (sev) => IMMEDIATE.has(sev) };
}
