/**
 * Điền / đăng ký eCargo VCT (Export) trên ecargo.scsc.vn.
 * FILL = chỉ điền; REGISTER = điền + Tạo phiếu + OTP + QR.
 *
 * Idempotent: tránh đăng ký listener 2 lần khi vừa manifest vừa executeScript.
 */

const SCRIPT_VERSION = "2.2.0";
const CREATE_PATH = "/Export/VCTOrder/Create";

if (globalThis.__TECSOPS_ECARGO_BOUND__) {
  // already installed
} else {
  globalThis.__TECSOPS_ECARGO_BOUND__ = true;
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg !== "object") return false;

    if (msg.type === "ECARGO_PING") {
      sendResponse({
        ok: true,
        scriptVersion: SCRIPT_VERSION,
        url: location.href,
        onCreate: location.pathname.includes(CREATE_PATH),
      });
      return true;
    }

    if (msg.type === "FILL_ECARGO_VCT") {
      void fillEcargoVct(msg.payload)
        .then(sendResponse)
        .catch((err) =>
          sendResponse({
            ok: false,
            error: "FILL_FAILED",
            message: err instanceof Error ? err.message : String(err || "Fill failed"),
            scriptVersion: SCRIPT_VERSION,
          })
        );
      return true;
    }

    if (msg.type === "REGISTER_ECARGO_VCT") {
      void registerEcargoVct(msg.payload)
        .then(sendResponse)
        .catch((err) =>
          sendResponse({
            ok: false,
            error: "REGISTER_FAILED",
            message: err instanceof Error ? err.message : String(err || "Register failed"),
            scriptVersion: SCRIPT_VERSION,
          })
        );
      return true;
    }

    return false;
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function setNativeValue(el, value) {
  if (!el) return false;
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  const next = value == null ? "" : String(value);
  if (desc?.set) desc.set.call(el, next);
  else el.value = next;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
  return true;
}

/** date input YYYY-MM-DD — set chắc cho validation eCargo. */
function setDateInput(el, ymd) {
  if (!el || !ymd) return false;
  setNativeValue(el, ymd);
  try {
    if (el.value !== ymd) {
      el.value = ymd;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  } catch {
    /* ignore */
  }
  return el.value === ymd;
}

/** select theo value (khung giờ 0..23). */
function setSelectValue(el, value) {
  if (!el) return false;
  const want = String(value);
  const idx = [...el.options].findIndex((o) => String(o.value) === want);
  if (idx < 0) return false;
  el.selectedIndex = idx;
  setNativeValue(el, want);
  try {
    if (window.jQuery) window.jQuery(el).val(want).trigger("change");
  } catch {
    /* ignore */
  }
  return String(el.value) === want;
}

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clickEl(el) {
  if (!el) return false;
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  el.click();
  return true;
}

function setRadioByName(name, value) {
  const nodes = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
  for (const node of nodes) {
    if (String(node.value) === String(value)) {
      node.checked = true;
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
      clickEl(node);
      return true;
    }
  }
  return false;
}

async function waitFor(selector, timeoutMs = 8_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const el = document.querySelector(selector);
    if (el) return el;
    await sleep(100);
  }
  return null;
}

function closeOpenMenus() {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  const body = document.body;
  if (body) clickEl(body);
}

async function pickAutocomplete(input, query, { requireSelect = false, timeoutMs = 1200 } = {}) {
  if (!input) return false;
  closeOpenMenus();
  await sleep(80);
  setNativeValue(input, "");
  input.focus();
  setNativeValue(input, query);
  // jQuery UI autocomplete thường nghe keyup
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowDown", bubbles: true }));

  const started = Date.now();
  const q = String(query || "")
    .trim()
    .toUpperCase();
  while (Date.now() - started < timeoutMs) {
    const items = [
      ...document.querySelectorAll(
        ".ui-autocomplete li.ui-menu-item:not(.ui-state-disabled), .ui-autocomplete .ui-menu-item-wrapper, ul.ui-autocomplete li"
      ),
    ].filter((el) => {
      const style = window.getComputedStyle(el.closest(".ui-autocomplete") || el);
      return style.display !== "none" && style.visibility !== "hidden";
    });
    let target = null;
    for (const item of items) {
      const text = String(item.textContent || "")
        .trim()
        .toUpperCase();
      if (!text) continue;
      if (text === q || text.includes(q) || q.includes(text.split(/\s+/)[0] || "")) {
        target = item;
        break;
      }
    }
    if (!target && items.length === 1) target = items[0];
    if (target) {
      clickEl(target);
      await sleep(220);
      return true;
    }
    await sleep(120);
  }

  if (requireSelect) return false;
  input.blur();
  return Boolean(input.value);
}

async function ensureCreatePage() {
  if (!location.pathname.includes(CREATE_PATH)) {
    throw new Error("Không ở trang Create VCT eCargo");
  }
  const agent = await waitFor("#txtAgentName", 10_000);
  if (!agent) throw new Error("Không thấy form eCargo (#txtAgentName)");
}

async function fillAgentName(agentName) {
  const input = document.querySelector("#txtAgentName");
  const ok = await pickAutocomplete(input, agentName, { requireSelect: false, timeoutMs: 1600 });
  const ident = String(document.querySelector("#txtAgentIdent")?.value || "0");
  if (ident === "0" || !ident) {
    // Thử gõ ngắn hơn để gợi ý hiện
    const short = String(agentName || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join(" ");
    if (short && short !== agentName) {
      await pickAutocomplete(input, short, { timeoutMs: 1600 });
    }
  }
  return {
    ok,
    agentIdent: String(document.querySelector("#txtAgentIdent")?.value || "0"),
    agentCode: String(document.querySelector("#txtAgentCode")?.value || ""),
    agentName: String(document.querySelector("#txtAgentName")?.value || ""),
  };
}

async function fillHeader(header) {
  const fills = {};
  const agent = await fillAgentName(header.agentName || "");
  fills.agentName = agent.ok || Boolean(agent.agentName);
  fills.agentIdent = agent.agentIdent;
  fills.agentPicName = setNativeValue(
    document.querySelector("#txtAgentPicName"),
    header.agentPicName
  );
  fills.agentPicIdType = setRadioByName("radAgentPicId", header.agentPicIdType || "CCCD");
  fills.agentPicId = setNativeValue(
    document.querySelector("#txtAgentPicId"),
    header.agentPicId
  );
  // Điền đúng ngày Ops gửi (cho phép cùng ngày bay). Format sai → hôm nay.
  let arrivalYmd = String(header.arrivalDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(arrivalYmd)) {
    arrivalYmd = todayYmd();
  }
  fills.arrivalDate = setDateInput(document.querySelector("#txtArrivalDate"), arrivalYmd);
  fills.arrivalDateValue = document.querySelector("#txtArrivalDate")?.value;
  const slot = String(header.arrivalTime ?? "8");
  fills.arrivalTime = setSelectValue(document.querySelector("#txtArrivalTime"), slot);
  fills.arrivalTimeValue = document.querySelector("#txtArrivalTime")?.value;
  fills.arrivalTimeText = document.querySelector("#txtArrivalTime")?.selectedOptions?.[0]?.text;
  fills.vehicleType = setRadioByName("radVehicleType", header.vehicleType || "OTO");
  fills.vehicleQuantity = setNativeValue(
    document.querySelector("#txtVehicleQuantity"),
    String(header.vehicleQuantity || 1)
  );
  fills.vehicleNo = setNativeValue(
    document.querySelector("#txtVehicleNo"),
    header.vehicleNo
  );
  fills.driverName = setNativeValue(
    document.querySelector("#txtDriverName"),
    header.driverName
  );
  fills.driverIdType = setRadioByName("radDriverId", header.driverIdType || "CCCD");
  fills.driverId = setNativeValue(document.querySelector("#txtDriverId"), header.driverId);
  fills.email = setNativeValue(document.querySelector("#txtEmail"), header.email);
  fills.mobilePhone = setNativeValue(
    document.querySelector("#txtMobilePhone"),
    header.mobilePhone
  );
  closeOpenMenus();
  await sleep(100);
  return fills;
}

async function openAwbModal() {
  closeOpenMenus();
  const btn = document.querySelector("#btnAddAwb");
  if (!btn) throw new Error("Không thấy nút Thêm AWB");
  clickEl(btn);
  const prefix = await waitFor("#txtPrefix", 5_000);
  if (!prefix) throw new Error("Modal Thêm AWB không mở");
  await sleep(200);
}

/** VJ842 → { carrier: VJ, flightNo: 842 } — ô số CB eCargo max 4 ký tự. */
function splitFlightDesignator(raw) {
  const compact = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!compact) return { carrier: "", flightNo: "" };
  const m = compact.match(/^([A-Z]{2}|[A-Z]\d|\d[A-Z])(\d{1,4})$/);
  if (m) return { carrier: m[1], flightNo: m[2] };
  return { carrier: compact.slice(0, 2), flightNo: compact.slice(2, 6) };
}

async function fillAwbLine(line) {
  const fills = {};
  // Carrier (#txtCarrier) + số chuyến (#txtFlightNo ≤4) — không điền cả VJ842 vào ô số
  const split = splitFlightDesignator(line.flightNo);
  const carrier = document.querySelector("#txtCarrier");
  if (carrier && split.carrier) {
    fills.carrier = await pickAutocomplete(carrier, split.carrier, { timeoutMs: 1000 });
  }
  fills.flightNo = setNativeValue(
    document.querySelector("#txtFlightNo"),
    split.flightNo
  );
  fills.flightNoValue = document.querySelector("#txtFlightNo")?.value;
  fills.carrierCode = split.carrier;
  fills.flightDate = setNativeValue(
    document.querySelector("#txtFlightDate"),
    line.flightDate
  );
  fills.flightDest = await pickAutocomplete(
    document.querySelector("#txtFlightDest"),
    line.flightDest,
    { timeoutMs: 1000 }
  );
  fills.prefix = setNativeValue(document.querySelector("#txtPrefix"), line.mawbPrefix);
  fills.mawbNo = setNativeValue(document.querySelector("#txtMawbNo"), line.mawbNo);
  fills.hawbNo = setNativeValue(
    document.querySelector("#txtHawbNo"),
    line.hawbNo || ""
  );
  fills.pieces = setNativeValue(
    document.querySelector("#txtPieces"),
    String(line.pieces ?? 99)
  );
  fills.weight = setNativeValue(
    document.querySelector("#txtWeight"),
    String(line.weight ?? 999)
  );
  const goods = String(line.goodsContent || "GARMENTS").trim().toUpperCase() || "GARMENTS";
  // Tên hàng: gõ thẳng, không bắt buộc chọn autocomplete
  fills.goods = setNativeValue(document.querySelector("#txtGoodsContent"), goods);
  fills.shc = await selectShc(line.shc || "KHÔNG CÓ");
  if (line.customIdent) {
    fills.customIdent = setNativeValue(
      document.querySelector("#txtCustomIdent"),
      line.customIdent
    );
  }
  return fills;
}

async function selectShc(label) {
  const want = String(label || "KHÔNG CÓ")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Đ/g, "D");
  const select = document.querySelector("select[name='SHCList']");
  if (select && select.tagName === "SELECT") {
    for (const opt of select.options) {
      const t = String(opt.textContent || opt.value || "")
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/Đ/g, "D");
      if (t === want || t.includes("KHONG CO") || t.includes(want)) {
        opt.selected = true;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        try {
          if (window.jQuery) window.jQuery(select).val(opt.value).trigger("change");
        } catch {
          /* ignore */
        }
        return true;
      }
    }
  }
  // Không chặn fill nếu SHC không tìm thấy — eCargo ghi chú có thể để trống / KHÔNG CÓ sau
  const hidden = document.querySelector("#txtSHC");
  if (hidden) setNativeValue(hidden, label || "KHÔNG CÓ");
  return false;
}

async function saveAndCloseAwb() {
  const btn =
    document.querySelector("#btnAddAndClose") ||
    document.querySelector("#btnAddAWB");
  if (!btn) throw new Error("Không thấy nút Save & Close AWB");
  // Đảm bảo nút visible (modal đang mở)
  if (btn.offsetParent === null && !document.querySelector("#txtPrefix")) {
    throw new Error("Modal AWB đã đóng trước khi lưu");
  }
  clickEl(btn);
  await sleep(500);
  // chờ modal đóng
  const started = Date.now();
  while (Date.now() - started < 3000) {
    const modalOpen = document.querySelector("#txtPrefix")?.offsetParent != null;
    if (!modalOpen) break;
    await sleep(100);
  }
}

async function fillEcargoVct(payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "BAD_PAYLOAD", message: "Thiếu payload FILL_ECARGO_VCT" };
  }
  await ensureCreatePage();
  const headerFills = await fillHeader(payload.header || {});
  const awbs = Array.isArray(payload.awbs) ? payload.awbs : [];
  if (!awbs.length) {
    return {
      ok: false,
      error: "NO_AWB",
      message: "Payload không có AWB để điền",
      scriptVersion: SCRIPT_VERSION,
      fills: headerFills,
    };
  }

  const awbResults = [];
  const warnings = [];
  if (String(headerFills.agentIdent || "0") === "0") {
    warnings.push(
      "Đại lý chưa khớp autocomplete (AgentIdent=0) — hãy chọn lại tên đại lý trên form trước khi Tạo phiếu."
    );
  }

  for (let i = 0; i < awbs.length; i += 1) {
    await openAwbModal();
    const fills = await fillAwbLine(awbs[i]);
    await saveAndCloseAwb();
    awbResults.push({ index: i, awb: awbs[i].awb, fills });
  }

  return {
    ok: true,
    message:
      `Đã điền eCargo: header + ${awbs.length} AWB. Kiểm tra rồi bấm «Tạo phiếu».` +
      (warnings.length ? ` ${warnings[0]}` : ""),
    scriptVersion: SCRIPT_VERSION,
    fills: headerFills,
    awbCount: awbs.length,
    awbResults,
    warnings,
    submit: false,
  };
}

function visibleValidationErrors() {
  const nodes = [
    ...document.querySelectorAll(
      ".field-validation-error, .validation-summary-errors li, .text-danger, .alert-danger"
    ),
  ];
  return nodes
    .map((n) => String(n.textContent || "").trim())
    .filter((t) => t && t.length < 200 && !/^\*$/.test(t));
}

function findCreateButton() {
  return (
    document.querySelector("#btnCreate") ||
    document.querySelector("input[type='submit'][value*='Tạo phiếu']") ||
    document.querySelector("input[type='button'][value*='Tạo phiếu']") ||
    [...document.querySelectorAll("button, input[type='submit']")].find((el) =>
      /tạo phiếu/i.test(el.value || el.textContent || "")
    )
  );
}

function findOtpInput() {
  const sels = [
    "#txtOTP",
    "#txtOtp",
    "#txtOtpCode",
    "input[name='OTP']",
    "input[name='OtpCode']",
    "input[name='otp']",
    "input[placeholder*='OTP' i]",
    "input[placeholder*='otp' i]",
  ];
  for (const s of sels) {
    const el = document.querySelector(s);
    if (el && el.offsetParent !== null) return el;
  }
  return (
    [...document.querySelectorAll("input[type='text'], input[type='number'], input[type='tel']")].find(
      (el) =>
        el.offsetParent !== null &&
        /otp|mã|code/i.test(
          `${el.name || ""} ${el.id || ""} ${el.placeholder || ""} ${el.getAttribute("aria-label") || ""}`
        )
    ) || null
  );
}

function findOtpConfirmButton() {
  const sels = ["#btnConfirmOTP", "#btnVerifyOTP", "#btnSubmitOTP"];
  for (const s of sels) {
    const el = document.querySelector(s);
    if (el) return el;
  }
  return (
    [...document.querySelectorAll("button, input[type='submit'], input[type='button']")].find((el) =>
      /xác nhận|xac nhan|verify|xác thực|xac thuc|confirm|gửi|submit/i.test(
        el.value || el.textContent || ""
      )
    ) || null
  );
}

async function waitForOtpInput(timeoutMs = 45_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const el = findOtpInput();
    if (el) return el;
    await sleep(250);
  }
  return null;
}

async function captureQrAndVctCode() {
  const out = { vctCode: "", qrDataUrl: "" };
  const bodyText = String(document.body?.innerText || "");
  const vctMatch = bodyText.match(/VCT[-\s]?[A-Z0-9]{4,}/i);
  if (vctMatch) out.vctCode = vctMatch[0].replace(/\s+/g, "").toUpperCase();
  for (const sel of [
    "img[src*='qr' i]",
    "img[id*='qr' i]",
    "#imgQR",
    ".qrcode img",
    "img[src*='QR']",
  ]) {
    const img = document.querySelector(sel);
    if (img?.src) {
      out.qrDataUrl = img.src;
      break;
    }
  }
  if (!out.qrDataUrl) {
    const canvas = document.querySelector("canvas");
    if (canvas && canvas.width > 40 && canvas.height > 40) {
      try {
        out.qrDataUrl = canvas.toDataURL("image/png");
      } catch {
        /* tainted */
      }
    }
  }
  const codeEl =
    document.querySelector("#lblVctNo") ||
    document.querySelector("#txtVctNo") ||
    document.querySelector(".vct-code");
  if (!out.vctCode && codeEl) {
    out.vctCode = String(codeEl.textContent || codeEl.value || "")
      .trim()
      .slice(0, 80);
  }
  return out;
}

function bgMessage(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (res) => {
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message));
        else resolve(res);
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Full auto: fill → Tạo phiếu → OTP (server IMAP) → QR → lưu Ops.
 */
async function registerEcargoVct(payload) {
  if (!payload || typeof payload !== "object") {
    return {
      ok: false,
      error: "BAD_PAYLOAD",
      message: "Thiếu payload REGISTER_ECARGO_VCT",
      scriptVersion: SCRIPT_VERSION,
    };
  }
  const apiBase = String(payload.apiBase || "").replace(/\/$/, "");
  const shipmentIds = Array.isArray(payload.shipmentIds)
    ? payload.shipmentIds.map(String)
    : [];
  if (!apiBase) {
    return {
      ok: false,
      error: "NO_API_BASE",
      message: "Thiếu apiBase để gọi /api/ecargo/otp/wait",
      scriptVersion: SCRIPT_VERSION,
    };
  }

  const fillRes = await fillEcargoVct(payload);
  if (!fillRes?.ok) return { ...fillRes, phase: "fill" };

  const errs = visibleValidationErrors();
  if (errs.length) {
    return {
      ok: false,
      error: "VALIDATION",
      message: `Form còn lỗi — chưa Tạo phiếu: ${errs.slice(0, 3).join(" | ")}`,
      scriptVersion: SCRIPT_VERSION,
      phase: "preflight",
      warnings: fillRes.warnings || [],
    };
  }

  const createBtn = findCreateButton();
  if (!createBtn) {
    return {
      ok: false,
      error: "NO_CREATE_BTN",
      message: "Không thấy nút «Tạo phiếu»",
      scriptVersion: SCRIPT_VERSION,
      phase: "submit",
    };
  }

  const sinceIso = new Date().toISOString();
  clickEl(createBtn);
  await sleep(600);

  const otpInput = await waitForOtpInput(45_000);
  if (!otpInput) {
    return {
      ok: false,
      error: "NO_OTP_UI",
      message:
        "Không thấy ô OTP sau «Tạo phiếu». Kiểm tra đăng nhập eCargo / validation form.",
      scriptVersion: SCRIPT_VERSION,
      phase: "otp_ui",
      sinceIso,
    };
  }

  const email = String(payload.header?.email || "").trim();
  const awbHint = payload.awbs?.[0]?.awb || "";
  const otpRes = await bgMessage({
    type: "ECARGO_OTP_WAIT",
    apiBase,
    email,
    sinceIso,
    awbHint,
    timeoutMs: 90_000,
  });
  if (!otpRes?.ok || !otpRes.otp) {
    return {
      ok: false,
      error: otpRes?.error || "OTP_FAILED",
      message: otpRes?.message || "Không lấy được OTP từ mailbox",
      scriptVersion: SCRIPT_VERSION,
      phase: "otp_mail",
      sinceIso,
    };
  }

  setNativeValue(otpInput, otpRes.otp);
  const confirmBtn = findOtpConfirmButton();
  if (confirmBtn) {
    clickEl(confirmBtn);
  } else {
    otpInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
  }
  await sleep(1500);

  let capture = await captureQrAndVctCode();
  if (!capture.qrDataUrl && !capture.vctCode) {
    await sleep(2000);
    capture = await captureQrAndVctCode();
  }

  // Fallback email xác nhận (P4)
  if (!capture.qrDataUrl || !capture.vctCode) {
    const mailRes = await bgMessage({
      type: "ECARGO_RESULT_FROM_MAIL",
      apiBase,
      email,
      sinceIso,
    });
    if (mailRes?.ok) {
      if (!capture.vctCode && mailRes.vctCode) capture.vctCode = mailRes.vctCode;
      if (!capture.qrDataUrl && mailRes.qrUrl) capture.qrDataUrl = mailRes.qrUrl;
    }
  }

  if (shipmentIds.length) {
    await bgMessage({
      type: "ECARGO_SAVE_RESULT",
      apiBase,
      shipmentIds,
      status: capture.vctCode || capture.qrDataUrl ? "done" : "error",
      vctCode: capture.vctCode,
      qrDataUrl: capture.qrDataUrl,
      awb: awbHint,
      error:
        capture.vctCode || capture.qrDataUrl
          ? ""
          : "Đã OTP nhưng chưa bắt được mã phiếu/QR — kiểm tra trang eCargo",
      registeredAt: new Date().toISOString(),
    });
  }

  const ok = Boolean(capture.vctCode || capture.qrDataUrl);
  return {
    ok,
    message: ok
      ? `Đã đăng ký eCargo${capture.vctCode ? `: ${capture.vctCode}` : ""}.`
      : "OTP xong nhưng chưa lấy được QR/mã phiếu",
    scriptVersion: SCRIPT_VERSION,
    phase: "done",
    vctCode: capture.vctCode,
    qrDataUrl: capture.qrDataUrl,
    sinceIso,
    warnings: fillRes.warnings || [],
    submit: true,
  };
}
