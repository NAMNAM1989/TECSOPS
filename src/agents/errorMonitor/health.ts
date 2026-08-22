import type { ErrorMonitorHost, HealthState } from "./types";

export type HealthComponent = {
  name: string;
  status: HealthState;
  detail: string;
  updated_at: string | null;
  samples: number;
};

const NAMES = ["frontend", "backend", "db", "workers", "automation"] as const;

export function createHealthMonitor(host: ErrorMonitorHost, opts: {
  staleMs: number;
  maxRestarts: number;
  restartFn?: ((info: { worker_id: string; attempt: number }) => void) | null;
  onEvent?: (type: string, payload: Record<string, unknown>) => void;
}) {
  const components = Object.fromEntries(
    NAMES.map((name) => [name, { name, status: "UNKNOWN" as HealthState, detail: "no_sample", updated_at: null, samples: 0 }]),
  ) as Record<(typeof NAMES)[number], HealthComponent>;
  const workers = new Map<string, { lastBeat: number; restarts: number; status: HealthState }>();

  function parseTs(iso: string): number {
    const n = Date.parse(iso);
    return Number.isFinite(n) ? n : 0;
  }

  function setComponent(name: (typeof NAMES)[number], status: HealthState, detail: string) {
    const prev = components[name];
    components[name] = {
      name,
      status,
      detail: String(detail || "").slice(0, 240),
      updated_at: host.now(),
      samples: (prev?.samples || 0) + 1,
    };
    if (prev && prev.status !== status) {
      opts.onEvent?.("HEALTH_CHANGED", { component: name, from: prev.status, to: status });
    }
  }

  function recordBackend(sample: { httpStatus?: number; postgres?: boolean; errorRate?: number }) {
    const httpOk = sample.httpStatus === 200;
    const dbOk = sample.postgres === true;
    const errorRate = Number(sample.errorRate || 0);
    if (!httpOk && !dbOk) setComponent("backend", "UNHEALTHY", "http+db down");
    else if (!dbOk) setComponent("backend", "DEGRADED", "db not confirmed");
    else if (errorRate > 0.05) setComponent("backend", "DEGRADED", `error_rate=${errorRate}`);
    else if (httpOk && dbOk && errorRate === 0) setComponent("backend", "HEALTHY", "http+db+low_errors");
    else setComponent("backend", "DEGRADED", "partial");
  }

  function recordDb(sample: { ok?: boolean; queryOk?: boolean; configured?: boolean; detail?: string }) {
    if (sample.ok === true && sample.queryOk === true) setComponent("db", "HEALTHY", sample.detail || "select 1 ok");
    else if (sample.configured === false) setComponent("db", "UNHEALTHY", "DATABASE_URL missing");
    else setComponent("db", "UNHEALTHY", sample.detail || "db unavailable");
  }

  function beatWorker(workerId: string) {
    const id = String(workerId || "default");
    const prev = workers.get(id) || { lastBeat: 0, restarts: 0, status: "UNKNOWN" as HealthState };
    workers.set(id, { ...prev, lastBeat: parseTs(host.now()), status: "HEALTHY" });
    refreshWorkers();
  }

  function refreshWorkers() {
    const ts = parseTs(host.now());
    let lost = 0;
    let healthy = 0;
    for (const [id, worker] of workers) {
      if (!worker.lastBeat || ts - worker.lastBeat > opts.staleMs) {
        lost += 1;
        if (worker.status !== "UNHEALTHY") opts.onEvent?.("WORKER_HEARTBEAT_LOST", { worker_id: id });
        worker.status = "UNHEALTHY";
        if (worker.restarts < opts.maxRestarts) {
          worker.restarts += 1;
          opts.onEvent?.("WORKER_RESTART_REQUESTED", { worker_id: id, attempt: worker.restarts, max: opts.maxRestarts });
          try {
            opts.restartFn?.({ worker_id: id, attempt: worker.restarts });
          } catch {
            /* fail-isolated */
          }
        } else {
          opts.onEvent?.("WORKER_RESTART_EXHAUSTED", { worker_id: id });
        }
      } else {
        healthy += 1;
        worker.status = "HEALTHY";
      }
    }
    if (!workers.size) setComponent("workers", "UNKNOWN", "no heartbeat registered");
    else if (lost && !healthy) setComponent("workers", "UNHEALTHY", "heartbeat lost");
    else if (lost) setComponent("workers", "DEGRADED", "partial heartbeat loss");
    else setComponent("workers", "HEALTHY", "heartbeats fresh");
    return { lost, healthy };
  }

  function snapshot() {
    refreshWorkers();
    const statuses = NAMES.map((name) => components[name].status);
    let overall: HealthState = "UNKNOWN";
    if (statuses.includes("UNHEALTHY")) overall = "UNHEALTHY";
    else if (statuses.includes("DEGRADED")) overall = "DEGRADED";
    else if (statuses.every((status) => status === "HEALTHY")) overall = "HEALTHY";
    else if (statuses.some((status) => status === "HEALTHY")) overall = "DEGRADED";
    return { overall, components: { ...components }, workers: Object.fromEntries(workers), rule: "HTTP 200 alone is not HEALTHY" };
  }

  return { recordBackend, recordDb, beatWorker, refreshWorkers, snapshot, components, workers };
}

export function trackAutomationRun(raw: Record<string, unknown>) {
  const steps = Array.isArray(raw.steps)
    ? raw.steps.map((item, index) => {
        const step = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        return {
          index,
          name: String(step.name || step.step || `step_${index}`).slice(0, 80),
          status: String(step.status || "unknown").slice(0, 32),
          page_url: (step.page_url as string) || null,
          selector: (step.selector as string) || null,
          screenshot: (step.screenshot as string) || null,
          error: (step.error as string) || null,
        };
      })
    : [];
  const failed = steps.find((step) => step.status === "failed" || step.error);
  return {
    automation_id: (raw.automation_id || raw.id || null) as string | null,
    run_id: (raw.run_id || null) as string | null,
    workflow: String(raw.workflow || "unknown"),
    source: String(raw.source || "automation"),
    steps,
    failed_step: failed || null,
    page_url: (raw.page_url as string) || failed?.page_url || null,
    screenshot: (raw.screenshot as string) || failed?.screenshot || null,
    console_errors: Array.isArray(raw.console_errors) ? raw.console_errors.map(String) : [],
    network_errors: Array.isArray(raw.network_errors) ? raw.network_errors.map(String) : [],
  };
}

export function automationRawEvent(run: ReturnType<typeof trackAutomationRun>, extra: Record<string, unknown> = {}) {
  const failed = run.failed_step;
  return {
    source: run.source || "playwright",
    service: "tecsops",
    module: extra.module || `automation:${run.workflow}`,
    error_type: extra.error_type || "TimeoutError",
    message:
      extra.message ||
      failed?.error ||
      (failed?.selector ? `Timeout waiting for locator('${failed.selector}')` : "Automation run failed"),
    url: run.page_url,
    automation: {
      automation_id: run.automation_id,
      run_id: run.run_id,
      workflow: run.workflow,
      step: failed?.name,
      selector: failed?.selector || extra.selector,
      page_url: run.page_url,
      screenshot: run.screenshot,
      console_errors: run.console_errors,
      network_errors: run.network_errors,
    },
    metadata: { steps: run.steps },
  };
}
