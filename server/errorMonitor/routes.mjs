/**
 * HTTP ingest / status — fail-isolated, không đụng mutation nghiệp vụ.
 */

import { createRateLimit } from "../httpSecurity.mjs";
import { AGENT_NAME } from "./constants.mjs";

export function registerErrorMonitorRoutes(app, { agent, requireAuth = null } = {}) {
  const limit = createRateLimit({
    max: Number(process.env.ERROR_MONITOR_RATE_LIMIT_MAX) > 0
      ? Number(process.env.ERROR_MONITOR_RATE_LIMIT_MAX)
      : 120,
    windowMs: 60_000,
    error: "Quá nhiều sự kiện error-monitor.",
    code: "ERROR_MONITOR_RATE_LIMITED",
  });

  const guard = typeof requireAuth === "function"
    ? requireAuth
    : (_req, _res, next) => next();

  app.get("/api/error-monitor/health", (_req, res) => {
    try {
      const snap = agent.health.snapshot();
      res.json({
        ok: true,
        agent: AGENT_NAME,
        overall: snap.overall,
        components: snap.components,
        rule: snap.rule,
      });
    } catch (err) {
      res.status(200).json({
        ok: false,
        isolated: true,
        agent: AGENT_NAME,
        error: String(err?.message || err),
      });
    }
  });

  app.get("/api/error-monitor/status", guard, (_req, res) => {
    try {
      res.json({ ok: true, ...agent.snapshot() });
    } catch (err) {
      res.status(500).json({ ok: false, isolated: true, error: String(err?.message || err) });
    }
  });

  app.post("/api/error-monitor/events", guard, limit, async (req, res) => {
    try {
      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        res.status(400).json({ ok: false, error: "Invalid JSON body" });
        return;
      }
      const result = await agent.ingest(body);
      res.json({
        ok: Boolean(result.ok),
        fingerprint: result.fingerprint || null,
        classification: result.classification || null,
        severity: result.severity || null,
        dispatched: Boolean(result.dispatched),
        bug_id: result.bug_report?.bug_id || null,
        incident_id: result.incident?.incident_id || null,
        occurrence_count: result.incident?.occurrence_count || 0,
      });
    } catch (err) {
      console.warn("[errorMonitor] route ingest isolated:", err?.message || err);
      res.status(200).json({ ok: false, isolated: true });
    }
  });

  app.post("/api/error-monitor/automation", guard, limit, async (req, res) => {
    try {
      const result = await agent.ingestAutomation(req.body || {});
      res.json({
        ok: Boolean(result.ok),
        classification: result.classification || null,
        subtype: result.subtype || null,
        bug_id: result.bug_report?.bug_id || null,
      });
    } catch {
      res.status(200).json({ ok: false, isolated: true });
    }
  });

  app.post("/api/error-monitor/fix-result", guard, (req, res) => {
    try {
      const result = agent.acceptFixResult(req.body || {});
      res.json(result);
    } catch {
      res.status(200).json({ ok: false, isolated: true });
    }
  });
}

/**
 * Gắn vào Express error middleware hiện có — không đổi payload response.
 */
export function reportExpressError(agent, err, req) {
  try {
    const status = Number(err?.statusCode || err?.status) || 500;
    void agent.ingest({
      source: "backend",
      service: "tecsops",
      module: "http",
      error_type: err?.name || "Error",
      message: err?.message || "Internal Server Error",
      stack_trace: err?.stack || "",
      http: {
        method: req?.method,
        status,
        path: req?.originalUrl || req?.url,
      },
      request_id: req?.get?.("x-request-id") || null,
      url: req?.originalUrl || req?.url,
    });
  } catch (monitorErr) {
    console.warn("[errorMonitor] express hook isolated:", monitorErr?.message || monitorErr);
  }
}

export function reportHealthFailure(agent, err) {
  try {
    void agent.ingest({
      source: "backend",
      service: "tecsops",
      module: "db",
      error_type: "DatabaseUnavailable",
      message: err?.message || "Database unavailable",
      stack_trace: err?.stack || "",
      http: { status: 503, path: "/api/health", method: "GET" },
    });
  } catch (monitorErr) {
    console.warn("[errorMonitor] health hook isolated:", monitorErr?.message || monitorErr);
  }
}
