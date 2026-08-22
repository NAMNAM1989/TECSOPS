/**
 * HealthMonitor — HEALTHY/DEGRADED/UNHEALTHY/UNKNOWN.
 * Không kết luận HEALTHY chỉ vì HTTP 200.
 * Worker heartbeat mất → WORKER_HEARTBEAT_LOST, restart có trần.
 */

import { DEFAULTS, HEALTH, HEALTH_COMPONENTS, OBS_EVENTS } from "./constants.mjs";

export function createHealthMonitor({
  now = () => Date.now(),
  staleMs = DEFAULTS.workerStaleMs,
  maxRestarts = DEFAULTS.maxWorkerRestarts,
  restartFn = null,
  observability = null,
} = {}) {
  const components = Object.fromEntries(
    HEALTH_COMPONENTS.map((name) => [
      name,
      { name, status: HEALTH.UNKNOWN, detail: "no_sample", updated_at: null, samples: 0 },
    ]),
  );
  /** @type {Map<string, { lastBeat: number, restarts: number, status: string }>} */
  const workers = new Map();

  function setComponent(name, status, detail) {
    const prev = components[name];
    components[name] = {
      name,
      status,
      detail: String(detail || "").slice(0, 240),
      updated_at: new Date(now()).toISOString(),
      samples: (prev?.samples || 0) + 1,
    };
    if (prev && prev.status !== status) {
      observability?.emit(OBS_EVENTS.HEALTH_CHANGED, { component: name, from: prev.status, to: status });
    }
  }

  function recordBackend(sample) {
    const httpOk = sample.httpStatus === 200;
    const dbOk = sample.postgres === true;
    const errorRate = Number(sample.errorRate || 0);
    if (!httpOk && !dbOk) setComponent("backend", HEALTH.UNHEALTHY, "http+db down");
    else if (!dbOk) setComponent("backend", HEALTH.DEGRADED, "db not confirmed");
    else if (errorRate > 0.05) setComponent("backend", HEALTH.DEGRADED, `error_rate=${errorRate}`);
    else if (httpOk && dbOk && errorRate === 0) setComponent("backend", HEALTH.HEALTHY, "http+db+low_errors");
    else setComponent("backend", HEALTH.DEGRADED, "partial");
  }

  function recordDb(sample) {
    if (sample.ok === true && sample.queryOk === true) {
      setComponent("db", HEALTH.HEALTHY, sample.detail || "select 1 ok");
    } else if (sample.configured === false) {
      setComponent("db", HEALTH.UNHEALTHY, "DATABASE_URL missing");
    } else {
      setComponent("db", HEALTH.UNHEALTHY, sample.detail || "db unavailable");
    }
  }

  function recordFrontend(sample) {
    const assetOk = sample.indexHtml === true && sample.mainJs !== false;
    const clientErrors = Number(sample.clientErrorRate || 0);
    if (!assetOk) setComponent("frontend", HEALTH.UNHEALTHY, "static assets missing");
    else if (clientErrors > 0.08) setComponent("frontend", HEALTH.DEGRADED, "client errors");
    else setComponent("frontend", HEALTH.HEALTHY, "assets+low_client_errors");
  }

  function recordAutomation(sample) {
    if (sample.lastRunOk === true && sample.extOnline !== false) {
      setComponent("automation", HEALTH.HEALTHY, sample.detail || "last run ok");
    } else if (sample.lastRunOk === false) {
      setComponent("automation", HEALTH.DEGRADED, sample.detail || "last run failed");
    } else {
      setComponent("automation", HEALTH.UNKNOWN, sample.detail || "no run");
    }
  }

  function beatWorker(workerId, meta = {}) {
    const id = String(workerId || "default");
    const prev = workers.get(id) || { lastBeat: 0, restarts: 0, status: HEALTH.UNKNOWN };
    workers.set(id, { ...prev, lastBeat: now(), status: HEALTH.HEALTHY, meta });
    refreshWorkers();
  }

  function refreshWorkers() {
    const ts = now();
    let lost = 0;
    let healthy = 0;
    for (const [id, w] of workers) {
      if (!w.lastBeat || ts - w.lastBeat > staleMs) {
        lost += 1;
        if (w.status !== HEALTH.UNHEALTHY) {
          observability?.emit(OBS_EVENTS.WORKER_HEARTBEAT_LOST, { worker_id: id });
        }
        w.status = HEALTH.UNHEALTHY;
        if (w.restarts < maxRestarts) {
          w.restarts += 1;
          observability?.emit(OBS_EVENTS.WORKER_RESTART_REQUESTED, {
            worker_id: id,
            attempt: w.restarts,
            max: maxRestarts,
          });
          try {
            restartFn?.({ worker_id: id, attempt: w.restarts });
          } catch {
            /* fail-isolated */
          }
        } else {
          observability?.emit(OBS_EVENTS.WORKER_RESTART_EXHAUSTED, { worker_id: id });
        }
      } else {
        healthy += 1;
        w.status = HEALTH.HEALTHY;
      }
    }
    if (!workers.size) setComponent("workers", HEALTH.UNKNOWN, "no heartbeat registered");
    else if (lost && !healthy) setComponent("workers", HEALTH.UNHEALTHY, "heartbeat lost");
    else if (lost) setComponent("workers", HEALTH.DEGRADED, "partial heartbeat loss");
    else setComponent("workers", HEALTH.HEALTHY, "heartbeats fresh");
    return { lost, healthy };
  }

  function snapshot() {
    refreshWorkers();
    const statuses = HEALTH_COMPONENTS.map((n) => components[n].status);
    let overall = HEALTH.UNKNOWN;
    if (statuses.includes(HEALTH.UNHEALTHY)) overall = HEALTH.UNHEALTHY;
    else if (statuses.includes(HEALTH.DEGRADED)) overall = HEALTH.DEGRADED;
    else if (statuses.every((s) => s === HEALTH.HEALTHY)) overall = HEALTH.HEALTHY;
    else if (statuses.some((s) => s === HEALTH.HEALTHY)) overall = HEALTH.DEGRADED;
    return {
      overall,
      components: { ...components },
      workers: Object.fromEntries(workers),
      rule: "HTTP 200 alone is not HEALTHY",
    };
  }

  return {
    recordBackend,
    recordDb,
    recordFrontend,
    recordAutomation,
    beatWorker,
    refreshWorkers,
    snapshot,
    components,
    workers,
  };
}
