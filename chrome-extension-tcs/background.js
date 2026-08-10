/**
 * TECSOPS — Kho TCS ESID (độc lập).
 * Session / credential / tab tách hẳn Ext TECS-TCS. eCargo → Ext SCSC.
 */

const LOGIN_URL = "https://www.tcs.com.vn/AwbLogin";
const ESID_URL = "https://www.tcs.com.vn/Esid/Export";
const EXT_VERSION = chrome.runtime.getManifest().version;
const EXPECTED_SCRIPT_VERSION = "2.0.26";
/** Keys riêng — không đụng storage Ext TECS-TCS. */
const SESSION_KEY = "tecsopsTcsDirectSessionCredentials";
const LOCAL_KEY = "tecsopsTcsDirectRememberedCredentials";
const WORKSPACE_KEY = "tecsopsTcsDirectWorkspace";
const INDEX_KEY = "tecsopsTcsDirectWorkspaceIndex";
/** Cookie jar riêng kho TCS — khôi phục session khi Ext kho kia ghi đè. */
const COOKIE_JAR_KEY = "tecsopsTcsDirectCookieJar";
const PORTAL_WAREHOUSE = "TCS";

let workspace = {
  phase: "IDLE",
  logged_in: false,
  /** User đã ĐN thành công lần cuối trên Ext này — chống nhầm cookie kho TECS-TCS. */
  logged_in_username: "",
  /** Cookie portal bị ghi đè bởi Ext khác — thao tác kế tiếp phải khôi phục jar. */
  session_dirty: false,
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
    // Giữ jar cookie của kho này: thao tác kế tiếp sẽ khôi phục, không bắt ĐN lại.
    void workspaceReady.then(async () => {
      const hasJar = Boolean(await loadCookieJar(workspace.logged_in_username));
      setWorkspace({
        logged_in: hasJar ? workspace.logged_in : false,
        logged_in_username: hasJar ? workspace.logged_in_username : "",
        session_dirty: true,
        phase: "IDLE",
        message: hasJar
          ? `Kho khác đang dùng portal — session ${workspace.logged_in_username} sẽ tự khôi phục ở thao tác kế tiếp`
          : "Đã hủy session — ĐN lại đúng user kho trước khi Quét",
        error: "",
      });
      reply({ ok: true, workspace });
    });
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

/** Port agent local theo kho — TCS :8766, TECS-TCS :8765. */
function localAgentPortForWarehouse() {
  return PORTAL_WAREHOUSE === "TCS" ? 8766 : 8765;
}

/**
 * Danh sách endpoint OCR: ưu tiên port đúng kho, rồi port kia, rồi URL Ops truyền vào.
 * Mọi request gửi kèm X-Portal-Warehouse để proxy dual-agent không nhầm.
 */
function buildOcrAgentCandidates(agentBaseUrl) {
  const primary = localAgentPortForWarehouse();
  const secondary = primary === 8766 ? 8765 : 8766;
  const candidates = [
    `http://127.0.0.1:${primary}`,
    `http://localhost:${primary}`,
    `http://127.0.0.1:${secondary}`,
    `http://localhost:${secondary}`,
  ];
  const explicit = String(agentBaseUrl || "").trim().replace(/\/+$/, "");
  if (explicit) candidates.unshift(explicit);
  return [...new Set(candidates)];
}

async function solveCaptcha(dataUrl, agentBaseUrl, opts = {}) {
  if (!dataUrl) {
    return { ok: false, error: "CAPTCHA_IMAGE_EMPTY", text: "", confidence: 0 };
  }
  const minConfidence = Number(opts.minConfidence ?? 0.4);
  const candidates = buildOcrAgentCandidates(agentBaseUrl);
  let lastHardError = null;
  let lastSoft = null;
  for (const base of candidates) {
    try {
      const response = await fetch(`${base}/captcha/solve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Portal-Warehouse": PORTAL_WAREHOUSE,
        },
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

/* ------------------------------------------------------------------ *
 * Cách ly session: cookie tcs.com.vn dùng chung mọi Ext trong cùng
 * Chrome profile. Ext này giữ "jar" cookie riêng của kho mình, khôi
 * phục trước mỗi thao tác nên hai kho không phải ĐN lại khi đổi qua lại.
 * ------------------------------------------------------------------ */

const TCS_COOKIE_DOMAINS = [".tcs.com.vn", "tcs.com.vn", "www.tcs.com.vn"];
/** Tên cookie coi là session (dùng cho watcher tầng 3). */
const SESSION_COOKIE_PATTERN = /sess|auth|token|aspnet|asp\.net|jsession|\.tcs/i;
/** Bỏ qua cookies.onChanged khi chính Ext này đang ghi cookie. */
let cookieWriteQuietUntil = 0;

function quietCookieWatch(ms = 5_000) {
  cookieWriteQuietUntil = Math.max(cookieWriteQuietUntil, Date.now() + ms);
}

function cookieUrl(c) {
  const host = String(c.domain || "").replace(/^\./, "");
  return `http${c.secure ? "s" : ""}://${host}${c.path || "/"}`;
}

async function readTcsCookies() {
  if (!chrome.cookies?.getAll) return [];
  const seen = new Map();
  for (const domain of TCS_COOKIE_DOMAINS) {
    try {
      const list = await chrome.cookies.getAll({ domain });
      for (const c of list) {
        seen.set(`${c.domain}|${c.path}|${c.name}`, c);
      }
    } catch {
      /* ignore domain */
    }
  }
  return [...seen.values()];
}

async function clearTcsCookies() {
  if (!chrome.cookies?.getAll) return 0;
  quietCookieWatch(6_000);
  let removed = 0;
  for (const c of await readTcsCookies()) {
    try {
      const ok = await chrome.cookies.remove({ url: cookieUrl(c), name: c.name });
      if (ok) removed += 1;
    } catch {
      /* ignore single cookie */
    }
  }
  return removed;
}

/** Lưu cookie hiện tại thành jar của user kho này (sau khi ĐN/verify OK). */
async function saveCookieJar(username) {
  const user = String(username || "").trim();
  if (!user) return false;
  const cookies = (await readTcsCookies()).map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    secure: Boolean(c.secure),
    httpOnly: Boolean(c.httpOnly),
    hostOnly: Boolean(c.hostOnly),
    sameSite: c.sameSite,
    expirationDate: c.expirationDate,
  }));
  if (!cookies.length) return false;
  await chrome.storage.local.set({
    [COOKIE_JAR_KEY]: { username: user, cookies, saved_at: Date.now() },
  });
  return true;
}

async function loadCookieJar(username) {
  try {
    const saved = await chrome.storage.local.get(COOKIE_JAR_KEY);
    const jar = saved?.[COOKIE_JAR_KEY];
    if (!jar || !Array.isArray(jar.cookies) || jar.cookies.length === 0) return null;
    if (username && !sameUsername(jar.username, username)) return null;
    return jar;
  } catch {
    return null;
  }
}

/** Nạp lại cookie kho này, ghi đè session mà Ext kho khác vừa đặt. */
async function restoreCookieJar(username) {
  const jar = await loadCookieJar(username);
  if (!jar) return false;
  quietCookieWatch(12_000);
  await clearTcsCookies();
  let restored = 0;
  for (const c of jar.cookies) {
    const detail = {
      url: cookieUrl(c),
      name: c.name,
      value: c.value,
      path: c.path || "/",
      secure: Boolean(c.secure),
      httpOnly: Boolean(c.httpOnly),
    };
    if (!c.hostOnly && c.domain) detail.domain = c.domain;
    if (c.sameSite && c.sameSite !== "unspecified") detail.sameSite = c.sameSite;
    if (typeof c.expirationDate === "number") detail.expirationDate = c.expirationDate;
    try {
      if (await chrome.cookies.set(detail)) restored += 1;
    } catch {
      /* cookie đơn lẻ */
    }
  }
  quietCookieWatch(5_000);
  return restored > 0;
}

/** Tầng 3 — cookie đổi ngoài Ext này → đánh dấu bẩn, không tin cờ logged_in nữa. */
if (chrome.cookies?.onChanged) {
  chrome.cookies.onChanged.addListener((info) => {
    const domain = String(info?.cookie?.domain || "").replace(/^\./, "");
    if (!/(^|\.)tcs\.com\.vn$/i.test(domain)) return;
    if (Date.now() < cookieWriteQuietUntil) return;
    if (!SESSION_COOKIE_PATTERN.test(String(info?.cookie?.name || ""))) return;
    if (!workspace.logged_in || workspace.session_dirty) return;
    setWorkspace({
      session_dirty: true,
      message:
        `Cookie portal đổi ngoài Ext kho ${PORTAL_WAREHOUSE} — ` +
        "session sẽ được khôi phục ở thao tác kế tiếp",
    });
  });
}

/* ------------------------------------------------------------------ *
 * Tầng 4 — khoá liên-Ext: hai Ext cùng origin tcs.com.vn nên dùng
 * localStorage của portal làm mutex, tránh cắt cookie giữa chừng.
 * ------------------------------------------------------------------ */

const PORTAL_LOCK_KEY = "tecsops_portal_lock";
const PORTAL_LOCK_TTL_MS = 150_000;

function portalLockOwner() {
  return `${PORTAL_WAREHOUSE}:${chrome.runtime.id}`;
}

async function claimPortalLock(tabId, owner) {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [PORTAL_LOCK_KEY, owner, PORTAL_LOCK_TTL_MS],
    func: (key, own, ttl) => {
      let cur = null;
      try {
        cur = JSON.parse(localStorage.getItem(key) || "null");
      } catch {
        cur = null;
      }
      const now = Date.now();
      const alive = cur && typeof cur.ts === "number" && now - cur.ts < ttl;
      if (alive && cur.owner && cur.owner !== own) {
        return { ok: false, owner: String(cur.owner) };
      }
      localStorage.setItem(key, JSON.stringify({ owner: own, ts: now }));
      return { ok: true, owner: own };
    },
  });
  return res?.result || { ok: false, owner: "" };
}

async function acquirePortalLock(tabId, waitMs = 25_000) {
  const owner = portalLockOwner();
  const started = Date.now();
  for (;;) {
    let state;
    try {
      state = await claimPortalLock(tabId, owner);
    } catch {
      // Không eval được (tab đang điều hướng) — không chặn nghiệp vụ.
      return { ok: true, owner, degraded: true };
    }
    if (state.ok) return { ok: true, owner };
    if (Date.now() - started >= waitMs) return { ok: false, owner: state.owner };
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
}

async function releasePortalLock(tabId) {
  const owner = portalLockOwner();
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      args: [PORTAL_LOCK_KEY, owner],
      func: (key, own) => {
        try {
          const cur = JSON.parse(localStorage.getItem(key) || "null");
          if (!cur || cur.owner === own) localStorage.removeItem(key);
        } catch {
          localStorage.removeItem(key);
        }
      },
    });
  } catch {
    /* tab đã đóng */
  }
}

/** Chạy `fn` khi giữ khoá portal; Ext kho kia phải chờ. */
async function withPortalLock(tabId, fn, waitMs = 25_000) {
  const lock = await acquirePortalLock(tabId, waitMs);
  if (!lock.ok) {
    return {
      ok: false,
      error: "PORTAL_BUSY",
      message:
        `Ext kho khác (${lock.owner || "?"}) đang thao tác trên portal TCS — ` +
        "chờ xong rồi thử lại.",
      version: EXT_VERSION,
      portalWarehouse: PORTAL_WAREHOUSE,
      workspace,
    };
  }
  const beat = setInterval(() => {
    void claimPortalLock(tabId, lock.owner).catch(() => undefined);
  }, 30_000);
  try {
    return await fn();
  } finally {
    clearInterval(beat);
    if (!lock.degraded) await releasePortalLock(tabId);
  }
}

async function readLiveSessionUser(tabId) {
  try {
    await injectTcsContent(tabId);
    const identity = await sendToTcsContent(tabId, { type: "TCS_SESSION_IDENTITY" }, 3);
    const username = String(identity?.username || "").trim();
    return {
      loggedIn: Boolean(identity?.loggedIn),
      username,
      source: String(identity?.source || ""),
      // Chỉ tin username khi content script khẳng định chắc chắn.
      confident: Boolean(identity?.confident) && Boolean(username),
    };
  } catch {
    return { loggedIn: false, username: "", source: "error", confident: false };
  }
}

/**
 * Bằng chứng phiên hiện tại đúng là của kho này: cookie session trên browser
 * trùng khớp jar đã lưu. Không phụ thuộc việc đọc tên user trên trang.
 */
async function cookieJarMatchesCurrent(username) {
  const jar = await loadCookieJar(username);
  if (!jar) return false;
  const current = new Map(
    (await readTcsCookies()).map((c) => [`${c.domain}|${c.path}|${c.name}`, c.value])
  );
  let checked = 0;
  for (const c of jar.cookies) {
    if (!SESSION_COOKIE_PATTERN.test(String(c.name || ""))) continue;
    checked += 1;
    if (current.get(`${c.domain}|${c.path}|${c.name}`) !== c.value) return false;
  }
  return checked > 0;
}

/**
 * Tầng 1+2 — bảo đảm phiên portal đúng user kho này trước MỌI thao tác.
 * Thứ tự: kiểm tra identity live → khôi phục cookie jar của kho → (tùy chọn) ĐN lại.
 */
async function ensureWarehouseSession(tabId, expectedUser, opts = {}) {
  const { allowLogin = false, credentials = null, agentBaseUrl = "" } = opts;
  // Ops bản cũ chưa gửi expected_username → lấy user đã ĐN trên chính Ext này.
  const user = String(expectedUser || workspace.logged_in_username || "").trim();

  const accept = async (username, extra) => {
    setWorkspace({
      logged_in: true,
      logged_in_username: username,
      session_dirty: false,
      error: "",
      ...(extra || {}),
    });
    await saveCookieJar(username);
    return { ok: true, username };
  };

  await navigate(tabId, ESID_URL);
  let live = await readLiveSessionUser(tabId);
  /** Không đọc được tên user → chấp nhận nếu cookie trùng jar của kho. */
  const okForUser = (l) =>
    l.loggedIn && (l.confident ? sameUsername(l.username, user) : true);

  if (user && live.loggedIn && live.confident && sameUsername(live.username, user)) {
    return accept(user);
  }

  // Đang có phiên nhưng không đọc được là ai: chứng minh bằng cookie jar.
  if (user && live.loggedIn && !live.confident) {
    if (await cookieJarMatchesCurrent(user)) return accept(user);
  }

  // Session đang là user kho khác (hoặc đã mất) → nạp lại jar của kho này.
  if (user && (await restoreCookieJar(user))) {
    try {
      await chrome.tabs.reload(tabId);
      await waitTabComplete(tabId);
    } catch {
      /* tab đang điều hướng */
    }
    await navigate(tabId, ESID_URL);
    live = await readLiveSessionUser(tabId);
    if (okForUser(live)) {
      return accept(user, {
        message: `Đã khôi phục session ${user} (kho ${PORTAL_WAREHOUSE})`,
      });
    }
  }

  if (allowLogin && credentials?.username && credentials?.password) {
    setWorkspace({
      phase: "LOGIN",
      message: `Đang ĐN ${user || credentials.username} (kho ${PORTAL_WAREHOUSE})…`,
    });
    const login = await loginOnTcsTab(tabId, credentials, agentBaseUrl);
    if (!login?.ok) {
      setWorkspace({ logged_in: false, logged_in_username: "" });
      return {
        ok: false,
        error: login?.error || "LOGIN_FAILED",
        message: login?.message || "Đăng nhập thất bại",
      };
    }
    await navigate(tabId, ESID_URL);
    live = await readLiveSessionUser(tabId);
    if (!user || okForUser(live)) {
      return accept(user || String(credentials.username || "").trim());
    }
  }

  setWorkspace({ logged_in: false, logged_in_username: "" });
  const wrongUser = Boolean(user) && live.loggedIn && live.confident;
  return {
    ok: false,
    error: wrongUser ? "WRONG_USER" : "NEEDS_LOGIN",
    message: wrongUser
      ? `Portal đang là «${live.username}» thay vì «${user}» (kho ${PORTAL_WAREHOUSE}). ` +
        "Bấm «Đăng nhập» đúng user kho này rồi thử lại."
      : `Chưa có phiên hợp lệ cho kho ${PORTAL_WAREHOUSE}` +
        (user ? ` (${user})` : "") +
        " — bấm «Đăng nhập» trước.",
  };
}

async function logoutTcsTab(tabId) {
  try {
    await injectTcsContent(tabId);
    await sendToTcsContent(tabId, { type: "TCS_LOGOUT" }, 3);
  } catch {
    /* tab có thể đang chuyển trang */
  }
  await clearTcsCookies();
  setWorkspace({ logged_in: false, logged_in_username: "", phase: "IDLE" });
  try {
    await navigate(tabId, LOGIN_URL);
  } catch {
    /* ignore */
  }
  try {
    const live = await readLiveSessionUser(tabId);
    if (live.loggedIn) {
      await clearTcsCookies();
      await navigate(tabId, LOGIN_URL);
    }
  } catch {
    /* ignore */
  }
}

async function loginOnTcsTab(tabId, credentials, agentBaseUrl) {
  const expectedUser = String(credentials?.username || "").trim();
  const current = await chrome.tabs.get(tabId);
  const isLogin = /awblogin|\/login/i.test(current.url || "");
  if (!isLogin) {
    const live = await readLiveSessionUser(tabId);
    if (live.loggedIn) {
      // Reuse khi identity LIVE khớp expected, hoặc cookie trùng jar của kho.
      const reusable =
        expectedUser &&
        (live.confident
          ? sameUsername(live.username, expectedUser)
          : await cookieJarMatchesCurrent(expectedUser));
      if (reusable) {
        setWorkspace({
          logged_in: true,
          logged_in_username: expectedUser,
          session_dirty: false,
        });
        await saveCookieJar(expectedUser);
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
      // Không phụ thuộc agent headed cho ĐN: OCR lỗi / offline → điền user/pass, chờ CAPTCHA tay.
      if (
        solved.error === "OCR_AGENT_UNAVAILABLE" ||
        solved.error === "OCR_FAILED"
      ) {
        const manual = await sendToTcsContent(tabId, {
          type: "TCS_LOGIN",
          payload: { ...credentials, captcha: "" },
        });
        setWorkspace({
          phase: "LOGIN",
          message: "Đã điền user/password — nhập CAPTCHA trên tab TCS rồi Đăng nhập",
        });
        return {
          ...manual,
          ok: false,
          error: "CAPTCHA_REQUIRED",
          message:
            "Đã điền user/password trên tab TCS. Hãy nhập CAPTCHA (5 ký tự) rồi bấm Đăng nhập trên portal. " +
            "(OCR tùy chọn — không bắt buộc agent Playwright.)",
        };
      }
      lastMessage = "OCR chưa đủ tin cậy, đang đổi CAPTCHA";
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
        session_dirty: false,
      });
      await saveCookieJar(expectedUser);
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
  // Hết vòng OCR tự động — vẫn điền user/pass để user nhập CAPTCHA tay.
  try {
    await sendToTcsContent(tabId, {
      type: "TCS_LOGIN",
      payload: { ...credentials, captcha: "" },
    });
  } catch {
    /* ignore */
  }
  setWorkspace({
    phase: "LOGIN",
    message: "Nhập CAPTCHA trên tab TCS rồi Đăng nhập",
  });
  return {
    ok: false,
    error: "CAPTCHA_REQUIRED",
    message:
      lastMessage ||
      `Không đăng nhập tự động sau ${submittedAttempts} lần thử CAPTCHA. ` +
        "Đã điền user/password — hãy nhập CAPTCHA trên tab TCS rồi bấm Đăng nhập.",
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
  return withPortalLock(tabId, () =>
    bootstrapOnTab(tabId, payload, credentials, sessionDate, awbs, loginOnly)
  );
}

async function bootstrapOnTab(tabId, payload, credentials, sessionDate, awbs, loginOnly) {
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
      session_dirty: false,
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
  const nested = Boolean(opts.tabId);
  const tabId = opts.tabId || (await findOrOpenTcsTab({ active: true, pinned: true }));
  const run = async () => {
    const session = await ensureWarehouseSession(tabId, expectedUser, {
      allowLogin: Boolean(credentials.username && credentials.password),
      credentials,
      agentBaseUrl: payload.agent_base_url,
    });
    if (!session.ok) {
      setWorkspace({ phase: "ERROR", error: session.message });
      return { ...session, workspace };
    }
    return scanAuthorizedDate(tabId, sessionDate, awbs, session.username);
  };
  return nested ? run() : withPortalLock(tabId, run);
}

/** Quét khi phiên đã được `ensureWarehouseSession` xác thực đúng user kho. */
async function scanAuthorizedDate(tabId, sessionDate, awbs, sessionUsername) {
  setWorkspace({
    logged_in: true,
    logged_in_username: sessionUsername || workspace.logged_in_username,
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
  return withPortalLock(tabId, async () => {
    // Điền là thao tác GHI lên portal — bắt buộc đúng user kho, không tự ĐN.
    const session = await ensureWarehouseSession(tabId, payload.expected_username);
    if (!session.ok) {
      setWorkspace({ phase: "ERROR", error: session.message });
      return { ...session, warnings: [], workspace };
    }
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
  });
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
  return withPortalLock(tabId, async () => {
    const session = await ensureWarehouseSession(tabId, payload?.expected_username);
    if (!session.ok) {
      setWorkspace({ phase: "ERROR", error: session.message });
      return { ...session, workspace };
    }
    return downloadEsidPdfAuthorized(tabId, awb);
  });
}

/** Tải PDF khi phiên đã được xác thực đúng user kho. */
async function downloadEsidPdfAuthorized(tabId, awb) {
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
