/**
 * API AI Ops — Gemini báo cáo đề xuất nâng cấp.
 */

import { getGeminiModel, isGeminiConfigured } from "./geminiClient.mjs";
import { buildImprovementReport } from "./improvementReport.mjs";
import {
  countEventsSinceDays,
  ensureOpsAiEventsSchema,
  recordOpsAiEvent,
} from "./opsAiEventsStore.mjs";
import { getDbPool } from "../dbPool.mjs";

export function registerAiRoutes(app, { loadState }) {
  // Schema lazy khi có DB
  if (getDbPool()) {
    void ensureOpsAiEventsSchema().catch((e) =>
      console.warn("[ai] ensure schema:", e?.message || e)
    );
  }

  app.get("/api/ai/status", async (_req, res) => {
    try {
      const eventCount7d = await countEventsSinceDays(7);
      res.json({
        ok: true,
        configured: isGeminiConfigured(),
        model: getGeminiModel(),
        eventCount7d,
        provider: "gemini",
      });
    } catch (e) {
      console.error("[api/ai/status]", e);
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/ai/events", async (req, res) => {
    try {
      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        res.status(400).json({ ok: false, error: "Invalid JSON body" });
        return;
      }
      const result = await recordOpsAiEvent({
        action: body.action,
        source: body.source || "ui",
        meta: body.meta,
      });
      if (!result.ok && result.reason === "bad_action") {
        res.status(400).json({ ok: false, error: "action không hợp lệ" });
        return;
      }
      res.json({ ok: true, recorded: Boolean(result.ok) });
    } catch (e) {
      console.error("[api/ai/events]", e);
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/ai/improvement-report", async (req, res) => {
    try {
      if (!isGeminiConfigured()) {
        res.status(503).json({
          ok: false,
          error:
            "Chưa cấu hình GEMINI_API_KEY. Thêm vào .env.local (local) hoặc Railway Variables rồi restart.",
          code: "GEMINI_NOT_CONFIGURED",
        });
        return;
      }
      const days = Number(req.body?.days) || 7;
      const depthRaw = String(req.body?.depth || "deep").toLowerCase();
      const depth = depthRaw === "standard" ? "standard" : "deep";
      const out = await buildImprovementReport({ loadState, days, depth });
      res.json(out);
    } catch (e) {
      console.error("[api/ai/improvement-report]", e);
      const code = e?.code || "GEMINI_ERROR";
      const status =
        code === "GEMINI_NOT_CONFIGURED"
          ? 503
          : code === "GEMINI_QUOTA"
            ? 429
            : code === "GEMINI_TIMEOUT"
              ? 504
              : 500;
      res.status(status).json({
        ok: false,
        error: String(e?.message || e),
        code,
      });
    }
  });
}
