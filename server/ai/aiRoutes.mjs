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
import {
  askOps,
  draftEsidOtherRequest,
  explainAnomalyChecklist,
  explainSheetRows,
  parseBookingText,
  parseDimText,
  parseProfileImage,
  summarizeEndOfDay,
} from "./aiFeatures.mjs";

function aiErrorStatus(code) {
  if (code === "GEMINI_NOT_CONFIGURED") return 503;
  if (code === "GEMINI_QUOTA") return 429;
  if (code === "GEMINI_TIMEOUT") return 504;
  if (code === "INPUT_INVALID") return 400;
  return 500;
}

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

  const featureRoutes = [
    ["parse-booking-text", "ai_booking_parse", (body) => parseBookingText(body)],
    ["parse-profile-image", "ai_profile_image", (body) => parseProfileImage(body)],
    ["explain-sheet-rows", "ai_sheet_explain", (body) => explainSheetRows(body)],
    ["draft-esid-other-request", "ai_esid_other_request", (body) => draftEsidOtherRequest(body)],
    [
      "ops-ask",
      "ai_ops_ask",
      async (body) => askOps(body, await loadState()),
    ],
    ["anomaly-checklist", "ai_anomaly_checklist", (body) => explainAnomalyChecklist(body)],
    ["parse-dim-text", "ai_dim_parse", (body) => parseDimText(body)],
    [
      "end-of-day-summary",
      "ai_end_of_day",
      async (body) => summarizeEndOfDay(body, await loadState()),
    ],
  ];

  for (const [route, eventName, handler] of featureRoutes) {
    app.post(`/api/ai/${route}`, async (req, res) => {
      const startedAt = Date.now();
      void recordOpsAiEvent({
        action: `${eventName}_start`,
        source: "server",
        meta: {},
      });
      try {
        const result = await handler(req.body && typeof req.body === "object" ? req.body : {});
        void recordOpsAiEvent({
          action: `${eventName}_ok`,
          source: "server",
          meta: { durationMs: Date.now() - startedAt },
        });
        res.json({ ok: true, model: getGeminiModel(), result });
      } catch (error) {
        const rawCode = String(error?.code || "");
        const code = rawCode || (/^Thiếu|^Không có|^Ảnh phải/.test(String(error?.message || ""))
          ? "INPUT_INVALID"
          : "GEMINI_ERROR");
        console.error(`[api/ai/${route}]`, error);
        void recordOpsAiEvent({
          action: `${eventName}_fail`,
          source: "server",
          meta: { code, durationMs: Date.now() - startedAt },
        });
        res.status(aiErrorStatus(code)).json({
          ok: false,
          code,
          error:
            code === "GEMINI_NOT_CONFIGURED"
              ? "Chưa cấu hình GEMINI_API_KEY trên máy chủ."
              : code === "GEMINI_QUOTA"
                ? "Gemini đã hết quota hoặc đang giới hạn yêu cầu."
                : code === "GEMINI_TIMEOUT"
                  ? "Gemini phản hồi quá thời gian."
                  : code === "INPUT_INVALID"
                    ? String(error?.message || "Dữ liệu đầu vào không hợp lệ.")
                    : "Không tạo được draft AI.",
        });
      }
    });
  }
}
