/**
 * Content script TCS — điền KHAI BÁO ESID (không HOÀN TẤT).
 * Idempotent: inject nhiều lần chỉ cập nhật runner, không thêm listener.
 */
(() => {
  const SCRIPT_VERSION = "1.1.3";

  /** Fallback nếu không fetch được locators.json (đồng bộ với file đó). */
  const DEFAULT_LOCATORS = {
    home_url: "https://www.tcs.com.vn/Esid/Export",
    tab_text: "KHAI BÁO ESID",
    fields: {
      awb_prefix: "codAwbPfx",
      awb_number: "codAwbNum",
      flight_no: "flightNo",
      flight_date: "datFltOri",
      dest_code: "codFds",
      pcs: "qtyPcs",
      gross_weight: "wgtGrs",
      shipper_name: "shipperId",
      shipper_address: "addressShp",
      shipper_tel: "telShp",
      shipper_email: "emailShp",
      agent_name: "agentId",
      agent_address: "addressAgt",
      agent_tel: "telAgt",
      agent_email: "emailAgt",
      consignee_name: "consigneeId",
      consignee_address: "addressCne",
      consignee_tel: "telCne",
      consignee_email: "emailCne",
      notify_name: "notifyId",
      nature_of_goods: "natureOfGoods",
      other_request: "otherRequest",
      registrant_name: "shpRegNam",
      registrant_tel: "shpRegTel",
      registrant_id: "shpRegIdx",
      agree: "agreeConfirm",
    },
    choose_flight_button: "CHỌN CHUYẾN BAY",
    submit_button: "HOÀN TẤT",
  };

  let LOCATORS = DEFAULT_LOCATORS;
  let locatorsLoadPromise = null;

  function ensureLocators() {
    if (locatorsLoadPromise) return locatorsLoadPromise;
    locatorsLoadPromise = (async () => {
      try {
        if (typeof chrome === "undefined" || !chrome.runtime?.getURL) return;
        const res = await fetch(chrome.runtime.getURL("locators.json"));
        if (!res.ok) return;
        const data = await res.json();
        if (data?.esid_declare?.fields) {
          LOCATORS = data.esid_declare;
        }
      } catch {
        /* giữ DEFAULT_LOCATORS */
      }
    })();
    return locatorsLoadPromise;
  }

  // Prefetch sớm; runFill vẫn await để chắc chắn.
  void ensureLocators();

  /** @type {{ version: string, busy: boolean, runFill: Function }} */
  const api = (window.__TECSOPS_TCS__ = window.__TECSOPS_TCS__ || {
    version: SCRIPT_VERSION,
    busy: false,
    runFill: null,
  });
  api.version = SCRIPT_VERSION;

  async function runFill(payload) {
    if (api.busy) {
      return {
        ok: false,
        error: "BUSY",
        message: "Đang điền — đợi xong rồi bấm lại.",
        warnings: [],
        fills: {},
        scriptVersion: SCRIPT_VERSION,
      };
    }
    api.busy = true;
    const warnings = [];
    const fills = {};
    try {
      await ensureLocators();
      if (needsLogin()) {
        return {
          ok: false,
          error: "NEED_LOGIN",
          message: "Cần Login TCS trên tab này, rồi bấm Điền lại trên Ops.",
          warnings,
          fills,
          scriptVersion: SCRIPT_VERSION,
        };
      }

      await ensureDeclareTab(warnings);
      await hardResetUi();

      const ship = (payload && payload.shipment) || {};
      const reg = (payload && payload.registrant) || {};
      const awb = String(ship.awb || "").replace(/\D/g, "");
      if (awb.length !== 11) {
        return {
          ok: false,
          error: "BAD_AWB",
          message: "AWB phải đủ 11 số trong payload.",
          warnings,
          fills,
          scriptVersion: SCRIPT_VERSION,
        };
      }

      // 1) Text nhanh
      fills.codAwbPfx = setById(LOCATORS.fields.awb_prefix, awb.slice(0, 3));
      fills.codAwbNum = setById(LOCATORS.fields.awb_number, awb.slice(3));
      if (!fills.codAwbPfx || !fills.codAwbNum) {
        warnings.push("Không điền được AWB");
      }
      if (ship.pcs != null && String(ship.pcs) !== "") {
        fills.qtyPcs = setById(LOCATORS.fields.pcs, String(ship.pcs));
      }
      if (ship.nature_of_goods) {
        fills.natureOfGoods = setById(
          LOCATORS.fields.nature_of_goods,
          String(ship.nature_of_goods)
        );
      }
      if (ship.gross_weight != null && String(ship.gross_weight) !== "") {
        fills.wgtGrs = setById(LOCATORS.fields.gross_weight, String(ship.gross_weight));
      }

      // 2) Chuyến bay — xong phải đóng modal
      const flightNo = String(ship.flight_no || "").trim();
      const flightDate = String(ship.flight_date || "").trim();
      if (payload.choose_flight !== false && (flightNo || flightDate)) {
        const fr = await tryChooseFlight(flightNo, flightDate);
        Object.assign(fills, fr.fills);
        warnings.push(...fr.warnings);
      } else if (flightNo) {
        fills.flightNo = setById(LOCATORS.fields.flight_no, flightNo);
      }
      await hardResetUi();

      // 3) Dest
      if (ship.dest) {
        fills.codFds = await fillMasterField(LOCATORS.fields.dest_code, String(ship.dest), {
          maxQueries: 2,
        });
        if (!fills.codFds) {
          fills.codFds = setById(LOCATORS.fields.dest_code, String(ship.dest));
        }
        await hardResetUi();
      }

      // 4) Party — từng ô, reset UI trước/sau
      const partyMap = [
        [LOCATORS.fields.shipper_name, ship.shipper_name, "shipperId"],
        [LOCATORS.fields.agent_name, ship.agent_name, "agentId"],
        [LOCATORS.fields.consignee_name, ship.consignee_name, "consigneeId"],
        [LOCATORS.fields.notify_name, ship.notify_name, "notifyId"],
      ];
      for (const [id, value, key] of partyMap) {
        if (value == null || String(value).trim() === "") continue;
        await hardResetUi();
        fills[key] = await fillMasterField(id, String(value), { maxQueries: 3 });
        if (!fills[key]) {
          warnings.push(`#${id} chưa chọn master`);
        }
        await hardResetUi();
      }

      // 5) Địa chỉ / liên hệ
      const textMap = [
        [LOCATORS.fields.shipper_address, ship.shipper_address, "addressShp"],
        [LOCATORS.fields.shipper_tel, ship.shipper_tel, "telShp"],
        [LOCATORS.fields.shipper_email, ship.shipper_email, "emailShp"],
        [LOCATORS.fields.agent_address, ship.agent_address, "addressAgt"],
        [LOCATORS.fields.agent_tel, ship.agent_tel, "telAgt"],
        [LOCATORS.fields.agent_email, ship.agent_email, "emailAgt"],
        [LOCATORS.fields.consignee_address, ship.consignee_address, "addressCne"],
        [LOCATORS.fields.consignee_tel, ship.consignee_tel, "telCne"],
        [LOCATORS.fields.consignee_email, ship.consignee_email, "emailCne"],
      ];
      for (const [id, value, key] of textMap) {
        if (value == null || String(value).trim() === "") continue;
        fills[key] = setById(id, String(value));
      }
      // other_request: TCS có thể là otherRequest (ext) hoặc shcOthReq (Python) — thử cả hai.
      if (ship.other_request != null && String(ship.other_request).trim() !== "") {
        const othVal = String(ship.other_request);
        const othIds = [
          LOCATORS.fields.other_request,
          "otherRequest",
          "shcOthReq",
        ].filter((id, i, arr) => id && arr.indexOf(id) === i);
        let othOk = false;
        let othKey = "otherRequest";
        for (const id of othIds) {
          if (setById(id, othVal)) {
            othOk = true;
            othKey = id;
            break;
          }
        }
        fills[othKey] = othOk;
      }

      fills.shpRegNam = setById(LOCATORS.fields.registrant_name, reg.name || "");
      fills.shpRegTel = setById(LOCATORS.fields.registrant_tel, reg.tel || "");
      fills.shpRegIdx = setById(LOCATORS.fields.registrant_id, reg.cccd || "");

      await hardResetUi();

      return {
        ok: true,
        source: "chrome-extension",
        scriptVersion: SCRIPT_VERSION,
        message: `Đã điền (ext v${SCRIPT_VERSION}) — kiểm tra rồi HOÀN TẤT trên TCS.`,
        warnings,
        fills,
        values: {
          flightNo: getVal(LOCATORS.fields.flight_no),
          datFltOri: getVal(LOCATORS.fields.flight_date),
          codFds: getVal(LOCATORS.fields.dest_code),
          qtyPcs: getVal(LOCATORS.fields.pcs),
          awb: `${getVal(LOCATORS.fields.awb_prefix) || ""}${getVal(LOCATORS.fields.awb_number) || ""}`,
        },
      };
    } finally {
      api.busy = false;
      try {
        await hardResetUi();
      } catch {
        /* ignore */
      }
    }
  }

  api.runFill = runFill;

  if (!window.__TECSOPS_TCS_LISTENER__) {
    window.__TECSOPS_TCS_LISTENER__ = true;
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || typeof msg !== "object") return false;

      if (msg.type === "TCS_PING") {
        sendResponse({
          ok: true,
          scriptVersion: window.__TECSOPS_TCS__?.version || SCRIPT_VERSION,
          busy: Boolean(window.__TECSOPS_TCS__?.busy),
        });
        return false;
      }

      if (msg.type === "FILL_ESID") {
        const fn = window.__TECSOPS_TCS__?.runFill;
        if (typeof fn !== "function") {
          sendResponse({
            ok: false,
            error: "NO_RUNNER",
            message: "Content script chưa sẵn sàng — Reload extension + F5 tab TCS.",
            warnings: [],
          });
          return false;
        }
        void fn(msg.payload)
          .then(sendResponse)
          .catch((err) => {
            sendResponse({
              ok: false,
              error: "FILL_FAILED",
              message: err instanceof Error ? err.message : String(err),
              warnings: [],
              scriptVersion: SCRIPT_VERSION,
            });
          });
        return true;
      }
      return false;
    });
  }

  function needsLogin() {
    const href = (location.href || "").toLowerCase();
    if (href.includes("awblogin") || href.includes("/login")) return true;
    if (document.getElementById("basic_username") || document.getElementById("basic_password")) {
      return true;
    }
    return false;
  }

  async function ensureDeclareTab(warnings) {
    if (!(location.href || "").includes("/Esid/")) {
      location.assign(LOCATORS.home_url);
      await sleep(1200);
    }
    if (!clickTabByText(LOCATORS.tab_text)) {
      if (!clickTabByText("KHAI BÁO") && !clickTabByText("Khai báo")) {
        warnings.push("Không click được tab KHAI BÁO ESID");
      }
    } else {
      await sleep(400);
    }
    for (let i = 0; i < 20; i++) {
      if (document.getElementById(LOCATORS.fields.awb_number)) return;
      await sleep(200);
    }
    warnings.push("Chưa thấy ô AWB");
  }

  function clickTabByText(text) {
    const target = normalizeText(text);
    for (const el of document.querySelectorAll(
      "a, button, [role='tab'], .ant-tabs-tab, .ant-menu-item, span, div"
    )) {
      const t = normalizeText(el.textContent || "");
      if (!t.includes(target) || t.length > target.length + 40) continue;
      el.click();
      return true;
    }
    return false;
  }

  /** Đóng dropdown + modal chuyến bay — tránh treo chồng UI */
  async function hardResetUi() {
    try {
      document.activeElement && document.activeElement.blur && document.activeElement.blur();
    } catch {
      /* ignore */
    }
    for (let i = 0; i < 4; i++) {
      pressKey("Escape");
      await sleep(40);
    }
    // Ẩn dropdown còn sót
    for (const d of document.querySelectorAll(".ant-select-dropdown")) {
      d.classList.add("ant-select-dropdown-hidden");
      d.style.pointerEvents = "none";
      d.style.display = "none";
    }
    // Đóng mọi modal visible (Cancel / close icon)
    for (const wrap of document.querySelectorAll(
      ".ant-modal-wrap:not(.ant-modal-wrap-hidden), .ant-modal-root .ant-modal"
    )) {
      if (!isVisible(wrap) && !wrap.closest?.(".ant-modal-wrap")) continue;
      const modal = wrap.classList?.contains("ant-modal")
        ? wrap
        : wrap.querySelector?.(".ant-modal") || wrap;
      const close =
        modal.querySelector?.(".ant-modal-close") ||
        footerButton(modal, ["cancel", "huy", "dong", "close"]) ||
        footerButton(modal, null, { preferNonPrimary: true });
      if (close) {
        try {
          close.click();
        } catch {
          /* ignore */
        }
      }
    }
    await sleep(120);
  }

  function footerButton(root, labels, opts = {}) {
    if (!root) return null;
    const buttons = [...root.querySelectorAll(".ant-modal-footer button, .ant-modal-footer .ant-btn, button")];
    if (labels && labels.length) {
      for (const b of buttons) {
        const t = normalizeText(b.textContent || "");
        if (labels.some((l) => t.includes(normalizeText(l)))) return b;
      }
    }
    if (opts.preferNonPrimary) {
      const secondary = buttons.find(
        (b) =>
          !b.classList.contains("ant-btn-primary") &&
          !/ok|chon|xac nhan|submit/i.test(normalizeText(b.textContent || ""))
      );
      if (secondary) return secondary;
    }
    return null;
  }

  function pressKey(key) {
    const opts = { key, code: key === "Escape" ? "Escape" : key, bubbles: true, cancelable: true };
    if (key === "Escape") opts.keyCode = 27;
    if (key === "Enter") opts.keyCode = 13;
    if (key === "ArrowDown") opts.keyCode = 40;
    const t = document.activeElement || document.body;
    t.dispatchEvent(new KeyboardEvent("keydown", opts));
    t.dispatchEvent(new KeyboardEvent("keyup", opts));
    document.dispatchEvent(new KeyboardEvent("keydown", opts));
  }

  async function tryChooseFlight(flightNo, flightDateYmd) {
    const fills = {};
    const warnings = [];
    await hardResetUi();

    const btn =
      findButtonByText("CHỌN CHUYẾN BAY") ||
      findButtonByText("CHON CHUYEN BAY") ||
      findButtonByText("Choose flight");
    if (!btn) {
      if (flightNo) fills.flightNo = setById(LOCATORS.fields.flight_no, flightNo);
      warnings.push("Không thấy nút CHỌN CHUYẾN BAY");
      return { fills, warnings };
    }
    btn.click();
    await sleep(450);

    let modal = null;
    for (let i = 0; i < 20; i++) {
      modal = visibleFlightModal();
      if (modal) break;
      await sleep(120);
    }
    if (!modal) {
      warnings.push("Modal chuyến bay không hiện");
      return { fills, warnings };
    }

    const mdy = ymdToMdy(flightDateYmd);
    const modalFlight = modal.querySelector("#flightNo");
    const modalDate = modal.querySelector("#flightDate");
    if (mdy && modalDate) setNativeValue(modalDate, mdy);
    if (flightNo && modalFlight) setNativeValue(modalFlight, flightNo);

    const findBtn =
      findButtonIn(modal, "TIM") ||
      findButtonIn(modal, "SEARCH") ||
      findButtonIn(modal, "TRA CUU");
    if (findBtn) findBtn.click();
    await sleep(550);

    const wantF = normalizeText(flightNo);
    let picked = false;
    for (const row of modal.querySelectorAll(".ant-table-tbody tr, tbody tr, .ant-table-row")) {
      const t = normalizeText(row.textContent || "");
      if (!t || t.includes("NO DATA") || t.includes("KHONG CO")) continue;
      if (wantF && !t.includes(wantF)) continue;
      const cell = row.querySelector("td") || row;
      cell.click();
      picked = true;
      await sleep(200);
      break;
    }

    if (picked) {
      const ok =
        findButtonIn(modal, "OK") ||
        findButtonIn(modal, "CHON") ||
        footerButton(modal, ["ok", "chon"]);
      if (ok) ok.click();
      await sleep(300);
    } else {
      warnings.push("Không chọn được chuyến — đóng modal, chọn tay nếu cần");
      const cancel =
        footerButton(modal, ["cancel", "huy", "dong", "close"]) ||
        modal.querySelector(".ant-modal-close") ||
        footerButton(modal, null, { preferNonPrimary: true });
      if (cancel) cancel.click();
      await sleep(200);
    }

    // Bảo đảm modal đã đóng
    if (visibleFlightModal()) await hardResetUi();

    fills.choose_flight = picked;
    fills.flightNo = Boolean(getVal(LOCATORS.fields.flight_no));
    fills.datFltOri = Boolean(getVal(LOCATORS.fields.flight_date));
    return { fills, warnings };
  }

  function visibleFlightModal() {
    for (const el of document.querySelectorAll(
      ".ant-modal-wrap:not(.ant-modal-wrap-hidden) .ant-modal, [role='dialog']"
    )) {
      if (!isVisible(el)) continue;
      const t = normalizeText(el.textContent || "");
      if (t.includes("CHUYEN BAY") || t.includes("FLIGHT") || t.includes("DANH SACH")) {
        return el;
      }
    }
    return null;
  }

  async function fillMasterField(id, value, opts = {}) {
    const text = String(value || "").trim();
    if (!id || !text) return false;
    const el = document.getElementById(id);
    if (!el) return false;
    const maxQueries = opts.maxQueries || 3;

    const wrap = el.closest(".ant-select") || el;
    wrap.click();
    await sleep(100);

    const search =
      wrap.querySelector("input.ant-select-selection-search-input") ||
      document.querySelector(`#${CSS.escape(id)}.ant-select-selection-search-input`) ||
      (el.matches("input") ? el : null);

    const queries = comboboxSearchQueries(text).slice(0, maxQueries);
    for (const query of queries) {
      if (search) {
        setNativeValue(search, "");
        await sleep(40);
        setNativeValue(search, query);
        try {
          search.focus();
        } catch {
          /* ignore */
        }
      } else {
        setById(id, query);
      }
      await sleep(480);

      // Ưu tiên: 1 option → ArrowDown + Enter (ổn định Ant Select)
      const options = collectMasterOptions();
      if (options.length === 1 || (options.length > 0 && scoreSelectOption(text, options[0].label) >= 35)) {
        if (options.length === 1 || options.length <= 3) {
          pressKey("ArrowDown");
          await sleep(60);
          pressKey("Enter");
          await sleep(180);
          if (!dropdownStillOpen()) return true;
        }
      }

      let best = null;
      let bestScore = 0;
      for (const opt of options.slice(0, 20)) {
        const score = scoreSelectOption(text, opt.label);
        if (score > bestScore) {
          bestScore = score;
          best = opt;
        }
      }
      if (best && bestScore >= (options.length === 1 ? 15 : 30)) {
        const target =
          best.el.querySelector(".ant-select-item-option-content") ||
          best.titleEl ||
          best.el;
        // Không click nút Thêm mới
        simulateClick(target);
        await sleep(200);
        if (!dropdownStillOpen()) return true;
        // fallback Enter
        pressKey("Enter");
        await sleep(150);
        if (!dropdownStillOpen()) return true;
      }
    }

    await hardResetUi();
    return false;
  }

  function dropdownStillOpen() {
    return [...document.querySelectorAll(".ant-select-dropdown")].some(
      (d) =>
        !d.classList.contains("ant-select-dropdown-hidden") &&
        d.style.display !== "none" &&
        isVisible(d)
    );
  }

  function collectMasterOptions() {
    const out = [];
    const seen = new Set();

    for (const opt of document.querySelectorAll(
      ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option, " +
        ".ant-select-dropdown .ant-select-item-option"
    )) {
      if (seen.has(opt)) continue;
      if (opt.style.display === "none") continue;
      const label = (
        opt.getAttribute("title") ||
        opt.querySelector(".ant-select-item-option-content")?.textContent ||
        opt.textContent ||
        ""
      )
        .replace(/\+\s*Thêm mới/gi, "")
        .replace(/\+\s*Add new/gi, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!label || label.length < 2) continue;
      seen.add(opt);
      out.push({ el: opt, label });
    }

    // Card có nút Thêm mới / Add new (UI TCS)
    for (const addBtn of document.querySelectorAll("button, a, span, div")) {
      const raw = (addBtn.textContent || "").trim();
      if (!/^(\+\s*)?(Thêm mới|Add new)$/i.test(raw)) continue;
      if (!isVisible(addBtn)) continue;
      const card =
        addBtn.closest(".ant-select-item-option") ||
        addBtn.closest(".ant-select-item") ||
        addBtn.closest("li") ||
        addBtn.parentElement?.parentElement;
      if (!card || seen.has(card)) continue;
      const clone = card.cloneNode(true);
      for (const n of clone.querySelectorAll("button, a, span, div")) {
        if (/Thêm mới|Add new/i.test((n.textContent || "").trim())) n.remove();
      }
      const label = (clone.textContent || "").replace(/\s+/g, " ").trim();
      if (!label || label.length < 3) continue;
      seen.add(card);
      const titleEl =
        card.querySelector("[title]") ||
        card.querySelector("b, strong, .ant-select-item-option-content") ||
        card.firstElementChild;
      out.push({ el: card, label, titleEl, addBtn });
    }
    return out;
  }

  function simulateClick(el) {
    if (!el) return;
    for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
      el.dispatchEvent(
        new MouseEvent(type, { bubbles: true, cancelable: true, view: window, buttons: 1 })
      );
    }
    if (typeof el.click === "function") el.click();
  }

  function comboboxSearchQueries(text) {
    const raw = String(text || "").trim();
    if (!raw) return [];
    const fold = normalizeText(raw);
    const words = fold.split(/[\s,/|.-]+/).filter(Boolean);
    const queries = [];
    if (words.length && words[words.length - 1].length >= 2 && words[words.length - 1].length <= 12) {
      queries.push(words[words.length - 1]);
    }
    if (lenWords(words, 2)) queries.push(words.slice(-2).join(" "));
    if (lenWords(words, 3)) queries.push(words.slice(-3).join(" "));
    if (raw.length > 16) queries.push(raw.slice(0, 16).trim());
    queries.push(raw.length <= 36 ? raw : raw.slice(0, 36));
    const seen = new Set();
    const out = [];
    for (const q of queries) {
      const k = normalizeText(q);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(q.trim());
    }
    return out;

    function lenWords(w, n) {
      return w.length >= n;
    }
  }

  function scoreSelectOption(fullText, optionText) {
    const foldFull = normalizeText(fullText);
    const foldOpt = normalizeText(optionText);
    if (!foldFull || !foldOpt) return 0;
    if (foldOpt === foldFull) return 100;
    if (foldFull.includes(foldOpt) || foldOpt.includes(foldFull)) return 82;
    const fullArr = foldFull.split(/\s+/).filter(Boolean);
    const optArr = foldOpt.split(/\s+/).filter(Boolean);
    const optWords = new Set(optArr);
    let common = 0;
    for (const w of fullArr) if (optWords.has(w)) common += 1;
    if (!common) return 0;
    let score = Math.floor((55 * common) / Math.max(fullArr.length, 1));
    if (fullArr.at(-1) && fullArr.at(-1) === optArr.at(-1)) score += 25;
    return score;
  }

  function findButtonByText(label) {
    return findButtonIn(document, label);
  }

  function findButtonIn(root, label) {
    const target = normalizeText(label);
    for (const b of root.querySelectorAll("button, a.ant-btn, [role='button']")) {
      const t = normalizeText(b.textContent || "");
      if (t === target || t.includes(target)) return b;
    }
    return null;
  }

  function setById(id, value) {
    const el = document.getElementById(id);
    if (!el) return false;
    return setNativeValue(el, value == null ? "" : String(value));
  }

  function setNativeValue(el, value) {
    if (!el) return false;
    const v = String(value ?? "");
    const tag = (el.tagName || "").toLowerCase();
    if (tag !== "input" && tag !== "textarea") return false;
    const proto =
      tag === "textarea" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, v);
    else el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: v }));
    return true;
  }

  function getVal(id) {
    const el = document.getElementById(id);
    if (!el) return "";
    const wrap = el.closest?.(".ant-select");
    if (wrap) {
      const item = wrap.querySelector(".ant-select-selection-item");
      const title = item && (item.getAttribute("title") || item.textContent);
      if (title && String(title).trim()) return String(title).trim();
    }
    return String(el.value != null ? el.value : "").trim();
  }

  function isVisible(el) {
    if (!el?.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const st = getComputedStyle(el);
    return st.display !== "none" && st.visibility !== "hidden" && st.opacity !== "0";
  }

  function ymdToMdy(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
    return m ? `${m[2]}-${m[3]}-${m[1]}` : "";
  }

  function normalizeText(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  console.info(`[tecsops-ext] content-tcs ready v${SCRIPT_VERSION}`);
})();
