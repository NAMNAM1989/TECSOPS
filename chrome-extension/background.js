/**
 * Service worker — nhận lệnh từ content-ops (Ops page), điều phối tab TCS.
 * Luôn inject content-tcs.js trước FILL để lấy bản mới (idempotent listener).
 */

const ESID_URL = "https://www.tcs.com.vn/Esid/Export";
const EXT_VERSION = chrome.runtime.getManifest().version;
/** Khớp SCRIPT_VERSION trong content-tcs.js — lệch thì reload tab để xóa listener cũ */
const EXPECTED_SCRIPT_VERSION = "1.1.0";

chrome.runtime.onInstalled.addListener(() => {
  console.info("[tecsops-ext] installed", EXT_VERSION);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return false;

  if (msg.type === "PING") {
    sendResponse({
      ok: true,
      type: "PONG",
      version: EXT_VERSION,
      extensionId: chrome.runtime.id,
    });
    return false;
  }

  if (msg.type === "FILL_ESID") {
    void fillEsidOnTcsTab(msg.payload)
      .then(sendResponse)
      .catch((err) => {
        sendResponse({
          ok: false,
          error: "FILL_FAILED",
          message: err instanceof Error ? err.message : String(err),
          warnings: [],
          version: EXT_VERSION,
        });
      });
    return true;
  }

  return false;
});

async function findOrOpenTcsTab() {
  const tabs = await chrome.tabs.query({
    url: ["https://www.tcs.com.vn/*", "https://tcs.com.vn/*"],
  });
  let tab = tabs.find((t) => (t.url || "").includes("/Esid/")) || tabs[0];
  if (!tab?.id) {
    tab = await chrome.tabs.create({ url: ESID_URL, active: true });
  } else {
    await chrome.tabs.update(tab.id, { active: true });
    if (!(tab.url || "").includes("/Esid/Export")) {
      await chrome.tabs.update(tab.id, { url: ESID_URL });
    }
  }
  await waitTabComplete(tab.id);
  return tab.id;
}

function waitTabComplete(tabId, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = async () => {
      try {
        const t = await chrome.tabs.get(tabId);
        if (t.status === "complete") {
          resolve();
          return;
        }
      } catch (e) {
        reject(e);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Timeout chờ tab TCS load"));
        return;
      }
      setTimeout(check, 200);
    };
    void check();
  });
}

async function injectTcsContent(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content-tcs.js"],
  });
}

async function sendToTcsContent(tabId, message) {
  // Luôn inject trước — cập nhật runFill mà không nhân listener
  try {
    await injectTcsContent(tabId);
  } catch (e) {
    /* tab có thể chưa cho inject — thử gửi anyway */
  }
  await new Promise((r) => setTimeout(r, 80));

  let lastErr;
  for (let i = 0; i < 6; i++) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (e) {
      lastErr = e;
      try {
        await injectTcsContent(tabId);
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, 250 + i * 120));
    }
  }
  throw lastErr || new Error("Không gửi được message tới tab TCS");
}

async function fillEsidOnTcsTab(payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "BAD_PAYLOAD", message: "Thiếu payload FILL_ESID", warnings: [] };
  }
  let tabId = await findOrOpenTcsTab();

  // Inject + kiểm tra version. Listener cũ (trước v1.1) vẫn sống nếu chỉ Reload ext mà không F5
  // → navigate lại Esid để xóa JS cũ, tránh FILL chạy song song / treo overlay.
  await injectTcsContent(tabId).catch(() => {});
  await new Promise((r) => setTimeout(r, 100));
  let scriptVersion = "";
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { type: "TCS_PING" });
    scriptVersion = String(ping?.scriptVersion || "");
    if (ping?.busy) {
      return {
        ok: false,
        error: "BUSY",
        message: "Tab TCS đang điền — đợi xong rồi thử lại.",
        warnings: [],
        scriptVersion,
      };
    }
  } catch {
    scriptVersion = "";
  }

  if (scriptVersion !== EXPECTED_SCRIPT_VERSION) {
    await chrome.tabs.update(tabId, { url: ESID_URL });
    await waitTabComplete(tabId);
    await injectTcsContent(tabId).catch(() => {});
    await new Promise((r) => setTimeout(r, 150));
  }

  const result = await sendToTcsContent(tabId, {
    type: "FILL_ESID",
    payload,
  });
  return (
    result || {
      ok: false,
      error: "NO_RESPONSE",
      message: "Content script TCS không trả lời",
      warnings: [],
    }
  );
}
