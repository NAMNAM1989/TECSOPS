import {
  ALL_PHASES,
  TERMINAL_PHASES,
  WORKFLOW_PHASES,
  type AgentPhase,
  type TerminalPhase,
  type WorkflowPhase,
} from "./types";

const WORKFLOW_INDEX = new Map<WorkflowPhase, number>(
  WORKFLOW_PHASES.map((phase, index) => [phase, index]),
);

const ALLOWED_EXTRA: Partial<Record<AgentPhase, readonly AgentPhase[]>> = {
  RECEIVED: ["BLOCKED", "NEEDS_APPROVAL", "FAILED"],
  COLLECTING_CONTEXT: ["BLOCKED", "NEEDS_APPROVAL", "FAILED"],
  REPRODUCING: ["BLOCKED", "NEEDS_APPROVAL", "FAILED", "NEEDS_REVIEW"],
  DIAGNOSING: ["BLOCKED", "NEEDS_APPROVAL", "FAILED", "NEEDS_REVIEW", "REPRODUCING"],
  ROOT_CAUSE_IDENTIFIED: ["BLOCKED", "NEEDS_APPROVAL", "NEEDS_REVIEW", "FAILED"],
  IMPACT_ANALYSIS: ["BLOCKED", "NEEDS_APPROVAL", "NEEDS_REVIEW", "FAILED"],
  FIX_PLANNING: ["BLOCKED", "NEEDS_APPROVAL", "NEEDS_REVIEW", "FAILED"],
  IMPLEMENTING: ["BLOCKED", "NEEDS_APPROVAL", "FAILED", "NEEDS_REVIEW"],
  STATIC_CHECK: ["FAILED", "NEEDS_REVIEW", "DIAGNOSING"],
  TESTING: ["FAILED", "NEEDS_REVIEW", "DIAGNOSING", "STATIC_CHECK"],
  RUNTIME_VERIFYING: ["FAILED", "NEEDS_REVIEW", "DIAGNOSING"],
  REGRESSION_CHECK: ["FAILED", "NEEDS_REVIEW", "DIAGNOSING"],
  NEEDS_APPROVAL: ["FAILED", "BLOCKED"],
  NEEDS_REVIEW: ["FAILED", "BLOCKED", "DIAGNOSING"],
  BLOCKED: [],
  FAILED: [],
  RESOLVED: [],
};

export function isWorkflowPhase(phase: AgentPhase): phase is WorkflowPhase {
  return (WORKFLOW_PHASES as readonly string[]).includes(phase);
}

export function isTerminalPhase(phase: AgentPhase): phase is TerminalPhase {
  return (TERMINAL_PHASES as readonly string[]).includes(phase);
}

export function isKnownPhase(phase: string): phase is AgentPhase {
  return (ALL_PHASES as readonly string[]).includes(phase);
}

export function canTransition(from: AgentPhase, to: AgentPhase): boolean {
  if (from === to) return true;
  if (isTerminalPhase(from) && from !== "NEEDS_REVIEW" && from !== "NEEDS_APPROVAL") {
    return false;
  }
  if (ALLOWED_EXTRA[from]?.includes(to)) return true;
  if (isWorkflowPhase(from) && isWorkflowPhase(to)) {
    const a = WORKFLOW_INDEX.get(from);
    const b = WORKFLOW_INDEX.get(to);
    return a !== undefined && b !== undefined && b === a + 1;
  }
  return false;
}

export function assertTransition(from: AgentPhase, to: AgentPhase): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal BugFixAgent transition: ${from} → ${to}`);
  }
}

export function nextWorkflowPhase(phase: WorkflowPhase): WorkflowPhase | null {
  const index = WORKFLOW_INDEX.get(phase);
  if (index === undefined) return null;
  return WORKFLOW_PHASES[index + 1] ?? null;
}
