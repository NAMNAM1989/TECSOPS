/**
 * Content script TCS — điền KHAI BÁO ESID (không HOÀN TẤT).
 * Idempotent: inject nhiều lần chỉ cập nhật runner, không thêm listener.
 */
(() => {
  const SCRIPT_VERSION = "2.0.10";

  let LOCATORS = null;
  const locatorsReady = fetch(chrome.runtime.getURL("locators.json"))
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((config) => {
      if (!config?.esid_declare?.fields) {
        throw new Error("locators.json thiếu esid_declare.fields");
      }
      LOCATORS = config.esid_declare;
      return LOCATORS;
    });

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
    showWorkspaceOverlay("FILLING", "Chuẩn bị form khai báo…", 0, 7);
    const warnings = [];
    const fills = {};
    try {
      await locatorsReady;
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

      // 1) Chuyến bay trước: modal TCS có thể dựng/reset các phần còn lại.
      const flightNo = String(ship.flight_no || "").trim();
      const flightDate = String(ship.flight_date || "").trim();
      if (payload.choose_flight !== false && (flightNo || flightDate)) {
        updateWorkspaceOverlay("FILLING", "Đang chọn chuyến bay trước", 1, 7);
        const fr = await tryChooseFlight(flightNo, flightDate);
        Object.assign(fills, fr.fills);
        warnings.push(...fr.warnings);
        if (!fills.choose_flight) {
          updateWorkspaceOverlay(
            "ERROR",
            "Chưa xác nhận được chuyến bay — dừng để kiểm tra popup Đồng ý",
            1,
            7
          );
          return {
            ok: false,
            error: "FLIGHT_SELECTION_FAILED",
            source: "chrome-extension",
            scriptVersion: SCRIPT_VERSION,
            message:
              "TCS chưa lưu chuyến bay. Kiểm tra và bấm Đồng ý trên popup đang mở rồi thử lại.",
            warnings,
            fills,
            values: {
              flightNo: getVal(LOCATORS.fields.flight_no),
              datFltOri: getVal(LOCATORS.fields.flight_date),
            },
          };
        }
      } else if (flightNo) {
        fills.flightNo = setById(LOCATORS.fields.flight_no, flightNo);
      }
      await hardResetUi();

      // 2) Party master: chọn danh mục TCS và giữ nguyên dữ liệu tự điền.
      const partyMap = [
        [LOCATORS.fields.shipper_name, ship.shipper_name, "shipperId"],
        [LOCATORS.fields.agent_name, ship.agent_name, "agentId"],
        [LOCATORS.fields.consignee_name, ship.consignee_name, "consigneeId"],
        [LOCATORS.fields.notify_name, ship.notify_name, "notifyId"],
      ];
      for (const [id, value, key] of partyMap) {
        if (value == null || String(value).trim() === "") {
          fills[key] = clearMasterField(id);
          continue;
        }
        updateWorkspaceOverlay("FILLING", `Đang chọn ${key} từ danh mục TCS`, 2, 7);
        await hardResetUi();
        fills[key] = await fillMasterField(id, String(value), {
          maxQueries: 2,
          budgetMs: 4_000,
        });
        if (!fills[key]) {
          warnings.push(`#${id} chưa chọn được master trong 4 giây — để trống, không ghi đè text`);
        }
        await hardResetUi();
      }

      // 3) Mặc định nghiệp vụ.
      updateWorkspaceOverlay("FILLING", "Đang chọn Chuyển khoản và Kho hàng TECS", 3, 7);
      fills.codPayMod = await selectPaymentMode(
        String(ship.payment_mode || "Chuyển khoản/Bank transfer")
      );
      if (!fills.codPayMod) warnings.push("Chưa chọn được Chuyển khoản");
      fills.shcCod002 = setCheckboxById(
        LOCATORS.fields.tecs_warehouse || "shcCod002",
        ship.tecs_warehouse !== false
      );
      if (!fills.shcCod002) warnings.push("Chưa chọn được Kho hàng TECS");
      await hardResetUi();

      // 4) Các trường còn lại sau khi flight/master đã ổn định.
      updateWorkspaceOverlay("FILLING", "Đang điền AWB và thông tin lô", 4, 7);
      fills.codAwbPfx = setById(LOCATORS.fields.awb_prefix, awb.slice(0, 3));
      fills.codAwbNum = setById(LOCATORS.fields.awb_number, awb.slice(3));
      if (!fills.codAwbPfx || !fills.codAwbNum) warnings.push("Không điền được AWB");
      fills.qtyPcs = setById(
        LOCATORS.fields.pcs,
        ship.pcs != null ? String(ship.pcs) : ""
      );
      fills.totalOfHawbs = setById(
        LOCATORS.fields.total_hawbs || "totalOfHawbs",
        ship.total_hawbs != null ? String(ship.total_hawbs) : ""
      );
      fills.natureOfGoods = setById(
        LOCATORS.fields.nature_of_goods,
        ship.nature_of_goods != null ? String(ship.nature_of_goods) : ""
      );
      fills.wgtGrs = setById(
        LOCATORS.fields.gross_weight,
        ship.gross_weight != null ? String(ship.gross_weight) : ""
      );
      if (ship.dest) {
        fills.codFds = await fillMasterField(LOCATORS.fields.dest_code, String(ship.dest), {
          maxQueries: 2,
          budgetMs: 3_000,
        });
        if (!fills.codFds) fills.codFds = setById(LOCATORS.fields.dest_code, String(ship.dest));
      } else {
        fills.codFds = clearMasterField(LOCATORS.fields.dest_code);
      }
      fills.otherRequest = setById(
        LOCATORS.fields.other_request,
        ship.other_request != null ? String(ship.other_request) : ""
      );

      fills.shpRegNam = setById(LOCATORS.fields.registrant_name, reg.name || "");
      fills.shpRegTel = setById(LOCATORS.fields.registrant_tel, reg.tel || "");
      fills.shpRegIdx = setById(LOCATORS.fields.registrant_id, reg.cccd || "");

      await hardResetUi();
      updateWorkspaceOverlay("READY", "Đã điền xong — kiểm tra rồi HOÀN TẤT", 7, 7);

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
          codFds: getControlValue(LOCATORS.fields.dest_code),
          codPayMod: getControlValue(LOCATORS.fields.payment_mode || "codPayMod"),
          shcCod002: isCheckboxChecked(LOCATORS.fields.tecs_warehouse || "shcCod002"),
          shipperId: getControlValue(LOCATORS.fields.shipper_name),
          agentId: getControlValue(LOCATORS.fields.agent_name),
          consigneeId: getControlValue(LOCATORS.fields.consignee_name),
          qtyPcs: getVal(LOCATORS.fields.pcs),
          totalOfHawbs: getVal(LOCATORS.fields.total_hawbs || "totalOfHawbs"),
          grossWeight: getVal(LOCATORS.fields.gross_weight),
          natureOfGoods: getVal(LOCATORS.fields.nature_of_goods),
          otherRequest: getVal(LOCATORS.fields.other_request),
          awb: `${getVal(LOCATORS.fields.awb_prefix) || ""}${getVal(LOCATORS.fields.awb_number) || ""}`,
        },
      };
    } finally {
      api.busy = false;
      // Không đóng modal trong finally: nếu chọn chuyến bay lỗi, giữ nguyên
      // popup để người dùng nhìn thấy và tránh Escape hủy nút Đồng ý.
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
          loggedIn: !needsLogin(),
        });
        return false;
      }

      if (msg.type === "TCS_GET_CAPTCHA") {
        void getCaptchaData().then(sendResponse);
        return true;
      }

      if (msg.type === "TCS_LOGIN_STATUS") {
        void getLoginStatus().then(sendResponse);
        return true;
      }

      if (msg.type === "TCS_REFRESH_CAPTCHA") {
        const refreshed = refreshCaptcha();
        sendResponse({ ok: refreshed });
        return false;
      }

      if (msg.type === "TCS_LOGIN") {
        const result = fillAndSubmitLogin(msg.payload || {});
        sendResponse(result);
        return false;
      }

      if (msg.type === "TCS_SCAN_DATE") {
        void scanByDate(msg.payload || {})
          .then(sendResponse)
          .catch((err) => {
            updateWorkspaceOverlay("ERROR", err instanceof Error ? err.message : String(err), 0, 1);
            sendResponse({
              ok: false,
              error: "SCAN_FAILED",
              message: err instanceof Error ? err.message : String(err),
            });
          });
        return true;
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

  function ensureWorkspaceOverlay() {
    let root = document.getElementById("tecsops-tcs-workspace");
    if (root) return root;
    root = document.createElement("aside");
    root.id = "tecsops-tcs-workspace";
    root.innerHTML = `
      <div class="tecsops-head">
        <strong>TECSOPS · TCS</strong>
        <button type="button" data-close aria-label="Ẩn">×</button>
      </div>
      <div class="tecsops-phase" data-phase>IDLE</div>
      <div class="tecsops-message" data-message>Sẵn sàng</div>
      <div class="tecsops-track"><span data-progress></span></div>
      <div class="tecsops-count" data-count></div>
    `;
    const style = document.createElement("style");
    style.id = "tecsops-tcs-workspace-style";
    style.textContent = `
      #tecsops-tcs-workspace {
        position: fixed; z-index: 2147483647; top: 72px; right: 18px; width: 290px;
        padding: 12px; border: 1px solid rgba(14,165,233,.45); border-radius: 14px;
        background: rgba(15,23,42,.95); color: #f8fafc; box-shadow: 0 18px 45px rgba(15,23,42,.32);
        font: 12px/1.45 system-ui, sans-serif; backdrop-filter: blur(10px);
      }
      #tecsops-tcs-workspace .tecsops-head { display:flex; align-items:center; justify-content:space-between; }
      #tecsops-tcs-workspace .tecsops-head strong { color:#7dd3fc; letter-spacing:.04em; }
      #tecsops-tcs-workspace button { border:0; background:transparent; color:#cbd5e1; font-size:18px; cursor:pointer; }
      #tecsops-tcs-workspace .tecsops-phase { margin-top:8px; color:#34d399; font-weight:800; }
      #tecsops-tcs-workspace .tecsops-message { margin-top:3px; min-height:34px; }
      #tecsops-tcs-workspace .tecsops-track { height:6px; margin-top:8px; overflow:hidden; border-radius:999px; background:#334155; }
      #tecsops-tcs-workspace .tecsops-track span { display:block; width:0; height:100%; background:#38bdf8; transition:width .2s ease; }
      #tecsops-tcs-workspace .tecsops-count { margin-top:5px; color:#94a3b8; font-size:10px; }
      .tecsops-active-field { outline:3px solid #fb923c !important; outline-offset:2px !important; }
      .tecsops-done-field { outline:2px solid #34d399 !important; outline-offset:1px !important; }
    `;
    if (!document.getElementById(style.id)) document.documentElement.appendChild(style);
    document.documentElement.appendChild(root);
    root.querySelector("[data-close]")?.addEventListener("click", () => root.remove());
    return root;
  }

  function showWorkspaceOverlay(phase, message, current = 0, total = 1) {
    const root = ensureWorkspaceOverlay();
    root.style.display = "block";
    updateWorkspaceOverlay(phase, message, current, total);
  }

  function updateWorkspaceOverlay(phase, message, current = 0, total = 1) {
    const root = ensureWorkspaceOverlay();
    const ratio = total > 0 ? Math.max(0, Math.min(1, current / total)) : 0;
    const phaseEl = root.querySelector("[data-phase]");
    const messageEl = root.querySelector("[data-message]");
    const progressEl = root.querySelector("[data-progress]");
    const countEl = root.querySelector("[data-count]");
    if (phaseEl) {
      phaseEl.textContent = phase || "IDLE";
      phaseEl.style.color = phase === "ERROR" ? "#f87171" : phase === "READY" ? "#34d399" : "#fbbf24";
    }
    if (messageEl) messageEl.textContent = message || "";
    if (progressEl) progressEl.style.width = `${Math.round(ratio * 100)}%`;
    if (countEl) countEl.textContent = total > 1 ? `${current}/${total}` : "";
  }

  async function getCaptchaData() {
    const input = document.getElementById("basic_captchaCode");
    const root = input?.closest(".ant-form-item") || input?.parentElement || document;
    const images = [
      ...root.querySelectorAll("img"),
      ...document.querySelectorAll(
        ".ant-form-item:has(#basic_captchaCode) img, #basic_captchaCode ~ img, img[src^='data:image'], img[src*='captcha' i]"
      ),
    ];
    const image =
      images.find((item) => String(item.getAttribute("src") || "").startsWith("data:image")) ||
      images.find((item) => /captcha/i.test(String(item.getAttribute("src") || ""))) ||
      images[0];
    let dataUrl = "";
    if (image) {
      const src = String(image.getAttribute("src") || "");
      if (src.startsWith("data:image")) {
        dataUrl = src;
      } else {
        try {
          const response = await fetch(image.src, { credentials: "include" });
          const blob = await response.blob();
          dataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => resolve("");
            reader.readAsDataURL(blob);
          });
        } catch {
          dataUrl = "";
        }
      }
    }
    if (!dataUrl) {
      const canvas =
        root.querySelector("canvas") ||
        document.querySelector(".ant-form-item:has(#basic_captchaCode) canvas");
      try {
        dataUrl = canvas?.toDataURL("image/png") || "";
      } catch {
        dataUrl = "";
      }
    }
    return {
      ok: true,
      dataUrl,
      diag: {
        url: location.href,
        hasInput: Boolean(input),
        imageCount: images.length,
        imageSources: images.slice(0, 5).map((item) =>
          String(item.getAttribute("src") || "").slice(0, 120)
        ),
      },
    };
  }

  async function getLoginStatus() {
    const loggedIn = !needsLogin();
    if (loggedIn) {
      return { ok: true, loggedIn: true, captchaDataUrl: "", message: "" };
    }
    const captcha = await getCaptchaData();
    const errorElement =
      document.querySelector(".ant-message-error") ||
      document.querySelector(".ant-alert-error") ||
      document.querySelector("[role='alert']") ||
      document.querySelector(".ant-form-item-has-error .ant-form-item-explain");
    return {
      ok: true,
      loggedIn: false,
      captchaDataUrl: String(captcha?.dataUrl || ""),
      message: String(errorElement?.textContent || "").trim(),
    };
  }

  function fillAndSubmitLogin(payload) {
    const username = String(payload.username || "").trim();
    const password = String(payload.password || "");
    const captcha = String(payload.captcha || "").trim().toUpperCase();
    if (!username || !password) {
      return { ok: false, error: "CREDENTIALS_REQUIRED", message: "Thiếu user/password TCS" };
    }
    showWorkspaceOverlay("LOGIN", "Đang điền tài khoản TCS…", 1, 3);
    const userOk = setById("basic_username", username);
    const passOk = setById("basic_password", password);
    const captchaInput = document.getElementById("basic_captchaCode");
    const captchaSet = captcha ? setById("basic_captchaCode", captcha) : false;
    if (!userOk || !passOk) {
      return {
        ok: false,
        error: "LOGIN_FORM_NOT_FOUND",
        message: "Không thấy form đăng nhập TCS",
      };
    }
    if (captchaInput && !captcha) {
      updateWorkspaceOverlay("NEEDS_CAPTCHA", "Đã điền user/password — cần CAPTCHA", 2, 3);
      captchaInput.focus();
      return {
        ok: true,
        clicked: false,
        needsCaptcha: true,
        message: "Đã điền user/password, chờ CAPTCHA",
      };
    }
    const captchaValue = String(captchaInput?.value || "").trim().toUpperCase();
    const captchaFilled =
      !captchaInput || (captchaSet && captchaValue === captcha && captcha.length === 5);
    if (captcha && !captchaFilled) {
      updateWorkspaceOverlay(
        "ERROR",
        `Không ghi được CAPTCHA vào form TCS (${captchaValue.length}/5 ký tự)`,
        2,
        3
      );
      captchaInput?.focus();
      return {
        ok: false,
        error: "CAPTCHA_FILL_FAILED",
        message: "OCR đã đọc được CAPTCHA nhưng form TCS không nhận giá trị.",
        captchaFilled: false,
        captchaLength: captchaValue.length,
      };
    }
    if (captchaInput && captcha) {
      // Ant Design/React xác nhận trường sau chuỗi focus → input → change → blur.
      captchaInput.focus();
      captchaInput.dispatchEvent(new Event("input", { bubbles: true }));
      captchaInput.dispatchEvent(new Event("change", { bubbles: true }));
      captchaInput.blur();
    }
    if (payload.submit === false) {
      updateWorkspaceOverlay("LOGIN", "Đã kiểm tra: CAPTCHA đã điền đủ 5 ký tự", 2, 3);
      return {
        ok: true,
        clicked: false,
        fillOnly: true,
        needsCaptcha: false,
        captchaFilled,
        captchaLength: captchaValue.length,
      };
    }
    const submit =
      [...document.querySelectorAll("button")].find((button) => {
        const text = normalizeText(button.textContent || "");
        return text.includes("DANG NHAP") || text.includes("LOGIN");
      }) ||
      document.querySelector("button[type='submit']");
    if (!submit) {
      return { ok: false, error: "LOGIN_BUTTON_NOT_FOUND", message: "Không thấy nút Đăng nhập" };
    }
    updateWorkspaceOverlay("LOGIN", "Đang gửi đăng nhập…", 3, 3);
    window.setTimeout(() => simulateClick(submit), 180);
    return {
      ok: true,
      clicked: true,
      needsCaptcha: false,
      captchaFilled,
      captchaLength: captchaValue.length,
    };
  }

  function refreshCaptcha() {
    const input = document.getElementById("basic_captchaCode");
    const root = input?.closest(".ant-form-item") || input?.parentElement || document;
    const reload =
      root.querySelector(
        "[aria-label='reload'], [aria-label='sync'], [aria-label='redo'], " +
          ".anticon-reload, .anticon-sync, svg[data-icon='reload'], svg[data-icon='sync']"
      ) ||
      [...root.querySelectorAll("button, span, img")].find((item) =>
        /reload|captcha|refresh|sync|redo/i.test(
          `${item.getAttribute?.("aria-label") || ""} ${item.getAttribute?.("data-icon") || ""} ${
            item.getAttribute?.("src") || ""
          }`
        )
      );
    if (reload) {
      simulateClick(reload.closest?.("button, span") || reload);
      return true;
    }
    return false;
  }

  async function scanByDate(payload) {
    const sessionDate = String(payload.session_date || payload.sessionDate || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
      return { ok: false, error: "DATE_REQUIRED", message: "Ngày quét phải có dạng YYYY-MM-DD" };
    }
    if (needsLogin()) {
      return { ok: false, error: "NEED_LOGIN", message: "Session TCS chưa đăng nhập" };
    }
    showWorkspaceOverlay("SCANNING", `Đang lọc ngày ${sessionDate}`, 0, 1);
    clickTabByText("DANH SÁCH ESID") || clickTabByText("DANH SACH ESID");
    await sleep(350);

    const [year, month, day] = sessionDate.split("-");
    const dmy = `${day}-${month}-${year}`;
    const start = document.querySelector("#search-form_dateSearch");
    const end =
      document.querySelector("input[placeholder='Ngày kết thúc']") ||
      [...document.querySelectorAll("input")].find((item) =>
        normalizeText(item.getAttribute("placeholder") || "").includes("NGAY KET THUC")
      );
    if (!start || !end) {
      return {
        ok: false,
        error: "DATE_FILTER_NOT_FOUND",
        message: "Không thấy bộ lọc ngày trên danh sách ESID",
      };
    }
    setNativeValue(start, dmy);
    dispatchEnter(start);
    setNativeValue(end, dmy);
    dispatchEnter(end);
    pressKey("Escape");
    const search = [...document.querySelectorAll("button")].find((button) =>
      normalizeText(button.textContent || "").includes("TIM KIEM")
    );
    if (!search) {
      return { ok: false, error: "SEARCH_NOT_FOUND", message: "Không thấy nút TÌM KIẾM" };
    }
    simulateClick(search);
    await waitForTableRows();

    const allRows = [];
    const seen = new Set();
    for (let pageIndex = 0; pageIndex < 40; pageIndex += 1) {
      const pageNumber = currentPageNumber();
      const rows = readEsidRows(pageNumber);
      for (const row of rows) {
        const key = `${row.awb}|${row.esid}|${row.flight_date}|${row.status}`;
        if (seen.has(key)) continue;
        seen.add(key);
        allRows.push(row);
      }
      updateWorkspaceOverlay(
        "SCANNING",
        `Đã đọc ${allRows.length} dòng · trang ${pageNumber}`,
        pageIndex + 1,
        Math.max(pageIndex + 2, 2)
      );
      const next = document.querySelector(
        ".ant-pagination-next:not(.ant-pagination-disabled)"
      );
      if (!next || !isVisible(next)) break;
      const before = rows[0]?.awb || "";
      simulateClick(next);
      await waitForTableChange(before);
    }

    const opsAwbs = (Array.isArray(payload.awbs) ? payload.awbs : [])
      .map((awb) => String(awb || "").replace(/\D/g, "").slice(0, 11))
      .filter((awb) => awb.length === 11);
    const readyRows = allRows.filter((row) => isReceptionComplete(row.status, row.text));
    const ready = [];
    const readySet = new Set();
    for (const row of readyRows) {
      const digits = String(row.awb || "").replace(/\D/g, "");
      let match = digits.length >= 11 && opsAwbs.includes(digits.slice(0, 11))
        ? digits.slice(0, 11)
        : "";
      if (!match && digits.length >= 8) {
        const candidates = opsAwbs.filter((awb) => awb.slice(3) === digits.slice(-8));
        if (candidates.length === 1) match = candidates[0];
      }
      if (!match || readySet.has(match)) continue;
      readySet.add(match);
      ready.push({
        awb: match,
        awb_last8: match.slice(3),
        ready: true,
        normalized_status: "RECEPTION_COMPLETED",
        tcs_status: "Hoàn thành tiếp nhận",
        flight: row.flight,
        flight_date: row.flight_date,
        esid_code: row.esid,
        raw: row.text,
        page_number: row.page_number,
      });
    }
    const items = opsAwbs.map((awb) => {
      const hit = ready.find((item) => item.awb === awb);
      return (
        hit || {
          awb,
          awb_last8: awb.slice(3),
          ready: false,
          normalized_status: "NOT_COMPLETED",
          tcs_status: "",
          error: "NOT_IN_RECEPTION_LIST",
          raw: "Không thấy trạng thái tiếp nhận xong trên TCS",
        }
      );
    });
    updateWorkspaceOverlay(
      "READY",
      `Đã quét ${allRows.length} dòng · ${ready.length} AWB sẵn sàng`,
      1,
      1
    );
    return {
      ok: true,
      source: "chrome-extension",
      session_date: sessionDate,
      ready,
      items,
      total: opsAwbs.length,
      list_total: allRows.length,
      reception_total: readyRows.length,
      cache_count: allRows.length,
      index_rows: allRows,
    };
  }

  function dispatchEnter(element) {
    for (const type of ["keydown", "keypress", "keyup"]) {
      element.dispatchEvent(
        new KeyboardEvent(type, {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
        })
      );
    }
  }

  async function waitForTableRows(timeoutMs = 8000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (readEsidRows(currentPageNumber()).length > 0) return;
      await sleep(150);
    }
  }

  async function waitForTableChange(before, timeoutMs = 5000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const first = readEsidRows(currentPageNumber())[0]?.awb || "";
      if (first && first !== before) return;
      await sleep(120);
    }
  }

  function currentPageNumber() {
    const active = document.querySelector(".ant-pagination-item-active");
    const raw = active?.getAttribute("title") || active?.textContent || "1";
    const value = Number.parseInt(String(raw).trim(), 10);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }

  function readEsidRows(pageNumber) {
    return [...document.querySelectorAll(".ant-table-tbody tr, table tbody tr")]
      .filter((row) => row.querySelectorAll("td").length >= 3)
      .map((row) => {
        const cells = [...row.querySelectorAll("td")].map((cell) =>
          String(cell.innerText || "").trim().replace(/\s+/g, " ")
        );
        const text = String(row.innerText || "").trim().replace(/\s+/g, " ");
        let status = cells.find((cell) => isReceptionComplete(cell, "")) || "";
        if (!status) {
          status =
            [...cells]
              .reverse()
              .find((cell) => cell.length >= 4 && /[A-Za-zÀ-ỹ]/.test(cell)) || "";
        }
        return {
          awb: cells[0] || "",
          flight: cells[1] || "",
          flight_date: cells[2] || "",
          esid: cells[3] || "",
          status,
          text: text.slice(0, 240),
          page_number: pageNumber,
        };
      })
      .filter((row) => row.text && !/^\d+$/.test(row.text.replace(/\s/g, "").slice(0, 20)));
  }

  function isReceptionComplete(status, text) {
    const normalized = normalizeText(`${status || ""} ${text || ""}`);
    return normalized.includes("HOAN THANH TIEP NHAN");
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
    // Không sửa class/style dropdown. Ant Design tái sử dụng node dropdown;
    // ép display:none tại đây làm các combobox sau không thể mở lại.
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

    // Đúng quy trình TCS: ngày OPS → chuyến bay → nút search icon.
    const modalDate = modal.querySelector("#flightDate");
    const modalFlight = modal.querySelector("#flightNo");
    if (modalDate && flightDateYmd) {
      const dateSelected = await selectFlightDateFromPicker(modalDate, flightDateYmd);
      if (!dateSelected) {
        warnings.push(`Không chọn được ngày bay ${flightDateYmd} bằng lịch TCS`);
        await hardResetUi();
        return { fills, warnings };
      }
    }
    if (modalFlight && flightNo) {
      setNativeValue(modalFlight, flightSearchQuery(flightNo));
      await sleep(80);
    }
    const searchButton =
      modal.querySelector("button.ant-input-search-button") ||
      modal.querySelector(".ant-input-search-button") ||
      findButtonIn(modal, "SEARCH") ||
      findButtonIn(modal, "TIM");
    if (searchButton) {
      simulateClick(searchButton);
      await sleep(150);
    } else {
      warnings.push("Không thấy nút search chuyến bay");
    }

    // Ant dựng row tạm rồi thay tbody khi remote request hoàn tất.
    for (let wait = 0; wait < 28; wait += 1) {
      const rows = modal.querySelectorAll(
        ".ant-table-tbody tr, tbody tr, .ant-table-row"
      );
      if (
        [...rows].some((row) => {
          const t = String(row.textContent || "").trim();
          return t.length >= 4 && !/ant-table-measure|ant-table-placeholder/i.test(
            String(row.className || "")
          );
        })
      ) {
        break;
      }
      await sleep(150);
    }

    const wantF = normalizeFlight(flightNo);
    const wantDate = ymdToDdMon(flightDateYmd);
    let picked = false;
    const pickCurrentPage = (root) => {
      for (const row of root.querySelectorAll(
        ".ant-table-tbody tr, tbody tr, .ant-table-row"
      )) {
        const raw = String(row.textContent || "");
        const text = normalizeText(raw);
        if (!text || text.includes("NO DATA") || text.includes("KHONG CO")) continue;
        const cells = [...row.querySelectorAll("td")].map((cell) =>
          String(cell.textContent || "").trim()
        );
        // Bảng TCS thật tách hãng bay và số chuyến thành hai cột (AK | 0523).
        // Ghép theo cột trước để tránh số ngày bay dính vào số chuyến khi normalize.
        const flightFromColumns =
          cells.length >= 3 ? normalizeFlight(`${cells[1] || ""}${cells[2] || ""}`) : "";
        const dateFromColumns =
          cells.length >= 4 ? normalizeText(cells[3]).replace(/[^A-Z0-9]/g, "") : "";
        const compactRow = normalizeFlightText(text);
        if (
          wantF &&
          flightFromColumns !== wantF &&
          !compactRow.includes(wantF)
        ) {
          continue;
        }
        if (
          wantDate &&
          dateFromColumns !== wantDate &&
          !compactRow.includes(wantDate)
        ) {
          continue;
        }
        return row;
      }
      return null;
    };

    let targetRow = pickCurrentPage(modal);
    // Modal nhớ trang của lần trước, nên quét mọi số trang trừ trang hiện tại.
    const activePage = Number(
      String(modal.querySelector(".ant-pagination-item-active")?.textContent || "0").trim()
    );
    const pageNumbers = [...modal.querySelectorAll(".ant-pagination-item")]
      .map((el) => Number(String(el.textContent || "").trim()))
      .filter((n) => Number.isFinite(n) && n !== activePage)
      .slice(0, 12);
    for (const page of pageNumbers) {
      if (targetRow) break;
      const currentModal = visibleFlightModal() || modal;
      const pageItem = [...currentModal.querySelectorAll(".ant-pagination-item")].find(
        (el) => Number(String(el.textContent || "").trim()) === page
      );
      if (!pageItem) break;
      simulateClick(pageItem.querySelector("button, a") || pageItem);
      for (let wait = 0; wait < 10; wait += 1) {
        await sleep(50);
        const active = modal.querySelector(".ant-pagination-item-active");
        if (Number(String(active?.textContent || "").trim()) === page) break;
      }
      modal = visibleFlightModal() || currentModal;
      targetRow = pickCurrentPage(modal);
    }
    if (targetRow) {
      picked = await selectFlightResultRow(targetRow);
    }

    if (picked) {
      const ok =
        findButtonIn(modal, "OK") ||
        findButtonIn(modal, "CHON") ||
        footerButton(modal, ["ok", "chon"]);
      if (ok) simulateClick(ok);

      // TCS mở modal xác nhận thứ hai: “Bạn có đồng ý chọn chuyến bay này?”.
      // Máy/đường truyền chậm có thể cần hơn 4 giây; chờ đủ 20 giây và tìm nút
      // trên toàn bộ modal visible để không bị nhầm footer Ok của modal danh sách.
      const confirmation = await acceptFlightConfirmation(20_000);
      fills.flight_confirmation_agreed = confirmation.accepted;
      if (!confirmation.accepted) {
        warnings.push(confirmation.message);
      }
    } else {
      warnings.push("Không chọn được chuyến — đóng modal, chọn tay nếu cần");
      const cancel =
        footerButton(modal, ["cancel", "huy", "dong", "close"]) ||
        modal.querySelector(".ant-modal-close") ||
        footerButton(modal, null, { preferNonPrimary: true });
      if (cancel) cancel.click();
      await sleep(200);
    }

    // Chỉ dọn cửa sổ danh sách thật; tuyệt đối không đóng nhầm popup Đồng ý.
    if (visibleFlightModal() && fills.flight_confirmation_agreed) await hardResetUi();

    const flightValue = getVal(LOCATORS.fields.flight_no);
    const dateValue = getVal(LOCATORS.fields.flight_date);
    const savedFlightMatches =
      !wantF || normalizeFlight(flightValue) === wantF;
    const savedDateMatches =
      !flightDateYmd || dateValueMatchesYmd(dateValue, flightDateYmd);
    fills.choose_flight = Boolean(
      picked &&
        fills.flight_confirmation_agreed &&
        flightValue &&
        dateValue &&
        savedFlightMatches &&
        savedDateMatches
    );
    fills.flightNo = Boolean(getVal(LOCATORS.fields.flight_no));
    fills.datFltOri = Boolean(getVal(LOCATORS.fields.flight_date));
    if (!fills.choose_flight) {
      warnings.push(
        `TCS chưa lưu đúng chuyến bay hiện tại (cần ${flightNo || "—"} / ${
          flightDateYmd || "—"
        }, đang có ${flightValue || "trống"} / ${dateValue || "trống"})`
      );
    }
    return { fills, warnings };
  }

  async function acceptFlightConfirmation(timeoutMs) {
    const started = Date.now();
    let sawConfirmation = false;
    let clickAttempts = 0;
    let lastClickAt = 0;

    while (Date.now() - started < timeoutMs) {
      const nativeAccepted =
        document.documentElement.dataset.tecsopsFlightConfirmStatus === "accepted";
      if (nativeAccepted) {
        return { accepted: true, message: "" };
      }

      const confirmModal = visibleConfirmationModal();
      const agree = findFlightAgreementButton();
      if (confirmModal || agree) sawConfirmation = true;

      if (agree && clickAttempts < 3 && Date.now() - lastClickAt >= 700) {
        simulateClick(agree);
        clickAttempts += 1;
        lastClickAt = Date.now();
      }

      if (
        clickAttempts > 0 &&
        !findFlightAgreementButton() &&
        !visibleConfirmationModal()
      ) {
        return { accepted: true, message: "" };
      }
      await sleep(120);
    }

    if (clickAttempts > 0) {
      return {
        accepted: false,
        message: "Đã bấm Đồng ý nhưng hộp xác nhận chuyến bay chưa đóng sau 20 giây",
      };
    }
    return {
      accepted: false,
      message: sawConfirmation
        ? "Đã thấy hộp xác nhận nhưng không tìm được đúng nút Đồng ý"
        : "TCS chưa hiện hộp hỏi Đồng ý chọn chuyến bay sau 20 giây",
    };
  }

  function findFlightAgreementButton() {
    const buttons = [...document.querySelectorAll("button")]
      .filter(isVisible)
      .reverse();
    for (const button of buttons) {
      const label = normalizeText(button.textContent || "");
      if (label !== "DONG Y" && !label.includes("DONG Y")) continue;
      const modal =
        button.closest(".ant-modal") ||
        button.closest("[role='dialog']") ||
        button.closest(".ant-modal-wrap");
      const context = normalizeText(modal?.textContent || "");
      if (
        context.includes("CHON CHUYEN BAY") ||
        context.includes("BAN CO DONG Y") ||
        (context.includes("CHUYEN BAY") && context.includes("THONG BAO"))
      ) {
        return button;
      }
    }
    return null;
  }

  async function selectFlightResultRow(row) {
    if (!row) return false;
    const radio = row.querySelector("input[type='radio']");
    const radioWrapper =
      radio?.closest("label.ant-radio-wrapper") ||
      radio?.closest("label") ||
      row.querySelector("label.ant-radio-wrapper, .ant-radio-wrapper");
    const clickTargets = [...new Set([radioWrapper, radio, row].filter(Boolean))];

    for (const target of clickTargets) {
      simulateClick(target);
      for (let wait = 0; wait < 8; wait += 1) {
        await sleep(80);
        const selected =
          Boolean(radio?.checked) ||
          Boolean(radioWrapper?.classList?.contains("ant-radio-wrapper-checked")) ||
          row.getAttribute("aria-selected") === "true" ||
          row.classList.contains("ant-table-row-selected");
        // Một số bản TCS mở popup xác nhận ngay và tháo radio khỏi DOM.
        if (selected || visibleConfirmationModal()) return true;
      }
    }
    return false;
  }

  function visibleFlightModal() {
    for (const el of document.querySelectorAll(
      ".ant-modal-wrap:not(.ant-modal-wrap-hidden) .ant-modal, [role='dialog']"
    )) {
      if (!isVisible(el)) continue;
      const t = normalizeText(el.textContent || "");
      if (
        t.includes("BAN CO DONG Y") ||
        t.includes("DONG Y CHON CHUYEN BAY") ||
        t.includes("XAC NHAN CHON CHUYEN BAY")
      ) {
        continue;
      }
      const hasSearchForm = Boolean(
        el.querySelector("#flightNo") &&
          (el.querySelector(".ant-input-search-button") || el.querySelector("table"))
      );
      if (
        hasSearchForm &&
        (t.includes("CHUYEN BAY") || t.includes("FLIGHT") || t.includes("DANH SACH"))
      ) {
        return el;
      }
    }
    return null;
  }

  function visibleConfirmationModal() {
    const matches = [];
    for (const el of document.querySelectorAll(
      ".ant-modal-wrap:not(.ant-modal-wrap-hidden) .ant-modal, [role='dialog']"
    )) {
      if (!isVisible(el)) continue;
      const text = normalizeText(el.textContent || "");
      const title = normalizeText(
        el.querySelector(".ant-modal-title")?.textContent || ""
      );
      const body = normalizeText(
        el.querySelector(".ant-modal-body")?.textContent || ""
      );
      const hasAgreeButton = [...el.querySelectorAll("button")].some(
        (button) => normalizeText(button.textContent || "") === "DONG Y"
      );
      if (
        (title === "THONG BAO" && body.includes("CHON CHUYEN BAY") && hasAgreeButton) ||
        text.includes("DONG Y CHON CHUYEN BAY") ||
        text.includes("BAN CO DONG Y") ||
        text.includes("XAC NHAN")
      ) {
        matches.push(el);
      }
    }
    return matches.at(-1) || null;
  }

  function clearMasterField(id) {
    if (!id) return false;
    const el = document.getElementById(id);
    if (!el) return false;
    const wrap = el.closest(".ant-select") || el;
    const clear =
      wrap.querySelector(".ant-select-clear") ||
      wrap.querySelector("[aria-label='close'], [aria-label='clear']");
    if (clear && isVisible(clear)) {
      simulateClick(clear);
    }
    if (el.matches("input, textarea")) {
      setNativeValue(el, "");
    }
    return getControlValue(id) === "";
  }

  async function fillMasterField(id, value, opts = {}) {
    const text = String(value || "").trim();
    if (!id || !text) return false;
    const el = document.getElementById(id);
    if (!el) return false;
    const maxQueries = opts.maxQueries || 3;
    const deadline = Date.now() + Math.max(1_000, Number(opts.budgetMs || 4_000));

    const wrap = el.closest(".ant-select") || el;
    wrap.click();
    await sleep(100);

    const search =
      wrap.querySelector("input.ant-select-selection-search-input") ||
      document.querySelector(`#${CSS.escape(id)}.ant-select-selection-search-input`) ||
      (el.matches("input") ? el : null);

    const queries = comboboxSearchQueries(text).slice(0, maxQueries);
    for (const query of queries) {
      if (Date.now() >= deadline) break;
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
      await sleep(Math.min(480, Math.max(120, deadline - Date.now())));

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
    try {
      el.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
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
    const stop = new Set([
      "CONG", "TY", "CO", "PHAN", "VA", "DICH", "VU", "CHI", "NHANH",
      "SO", "CTY", "CTCP", "TNHH", "LTD", "COMPANY",
    ]);
    const distinctive = words.filter((word) => word.length >= 3 && !stop.has(word));
    const queries = [];
    if (distinctive.length) {
      queries.push(distinctive.at(-1));
      queries.push([...distinctive].sort((a, b) => b.length - a.length)[0]);
    }
    if (distinctive.length >= 2) queries.push(distinctive.slice(-2).join(" "));
    queries.push(raw.length <= 36 ? raw : raw.slice(0, 36));
    const seen = new Set();
    const out = [];
    for (const q of queries) {
      const k = normalizeText(q);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(q.trim());
    }
    return out.slice(0, 4);
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

  async function selectPaymentMode(label) {
    const id = LOCATORS.fields.payment_mode || "codPayMod";
    const current = normalizeText(getControlValue(id));
    if (current.includes("CHUYEN KHOAN") || current.includes("BANK TRANSFER")) {
      return true;
    }
    const el = document.getElementById(id);
    if (!el) return false;
    const wrap = el.closest(".ant-select") || el;
    wrap.click();
    await sleep(160);
    const options = collectMasterOptions();
    const match = options.find((option) => {
      const text = normalizeText(option.label);
      return text.includes("CHUYEN KHOAN") || text.includes("BANK TRANSFER");
    });
    if (match) {
      simulateClick(
        match.el.querySelector(".ant-select-item-option-content") ||
          match.titleEl ||
          match.el
      );
      await sleep(160);
      const selected = normalizeText(getControlValue(id));
      if (selected.includes("CHUYEN KHOAN") || selected.includes("BANK TRANSFER")) {
        return true;
      }
    }
    return fillMasterField(id, label || "Chuyển khoản", {
      maxQueries: 2,
      budgetMs: 2_800,
    });
  }

  function setCheckboxById(id, checked) {
    const el = document.getElementById(id);
    if (!el || String(el.type || "").toLowerCase() !== "checkbox") return false;
    if (Boolean(el.checked) === Boolean(checked)) return true;
    const label =
      document.querySelector(`label[for="${CSS.escape(id)}"]`) ||
      el.closest("label") ||
      el.parentElement;
    simulateClick(label || el);
    return Boolean(el.checked) === Boolean(checked);
  }

  function isCheckboxChecked(id) {
    const el = document.getElementById(id);
    return Boolean(el && el.checked);
  }

  function getControlValue(id) {
    const el = document.getElementById(id);
    if (!el) return "";
    const wrap = el.closest(".ant-select");
    const selected = wrap?.querySelector(".ant-select-selection-item");
    return String(
      selected?.getAttribute("title") ||
        selected?.textContent ||
        el.value ||
        ""
    ).trim();
  }

  function setById(id, value) {
    const el = document.getElementById(id);
    if (!el) return false;
    return setNativeValue(el, value == null ? "" : String(value));
  }

  function setNativeValue(el, value) {
    if (!el) return false;
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.remove("tecsops-done-field");
      el.classList.add("tecsops-active-field");
    } catch {
      /* visual aid only */
    }
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
    window.setTimeout(() => {
      try {
        el.classList.remove("tecsops-active-field");
        el.classList.add("tecsops-done-field");
      } catch {
        /* visual aid only */
      }
    }, 260);
    return true;
  }

  function getVal(id) {
    const nodes = [...document.querySelectorAll(`#${CSS.escape(id)}`)];
    const el =
      nodes.find((node) => !node.closest(".ant-modal, [role='dialog']")) ||
      nodes[0];
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

  function ymdToDdMon(ymd) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
    if (!match) return "";
    const months = [
      "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
      "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
    ];
    const month = months[Number(match[2]) - 1];
    return month ? `${match[3]}${month}${match[1]}` : "";
  }

  function ymdToMdy(ymd) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
    return match ? `${match[2]}-${match[3]}-${match[1]}` : String(ymd || "");
  }

  function dateValueMatchesYmd(value, ymd) {
    const target = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
    if (!target) return false;
    const normalized = normalizeText(value).replace(/\s+/g, "");
    const year = target[1];
    const month = target[2];
    const day = target[3];
    const ddMon = ymdToDdMon(ymd);
    return [
      `${day}/${month}/${year}`,
      `${day}-${month}-${year}`,
      `${month}-${day}-${year}`,
      `${year}-${month}-${day}`,
      ddMon,
    ].some((candidate) => normalized.includes(normalizeText(candidate).replace(/\s+/g, "")));
  }

  async function selectFlightDateFromPicker(input, ymd) {
    const target = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
    if (!input || !target) return false;
    const current = /^(\d{2})-(\d{2})-(\d{4})$/.exec(
      String(input.value || "").trim()
    );
    const currentYear = current ? Number(current[3]) : Number(target[1]);
    const currentMonth = current ? Number(current[1]) : Number(target[2]);
    const targetYear = Number(target[1]);
    const targetMonth = Number(target[2]);
    const monthDelta =
      (targetYear - currentYear) * 12 + targetMonth - currentMonth;
    if (Math.abs(monthDelta) > 24) return false;

    simulateClick(input);
    await sleep(140);
    let popup = [
      ...document.querySelectorAll(
        ".ant-picker-dropdown:not(.ant-picker-dropdown-hidden)"
      ),
    ].filter(isVisible).at(-1);
    if (!popup) return false;

    const navSelector =
      monthDelta > 0
        ? ".ant-picker-header-next-btn"
        : ".ant-picker-header-prev-btn";
    for (let i = 0; i < Math.abs(monthDelta); i += 1) {
      const nav = popup.querySelector(navSelector);
      if (!nav) return false;
      simulateClick(nav);
      await sleep(80);
      popup = [
        ...document.querySelectorAll(
          ".ant-picker-dropdown:not(.ant-picker-dropdown-hidden)"
        ),
      ].filter(isVisible).at(-1) || popup;
    }

    const cell = popup.querySelector(
      `td[title="${ymd}"]:not(.ant-picker-cell-disabled)`
    );
    if (!cell) return false;
    simulateClick(cell);
    await sleep(140);
    return String(input.value || "").trim() === ymdToMdy(ymd);
  }

  function normalizeText(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/gi, "d")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  function normalizeFlight(s) {
    const compact = normalizeText(s).replace(/[^A-Z0-9]/g, "");
    const match = /^([A-Z]{2,3})0*(\d+)$/.exec(compact);
    return match ? `${match[1]}${Number(match[2])}` : compact;
  }

  function flightSearchQuery(s) {
    const compact = normalizeText(s).replace(/[^A-Z0-9]/g, "");
    const match = /^([A-Z]{2,3})0*(\d+)$/.exec(compact);
    return match ? `${match[1]}${match[2].padStart(4, "0")}` : compact;
  }

  function normalizeFlightText(s) {
    return normalizeText(s)
      .replace(/[^A-Z0-9]/g, "")
      .replace(/([A-Z]{2,3})0+(\d{2,4})/g, "$1$2");
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  console.info(`[tecsops-ext] content-tcs ready v${SCRIPT_VERSION}`);
})();
