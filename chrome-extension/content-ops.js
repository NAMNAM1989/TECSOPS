/**
 * Bridge Ops page ↔ extension (không cần Extension ID cố định).
 * Ops: window.postMessage({ channel: 'tecsops-tcs-ext', direction: 'to-ext', id, type, payload })
 * Ext → Ops: { channel, direction: 'from-ext', id, ...result }
 */

const CHANNEL = "tecsops-tcs-ext";

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

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.channel !== CHANNEL || data.direction !== "to-ext") return;
  if (!data.id || !data.type) return;

  chrome.runtime.sendMessage(
    {
      type: data.type,
      payload: data.payload,
    },
    (response) => {
      const err = chrome.runtime.lastError;
      window.postMessage(
        {
          channel: CHANNEL,
          direction: "from-ext",
          id: data.id,
          ...(err
            ? {
                ok: false,
                error: "EXT_RUNTIME",
                message: err.message || "Extension runtime error",
              }
            : response || {
                ok: false,
                error: "NO_RESPONSE",
                message: "Extension không trả lời",
              }),
        },
        "*"
      );
    }
  );
});
