/**
 * Push API v1 — luồng realtime Server-Sent Events:
 *   GET /api/v1/stream/shipments?sessionDate=&warehouse=&view=core|full&since=
 *
 * Sự kiện: ready, shipments.changed, resync. Nối lại bằng header Last-Event-ID
 * (EventSource tự gửi) hoặc ?since=<stateVersion>.
 */
import {
  normalizeExportWarehouse,
  parseExportView,
  parseSessionDateParam,
} from "./exportContract.mjs";
import { projectEventForSubscriber } from "./pushEvents.mjs";

const HEARTBEAT_MS = 25_000;

function writeSse(res, { event, id, data }) {
  let chunk = "";
  if (id != null) chunk += `id: ${id}\n`;
  if (event) chunk += `event: ${event}\n`;
  chunk += `data: ${JSON.stringify(data)}\n\n`;
  res.write(chunk);
}

function badRequest(res, code, error) {
  res.status(400).json({ ok: false, code, error });
}

/**
 * @param {import('express').Express} app
 * @param {{ requireAuth?: import('express').RequestHandler,
 *           bus: ReturnType<import('./pushEvents.mjs').createPushEventBus>,
 *           peekStateVersion: () => Promise<number>,
 *           applyCors?: (req: any, res: any) => void,
 *           heartbeatMs?: number }} deps
 */
export function registerPushRoutes(app, deps) {
  const requireAuth = deps.requireAuth || ((_req, _res, next) => next());
  const { bus, peekStateVersion, applyCors = () => {}, heartbeatMs = HEARTBEAT_MS } = deps;

  app.options("/api/v1/stream/*", (req, res) => {
    applyCors(req, res);
    res.status(204).end();
  });

  app.get("/api/v1/stream/shipments", requireAuth, async (req, res) => {
    applyCors(req, res);

    const rawDate = req.query.sessionDate ?? req.query.session_date;
    const sessionDate = rawDate ? parseSessionDateParam(rawDate) : null;
    if (rawDate && !sessionDate) {
      badRequest(res, "EXPORT_SESSION_DATE_INVALID", "sessionDate phải dạng YYYY-MM-DD.");
      return;
    }
    const warehouse = req.query.warehouse ? normalizeExportWarehouse(req.query.warehouse) : null;
    if (req.query.warehouse && !warehouse) {
      badRequest(res, "EXPORT_WAREHOUSE_INVALID", "warehouse không hợp lệ.");
      return;
    }
    const filter = { sessionDate, warehouse, view: parseExportView(req.query.view) };

    const lastEventId = req.headers["last-event-id"] ?? req.query.since;
    const since = lastEventId != null && String(lastEventId).trim() !== "" ? Number(lastEventId) : null;

    let stateVersion = 0;
    try {
      stateVersion = await peekStateVersion();
    } catch (err) {
      console.error("[api/v1/stream] peek version", err);
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    req.socket?.setNoDelay?.(true);
    res.write("retry: 2000\n\n");

    let lastSentVersion = Number.isFinite(since) ? since : stateVersion;
    const send = (event) => {
      if (event.stateVersion <= lastSentVersion) return;
      lastSentVersion = event.stateVersion;
      const payload = projectEventForSubscriber(event, filter);
      if (!payload) return;
      writeSse(res, { event: payload.type, id: payload.eventId, data: payload });
    };

    const unsubscribe = bus.subscribe(send);

    writeSse(res, {
      event: "ready",
      data: { apiVersion: "v1", schemaVersion: 1, stateVersion, filter },
    });

    {
      const { events, gap } = bus.replaySince(lastSentVersion);
      if (gap && Number.isFinite(since)) {
        lastSentVersion = stateVersion;
        writeSse(res, {
          event: "resync",
          id: String(stateVersion),
          data: {
            reason: "BUFFER_EXCEEDED",
            stateVersion,
            hint: "Tải lại snapshot qua GET /api/v1/export/shipments rồi tiếp tục nghe stream.",
          },
        });
      } else {
        for (const e of events) send(e);
      }
    }

    const heartbeat = setInterval(() => res.write(`: ping ${Date.now()}\n\n`), heartbeatMs);
    heartbeat.unref?.();

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    req.on("close", cleanup);
    res.on("error", cleanup);
  });
}
