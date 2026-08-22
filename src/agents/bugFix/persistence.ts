import type { BugRecord, DebugSession, SessionStore, VerificationResults } from "./types";

export function createMemorySessionStore(): SessionStore & { sessions: Map<string, DebugSession> } {
  const sessions = new Map<string, DebugSession>();
  return {
    sessions,
    async save(session) {
      sessions.set(session.session_id, structuredClone(session));
    },
    async load(sessionId) {
      const found = sessions.get(sessionId);
      return found ? structuredClone(found) : null;
    },
    async loadByBugId(bugId) {
      for (const session of sessions.values()) {
        if (session.bug_id === bugId) return structuredClone(session);
      }
      return null;
    },
    async list() {
      return [...sessions.values()].map((session) => structuredClone(session));
    },
  };
}

export function tokenize(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\s_+-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

export function similarity(a: string, b: string): number {
  const left = new Set(tokenize(a));
  const right = new Set(tokenize(b));
  if (left.size === 0 || right.size === 0) return 0;
  let inter = 0;
  for (const token of left) {
    if (right.has(token)) inter += 1;
  }
  return inter / new Set([...left, ...right]).size;
}

export function findSimilarBugs(record: Pick<BugRecord, "description" | "module">, history: BugRecord[], limit = 3): BugRecord[] {
  return history
    .map((item) => ({
      item,
      score:
        similarity(record.description, item.description) +
        (record.module && item.module && record.module === item.module ? 0.15 : 0),
    }))
    .filter((row) => row.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.item);
}

export function emptyVerification(): VerificationResults {
  return {
    typecheck: "NOT_RUN",
    lint: "NOT_RUN",
    unit_tests: "NOT_RUN",
    integration_tests: "NOT_RUN",
    e2e: "NOT_RUN",
    build: "NOT_RUN",
    runtime: "NOT_RUN",
    targeted: "NOT_RUN",
  };
}
