/**
 * DEPRECATED — legacy Ext kho TECS-TCS.
 * Chuẩn mới: chrome-extension-tcs (TCS) + chrome-extension-scsc (SCSC).
 * Giữ bridge để cài sẵn vẫn PING được; không tải từ menu Ops.
 *
 * Handshake giống docs/ops-ext-protocol.md — channel: tecsops-tcs-ext
 */

const CHANNEL = "tecsops-tcs-ext";
const PORTAL_WAREHOUSE = "TECS-TCS";
const EXT_LABEL = "TECS-TCS";

function extAlive() {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

/** Chỉ gửi/nhận trong đúng origin trang Ops — chặn frame lạ đọc hoặc giả lệnh. */
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
  } catch (err) {
    replyToOps(data.id, {
      ok: false,
      error: "EXT_THROW",
      message:
        err instanceof Error
          ? err.message
          : "Extension context lỗi — F5 trang Ops sau khi Reload Ext.",
      portalWarehouse: PORTAL_WAREHOUSE,
    });
  }
});
