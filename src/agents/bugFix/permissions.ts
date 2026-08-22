import type { ToolName, ToolPermission } from "./types";

export type ToolDefinition = {
  name: ToolName;
  permission: ToolPermission;
  description: string;
};

export const TOOL_REGISTRY: readonly ToolDefinition[] = [
  { name: "fs.read", permission: "READ", description: "Read source or local files" },
  { name: "fs.list", permission: "READ", description: "List workspace files" },
  { name: "git.status", permission: "READ", description: "Inspect git working tree" },
  { name: "git.diff", permission: "READ", description: "Read git diffs" },
  { name: "git.log", permission: "READ", description: "Read recent git history" },
  { name: "logs.read", permission: "READ", description: "Read local logs (secrets redacted)" },
  { name: "db.schema", permission: "READ", description: "Read database schema" },
  { name: "db.read", permission: "READ", description: "Read-only database queries" },
  { name: "fs.write", permission: "WRITE", description: "Write source or tests" },
  { name: "test.run", permission: "EXECUTE", description: "Run targeted or suite tests" },
  { name: "typecheck", permission: "EXECUTE", description: "Run tsc -b" },
  { name: "lint", permission: "EXECUTE", description: "Run eslint" },
  { name: "build", permission: "EXECUTE", description: "Run production build" },
  { name: "runtime.check", permission: "EXECUTE", description: "Probe local runtime/health" },
  { name: "playwright.reproduce", permission: "EXECUTE", description: "Reproduce UI via Playwright" },
  { name: "playwright.verify", permission: "EXECUTE", description: "Verify UI workflow via Playwright" },
  { name: "terminal.exec", permission: "EXECUTE", description: "Run an allowlisted command" },
] as const;

export const TOOL_BY_NAME = new Map(TOOL_REGISTRY.map((tool) => [tool.name, tool]));

export const PROTECTED_OPERATION_PATTERNS: ReadonlyArray<{ id: string; re: RegExp; why: string }> = [
  { id: "prod_deploy", re: /\b(production\s+deploy|deploy:ship|railway\s+up|railway\s+deploy)\b/i, why: "Production deploy" },
  {
    id: "destructive_migrate",
    re: /\b(prisma\s+migrate\s+reset|migrate\s+reset|db\s+push[^.\n]*force-reset|--accept-data-loss|drop\s+database|drop\s+table)\b/i,
    why: "Destructive DB migration/reset",
  },
  {
    id: "delete_prod_data",
    re: /\b(delete\s+production\s+data|truncate\s+table|wipe\s+(prod|production)|destroy\s+production)\b/i,
    why: "Delete production data",
  },
  {
    id: "prod_env",
    re: /\b(production\s+env(\s+var)?|railway\s+variables?|modify\s+prod(uction)?\s+env)\b/i,
    why: "Modify production environment variables",
  },
  {
    id: "expose_secrets",
    re: /\b(expose\s+(secrets?|api\s*keys?|tokens?)|printenv|dump\s+secrets?)\b/i,
    why: "Expose secrets",
  },
  { id: "force_push", re: /\b(git\s+push\s+--force|force\s+push)\b/i, why: "Force push" },
  {
    id: "rewrite_history",
    re: /\b(git\s+rebase\s+-i|git\s+filter-repo|git\s+filter-branch|rewrite\s+(git\s+)?history)\b/i,
    why: "Rewrite git history",
  },
  {
    id: "weaken_auth",
    re: /\b(disable\s+auth|weaken\s+(auth|security)|skip\s+auth|bypass\s+(auth|security))\b/i,
    why: "Disable/weaken auth or security checks",
  },
];

export const SENSITIVE_KEY_RE =
  /password|passwd|secret|token|otp|api[_-]?key|authorization|credential|private[_-]?key|database_url/i;

export const PROTECTED_WRITE_PATH_RE =
  /(^|\/)\.env($|\.)|(^|\/)id_rsa|(^|\/)credentials|\.pem$|\.p12$|secrets?\./i;

export function detectProtectedOperations(text: string): string[] {
  const haystack = String(text || "");
  const hits: string[] = [];
  for (const rule of PROTECTED_OPERATION_PATTERNS) {
    if (rule.re.test(haystack)) hits.push(rule.why);
  }
  return unique(hits);
}

export function isProtectedWritePath(filePath: string): boolean {
  return PROTECTED_WRITE_PATH_RE.test(filePath.replace(/\\/g, "/"));
}

export function isWriteAllowedPath(filePath: string): boolean {
  if (isProtectedWritePath(filePath)) return false;
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.includes("node_modules/") || normalized.startsWith(".git/")) return false;
  return true;
}

export function commandLooksProtected(command: string, args: string[] = []): boolean {
  return detectProtectedOperations([command, ...args].join(" ")).length > 0;
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}
