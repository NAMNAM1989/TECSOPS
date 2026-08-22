export { BugFixAgent, commentOnlyPlan, normalizeInput, runBugFixAgent } from "./agent";
export { alreadyAttempted, attemptSignature, consecutiveFailures, detectOscillation } from "./antiLoop";
export { applyHypothesis, diagnose, observationsFromCases } from "./diagnoser";
export { createMemoryHost, createMemoryPlaywright } from "./host";
export { createEvent, redactSecrets, StructuredLogger } from "./logger";
export { bugReportFromMonitorEvent } from "./monitor";
export {
  commandLooksProtected,
  detectProtectedOperations,
  isProtectedWritePath,
  PROTECTED_OPERATION_PATTERNS,
  TOOL_REGISTRY,
} from "./permissions";
export { createMemorySessionStore, findSimilarBugs } from "./persistence";
export { assertTransition, canTransition, isTerminalPhase, isWorkflowPhase } from "./phases";
export { PLAYWRIGHT_NPM_SCRIPTS, playwrightRequestFromReport } from "./playwright";
export { executeExportedFunction, replaceReturnExpr } from "./sourceExec";
export { BUG_FIX_AGENT_SYSTEM_PROMPT, SYSTEM_PROMPT_PRINCIPLES } from "./systemPrompt";
export { npmScriptCommand, runNpmCheck, VERIFICATION_PIPELINE } from "./verifier";
export type {
  AgentPhase,
  AgentStatus,
  BugFixOutput,
  BugRecord,
  BugReport,
  DebugSession,
  ErrorMonitorEvent,
  Hypothesis,
} from "./types";
