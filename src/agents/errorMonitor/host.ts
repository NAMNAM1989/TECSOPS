import type { ErrorMonitorHost } from "./types";

export type MemoryMonitorHost = ErrorMonitorHost & {
  persisted: Array<{ kind: string; id: string; payload: unknown }>;
};

export function createMemoryMonitorHost(init: { now?: () => string } = {}): MemoryMonitorHost {
  let seq = 0;
  const persisted: MemoryMonitorHost["persisted"] = [];
  return {
    persisted,
    now: () => init.now?.() ?? new Date(1_700_000_000_000 + seq * 1000).toISOString(),
    randomId: (prefix = "em") => {
      seq += 1;
      return `${prefix}_${seq.toString(16)}`;
    },
    persist(kind, id, payload) {
      persisted.push({ kind, id, payload });
    },
  };
}
