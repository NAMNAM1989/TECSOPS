import { commandLooksProtected } from "./permissions";
import type { CheckResult, ExecHost } from "./types";

/** Maps verification steps to existing TECSOPS npm scripts. */
export const VERIFICATION_PIPELINE = [
  { id: "targeted", script: "test", args: [] as string[], optional: false },
  { id: "typecheck", script: "typecheck", args: [] as string[], optional: false },
  { id: "lint", script: "lint", args: [] as string[], optional: false },
  { id: "unit", script: "test", args: [] as string[], optional: true },
  { id: "e2e", script: "test:e2e", args: [] as string[], optional: true },
  { id: "build", script: "build", args: [] as string[], optional: true },
] as const;

export function npmScriptCommand(script: string): { command: string; args: string[] } {
  return { command: "npm", args: ["run", script] };
}

export async function runNpmCheck(exec: ExecHost, alias: string): Promise<CheckResult> {
  if (commandLooksProtected(alias)) return "FAIL";
  const result = await exec.run(alias);
  if (!result.ok) return "FAIL";
  if (/\bFAIL\b/.test(result.stdout) || /\bFAIL\b/.test(result.stderr)) return "FAIL";
  return "PASS";
}
