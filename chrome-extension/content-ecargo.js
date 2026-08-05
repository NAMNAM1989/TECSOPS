/**
 * Điền / đăng ký eCargo VCT (Export) trên ecargo.scsc.vn.
 * FILL = chỉ điền.
 * Đăng ký 1-click do background điều phối 3 pha:
 *   ECARGO_FILL_AND_CREATE → (BG chờ OTP UI + IMAP) → ECARGO_SUBMIT_OTP
 *
 * Listener đăng ký 1 lần; handler gắn globalThis để inject lại (executeScript)
 * luôn cập nhật bản mới — tránh kẹt listener cũ.
 */

const SCRIPT_VERSION = "2.2.6";
const CREATE_PATH = "/Export/VCTOrder/Create";

globalThis.__TECSOPS_ECARGO_VERSION__ = SCRIPT_VERSION;
globalThis.__TECSOPS_ECARGO_HANDLER__ = function tecsopsEcargoOnMessage(msg, _sender, sendResponse) {
  if (!msg || typeof msg !== "object") return false;

  if (msg.type === "ECARGO_PING") {
    sendResponse({
      ok: true,
      scriptVersion: SCRIPT_VERSION,
      url: location.href,
      onCreate: location.pathname.includes(CREATE_PATH),
      hasOtpUi: Boolean(findOtpInput()),
    });
    return true;
  }

  if (msg.type === "ECARGO_FIND_OTP_UI") {
    const input = findOtpInput();
    sendResponse({
      ok: Boolean(input),
      found: Boolean(input),
      scriptVersion: SCRIPT_VERSION,
      url: location.href,
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

  if (msg.type === "ECARGO_FILL_AND_CREATE") {
    void fillAndCreateEcargoVct(msg.payload)
      .then(sendResponse)
      .catch((err) =>
        sendResponse({
          ok: false,
          error: "CREATE_FAILED",
          message: err instanceof Error ? err.message : String(err || "Create failed"),
          scriptVersion: SCRIPT_VERSION,
          phase: "create",
        })
      );
    return true;
  }

  if (msg.type === "ECARGO_SUBMIT_OTP") {
    void submitEcargoOtp(msg.payload)
      .then(sendResponse)
      .catch((err) =>
        sendResponse({
          ok: false,
          error: "OTP_SUBMIT_FAILED",
          message: err instanceof Error ? err.message : String(err || "OTP submit failed"),
          scriptVersion: SCRIPT_VERSION,
          phase: "otp_submit",
        })
      );
    return true;
  }

  // Backward-compat: không còn chạy full OTP trong content (dễ chết khi reload).
  if (msg.type === "REGISTER_ECARGO_VCT") {
    void fillAndCreateEcargoVct(msg.payload)
      .then((res) =>
        sendResponse({
          ...res,
          message:
            (res?.message || "Đã Tạo phiếu") +
            " — background sẽ lấy OTP (cần Ext v2.2.6+).",
          needsBackgroundOtp: true,
        })
      )
      .catch((err) =>
        sendResponse({
          ok: false,
          error: "CREATE_FAILED",
          message: err instanceof Error ? err.message : String(err || "Create failed"),
          scriptVersion: SCRIPT_VERSION,
          phase: "create",
        })
      );
    return true;
  }

  return false;
};

if (!globalThis.__TECSOPS_ECARGO_LISTENER__) {
  globalThis.__TECSOPS_ECARGO_LISTENER__ = true;
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const handler = globalThis.__TECSOPS_ECARGO_HANDLER__;
    if (typeof handler === "function") {
      return handler(msg, sender, sendResponse);
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

function normAgentText(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

/** Chỉ khớp tuyệt đối (không «gần giống»). */
function agentTextExact(a, b) {
  return normAgentText(a) === normAgentText(b);
}

/** Chỉ lấy li.ui-menu-item (tránh đếm trùng wrapper). */
function listAgentAutocompleteItems() {
  const menus = [...document.querySelectorAll("ul.ui-autocomplete")].filter((ul) => {
    const style = window.getComputedStyle(ul);
    return style.display !== "none" && style.visibility !== "hidden";
  });
  const out = [];
  for (const ul of menus) {
    for (const li of ul.querySelectorAll(":scope > li.ui-menu-item")) {
      if (li.classList.contains("ui-state-disabled")) continue;
      out.push(li);
    }
  }
  if (!out.length) {
    return [...document.querySelectorAll(".ui-autocomplete li.ui-menu-item")].filter((li) => {
      const root = li.closest(".ui-autocomplete") || li;
      const style = window.getComputedStyle(root);
      return style.display !== "none" && style.visibility !== "hidden";
    });
  }
  return out;
}

function agentItemLabel(li) {
  const wrap = li.querySelector(".ui-menu-item-wrapper");
  return String((wrap || li).textContent || "").trim();
}

function getJQuery() {
  return window.jQuery || window.$ || null;
}

function dismissAutocompleteMenus() {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
  );
  const $ = getJQuery();
  if ($ && $.fn && typeof $.fn.autocomplete === "function") {
    try {
      const input = document.querySelector("#txtAgentName");
      if (input) $(input).autocomplete("close");
    } catch {
      /* ignore */
    }
  }
  closeOpenMenus();
}

/** Gõ đúng chuỗi cung cấp để mở list (không cắt ngắn). */
async function typeExactIntoInput(input, exact) {
  const value = String(exact || "");
  input.focus();
  const $ = getJQuery();
  if ($ && $.fn && typeof $.fn.autocomplete === "function") {
    try {
      const $input = $(input);
      $input.val(value);
      $input.trigger("focus");
      $input.autocomplete("search", value);
      await sleep(220);
      return;
    } catch {
      /* fallback */
    }
  }
  setNativeValue(input, "");
  input.focus();
  let acc = "";
  for (const ch of value) {
    acc += ch;
    setNativeValue(input, acc);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(
      new KeyboardEvent("keyup", { key: ch, bubbles: true, cancelable: true })
    );
    await sleep(25);
  }
  await sleep(160);
}

async function selectAgentMenuItemExact(input, li, exactName) {
  if (!li) return false;
  const label = agentItemLabel(li);
  // Chặn chọn dòng khác tên đã cung cấp
  if (!agentTextExact(label, exactName)) return false;

  const $ = getJQuery();
  const target = li.querySelector(".ui-menu-item-wrapper") || li;
  if ($ && $.fn) {
    try {
      const $input = $(input);
      const inst = $input.data("ui-autocomplete");
      if (inst && typeof inst._trigger === "function") {
        $input.trigger("focus");
        inst._trigger("select", "autocompleteselect", {
          item: { label, value: label },
        });
        await sleep(250);
      }
    } catch {
      /* click */
    }
  }
  target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
  target.click();
  await sleep(280);
  // Sau select: nếu web đổi sang tên khác → khôi phục đúng chuỗi cung cấp
  if (!agentTextExact(input.value, exactName)) {
    setNativeValue(input, exactName);
    return false;
  }
  return true;
}

async function ensureCreatePage() {
  if (!location.pathname.includes(CREATE_PATH)) {
    throw new Error("Không ở trang Create VCT eCargo");
  }
  const agent = await waitFor("#txtAgentName", 10_000);
  if (!agent) throw new Error("Không thấy form eCargo (#txtAgentName)");
}

function readAgentIdent() {
  return String(document.querySelector("#txtAgentIdent")?.value || "0").trim();
}

/**
 * Điền ĐÚNG tên đại lý đã cung cấp.
 * Không chọn gợi ý «gần giống». Chỉ bấm gợi ý khi chữ khớp tuyệt đối.
 */
async function fillAgentName(agentName) {
  const input = document.querySelector("#txtAgentName");
  const exact = String(agentName || "").trim();
  if (!input || !exact) {
    return {
      ok: false,
      agentIdent: "0",
      agentCode: "",
      agentName: "",
      exact: false,
    };
  }

  closeOpenMenus();
  await sleep(40);
  const identEl = document.querySelector("#txtAgentIdent");
  if (identEl) setNativeValue(identEl, "0");

  // 1) Gõ nguyên văn hồ sơ Ops
  await typeExactIntoInput(input, exact);

  // 2) Chỉ chọn dòng gợi ý TRÙNG KHỚP 100% (để lấy AgentIdent). Không chọn dòng khác.
  let boundIdent = false;
  const started = Date.now();
  while (Date.now() - started < 2200) {
    const exactLi = listAgentAutocompleteItems().find((li) =>
      agentTextExact(agentItemLabel(li), exact)
    );
    if (exactLi) {
      boundIdent = await selectAgentMenuItemExact(input, exactLi, exact);
      if (boundIdent) break;
    }
    await sleep(120);
  }

  // 3) Đóng list — tránh web/jQuery tự nhảy sang dòng khác
  dismissAutocompleteMenus();
  await sleep(80);

  // 4) Ép lại đúng chuỗi cung cấp (ưu tiên tuyệt đối so với gợi ý gần giống)
  const lockExactName = () => {
    if (!agentTextExact(input.value, exact)) {
      setNativeValue(input, exact);
    }
  };
  lockExactName();
  // blur/change của eCargo đôi khi tự chọn dòng gần giống → khóa lại sau vài nhịp
  for (let i = 0; i < 4; i += 1) {
    await sleep(120);
    dismissAutocompleteMenus();
    lockExactName();
  }

  const finalName = String(document.querySelector("#txtAgentName")?.value || "");
  const exactOk = agentTextExact(finalName, exact);
  if (!exactOk && identEl) setNativeValue(identEl, "0");
  return {
    ok: exactOk,
    exact: exactOk,
    agentIdent: readAgentIdent(),
    agentCode: String(document.querySelector("#txtAgentCode")?.value || ""),
    agentName: exactOk ? exact : finalName,
  };
}

/** Autocomplete DEST/carrier — chỉ chọn khi khớp đúng chuỗi; không thì ghi đúng giá trị đã cho. */
async function pickAutocomplete(input, query, { timeoutMs = 1200 } = {}) {
  if (!input) return false;
  const q = String(query || "").trim();
  if (!q) return false;
  closeOpenMenus();
  await sleep(50);
  await typeExactIntoInput(input, q);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const exactLi = listAgentAutocompleteItems().find((li) =>
      agentTextExact(agentItemLabel(li), q)
    );
    if (exactLi) {
      const target = exactLi.querySelector(".ui-menu-item-wrapper") || exactLi;
      target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      target.click();
      await sleep(200);
      break;
    }
    await sleep(100);
  }
  dismissAutocompleteMenus();
  if (!agentTextExact(input.value, q)) setNativeValue(input, q);
  return agentTextExact(input.value, q);
}

async function fillHeader(header) {
  const fills = {};
  // Đại lý / NV / giấy tờ: điền đúng giá trị Ops gửi — không thay bằng gợi ý gần giống.
  const agent = await fillAgentName(header.agentName || "");
  fills.agentName = agent.ok;
  fills.agentExact = agent.exact;
  fills.agentIdent = agent.agentIdent;
  fills.agentNameValue = agent.agentName;
  const picName = String(header.agentPicName || "").trim();
  const picId = String(header.agentPicId || "").trim();
  fills.agentPicName = setNativeValue(
    document.querySelector("#txtAgentPicName"),
    picName
  );
  fills.agentPicIdType = setRadioByName("radAgentPicId", header.agentPicIdType || "CCCD");
  fills.agentPicId = setNativeValue(
    document.querySelector("#txtAgentPicId"),
    picId
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
  const wantAgent = String(payload.header?.agentName || "").trim();
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

  // Bắt buộc ô đại lý = đúng chuỗi Ops cung cấp (không chấp nhận tên gợi ý khác).
  if (wantAgent && !agentTextExact(headerFills.agentNameValue || "", wantAgent)) {
    return {
      ok: false,
      error: "AGENT_MISMATCH",
      message:
        `Tên đại lý trên form («${headerFills.agentNameValue || ""}») không khớp hồ sơ («${wantAgent}»). ` +
        "Ext không được nhảy theo gợi ý gần giống — Reload Ext v2.2.6 rồi thử lại.",
      scriptVersion: SCRIPT_VERSION,
      fills: headerFills,
      warnings: [],
    };
  }

  const awbResults = [];
  const warnings = [];
  if (wantAgent && String(headerFills.agentIdent || "0") === "0") {
    warnings.push(
      "Đã điền đúng tên đại lý nhưng eCargo chưa gắn AgentIdent (list không có dòng trùng khớp). Kiểm tra trước khi Tạo phiếu."
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
    message: `Đã điền đúng đại lý «${wantAgent || headerFills.agentNameValue}» + ${awbs.length} AWB.`,
    scriptVersion: SCRIPT_VERSION,
    fills: headerFills,
    awbCount: awbs.length,
    awbResults,
    warnings,
    submit: false,
  };
}

function isDomVisible(el) {
  if (!el || !(el instanceof Element)) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** Chỉ lỗi validation thật sự đang hiện — không quét mọi `.text-danger` (hay dính nhãn/help). */
function visibleValidationErrors() {
  const nodes = [
    ...document.querySelectorAll(
      ".field-validation-error, .validation-summary-errors li, .validation-summary-errors, .alert-danger, span[data-valmsg-for]"
    ),
  ];
  const out = [];
  const seen = new Set();
  for (const n of nodes) {
    if (!isDomVisible(n)) continue;
    // ASP.NET unobtrusive: field-validation-valid = OK
    if (n.classList.contains("field-validation-valid")) continue;
    const t = String(n.textContent || "").replace(/\s+/g, " ").trim();
    if (!t || t.length > 220 || /^\*$/.test(t)) continue;
    // Bỏ nhãn không phải lỗi
    if (/^(otp|lưu ý|note|ghi chú)\b/i.test(t) && t.length < 12) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function findCreateButton() {
  const candidates = [
    document.querySelector("#btnCreate"),
    document.querySelector("input#btnCreate"),
    document.querySelector("input[type='submit'][value*='Tạo phiếu']"),
    document.querySelector("input[type='button'][value*='Tạo phiếu']"),
    document.querySelector("button#btnCreate"),
    ...document.querySelectorAll(
      "button, input[type='submit'], input[type='button'], a.btn, a.button"
    ),
  ].filter(Boolean);
  for (const el of candidates) {
    const label = String(el.value || el.textContent || el.getAttribute("title") || "")
      .replace(/\s+/g, " ")
      .trim();
    if (/tạo\s*phiếu|tao\s*phieu|create/i.test(label) || el.id === "btnCreate") {
      return el;
    }
  }
  return null;
}

/** Xóa span lỗi client cũ (tránh chặn nhầm trước/ sau Tạo phiếu). */
function clearClientValidationUi() {
  for (const n of document.querySelectorAll(
    ".field-validation-error, .field-validation-valid, span[data-valmsg-for], .validation-summary-errors li"
  )) {
    try {
      n.textContent = "";
      n.classList.remove("field-validation-error");
      if (n.matches("span[data-valmsg-for], .field-validation-valid, .field-validation-error")) {
        n.classList.add("field-validation-valid");
      }
    } catch {
      /* ignore */
    }
  }
  for (const box of document.querySelectorAll(".validation-summary-errors, .alert-danger")) {
    if (!isDomVisible(box)) continue;
    // Không xóa alert server thật nếu có nhiều nội dung dài — chỉ xóa summary rỗng/ngắn
    const t = String(box.textContent || "").trim();
    if (!t || t.length < 180) {
      try {
        box.innerHTML = "";
        box.style.display = "none";
      } catch {
        /* ignore */
      }
    }
  }
}

/** Kích hoạt lại change để form nhận giá trị đã điền trước khi Tạo phiếu. */
function settleFilledFields() {
  const sels = [
    "#txtAgentName",
    "#txtAgentPicName",
    "#txtAgentPicId",
    "#txtArrivalDate",
    "#txtArrivalTime",
    "#txtVehicleNo",
    "#txtVehicleQuantity",
    "#txtDriverName",
    "#txtDriverId",
    "#txtEmail",
    "#txtMobilePhone",
  ];
  for (const sel of sels) {
    const el = document.querySelector(sel);
    if (!el) continue;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

/**
 * Bấm «Tạo phiếu» — jQuery click + DOM click; mở nút nếu bị disabled.
 * Trả về true nếu đã gửi lệnh click.
 */
async function clickCreateOrder() {
  dismissAutocompleteMenus();
  await sleep(80);
  // Nếu chưa gắn AgentIdent mà tên đã đúng — thử chọn lại dòng khớp tuyệt đối trước khi submit.
  const agentInput = document.querySelector("#txtAgentName");
  const agentName = String(agentInput?.value || "").trim();
  if (agentInput && agentName && readAgentIdent() === "0") {
    await fillAgentName(agentName);
  }
  settleFilledFields();
  clearClientValidationUi();
  await sleep(100);

  const btn = findCreateButton();
  if (!btn) return { ok: false, error: "NO_CREATE_BTN" };

  try {
    if ("disabled" in btn) btn.disabled = false;
    btn.removeAttribute("disabled");
    btn.classList.remove("disabled");
  } catch {
    /* ignore */
  }

  const $ = getJQuery();
  if ($ && $.fn) {
    try {
      $(btn).trigger("click");
    } catch {
      /* DOM fallback */
    }
  }
  clickEl(btn);

  // Một số bản form bind submit trên <form>, không bắt click input
  await sleep(400);
  if (!findOtpInput() && location.pathname.includes(CREATE_PATH)) {
    const form = btn.closest("form") || document.querySelector("form");
    if (form && $) {
      try {
        // jQuery trigger submit chạy handler (không bỏ qua validation như HTMLFormElement.submit)
        $(form).trigger("submit");
      } catch {
        /* ignore */
      }
    }
  }

  return { ok: true, button: String(btn.id || btn.value || btn.textContent || "create").trim() };
}

function otpDialogRoots() {
  const roots = [
    ...document.querySelectorAll(
      ".modal.show, .modal.in, .bootbox.modal, [role='dialog'], #otpModal, .otp-modal"
    ),
  ].filter((el) => isDomVisible(el));
  return roots.length ? roots : [document];
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
  for (const root of otpDialogRoots()) {
    for (const s of sels) {
      const el = root.querySelector?.(s) || (root === document ? document.querySelector(s) : null);
      if (el && isDomVisible(el)) return el;
    }
    const fuzzy = [
      ...(root.querySelectorAll?.(
        "input[type='text'], input[type='number'], input[type='tel'], input:not([type])"
      ) || []),
    ].find((el) => {
      if (!isDomVisible(el)) return false;
      return /otp|mã\s*xác|ma\s*xac|verification|auth.?code/i.test(
        `${el.name || ""} ${el.id || ""} ${el.placeholder || ""} ${el.getAttribute("aria-label") || ""}`
      );
    });
    if (fuzzy) return fuzzy;
  }
  return null;
}

function otpButtonLabel(el) {
  return String(el.value || el.textContent || el.getAttribute("title") || "")
    .replace(/\s+/g, " ")
    .trim();
}

function isCreateOrderButton(el) {
  if (!el) return false;
  if (el.id === "btnCreate") return true;
  return /tạo\s*phiếu|tao\s*phieu/i.test(otpButtonLabel(el));
}

function findOtpConfirmButton(scopeEl) {
  const roots = scopeEl
    ? [scopeEl]
    : (() => {
        const input = findOtpInput();
        const dialog =
          input?.closest?.(".modal, .bootbox, [role='dialog'], #otpModal") || null;
        return dialog && isDomVisible(dialog) ? [dialog, ...otpDialogRoots()] : otpDialogRoots();
      })();

  const idSels = ["#btnConfirmOTP", "#btnVerifyOTP", "#btnSubmitOTP", "#btnConfirm", "#btnVerify"];
  for (const root of roots) {
    const query = (s) =>
      root.querySelector?.(s) || (root === document ? document.querySelector(s) : null);
    for (const s of idSels) {
      const el = query(s);
      if (el && isDomVisible(el) && !isCreateOrderButton(el)) return el;
    }
  }

  const labelRe = /xác\s*nhận|xac\s*nhan|xác\s*thực|xac\s*thuc|verify|đồng\s*ý|dong\s*y|\bok\b/i;
  for (const root of roots) {
    const buttons = [
      ...(root.querySelectorAll?.(
        "button, input[type='submit'], input[type='button'], a.btn, .btn"
      ) || []),
    ];
    for (const el of buttons) {
      if (!isDomVisible(el) || isCreateOrderButton(el)) continue;
      if (labelRe.test(otpButtonLabel(el))) return el;
    }
  }
  return null;
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

async function clickOtpConfirm(otpInput) {
  const dialog =
    otpInput?.closest?.(".modal, .bootbox, [role='dialog'], #otpModal") || null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const btn = findOtpConfirmButton(dialog);
    if (btn) {
      const $ = getJQuery();
      if ($ && $.fn) {
        try {
          $(btn).trigger("click");
        } catch {
          /* DOM */
        }
      }
      clickEl(btn);
      await sleep(400);
      return { ok: true, how: "button", label: otpButtonLabel(btn) };
    }
    if (otpInput) {
      otpInput.focus();
      otpInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
      );
      otpInput.dispatchEvent(
        new KeyboardEvent("keyup", { key: "Enter", bubbles: true, cancelable: true })
      );
      await sleep(400);
    }
    await sleep(300);
  }
  return { ok: false, how: "none" };
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
 * Phase A: điền form + bấm Tạo phiếu, trả về ngay (OTP do background lấy).
 * Tránh chờ IMAP trong content — trang ASP.NET reload sẽ giết script.
 */
async function fillAndCreateEcargoVct(payload) {
  if (!payload || typeof payload !== "object") {
    return {
      ok: false,
      error: "BAD_PAYLOAD",
      message: "Thiếu payload ECARGO_FILL_AND_CREATE",
      scriptVersion: SCRIPT_VERSION,
      phase: "create",
    };
  }

  const fillRes = await fillEcargoVct(payload);
  if (!fillRes?.ok) return { ...fillRes, phase: "fill" };

  const warnings = [...(fillRes.warnings || [])];
  const softErrs = visibleValidationErrors();
  if (softErrs.length) {
    warnings.push(`Trước Tạo phiếu còn thông báo: ${softErrs.slice(0, 2).join(" | ")}`);
  }

  const sinceIso = new Date().toISOString();
  const clicked = await clickCreateOrder();
  if (!clicked.ok) {
    return {
      ok: false,
      error: clicked.error || "NO_CREATE_BTN",
      message: "Không thấy / không bấm được nút «Tạo phiếu» trên form eCargo.",
      scriptVersion: SCRIPT_VERSION,
      phase: "create",
      warnings,
    };
  }

  // Probe ngắn: bắt lỗi validation tức thì; OTP UI có thể xuất hiện sau reload (BG chờ).
  const probeUntil = Date.now() + 2_500;
  while (Date.now() < probeUntil) {
    if (findOtpInput()) {
      return {
        ok: true,
        message: "Đã Tạo phiếu — đã thấy ô OTP.",
        scriptVersion: SCRIPT_VERSION,
        phase: "create",
        sinceIso,
        warnings,
        createButton: clicked.button,
        otpUiReady: true,
      };
    }
    if (Date.now() - Date.parse(sinceIso) > 1200) {
      const post = visibleValidationErrors();
      if (post.length) {
        return {
          ok: false,
          error: "VALIDATION",
          message: `Đã bấm «Tạo phiếu» nhưng form từ chối: ${post.slice(0, 3).join(" | ")}`,
          scriptVersion: SCRIPT_VERSION,
          phase: "create",
          sinceIso,
          warnings,
          createButton: clicked.button,
        };
      }
    }
    await sleep(200);
  }

  return {
    ok: true,
    message: "Đã bấm «Tạo phiếu» — chờ ô OTP / reload.",
    scriptVersion: SCRIPT_VERSION,
    phase: "create",
    sinceIso,
    warnings,
    createButton: clicked.button,
    otpUiReady: Boolean(findOtpInput()),
  };
}

/**
 * Phase C: điền OTP (fresh DOM) + bấm xác thực + bắt QR.
 * payload: { otp, apiBase?, email?, sinceIso?, awbHint? }
 */
async function submitEcargoOtp(payload) {
  const otp = String(payload?.otp || "").trim();
  if (!/^\d{4,8}$/.test(otp)) {
    return {
      ok: false,
      error: "BAD_OTP",
      message: "OTP không hợp lệ",
      scriptVersion: SCRIPT_VERSION,
      phase: "otp_submit",
    };
  }

  const otpInput = (await waitForOtpInput(8_000)) || findOtpInput();
  if (!otpInput) {
    return {
      ok: false,
      error: "NO_OTP_UI",
      message: "Không thấy ô OTP để điền mã.",
      scriptVersion: SCRIPT_VERSION,
      phase: "otp_submit",
    };
  }

  otpInput.focus();
  setNativeValue(otpInput, otp);
  otpInput.dispatchEvent(new Event("input", { bubbles: true }));
  otpInput.dispatchEvent(new Event("change", { bubbles: true }));
  otpInput.dispatchEvent(
    new KeyboardEvent("keyup", { key: "0", bubbles: true, cancelable: true })
  );
  await sleep(150);

  if (String(otpInput.value || "").replace(/\s/g, "") !== otp) {
    setNativeValue(otpInput, otp);
  }

  const clicked = await clickOtpConfirm(otpInput);
  if (!clicked.ok) {
    return {
      ok: false,
      error: "NO_CONFIRM_BTN",
      message:
        "Đã điền OTP nhưng không bấm được nút xác thực/xác nhận. Kiểm tra modal eCargo.",
      scriptVersion: SCRIPT_VERSION,
      phase: "otp_submit",
      otpFilled: true,
    };
  }

  await sleep(1200);
  let capture = await captureQrAndVctCode();
  for (let i = 0; i < 4 && !capture.qrDataUrl && !capture.vctCode; i += 1) {
    await sleep(1000);
    capture = await captureQrAndVctCode();
  }

  const apiBase = String(payload?.apiBase || "").replace(/\/$/, "");
  const email = String(payload?.email || "").trim();
  const sinceIso = String(payload?.sinceIso || "").trim();
  if (apiBase && email && sinceIso && (!capture.qrDataUrl || !capture.vctCode)) {
    try {
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
    } catch {
      /* ignore */
    }
  }

  const ok = Boolean(capture.vctCode || capture.qrDataUrl);
  return {
    ok,
    message: ok
      ? `Đã xác thực OTP${capture.vctCode ? `: ${capture.vctCode}` : ""}.`
      : "Đã bấm xác thực OTP nhưng chưa lấy được QR/mã phiếu",
    scriptVersion: SCRIPT_VERSION,
    phase: "done",
    vctCode: capture.vctCode,
    qrDataUrl: capture.qrDataUrl,
    sinceIso: sinceIso || undefined,
    confirmHow: clicked.how,
    confirmLabel: clicked.label,
    submit: true,
  };
}
