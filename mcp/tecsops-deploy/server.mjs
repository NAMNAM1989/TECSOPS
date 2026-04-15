/**
 * MCP server (stdio): công cụ deploy TECSOPS + kiểm tra health.
 * Chạy: node server.mjs — thêm vào Cursor / Claude Desktop (MCP) với command + args trỏ tới file này.
 *
 * Biến môi trường tùy chọn: TECSOPS_REPO_ROOT = đường dẫn tuyệt đối tới root repo (nếu không truyền trong tool).
 */
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(join(__dirname, "..", ".."));

function repoRootFromArgsOrEnv(repoRoot) {
  const fromEnv = process.env.TECSOPS_REPO_ROOT?.trim();
  if (repoRoot?.trim()) return resolve(repoRoot.trim());
  if (fromEnv) return resolve(fromEnv);
  return defaultRepoRoot;
}

function runNpmScript(cwd, script) {
  const cmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const r = spawnSync(cmd, ["run", script], {
    cwd,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  const out = [r.stdout || "", r.stderr || ""].join("\n").trim();
  return { status: r.status ?? 1, out };
}

const server = new McpServer({
  name: "tecsops-deploy",
  version: "1.0.0",
});

server.registerTool(
  "tecsops_deploy_ship",
  {
    title: "TECSOPS deploy:ship",
    description:
      "Chạy `npm run deploy:ship` trong repo (build, test, deploy:check, git push, redeploy nếu up-to-date). Cần repo sạch, đã commit.",
    inputSchema: z.object({
      repoRoot: z
        .string()
        .optional()
        .describe("Đường dẫn gốc repo TECSOPS (mặc định: 2 cấp trên file server.mjs hoặc TECSOPS_REPO_ROOT)."),
    }),
  },
  async (args) => {
    const cwd = repoRootFromArgsOrEnv(args?.repoRoot);
    const { status, out } = runNpmScript(cwd, "deploy:ship");
    return {
      content: [{ type: "text", text: out || `(không có output, exit ${status})` }],
      isError: status !== 0,
    };
  }
);

server.registerTool(
  "tecsops_health_check",
  {
    title: "TECSOPS GET /api/health",
    description: "Gọi GET {baseUrl}/api/health (timeout ~25s).",
    inputSchema: z.object({
      baseUrl: z
        .string()
        .describe("URL gốc production, ví dụ https://your-app.up.railway.app (không dấu / cuối)."),
    }),
  },
  async (args) => {
    const base = args.baseUrl.trim().replace(/\/$/, "");
    const url = `${base}/api/health`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });
      const text = await res.text();
      const body = `HTTP ${res.status}\n${text}`;
      return {
        content: [{ type: "text", text: body }],
        isError: !res.ok,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: "text", text: `Lỗi: ${msg}` }],
        isError: true,
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
