/**
 * Content script TCS — điền KHAI BÁO ESID (không HOÀN TẤT).
 * Idempotent: inject nhiều lần chỉ cập nhật runner, không thêm listener.
 */
(() => {
  const SCRIPT_VERSION = "2.0.29";

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

  /** @type {{ version: string, busy: boolean, runFill: Function, runDownloadPdf: Function }} */
  const api = (window.__TECSOPS_TCS_DIRECT__ = window.__TECSOPS_TCS_DIRECT__ || {
    version: SCRIPT_VERSION,
    busy: false,
    runFill: null,
    runDownloadPdf: null,
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
            source: "chrome-extension-tcs-direct",
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
      // Không dùng ô Notify (#notifyId) — luôn để trống.
      const partyMap = [
        [LOCATORS.fields.shipper_name, ship.shipper_name, "shipperId"],
        [LOCATORS.fields.agent_name, ship.agent_name, "agentId"],
        [LOCATORS.fields.consignee_name, ship.consignee_name, "consigneeId"],
      ];
      fills.notifyId = clearMasterField(LOCATORS.fields.notify_name || "notifyId");
      for (const [id, value, key] of partyMap) {
        if (value == null || String(value).trim() === "") {
          fills[key] = clearMasterField(id);
          continue;
        }
        updateWorkspaceOverlay("FILLING", `Đang chọn ${key} từ danh mục TCS`, 2, 7);
        await hardResetUi();
        const fillOpts = {
          maxQueries: 4,
          budgetMs: 6_000,
          minScore: 55,
          extraQueries: [],
          hints: [],
        };
        if (key === "agentId") {
          const vat = String(ship.agent_vat || "").trim();
          const tel = String(ship.agent_tel || "").trim();
          if (vat) {
            fillOpts.extraQueries.push(vat);
            fillOpts.hints.push(vat);
          }
          if (tel) {
            const digits = tel.replace(/\D/g, "");
            if (digits.length >= 8) {
              fillOpts.extraQueries.push(digits);
              fillOpts.hints.push(digits);
            }
            fillOpts.extraQueries.push(tel);
            fillOpts.hints.push(tel);
          }
          fillOpts.minScore = 72;
          fillOpts.maxQueries = 6;
          fillOpts.budgetMs = 9_000;
        } else if (key === "shipperId") {
          const vat = String(ship.shipper_vat || "").trim();
          if (vat) {
            fillOpts.extraQueries.push(vat);
            fillOpts.hints.push(vat);
          }
          fillOpts.minScore = 60;
        }
        fills[key] = await fillMasterField(id, String(value), fillOpts);
        if (!fills[key]) {
          warnings.push(
            `#${id} chưa chọn được master (minScore=${fillOpts.minScore}) — để trống, không ghi đè text`
          );
        }
        await hardResetUi();
      }

      // 3) Mặc định nghiệp vụ (TCS: Cash; TECS-TCS: Bank + Kho TECS).
      // Tick Khác + Đồng ý làm lại ở cuối để tránh bị hardResetUi/điền text làm mất.
      const isTcsWh =
        String(payload.warehouse || "").toUpperCase() === "TCS" ||
        ship.shc_other === true ||
        ship.agree_on_fill === true ||
        /ti[eề]n\s*m[aặ]t|cash/i.test(String(ship.payment_mode || ""));
      updateWorkspaceOverlay(
        "FILLING",
        isTcsWh
          ? "Đang chọn Tiền mặt (kho TCS)"
          : "Đang chọn Chuyển khoản và Kho hàng TECS",
        3,
        7
      );
      fills.codPayMod = await selectPaymentMode(
        String(
          ship.payment_mode ||
            (isTcsWh ? "Tiền mặt/Cash" : "Chuyển khoản/Bank transfer")
        )
      );
      if (!fills.codPayMod) {
        warnings.push(
          isTcsWh
            ? "Chưa chọn được Tiền mặt/Cash"
            : "Chưa chọn được Chuyển khoản"
        );
      }
      if (ship.tecs_warehouse === true) {
        fills.shcCod002 = setAntCheckboxById(
          LOCATORS.fields.tecs_warehouse || "shcCod002",
          true
        );
        if (!fills.shcCod002) warnings.push("Chưa chọn được Kho hàng TECS");
      }
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
          maxQueries: 3,
          budgetMs: 4_000,
          minScore: 40,
        });
        if (!fills.codFds) fills.codFds = setById(LOCATORS.fields.dest_code, String(ship.dest));
      } else {
        fills.codFds = clearMasterField(LOCATORS.fields.dest_code);
      }
      {
        // Không nhập liệu ô Other Request — xóa nếu còn giá trị cũ.
        const otherIds = [
          LOCATORS.fields.other_request,
          "otherRequest",
          "shcOthReq",
        ].filter((id, i, arr) => id && arr.indexOf(id) === i);
        let cleared = false;
        for (const id of otherIds) {
          if (setById(id, "")) {
            cleared = true;
            break;
          }
        }
        fills.otherRequest = false;
        fills.otherRequest_cleared = cleared;
      }

      fills.shpRegNam = setById(LOCATORS.fields.registrant_name, reg.name || "");
      fills.shpRegTel = setById(LOCATORS.fields.registrant_tel, reg.tel || "");
      fills.shpRegIdx = setById(LOCATORS.fields.registrant_id, reg.cccd || "");

      // Cuối: tick Khác + Đồng ý (kho TCS) — sau mọi hardResetUi.
      if (isTcsWh) {
        fills.shcOther = setShcOtherCheckbox(true);
        if (!fills.shcOther) {
          const hints = listCheckboxDebug()
            .slice(0, 10)
            .map((x) => `#${x.id || "?"}«${x.label || ""}»`)
            .join(", ");
          warnings.push(
            "Chưa tick được checkbox Khác/Other" +
              (hints ? ` · thấy: ${hints}` : "")
          );
        }
        fills.agreeConfirm = setAgreeConfirmCheckbox(true);
        if (!fills.agreeConfirm) {
          const hints = listCheckboxDebug()
            .filter((x) => /đồng ý|agree|khác|other/i.test(x.label || ""))
            .slice(0, 8)
            .map((x) => `#${x.id || "?"}«${x.label || ""}»`)
            .join(", ");
          warnings.push(
            "Chưa tick được «Tôi đồng ý» (#agreeConfirm)" +
              (hints ? ` · thấy: ${hints}` : "")
          );
        }
      }

      await hardResetUi();
      // Tick lại sau Escape (hardReset đôi khi bỏ check visual)
      if (isTcsWh) {
        if (!fills.shcOther) fills.shcOther = setShcOtherCheckbox(true);
        else setShcOtherCheckbox(true);
        if (!fills.agreeConfirm) fills.agreeConfirm = setAgreeConfirmCheckbox(true);
        else setAgreeConfirmCheckbox(true);
      }
      updateWorkspaceOverlay("READY", "Đã điền xong — kiểm tra rồi HOÀN TẤT", 7, 7);

      return {
        ok: true,
        source: "chrome-extension-tcs-direct",
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

  /**
   * Tải PDF ESID: danh sách → AWB# → mở dòng → IN → lấy HTML phiếu (canvas→img).
   * Background sẽ printToPDF + chrome.downloads.
   */
  async function runDownloadPdf(payload) {
    if (api.busy) {
      return { ok: false, error: "BUSY", message: "Ext đang bận — thử lại sau." };
    }
    api.busy = true;
    try {
      await ensureLocators();
      const awb = String(payload?.awb || payload?.AWB || "").replace(/\D/g, "").slice(0, 11);
      if (awb.length !== 11) {
        return { ok: false, error: "VALIDATION", message: "AWB phải đủ 11 số" };
      }
      if (needsLogin()) {
        return {
          ok: false,
          error: "NEED_LOGIN",
          message: "Chưa đăng nhập Ext kho TCS — bấm Đăng nhập trước khi tải PDF.",
        };
      }
      showWorkspaceOverlay("DOWNLOADING", `Tìm ESID …${awb.slice(-8)}`, 0, 5);
      const prepared = await prepareEsidDetailForPdf(awb);
      if (!prepared.ok) {
        updateWorkspaceOverlay("ERROR", prepared.message || "Không mở được phiếu", 0, 1);
        return prepared;
      }
      updateWorkspaceOverlay("DOWNLOADING", "Bấm IN lấy phiếu…", 3, 5);
      installPrintStub();
      if (!clickInButton()) {
        return { ok: false, error: "NO_PRINT", message: "Không thấy / không bấm được nút IN" };
      }
      updateWorkspaceOverlay("DOWNLOADING", "Đọc HTML phiếu…", 4, 5);
      const bill = await waitForBillHtml(9000);
      if (!bill?.html) {
        return {
          ok: false,
          error: "NO_BILL",
          message: "Sau IN không thấy phiếu ESID trong iframe/popup.",
        };
      }
      const pdfName = `${awb.slice(0, 3)}-${awb.slice(3)}_ESID.pdf`;
      updateWorkspaceOverlay("READY", `Đã lấy phiếu …${awb.slice(-8)}`, 1, 1);
      return {
        ok: true,
        awb,
        pdf_name: pdfName,
        html: bill.html,
        bill_chars: bill.html.length,
        source: "chrome-extension-tcs-direct",
        scriptVersion: SCRIPT_VERSION,
        message: `Đã lấy phiếu ESID …${awb.slice(-8)} — đang lưu PDF…`,
      };
    } finally {
      api.busy = false;
    }
  }
  api.runDownloadPdf = runDownloadPdf;

  if (!window.__TECSOPS_TCS_LISTENER__) {
    window.__TECSOPS_TCS_LISTENER__ = true;
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      const reply = (payload) => {
        try {
          sendResponse(payload);
        } catch {
          /* port closed */
        }
      };
      if (!msg || typeof msg !== "object") {
        reply({ ok: false, error: "INVALID_MESSAGE" });
        return true;
      }

      if (msg.type === "TCS_PING") {
        reply({
          ok: true,
          scriptVersion: window.__TECSOPS_TCS_DIRECT__?.version || SCRIPT_VERSION,
          busy: Boolean(window.__TECSOPS_TCS_DIRECT__?.busy),
          loggedIn: !needsLogin(),
        });
        return true;
      }

      if (msg.type === "TCS_SESSION_IDENTITY") {
        reply(readSessionIdentity());
        return true;
      }

      if (msg.type === "TCS_LOGOUT") {
        void (async () => {
          try {
            if (needsLogin()) {
              reply({ ok: true, alreadyLoggedOut: true });
              return;
            }
            const nodes = Array.from(
              document.querySelectorAll("a, button, span, li, div")
            );
            const logoutEl = nodes.find((el) => {
              const t = String(el.textContent || "")
                .replace(/\s+/g, " ")
                .trim();
              return /^(đăng xuất|dang xuat|logout)$/i.test(t) ||
                (/đăng xuất|dang xuat|logout/i.test(t) && t.length < 24);
            });
            if (logoutEl) {
              logoutEl.click();
              await new Promise((r) => setTimeout(r, 1200));
            }
            if (!needsLogin()) {
              window.location.href = "https://www.tcs.com.vn/AwbLogin";
              await new Promise((r) => setTimeout(r, 800));
            }
            reply({ ok: true, loggedIn: !needsLogin() });
          } catch (err) {
            reply({
              ok: false,
              error: "LOGOUT_FAILED",
              message: err instanceof Error ? err.message : String(err),
            });
          }
        })();
        return true;
      }

      if (msg.type === "TCS_GET_CAPTCHA") {
        void getCaptchaData().then(reply).catch((err) =>
          reply({
            ok: false,
            error: "CAPTCHA_READ_FAILED",
            message: err instanceof Error ? err.message : String(err),
          })
        );
        return true;
      }

      if (msg.type === "TCS_LOGIN_STATUS") {
        void getLoginStatus().then(reply).catch((err) =>
          reply({
            ok: false,
            error: "LOGIN_STATUS_FAILED",
            message: err instanceof Error ? err.message : String(err),
          })
        );
        return true;
      }

      if (msg.type === "TCS_REFRESH_CAPTCHA") {
        const refreshed = refreshCaptcha();
        reply({ ok: refreshed });
        return true;
      }

      if (msg.type === "TCS_LOGIN") {
        reply(fillAndSubmitLogin(msg.payload || {}));
        return true;
      }

      if (msg.type === "TCS_SCAN_DATE") {
        void scanByDate(msg.payload || {})
          .then(reply)
          .catch((err) => {
            updateWorkspaceOverlay("ERROR", err instanceof Error ? err.message : String(err), 0, 1);
            reply({
              ok: false,
              error: "SCAN_FAILED",
              message: err instanceof Error ? err.message : String(err),
            });
          });
        return true;
      }

      if (msg.type === "FILL_ESID") {
        const fn = window.__TECSOPS_TCS_DIRECT__?.runFill;
        if (typeof fn !== "function") {
          reply({
            ok: false,
            error: "NO_RUNNER",
            message: "Content script chưa sẵn sàng — Reload extension + F5 tab TCS.",
            warnings: [],
          });
          return true;
        }
        void fn(msg.payload)
          .then(reply)
          .catch((err) => {
            reply({
              ok: false,
              error: "FILL_FAILED",
              message: err instanceof Error ? err.message : String(err),
              warnings: [],
              scriptVersion: SCRIPT_VERSION,
            });
          });
        return true;
      }

      if (msg.type === "DOWNLOAD_ESID_PDF") {
        const fn = window.__TECSOPS_TCS_DIRECT__?.runDownloadPdf;
        if (typeof fn !== "function") {
          reply({
            ok: false,
            error: "NO_RUNNER",
            message: "Content script chưa sẵn sàng — Reload extension + F5 tab TCS.",
          });
          return true;
        }
        void fn(msg.payload || {})
          .then(reply)
          .catch((err) => {
            reply({
              ok: false,
              error: "DOWNLOAD_FAILED",
              message: err instanceof Error ? err.message : String(err),
              scriptVersion: SCRIPT_VERSION,
            });
          });
        return true;
      }

      reply({
        ok: false,
        error: "UNKNOWN_TYPE",
        message: `Lệnh không hỗ trợ: ${String(msg.type || "")}`,
      });
      return true;
    });
  }

  function ensureWorkspaceOverlay() {
    let root = document.getElementById("tecsops-tcs-direct-workspace");
    if (root) return root;
    root = document.createElement("aside");
    root.id = "tecsops-tcs-direct-workspace";
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
    style.id = "tecsops-tcs-direct-workspace-style";
    style.textContent = `
      #tecsops-tcs-direct-workspace {
        position: fixed; z-index: 2147483647; top: 72px; right: 18px; width: 290px;
        padding: 12px; border: 1px solid rgba(14,165,233,.45); border-radius: 14px;
        background: rgba(15,23,42,.95); color: #f8fafc; box-shadow: 0 18px 45px rgba(15,23,42,.32);
        font: 12px/1.45 system-ui, sans-serif; backdrop-filter: blur(10px);
      }
      #tecsops-tcs-direct-workspace .tecsops-head { display:flex; align-items:center; justify-content:space-between; }
      #tecsops-tcs-direct-workspace .tecsops-head strong { color:#7dd3fc; letter-spacing:.04em; }
      #tecsops-tcs-direct-workspace button { border:0; background:transparent; color:#cbd5e1; font-size:18px; cursor:pointer; }
      #tecsops-tcs-direct-workspace .tecsops-phase { margin-top:8px; color:#34d399; font-weight:800; }
      #tecsops-tcs-direct-workspace .tecsops-message { margin-top:3px; min-height:34px; }
      #tecsops-tcs-direct-workspace .tecsops-track { height:6px; margin-top:8px; overflow:hidden; border-radius:999px; background:#334155; }
      #tecsops-tcs-direct-workspace .tecsops-track span { display:block; width:0; height:100%; background:#38bdf8; transition:width .2s ease; }
      #tecsops-tcs-direct-workspace .tecsops-count { margin-top:5px; color:#94a3b8; font-size:10px; }
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
    window.setTimeout(() => simulateClick(submit), 40);
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
    const applied = await applyFlightDateFilter(sessionDate, dmy);
    if (!applied.ok) {
      if (applied.error === "DATE_FILTER_NOT_FOUND") {
        return {
          ok: false,
          error: "DATE_FILTER_NOT_FOUND",
          message: "Không thấy bộ lọc ngày trên danh sách ESID",
        };
      }
      return {
        ok: false,
        error: "DATE_FILTER_MISMATCH",
        message: `Bộ lọc ngày chưa khớp ${dmy} (start=${applied.start || "—"}, end=${applied.end || "—"}) — chỉ quét đúng 1 ngày phiên Ops`,
      };
    }

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
    // Đã lọc ngày trên portal — lấy toàn bộ dòng kết quả (không cắt theo flight_date).
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
        `Ngày ${sessionDate} · ${allRows.length} dòng · trang ${pageNumber}`,
        pageIndex + 1,
        Math.max(pageIndex + 2, 2)
      );
      const next = document.querySelector(
        ".ant-pagination-next:not(.ant-pagination-disabled)"
      );
      if (!next || !isVisible(next) || rows.length === 0) break;
      const before = rows[0]?.awb || "";
      simulateClick(next);
      await waitForTableChange(before);
    }

    const opsAwbs = (Array.isArray(payload.awbs) ? payload.awbs : [])
      .map((awb) => String(awb || "").replace(/\D/g, "").slice(0, 11))
      .filter((awb) => awb.length === 11);
    const opsSet = new Set(opsAwbs);
    const readyRows = allRows.filter((row) => isReceptionComplete(row.status, row.text));
    const ready = [];
    const readySet = new Set();

    function awbDigitsFromRow(row) {
      const fromCell = String(row?.awb || "").replace(/\D/g, "");
      if (fromCell.length >= 11) return fromCell.slice(0, 11);
      const fromText = String(row?.text || "").replace(/\D/g, "");
      const m = fromText.match(/(\d{11})/);
      if (m) return m[1];
      if (fromCell.length >= 8) return fromCell.slice(-8);
      return fromCell;
    }

    function matchOpsAwb(digits) {
      if (!digits) return "";
      if (digits.length === 11) {
        if (!opsSet.size || opsSet.has(digits)) return digits;
      }
      if (digits.length >= 8 && opsSet.size) {
        const last8 = digits.slice(-8);
        const candidates = opsAwbs.filter((awb) => awb.slice(3) === last8);
        if (candidates.length === 1) return candidates[0];
        if (candidates.length === 0 && digits.length === 11) return "";
      }
      // Không có danh sách Ops — trả AWB 11 số từ TCS để Ops đối soát theo kho.
      if (!opsSet.size && digits.length === 11) return digits;
      return "";
    }

    for (const row of readyRows) {
      const digits = awbDigitsFromRow(row);
      const match = matchOpsAwb(digits.length >= 8 ? digits : awbDigitsFromRow(row));
      if (!match || match.length !== 11 || readySet.has(match)) continue;
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
      `Ngày ${sessionDate} · ${allRows.length} dòng · ${readyRows.length} HT · khớp Ops ${ready.length}`,
      1,
      1
    );
    return {
      ok: true,
      source: "chrome-extension-tcs-direct",
      session_date: sessionDate,
      ready,
      items,
      total: opsAwbs.length || ready.length,
      list_total: allRows.length,
      reception_total: readyRows.length,
      cache_count: allRows.length,
      index_rows: allRows,
    };
  }

  function findDateFilterInputs() {
    const start = document.querySelector("#search-form_dateSearch");
    const end =
      document.querySelector("input[placeholder='Ngày kết thúc']") ||
      [...document.querySelectorAll("input")].find((item) =>
        normalizeText(item.getAttribute("placeholder") || "").includes("NGAY KET THUC")
      ) ||
      // RangePicker: ô thứ 2 trong cùng .ant-picker
      start?.closest(".ant-picker")?.querySelectorAll("input")?.[1] ||
      null;
    return { start, end };
  }

  function dateValueMatches(got, dmy) {
    const raw = String(got || "").trim();
    if (!raw) return false;
    const norm = raw.replace(/\//g, "-");
    const want = String(dmy || "").replace(/\//g, "-");
    return norm.includes(want);
  }

  /**
   * Gán input Ant/React — cần reset _valueTracker (giống Playwright).
   * RangePicker hay tự điền end = cuối tháng khi chỉ set start + Enter.
   */
  function setReactInput(el, value) {
    if (!el) return false;
    try {
      el.focus();
      el.click();
    } catch {
      /* ignore */
    }
    const v = String(value ?? "");
    const last = el.value;
    const proto = window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, v);
    else el.value = v;
    const tracker = el._valueTracker;
    if (tracker && typeof tracker.setValue === "function") {
      try {
        tracker.setValue(last);
      } catch {
        /* ignore */
      }
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: v }));
    return dateValueMatches(el.value, v) || String(el.value || "") === v;
  }

  /**
   * Chọn đúng 1 ngày trên Ant RangePicker: click ô ngày 2 lần (from = to).
   * Tránh gõ text — RangePicker hay tự rộng thành 01 → cuối tháng.
   */
  async function pickSingleDayRangeOnCalendar(ymd) {
    const target = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
    const { start } = findDateFilterInputs();
    if (!start || !target) return false;

    simulateClick(start);
    await sleep(160);
    let popup = [
      ...document.querySelectorAll(
        ".ant-picker-dropdown:not(.ant-picker-dropdown-hidden)"
      ),
    ]
      .filter(isVisible)
      .at(-1);
    if (!popup) return false;

    const targetYear = Number(target[1]);
    const targetMonth = Number(target[2]);
    // Header thường hiện "Jul 2026" / "Tháng 7 2026"
    const headerText = normalizeText(
      popup.querySelector(".ant-picker-header-view")?.textContent ||
        popup.querySelector(".ant-picker-month-btn")?.textContent ||
        ""
    );
    const monthNames = [
      "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
      "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
    ];
    let shownMonth = targetMonth;
    let shownYear = targetYear;
    for (let i = 0; i < 12; i += 1) {
      if (headerText.includes(monthNames[i]) || headerText.includes(String(i + 1))) {
        // Prefer English abbr match
        if (headerText.includes(monthNames[i])) shownMonth = i + 1;
      }
    }
    const yearHit = headerText.match(/(20\d{2})/);
    if (yearHit) shownYear = Number(yearHit[1]);
    const monthDelta = (targetYear - shownYear) * 12 + targetMonth - shownMonth;
    if (Math.abs(monthDelta) <= 24) {
      const navSelector =
        monthDelta > 0
          ? ".ant-picker-header-next-btn"
          : ".ant-picker-header-prev-btn";
      for (let i = 0; i < Math.abs(monthDelta); i += 1) {
        const nav = popup.querySelector(navSelector);
        if (!nav) break;
        simulateClick(nav);
        await sleep(70);
        popup = [
          ...document.querySelectorAll(
            ".ant-picker-dropdown:not(.ant-picker-dropdown-hidden)"
          ),
        ]
          .filter(isVisible)
          .at(-1) || popup;
      }
    }

    const findCell = () => {
      const root = [
        ...document.querySelectorAll(
          ".ant-picker-dropdown:not(.ant-picker-dropdown-hidden)"
        ),
      ]
        .filter(isVisible)
        .at(-1) || popup;
      return (
        root.querySelector(`td[title="${ymd}"]:not(.ant-picker-cell-disabled)`) ||
        root.querySelector(
          `td.ant-picker-cell[title="${ymd}"]:not(.ant-picker-cell-disabled)`
        )
      );
    };

    const cell1 = findCell();
    if (!cell1) return false;
    simulateClick(cell1);
    await sleep(120);
    // Lần 2 = ngày kết thúc cùng ngày (range 1 ngày)
    const cell2 = findCell();
    if (!cell2) return false;
    simulateClick(cell2);
    await sleep(140);
    pressKey("Escape");
    await sleep(60);
    return true;
  }

  async function applyFlightDateFilter(sessionYmd, dmy) {
    const { start, end } = findDateFilterInputs();
    if (!start || !end) {
      return {
        ok: false,
        start: "",
        end: "",
        error: "DATE_FILTER_NOT_FOUND",
      };
    }

    let startGot = "";
    let endGot = "";
    for (let attempt = 0; attempt < 4; attempt += 1) {
      clearDateFiltersBeforeScan();
      await sleep(60);

      // Ưu tiên chọn lịch: from = to = đúng 1 ngày phiên Ops
      await pickSingleDayRangeOnCalendar(sessionYmd);
      await sleep(80);

      startGot = String(start.value || "").trim();
      endGot = String(end.value || "").trim();
      if (dateValueMatches(startGot, dmy) && dateValueMatches(endGot, dmy)) {
        return { ok: true, start: startGot, end: endGot };
      }

      // Fallback text: ép cả 2 ô = cùng ngày (không Enter — tránh auto cuối tháng)
      setReactInput(start, dmy);
      await sleep(40);
      try {
        start.blur();
      } catch {
        /* ignore */
      }
      await sleep(40);
      setReactInput(end, dmy);
      await sleep(40);
      setReactInput(end, dmy);
      try {
        end.blur();
      } catch {
        /* ignore */
      }
      pressKey("Escape");
      await sleep(80);

      startGot = String(start.value || "").trim();
      endGot = String(end.value || "").trim();
      if (dateValueMatches(startGot, dmy) && dateValueMatches(endGot, dmy)) {
        return { ok: true, start: startGot, end: endGot };
      }
    }
    return { ok: false, start: startGot, end: endGot };
  }

  function clearDateFiltersBeforeScan() {
    try {
      // Hover picker để hiện nút X (Ant ẩn clear tới khi hover)
      for (const picker of document.querySelectorAll(".ant-picker")) {
        try {
          picker.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
          picker.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        } catch {
          /* ignore */
        }
      }
      for (const button of document.querySelectorAll(".ant-picker-clear")) {
        try {
          button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        } catch {
          /* ignore */
        }
      }
      const { start, end } = findDateFilterInputs();
      if (start) setReactInput(start, "");
      if (end) setReactInput(end, "");
      pressKey("Escape");
    } catch {
      /* ignore */
    }
  }

  function flightDateToYmd(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    let m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (m) {
      const [, day, month, year] = m;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
    m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (m) {
      const [, year, month, day] = m;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
    return "";
  }

  function rowMatchesSessionDate(row, sessionDate) {
    const normalized = flightDateToYmd(row?.flight_date || "");
    if (!normalized) return true;
    return normalized === sessionDate;
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
    // Đủ cụm «Hoàn thành tiếp nhận» — tránh khớp nhầm «Hoàn thành» đơn.
    return (
      normalized.includes("HOAN THANH TIEP NHAN") ||
      normalized.includes("HOANTHANHTIEPNHAN") ||
      normalized.includes("RECEPTION COMPLETED") ||
      normalized.includes("RECEPTIONCOMPLETED")
    );
  }

  function needsLogin() {
    const href = (location.href || "").toLowerCase();
    if (href.includes("awblogin") || href.includes("/login")) return true;
    if (document.getElementById("basic_username") || document.getElementById("basic_password")) {
      return true;
    }
    return false;
  }

  /** Username đang login trên portal (cookie dùng chung 2 Ext). */
  function readSessionIdentity() {
    if (needsLogin()) {
      return {
        ok: true,
        loggedIn: false,
        username: "",
        source: "login_page",
        confident: true,
      };
    }
    const fromStorage = readIdentityFromStorage();
    if (fromStorage) {
      return { ok: true, loggedIn: true, confident: true, ...fromStorage };
    }
    const fromDom = readIdentityFromDom();
    if (fromDom) {
      return { ok: true, loggedIn: true, ...fromDom };
    }
    // Đang có phiên nhưng không đọc được là ai — KHÔNG suy ra "sai user".
    return {
      ok: true,
      loggedIn: true,
      username: "",
      source: "unreadable",
      confident: false,
    };
  }

  /** Nhãn UI hay bị nhặt nhầm thành username (bug «Email»). */
  const IDENTITY_LABEL_BLOCKLIST = new Set([
    "email", "password", "username", "user", "account", "login", "logout",
    "profile", "home", "menu", "export", "import", "esid", "search", "hotline",
    "support", "help", "language", "setting", "settings", "notification",
    "dashboard", "report", "history", "admin", "guest", "name", "phone",
    "mobile", "address", "company", "submit", "cancel", "save", "close", "back",
  ]);

  /**
   * Tài khoản portal TCS luôn là chữ + số liền nhau (namnam8012, hanam7195).
   * Bắt buộc có chữ số để loại sạch nhãn giao diện.
   */
  function looksLikePortalAccount(raw) {
    const t = String(raw || "").replace(/\s+/g, " ").trim();
    if (!t || t.length < 4 || t.length > 40) return "";
    if (/\s/.test(t)) return "";
    if (IDENTITY_LABEL_BLOCKLIST.has(t.toLowerCase())) return "";
    if (!/^[a-zA-Z][a-zA-Z0-9._@-]{3,39}$/.test(t)) return "";
    if (!/\d/.test(t)) return "";
    return t;
  }

  function decodeJwtPayload(token) {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    try {
      const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
      const parsed = JSON.parse(json);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  const IDENTITY_FIELD_KEYS = [
    "username", "userName", "user_name", "userLogin", "loginName", "login_name",
    "account", "accountName", "userId", "userID", "unique_name",
    "preferred_username", "sub",
  ];

  /** Tìm field username trong object/JSON đã parse (giới hạn độ sâu). */
  function findIdentityField(value, depth = 0) {
    if (depth > 4 || !value || typeof value !== "object") return "";
    for (const key of IDENTITY_FIELD_KEYS) {
      const hit = looksLikePortalAccount(value[key]);
      if (hit) return hit;
    }
    for (const nested of Object.values(value)) {
      if (nested && typeof nested === "object") {
        const hit = findIdentityField(nested, depth + 1);
        if (hit) return hit;
      }
    }
    return "";
  }

  /** Nguồn đáng tin nhất: state/token SPA mà portal tự lưu. */
  function readIdentityFromStorage() {
    const stores = [];
    try {
      if (window.localStorage) stores.push(["localStorage", window.localStorage]);
    } catch {
      /* storage bị chặn */
    }
    try {
      if (window.sessionStorage) {
        stores.push(["sessionStorage", window.sessionStorage]);
      }
    } catch {
      /* storage bị chặn */
    }
    for (const [label, store] of stores) {
      let length = 0;
      try {
        length = store.length;
      } catch {
        continue;
      }
      for (let i = 0; i < length; i += 1) {
        let key = "";
        let raw = "";
        try {
          key = String(store.key(i) || "");
          raw = String(store.getItem(key) || "");
        } catch {
          continue;
        }
        if (!raw || raw.length > 200_000) continue;
        const jwt = decodeJwtPayload(raw);
        if (jwt) {
          const hit = findIdentityField(jwt);
          if (hit) return { username: hit, source: `${label}:${key}:jwt` };
        }
        if (/^[[{]/.test(raw.trim())) {
          try {
            const hit = findIdentityField(JSON.parse(raw));
            if (hit) return { username: hit, source: `${label}:${key}` };
          } catch {
            /* không phải JSON */
          }
        }
        if (IDENTITY_FIELD_KEYS.includes(key)) {
          const hit = looksLikePortalAccount(raw);
          if (hit) return { username: hit, source: `${label}:${key}` };
        }
      }
    }
    return null;
  }

  /** Dự phòng: quét DOM quanh nút Đăng xuất. Không quét cả body nữa. */
  function readIdentityFromDom() {
    const logoutEl = Array.from(
      document.querySelectorAll("a, button, span, li, div")
    ).find((el) => {
      const t = String(el.textContent || "").replace(/\s+/g, " ").trim();
      return (
        /^(đăng xuất|dang xuat|logout)$/i.test(t) ||
        (/đăng xuất|dang xuat|logout/i.test(t) && t.length < 24)
      );
    });
    if (logoutEl) {
      let node = logoutEl.parentElement;
      for (let depth = 0; depth < 6 && node; depth += 1) {
        for (const el of node.querySelectorAll("span, div, a, strong, b")) {
          const hit = looksLikePortalAccount(el.textContent);
          if (hit) return { username: hit, source: "near_logout", confident: true };
        }
        node = node.parentElement;
      }
    }
    const header = document.querySelector(
      "header, .ant-layout-header, .ant-pro-global-header, .ant-dropdown-trigger"
    );
    if (header) {
      for (const el of header.querySelectorAll("span, div, a, strong")) {
        const hit = looksLikePortalAccount(el.textContent);
        // Header có thể chứa mã chuyến/AWB — không coi là bằng chứng chắc chắn.
        if (hit) return { username: hit, source: "header", confident: false };
      }
    }
    return null;
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
    const text = String(value || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) || "";
    if (!id || !text) return false;
    const el = document.getElementById(id);
    if (!el) return false;
    const maxQueries = opts.maxQueries || 4;
    const deadline = Date.now() + Math.max(1_000, Number(opts.budgetMs || 6_000));
    const minAccept = Number(opts.minScore || 45);
    const hints = Array.isArray(opts.hints) ? opts.hints.filter(Boolean) : [];
    const extraQueries = Array.isArray(opts.extraQueries)
      ? opts.extraQueries.filter(Boolean)
      : [];

    const wrap = el.closest(".ant-select") || el;
    wrap.click();
    await sleep(100);

    const search =
      wrap.querySelector("input.ant-select-selection-search-input") ||
      document.querySelector(`#${CSS.escape(id)}.ant-select-selection-search-input`) ||
      (el.matches("input") ? el : null);

    const queries = [];
    const seenQ = new Set();
    for (const q of [...extraQueries, ...comboboxSearchQueries(text)]) {
      const fold = normalizeText(q);
      if (!fold || seenQ.has(fold)) continue;
      seenQ.add(fold);
      queries.push(String(q).trim());
    }
    const queryList = queries.slice(0, Math.max(maxQueries, 4));

    for (const query of queryList) {
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
      await sleep(Math.min(520, Math.max(160, deadline - Date.now())));

      const options = collectMasterOptions().filter(
        (o) => !/\bTHEM MOI\b|\bADD NEW\b/i.test(normalizeText(o.label))
      );
      // 1 option: chỉ Enter khi điểm đủ (tránh chọn nhầm vì query quá chung)
      if (options.length === 1 && optionMatchScore(text, options[0].label, hints) >= minAccept) {
        pressKey("ArrowDown");
        await sleep(60);
        pressKey("Enter");
        await sleep(180);
        if (!dropdownStillOpen() && selectionMatches(id, text, minAccept, hints)) {
          return true;
        }
        if (!dropdownStillOpen()) {
          clearMasterField(id);
          wrap.click();
          await sleep(80);
          continue;
        }
      }

      let best = null;
      let bestScore = 0;
      let secondScore = 0;
      for (const opt of options.slice(0, 30)) {
        const score = optionMatchScore(text, opt.label, hints);
        if (score > bestScore) {
          secondScore = bestScore;
          bestScore = score;
          best = opt;
        } else if (score > secondScore) {
          secondScore = score;
        }
      }
      if (
        best &&
        bestScore >= minAccept &&
        !(secondScore > 0 && bestScore - secondScore < 8 && bestScore < 95)
      ) {
        const target =
          best.el.querySelector(".ant-select-item-option-content") ||
          best.titleEl ||
          best.el;
        simulateClick(target);
        await sleep(200);
        if (!dropdownStillOpen()) {
          if (selectionMatches(id, text, minAccept, hints)) return true;
          clearMasterField(id);
          wrap.click();
          await sleep(80);
          continue;
        }
        pressKey("Enter");
        await sleep(150);
        if (!dropdownStillOpen()) {
          if (selectionMatches(id, text, minAccept, hints)) return true;
          clearMasterField(id);
          wrap.click();
          await sleep(80);
        }
      }
    }

    await hardResetUi();
    return false;
  }

  function hintBoostScore(label, hints) {
    const foldOpt = normalizeText(label);
    let best = 0;
    for (const h of hints || []) {
      const raw = String(h || "").replace(/[\s.\-_/]/g, "");
      if (raw.length < 6) continue;
      const foldH = normalizeText(raw);
      const digits = raw.replace(/\D/g, "");
      if (foldH && foldOpt.includes(foldH)) best = Math.max(best, 98);
      else if (digits.length >= 8 && foldOpt.replace(/\D/g, "").includes(digits)) {
        best = Math.max(best, 98);
      }
    }
    return best;
  }

  function optionMatchScore(fullText, optionText, hints) {
    return Math.max(scoreSelectOption(fullText, optionText), hintBoostScore(optionText, hints));
  }

  function selectionMatches(id, fullText, minAccept, hints) {
    const selected = getControlValue(id);
    if (!selected) return false;
    return optionMatchScore(fullText, selected, hints) >= minAccept;
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
    // Chỉ lấy dòng đầu — snapshot in đôi khi dính địa chỉ xuống dòng
    const raw = String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) || "";
    if (!raw) return [];
    const fold = normalizeText(raw);
    const words = fold.split(/[\s,/|.-]+/).filter(Boolean);
    // Token pháp lý / ngành nghề quá chung → không dùng làm query đầu (gây chọn nhầm droplist)
    const stop = new Set([
      "CONG", "TY", "CO", "PHAN", "VA", "DICH", "VU", "CHI", "NHANH",
      "SO", "CTY", "CTCP", "TNHH", "LTD", "COMPANY", "CORP", "CORPORATION",
      "INC", "LIMITED", "LLC", "PLC",
      "INTERNATIONAL", "LOGISTICS", "EXPRESS", "SHIPPING", "TRADING",
      "IMPORT", "EXPORT", "SERVICE", "SERVICES", "GROUP", "HOLDINGS",
      "GLOBAL", "CARGO", "FREIGHT", "FORWARDING",
    ]);
    const distinctive = words.filter((word) => word.length >= 3 && !stop.has(word));
    const rareUnique = [...new Set(distinctive)];
    const queries = [];
    // 1) Luôn thử tên đầy đủ trước (tránh "NAM"/"LOGISTICS" chọn nhầm master)
    queries.push(raw.length <= 48 ? raw : raw.slice(0, 48));
    // 2) Cụm token riêng theo thứ tự gốc (NAM NAM, NET …)
    if (distinctive.length >= 2) {
      queries.push(distinctive.slice(0, Math.min(3, distinctive.length)).join(" "));
    }
    if (rareUnique.length >= 2) {
      queries.push(rareUnique.slice(0, 2).join(" "));
    }
    // 3) Token đủ dài (>=4) — bỏ token 3 ký tự đứng một mình (NAM quá chung)
    const longRare = rareUnique.filter((w) => w.length >= 4);
    if (longRare.length) {
      queries.push([...longRare].sort((a, b) => b.length - a.length)[0]);
      queries.push(longRare[0]);
    } else if (rareUnique.length === 1 && distinctive.length < 2) {
      // Chỉ token đơn (NET/PCS) — không thêm NAM khi đã có cụm NAM NAM
      queries.push(rareUnique[0]);
    }
    const seen = new Set();
    const out = [];
    for (const q of queries) {
      const k = normalizeText(q);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(q.trim());
    }
    return out.slice(0, 5);
  }

  function scoreSelectOption(fullText, optionText) {
    const foldFull = normalizeText(fullText);
    const foldOpt = normalizeText(optionText);
    if (!foldFull || !foldOpt) return 0;
    if (/\bTHEM MOI\b|\bADD NEW\b/.test(foldOpt)) return 0;
    if (foldOpt === foldFull) return 100;
    if (foldOpt.includes(foldFull)) return 96;
    if (foldFull.includes(foldOpt)) {
      if (foldOpt.length >= Math.max(10, Math.floor(foldFull.length * 0.55))) return 88;
      return 0;
    }
    const generic = new Set([
      "CONG", "TY", "CO", "PHAN", "VA", "DICH", "VU", "CHI", "NHANH",
      "SO", "CTY", "CTCP", "TNHH", "LTD", "COMPANY", "CORP", "CORPORATION",
      "INC", "LIMITED", "LLC",
      "INTERNATIONAL", "LOGISTICS", "EXPRESS", "SHIPPING", "TRADING",
      "IMPORT", "EXPORT", "SERVICE", "SERVICES", "GROUP", "HOLDINGS",
      "GLOBAL", "CARGO", "FREIGHT", "FORWARDING", "AND", "THE",
      "AGENT", "AGENCY",
    ]);
    const fullArr = foldFull.split(/\s+/).filter(Boolean);
    const optArr = foldOpt.split(/\s+/).filter(Boolean);
    const fullRare = fullArr.filter((w) => w.length >= 3 && !generic.has(w));
    const optRare = new Set(optArr.filter((w) => w.length >= 3 && !generic.has(w)));
    // Bắt buộc cụm token riêng (vd. NAM NAM) có trong option — tránh match 1 từ NAM
    if (fullRare.length >= 2) {
      const phrase = fullRare.slice(0, Math.min(3, fullRare.length)).join(" ");
      if (phrase && !foldOpt.includes(phrase)) return 0;
    }
    let rareCommon = 0;
    const fullRareUnique = [...new Set(fullRare)];
    for (const w of fullRareUnique) if (optRare.has(w)) rareCommon += 1;
    if (!rareCommon) return 0;
    if (fullRareUnique.length && rareCommon / fullRareUnique.length < 0.6) return 0;
    let score = Math.floor((70 * rareCommon) / Math.max(fullRareUnique.length, 1));
    if (fullRareUnique[0] && optRare.has(fullRareUnique[0])) score += 20;
    if (fullArr.at(-1) && fullArr.at(-1) === optArr.at(-1) && !generic.has(fullArr.at(-1))) {
      score += 15;
    }
    const extra = [...optRare].filter((w) => !fullRareUnique.includes(w)).length;
    if (extra >= 2) score -= 12 * Math.min(extra, 3);
    return Math.max(0, score);
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
    const wantCash = /ti[eề]n\s*m[aặ]t|cash/i.test(String(label || ""));
    const keys = wantCash
      ? ["TIEN MAT", "CASH"]
      : ["CHUYEN KHOAN", "BANK TRANSFER"];
    const current = normalizeText(getControlValue(id));
    if (keys.some((k) => current.includes(k))) {
      return true;
    }
    const el = document.getElementById(id);
    if (!el) return false;
    const wrap = el.closest(".ant-select") || el;
    wrap.click();
    await sleep(100);
    const options = collectMasterOptions();
    const match = options.find((option) => {
      const text = normalizeText(option.label);
      return keys.some((k) => text.includes(k));
    });
    if (match) {
      simulateClick(
        match.el.querySelector(".ant-select-item-option-content") ||
          match.titleEl ||
          match.el
      );
      await sleep(100);
      const selected = normalizeText(getControlValue(id));
      if (keys.some((k) => selected.includes(k))) {
        return true;
      }
    }
    return fillMasterField(id, label || (wantCash ? "Tiền mặt" : "Chuyển khoản"), {
      maxQueries: 2,
      budgetMs: 2_400,
    });
  }

  function isCheckboxOn(el) {
    if (!el) return false;
    const wrap = el.closest(".ant-checkbox-wrapper");
    return (
      Boolean(el.checked) ||
      Boolean(wrap && wrap.querySelector(".ant-checkbox-checked"))
    );
  }

  function setAntCheckboxById(id, checked) {
    const el = document.getElementById(id);
    if (!el || String(el.type || "").toLowerCase() !== "checkbox") return false;
    if (isCheckboxOn(el) === Boolean(checked)) return true;
    const wrap =
      el.closest(".ant-checkbox-wrapper") ||
      document.querySelector(`label[for="${CSS.escape(id)}"]`) ||
      el.closest("label") ||
      el.parentElement;
    const box = (wrap && wrap.querySelector(".ant-checkbox")) || wrap || el;
    simulateClick(box);
    if (isCheckboxOn(el) === Boolean(checked)) return true;
    try {
      const desc = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "checked"
      );
      if (desc && desc.set) desc.set.call(el, Boolean(checked));
      else el.checked = Boolean(checked);
      el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      if (wrap) {
        wrap.classList.toggle("ant-checkbox-wrapper-checked", Boolean(checked));
        const inner = wrap.querySelector(".ant-checkbox");
        if (inner) inner.classList.toggle("ant-checkbox-checked", Boolean(checked));
      }
    } catch {
      /* ignore */
    }
    return isCheckboxOn(el) === Boolean(checked);
  }

  function setCheckboxByLabelPatterns(patterns, maxLen = 80) {
    const norms = patterns.map((p) =>
      String(p || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/gi, "d")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase()
    );
    const fold = (s) =>
      String(s || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/gi, "d")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    for (const el of document.querySelectorAll(
      "input.ant-checkbox-input, input[type=checkbox]"
    )) {
      if (el.closest(".ant-modal")) continue;
      const wrap =
        el.closest(".ant-checkbox-wrapper") ||
        el.closest("label") ||
        el.parentElement;
      const t = String(wrap?.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!t || t.length > maxLen) continue;
      if (/other\s*request/i.test(t)) continue;
      const ft = fold(t);
      if (!norms.some((p) => p && (ft === p || ft.includes(p)))) continue;
      if (isCheckboxOn(el)) return true;
      const box = (wrap && wrap.querySelector(".ant-checkbox")) || wrap || el;
      simulateClick(box);
      if (isCheckboxOn(el)) return true;
      return setAntCheckboxById(el.id, true) || isCheckboxOn(el);
    }
    return false;
  }

  function listCheckboxDebug() {
    return [...document.querySelectorAll("input.ant-checkbox-input, input[type=checkbox]")]
      .filter((el) => !el.closest(".ant-modal"))
      .slice(0, 40)
      .map((el) => {
        const wrap =
          el.closest(".ant-checkbox-wrapper") || el.closest("label");
        return {
          id: el.id || "",
          checked: Boolean(el.checked),
          label: String(wrap?.textContent || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 80),
        };
      });
  }

  function setShcOtherCheckbox(checked) {
    if (!checked) return false;
    const ids = [
      LOCATORS.fields.shc_other,
      "shcOth",
      "shcOth001",
      "shcOth003",
      "shcOther",
      "otherShc",
    ].filter((id, i, arr) => id && arr.indexOf(id) === i);
    for (const id of ids) {
      if (setAntCheckboxById(id, true)) return true;
    }
    return setCheckboxByLabelPatterns(
      ["khac/other", "khac / other", "khac", "other"],
      28
    );
  }

  function setAgreeConfirmCheckbox(checked) {
    if (!checked) return false;
    for (const id of [
      LOCATORS.fields.agree || "agreeConfirm",
      "agreeConfirm",
      "agree",
      "chkAgree",
    ]) {
      if (setAntCheckboxById(id, true)) return true;
    }
    return setCheckboxByLabelPatterns(
      [
        "toi dong y noi dung sau",
        "toi dong y",
        "i agree with the following content",
        "i agree with the following",
        "i agree",
      ],
      120
    );
  }

  function setCheckboxById(id, checked) {
    return setAntCheckboxById(id, checked);
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
    try {
      el.focus();
    } catch {
      /* ignore */
    }
    const proto =
      tag === "textarea" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const protoSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    const reactKey = Object.keys(el).find(
      (k) =>
        k.startsWith("__reactProps$") ||
        k.startsWith("__reactEventHandlers$") ||
        k.startsWith("_valueTracker")
    );
    // React 16/17 value tracker: clear trước khi set để onChange/onInput nhận giá trị mới
    const tracker = el._valueTracker;
    if (tracker && typeof tracker.setValue === "function") {
      try {
        tracker.setValue("");
      } catch {
        /* ignore */
      }
    }
    if (protoSetter) protoSetter.call(el, v);
    else el.value = v;
    if (tracker && typeof tracker.setValue === "function") {
      try {
        tracker.setValue(v);
      } catch {
        /* ignore */
      }
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    try {
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: v, inputType: "insertText" }));
    } catch {
      /* older */
    }
    // Ant Design Form đôi khi chỉ commit sau blur
    try {
      el.dispatchEvent(new Event("blur", { bubbles: true }));
    } catch {
      /* ignore */
    }
    void reactKey;
    window.setTimeout(() => {
      try {
        el.classList.remove("tecsops-active-field");
        el.classList.add("tecsops-done-field");
      } catch {
        /* visual aid only */
      }
    }, 260);
    return String(el.value || "") === v || String(el.value || "").toUpperCase() === v.toUpperCase();
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

  function awbDigitsFromText(text) {
    const digits = String(text || "").replace(/\D/g, "");
    if (digits.length >= 11) return digits.slice(0, 11);
    const m = String(text || "").match(/(\d{11})/);
    return m ? m[1] : digits;
  }

  function findAwbSearchInputs() {
    const last =
      document.querySelector("#search-form_awbNum") ||
      document.querySelector('input[placeholder="AWB#"]') ||
      [...document.querySelectorAll("input")].find((el) =>
        normalizeText(el.getAttribute("placeholder") || "").includes("AWB#")
      ) ||
      null;
    const prefix =
      document.querySelector("#search-form_awbPfx") ||
      document.querySelector('input[placeholder="Prefix"]') ||
      [...document.querySelectorAll("input")].find((el) =>
        normalizeText(el.getAttribute("placeholder") || "").includes("PREFIX")
      ) ||
      null;
    return { prefix, last };
  }

  function clickSearchEsidList() {
    const primary = [...document.querySelectorAll("button.ant-btn-primary")].find((btn) =>
      normalizeText(btn.textContent || "").includes("TIM KIEM")
    );
    if (primary) {
      simulateClick(primary);
      return true;
    }
    const any = [...document.querySelectorAll("button")].find((btn) =>
      normalizeText(btn.textContent || "").includes("TIM KIEM")
    );
    if (any) {
      simulateClick(any);
      return true;
    }
    return false;
  }

  function findInButton() {
    return (
      [...document.querySelectorAll("button, a, [role='button'], input[type='button']")].find(
        (el) => {
          const label = normalizeText(el.innerText || el.value || el.getAttribute("aria-label") || "");
          return label === "IN" && isVisible(el);
        }
      ) || null
    );
  }

  function clickInButton() {
    const btn = findInButton();
    if (!btn) return false;
    try {
      btn.scrollIntoView({ block: "center" });
    } catch {
      /* ignore */
    }
    simulateClick(btn);
    return true;
  }

  function installPrintStub() {
    try {
      const root = document.documentElement;
      root.dataset.tecsopsPrintStub = "1";
      window.print = () => false;
    } catch {
      /* ignore */
    }
  }

  function textLooksLikeEsidBill(text) {
    const raw = String(text || "").trim();
    if (raw.length < 120) return false;
    const low = normalizeText(raw);
    const chromeHits = ["GIOI THIEU", "DANH SACH ESID", "HOTLINE", "TIM KIEM", "DANG XUAT"].filter(
      (m) => low.includes(m)
    ).length;
    if (chromeHits >= 2) return false;
    const markers = [
      "SHIPPER",
      "CONSIGNEE",
      "AIR WAYBILL",
      "INSTRUCTION",
      "NGUOI GUI",
      "NGUOI NHAN",
      "SAN BAY",
      "KHONG VAN DON",
    ];
    const hits = markers.filter((m) => low.includes(m)).length;
    return hits >= 2 || (hits >= 1 && raw.length >= 280);
  }

  function serializeBillDocument(doc) {
    if (!doc) return "";
    try {
      for (const canvas of [...doc.querySelectorAll("canvas")]) {
        try {
          const img = doc.createElement("img");
          img.src = canvas.toDataURL("image/png");
          img.setAttribute("style", canvas.getAttribute("style") || "");
          if (canvas.width) img.width = canvas.width;
          if (canvas.height) img.height = canvas.height;
          canvas.replaceWith(img);
        } catch {
          /* ignore */
        }
      }
      const ORIGIN = "https://www.tcs.com.vn";
      const abs = (u) => {
        if (!u) return u;
        const s = String(u);
        if (/^(data:|blob:|https?:)/i.test(s)) return s;
        try {
          return new URL(s, `${ORIGIN}/`).href;
        } catch {
          return s;
        }
      };
      for (const el of doc.querySelectorAll("link[href], script[src], img[src]")) {
        const attr = el.hasAttribute("href") ? "href" : "src";
        const v = el.getAttribute(attr);
        if (v) el.setAttribute(attr, abs(v));
      }
      let head = doc.head;
      if (!head) {
        head = doc.createElement("head");
        doc.documentElement.insertBefore(head, doc.body);
      }
      if (!head.querySelector("base")) {
        const b = doc.createElement("base");
        b.href = `${ORIGIN}/`;
        head.prepend(b);
      }
      if (!head.querySelector("style[data-tecsops-page]")) {
        const st = doc.createElement("style");
        st.setAttribute("data-tecsops-page", "1");
        st.textContent =
          "@media print { @page { size: A4 portrait; margin: 0; } html, body { margin: 0; } }";
        head.appendChild(st);
      }
      return "<!DOCTYPE html>" + doc.documentElement.outerHTML;
    } catch {
      return "";
    }
  }

  function collectBillHtmlNow() {
    let best = null;
    let bestScore = 0;
    for (let i = 0; i < window.frames.length; i += 1) {
      try {
        const frame = window.frames[i];
        const doc = frame.document;
        const text = String(doc?.body?.innerText || "").trim();
        if (!textLooksLikeEsidBill(text)) continue;
        const html = serializeBillDocument(doc);
        const score = text.length + html.length;
        if (html && score > bestScore) {
          bestScore = score;
          best = html;
        }
      } catch {
        /* cross-origin */
      }
    }
    if (best) return { html: best };
    const mainText = String(document.body?.innerText || "").trim();
    if (textLooksLikeEsidBill(mainText)) {
      const html = serializeBillDocument(document);
      if (html) return { html };
    }
    return null;
  }

  async function waitForBillHtml(timeoutMs = 9000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const hit = collectBillHtmlNow();
      if (hit?.html && hit.html.length > 200) return hit;
      await sleep(120);
    }
    return collectBillHtmlNow();
  }

  async function prepareEsidDetailForPdf(awbDigits) {
    clickTabByText("DANH SÁCH ESID") || clickTabByText("DANH SACH ESID");
    await sleep(280);
    if (findInButton()) {
      const pageText = String(document.body?.innerText || "");
      if (pageText.includes(awbDigits.slice(-8)) || pageText.includes(awbDigits)) {
        updateWorkspaceOverlay("DOWNLOADING", "Đã mở đúng phiếu", 2, 5);
        return { ok: true };
      }
      clickTabByText("DANH SÁCH ESID") || clickTabByText("DANH SACH ESID");
      await sleep(200);
    }

    clearDateFiltersBeforeScan();
    await sleep(80);
    const { prefix, last } = findAwbSearchInputs();
    if (!last) {
      return { ok: false, error: "AWB_INPUT", message: "Không thấy ô AWB# trên danh sách ESID" };
    }
    const last8 = awbDigits.slice(3);
    const pfx = awbDigits.slice(0, 3);
    if (prefix) setReactInput(prefix, pfx);
    setReactInput(last, last8);
    updateWorkspaceOverlay("DOWNLOADING", `Tìm AWB# ${last8}`, 1, 5);
    if (!clickSearchEsidList()) {
      return { ok: false, error: "SEARCH_NOT_FOUND", message: "Không thấy nút TÌM KIẾM" };
    }
    await waitForTableRows(8000);
    await sleep(200);

    const rows = [...document.querySelectorAll(".ant-table-tbody tr, table tbody tr")].filter(
      (row) => row.querySelectorAll("td").length >= 3
    );
    let match = null;
    for (const row of rows) {
      const text = String(row.innerText || "");
      const digits = awbDigitsFromText(text);
      if (digits === awbDigits || digits.slice(-8) === last8 || text.includes(last8)) {
        match = row;
        break;
      }
    }
    if (!match) {
      return {
        ok: false,
        error: "NOT_FOUND",
        message: `Không thấy dòng ESID cho AWB …${last8} trên Ext kho TCS (rows=${rows.length}).`,
      };
    }
    updateWorkspaceOverlay("DOWNLOADING", "Mở chi tiết phiếu…", 2, 5);
    simulateClick(match);
    await sleep(350);
    for (let i = 0; i < 30; i += 1) {
      if (findInButton()) return { ok: true };
      await sleep(100);
    }
    try {
      window.scrollTo(0, document.body.scrollHeight);
    } catch {
      /* ignore */
    }
    await sleep(200);
    if (!findInButton()) {
      return { ok: false, error: "NO_PRINT", message: "Đã mở dòng nhưng không thấy nút IN" };
    }
    return { ok: true };
  }

  console.info(`[tecsops-ext] content-tcs ready v${SCRIPT_VERSION}`);
})();
