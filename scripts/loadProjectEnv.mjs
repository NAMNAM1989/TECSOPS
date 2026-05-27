/**
 * Nạp .env / .env.local vào process.env (ESM, dùng chung cho Railway scripts).
 * .env.local luôn ghi đè .env và biến shell cũ cho các key trong file.
 */
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseEnvLine(line) {
  const t = line.trim();
  if (!t || t.startsWith("#")) return null;
  const eq = t.indexOf("=");
  if (eq <= 0) return null;
  const key = t.slice(0, eq).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  let val = t.slice(eq + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  val = val.trim();
  if (val.charCodeAt(0) === 0xfeff) val = val.slice(1);
  return [key, val];
}

export function loadProjectEnv({ rootDir = root } = {}) {
  const merged = {};
  for (const rel of [".env", ".env.local"]) {
    const p = join(rootDir, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      merged[parsed[0]] = parsed[1];
    }
  }
  for (const [key, val] of Object.entries(merged)) {
    process.env[key] = val;
  }
  return merged;
}

export function normalizeRailwayToken(raw) {
  let token = raw?.trim();
  if (!token) return "";
  if (token.startsWith("Bearer ")) token = token.slice(7).trim();
  if (token.charCodeAt(0) === 0xfeff) token = token.slice(1);
  return token.trim();
}

/** Chỉ giữ RAILWAY_TOKEN (project token) — xóa OAuth/API token tránh xung đột CLI. */
export function applyRailwayProjectTokenEnv() {
  loadProjectEnv();
  delete process.env.RAILWAY_API_TOKEN;
  const token = normalizeRailwayToken(process.env.RAILWAY_TOKEN);
  if (token) process.env.RAILWAY_TOKEN = token;
  else delete process.env.RAILWAY_TOKEN;
  return token;
}

export { root as projectRoot };
