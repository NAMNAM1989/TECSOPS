/**
 * TECSOPS TCS workspace owner.
 *
 * Extension giữ một tab TCS được ghim và là controller duy nhất khi chạy
 * extension mode. Playwright chỉ là fallback do Ops quyết định.
 */

const LOGIN_URL = "https://www.tcs.com.vn/AwbLogin";
const ESID_URL = "https://www.tcs.com.vn/Esid/Export";
const ECARGO_CREATE_URL = "https://ecargo.scsc.vn/Export/VCTOrder/Create";
const EXT_VERSION = chrome.runtime.getManifest().version;
const EXPECTED_SCRIPT_VERSION = "2.0.20";
const EXPECTED_ECARGO_SCRIPT_VERSION = "2.2.8";
const SESSION_KEY = "tecsopsTcsSessionCredentials";
const LOCAL_KEY = "tecsopsTcsRememberedCredentials";
const WORKSPACE_KEY = "tecsopsTcsWorkspace";
const INDEX_KEY = "tecsopsTcsWorkspaceIndex";

let workspace = {
  phase: "IDLE",
  logged_in: false,
  session_date: "",
  cache_count: 0,
  ready_count: 0,
  tab_id: null,
  message: "",
  error: "",
  updated_at: null,
};
let workspaceIndex = [];

const workspaceReady = chrome.storage.session.get([WORKSPACE_KEY, INDEX_KEY]).then((saved) => {
  if (saved[WORKSPACE_KEY] && typeof saved[WORKSPACE_KEY] === "object") {
    workspace = { ...workspace, ...saved[WORKSPACE_KEY] };
  }
  if (Array.isArray(saved[INDEX_KEY])) {
    workspaceIndex = saved[INDEX_KEY];
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.info("[tecsops-ext] installed", EXT_VERSION);
});

/** Gọi sendResponse đúng 1 lần; nuốt lỗi kênh đã đóng (tránh spam Errors trên chrome://extensions). */
function replyOnce(sendResponse) {
  let done = false;
  return (payload) => {
    if (done) return;
    done = true;
    try {
      sendResponse(payload);
    } catch {
      /* port đã đóng */
    }
  };
}

/** Giữ service worker sống trong lúc bootstrap/login dài (MV3 dễ kill SW → sendMessage lỗi). */
function withServiceWorkerKeepAlive(promise) {
  const tick = () => {
    try {
      void chrome.storage.session.get(WORKSPACE_KEY);
    } catch {
      /* ignore */
    }
  };
  tick();
  const timer = setInterval(tick, 15_000);
  return Promise.resolve(promise).finally(() => clearInterval(timer));
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const reply = replyOnce(sendResponse);
  if (!msg || typeof msg !== "object") {
    reply({ ok: false, error: "INVALID_MESSAGE", message: "Payload không hợp lệ", version: EXT_VERSION });
    return true;
  }

  if (msg.type === "PING") {
    void workspaceReady
      .then(() =>
        reply({
          ok: true,
          type: "PONG",
          version: EXT_VERSION,
          extensionId: chrome.runtime.id,
          workspace,
        })
      )
      .catch((err) => reply(errorResult("PING_FAILED", err)));
    return true;
  }

  if (msg.type === "TCS_OPEN") {
    void withServiceWorkerKeepAlive(findOrOpenTcsTab({ active: true, pinned: true }))
      .then((tabId) => reply({ ok: true, tabId, workspace }))
      .catch((err) => reply(errorResult("OPEN_FAILED", err)));
    return true;
  }

  if (msg.type === "TCS_BOOTSTRAP") {
    void withServiceWorkerKeepAlive(bootstrapWorkspace(msg.payload || {}))
      .then(reply)
      .catch((err) => {
        setWorkspace({ phase: "ERROR", error: errorMessage(err) });
        reply(errorResult("BOOTSTRAP_FAILED", err));
      });
    return true;
  }

  if (msg.type === "FILL_ESID") {
    void withServiceWorkerKeepAlive(fillEsidOnTcsTab(msg.payload))
      .then(reply)
      .catch((err) => reply(errorResult("FILL_FAILED", err)));
    return true;
  }

  if (msg.type === "ECARGO_OPEN") {
    void withServiceWorkerKeepAlive(findOrOpenEcargoTab({ active: true, pinned: true }))
      .then((tabId) => reply({ ok: true, tabId, workspace }))
      .catch((err) => reply(errorResult("OPEN_FAILED", err)));
    return true;
  }

  if (msg.type === "FILL_ECARGO_VCT") {
    void withServiceWorkerKeepAlive(fillEcargoOnTab(msg.payload))
      .then(reply)
      .catch((err) => reply(errorResult("FILL_FAILED", err)));
    return true;
  }

  if (msg.type === "REGISTER_ECARGO_VCT") {
    void withServiceWorkerKeepAlive(registerEcargoOnTab(msg.payload))
      .then(reply)
      .catch((err) => reply(errorResult("REGISTER_FAILED", err)));
    return true;
  }

  if (msg.type === "ECARGO_OTP_WAIT") {
    void withServiceWorkerKeepAlive(ecargoOtpWait(msg))
      .then(reply)
      .catch((err) => reply(errorResult("OTP_FAILED", err)));
    return true;
  }

  if (msg.type === "ECARGO_RESULT_FROM_MAIL") {
    void withServiceWorkerKeepAlive(ecargoResultFromMail(msg))
      .then(reply)
      .catch((err) => reply(errorResult("MAIL_RESULT_FAILED", err)));
    return true;
  }

  if (msg.type === "ECARGO_SAVE_RESULT") {
    void withServiceWorkerKeepAlive(ecargoSaveResult(msg))
      .then(reply)
      .catch((err) => reply(errorResult("SAVE_FAILED", err)));
    return true;
  }

  reply({
    ok: false,
    error: "UNKNOWN_TYPE",
    message: `Lệnh không hỗ trợ: ${String(msg.type || "")}`,
    version: EXT_VERSION,
    workspace,
  });
  return true;
});

function errorMessage(err) {
  return err instanceof Error ? err.message : String(err || "Unknown error");
}

function errorResult(error, err) {
  return {
    ok: false,
    error,
    message: errorMessage(err),
    warnings: [],
    version: EXT_VERSION,
    workspace,
  };
}

function setWorkspace(patch) {
  workspace = {
    ...workspace,
    ...patch,
    updated_at: Date.now(),
  };
  void chrome.storage.session.set({ [WORKSPACE_KEY]: workspace });
  return workspace;
}

async function saveCredentials(username, password, remember) {
  const credentials = { username, password };
  await chrome.storage.session.set({ [SESSION_KEY]: credentials });
  if (remember) {
    await chrome.storage.local.set({ [LOCAL_KEY]: credentials });
  } else {
    await chrome.storage.local.remove(LOCAL_KEY);
  }
}

async function loadCredentials(payload) {
  const username = String(payload.username || "").trim();
  const password = String(payload.password || "");
  if (username && password) return { username, password };
  const session = await chrome.storage.session.get(SESSION_KEY);
  const local = await chrome.storage.local.get(LOCAL_KEY);
  const saved = session[SESSION_KEY] || local[LOCAL_KEY] || {};
  return {
    username: String(saved.username || "").trim(),
    password: String(saved.password || ""),
  };
}

async function findOrOpenTcsTab({ active = true, pinned = true } = {}) {
  const tabs = await chrome.tabs.query({
    url: ["https://www.tcs.com.vn/*", "https://tcs.com.vn/*"],
  });
  let tab = tabs.find((item) => item.id === workspace.tab_id);
  if (!tab) {
    tab = tabs.find((item) => (item.url || "").includes("/Esid/")) || tabs[0];
  }
  if (!tab?.id) {
    tab = await chrome.tabs.create({ url: LOGIN_URL, active, pinned });
  } else {
    tab = await chrome.tabs.update(tab.id, { active, pinned });
  }
  setWorkspace({ tab_id: tab.id });
  await waitTabComplete(tab.id);
  return tab.id;
}

function waitTabComplete(tabId, timeoutMs = 45_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = async () => {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === "complete") {
          resolve(tab);
          return;
        }
      } catch (err) {
        reject(err);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Timeout chờ tab TCS tải xong"));
        return;
      }
      setTimeout(check, 200);
    };
    void check();
  });
}

async function navigate(tabId, url) {
  const tab = await chrome.tabs.get(tabId);
  if ((tab.url || "").startsWith(url)) return tab;
  await chrome.tabs.update(tabId, { url, active: true, pinned: true });
  return waitTabComplete(tabId);
}

async function injectTcsContent(tabId) {
  // Tránh inject lại nếu content đã đúng version (giảm lỗi listener/port)
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { type: "TCS_PING" });
    if (ping?.ok && String(ping.scriptVersion || "") === EXPECTED_SCRIPT_VERSION) {
      return;
    }
  } catch {
    /* chưa có content — inject */
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content-tcs.js"],
  });
}

async function armFlightConfirmAcceptance(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => {
      const root = document.documentElement;
      const original = window.confirm;
      const armedAt = Date.now();
      root.dataset.tecsopsFlightConfirmStatus = "armed";
      root.dataset.tecsopsFlightConfirmMessage = "";

      function folded(value) {
        return String(value || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/đ/gi, "d")
          .toUpperCase()
          .replace(/\s+/g, " ")
          .trim();
      }

      function restore() {
        if (window.confirm === flightConfirm) window.confirm = original;
      }

      function flightConfirm(message) {
        const text = folded(message);
        const isFlightConfirm =
          text.includes("DONG Y") &&
          (text.includes("CHUYEN BAY") || text.includes("FLIGHT"));
        if (Date.now() - armedAt <= 20_000 && isFlightConfirm) {
          root.dataset.tecsopsFlightConfirmStatus = "accepted";
          root.dataset.tecsopsFlightConfirmMessage = String(message || "").slice(0, 240);
          restore();
          return true;
        }
        return original.call(window, message);
      }

      window.confirm = flightConfirm;
      window.setTimeout(restore, 20_000);
    },
  });
}

async function sendToTcsContent(tabId, message, attempts = 8) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await injectTcsContent(tabId);
      await new Promise((resolve) => setTimeout(resolve, 80));
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (err) {
      lastErr = err;
      await new Promise((resolve) => setTimeout(resolve, 180 + i * 100));
    }
  }
  throw lastErr || new Error("Không gửi được lệnh tới tab TCS");
}

async function solveCaptcha(dataUrl, agentBaseUrl, opts = {}) {
  if (!dataUrl) {
    return { ok: false, error: "CAPTCHA_IMAGE_EMPTY", text: "", confidence: 0 };
  }
  const minConfidence = Number(opts.minConfidence ?? 0.55);
  // Luôn ưu tiên agent local (OCR ddddocr trên máy kho). Ops/Railway URL sau —
  // tránh proxy xa che lỗi OCR hoặc chậm khiến Đồng bộ fail lần 1.
  const candidates = ["http://127.0.0.1:8765", "http://localhost:8765"];
  const explicit = String(agentBaseUrl || "").trim().replace(/\/+$/, "");
  if (explicit && !/127\.0\.0\.1|localhost/i.test(explicit)) {
    candidates.push(explicit);
  } else if (explicit) {
    candidates.unshift(explicit);
  }
  let lastHardError = null;
  for (const base of [...new Set(candidates)]) {
    try {
      const response = await fetch(`${base}/captcha/solve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: dataUrl,
          expected_length: 5,
          min_confidence: minConfidence,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body?.ok && body.text) {
        return {
          ok: true,
          text: String(body.text),
          confidence: Number(body.confidence || 0),
          candidates: Array.isArray(body.candidates) ? body.candidates : [],
          agentBase: base,
        };
      }
      if (response.status === 422) {
        return {
          ok: false,
          error: String(body?.error || "OCR_LOW_CONFIDENCE"),
          text: "",
          confidence: Number(body?.confidence || 0),
          candidates: Array.isArray(body?.candidates) ? body.candidates : [],
          agentBase: base,
        };
      }
      // Agent trả lời nhưng OCR hỏng (thiếu ddddocr, v.v.) — không giả là "offline"
      if (body?.error === "OCR_FAILED" || response.status >= 500) {
        lastHardError = {
          ok: false,
          error: "OCR_FAILED",
          text: "",
          confidence: 0,
          message: String(body?.message || body?.error || `HTTP ${response.status}`),
          agentBase: base,
        };
        // Thử candidate kế tiếp (vd. local fail → remote)
        continue;
      }
    } catch {
      // Thử endpoint kế tiếp.
    }
  }
  if (lastHardError) return lastHardError;
  return { ok: false, error: "OCR_AGENT_UNAVAILABLE", text: "", confidence: 0 };
}

async function waitForCaptchaChange(tabId, previousDataUrl, timeoutMs = 4_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 180));
    try {
      const captcha = await sendToTcsContent(
        tabId,
        { type: "TCS_GET_CAPTCHA" },
        2
      );
      if (captcha?.dataUrl && captcha.dataUrl !== previousDataUrl) return captcha;
    } catch {
      // Trang có thể đang reload; tiếp tục chờ.
    }
  }
  return null;
}

async function refreshCaptchaAndWait(tabId, previousDataUrl) {
  await sendToTcsContent(tabId, { type: "TCS_REFRESH_CAPTCHA" }).catch(() => {});
  return waitForCaptchaChange(tabId, previousDataUrl);
}

async function waitForLoginOutcome(tabId, previousDataUrl, timeoutMs = 12_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const tab = await chrome.tabs.get(tabId);
    if (!/awblogin|\/login/i.test(tab.url || "")) {
      return { loggedIn: true, captchaChanged: false, message: "" };
    }
    try {
      const status = await sendToTcsContent(
        tabId,
        { type: "TCS_LOGIN_STATUS" },
        2
      );
      if (status?.loggedIn) {
        return { loggedIn: true, captchaChanged: false, message: "" };
      }
      if (status?.captchaDataUrl && status.captchaDataUrl !== previousDataUrl) {
        return {
          loggedIn: false,
          captchaChanged: true,
          message: String(status.message || ""),
        };
      }
      if (status?.message) {
        return {
          loggedIn: false,
          captchaChanged: false,
          message: String(status.message),
        };
      }
    } catch {
      // Content script có thể tạm mất trong lúc điều hướng.
    }
  }
  return { loggedIn: false, captchaChanged: false, message: "Timeout chờ phản hồi đăng nhập" };
}

async function loginOnTcsTab(tabId, credentials, agentBaseUrl) {
  const current = await chrome.tabs.get(tabId);
  const isLogin = /awblogin|\/login/i.test(current.url || "");
  if (!isLogin) {
    const ping = await sendToTcsContent(tabId, { type: "TCS_PING" });
    if (ping?.loggedIn) return { ok: true, alreadyLoggedIn: true };
    await navigate(tabId, LOGIN_URL);
  }

  // Chờ form + ảnh CAPTCHA sẵn sàng (tránh lần 1 fail / lần 2 mới login)
  for (let i = 0; i < 20; i += 1) {
    try {
      const captcha = await sendToTcsContent(tabId, { type: "TCS_GET_CAPTCHA" }, 2);
      if (captcha?.dataUrl || captcha?.diag?.hasInput) break;
    } catch {
      /* trang đang hydrate */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  let submittedAttempts = 0;
  let sampledCaptchas = 0;
  let lastMessage = "";
  while (submittedAttempts < 5 && sampledCaptchas < 10) {
    const captcha = await sendToTcsContent(tabId, { type: "TCS_GET_CAPTCHA" });
    const dataUrl = captcha?.dataUrl || "";
    // Hạ ngưỡng dần: lần đầu chặt, sau đó nới để vẫn login được CAPTCHA khó đọc
    const minConfidence = sampledCaptchas < 3 ? 0.55 : sampledCaptchas < 6 ? 0.45 : 0.38;
    const solved = await solveCaptcha(dataUrl, agentBaseUrl, { minConfidence });
    sampledCaptchas += 1;

    if (!solved.ok) {
      if (solved.error === "OCR_FAILED") {
        return {
          ok: false,
          error: "OCR_FAILED",
          message:
            solved.message ||
            "Agent OCR lỗi (thường thiếu ddddocr). Chạy: npm run tcs:agent:real (dùng .venv).",
        };
      }
      lastMessage =
        solved.error === "OCR_AGENT_UNAVAILABLE"
          ? "Không kết nối được OCR Agent (cổng 8765)"
          : "OCR chưa đủ tin cậy, đang đổi CAPTCHA";
      if (solved.error === "OCR_AGENT_UNAVAILABLE") {
        const manual = await sendToTcsContent(tabId, {
          type: "TCS_LOGIN",
          payload: { ...credentials, captcha: "" },
        });
        return {
          ...manual,
          ok: false,
          error: "CAPTCHA_REQUIRED",
          message:
            "Đã điền user/password. Không kết nối OCR Agent (:8765); hãy nhập CAPTCHA trên tab TCS hoặc chạy npm run tcs:agent:real.",
        };
      }
      await refreshCaptchaAndWait(tabId, dataUrl);
      continue;
    }

    setWorkspace({
      phase: "LOGIN",
      message: `Đã đọc CAPTCHA ${solved.text} (${Math.round(
        Number(solved.confidence || 0) * 100
      )}%) — đang điền…`,
    });
    submittedAttempts += 1;
    const clicked = await sendToTcsContent(tabId, {
      type: "TCS_LOGIN",
      payload: {
        ...credentials,
        captcha: solved.text,
        attempt: submittedAttempts,
      },
    });
    if (!clicked?.ok) return clicked;
    if (!clicked?.captchaFilled || Number(clicked?.captchaLength || 0) !== 5) {
      return {
        ok: false,
        error: "CAPTCHA_FILL_FAILED",
        message: "OCR đã đọc CAPTCHA nhưng ô CAPTCHA trên TCS chưa nhận đủ 5 ký tự.",
      };
    }

    const outcome = await waitForLoginOutcome(tabId, dataUrl);
    if (outcome.loggedIn) {
      return {
        ok: true,
        attempt: submittedAttempts,
        captchaConfidence: solved.confidence,
      };
    }
    lastMessage = outcome.message || `TCS từ chối lần đăng nhập ${submittedAttempts}`;
    if (!outcome.captchaChanged) {
      await refreshCaptchaAndWait(tabId, dataUrl);
    }
  }
  return {
    ok: false,
    error: "LOGIN_FAILED",
    message:
      lastMessage ||
      `TCS vẫn ở trang đăng nhập sau ${submittedAttempts} lần submit CAPTCHA đã được kiểm tra.`,
  };
}

async function bootstrapWorkspace(payload) {
  await workspaceReady;
  const sessionDate = String(payload.session_date || payload.sessionDate || "").trim();
  const awbs = Array.isArray(payload.awbs) ? payload.awbs : [];
  const credentials = await loadCredentials(payload);
  if (!credentials.username || !credentials.password) {
    return {
      ok: false,
      error: "CREDENTIALS_REQUIRED",
      message: "Hãy nhập tài khoản và mật khẩu TCS trên Ops.",
      workspace,
    };
  }
  if (!sessionDate) {
    return {
      ok: false,
      error: "DATE_REQUIRED",
      message: "Thiếu ngày quét TCS.",
      workspace,
    };
  }

  // Giữ remember=true nếu payload bật, hoặc đã có bản nhớ local (tránh lần 1 xóa MK đã lưu)
  const localSaved = await chrome.storage.local.get(LOCAL_KEY);
  const keepRemember =
    payload.remember === true || Boolean(localSaved[LOCAL_KEY]?.username);
  await saveCredentials(credentials.username, credentials.password, keepRemember);
  setWorkspace({
    phase: "OPENING",
    session_date: sessionDate,
    error: "",
    message: "Đang mở tab TCS…",
  });
  const tabId = await findOrOpenTcsTab({ active: true, pinned: true });

  setWorkspace({ phase: "LOGIN", message: "Đang đăng nhập TCS…" });
  const login = await loginOnTcsTab(tabId, credentials, payload.agent_base_url);
  if (!login?.ok) {
    setWorkspace({
      phase: login?.error === "CAPTCHA_REQUIRED" ? "NEEDS_CAPTCHA" : "ERROR",
      logged_in: false,
      error: login?.message || "Đăng nhập thất bại",
    });
    return { ...login, workspace };
  }

  setWorkspace({ logged_in: true, phase: "SCANNING", message: `Đang quét ${sessionDate}…` });
  await navigate(tabId, ESID_URL);
  const scan = await sendToTcsContent(tabId, {
    type: "TCS_SCAN_DATE",
    payload: { session_date: sessionDate, awbs },
  });
  if (!scan?.ok) {
    setWorkspace({
      phase: "ERROR",
      error: scan?.message || "Quét TCS thất bại",
    });
    return { ...scan, logged_in: true, workspace };
  }
  const { index_rows: indexRows = [], ...scanResult } = scan;
  workspaceIndex = Array.isArray(indexRows) ? indexRows : [];
  await chrome.storage.session.set({ [INDEX_KEY]: workspaceIndex });
  setWorkspace({
    phase: "READY",
    logged_in: true,
    cache_count: Number(scan.cache_count || scan.list_total || 0),
    ready_count: Number((scan.ready || []).length),
    message: `Đã quét ngày ${sessionDate}: ${scan.list_total || 0} dòng`,
    error: "",
  });
  return {
    ...scanResult,
    ok: true,
    logged_in: true,
    source: "chrome-extension",
    version: EXT_VERSION,
    workspace,
  };
}

async function fillEsidOnTcsTab(payload) {
  await workspaceReady;
  if (!payload || typeof payload !== "object") {
    return {
      ok: false,
      error: "BAD_PAYLOAD",
      message: "Thiếu payload FILL_ESID",
      warnings: [],
    };
  }
  const tabId = await findOrOpenTcsTab({ active: true, pinned: true });
  await navigate(tabId, ESID_URL);
  const ping = await sendToTcsContent(tabId, { type: "TCS_PING" });
  if (ping?.scriptVersion !== EXPECTED_SCRIPT_VERSION) {
    await chrome.tabs.reload(tabId);
    await waitTabComplete(tabId);
  }
  setWorkspace({ phase: "FILLING", message: "Đang điền ESID…", error: "" });
  if (payload.choose_flight !== false) {
    await armFlightConfirmAcceptance(tabId);
  }
  const result = await sendToTcsContent(tabId, {
    type: "FILL_ESID",
    payload,
  });
  setWorkspace(
    result?.ok
      ? { phase: "READY", message: result.message || "Đã điền ESID" }
      : { phase: "ERROR", error: result?.message || "Điền ESID thất bại" }
  );
  return { ...result, workspace };
}

async function findOrOpenEcargoTab({ active = true, pinned = true } = {}) {
  const tabs = await chrome.tabs.query({ url: ["https://ecargo.scsc.vn/*"] });
  let tab =
    tabs.find((item) => (item.url || "").includes("/Export/VCTOrder/Create")) || tabs[0];
  if (!tab?.id) {
    tab = await chrome.tabs.create({ url: ECARGO_CREATE_URL, active, pinned });
    await waitTabComplete(tab.id);
    return tab.id;
  }
  const onCreate = (tab.url || "").includes("/Export/VCTOrder/Create");
  // Chỉ navigate khi chưa ở trang Create — tránh reload làm inject content 2 lần.
  if (!onCreate) {
    tab = await chrome.tabs.update(tab.id, {
      url: ECARGO_CREATE_URL,
      active,
      pinned,
    });
    await waitTabComplete(tab.id);
  } else {
    tab = await chrome.tabs.update(tab.id, { active, pinned });
  }
  return tab.id;
}

async function injectEcargoContent(tabId) {
  // Chờ content_scripts từ manifest lên trước — tránh inject trùng listener.
  for (let i = 0; i < 6; i += 1) {
    try {
      const ping = await chrome.tabs.sendMessage(tabId, { type: "ECARGO_PING" });
      if (ping?.ok && String(ping.scriptVersion || "") === EXPECTED_ECARGO_SCRIPT_VERSION) {
        return;
      }
      // Version cũ: inject bản mới (content có guard idempotent).
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 60));
    }
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content-ecargo.js"],
  });
}

async function sendToEcargoContent(tabId, message, attempts = 6) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await injectEcargoContent(tabId);
      if (i > 0) await new Promise((resolve) => setTimeout(resolve, 40));
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (err) {
      lastErr = err;
      await new Promise((resolve) => setTimeout(resolve, 100 + i * 80));
    }
  }
  throw lastErr || new Error("Không gửi được lệnh tới tab eCargo");
}

async function ensureEcargoContentReady(tabId) {
  // findOrOpenEcargoTab đã đưa tới trang Create — không navigate lại (tránh reload dư).
  let ping = await sendToEcargoContent(tabId, { type: "ECARGO_PING" });
  if (ping?.ok && ping?.scriptVersion === EXPECTED_ECARGO_SCRIPT_VERSION) {
    return ping;
  }
  // Inject bản mới (handler gắn globalThis → cập nhật ngay cả khi listener cũ còn).
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content-ecargo.js"],
  });
  await new Promise((r) => setTimeout(r, 50));
  ping = await sendToEcargoContent(tabId, { type: "ECARGO_PING" });
  if (ping?.ok && ping?.scriptVersion === EXPECTED_ECARGO_SCRIPT_VERSION) {
    return ping;
  }
  // Fallback: reload tab để manifest inject sạch.
  await chrome.tabs.reload(tabId);
  await waitTabComplete(tabId);
  ping = await sendToEcargoContent(tabId, { type: "ECARGO_PING" });
  if (!ping?.ok) {
    throw new Error(
      "Không kết nối được content eCargo. F5 tab ecargo.scsc.vn rồi thử lại."
    );
  }
  if (ping.scriptVersion !== EXPECTED_ECARGO_SCRIPT_VERSION) {
    throw new Error(
      `Extension eCargo lệch phiên bản (${ping.scriptVersion || "?"} ≠ ${EXPECTED_ECARGO_SCRIPT_VERSION}). Reload extension tại chrome://extensions.`
    );
  }
  return ping;
}

async function fillEcargoOnTab(payload) {
  await workspaceReady;
  if (!payload || typeof payload !== "object") {
    return {
      ok: false,
      error: "BAD_PAYLOAD",
      message: "Thiếu payload FILL_ECARGO_VCT",
      warnings: [],
    };
  }
  const tabId = await findOrOpenEcargoTab({ active: true, pinned: true });
  await ensureEcargoContentReady(tabId);
  setWorkspace({ phase: "FILLING", message: "Đang điền eCargo VCT…", error: "" });
  const result = await sendToEcargoContent(tabId, {
    type: "FILL_ECARGO_VCT",
    payload,
  });
  if (!result || typeof result !== "object") {
    return {
      ok: false,
      error: "NO_CONTENT_RESPONSE",
      message: "Tab eCargo không trả lời lệnh điền. Reload Ext + F5 tab eCargo.",
      warnings: [],
      workspace,
      version: EXT_VERSION,
    };
  }
  setWorkspace(
    result?.ok
      ? { phase: "READY", message: result.message || "Đã điền eCargo" }
      : { phase: "ERROR", error: result?.message || "Điền eCargo thất bại" }
  );
  return { ...result, workspace, version: EXT_VERSION };
}

/** Poll content tới khi thấy ô OTP (sống qua reload sau Tạo phiếu). */
async function waitForEcargoOtpUi(tabId, timeoutMs = 45_000) {
  const started = Date.now();
  let lastErr = "";
  while (Date.now() - started < timeoutMs) {
    try {
      await injectEcargoContent(tabId);
      const res = await chrome.tabs.sendMessage(tabId, { type: "ECARGO_FIND_OTP_UI" });
      if (res?.ok || res?.found) {
        return { ok: true, ...res };
      }
      const ping = await chrome.tabs.sendMessage(tabId, { type: "ECARGO_PING" });
      if (ping?.hasOtpUi) return { ok: true, found: true, via: "ping" };
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err || "");
      try {
        await waitTabComplete(tabId, 8_000);
      } catch {
        /* keep polling */
      }
      try {
        await ensureEcargoContentReady(tabId);
      } catch {
        /* keep polling */
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return {
    ok: false,
    error: "NO_OTP_UI",
    message:
      lastErr ||
      "Không thấy ô OTP sau «Tạo phiếu». Kiểm tra tab eCargo / đăng nhập / popup.",
  };
}

/**
 * 3 pha: FILL_AND_CREATE → chờ OTP UI + IMAP → SUBMIT_OTP → lưu kết quả.
 * Background giữ luồng khi trang eCargo reload (content script chết).
 */
async function registerEcargoOnTab(payload) {
  await workspaceReady;
  if (!payload || typeof payload !== "object") {
    return {
      ok: false,
      error: "BAD_PAYLOAD",
      message: "Thiếu payload REGISTER_ECARGO_VCT",
      warnings: [],
    };
  }

  const apiBase = String(payload.apiBase || "").replace(/\/$/, "");
  const email = String(payload.header?.email || "").trim();
  const awbHint = payload.awbs?.[0]?.awb || "";
  const shipmentIds = Array.isArray(payload.shipmentIds)
    ? payload.shipmentIds.map(String)
    : [];
  if (!apiBase) {
    return {
      ok: false,
      error: "NO_API_BASE",
      message: "Thiếu apiBase để gọi /api/ecargo/otp/wait",
      warnings: [],
      version: EXT_VERSION,
    };
  }

  const tabId = await findOrOpenEcargoTab({ active: true, pinned: true });
  await ensureEcargoContentReady(tabId);
  setWorkspace({
    phase: "FILLING",
    message: "eCargo: điền form + Tạo phiếu…",
    error: "",
  });

  const createStartedIso = new Date().toISOString();
  let createRes;
  try {
    createRes = await sendToEcargoContent(tabId, {
      type: "ECARGO_FILL_AND_CREATE",
      payload,
    });
  } catch (err) {
    // Form POST/reload thường cắt kênh — sinceIso = lúc bắt đầu Tạo phiếu (không lùi 8s → tránh mail cũ).
    try {
      await waitTabComplete(tabId, 12_000);
      await ensureEcargoContentReady(tabId);
      const ping = await chrome.tabs.sendMessage(tabId, { type: "ECARGO_PING" });
      const leftCreate = Boolean(ping && ping.onCreate === false);
      createRes = {
        ok: true,
        navigatedAway: leftCreate,
        sinceIso: createStartedIso,
        warnings: [
          `Kênh content đứt sau Tạo phiếu (${err instanceof Error ? err.message : String(err)})${
            leftCreate ? " — đã rời trang Create." : " — vẫn trên Create, tiếp tục đọc mail."
          }`,
        ],
        phase: "create",
      };
    } catch {
      createRes = {
        ok: true,
        navigatedAway: true,
        sinceIso: createStartedIso,
        warnings: [
          `Tab có thể đã reload sau Tạo phiếu (${err instanceof Error ? err.message : String(err)}).`,
        ],
        phase: "create",
      };
    }
  }

  if (!createRes || typeof createRes !== "object") {
    return {
      ok: false,
      error: "NO_CONTENT_RESPONSE",
      message:
        "Tab eCargo không trả lời lệnh Tạo phiếu. Reload Ext v2.2.8 tại chrome://extensions, F5 Ops + tab eCargo.",
      warnings: [],
      workspace,
      version: EXT_VERSION,
      phase: "create",
    };
  }
  if (!createRes.ok && !createRes.navigatedAway) {
    setWorkspace({
      phase: "ERROR",
      error: createRes.message || "Tạo phiếu thất bại",
    });
    return { ...createRes, workspace, version: EXT_VERSION };
  }

  const sinceIso = String(createRes.sinceIso || createStartedIso).trim();
  const warnings = [...(createRes.warnings || [])];

  // Mail eCargo = mã alphanumeric + link «đây» → trang Xác Thực (bỏ chờ OTP UI trên Create).
  setWorkspace({
    phase: "FILLING",
    message: "eCargo: đọc mail xác thực (mã + link)…",
    error: "",
  });
  const otpRes = await ecargoOtpWait({
    apiBase,
    email,
    sinceIso,
    awbHint,
    timeoutMs: 90_000,
  });
  const code = String(otpRes?.code || otpRes?.otp || "").trim();
  const verifyUrl = String(otpRes?.verifyUrl || "").trim();
  if (!otpRes?.ok || (!code && !verifyUrl)) {
    setWorkspace({
      phase: "ERROR",
      error: otpRes?.message || "Không lấy được mail xác thực",
    });
    return {
      ok: false,
      error: otpRes?.error || "OTP_FAILED",
      message:
        otpRes?.message ||
        "Không lấy được mail xác thực eCargo (mã + link «đây») từ mailbox",
      phase: "otp_mail",
      sinceIso,
      warnings,
      workspace,
      version: EXT_VERSION,
    };
  }
  if (!verifyUrl) {
    setWorkspace({
      phase: "ERROR",
      error: "Mail có mã nhưng thiếu link xác thực",
    });
    return {
      ok: false,
      error: "NO_VERIFY_URL",
      message:
        `Đã có mã «${code.slice(0, 6)}…» nhưng không thấy link «đây» trong mail. ` +
        "Kiểm tra HTML mail eCargo / parser.",
      phase: "otp_mail",
      sinceIso,
      code,
      warnings,
      workspace,
      version: EXT_VERSION,
    };
  }

  setWorkspace({
    phase: "FILLING",
    message: "eCargo: mở link xác thực từ mail…",
    error: "",
  });
  try {
    await chrome.tabs.update(tabId, { url: verifyUrl, active: true });
    await waitTabComplete(tabId, 45_000);
  } catch (err) {
    setWorkspace({
      phase: "ERROR",
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      error: "VERIFY_NAV_FAILED",
      message:
        err instanceof Error
          ? err.message
          : "Không mở được trang xác thực từ link mail",
      phase: "otp_submit",
      sinceIso,
      verifyUrl,
      warnings,
      workspace,
      version: EXT_VERSION,
    };
  }

  setWorkspace({
    phase: "FILLING",
    message: "eCargo: bấm «Xác Thực»…",
    error: "",
  });
  await ensureEcargoContentReady(tabId);
  let submitRes;
  try {
    submitRes = await sendToEcargoContent(tabId, {
      type: "ECARGO_CONFIRM_VERIFY",
      payload: {
        code,
        otp: code,
        vctCode: otpRes.vctCode || "",
        apiBase,
        email,
        sinceIso,
        awbHint,
      },
    });
  } catch (err) {
    // POST Xác Thực thường reload — bắt kênh đứt rồi kiểm tra trang thành công.
    try {
      await waitTabComplete(tabId, 20_000);
      await ensureEcargoContentReady(tabId);
      const check = await chrome.tabs.sendMessage(tabId, {
        type: "ECARGO_CHECK_VERIFIED",
        payload: { vctCode: otpRes.vctCode || "" },
      });
      if (check?.verified || check?.ok) {
        submitRes = {
          ok: true,
          verified: true,
          message: `Đã xác thực phiếu${otpRes.vctCode ? `: ${otpRes.vctCode}` : ""}.`,
          vctCode: otpRes.vctCode || "",
          phase: "done",
          submit: true,
          warnings: [
            `Kênh đứt sau Xác Thực (${err instanceof Error ? err.message : String(err)}) — trang báo hoàn thành.`,
          ],
        };
      } else {
        throw err;
      }
    } catch (err2) {
      setWorkspace({
        phase: "ERROR",
        error: err2 instanceof Error ? err2.message : String(err2),
      });
      return {
        ok: false,
        error: "OTP_SUBMIT_FAILED",
        message:
          err2 instanceof Error
            ? err2.message
            : "Không xác nhận được sau khi bấm Xác Thực",
        phase: "otp_submit",
        sinceIso,
        verifyUrl,
        warnings,
        workspace,
        version: EXT_VERSION,
      };
    }
  }

  if (!submitRes || typeof submitRes !== "object") {
    return {
      ok: false,
      error: "NO_CONTENT_RESPONSE",
      message: "Tab eCargo không trả lời lệnh Xác Thực.",
      phase: "otp_submit",
      sinceIso,
      verifyUrl,
      warnings,
      workspace,
      version: EXT_VERSION,
    };
  }

  const finalOk = Boolean(submitRes.ok && submitRes.verified !== false);
  const vctCode = finalOk ? submitRes.vctCode || otpRes.vctCode || "" : "";
  if (shipmentIds.length) {
    await ecargoSaveResult({
      apiBase,
      shipmentIds,
      status: finalOk ? "done" : "error",
      vctCode,
      qrDataUrl: finalOk ? submitRes.qrDataUrl : "",
      awb: awbHint,
      error: finalOk ? "" : submitRes.message || "Chưa xác nhận hoàn thành xác thực",
      registeredAt: new Date().toISOString(),
    });
  }

  setWorkspace(
    finalOk
      ? { phase: "READY", message: submitRes.message || "Đã xác thực eCargo" }
      : { phase: "ERROR", error: submitRes.message || "Xác thực thất bại" }
  );
  return {
    ...submitRes,
    ok: finalOk,
    vctCode,
    phase: submitRes.phase || (finalOk ? "done" : "otp_submit"),
    sinceIso,
    verifyUrl,
    warnings: [...warnings, ...(submitRes.warnings || [])],
    otpSubject: otpRes.subject,
    workspace,
    version: EXT_VERSION,
  };
}

async function ecargoOtpWait(msg) {
  const apiBase = String(msg.apiBase || "").replace(/\/$/, "");
  if (!apiBase) {
    return { ok: false, error: "NO_API_BASE", message: "Thiếu apiBase" };
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Number(msg.timeoutMs) || 95_000);
  try {
    const res = await fetch(`${apiBase}/api/ecargo/otp/wait`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: msg.email,
        sinceIso: msg.sinceIso,
        awbHint: msg.awbHint,
        timeoutMs: msg.timeoutMs || 90_000,
      }),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: data.error || "OTP_HTTP",
        message: data.message || `OTP wait HTTP ${res.status}`,
      };
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

async function ecargoResultFromMail(msg) {
  const apiBase = String(msg.apiBase || "").replace(/\/$/, "");
  if (!apiBase) {
    return { ok: false, error: "NO_API_BASE", message: "Thiếu apiBase" };
  }
  const res = await fetch(`${apiBase}/api/ecargo/result-from-mail`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: msg.email,
      sinceIso: msg.sinceIso,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: data.error || "MAIL_HTTP",
      message: data.message || `result-from-mail HTTP ${res.status}`,
    };
  }
  return data;
}

async function ecargoSaveResult(msg) {
  const apiBase = String(msg.apiBase || "").replace(/\/$/, "");
  if (!apiBase) {
    return { ok: false, error: "NO_API_BASE", message: "Thiếu apiBase" };
  }
  const res = await fetch(`${apiBase}/api/ecargo/vct-result`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shipmentIds: msg.shipmentIds,
      status: msg.status,
      vctCode: msg.vctCode,
      qrDataUrl: msg.qrDataUrl,
      awb: msg.awb,
      error: msg.error,
      registeredAt: msg.registeredAt,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: data.error || "SAVE_HTTP",
      message: data.message || `vct-result HTTP ${res.status}`,
    };
  }
  return data;
}
