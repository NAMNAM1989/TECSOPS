/**
 * Điền / đăng ký eCargo VCT (Export) trên ecargo.scsc.vn.
 * FILL = chỉ điền.
 * Đăng ký 1-click do background điều phối:
 *   ECARGO_FILL_AND_CREATE → (BG IMAP: mã + link mail) → mở trang xác thực
 *   → ECARGO_CONFIRM_VERIFY (bấm «Xác Thực»)
 *
 * Listener đăng ký 1 lần; handler gắn globalThis để inject lại (executeScript)
 * luôn cập nhật bản mới — tránh kẹt listener cũ.
 */

const SCRIPT_VERSION = "2.2.14";
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
      verified: typeof pageLooksVerified === "function" ? pageLooksVerified() : false,
    });
    return true;
  }

  if (msg.type === "ECARGO_CHECK_VERIFIED") {
    sendResponse({
      ok: pageLooksVerified(),
      verified: pageLooksVerified(),
      scriptVersion: SCRIPT_VERSION,
      url: location.href,
      vctCode: String(msg.payload?.vctCode || ""),
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

  if (msg.type === "ECARGO_LOOKUP_AGENT") {
    void lookupEcargoAgents(String(msg.payload?.filter || msg.payload?.agentName || ""))
      .then(sendResponse)
      .catch((err) =>
        sendResponse({
          ok: false,
          error: "LOOKUP_FAILED",
          message: err instanceof Error ? err.message : String(err || "Lookup failed"),
          scriptVersion: SCRIPT_VERSION,
          items: [],
        })
      );
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

  if (msg.type === "ECARGO_SUBMIT_OTP" || msg.type === "ECARGO_CONFIRM_VERIFY") {
    void confirmEcargoVerifyPage(msg.payload)
      .then(sendResponse)
      .catch((err) =>
        sendResponse({
          ok: false,
          error: "VERIFY_FAILED",
          message: err instanceof Error ? err.message : String(err || "Verify failed"),
          scriptVersion: SCRIPT_VERSION,
          phase: "otp_submit",
        })
      );
    return true;
  }

  // Backward-compat: chỉ Tạo phiếu — background lấy mail + mở link xác thực (Ext v2.2.7+).
  if (msg.type === "REGISTER_ECARGO_VCT") {
    void fillAndCreateEcargoVct(msg.payload)
      .then((res) =>
        sendResponse({
          ...res,
          message:
            (res?.message || "Đã Tạo phiếu") +
            " — background sẽ mở link xác thực từ mail (cần Ext v2.2.11+).",
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

/**
 * @param {string} name
 * @param {string} value
 * @param {{ forceClick?: boolean }} [opts]
 *   eCargo `radVehicleType` click handler xóa #txtVehicleNo — không click lại nếu đã chọn đúng.
 */
function setRadioByName(name, value, opts = {}) {
  const forceClick = Boolean(opts.forceClick);
  const nodes = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
  for (const node of nodes) {
    if (String(node.value) !== String(value)) continue;
    const already = Boolean(node.checked);
    node.checked = true;
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
    if (!already || forceClick) clickEl(node);
    return true;
  }
  return false;
}

/**
 * Loại xe + biển số. eCargo khi click XEMAY/OTO/BAGAC gán `$("#txtVehicleNo").val("")`
 * → luôn điền biển SAU khi chọn radio.
 */
function applyVehicleHeader(header = {}) {
  const type = String(header.vehicleType || "OTO").trim().toUpperCase() || "OTO";
  const plate = String(header.vehicleNo || "").trim().toUpperCase();
  const qtyRaw = Number(header.vehicleQuantity);
  const qty = Number.isFinite(qtyRaw) && qtyRaw >= 1 ? Math.floor(qtyRaw) : 1;
  const typeOk = setRadioByName("radVehicleType", type);
  const qtyEl = document.querySelector("#txtVehicleQuantity");
  const noEl = document.querySelector("#txtVehicleNo");
  let quantityOk = false;
  let noOk = false;
  if (type === "DIBO") {
    // eCargo tự gán VehicleNo=DIBO khi click — bổ sung nếu thiếu.
    quantityOk = setNativeValue(qtyEl, "1");
    noOk = setNativeValue(noEl, "DIBO");
  } else {
    quantityOk = setNativeValue(qtyEl, String(qty));
    noOk = setNativeValue(noEl, plate);
  }
  // Bật lại ô biển nếu eCargo từng disable (DIBO).
  try {
    if (noEl && type !== "DIBO") {
      noEl.disabled = false;
      noEl.removeAttribute("disabled");
    }
  } catch {
    /* ignore */
  }
  return {
    vehicleType: typeOk,
    vehicleQuantity: quantityOk,
    vehicleNo: noOk,
    vehicleNoValue: String(noEl?.value || ""),
  };
}

async function waitFor(selector, timeoutMs = 8_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const el = document.querySelector(selector);
    if (el) return el;
    await sleep(50);
  }
  return null;
}

/** Chờ phần tử thật sự hiện (AWB modal luôn có #txtPrefix trong DOM khi ẩn). */
async function waitForVisible(selector, timeoutMs = 5_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const el = document.querySelector(selector);
    if (el && isDomVisible(el)) return el;
    // offsetParent null khi modal ẩn; show xong thường có offsetParent
    if (el && el.offsetParent !== null) return el;
    await sleep(50);
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
      await sleep(80);
      return;
    } catch {
      /* fallback */
    }
  }
  // Fallback nhanh: set 1 lần + input/keyup (không gõ từng ký tự)
  setNativeValue(input, value);
  input.focus();
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(
    new KeyboardEvent("keyup", { key: "Unidentified", bubbles: true, cancelable: true })
  );
  await sleep(100);
}

/** Lấy item thật từ jQuery UI (có id/ident) — không bịa {label,value}. */
function getAutocompleteItemData(li) {
  const $ = getJQuery();
  if (!$ || !li) return null;
  const $li = $(li);
  return (
    $li.data("ui-autocomplete-item") ||
    $li.data("uiAutocompleteItem") ||
    $li.children("div.ui-menu-item-wrapper").data("ui-autocomplete-item") ||
    $li.children("a").data("ui-autocomplete-item") ||
    null
  );
}

/**
 * eCargo menu hiện «CODE - NAME - ADDRESS», select handler ghi item.name / item.code / item.val.
 * Khớp theo name|code (không so cả chuỗi label dài).
 */
function autocompleteItemMatches(li, wantRaw) {
  const want = normAgentText(wantRaw);
  if (!want || !li) return false;
  const data = getAutocompleteItemData(li);
  if (data) {
    if (normAgentText(data.name) === want) return true;
    if (normAgentText(data.code) === want) return true;
    if (normAgentText(data.label) === want) return true;
    if (normAgentText(data.value) === want) return true;
  }
  return agentTextExact(agentItemLabel(li), wantRaw);
}

/**
 * Click dòng menu khớp — để handler eCargo gắn AgentIdent (ui.item.val).
 * Fallback: _trigger select với item THẬT từ data().
 */
async function selectAgentMenuItemExact(input, li, exactName) {
  if (!li || !autocompleteItemMatches(li, exactName)) return false;
  const item = getAutocompleteItemData(li);
  const target = li.querySelector(".ui-menu-item-wrapper") || li;
  input.focus();
  target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
  target.click();
  await sleep(120);

  if (readAgentIdent() !== "0" && agentTextExact(input.value, exactName)) return true;

  // Handler chưa chạy — gọi select với item thật (val/code/name)
  const $ = getJQuery();
  if (item && $) {
    try {
      const inst = $(input).data("ui-autocomplete");
      if (inst && typeof inst._trigger === "function") {
        inst._trigger("select", null, { item });
        await sleep(80);
      }
    } catch {
      /* ignore */
    }
  }
  // Gắn tay đúng theo handler eCargo nếu vẫn thiếu Ident
  if (item && readAgentIdent() === "0" && (item.val != null || item.code)) {
    const identEl = document.querySelector("#txtAgentIdent");
    const codeEl = document.querySelector("#txtAgentCode");
    if (identEl && item.val != null) setNativeValue(identEl, String(item.val));
    if (codeEl && item.code != null) setNativeValue(codeEl, String(item.code));
    if (item.name) setNativeValue(input, String(item.name));
  }

  return (
    readAgentIdent() !== "0" &&
    (agentTextExact(input.value, exactName) ||
      (item && agentTextExact(item.name, exactName)))
  );
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

/** Tra cứu đại lý qua API eCargo (cùng endpoint autocomplete). */
async function lookupEcargoAgents(filterRaw) {
  const filter = String(filterRaw || "")
    .trim()
    .toUpperCase();
  if (filter.length < 2) {
    return {
      ok: false,
      error: "SHORT_FILTER",
      message: "Cần ≥2 ký tự để tra cứu đại lý eCargo",
      filter,
      items: [],
      scriptVersion: SCRIPT_VERSION,
    };
  }
  const $ = getJQuery();
  if (!$ || typeof $.ajax !== "function") {
    return {
      ok: false,
      error: "NO_JQUERY",
      message: "Trang eCargo chưa sẵn sàng (thiếu jQuery)",
      filter,
      items: [],
      scriptVersion: SCRIPT_VERSION,
    };
  }
  const token = typeof window.getToken === "function" ? window.getToken() : "";
  const data = await new Promise((resolve) => {
    $.ajax({
      url: "/General/ShareData/Customer",
      type: "Post",
      data: {
        __RequestVerificationToken: token,
        type: "Agent",
        filter,
      },
      success: (res) => resolve(res),
      error: () => resolve([]),
    });
  });
  const arr = Array.isArray(data) ? data : [];
  const items = arr.slice(0, 30).map((x) => ({
    name: String(x?.name || "").trim(),
    code: String(x?.code || "").trim(),
    val: x?.val != null ? String(x.val) : "",
    label: String(x?.label || "").trim().slice(0, 160),
  }));
  const exact = items.filter((it) => agentTextExact(it.name, filter));
  return {
    ok: true,
    filter,
    count: arr.length,
    exactCount: exact.length,
    items,
    exact,
    scriptVersion: SCRIPT_VERSION,
  };
}

/** Nhiều biến thể tìm kiếm — báo rõ khi tên hồ sơ không có trên eCargo. */
async function assertAgentExistsOnEcargo(agentName) {
  const want = String(agentName || "").trim();
  if (!want) {
    return { ok: false, message: "Thiếu tên đại lý trong hồ sơ Ops" };
  }
  const terms = [want];
  if (!/\bCO\.?\s*LTD\b/i.test(want)) terms.push(`${want} CO LTD`);
  const firstTwo = want.split(/\s+/).slice(0, 2).join(" ");
  if (firstTwo && normAgentText(firstTwo) !== normAgentText(want)) terms.push(firstTwo);

  let best = null;
  for (const term of terms) {
    const hit = await lookupEcargoAgents(term);
    if (!best || (hit.count || 0) > (best.count || 0)) best = hit;
    const exact = (hit.items || []).find((it) => agentTextExact(it.name, want));
    if (exact) {
      return { ok: true, match: exact, filter: term };
    }
  }
  const sample = (best?.items || [])
    .slice(0, 5)
    .map((it) => `${it.code || "?"} — ${it.name}`)
    .join("; ");
  return {
    ok: false,
    message:
      `eCargo không có đại lý «${want}» (API tra cứu 0 khớp tên). ` +
      `Sửa hồ sơ Ops → đúng item.name trên eCargo` +
      (sample ? ` — gợi ý gần: ${sample}` : " — thử gõ tay trên form eCargo rồi copy tên.") +
      " Ext v2.2.14.",
    lookup: best,
  };
}

/**
 * Điền ĐÚNG tên đại lý từ hồ sơ Ops — không chọn / không focus gợi ý eCargo.
 *
 * eCargo autocomplete `focus`/`select` ghi đè ô bằng item.name (đổi «NAM NAM LOGISTICS»
 * thành tên khác). Client Create chỉ cần tên không trống; AgentIdent="0" vẫn submit được.
 */
async function fillAgentName(agentName, headerPreset = {}) {
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

  const $ = getJQuery();
  dismissAutocompleteMenus();
  try {
    if ($?.(input)?.autocomplete) $(input).autocomplete("disable");
  } catch {
    /* ignore */
  }

  // Preset Ident/Code từ Ops (nếu có) — vẫn giữ đúng chuỗi tên hồ sơ.
  if (applyPresetAgentIdent({ ...headerPreset, agentName: exact })) {
    dismissAutocompleteMenus();
    try {
      if ($?.(input)?.autocomplete) $(input).autocomplete("enable");
    } catch {
      /* ignore */
    }
    return {
      ok: true,
      exact: true,
      agentIdent: readAgentIdent(),
      agentCode: String(document.querySelector("#txtAgentCode")?.value || ""),
      agentName: exact,
      via: "preset",
    };
  }

  const identEl = document.querySelector("#txtAgentIdent");
  const codeEl = document.querySelector("#txtAgentCode");
  if (identEl) setNativeValue(identEl, "0");
  if (codeEl) setNativeValue(codeEl, "");
  setNativeValue(input, exact);
  // Gõ từng ký tự cũng kích hoạt menu → đóng ngay, không chọn dòng nào.
  dismissAutocompleteMenus();
  await sleep(40);
  if (!agentTextExact(input.value, exact)) setNativeValue(input, exact);
  dismissAutocompleteMenus();

  try {
    if ($?.(input)?.autocomplete) $(input).autocomplete("enable");
  } catch {
    /* ignore */
  }

  const finalName = String(document.querySelector("#txtAgentName")?.value || "");
  const exactOk = agentTextExact(finalName, exact);
  return {
    ok: exactOk,
    exact: exactOk,
    agentIdent: readAgentIdent(),
    agentCode: String(document.querySelector("#txtAgentCode")?.value || ""),
    agentName: exactOk ? exact : finalName,
    via: "typed",
  };
}

/** Autocomplete DEST/carrier — khớp item.code|name (menu là «CODE - …»). */
async function pickAutocomplete(input, query, { timeoutMs = 800 } = {}) {
  if (!input) return false;
  const q = String(query || "").trim();
  if (!q) return false;
  if (agentTextExact(input.value, q)) return true;
  await typeExactIntoInput(input, q);
  const started = Date.now();
  let picked = false;
  while (Date.now() - started < timeoutMs) {
    const exactLi = listAgentAutocompleteItems().find((li) =>
      autocompleteItemMatches(li, q)
    );
    if (exactLi) {
      const item = getAutocompleteItemData(exactLi);
      const target = exactLi.querySelector(".ui-menu-item-wrapper") || exactLi;
      target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      target.click();
      await sleep(80);
      // Carrier/Dest handler thường ghi item.code vào ô
      if (item?.code && !agentTextExact(input.value, q) && !agentTextExact(input.value, item.code)) {
        const $ = getJQuery();
        try {
          const inst = $?.(input).data("ui-autocomplete");
          if (inst?.options?.select) {
            inst.options.select({}, { item });
          }
        } catch {
          setNativeValue(input, String(item.code));
        }
      }
      picked = true;
      break;
    }
    await sleep(50);
  }
  dismissAutocompleteMenus();
  if (!picked && !agentTextExact(input.value, q)) setNativeValue(input, q);
  return agentTextExact(input.value, q) || picked;
}

/** Gắn AgentIdent/Code thẳng từ hồ sơ Ops (khi đã biết mã eCargo). */
function applyPresetAgentIdent(header) {
  const name = String(header?.agentName || "").trim();
  const ident = String(header?.agentIdent || "").replace(/\D/g, "");
  const code = String(header?.agentCode || "")
    .trim()
    .toUpperCase();
  if (!name || !ident || ident === "0") return false;
  const input = document.querySelector("#txtAgentName");
  const identEl = document.querySelector("#txtAgentIdent");
  const codeEl = document.querySelector("#txtAgentCode");
  if (!input || !identEl) return false;
  setNativeValue(input, name);
  setNativeValue(identEl, ident);
  if (codeEl && code) setNativeValue(codeEl, code);
  return readAgentIdent() === ident;
}

async function fillHeader(header) {
  const fills = {};
  // Điền đúng tên hồ sơ — tắt autocomplete trong lúc gán (không nhảy gợi ý).
  const agent = await fillAgentName(header.agentName || "", header);
  fills.agentName = agent.ok;
  fills.agentExact = agent.exact;
  fills.agentIdent = agent.agentIdent;
  fills.agentNameValue = agent.agentName;
  fills.agentVia = agent.via || "typed";
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
  const vehicleFills = applyVehicleHeader(header);
  fills.vehicleType = vehicleFills.vehicleType;
  fills.vehicleQuantity = vehicleFills.vehicleQuantity;
  fills.vehicleNo = vehicleFills.vehicleNo;
  fills.vehicleNoValue = vehicleFills.vehicleNoValue;
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
  dismissAutocompleteMenus();
  return fills;
}

async function openAwbModal() {
  dismissAutocompleteMenus();
  const btn = document.querySelector("#btnAddAwb");
  if (!btn) throw new Error("Không thấy nút Thêm AWB");
  clickEl(btn);
  // #txtPrefix luôn có trong DOM — phải chờ modal #awbModal hiện
  const prefix = await waitForVisible("#txtPrefix", 5_000);
  const modalOpen =
    document.querySelector("#awbModal.show") ||
    (document.querySelector("#awbModal") &&
      getComputedStyle(document.querySelector("#awbModal")).display !== "none");
  if (!prefix || !modalOpen) throw new Error("Modal Thêm AWB không mở");
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
    fills.carrier = await pickAutocomplete(carrier, split.carrier, { timeoutMs: 400 });
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
    { timeoutMs: 400 }
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
  if (btn.offsetParent === null && !isDomVisible(document.querySelector("#txtPrefix"))) {
    throw new Error("Modal AWB đã đóng trước khi lưu");
  }
  const errEl = document.querySelector("#lbAwbError");
  if (errEl) errEl.innerHTML = "";
  const rowsBefore = document.querySelectorAll("#awbItems tr").length;
  // addAWB gắn jQuery — phải trigger click
  const $ = getJQuery();
  if ($ && $.fn) {
    try {
      $(btn).trigger("click");
    } catch {
      clickEl(btn);
    }
  } else {
    clickEl(btn);
  }
  const started = Date.now();
  while (Date.now() - started < 4000) {
    const awbErr = String(document.querySelector("#lbAwbError")?.innerText || "")
      .replace(/\s+/g, " ")
      .trim();
    if (awbErr) {
      throw new Error(`Thêm AWB bị eCargo từ chối: ${awbErr.slice(0, 220)}`);
    }
    const rowsNow = document.querySelectorAll("#awbItems tr").length;
    const modal = document.querySelector("#awbModal");
    const modalHidden =
      modal &&
      !modal.classList.contains("show") &&
      getComputedStyle(modal).display === "none";
    if (rowsNow > rowsBefore || modalHidden) return;
    await sleep(80);
  }
  const awbErr = String(document.querySelector("#lbAwbError")?.innerText || "")
    .replace(/\s+/g, " ")
    .trim();
  if (awbErr) throw new Error(`Thêm AWB bị eCargo từ chối: ${awbErr.slice(0, 220)}`);
  if (document.querySelectorAll("#awbItems tr").length <= rowsBefore) {
    throw new Error(
      "Không thêm được dòng AWB (chuyến bay có thể không tồn tại trên eCargo / cut-off)."
    );
  }
}

/**
 * @param payload
 * @param {{ requireAgentIdent?: boolean }} [opts]
 *   AgentIdent không bắt buộc — eCargo Create chấp nhận Ident=0 + tên gõ tay.
 */
async function fillEcargoVct(payload, opts = {}) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "BAD_PAYLOAD", message: "Thiếu payload FILL_ECARGO_VCT" };
  }
  void opts.requireAgentIdent; // giữ tương thích caller cũ
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
        "Ext không được nhảy theo gợi ý — Reload Ext v2.2.14 rồi thử lại.",
      scriptVersion: SCRIPT_VERSION,
      fills: headerFills,
      warnings: [],
    };
  }

  const awbResults = [];
  const warnings = [];

  for (let i = 0; i < awbs.length; i += 1) {
    try {
      await openAwbModal();
      const fills = await fillAwbLine(awbs[i]);
      await saveAndCloseAwb();
      awbResults.push({ index: i, awb: awbs[i].awb, fills });
    } catch (err) {
      return {
        ok: false,
        error: "AWB_ADD_FAILED",
        message:
          err instanceof Error
            ? err.message
            : `Không thêm được AWB ${awbs[i].awb || i + 1}`,
        scriptVersion: SCRIPT_VERSION,
        fills: headerFills,
        awbResults,
        warnings,
      };
    }
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
  // eCargo custom validators (không dùng ASP.NET unobtrusive): #valVehicle, #valDriverName…
  for (const n of document.querySelectorAll(
    "#valVehicle, #valAgentPicName, #valAgentPicId, #valDriverName, #valDriverId, #lbAwbError, #validateFlight, #errorMessage"
  )) {
    try {
      n.textContent = "";
      n.innerHTML = "";
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

/** Kích hoạt lại change để form nhận giá trị đã điền trước khi Tạo phiếu.
 *  Không đụng #txtAgentName — change/blur có thể xóa AgentIdent sau khi chọn gợi ý. */
function settleFilledFields() {
  const sels = [
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
/** Đồng bộ CheckArrivalDate eCargo: cùng ngày → giờ vào ≥ now+90 phút. */
function ensureArrivalMeetsEcargoRule() {
  const dateEl = document.querySelector("#txtArrivalDate");
  const timeEl = document.querySelector("#txtArrivalTime");
  if (!dateEl || !timeEl) return null;
  const today = new Date();
  const ymd = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const todayY = ymd(today);
  let dateVal = String(dateEl.value || todayY);
  if (dateVal < todayY) {
    setDateInput(dateEl, todayY);
    dateVal = todayY;
  }
  const ok = (hour) => {
    if (dateVal > todayY) return true;
    const [y, m, d] = dateVal.split("-").map(Number);
    const arrival = new Date(y, m - 1, d, hour, 0, 0, 0);
    return arrival.getTime() >= today.getTime() + 90 * 60 * 1000;
  };
  let hour = Number(timeEl.value);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) hour = 8;
  if (ok(hour)) return { arrivalDate: dateVal, arrivalTime: String(hour) };
  for (let h = hour; h <= 23; h += 1) {
    if (ok(h)) {
      setSelectValue(timeEl, String(h));
      return { arrivalDate: dateVal, arrivalTime: String(h), adjusted: true };
    }
  }
  const tom = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const tomY = ymd(tom);
  setDateInput(dateEl, tomY);
  setSelectValue(timeEl, String(hour));
  return { arrivalDate: tomY, arrivalTime: String(hour), adjusted: true };
}

async function clickCreateOrder(wantAgentName = "", headerPreset = {}) {
  dismissAutocompleteMenus();
  const agentName = String(wantAgentName || "").trim();
  // Ép lại đúng tên hồ sơ trước submit — không mở/chọn gợi ý (tránh ghi đè).
  if (agentName) {
    await fillAgentName(agentName, headerPreset);
    if (!agentTextExact(document.querySelector("#txtAgentName")?.value || "", agentName)) {
      return {
        ok: false,
        error: "AGENT_MISMATCH",
        message:
          `Không giữ được tên đại lý «${agentName}» trên form trước khi Tạo phiếu. Reload Ext v2.2.14.`,
      };
    }
  }
  // Radio mặc định eCargo = chưa chọn — bắt buộc tick trước validate.
  setRadioByName("radAgentPicId", headerPreset.agentPicIdType || "CCCD");
  setRadioByName("radDriverId", headerPreset.driverIdType || "CCCD");
  // Không click lại loại xe nếu đã đúng (click eCargo xóa biển) — rồi gán lại biển/số lượng.
  applyVehicleHeader(headerPreset);
  ensureArrivalMeetsEcargoRule();
  settleFilledFields();
  // Gán lại biển sau settle — phòng handler/validate xóa #txtVehicleNo.
  applyVehicleHeader(headerPreset);
  clearClientValidationUi();
  const errBox = document.querySelector("#errorMessage");
  if (errBox) errBox.innerHTML = "";

  const typeFinal = String(headerPreset.vehicleType || "OTO").trim().toUpperCase();
  const plateFinal = String(document.querySelector("#txtVehicleNo")?.value || "").trim();
  if (typeFinal !== "DIBO" && plateFinal.length < 7) {
    return {
      ok: false,
      error: "VEHICLE_NO_MISSING",
      message:
        `Biển số xe trống/ngắn trên form («${plateFinal || "∅"}») — eCargo xóa biển khi đổi loại xe. ` +
        "Reload Ext v2.2.14 rồi đăng ký lại.",
    };
  }

  const btn = findCreateButton();
  if (!btn) return { ok: false, error: "NO_CREATE_BTN" };

  try {
    if ("disabled" in btn) btn.disabled = false;
    btn.removeAttribute("disabled");
    btn.classList.remove("disabled");
  } catch {
    /* ignore */
  }

  // #btnCreate type=button + jQuery (validate + Turnstile + AJAX)
  const $ = getJQuery();
  if ($ && $.fn) {
    try {
      $(btn).trigger("click");
    } catch {
      clickEl(btn);
    }
  } else {
    clickEl(btn);
  }
  await sleep(400);
  const htmlErr = String(document.querySelector("#errorMessage")?.innerHTML || "")
    .replace(/<br\s*\/?>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (htmlErr) {
    return {
      ok: false,
      error: "CREATE_REJECTED",
      message: `eCargo từ chối Tạo phiếu: ${htmlErr.slice(0, 280)}`,
      button: String(btn.id || btn.value || "create").trim(),
    };
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
  if (globalThis.__TECSOPS_ECARGO_CREATE_BUSY__) {
    return {
      ok: false,
      error: "BUSY",
      message: "Đang Tạo phiếu — tránh bấm trùng.",
      scriptVersion: SCRIPT_VERSION,
      phase: "create",
    };
  }
  globalThis.__TECSOPS_ECARGO_CREATE_BUSY__ = true;
  try {
    return await fillAndCreateEcargoVctInner(payload);
  } finally {
    globalThis.__TECSOPS_ECARGO_CREATE_BUSY__ = false;
  }
}

async function fillAndCreateEcargoVctInner(payload) {
  const wantAgent = String(payload.header?.agentName || "").trim();
  // Điền đúng tên hồ sơ (không bắt buộc tên có trong list Agent eCargo).
  const fillRes = await fillEcargoVct(payload, { requireAgentIdent: false });
  if (!fillRes?.ok) return { ...fillRes, phase: "fill" };

  const warnings = [...(fillRes.warnings || [])];
  const softErrs = visibleValidationErrors();
  if (softErrs.length) {
    warnings.push(`Trước Tạo phiếu còn thông báo: ${softErrs.slice(0, 2).join(" | ")}`);
  }

  const sinceIso = new Date().toISOString();
  const clicked = await clickCreateOrder(wantAgent, payload.header || {});
  if (!clicked.ok) {
    return {
      ok: false,
      error: clicked.error || "NO_CREATE_BTN",
      message:
        clicked.message ||
        "Không thấy / không bấm được nút «Tạo phiếu» trên form eCargo.",
      scriptVersion: SCRIPT_VERSION,
      phase: "create",
      warnings,
    };
  }

  // Probe ngắn — lỗi validation thường hiện <1.5s; rời Create = đã submit.
  const probeUntil = Date.now() + 3_000;
  while (Date.now() < probeUntil) {
    if (!location.pathname.includes(CREATE_PATH)) {
      return {
        ok: true,
        message: "Đã Tạo phiếu — trang đã chuyển.",
        scriptVersion: SCRIPT_VERSION,
        phase: "create",
        sinceIso,
        warnings,
        createButton: clicked.button,
        navigatedAway: true,
      };
    }
    if (Date.now() - Date.parse(sinceIso) > 500) {
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
    await sleep(100);
  }

  return {
    ok: true,
    message: "Đã bấm «Tạo phiếu» — chờ mail xác thực.",
    scriptVersion: SCRIPT_VERSION,
    phase: "create",
    sinceIso,
    warnings,
    createButton: clicked.button,
  };
}

function findVerifyCodeInput() {
  const visibles = [
    ...document.querySelectorAll("input[type='text'], input:not([type]), input[type='search']"),
  ].filter((el) => isDomVisible(el));
  for (const el of visibles) {
    const meta = `${el.name || ""} ${el.id || ""} ${el.placeholder || ""} ${
      el.getAttribute("aria-label") || ""
    }`;
    if (/mã|code|token|verify|xác\s*thực|xac\s*thuc/i.test(meta)) return el;
  }
  // label[for] hoặc form-group nhỏ chứa đúng chữ «Mã xác thực»
  for (const lab of document.querySelectorAll("label")) {
    const t = String(lab.textContent || "").replace(/\s+/g, " ").trim();
    if (!/^mã\s*xác\s*thực|^ma\s*xac\s*thuc/i.test(t) && !/mã\s*xác\s*thực\s*\(?\*?\)?/i.test(t)) {
      continue;
    }
    const forId = lab.getAttribute("for");
    if (forId) {
      const byFor = document.getElementById(forId);
      if (byFor && isDomVisible(byFor)) return byFor;
    }
    const root = lab.closest(".form-group, .mb-3, td, .row, form") || lab.parentElement;
    const near = root?.querySelector?.("input[type='text'], input:not([type])");
    if (near && isDomVisible(near)) return near;
  }
  // Ô cạnh nút Xác Thực
  const btn = findVerifySubmitButton();
  if (btn) {
    const root = btn.closest("form, .input-group, .row, div") || btn.parentElement;
    const near = root?.querySelector?.("input[type='text'], input:not([type])");
    if (near && isDomVisible(near)) return near;
  }
  return null;
}

function findVerifySubmitButton() {
  const nodes = [
    ...document.querySelectorAll(
      "button, input[type='submit'], input[type='button'], a.btn, .btn"
    ),
  ];
  for (const el of nodes) {
    if (!isDomVisible(el) || isCreateOrderButton(el)) continue;
    const label = otpButtonLabel(el);
    // Đúng nút trang verify — tránh «Tạo phiếu»
    if (/^xác\s*thực$|^xac\s*thuc$/i.test(label) || /xác\s*thực|xac\s*thuc/i.test(label)) {
      return el;
    }
  }
  return null;
}

function pageLooksVerified() {
  const t = String(document.body?.innerText || "");
  return /hoàn\s*thành\s*xác\s*thực|đã\s*xác\s*thực|xác\s*thực\s*thành\s*công|verify(?:ied)?\s*success/i.test(
    t
  );
}

/**
 * Trang xác thực từ link mail «đây»: điền mã (nếu trống) + bấm «Xác Thực».
 * Success CHỈ khi pageLooksVerified() — không lấy vctCode từ subject mail làm ok giả.
 */
async function confirmEcargoVerifyPage(payload) {
  const code = String(payload?.code || payload?.otp || "")
    .trim()
    .toUpperCase();
  const hintVct = String(payload?.vctCode || "").trim();

  const started = Date.now();
  let input = null;
  while (Date.now() - started < 10_000) {
    if (pageLooksVerified()) {
      return {
        ok: true,
        message: `Đã xác thực phiếu${hintVct ? `: ${hintVct}` : ""}.`,
        scriptVersion: SCRIPT_VERSION,
        phase: "done",
        vctCode: hintVct,
        verified: true,
        submit: true,
        url: location.href,
      };
    }
    input = findVerifyCodeInput();
    const btnEarly = findVerifySubmitButton();
    if (input || btnEarly) break;
    await sleep(200);
  }

  // Có nút Xác Thực dù không parse được ô (mã đã prefill từ URL)
  if (code && code.length >= 6) {
    if (input) {
      const current = String(input.value || "").trim().toUpperCase();
      if (current !== code) {
        input.focus();
        setNativeValue(input, code);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        await sleep(80);
      }
    }
  } else if (!findVerifySubmitButton() && !input) {
    return {
      ok: false,
      error: "NO_VERIFY_UI",
      message:
        "Không thấy trang xác thực (ô mã / nút Xác Thực). Kiểm tra link «đây» trong mail.",
      scriptVersion: SCRIPT_VERSION,
      phase: "otp_submit",
      url: location.href,
    };
  }

  let btn = findVerifySubmitButton();
  for (let attempt = 0; attempt < 3 && !btn; attempt += 1) {
    await sleep(250);
    btn = findVerifySubmitButton();
  }
  if (!btn) {
    const clicked = input ? await clickOtpConfirm(input) : { ok: false };
    if (!clicked.ok) {
      return {
        ok: false,
        error: "NO_VERIFY_BTN",
        message: "Không thấy nút «Xác Thực» trên trang xác thực eCargo.",
        scriptVersion: SCRIPT_VERSION,
        phase: "otp_submit",
        url: location.href,
      };
    }
  } else {
    const $ = getJQuery();
    if ($ && $.fn) {
      try {
        $(btn).trigger("click");
      } catch {
        /* DOM */
      }
    }
    clickEl(btn);
  }

  await sleep(600);
  let verified = pageLooksVerified();
  for (let i = 0; i < 10 && !verified; i += 1) {
    await sleep(400);
    verified = pageLooksVerified();
  }

  let capture = { vctCode: "", qrDataUrl: "" };
  if (verified) {
    capture = await captureQrAndVctCode();
    if (!capture.vctCode && hintVct) capture.vctCode = hintVct;
  }

  // Chỉ gọi IMAP fallback khi đã verified mà thiếu QR
  const apiBase = String(payload?.apiBase || "").replace(/\/$/, "");
  const email = String(payload?.email || "").trim();
  const sinceIso = String(payload?.sinceIso || "").trim();
  if (
    verified &&
    apiBase &&
    email &&
    sinceIso &&
    !capture.qrDataUrl
  ) {
    try {
      const mailRes = await bgMessage({
        type: "ECARGO_RESULT_FROM_MAIL",
        apiBase,
        email,
        sinceIso,
      });
      if (mailRes?.ok && mailRes.qrUrl) capture.qrDataUrl = mailRes.qrUrl;
      if (mailRes?.ok && !capture.vctCode && mailRes.vctCode) {
        capture.vctCode = mailRes.vctCode;
      }
    } catch {
      /* ignore */
    }
  }

  return {
    ok: verified,
    message: verified
      ? `Đã xác thực phiếu${capture.vctCode ? `: ${capture.vctCode}` : ""}.`
      : "Đã bấm «Xác Thực» nhưng chưa thấy «hoàn thành xác thực» — kiểm tra tab eCargo.",
    scriptVersion: SCRIPT_VERSION,
    phase: verified ? "done" : "otp_submit",
    vctCode: verified ? capture.vctCode : "",
    qrDataUrl: verified ? capture.qrDataUrl : "",
    sinceIso: sinceIso || undefined,
    verified,
    url: location.href,
    submit: true,
  };
}
