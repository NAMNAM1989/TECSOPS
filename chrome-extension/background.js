/**
 * TECSOPS TCS workspace owner.
 *
 * Extension giữ một tab TCS được ghim và là controller duy nhất khi chạy
 * extension mode. Playwright chỉ là fallback do Ops quyết định.
 */

const LOGIN_URL = "https://www.tcs.com.vn/AwbLogin";
const ESID_URL = "https://www.tcs.com.vn/Esid/Export";
const EXT_VERSION = chrome.runtime.getManifest().version;
const EXPECTED_SCRIPT_VERSION = "2.0.9";
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return false;

  if (msg.type === "PING") {
    void workspaceReady.then(() =>
      sendResponse({
        ok: true,
        type: "PONG",
        version: EXT_VERSION,
        extensionId: chrome.runtime.id,
        workspace,
      })
    );
    return true;
  }

  if (msg.type === "TCS_OPEN") {
    void findOrOpenTcsTab({ active: true, pinned: true })
      .then((tabId) => sendResponse({ ok: true, tabId, workspace }))
      .catch((err) => sendResponse(errorResult("OPEN_FAILED", err)));
    return true;
  }

  if (msg.type === "TCS_BOOTSTRAP") {
    void bootstrapWorkspace(msg.payload || {})
      .then(sendResponse)
      .catch((err) => {
        setWorkspace({ phase: "ERROR", error: errorMessage(err) });
        sendResponse(errorResult("BOOTSTRAP_FAILED", err));
      });
    return true;
  }

  if (msg.type === "FILL_ESID") {
    void fillEsidOnTcsTab(msg.payload)
      .then(sendResponse)
      .catch((err) => sendResponse(errorResult("FILL_FAILED", err)));
    return true;
  }

  return false;
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

async function solveCaptcha(dataUrl, agentBaseUrl) {
  if (!dataUrl) {
    return { ok: false, error: "CAPTCHA_IMAGE_EMPTY", text: "", confidence: 0 };
  }
  const candidates = [];
  const explicit = String(agentBaseUrl || "").trim().replace(/\/+$/, "");
  if (explicit) candidates.push(explicit);
  candidates.push("http://127.0.0.1:8765", "http://localhost:8765");
  for (const base of [...new Set(candidates)]) {
    try {
      const response = await fetch(`${base}/captcha/solve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: dataUrl,
          expected_length: 5,
          min_confidence: 0.6,
        }),
      });
      const body = await response.json();
      if (response.ok && body?.ok && body.text) {
        return {
          ok: true,
          text: String(body.text),
          confidence: Number(body.confidence || 0),
          candidates: Array.isArray(body.candidates) ? body.candidates : [],
        };
      }
      if (response.status === 422) {
        return {
          ok: false,
          error: String(body?.error || "OCR_LOW_CONFIDENCE"),
          text: "",
          confidence: Number(body?.confidence || 0),
          candidates: Array.isArray(body?.candidates) ? body.candidates : [],
        };
      }
    } catch {
      // Thử endpoint kế tiếp.
    }
  }
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

  let submittedAttempts = 0;
  let sampledCaptchas = 0;
  let lastMessage = "";
  while (submittedAttempts < 3 && sampledCaptchas < 7) {
    const captcha = await sendToTcsContent(tabId, { type: "TCS_GET_CAPTCHA" });
    const dataUrl = captcha?.dataUrl || "";
    const solved = await solveCaptcha(dataUrl, agentBaseUrl);
    sampledCaptchas += 1;

    if (!solved.ok) {
      lastMessage =
        solved.error === "OCR_AGENT_UNAVAILABLE"
          ? "Không kết nối được OCR Agent"
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
          message: "Đã điền user/password. OCR Agent chưa sẵn sàng; hãy nhập CAPTCHA trên tab TCS.",
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

  await saveCredentials(credentials.username, credentials.password, payload.remember === true);
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
    message: `Đã quét ${scan.list_total || 0} dòng`,
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
