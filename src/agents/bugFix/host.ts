import { executeExportedFunction } from "./sourceExec";
import type {
  AgentHost,
  ExecResult,
  FileHost,
  GitHost,
  PlaywrightHost,
} from "./types";

export type MemoryHostInit = {
  files?: Record<string, string>;
  dirtyFiles?: string[];
  commands?: Record<string, () => ExecResult | Promise<ExecResult>>;
  playwright?: PlaywrightHost;
  now?: () => string;
};

export type MemoryHost = AgentHost & {
  files: Map<string, string>;
  writes: Array<{ path: string; content: string }>;
  execLog: string[];
};

export function createMemoryHost(init: MemoryHostInit = {}): MemoryHost {
  const files = new Map(Object.entries(init.files ?? {}));
  const writes: Array<{ path: string; content: string }> = [];
  const execLog: string[] = [];
  let seq = 0;

  const fs: FileHost = {
    async readFile(path) {
      const content = files.get(path);
      if (content === undefined) throw new Error(`File not found: ${path}`);
      return content;
    },
    async writeFile(path, content) {
      files.set(path, content);
      writes.push({ path, content });
    },
    async list(dir) {
      const prefix = dir ? dir.replace(/\/$/, "") + "/" : "";
      return [...files.keys()].filter((key) => !prefix || key.startsWith(prefix));
    },
    async exists(path) {
      return files.has(path);
    },
  };

  const git: GitHost = {
    async status() {
      const entries = (init.dirtyFiles ?? []).map((path) => ({ path, status: "M" }));
      return { clean: entries.length === 0, entries };
    },
    async diff() {
      return "";
    },
    async log() {
      return "";
    },
  };

  const host: MemoryHost = {
    files,
    writes,
    execLog,
    now: () => init.now?.() ?? new Date(1_700_000_000_000 + seq * 1000).toISOString(),
    randomId: (prefix = "bf") => {
      seq += 1;
      return `${prefix}_${seq.toString(16)}`;
    },
    fs,
    git,
    exec: {
      async run(command, args = []) {
        const key = [command, ...args].join(" ");
        execLog.push(key);
        const handler = init.commands?.[key] ?? init.commands?.[command];
        if (handler) return handler();
        return { ok: true, code: 0, stdout: "ok", stderr: "" };
      },
    },
    playwright: init.playwright,
    runBehavior(source, fnName, args) {
      return executeExportedFunction(source, fnName, args);
    },
  };

  return host;
}

export function createMemoryPlaywright(options: {
  isFixed: () => boolean;
  failEvidence?: () => import("./types").PlaywrightEvidence;
  passEvidence?: () => import("./types").PlaywrightEvidence;
}): PlaywrightHost {
  const fail =
    options.failEvidence ??
    (() => ({
      ok: false,
      pageUrl: "http://127.0.0.1:5173",
      console: [{ type: "error", text: "TypeError: expected Đăng Nhập TCS label" }],
      network: [{ url: "/api/health", status: 200, method: "GET" }],
      domErrors: ["Missing Đăng Nhập TCS button label"],
      httpErrors: [],
      notes: ["workflow reproduce failed"],
    }));
  const pass =
    options.passEvidence ??
    (() => ({
      ok: true,
      pageUrl: "http://127.0.0.1:5173",
      console: [],
      network: [{ url: "/api/health", status: 200, method: "GET" }],
      domErrors: [],
      httpErrors: [],
      notes: ["workflow verified"],
    }));
  return {
    async reproduce() {
      return options.isFixed() ? pass() : fail();
    },
    async verify() {
      return options.isFixed() ? pass() : fail();
    },
  };
}
