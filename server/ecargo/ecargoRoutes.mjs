import { randomUUID } from "node:crypto";
import {
  buildEcargoBookingFromShipment,
  getEcargoRegisterReadiness,
  normalizeVehicleNo,
} from "./ecargoPayload.mjs";
import { enqueueEcargoJob, getEcargoJob, isEcargoJobActive, newEcargoJobId } from "./ecargoJobStore.mjs";

/**
 * @param {import('express').Express} app
 * @param {{ redisClient: import('redis').RedisClientType | null, loadState: () => Promise<object>, io?: import('socket.io').Server }} deps
 */
export function registerEcargoRoutes(app, deps) {
  app.get("/api/ecargo/jobs/:shipmentId", async (req, res) => {
    try {
      if (!deps.redisClient) {
        res.status(503).json({ error: "eCargo worker cần Redis (REDIS_URL)." });
        return;
      }
      const job = await getEcargoJob(deps.redisClient, req.params.shipmentId);
      res.json({ job });
    } catch (e) {
      res.status(500).json({ error: String(e?.message ?? e) });
    }
  });

  app.post("/api/ecargo/jobs", async (req, res) => {
    try {
      if (!deps.redisClient) {
        res.status(503).json({ error: "eCargo worker cần Redis (REDIS_URL)." });
        return;
      }

      const body = req.body;
      if (!body || typeof body !== "object") {
        res.status(400).json({ error: "Invalid JSON body" });
        return;
      }

      const shipmentId = String(body.shipmentId ?? "").trim();
      const viewSessionYmd = String(body.viewSessionYmd ?? "").trim();
      let vehicleNo = normalizeVehicleNo(String(body.vehicleNo ?? ""));

      if (!shipmentId || !viewSessionYmd) {
        res.status(400).json({ error: "Thiếu shipmentId hoặc viewSessionYmd." });
        return;
      }

      const state = await deps.loadState();
      const row = state.rows?.find((r) => r.id === shipmentId);
      if (!row) {
        res.status(404).json({ error: "Không tìm thấy lô." });
        return;
      }

      if (!vehicleNo) {
        vehicleNo = normalizeVehicleNo(state.ecargoKhoScsc?.[shipmentId]?.vehicleInput ?? "");
      }

      const readiness = getEcargoRegisterReadiness(row, vehicleNo, viewSessionYmd);
      if (!readiness.ready) {
        res.status(400).json({ error: readiness.hint });
        return;
      }

      const existing = await getEcargoJob(deps.redisClient, shipmentId);
      if (isEcargoJobActive(existing)) {
        res.json({ job: existing, reused: true });
        deps.io?.emit("ecargo-job", existing);
        return;
      }

      const booking = buildEcargoBookingFromShipment(row, vehicleNo, viewSessionYmd);
      const jobId = newEcargoJobId();

      const job = await enqueueEcargoJob(deps.redisClient, {
        jobId,
        shipmentId,
        vehicleNo,
        viewSessionYmd,
        booking,
        awb: row.awb,
        message: "Đã xếp hàng — worker đang xử lý.",
      });

      deps.io?.emit("ecargo-job", job);
      res.status(202).json({ job });
    } catch (e) {
      console.error("[api/ecargo/jobs]", e);
      res.status(500).json({ error: String(e?.message ?? e) });
    }
  });

  app.get("/api/ecargo/health", (_req, res) => {
    res.json({
      ok: true,
      worker: deps.redisClient ? process.env.ECARGO_WORKER_ENABLED !== "0" : false,
      gmail: Boolean(process.env.ECARGO_GMAIL_APP_PASSWORD?.trim()),
    });
  });
}
