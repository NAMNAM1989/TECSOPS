/** Phases of the explicit BugFixAgent state machine. */
export const WORKFLOW_PHASES = [
  "RECEIVED",
  "COLLECTING_CONTEXT",
  "REPRODUCING",
  "DIAGNOSING",
  "ROOT_CAUSE_IDENTIFIED",
  "IMPACT_ANALYSIS",
  "FIX_PLANNING",
  "IMPLEMENTING",
  "STATIC_CHECK",
  "TESTING",
  "RUNTIME_VERIFYING",
  "REGRESSION_CHECK",
  "RESOLVED",
] as const;

export const TERMINAL_PHASES = [
  "BLOCKED",
  "NEEDS_APPROVAL",
  "FAILED",
  "NEEDS_REVIEW",
] as const;

export const ALL_PHASES = [...WORKFLOW_PHASES, ...TERMINAL_PHASES] as const;

export type WorkflowPhase = (typeof WORKFLOW_PHASES)[number];
export type TerminalPhase = (typeof TERMINAL_PHASES)[number];
export type AgentPhase = (typeof ALL_PHASES)[number];

export type AgentStatus =
  | "IN_PROGRESS"
  | "RESOLVED"
  | "BLOCKED"
  | "NEEDS_APPROVAL"
  | "FAILED"
  | "NEEDS_REVIEW"
  | "REPRODUCTION_NOT_CONFIRMED";

export type Confidence = "LOW" | "MEDIUM" | "HIGH";
export type Risk = "LOW" | "MEDIUM" | "HIGH";
export type CheckResult = "PASS" | "FAIL" | "SKIP" | "NOT_RUN";

export type ToolPermission = "READ" | "WRITE" | "EXECUTE";

export type ToolName =
  | "fs.read"
  | "fs.write"
  | "fs.list"
  | "git.status"
  | "git.diff"
  | "git.log"
  | "logs.read"
  | "test.run"
  | "typecheck"
  | "lint"
  | "build"
  | "runtime.check"
  | "playwright.reproduce"
  | "playwright.verify"
  | "db.schema"
  | "db.read"
  | "terminal.exec";

export const AGENT_EVENT_TYPES = [
  "BUG_RECEIVED",
  "CONTEXT_COLLECTED",
  "REPRODUCTION_STARTED",
  "REPRODUCTION_CONFIRMED",
  "HYPOTHESIS_CREATED",
  "ROOT_CAUSE_IDENTIFIED",
  "FIX_PLAN_CREATED",
  "CODE_MODIFIED",
  "TEST_STARTED",
  "TEST_FAILED",
  "TEST_PASSED",
  "REGRESSION_CHECK",
  "BUG_RESOLVED",
  "BUG_BLOCKED",
] as const;

export type AgentEventType = (typeof AGENT_EVENT_TYPES)[number];

export type AgentEvent = {
  type: AgentEventType;
  at: string;
  message: string;
  data?: Record<string, unknown>;
};

export type BehaviorCase = {
  name: string;
  functionName: string;
  input: unknown[];
  expected: unknown;
};

export type Observation = BehaviorCase & {
  actual: unknown;
  passed: boolean;
  error?: string;
};

export type BugReport = {
  bug_id?: string;
  description: string;
  module?: string;
  files?: string[];
  reproduction_steps?: string[];
  expected?: string;
  actual?: string;
  cases?: BehaviorCase[];
  regression_cases?: BehaviorCase[];
  requested_operations?: string[];
  ui_workflow?: string[];
  base_url?: string;
  category?: "code" | "ui" | "ops" | "unknown";
};

export type FileEdit = {
  path: string;
  content: string;
  reason: string;
};

export type FixPlan = {
  strategy: string;
  files: FileEdit[];
  confidence: Confidence;
  risk: Risk;
  verification: string;
};

export type FixAttempt = {
  index: number;
  signature: string;
  strategy: string;
  files: string[];
  passed: boolean;
  evidence: string[];
};

export type RootCause = {
  summary: string;
  evidence: string[];
  confidence: Confidence;
  proven: boolean;
};

export type Hypothesis = {
  id: string;
  summary: string;
  confidence: Confidence;
  evidence: string[];
  suggestedExpr?: string;
  replaceFrom?: string;
  replaceTo?: string;
  targetFunction?: string;
  targetFile?: string;
};

export type ReproductionState = {
  confirmed: boolean;
  steps: string[];
  status: "CONFIRMED" | "REPRODUCTION_NOT_CONFIRMED" | "NOT_ATTEMPTED";
};

export type VerificationResults = {
  typecheck: CheckResult;
  lint: CheckResult;
  unit_tests: CheckResult;
  integration_tests: CheckResult;
  e2e: CheckResult;
  build: CheckResult;
  runtime: CheckResult;
  targeted: CheckResult;
};

export type BugFixOutput = {
  bug_id: string;
  status: AgentStatus;
  phase: AgentPhase;
  reproduction: {
    confirmed: boolean;
    steps: string[];
  };
  root_cause: {
    summary: string;
    evidence: string[];
    confidence: Confidence | "";
  };
  impact: {
    modules: string[];
    risk: Risk | "";
  };
  fix: {
    strategy: string;
    files_changed: string[];
  };
  verification: {
    typecheck: CheckResult | "";
    lint: CheckResult | "";
    unit_tests: CheckResult | "";
    integration_tests: CheckResult | "";
    e2e: CheckResult | "";
    build: CheckResult | "";
    runtime: CheckResult | "";
  };
  regression: {
    checked: boolean;
    result: string;
  };
  remaining_risks: string[];
  requires_approval: boolean;
};

export type BugRecord = {
  bug_id: string;
  timestamp: string;
  description: string;
  reproduction: ReproductionState;
  evidence: string[];
  module: string;
  root_cause: RootCause;
  confidence: Confidence | "";
  files_changed: string[];
  fix: string;
  tests: string[];
  verification: VerificationResults;
  regression: { checked: boolean; result: string };
  status: AgentStatus;
};

export type ErrorMonitorEvent = {
  source: "ERROR_MONITOR_AGENT";
  error_id: string;
  message: string;
  stack?: string;
  module?: string;
  file?: string;
  timestamp: string;
};

export type GitStatusEntry = {
  path: string;
  status: string;
};

export type GitStatus = {
  clean: boolean;
  entries: GitStatusEntry[];
};

export type ExecResult = {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
};

export type PlaywrightReproduceRequest = {
  baseUrl: string;
  workflow: string[];
  collectConsole?: boolean;
  collectNetwork?: boolean;
  expect?: string[];
};

export type PlaywrightEvidence = {
  ok: boolean;
  pageUrl?: string;
  console: Array<{ type: string; text: string }>;
  network: Array<{ url: string; status: number; method?: string }>;
  domErrors: string[];
  httpErrors: string[];
  notes: string[];
};

export type PlaywrightHost = {
  reproduce(req: PlaywrightReproduceRequest): Promise<PlaywrightEvidence>;
  verify(req: PlaywrightReproduceRequest): Promise<PlaywrightEvidence>;
};

export type FileHost = {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  list(dir?: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
};

export type GitHost = {
  status(): Promise<GitStatus>;
  diff(path?: string): Promise<string>;
  log(limit?: number): Promise<string>;
};

export type ExecHost = {
  run(command: string, args?: string[]): Promise<ExecResult>;
};

export type AgentHost = {
  now(): string;
  randomId(prefix?: string): string;
  fs: FileHost;
  git: GitHost;
  exec: ExecHost;
  playwright?: PlaywrightHost;
  runBehavior?(source: string, fnName: string, args: unknown[]): unknown;
};

export type SessionStore = {
  save(session: DebugSession): Promise<void>;
  load(sessionId: string): Promise<DebugSession | null>;
  loadByBugId(bugId: string): Promise<DebugSession | null>;
  list(): Promise<DebugSession[]>;
};

export type DebugSession = {
  session_id: string;
  bug_id: string;
  phase: AgentPhase;
  status: AgentStatus;
  created_at: string;
  updated_at: string;
  report: BugReport;
  events: AgentEvent[];
  attempts: FixAttempt[];
  hypotheses: Hypothesis[];
  observations: Observation[];
  dirty_at_start: string[];
  files_owned: string[];
  record: BugRecord;
  output: BugFixOutput;
  reproduction_not_confirmed: boolean;
};

export type AgentConfig = {
  maxFailedImplementations: number;
  autoImplementMinConfidence: Confidence;
  autoCommit: boolean;
  allowProtectedOps: boolean;
};

export type PlanContext = {
  report: BugReport;
  hypotheses: Hypothesis[];
  observations: Observation[];
  files: Record<string, string>;
  attempts: FixAttempt[];
};

export type AgentHooks = {
  planFix?: (ctx: PlanContext) => FixPlan | null;
};

export type BugFixAgentOptions = {
  host: AgentHost;
  store: SessionStore;
  config?: Partial<AgentConfig>;
  hooks?: AgentHooks;
  session?: DebugSession;
};
