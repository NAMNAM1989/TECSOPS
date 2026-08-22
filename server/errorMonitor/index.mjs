/**
 * Express adapter — fail-isolated collector.
 * Pipeline / handshake sống ở src/agents/errorMonitor (tsx / Vitest).
 * Runtime Node chỉ ghi ErrorMonitorEvent JSON, không sửa business source.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRateLimit } from "../httpSecurity.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function inboxDir() {
  return (
    process.env.ERROR_MONITOR_QUEUE_DIR?.trim() ||
    path.join(__dirname, "..", "..", ".tecsops", "error-monitor-agent", "inbox")
  );
}

function writeEvent(event) {
  try {
    const dir = inboxDir();
    fs.mkdirSync(dir, { recursive: true });
    const id = String(event.error_id || `err_${Date.now()}`);
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(event, null, 2));
    return id;
  } catch (err) {
    console.warn("[errorMonitor] persist isolated:", err?.message || err);
    return null;
  }
}

function toMonitorEvent(raw, extra = {}) {
  const message = String(raw?.message || raw?.error || extra.message || "Unknown error");
  return {
    source: "ERROR_MONITOR_AGENT",
    error_id: extra.error_id || `err_${Date.now().toString(16)}`,
    message: message.slice(0, 1500),
    stack: raw?.stack || raw?.stack_trace || extra.stack,
    module: raw?.module || extra.module || "http",
    file: extra.file,
    timestamp: new Date().toISOString(),
  };
}

let collected = 0;

export function getErrorMonitorAgent() {
  return { collected, inbox: inboxDir() };
}

export function reportExpressError(_agent, err, req) {
  try {
    collected += 1;
    writeEvent(
      toMonitorEvent(err, {
        module: "http",
        message: err?.message || "Internal Server Error",
        stack: err?.stack,
      }),
    );
    void req;
  } catch (monitorErr) {
    console.warn("[errorMonitor] express hook isolated:", monitorErr?.message || monitorErr);
  }
}

export function reportHealthFailure(_agent, err) {
  try {
    collected += 1;
    writeEvent(
      toMonitorEvent(err, {
        module: "db",
        message: err?.message || "Database unavailable",
        stack: err?.stack,
      }),
    );
  } catch (monitorErr) {
    console.warn("[errorMonitor] health hook isolated:", monitorErr?.message || monitorErr);
  }
}

export function registerErrorMonitor(app, { requireAuth = null } = {}) {
  try {
    const guard = typeof requireAuth === "function" ? requireAuth : (_req, _res, next) => next();
    const limit = createRateLimit({
      max: 120,
      windowMs: 60_000,
      error: "Quá nhiều sự kiện error-monitor.",
      code: "ERROR_MONITOR_RATE_LIMITED",
    });

    app.get("/api/error-monitor/health", (_req, res) => {
      res.json({
        ok: true,
        agent: "ERROR_MONITOR_AGENT",
        collected,
        inbox: inboxDir(),
        pipeline: "src/agents/errorMonitor",
        rule: "HTTP 200 alone is not HEALTHY — run npm run error-monitor to process inbox",
      });
    });

    app.get("/api/error-monitor/status", guard, (_req, res) => {
      res.json({ ok: true, agent: "ERROR_MONITOR_AGENT", collected, inbox: inboxDir() });
    });

    app.post("/api/error-monitor/events", guard, limit, (req, res) => {
      try {
        const body = req.body;
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          res.status(400).json({ ok: false, error: "Invalid JSON body" });
          return;
        }
        collected += 1;
        const id = writeEvent(toMonitorEvent(body));
        res.json({ ok: true, queued: Boolean(id), error_id: id, source: "ERROR_MONITOR_AGENT" });
      } catch {
        res.status(200).json({ ok: false, isolated: true });
      }
    });

    console.info("[errorMonitor] ERROR_MONITOR_AGENT collector /api/error-monitor/*");
    return getErrorMonitorAgent();
  } catch (err) {
    console.warn("[errorMonitor] register failed — app continues:", err?.message || err);
    return null;
  }
}

export function registerErrorMonitorRoutes(app, opts) {
  return registerErrorMonitor(app, opts);
}
