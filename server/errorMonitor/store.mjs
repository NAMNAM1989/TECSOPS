/**
 * Store in-memory (+ file queue tùy chọn). Không đụng app_state / Postgres nghiệp vụ.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DEFAULTS, INCIDENT_STATUS } from "./constants.mjs";

export function createMemoryStore() {
  /** @type {Map<string, any>} */
  const incidents = new Map();
  /** @type {Map<string, any>} */
  const bugs = new Map();
  /** @type {Map<string, any>} */
  const fingerprints = new Map();
  /** @type {any[]} */
  const notifications = [];
  /** @type {any[]} */
  const dispatched = [];

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
    reset() {
      incidents.clear();
      bugs.clear();
      fingerprints.clear();
      notifications.length = 0;
      dispatched.length = 0;
    },
  };
}

export function ensureQueueDirs(rootDir) {
  const outbox = path.join(rootDir, "outbox");
  const inbox = path.join(rootDir, "inbox");
  const processed = path.join(rootDir, "processed");
  fs.mkdirSync(outbox, { recursive: true });
  fs.mkdirSync(inbox, { recursive: true });
  fs.mkdirSync(processed, { recursive: true });
  return { rootDir, outbox, inbox, processed };
}

export function writeJsonAtomic(filePath, value) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

export function newIncidentId() {
  return `inc_${crypto.randomUUID()}`;
}

export function newBugId() {
  return `bug_${crypto.randomUUID()}`;
}

export { DEFAULTS, INCIDENT_STATUS };
