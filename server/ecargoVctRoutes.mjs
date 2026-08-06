/**
 * API eCargo: chờ OTP IMAP + lưu / đọc kết quả VCT + QR.
 */

import {
  emptyEcargoVctResultsStore,
  normalizeEcargoVctResult,
  normalizeEcargoVctResultsStore,
} from "../shared/ecargoVctResultsNormalize.mjs";
import {
  ecargoImapConfigured,
  findEcargoResultMail,
  getEcargoImapStatus,
  testEcargoImapConnection,
  waitForEcargoOtp,
} from "./ecargoImapOtp.mjs";

const recentOtpWait = new Map(); // key → ts (chỉ sau khi wait thành công)
const RATE_MS = 2_500;

function rateKey(email) {
  return String(email || "")
    .trim()
    .toLowerCase()
    .slice(0, 120);
}

export function registerEcargoVctRoutes(app, { runMutation, loadState, io }) {
  app.get("/api/ecargo/otp/status", (_req, res) => {
    res.json({
      ok: true,
      ...getEcargoImapStatus(),
    });
  });

  /** Connect IMAP + mở mailbox — không đọc/trả OTP hay body mail. */
  app.post("/api/ecargo/otp/test", async (_req, res) => {
    try {
      if (!ecargoImapConfigured()) {
        res.status(503).json({
          ok: false,
          error: "IMAP_NOT_CONFIGURED",
          message:
            "Chưa cấu hình ECARGO_IMAP_USER / ECARGO_IMAP_PASS trên server (Railway Variables hoặc .env)",
        });
        return;
      }
      const hit = await testEcargoImapConnection();
      res.json({
        ok: true,
        message: `IMAP OK — ${hit.userHint} @ ${hit.host} / ${hit.mailbox}`,
        host: hit.host,
        mailbox: hit.mailbox,
        userHint: hit.userHint,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e || "IMAP test failed");
      const code =
        e && typeof e === "object" && "code" in e ? String(e.code || "") : "";
      console.error("[ecargo/otp/test]", message);
      res.status(code === "IMAP_NOT_CONFIGURED" ? 503 : 502).json({
        ok: false,
        error: code || "IMAP_TEST_FAILED",
        message,
      });
    }
  });

  app.post("/api/ecargo/otp/wait", async (req, res) => {
    try {
      if (!ecargoImapConfigured()) {
        res.status(503).json({
          ok: false,
          error: "IMAP_NOT_CONFIGURED",
          message:
            "Chưa cấu hình ECARGO_IMAP_USER / ECARGO_IMAP_PASS trên server",
        });
        return;
      }
      const email = String(req.body?.email || "").trim();
      const sinceIso = String(req.body?.sinceIso || "").trim();
      const awbHint = req.body?.awbHint
        ? String(req.body.awbHint).trim()
        : undefined;
      const timeoutMs = Number(req.body?.timeoutMs) || undefined;
      if (!email || !sinceIso) {
        res.status(400).json({
          ok: false,
          error: "BAD_REQUEST",
          message: "Cần email và sinceIso",
        });
        return;
      }
      const rk = rateKey(email);
      const last = recentOtpWait.get(rk) || 0;
      if (Date.now() - last < RATE_MS) {
        res.status(429).json({
          ok: false,
          error: "RATE_LIMIT",
          message: "Đợi vài giây rồi gọi lại OTP wait",
        });
        return;
      }

      const hit = await waitForEcargoOtp({
        email,
        sinceIso,
        awbHint,
        timeoutMs,
      });
      // Chỉ rate-limit sau thành công — timeout/lỗi được gọi lại ngay
      recentOtpWait.set(rk, Date.now());
      console.info(
        "[ecargo/otp] got code len=%s hasUrl=%s subject=%s",
        hit.code?.length || hit.otp?.length || 0,
        Boolean(hit.verifyUrl),
        hit.subject || ""
      );
      res.json({
        ok: true,
        otp: hit.otp || hit.code,
        code: hit.code || hit.otp,
        verifyUrl: hit.verifyUrl || "",
        vctCode: hit.vctCode || "",
        subject: hit.subject,
        receivedAt: hit.receivedAt,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e || "OTP failed");
      console.error("[ecargo/otp/wait]", message);
      res.status(504).json({ ok: false, error: "OTP_TIMEOUT", message });
    }
  });

  app.post("/api/ecargo/result-from-mail", async (req, res) => {
    try {
      if (!ecargoImapConfigured()) {
        res.status(503).json({
          ok: false,
          error: "IMAP_NOT_CONFIGURED",
          message: "Chưa cấu hình IMAP eCargo",
        });
        return;
      }
      const email = String(req.body?.email || "").trim();
      const sinceIso = String(req.body?.sinceIso || "").trim();
      if (!email || !sinceIso) {
        res.status(400).json({
          ok: false,
          error: "BAD_REQUEST",
          message: "Cần email và sinceIso",
        });
        return;
      }
      const hit = await findEcargoResultMail({ email, sinceIso });
      if (!hit) {
        res.status(404).json({
          ok: false,
          error: "NOT_FOUND",
          message: "Không thấy email kết quả eCargo",
        });
        return;
      }
      res.json({ ok: true, ...hit });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ ok: false, error: "MAIL_RESULT_FAILED", message });
    }
  });

  app.post("/api/ecargo/vct-result", async (req, res) => {
    try {
      const body = req.body || {};
      const shipmentIds = Array.isArray(body.shipmentIds)
        ? body.shipmentIds.map((x) => String(x || "").trim()).filter(Boolean)
        : [];
      if (!shipmentIds.length) {
        res.status(400).json({
          ok: false,
          error: "BAD_REQUEST",
          message: "Thiếu shipmentIds",
        });
        return;
      }
      const status = String(body.status || "done").toLowerCase();
      const result = normalizeEcargoVctResult({
        status: status === "error" ? "error" : status === "otp" ? "otp" : status === "pending" ? "pending" : "done",
        vctCode: body.vctCode,
        qrDataUrl: body.qrDataUrl || body.qrUrl || "",
        registeredAt: body.registeredAt || new Date().toISOString(),
        error: body.error || "",
        awb: body.awb || "",
      });
      if (!result) {
        res.status(400).json({
          ok: false,
          error: "BAD_RESULT",
          message: "Kết quả VCT không hợp lệ",
        });
        return;
      }

      const state = await loadState();
      const rows = Array.isArray(state?.rows) ? state.rows : [];
      const byId = new Map(rows.map((r) => [String(r?.id || ""), r]));
      // eCargo độc lập — chỉ gắn kết quả cho lô kho SCSC (không TECS-SCSC / TCS).
      const allowedIds = shipmentIds.filter((id) => {
        const row = byId.get(id);
        return row && String(row.warehouse || "") === "SCSC";
      });
      if (!allowedIds.length) {
        res.status(400).json({
          ok: false,
          error: "NOT_SCSC",
          message: "eCargo chỉ lưu kết quả cho lô kho SCSC",
        });
        return;
      }

      const store = normalizeEcargoVctResultsStore(
        state.ecargoVctResultsStore || emptyEcargoVctResultsStore()
      );
      for (const id of allowedIds) {
        store.byShipmentId[id] = {
          ...result,
          awb: result.awb || store.byShipmentId[id]?.awb || "",
        };
      }
      store.updatedAt = new Date().toISOString();

      const next = await runMutation({
        action: "SET_ECARGO_VCT_RESULTS_STORE",
        store,
      });
      io?.emit("sync", next);
      res.json({
        ok: true,
        store: next.ecargoVctResultsStore,
        shipmentIds: allowedIds,
        skippedIds: shipmentIds.filter((id) => !allowedIds.includes(id)),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[ecargo/vct-result]", message);
      res.status(400).json({ ok: false, error: "SAVE_FAILED", message });
    }
  });

  app.get("/api/ecargo/vct-result/:shipmentId", async (req, res) => {
    try {
      const id = String(req.params.shipmentId || "").trim();
      const state = await loadState();
      const store = normalizeEcargoVctResultsStore(
        state.ecargoVctResultsStore || emptyEcargoVctResultsStore()
      );
      const hit = store.byShipmentId[id];
      if (!hit) {
        res.status(404).json({ ok: false, error: "NOT_FOUND" });
        return;
      }
      res.json({ ok: true, shipmentId: id, result: hit });
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: "LOAD_FAILED",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  });
}
