/**
 * Bridge Ops page ↔ extension (không cần Extension ID cố định).
 * Ops: window.postMessage({ channel: 'tecsops-tcs-ext', direction: 'to-ext', id, type, payload })
 * Ext → Ops: { channel, direction: 'from-ext', id, ...result }
 */

const CHANNEL = "tecsops-tcs-ext";

function extAlive() {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

function replyToOps(id, result) {
  window.postMessage(
    {
      channel: CHANNEL,
      direction: "from-ext",
      id,
      ...result,
    },
    "*"
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
      },
      "*"
    );
  } catch {
    /* Extension vừa Reload — cần F5 Ops */
  }
}

announceReady();

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.channel !== CHANNEL || data.direction !== "to-ext") return;
  if (!data.id || !data.type) return;

  if (!extAlive()) {
    replyToOps(data.id, {
      ok: false,
      error: "EXT_CONTEXT_INVALIDATED",
      message: "Extension đã Reload — hãy F5 trang Ops rồi bấm Đồng bộ lại.",
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
        // Doc lastError ngay — tranh Chrome ghi Unchecked runtime.lastError tren trang quan ly Ext
        const err = chrome.runtime.lastError;
        if (err) {
          const msg = String(err.message || "");
          const invalidated = /context invalidated|receiving end does not exist/i.test(msg);
          replyToOps(data.id, {
            ok: false,
            error: invalidated ? "EXT_CONTEXT_INVALIDATED" : "EXT_RUNTIME",
            message: invalidated
              ? "Extension đã Reload — hãy F5 trang Ops rồi thử lại."
              : msg || "Extension runtime error",
          });
          return;
        }
        replyToOps(
          data.id,
          response || {
            ok: false,
            error: "NO_RESPONSE",
            message: "Extension không trả lời",
          }
        );
      }
    );
  } catch (err) {
    replyToOps(data.id, {
      ok: false,
      error: "EXT_CONTEXT_INVALIDATED",
      message:
        err instanceof Error
          ? err.message
          : "Extension context lỗi — F5 trang Ops sau khi Reload Ext.",
    });
  }
});
