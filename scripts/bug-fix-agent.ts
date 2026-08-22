/**
 * CLI cho BugFixAgent — không auto-commit, không deploy, không đụng auth.
 * Chạy: npm run bugfix:agent -- --report "..."
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { BugFixAgent, createMemorySessionStore, type BugReport } from "../src/agents/bugFix/index";
import type { AgentHost, ExecResult, GitStatus } from "../src/agents/bugFix/types";

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function has(flag: string): boolean {
  return process.argv.includes(flag);
}

async function createNodeHost(root: string): Promise<AgentHost> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  return {
    now: () => new Date().toISOString(),
    randomId: (prefix = "bf") => `${prefix}_${Math.random().toString(16).slice(2, 10)}`,
    fs: {
      async readFile(filePath) {
        return fs.readFile(path.resolve(root, filePath), "utf8");
      },
      async writeFile(filePath, content) {
        const abs = path.resolve(root, filePath);
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, content, "utf8");
      },
      async list(dir = "") {
        const abs = path.resolve(root, dir);
        const names = await fs.readdir(abs).catch(() => []);
        return names.map((name) => (dir ? `${dir.replace(/\/$/, "")}/${name}` : name));
      },
      async exists(filePath) {
        return fs
          .access(path.resolve(root, filePath))
          .then(() => true)
          .catch(() => false);
      },
    },
    git: {
      async status() {
        const result = await run("git", ["status", "--porcelain"], root);
        const entries = result.stdout
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => ({ status: line.slice(0, 2).trim(), path: line.slice(3).trim() }));
        return { clean: entries.length === 0, entries } satisfies GitStatus;
      },
      async diff(filePath) {
        const args = filePath ? ["diff", "--", filePath] : ["diff"];
        return (await run("git", args, root)).stdout;
      },
      async log(limit = 8) {
        return (await run("git", ["log", `-n${limit}`, "--oneline"], root)).stdout;
      },
    },
    exec: {
      async run(command, args = []) {
        if (command === "npm:typecheck") return run("npm", ["run", "typecheck"], root);
        if (command === "npm:lint") return run("npm", ["run", "lint"], root);
        return run(command, args, root);
      },
    },
  };

  async function run(command: string, args: string[], cwd: string): Promise<ExecResult> {
    try {
      const out = await execFileAsync(command, args, { cwd, encoding: "utf8" });
      return { ok: true, code: 0, stdout: out.stdout, stderr: out.stderr };
    } catch (error) {
      const err = error as { code?: number; stdout?: string; stderr?: string; message?: string };
      return {
        ok: false,
        code: Number(err.code) || 1,
        stdout: err.stdout || "",
        stderr: err.stderr || err.message || String(error),
      };
    }
  }
}

async function main() {
  const reportText = arg("--report");
  const reportFile = arg("--report-file");
  const resume = arg("--resume");
  const root = arg("--root") || process.cwd();
  if (!reportText && !reportFile && !resume) {
    console.error("Usage: npm run bugfix:agent -- --report \"...\" | --report-file bug.json | --resume SESSION_ID");
    process.exit(2);
  }
  const store = createMemorySessionStore();
  const persistDir = path.join(root, ".tecsops/bug-fix-agent");
  if (!has("--no-persist")) {
    await fs.mkdir(persistDir, { recursive: true });
  }
  const host = await createNodeHost(root);
  const agent = new BugFixAgent({
    host,
    store,
    config: { autoCommit: false, allowProtectedOps: false },
  });
  let output;
  if (resume) {
    output = await agent.resume(resume);
  } else {
    let report: BugReport;
    if (reportFile) {
      report = JSON.parse(await fs.readFile(path.resolve(root, reportFile), "utf8")) as BugReport;
    } else {
      report = { description: reportText || "", category: "code" };
    }
    output = await agent.run(report);
  }
  const session = agent.getSession();
  if (session && !has("--no-persist")) {
    await fs.writeFile(
      path.join(persistDir, `${session.session_id}.json`),
      JSON.stringify(session, null, 2),
      "utf8",
    );
  }
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
