import {
  buildEcargoBookingFromShipment,
  getEcargoRegisterReadiness,
  normalizeVehicleNo,
  validateEcargoBooking,
} from "./ecargoPayload.mjs";
import {
  enqueueEcargoJob,
  getEcargoJob,
  getEcargoJobsBatch,
  shouldBlockEcargoEnqueue,
  supersedeEcargoJob,
  newEcargoJobId,
} from "./ecargoJobStore.mjs";
import { loadShipmentRowForEcargo, setEcargoStateSnapshot } from "./ecargoStateCache.mjs";

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
      const clientBooking = body.booking && typeof body.booking === "object" ? body.booking : null;

      if (!shipmentId || !viewSessionYmd) {
        res.status(400).json({ error: "Thiếu shipmentId hoặc viewSessionYmd." });
        return;
      }

      const { state, row } = await loadShipmentRowForEcargo(deps.loadState, shipmentId);
      if (!row) {
        res.status(404).json({ error: "Không tìm thấy lô." });
        return;
      }
      setEcargoStateSnapshot(state);

      if (!vehicleNo) {
        vehicleNo = normalizeVehicleNo(state.ecargoKhoScsc?.[shipmentId]?.vehicleInput ?? "");
      }

      const readiness = getEcargoRegisterReadiness(row, vehicleNo, viewSessionYmd);
      if (!readiness.ready) {
        res.status(400).json({ error: readiness.hint });
        return;
      }

      const forceRetry = body.forceRetry === true;
      const existing = await getEcargoJob(deps.redisClient, shipmentId);
      const jobId = newEcargoJobId();

      if (shouldBlockEcargoEnqueue(existing, { forceRetry })) {
        res.json({ job: existing, reused: true });
        deps.io?.emit("ecargo-job", existing);
        return;
      }

      if (existing?.status && existing.status !== "superseded") {
        await supersedeEcargoJob(deps.redisClient, shipmentId, jobId);
      }

      let booking = buildEcargoBookingFromShipment(row, vehicleNo, viewSessionYmd, {
        driverName: String(body.driverName ?? "").trim(),
        driverId: String(body.driverId ?? "").trim(),
      });
      if (clientBooking && typeof clientBooking.mawb === "string") {
        const draft = { ...clientBooking, vehicleNo: normalizeVehicleNo(clientBooking.vehicleNo || vehicleNo) };
        const bookingErrors = validateEcargoBooking(draft);
        if (bookingErrors.length) {
          res.status(400).json({ error: bookingErrors.join(" ") });
          return;
        }
        booking = draft;
      }
      const attempt = (existing?.attempt ?? 0) + 1;
      const job = await enqueueEcargoJob(deps.redisClient, {
        jobId,
        shipmentId,
        vehicleNo,
        viewSessionYmd,
        booking,
        awb: row.awb,
        attempt,
        message:
          attempt > 1
            ? `Đăng ký lại (lần ${attempt}) — worker đang xử lý.`
            : "Đã xếp hàng — worker đang xử lý.",
      });

      deps.io?.emit("ecargo-job", job);
      res.status(202).json({ job });
    } catch (e) {
      console.error("[api/ecargo/jobs]", e);
      res.status(500).json({ error: String(e?.message ?? e) });
    }
  });

  app.post("/api/ecargo/jobs/hydrate", async (req, res) => {
    try {
      if (!deps.redisClient) {
        res.status(503).json({ error: "eCargo worker cần Redis (REDIS_URL)." });
        return;
      }
      const body = req.body;
      const ids = Array.isArray(body?.shipmentIds) ? body.shipmentIds : [];
      const jobs = await getEcargoJobsBatch(deps.redisClient, ids);
      res.json({ jobs });
    } catch (e) {
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
