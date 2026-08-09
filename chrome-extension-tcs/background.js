/**
 * TECSOPS — Kho TCS ESID (độc lập).
 * Session / credential / tab tách hẳn Ext TECS-TCS. eCargo → Ext SCSC.
 */

const LOGIN_URL = "https://www.tcs.com.vn/AwbLogin";
const ESID_URL = "https://www.tcs.com.vn/Esid/Export";
const EXT_VERSION = chrome.runtime.getManifest().version;
const EXPECTED_SCRIPT_VERSION = "2.0.23";
/** Keys riêng — không đụng storage Ext TECS-TCS. */
const SESSION_KEY = "tecsopsTcsDirectSessionCredentials";
const LOCAL_KEY = "tecsopsTcsDirectRememberedCredentials";
const WORKSPACE_KEY = "tecsopsTcsDirectWorkspace";
const INDEX_KEY = "tecsopsTcsDirectWorkspaceIndex";
const PORTAL_WAREHOUSE = "TCS";

let workspace = {
  phase: "IDLE",
  logged_in: false,
  /** User đã ĐN thành công lần cuối trên Ext này — chống nhầm cookie kho TECS-TCS. */
  logged_in_username: "",
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
  console.info("[tecsops-ext-tcs-direct] installed", EXT_VERSION);
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
      .then(async () => {
        // Không suy ra logged_in chỉ từ cookie tab — cookie tcs.com.vn dùng chung
        // Ext TECS-TCS / TCS, dễ nhầm user. Chỉ tin logged_in_username sau ĐN Ops.
        if (
          workspace.logged_in &&
          !String(workspace.logged_in_username || "").trim()
        ) {
          setWorkspace({ logged_in: false, phase: "IDLE" });
        }
        reply({
          ok: true,
          type: "PONG",
          version: EXT_VERSION,
          extensionId: chrome.runtime.id,
          portalWarehouse: PORTAL_WAREHOUSE,
          workspace,
        });
      })
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

  if (msg.type === "TCS_SCAN_DATE") {
    void withServiceWorkerKeepAlive(scanWorkspaceDate(msg.payload || {}))
      .then(reply)
      .catch((err) => {
        setWorkspace({ phase: "ERROR", error: errorMessage(err) });
        reply(errorResult("SCAN_FAILED", err));
      });
    return true;
  }

  if (msg.type === "TCS_INVALIDATE_SESSION") {
    setWorkspace({
      logged_in: false,
      logged_in_username: "",
      phase: "IDLE",
      message: "Đã hủy session — ĐN lại đúng user kho trước khi Quét",
      error: "",
    });
    reply({ ok: true, workspace });
    return true;
  }

  if (msg.type === "FILL_ESID") {
    void withServiceWorkerKeepAlive(fillEsidOnTcsTab(msg.payload))
      .then(reply)
      .catch((err) => reply(errorResult("FILL_FAILED", err)));
    return true;
  }

  if (msg.type === "DOWNLOAD_ESID_PDF") {
    void withServiceWorkerKeepAlive(downloadEsidPdfOnTcsTab(msg.payload || {}))
      .then(reply)
      .catch((err) => reply(errorResult("DOWNLOAD_FAILED", err)));
    return true;
  }

  if (
    String(msg.type || "").startsWith("ECARGO_") ||
    msg.type === "FILL_ECARGO_VCT" ||
    msg.type === "REGISTER_ECARGO_VCT"
  ) {
    reply({
      ok: false,
      error: "WRONG_EXTENSION",
      message: "Ext kho TCS không hỗ trợ eCargo — cài Ext «TECSOPS — Kho SCSC eCargo».",
      version: EXT_VERSION,
      portalWarehouse: PORTAL_WAREHOUSE,
      workspace,
    });
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
  // Chỉ dùng tab do chính Ext này tạo/ghi workspace.tab_id — không nhặt tab của Ext kho khác.
  let tab = null;
  if (workspace.tab_id != null) {
    try {
      tab = await chrome.tabs.get(workspace.tab_id);
      const url = String(tab.url || "");
      if (!/tcs\.com\.vn/i.test(url)) tab = null;
    } catch {
      tab = null;
    }
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

function pickBestCaptchaCandidate(candidates, expectedLength = 5) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const normalized = candidates
    .map((item) => {
      if (typeof item === "string") {
        return { text: String(item).trim().toUpperCase(), votes: 1 };
      }
      return {
        text: String(item?.text || "")
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, ""),
        votes: Number(item?.votes || 1),
      };
    })
    .filter((item) => item.text);
  const exact = normalized
    .filter((item) => item.text.length === expectedLength)
    .sort((a, b) => b.votes - a.votes || a.text.localeCompare(b.text));
  return exact[0] || null;
}

async function solveCaptcha(dataUrl, agentBaseUrl, opts = {}) {
  if (!dataUrl) {
    return { ok: false, error: "CAPTCHA_IMAGE_EMPTY", text: "", confidence: 0 };
  }
  const minConfidence = Number(opts.minConfidence ?? 0.4);
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
  let lastSoft = null;
  for (const base of [...new Set(candidates)]) {
    try {
      const response = await fetch(`${base}/captcha/solve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: dataUrl,
          expected_length: 5,
          min_confidence: minConfidence,
          mode: "auto",
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body?.ok && body.text) {
        return {
          ok: true,
          text: String(body.text).trim().toUpperCase(),
          confidence: Number(body.confidence || 0),
          candidates: Array.isArray(body.candidates) ? body.candidates : [],
          agentBase: base,
        };
      }
      if (response.status === 422) {
        // Agent từ chối theo ngưỡng — vẫn thử ứng viên 5 ký tự có ≥2 phiếu.
        const best = pickBestCaptchaCandidate(body?.candidates, 5);
        if (best && best.votes >= 2) {
          return {
            ok: true,
            text: best.text,
            confidence: Math.max(Number(body?.confidence || 0), best.votes / 3),
            candidates: Array.isArray(body.candidates) ? body.candidates : [],
            agentBase: base,
            rescued: true,
          };
        }
        lastSoft = {
          ok: false,
          error: String(body?.error || "OCR_LOW_CONFIDENCE"),
          text: best?.text || "",
          confidence: Number(body?.confidence || 0),
          candidates: Array.isArray(body?.candidates) ? body.candidates : [],
          agentBase: base,
        };
        // Local đã trả lời 422 — không cần thử remote cùng ảnh.
        return lastSoft;
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
  if (lastSoft) return lastSoft;
  return { ok: false, error: "OCR_AGENT_UNAVAILABLE", text: "", confidence: 0 };
}

async function waitForCaptchaChange(tabId, previousDataUrl, timeoutMs = 1_600) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 100));
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

async function waitForLoginOutcome(tabId, previousDataUrl, timeoutMs = 8_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 120));
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
      // Chỉ tin message lỗi sau ≥600ms — tránh bắt toast cũ / rỗng làm fail sớm.
      if (status?.message && Date.now() - started > 600) {
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

function sameUsername(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

async function logoutTcsTab(tabId) {
  try {
    await injectTcsContent(tabId);
    await sendToTcsContent(tabId, { type: "TCS_LOGOUT" }, 3);
  } catch {
    /* tab có thể đang chuyển trang */
  }
  setWorkspace({ logged_in: false, logged_in_username: "", phase: "IDLE" });
  try {
    await navigate(tabId, LOGIN_URL);
  } catch {
    /* ignore */
  }
}

async function loginOnTcsTab(tabId, credentials, agentBaseUrl) {
  const expectedUser = String(credentials?.username || "").trim();
  const current = await chrome.tabs.get(tabId);
  const isLogin = /awblogin|\/login/i.test(current.url || "");
  if (!isLogin) {
    const ping = await sendToTcsContent(tabId, { type: "TCS_PING" });
    if (ping?.loggedIn) {
      // Cookie tcs.com.vn dùng chung giữa Ext TECS-TCS / TCS — chỉ reuse khi đúng user.
      if (
        expectedUser &&
        workspace.logged_in_username &&
        sameUsername(workspace.logged_in_username, expectedUser)
      ) {
        return { ok: true, alreadyLoggedIn: true, username: expectedUser };
      }
      await logoutTcsTab(tabId);
    } else {
      await navigate(tabId, LOGIN_URL);
    }
  }

  // Chờ form + ảnh CAPTCHA sẵn sàng (tránh lần 1 fail / lần 2 mới login)
  for (let i = 0; i < 25; i += 1) {
    try {
      const captcha = await sendToTcsContent(tabId, { type: "TCS_GET_CAPTCHA" }, 2);
      if (captcha?.dataUrl) break;
    } catch {
      /* trang đang hydrate */
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  let submittedAttempts = 0;
  let sampledCaptchas = 0;
  let lastMessage = "";
  while (submittedAttempts < 6 && sampledCaptchas < 8) {
    const captcha = await sendToTcsContent(tabId, { type: "TCS_GET_CAPTCHA" });
    const dataUrl = captcha?.dataUrl || "";
    if (!dataUrl) {
      lastMessage = "Chưa thấy ảnh CAPTCHA trên form TCS";
      await new Promise((resolve) => setTimeout(resolve, 200));
      sampledCaptchas += 1;
      continue;
    }
    // CAPTCHA TCS đơn giản — ưu tiên submit nhanh, chỉ nới thêm khi fail.
    const minConfidence = sampledCaptchas < 2 ? 0.4 : sampledCaptchas < 4 ? 0.34 : 0.28;
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
      lastMessage = "OCR đã đọc CAPTCHA nhưng ô CAPTCHA trên TCS chưa nhận đủ 5 ký tự.";
      await refreshCaptchaAndWait(tabId, dataUrl);
      continue;
    }

    const outcome = await waitForLoginOutcome(tabId, dataUrl);
    if (outcome.loggedIn) {
      setWorkspace({
        logged_in: true,
        logged_in_username: expectedUser,
      });
      return {
        ok: true,
        attempt: submittedAttempts,
        captchaConfidence: solved.confidence,
        username: expectedUser,
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
  const loginOnly = payload.login_only === true;
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
      message: "Thiếu ngày phiên Ops / ngày quét TCS.",
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

  if (loginOnly) {
    setWorkspace({
      logged_in: true,
      logged_in_username: credentials.username,
      phase: "READY",
      session_date: sessionDate,
      cache_count: 0,
      ready_count: 0,
      message: `Đã đăng nhập ${credentials.username} · ngày phiên ${sessionDate} — bấm Quét tiếp nhận khi cần`,
      error: "",
    });
    return {
      ok: true,
      logged_in: true,
      username: credentials.username,
      ready: [],
      source: "chrome-extension-tcs-direct",
      version: EXT_VERSION,
      workspace,
    };
  }

  return scanWorkspaceDate({ session_date: sessionDate, awbs }, { tabId });
}

async function scanWorkspaceDate(payload, opts = {}) {
  await workspaceReady;
  const sessionDate = String(payload.session_date || payload.sessionDate || "").trim();
  const awbs = Array.isArray(payload.awbs) ? payload.awbs : [];
  if (!sessionDate) {
    return {
      ok: false,
      error: "DATE_REQUIRED",
      message: "Thiếu ngày quét TCS.",
      workspace,
    };
  }
  const credentials = await loadCredentials(payload);
  const expectedUser = String(
    payload.expected_username || credentials.username || ""
  ).trim();
  const tabId = opts.tabId || (await findOrOpenTcsTab({ active: true, pinned: true }));
  // Cookie dùng chung 2 Ext — bắt buộc đúng user trước khi Quét.
  if (
    !expectedUser ||
    !workspace.logged_in_username ||
    !sameUsername(workspace.logged_in_username, expectedUser)
  ) {
    if (!credentials.username || !credentials.password) {
      setWorkspace({ logged_in: false, logged_in_username: "" });
      return {
        ok: false,
        error: "NEEDS_LOGIN",
        message:
          `Chưa ĐN đúng tài khoản kho ${PORTAL_WAREHOUSE}` +
          (expectedUser ? ` (${expectedUser})` : "") +
          " — bấm «Đăng nhập» trước khi Quét (tránh nhầm user kho kia).",
        workspace,
      };
    }
    setWorkspace({ phase: "LOGIN", message: `Đang ĐN ${expectedUser || credentials.username} trước khi Quét…` });
    const login = await loginOnTcsTab(tabId, credentials, payload.agent_base_url);
    if (!login?.ok) {
      setWorkspace({
        phase: "ERROR",
        logged_in: false,
        error: login?.message || "Đăng nhập thất bại trước khi Quét",
      });
      return { ...login, workspace };
    }
  }
  await navigate(tabId, ESID_URL);
  if (!workspace.logged_in || !sameUsername(workspace.logged_in_username, expectedUser)) {
    try {
      const ping = await sendToTcsContent(tabId, { type: "TCS_PING" }, 3);
      if (ping?.loggedIn && sameUsername(workspace.logged_in_username, expectedUser)) {
        setWorkspace({ logged_in: true });
      } else {
        return {
          ok: false,
          error: "NEEDS_LOGIN",
          message:
            `Session TCS không khớp user kho ${PORTAL_WAREHOUSE}` +
            (expectedUser ? ` (${expectedUser})` : "") +
            " — bấm «Đăng nhập» lại trước khi Quét.",
          workspace,
        };
      }
    } catch {
      return {
        ok: false,
        error: "NEEDS_LOGIN",
        message: "Chưa đăng nhập Ext — bấm «Đăng nhập» trước khi Quét tiếp nhận.",
        workspace,
      };
    }
  }
  setWorkspace({
    logged_in: true,
    phase: "SCANNING",
    session_date: sessionDate,
    message: `Đang quét ${sessionDate}…`,
    error: "",
  });
  const scan = await sendToTcsContent(tabId, {
    type: "TCS_SCAN_DATE",
    payload: { session_date: sessionDate, awbs },
  });
  if (!scan?.ok) {
    setWorkspace({
      phase: "ERROR",
      logged_in: true,
      error: scan?.message || "Quét TCS thất bại",
    });
    return { ...scan, logged_in: true, workspace };
  }
  const { index_rows: indexRows = [], ...scanResult } = scan;
  workspaceIndex = Array.isArray(indexRows) ? indexRows : [];
  await chrome.storage.session.set({ [INDEX_KEY]: workspaceIndex });
  const listTotal = Number(scan.list_total || scan.cache_count || 0);
  const receptionTotal = Number(scan.reception_total || 0);
  const readyCount = Number((scan.ready || []).length);
  setWorkspace({
    phase: "READY",
    logged_in: true,
    session_date: sessionDate,
    cache_count: listTotal,
    ready_count: readyCount,
    message: `Đã quét ${sessionDate}: ${listTotal} dòng · ${receptionTotal} HT · khớp ${readyCount} AWB`,
    error: "",
  });
  return {
    ...scanResult,
    ok: true,
    logged_in: true,
    reception_total: receptionTotal,
    list_total: listTotal,
    source: "chrome-extension-tcs-direct",
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

function debuggerSend(tabId, method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message || `debugger ${method} failed`));
        return;
      }
      resolve(result || {});
    });
  });
}

function debuggerAttach(tabId) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, "1.3", () => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message || "debugger.attach failed"));
        return;
      }
      resolve();
    });
  });
}

function debuggerDetach(tabId) {
  return new Promise((resolve) => {
    try {
      chrome.debugger.detach({ tabId }, () => resolve());
    } catch {
      resolve();
    }
  });
}

/**
 * MV3 service worker không có URL.createObjectURL — dùng trang extension tạm
 * rồi inject HTML phiếu ESID trước khi Page.printToPDF.
 */
async function printHtmlToPdfBase64(html, title) {
  const rawHtml = String(html || "");
  if (rawHtml.length < 40) {
    throw new Error("HTML phiếu ESID rỗng");
  }
  const frameUrl = chrome.runtime.getURL("print-frame.html");
  let tabId = null;
  try {
    const tab = await chrome.tabs.create({
      url: frameUrl,
      active: false,
      pinned: false,
    });
    tabId = tab.id;
    await waitTabComplete(tabId, 20_000);
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (raw, name) => {
        document.open();
        document.write(raw);
        document.close();
        document.title = String(name || "ESID").replace(/\.pdf$/i, "");
      },
      args: [rawHtml, String(title || "ESID").replace(/\.pdf$/i, "")],
    });
    // Cho layout/style kịp áp trước khi in
    await new Promise((r) => setTimeout(r, 400));
    await debuggerAttach(tabId);
    try {
      const result = await debuggerSend(tabId, "Page.printToPDF", {
        printBackground: true,
        preferCSSPageSize: true,
        paperWidth: 8.27,
        paperHeight: 11.69,
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0,
      });
      const data = String(result?.data || "");
      if (data.length < 80) {
        throw new Error("printToPDF trả về rỗng");
      }
      return data;
    } finally {
      await debuggerDetach(tabId);
    }
  } finally {
    if (tabId != null) {
      try {
        await chrome.tabs.remove(tabId);
      } catch {
        /* ignore */
      }
    }
  }
}

async function downloadEsidPdfOnTcsTab(payload) {
  await workspaceReady;
  const awb = String(payload?.awb || payload?.AWB || "").replace(/\D/g, "").slice(0, 11);
  if (awb.length !== 11) {
    return {
      ok: false,
      error: "VALIDATION",
      message: "AWB phải đủ 11 số",
      workspace,
    };
  }
  const tabId = await findOrOpenTcsTab({ active: true, pinned: true });
  await navigate(tabId, ESID_URL);
  if (!workspace.logged_in) {
    try {
      const ping = await sendToTcsContent(tabId, { type: "TCS_PING" }, 3);
      if (ping?.loggedIn) setWorkspace({ logged_in: true });
      else {
        return {
          ok: false,
          error: "NEEDS_LOGIN",
          message: "Chưa đăng nhập Ext kho TCS — bấm Đăng nhập trước khi tải PDF.",
          workspace,
        };
      }
    } catch {
      return {
        ok: false,
        error: "NEEDS_LOGIN",
        message: "Chưa đăng nhập Ext kho TCS — bấm Đăng nhập trước khi tải PDF.",
        workspace,
      };
    }
  }
  setWorkspace({
    logged_in: true,
    phase: "DOWNLOADING",
    message: `Đang tải PDF …${awb.slice(-8)}…`,
    error: "",
  });
  const extracted = await sendToTcsContent(tabId, {
    type: "DOWNLOAD_ESID_PDF",
    payload: { awb },
  });
  if (!extracted?.ok || !extracted.html) {
    setWorkspace({
      phase: "ERROR",
      error: extracted?.message || "Không lấy được phiếu ESID",
    });
    return { ...extracted, workspace };
  }
  const pdfName =
    String(extracted.pdf_name || "").replace(/^.*[/\\]/, "") ||
    `${awb.slice(0, 3)}-${awb.slice(3)}_ESID.pdf`;
  try {
    const pdfBase64 = await printHtmlToPdfBase64(extracted.html, pdfName);
    const dataUrl = `data:application/pdf;base64,${pdfBase64}`;
    try {
      await chrome.downloads.download({
        url: dataUrl,
        filename: pdfName,
        saveAs: false,
        conflictAction: "uniquify",
      });
    } catch {
      /* Ops vẫn tải qua pdf_base64 */
    }
    setWorkspace({
      phase: "READY",
      message: `Đã tải PDF ${pdfName}`,
      error: "",
    });
    return {
      ok: true,
      awb,
      pdf_name: pdfName,
      pdf_base64: pdfBase64,
      downloaded: true,
      source: "chrome-extension-tcs-direct",
      version: EXT_VERSION,
      scriptVersion: extracted.scriptVersion,
      message: `Ext kho TCS đã lưu ${pdfName}`,
      workspace,
    };
  } catch (err) {
    const message = errorMessage(err);
    setWorkspace({ phase: "ERROR", error: message });
    return {
      ok: false,
      error: "PDF_RENDER_FAILED",
      message: `Lấy phiếu OK nhưng không tạo PDF: ${message}`,
      workspace,
    };
  }
}
