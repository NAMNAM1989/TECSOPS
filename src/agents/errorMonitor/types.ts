import type { BugFixOutput, BugReport, ErrorMonitorEvent } from "../bugFix/types";

export const ERROR_CLASSES = [
  "SOFTWARE_ERROR",
  "BUSINESS_VALIDATION",
  "USER_INPUT_ERROR",
  "EXTERNAL_SERVICE_ERROR",
  "INFRASTRUCTURE_ERROR",
  "AUTOMATION_ERROR",
  "SECURITY_EVENT",
  "UNKNOWN",
] as const;

export type ErrorClass = (typeof ERROR_CLASSES)[number];

export const AUTOMATION_SUBTYPES = [
  "EXTERNAL_UI_CHANGE",
  "OUR_CODE_BUG",
  "WORKFLOW_TIMEOUT",
  "EXT_PROTOCOL",
] as const;

export type AutomationSubtype = (typeof AUTOMATION_SUBTYPES)[number];

export const SEVERITIES = ["SEV-0", "SEV-1", "SEV-2", "SEV-3", "SEV-4"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const INCIDENT_STATUSES = [
  "OPEN",
  "DISPATCHED",
  "IN_PROGRESS",
  "FIXED_PENDING_OBSERVATION",
  "RESOLVED",
  "REGRESSION",
  "HUMAN_REVIEW_REQUIRED",
  "SUPPRESSED_VALIDATION",
] as const;

export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const HEALTH_STATES = ["HEALTHY", "DEGRADED", "UNHEALTHY", "UNKNOWN"] as const;
export type HealthState = (typeof HEALTH_STATES)[number];

export const OBS_EVENTS = [
  "ERROR_DETECTED",
  "FINGERPRINT_CREATED",
  "INCIDENT_OPENED",
  "INCIDENT_UPDATED",
  "BUG_DISPATCHED",
  "BUG_DISPATCH_SKIPPED",
  "FIX_RESULT_ACCEPTED",
  "POST_FIX_OBSERVATION_STARTED",
  "REGRESSION_DETECTED",
  "INCIDENT_RESOLVED",
  "HUMAN_REVIEW_REQUIRED",
  "REPEATED_FIX_FAILURE",
  "WORKER_HEARTBEAT_LOST",
  "WORKER_RESTART_REQUESTED",
  "WORKER_RESTART_EXHAUSTED",
  "HEALTH_CHANGED",
  "SECRET_REDACTED",
  "LLM_SKIPPED",
  "LLM_CALLED",
  "STORM_AGGREGATED",
  "RATE_LIMITED",
  "ESCALATED",
] as const;

export type ObsEventType = (typeof OBS_EVENTS)[number];

export type HttpInfo = {
  method?: string | null;
  status?: number | null;
  path?: string | null;
  route?: string | null;
};

export type AutomationInfo = {
  automation_id?: string | null;
  run_id?: string | null;
  workflow?: string | null;
  step?: string | null;
  selector?: string | null;
  page_url?: string | null;
  screenshot?: string | null;
  console_errors?: string[];
  network_errors?: string[];
};

export type NormalizedErrorEvent = {
  event_id: string;
  timestamp: string;
  environment: string;
  source: string;
  service: string;
  module: string;
  error_type: string;
  message: string;
  stack_trace: string | null;
  request_id: string | null;
  trace_id: string | null;
  user_flow: string | null;
  url: string | null;
  http: HttpInfo;
  job_id: string | null;
  automation: AutomationInfo | null;
  browser: string | null;
  release: string | null;
  git_commit: string | null;
  collected_by: "ERROR_MONITOR_AGENT";
  metadata: Record<string, unknown>;
};

export type Classification = {
  classification: ErrorClass;
  subtype: AutomationSubtype | null;
  confidence: number;
  reason: string;
  via?: "rule" | "llm";
};

export type MonitorIncident = {
  incident_id: string;
  fingerprint: string;
  status: IncidentStatus;
  classification: ErrorClass;
  subtype: AutomationSubtype | null;
  severity: Severity;
  first_seen: string;
  last_seen: string;
  occurrence_count: number;
  dispatch_count: number;
  fix_attempt_count: number;
  bug_id: string | null;
  correlated_ids: string[];
  recent_events: Array<{ event_id: string; timestamp: string; message: string; http: HttpInfo }>;
  first_event: NormalizedErrorEvent;
  last_event: NormalizedErrorEvent;
  observation_started_at?: string;
  reopened_at?: string;
  resolved_at?: string;
  last_notification_at?: string;
};

export type InternalBugReport = {
  schema_version: string;
  bug_id: string;
  incident_id: string;
  fingerprint: string;
  created_by: "ERROR_MONITOR_AGENT";
  created_at: string;
  severity: Severity;
  classification: ErrorClass;
  subtype: AutomationSubtype | null;
  status: IncidentStatus | "OPEN";
  summary: string;
  first_seen: string;
  last_seen: string;
  occurrence_count: number;
  affected: {
    service: string;
    module: string;
    environment: string;
    user_flow: string | null;
    url: string | null;
  };
  error: {
    type: string;
    message: string;
    stack_trace: string | null;
    http: HttpInfo;
  };
  reproduction_context: Record<string, unknown>;
  evidence: Record<string, unknown>;
  suspected_area: string;
  monitor_analysis: {
    probable_cause: string;
    confidence: number;
    classification_reason: string;
    classification_confidence: number;
    note: string;
  };
  requires_immediate_action: boolean;
  correlated_incident_ids: string[];
  error_monitor_event?: ErrorMonitorEvent;
  bug_fix_report?: BugReport;
  fix_result?: {
    status: string;
    root_cause?: string | null;
    remaining_risk?: string | null;
    received_at: string;
  };
};

export type IngestResult = {
  ok: boolean;
  isolated?: boolean;
  error?: string;
  event?: NormalizedErrorEvent;
  fingerprint?: string;
  classification?: ErrorClass;
  subtype?: AutomationSubtype | null;
  severity?: Severity;
  incident?: MonitorIncident;
  bug_report?: InternalBugReport | null;
  dispatched?: boolean;
  storm?: boolean;
  redacted_count?: number;
  monitor_event?: ErrorMonitorEvent;
};

export type ErrorMonitorHost = {
  now(): string;
  randomId(prefix?: string): string;
  persist?(kind: "outbox" | "session" | "event", id: string, payload: unknown): void | Promise<void>;
};

export type RunBugFixFn = (report: BugReport, event: ErrorMonitorEvent) => Promise<BugFixOutput> | BugFixOutput;

export type ErrorMonitorConfig = {
  observationWindowMs: number;
  correlationWindowMs: number;
  stormWindowMs: number;
  stormThreshold: number;
  llmMaxCallsPerWindow: number;
  maxFixAttempts: number;
  maxWorkerRestarts: number;
  workerStaleMs: number;
  maxStoredEventsPerIncident: number;
  service: string;
};

export type LlmClassifyFn = (ctx: {
  event: NormalizedErrorEvent;
  rule: Classification;
}) => Promise<Partial<Classification> | null> | Partial<Classification> | null;

export type ErrorMonitorOptions = {
  host: ErrorMonitorHost;
  config?: Partial<ErrorMonitorConfig>;
  environment?: string;
  release?: string;
  git_commit?: string;
  llmClassifyFn?: LlmClassifyFn | null;
  runBugFix?: RunBugFixFn | null;
  workerRestartFn?: ((info: { worker_id: string; attempt: number }) => void) | null;
};

export const DEFAULT_CONFIG: ErrorMonitorConfig = {
  observationWindowMs: 30 * 60 * 1000,
  correlationWindowMs: 5 * 60 * 1000,
  stormWindowMs: 10_000,
  stormThreshold: 200,
  llmMaxCallsPerWindow: 8,
  maxFixAttempts: 3,
  maxWorkerRestarts: 3,
  workerStaleMs: 45_000,
  maxStoredEventsPerIncident: 20,
  service: "tecsops",
};

export const AGENT_NAME = "ERROR_MONITOR_AGENT" as const;
export const SCHEMA_VERSION = "1.0.0";
