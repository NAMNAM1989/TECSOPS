/**
 * Public API ERROR_MONITOR_AGENT — đăng ký fail-isolated vào Express.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_NAME } from "./constants.mjs";
import { createErrorMonitorAgent } from "./agent.mjs";
import {
  registerErrorMonitorRoutes,
  reportExpressError,
  reportHealthFailure,
} from "./routes.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let singleton = null;

export function defaultQueueDir() {
  return (
    process.env.ERROR_MONITOR_QUEUE_DIR?.trim() ||
    path.join(__dirname, "..", "data", "error-monitor")
  );
}

export function getErrorMonitorAgent() {
  return singleton;
}

export function createOrGetErrorMonitorAgent(options = {}) {
  if (singleton && !options.fresh) return singleton;
  singleton = createErrorMonitorAgent({
    environment: process.env.NODE_ENV || "development",
    release: process.env.RAILWAY_GIT_COMMIT || process.env.npm_package_version || null,
    git_commit: process.env.RAILWAY_GIT_COMMIT || null,
    queueDir: options.queueDir === undefined ? defaultQueueDir() : options.queueDir,
    ...options,
  });
  return singleton;
}

/**
 * @param {import("express").Express} app
 * @param {{ requireAuth?: Function, agent?: ReturnType<typeof createErrorMonitorAgent> }} [opts]
 */
export function registerErrorMonitor(app, opts = {}) {
  try {
    const agent = opts.agent || createOrGetErrorMonitorAgent();
    registerErrorMonitorRoutes(app, {
      agent,
      requireAuth: opts.requireAuth || null,
    });
    console.info(`[errorMonitor] ${AGENT_NAME} routes /api/error-monitor/*`);
    return agent;
  } catch (err) {
    console.warn("[errorMonitor] register failed — app continues:", err?.message || err);
    return null;
  }
}

export {
  AGENT_NAME,
  createErrorMonitorAgent,
  registerErrorMonitorRoutes,
  reportExpressError,
  reportHealthFailure,
};
