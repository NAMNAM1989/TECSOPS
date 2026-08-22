/**
 * Bridge Ops ↔ Ext kho SCSC eCargo — handshake chuẩn TECSOPS Ops↔Ext.
 *
 * Envelope:
 *   Ops → Ext: { channel, direction: 'to-ext', id, type, payload? }
 *   Ext → Ops: { channel, direction: 'from-ext', id?, type?, ok?, error?, message?, ... }
 *
 * Message types:
 *   EXT_READY  — Ext announce khi content-script load (không có id)
 *   PING       — Ops kiểm tra sống → PONG (+ workspace)
 *   (job)      — ECARGO_OPEN / FILL_ECARGO_VCT / REGISTER_ECARGO_VCT /
 *                ECARGO_OTP_PROVIDE (hook mã+URL; Gmail mapping PC sau này) / …
 *   result     — trả về cùng `id`, `ok: true|false`
 *   error      — `ok: false` + `error` code
 *
 * Channel: tecsops-scsc-ecargo-ext
 * @see docs/ops-ext-protocol.md
 */

const CHANNEL = "tecsops-scsc-ecargo-ext";
const PORTAL_WAREHOUSE = "SCSC";
const EXT_LABEL = "SCSC eCargo";

function extAlive() {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

const OPS_ORIGIN = window.location.origin;

function replyToOps(id, result) {
  window.postMessage(
    {
      channel: CHANNEL,
      direction: "from-ext",
      id,
      ...result,
    },
    OPS_ORIGIN
  );
}

function announceReady() {
  if (!extAlive()) return;
  try {
    window.postMessage(
      {
        channel: CHANNEL,
        direction: "from-ext",
        type: "EXT_READY",
        ok: true,
        version: chrome.runtime.getManifest().version,
        portalWarehouse: PORTAL_WAREHOUSE,
      },
      OPS_ORIGIN
    );
  } catch {
    /* Extension vừa Reload — cần F5 Ops */
  }
}

announceReady();

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.origin !== OPS_ORIGIN) return;
  const data = event.data;
  if (!data || data.channel !== CHANNEL || data.direction !== "to-ext") return;
  if (!data.id || !data.type) return;

  if (!extAlive()) {
    replyToOps(data.id, {
      ok: false,
      error: "EXT_CONTEXT_INVALIDATED",
      message: `Extension ${EXT_LABEL} đã Reload — hãy F5 trang Ops rồi thử lại.`,
      portalWarehouse: PORTAL_WAREHOUSE,
    });
    return;
  }

  try {
    chrome.runtime.sendMessage(
      {
        type: data.type,
        payload: data.payload,
      },
      (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          const msg = String(err.message || "");
          const invalidated =
            /context invalidated|receiving end does not exist/i.test(msg);
          replyToOps(data.id, {
            ok: false,
            error: invalidated ? "EXT_CONTEXT_INVALIDATED" : "EXT_SEND_FAILED",
            message: invalidated
              ? `Extension ${EXT_LABEL} đã Reload — F5 Ops rồi thử lại.`
              : msg || `Không gửi được lệnh tới extension ${EXT_LABEL}.`,
            portalWarehouse: PORTAL_WAREHOUSE,
          });
          return;
        }
        replyToOps(
          data.id,
          response || {
            ok: false,
            error: "EMPTY_RESPONSE",
            message: `Extension ${EXT_LABEL} không trả lời.`,
            portalWarehouse: PORTAL_WAREHOUSE,
          }
        );
      }
    );
  } catch (e) {
    replyToOps(data.id, {
      ok: false,
      error: "EXT_THROW",
      message: e instanceof Error ? e.message : String(e),
      portalWarehouse: PORTAL_WAREHOUSE,
    });
  }
});
