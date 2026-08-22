import type { InternalBugReport, MonitorIncident } from "./types";

export type MonitorStore = {
  incidents: Map<string, MonitorIncident>;
  bugs: Map<string, InternalBugReport>;
  fingerprints: Map<string, string>;
  notifications: Array<Record<string, unknown>>;
  dispatched: Array<{ bug_id: string; at: string; classification: string }>;
  getIncidentByFingerprint(fp: string): MonitorIncident | null;
  putIncident(incident: MonitorIncident): MonitorIncident;
  putBug(report: InternalBugReport): InternalBugReport;
  getBug(bugId: string): InternalBugReport | null;
  listIncidents(): MonitorIncident[];
  listBugs(): InternalBugReport[];
};

export function createMemoryStore(): MonitorStore {
  const incidents = new Map<string, MonitorIncident>();
  const bugs = new Map<string, InternalBugReport>();
  const fingerprints = new Map<string, string>();
  const notifications: Array<Record<string, unknown>> = [];
  const dispatched: MonitorStore["dispatched"] = [];

  return {
    incidents,
    bugs,
    fingerprints,
    notifications,
    dispatched,
    getIncidentByFingerprint(fp) {
      const id = fingerprints.get(fp);
      return id ? incidents.get(id) || null : null;
    },
    putIncident(incident) {
      incidents.set(incident.incident_id, incident);
      fingerprints.set(incident.fingerprint, incident.incident_id);
      if (incident.bug_id) {
        const bug = bugs.get(incident.bug_id);
        if (bug) {
          bug.status = incident.status;
          bug.occurrence_count = incident.occurrence_count;
          bug.last_seen = incident.last_seen;
        }
      }
      return incident;
    },
    putBug(report) {
      bugs.set(report.bug_id, report);
      return report;
    },
    getBug(bugId) {
      return bugs.get(bugId) || null;
    },
    listIncidents() {
      return [...incidents.values()];
    },
    listBugs() {
      return [...bugs.values()];
    },
  };
}
