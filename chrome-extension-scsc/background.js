/**
 * TECSOPS — Kho SCSC eCargo (độc lập).
 * Chỉ VCT / OTP / QR trên ecargo.scsc.vn — không ESID.
 */

const ECARGO_CREATE_URL = "https://ecargo.scsc.vn/Export/VCTOrder/Create";
const EXT_VERSION = chrome.runtime.getManifest().version;
const EXPECTED_ECARGO_SCRIPT_VERSION = "2.2.14";
const WORKSPACE_KEY = "tecsopsScscEcargoWorkspace";
const PORTAL_WAREHOUSE = "SCSC";

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

const workspaceReady = chrome.storage.session.get([WORKSPACE_KEY]).then((saved) => {
  if (saved[WORKSPACE_KEY] && typeof saved[WORKSPACE_KEY] === "object") {
    workspace = { ...workspace, ...saved[WORKSPACE_KEY] };
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.info("[tecsops-ext-scsc] installed", EXT_VERSION);
});

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
          portalWarehouse: PORTAL_WAREHOUSE,
          workspace,
        })
      )
      .catch((err) => reply(errorResult("PING_FAILED", err)));
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

  if (msg.type === "ECARGO_LOOKUP_AGENT") {
    void withServiceWorkerKeepAlive(lookupEcargoAgentOnTab(msg.payload))
      .then(reply)
      .catch((err) => reply(errorResult("LOOKUP_FAILED", err)));
    return true;
  }

  if (msg.type === "ECARGO_OTP_WAIT") {
    void withServiceWorkerKeepAlive(ecargoOtpWait(msg.payload || msg))
      .then(reply)
      .catch((err) => reply(errorResult("OTP_FAILED", err)));
    return true;
  }

  /**
   * Stub / hook Ext-first: Ops (hoặc Gmail mapping sau này trên PC) đưa sẵn
   * `{ code, verifyUrl }` → Ext mở link + Xác Thực. Không chứa credential Gmail.
   */
  if (msg.type === "ECARGO_OTP_PROVIDE") {
    void withServiceWorkerKeepAlive(ecargoOtpProvide(msg.payload || msg))
      .then(reply)
      .catch((err) => reply(errorResult("OTP_PROVIDE_FAILED", err)));
    return true;
  }

  if (msg.type === "ECARGO_RESULT_FROM_MAIL") {
    void withServiceWorkerKeepAlive(ecargoResultFromMail(msg.payload || msg))
      .then(reply)
      .catch((err) => reply(errorResult("MAIL_RESULT_FAILED", err)));
    return true;
  }

  if (msg.type === "ECARGO_SAVE_RESULT") {
    void withServiceWorkerKeepAlive(ecargoSaveResult(msg.payload || msg))
      .then(reply)
      .catch((err) => reply(errorResult("SAVE_FAILED", err)));
    return true;
  }

  if (
    msg.type === "TCS_OPEN" ||
    msg.type === "TCS_BOOTSTRAP" ||
    msg.type === "TCS_SCAN_DATE" ||
    msg.type === "FILL_ESID"
  ) {
    reply({
      ok: false,
      error: "WRONG_EXTENSION",
      message:
        "Ext SCSC eCargo không hỗ trợ ESID — dùng Ext «TECSOPS — Kho TECS-TCS ESID» hoặc «Kho TCS ESID».",
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

async function lookupEcargoAgentOnTab(payload) {
  const filter = String(payload?.filter || payload?.agentName || "").trim();
  const tabId = await findOrOpenEcargoTab({ active: false, pinned: true });
  await ensureEcargoContentReady(tabId);
  const res = await sendToEcargoContent(tabId, {
    type: "ECARGO_LOOKUP_AGENT",
    payload: { filter, agentName: filter },
  });
  return { ...res, workspace, version: EXT_VERSION };
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
        "Tab eCargo không trả lời lệnh Tạo phiếu. Reload Ext v2.2.14 tại chrome://extensions, F5 Ops + tab eCargo.",
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

/**
 * Nhận mã + URL xác thực đã map sẵn (từ Ops hoặc reader Gmail trên PC sau này).
 * Không đọc IMAP / không lưu credential — chỉ điền trên tab eCargo.
 */
async function ecargoOtpProvide(msg) {
  const code = String(msg.code || msg.otp || "").trim();
  const verifyUrl = String(msg.verifyUrl || "").trim();
  const apiBase = String(msg.apiBase || "").replace(/\/$/, "");
  if (!code && !verifyUrl) {
    return {
      ok: false,
      error: "OTP_PROVIDE_EMPTY",
      message:
        "ECARGO_OTP_PROVIDE cần code và/hoặc verifyUrl (hook Gmail mapping trên Ext PC).",
      version: EXT_VERSION,
      portalWarehouse: PORTAL_WAREHOUSE,
    };
  }

  const tabId = await findOrOpenEcargoTab({ active: true, pinned: true });
  if (verifyUrl) {
    setWorkspace({
      phase: "FILLING",
      message: "eCargo: mở link xác thực (OTP provide)…",
      error: "",
    });
    await chrome.tabs.update(tabId, { url: verifyUrl, active: true });
    await waitTabComplete(tabId, 45_000);
  }

  await ensureEcargoContentReady(tabId);
  setWorkspace({
    phase: "FILLING",
    message: code
      ? "eCargo: điền mã xác thực (OTP provide)…"
      : "eCargo: Xác Thực (OTP provide)…",
    error: "",
  });

  let submitRes;
  try {
    submitRes = await sendToEcargoContent(tabId, {
      type: "ECARGO_CONFIRM_VERIFY",
      payload: {
        code,
        otp: code,
        vctCode: String(msg.vctCode || ""),
        apiBase,
        email: String(msg.email || ""),
        sinceIso: String(msg.sinceIso || ""),
        awbHint: String(msg.awbHint || ""),
      },
    });
  } catch (err) {
    try {
      await waitTabComplete(tabId, 20_000);
      await ensureEcargoContentReady(tabId);
      const check = await chrome.tabs.sendMessage(tabId, {
        type: "ECARGO_CHECK_VERIFIED",
        payload: { vctCode: String(msg.vctCode || "") },
      });
      if (check?.ok || check?.verified) {
        submitRes = {
          ok: true,
          verified: true,
          warnings: [
            `Kênh content đứt sau Xác Thực — trang đã xác thực (${
              err instanceof Error ? err.message : String(err)
            }).`,
          ],
        };
      } else {
        throw err;
      }
    } catch {
      throw err;
    }
  }

  const finalOk = Boolean(submitRes?.ok || submitRes?.verified);
  setWorkspace({
    phase: finalOk ? "READY" : "ERROR",
    message: finalOk
      ? "eCargo: đã Xác Thực qua OTP provide"
      : submitRes?.message || "OTP provide thất bại",
    error: finalOk ? "" : submitRes?.message || "OTP_PROVIDE_FAILED",
  });
  return {
    ok: finalOk,
    error: finalOk ? undefined : submitRes?.error || "OTP_PROVIDE_FAILED",
    message: submitRes?.message,
    code: code || undefined,
    verifyUrl: verifyUrl || undefined,
    phase: "otp_provide",
    source: "ecargo-otp-provide",
    warnings: submitRes?.warnings || [],
    workspace,
    version: EXT_VERSION,
    portalWarehouse: PORTAL_WAREHOUSE,
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

