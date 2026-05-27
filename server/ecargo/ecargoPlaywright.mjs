import { chromium } from "playwright";
import { ECARGO_CREATE_URL, FIXED_ECARGO_CONFIG } from "./ecargoConfig.mjs";
import { validateEcargoBooking } from "./ecargoPayload.mjs";

let browserPromise = null;
/** @type {import('playwright').BrowserContext | null} */
let pooledContext = null;
/** @type {import('playwright').Page | null} */
let warmedCreatePage = null;

const BROWSER_CONTEXT_OPTS = {
  locale: "vi-VN",
  timezoneId: "Asia/Ho_Chi_Minh",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
};

function blockHeavyAssets(context) {
  if (process.env.ECARGO_BLOCK_ASSETS === "0") return;
  return context.route("**/*", (route) => {
    const t = route.request().resourceType();
    if (t === "image" || t === "font" || t === "media") {
      void route.abort();
      return;
    }
    void route.continue();
  });
}

async function acquirePooledContext() {
  const browser = await getBrowser();
  if (pooledContext) {
    try {
      if (pooledContext.browser()?.isConnected()) return pooledContext;
    } catch {
      /* recreate */
    }
    pooledContext = null;
    warmedCreatePage = null;
  }
  pooledContext = await browser.newContext(BROWSER_CONTEXT_OPTS);
  await blockHeavyAssets(pooledContext);
  return pooledContext;
}

async function borrowCreatePage(context) {
  if (warmedCreatePage && !warmedCreatePage.isClosed() && warmedCreatePage.context() === context) {
    const page = warmedCreatePage;
    warmedCreatePage = null;
    return page;
  }
  const page = await context.newPage();
  await openCreatePageReady(page);
  return page;
}

async function stashWarmCreatePage(page) {
  if (page.isClosed()) return;
  try {
    await page.goto(ECARGO_CREATE_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page
      .waitForFunction(
        () =>
          [...document.querySelectorAll("input")].some((el) => {
            if (el.type === "hidden" || el.type === "radio" || el.type === "checkbox") return false;
            const s = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
          }),
        { timeout: 12_000 }
      )
      .catch(() => null);
    warmedCreatePage = page;
  } catch {
    await page.close().catch(() => {});
    warmedCreatePage = null;
  }
}

/** Khởi động Chromium + trang Create sẵn sàng — giảm độ trễ job đầu. */
export async function warmEcargoPlaywright() {
  const context = await acquirePooledContext();
  if (warmedCreatePage && !warmedCreatePage.isClosed()) return;
  const page = await context.newPage();
  await openCreatePageReady(page);
  warmedCreatePage = page;
}

async function getBrowser() {
  if (!browserPromise) {
    /**
     * Bật trình duyệt có giao diện để quan sát thao tác:
     *   ECARGO_HEADED=1   → headless: false
     *   ECARGO_SLOWMO=ms  → slowMo trong ms (mặc định 120ms khi bật headed, 0 khi headless)
     * Mặc định headless trên Railway / production.
     */
    const headed = process.env.ECARGO_HEADED === "1";
    const slowMo = Number(process.env.ECARGO_SLOWMO) || (headed ? 120 : 0);
    browserPromise = chromium
      .launch({
        headless: !headed,
        slowMo,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      })
      .then((browser) => {
        console.info(
          `[ecargo-pw] Chromium launched headless=${!headed} slowMo=${slowMo}ms${
            headed ? " — bạn sẽ thấy cửa sổ trình duyệt khi worker chạy job" : ""
          }`
        );
        return browser;
      })
      .catch((e) => {
        browserPromise = null;
        const hint =
          /Executable doesn't exist/i.test(String(e?.message ?? e))
            ? " Chạy: npx playwright install chromium"
            : "";
        throw new Error(String(e?.message ?? e) + hint);
      });
  }
  return browserPromise;
}

/** Chờ form Create sẵn sàng — domcontentloaded + input visible (không dùng networkidle). */
async function openCreatePageReady(page) {
  await page.goto(ECARGO_CREATE_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll("input")].some((el) => {
        if (el.type === "hidden" || el.type === "radio" || el.type === "checkbox") return false;
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
      }),
    { timeout: 20_000 }
  );
}

/** DOM automation — port từ extension content.js. */
async function runEcargoDomAutomation(page, booking, fixedConfig) {
  return page.evaluate(
    async ({ booking: b, fixedConfig: cfg }) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

      function textOf(el) {
        return String(el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
      }

      function visibleElements(selector) {
        return [...document.querySelectorAll(selector)].filter((el) => {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        });
      }

      function visibleElementsIn(root, selector) {
        if (!root) return [];
        return [...root.querySelectorAll(selector)].filter((el) => {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        });
      }

      function findButtonByText(text) {
        return visibleElements("button, input[type='button'], input[type='submit']").find((btn) => {
          const label = textOf(btn) || btn.value || "";
          return label.includes(text);
        });
      }

      function setNativeValue(input, value) {
        if (!input) throw new Error(`Không tìm thấy input: ${value}`);
        input.focus();
        const prototype = Object.getPrototypeOf(input);
        const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
        if (descriptor?.set) descriptor.set.call(input, String(value));
        else input.value = String(value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.blur();
      }

      function chooseRadioByIndex(index) {
        const radios = visibleElements("input[type='radio']");
        const radio = radios[index];
        if (!radio) throw new Error(`Không tìm thấy radio thứ ${index + 1}.`);
        if (!radio.checked) {
          radio.click();
          radio.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }

      function chooseDocumentRadio(group, documentType) {
        const offsets = { CCCD: 0, Passport: 1, GPLX: 2 };
        const base = group === "agent" ? 0 : 7;
        chooseRadioByIndex(base + (offsets[documentType] ?? 0));
      }

      function chooseVehicleRadio(vehicleType) {
        const offsets = { "Ô tô": 0, "Xe máy": 1, "Xe ba gác": 2, "Đi bộ": 3 };
        chooseRadioByIndex(3 + (offsets[vehicleType] ?? 0));
      }

      function todayAtVietnamTime() {
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Ho_Chi_Minh",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).formatToParts(new Date());
        const get = (type) => parts.find((p) => p.type === type)?.value;
        return {
          date: `${get("year")}-${get("month")}-${get("day")}`,
          hour: Number(get("hour")),
          minute: Number(get("minute")),
        };
      }

      function tomorrowIsoFromVietnamDate(vietnamDate) {
        const [year, month, day] = vietnamDate.split("-").map(Number);
        const current = new Date(Date.UTC(year, month - 1, day));
        current.setUTCDate(current.getUTCDate() + 1);
        return `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, "0")}-${String(current.getUTCDate()).padStart(2, "0")}`;
      }

      function getArrivalTimeSelect() {
        return (
          visibleElements("select").find(
            (item) => item.name === "Order.ArrivalTime" || item.id === "txtArrivalTime"
          ) ?? visibleElements("select")[0]
        );
      }

      function listTimeSlotTexts() {
        const select = getArrivalTimeSelect();
        if (!select) return [];
        return [...select.options].map((o) => o.textContent.trim()).filter(Boolean);
      }

      function parseSlotStartHour(slotText) {
        const match = /^(\d{1,2}):/.exec(String(slotText || ""));
        return match ? Number(match[1]) : -1;
      }

      function pickWarehouseTimeSlot(vn) {
        const slots = listTimeSlotTexts();
        if (!slots.length) return cfg.warehouse.timeRule.after20h.timeSlot;
        const nowMinutes = vn.hour * 60 + vn.minute;
        const next = slots.find((slot) => {
          const startHour = parseSlotStartHour(slot);
          return startHour >= 0 && startHour * 60 >= nowMinutes + 60;
        });
        return next ?? slots[slots.length - 1];
      }

      function selectTimeSlot(slotText) {
        const select = getArrivalTimeSelect();
        if (!select) throw new Error(`Không tìm thấy khung giờ ${slotText}`);
        const option = [...select.options].find((o) => o.textContent.trim() === slotText);
        if (!option) throw new Error(`Không tìm thấy khung giờ ${slotText}`);
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }

      function mainInputs() {
        const modal = getOpenModal();
        return visibleElements("input, textarea").filter((item) => {
          if (modal && modal.contains(item)) return false;
          if (["radio", "checkbox", "hidden", "search"].includes(item.type)) return false;
          if (item.classList.contains("select2-search__field")) return false;
          return true;
        });
      }

      function getOpenModal() {
        return visibleElements(".modal.show, .modal, [role='dialog']").find((modal) =>
          textOf(modal).includes("Thêm AWB")
        );
      }

      function modalInputs() {
        const modal = getOpenModal();
        if (!modal) throw new Error("Không thấy cửa sổ Thêm AWB.");
        return visibleElementsIn(modal, "input, textarea").filter(
          (item) => item.type !== "radio" && item.type !== "checkbox" && !item.classList.contains("select2-search__field")
        );
      }

      function modalValidationHint() {
        const modal = getOpenModal();
        if (!modal) return "";
        const bits = visibleElementsIn(modal, ".text-danger, .invalid-feedback, .field-validation-error, .alert-danger")
          .map((el) => textOf(el))
          .filter(Boolean);
        return bits.join(" · ");
      }

      function splitFlight(value) {
        const flight = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        const two = flight.match(/^([A-Z]{2})(\d{3,4}[A-Z]?)$/);
        if (two) return { carrier: two[1], flightNo: two[2] };
        const three = flight.match(/^([A-Z0-9]{3})(\d{3,4}[A-Z]?)$/);
        if (three) return { carrier: three[1], flightNo: three[2] };
        return { carrier: flight.slice(0, 2), flightNo: flight.slice(2) };
      }

      function scoreSaveLabel(label) {
        const t = String(label || "").replace(/\s+/g, " ").trim();
        if (!t) return -100;
        if (/h[uủ]y|cancel|quay\s*lại/i.test(t)) return -100;
        if (/save\s*&?\s*close/i.test(t)) return 100;
        if (/^close$/i.test(t) || (/\bclose\b/i.test(t) && !/save/i.test(t))) return -100;
        if (/^l[uư]u$/i.test(t)) return 100;
        if (/x[aá]c\s*nh[aậ]n/i.test(t)) return 95;
        if (/^ok$/i.test(t) || /^save$/i.test(t)) return 90;
        if (/th[eê]m\s*house/i.test(t)) return 10;
        if (/^th[eê]m$/i.test(t)) return 80;
        if (/th[eê]m\s*awb/i.test(t)) return 20;
        if (/th[eê]m/i.test(t)) return 70;
        return -1;
      }

      function buttonLabel(btn) {
        return textOf(btn) || btn.value || btn.getAttribute("aria-label") || "";
      }

      function findModalSaveButton(modal) {
        const candidates = visibleElementsIn(
          modal,
          "button, input[type='button'], input[type='submit'], a.btn, a.button"
        );
        const ranked = candidates
          .map((btn) => ({ btn, score: scoreSaveLabel(buttonLabel(btn)) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score);
        return ranked[0]?.btn ?? null;
      }

      function rowContainsMawb(rowText, mawbRaw) {
        const compactRow = String(rowText || "").replace(/\s+/g, "");
        if (!compactRow) return false;
        const digits = String(mawbRaw || "").replace(/\D/g, "");
        if (digits.length < 11) return compactRow.length > 0;
        const prefix = digits.slice(0, 3);
        const suffix = digits.slice(3);
        if (compactRow.includes(digits)) return true;
        if (compactRow.includes(`${prefix}-${suffix}`)) return true;
        return compactRow.includes(prefix) && compactRow.includes(suffix);
      }

      function hasAwbRow(expectedMawb) {
        return visibleElements("table tbody tr").some((row) =>
          rowContainsMawb(textOf(row), expectedMawb)
        );
      }

      function applyWarehouseArrival(vn) {
        const inputs = mainInputs();
        if (inputs.length < 4) throw new Error("Không tìm thấy ngày hàng vào.");
        if (vn.hour >= 20) {
          setNativeValue(inputs[3], tomorrowIsoFromVietnamDate(vn.date));
          selectTimeSlot(cfg.warehouse.timeRule.after20h.timeSlot);
          return;
        }
        setNativeValue(inputs[3], vn.date);
        selectTimeSlot(pickWarehouseTimeSlot(vn));
      }

      function fillMainForm(data) {
        const inputs = mainInputs();
        if (inputs.length < 9) throw new Error("Không đủ trường form chính.");
        setNativeValue(inputs[0], cfg.agency.name);
        setNativeValue(inputs[1], cfg.agent.name);
        chooseDocumentRadio("agent", cfg.agent.documentType);
        setNativeValue(inputs[2], cfg.agent.documentNo);
        chooseVehicleRadio(cfg.vehicle.type);
        setNativeValue(inputs[4], data.vehicleNo);
        setNativeValue(inputs[5], data.driverName || cfg.driver.name);
        chooseDocumentRadio("driver", cfg.driver.documentType);
        setNativeValue(inputs[6], data.driverId || cfg.driver.documentNo);
        setNativeValue(inputs[7], cfg.contact.email);
        setNativeValue(inputs[8], cfg.contact.phone);
        applyWarehouseArrival(todayAtVietnamTime());
      }

      function fillAwbModal(data) {
        const inputs = modalInputs();
        if (inputs.length < 8) throw new Error("Không đủ trường modal AWB.");
        const { carrier, flightNo } = splitFlight(data.flight);
        const mawbDigits = data.mawb.replace(/\D/g, "");
        setNativeValue(inputs[0], carrier);
        setNativeValue(inputs[1], flightNo);
        setNativeValue(inputs[2], data.flightDate);
        setNativeValue(inputs[3], data.destination);
        setNativeValue(inputs[4], mawbDigits.slice(0, 3));
        setNativeValue(inputs[5], mawbDigits.slice(3));
        setNativeValue(inputs[6], data.hawb && data.hawb !== "0" ? data.hawb : "");
        setNativeValue(inputs[7], data.pcs);
        setNativeValue(inputs[8], data.grossWeight);
        if (inputs.length > 9 && data.commodity) {
          setNativeValue(inputs[9], data.commodity);
        }

        if (data.shc && data.shc !== "0") {
          const modal = getOpenModal();
          const search = visibleElementsIn(modal, "input.select2-search__field, input[type='search']").at(-1);
          if (search) {
            search.focus();
            setNativeValue(search, data.shc);
            search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
          }
        }
      }

      async function openAwbModal() {
        const button = findButtonByText("Thêm AWB");
        if (!button) throw new Error("Không tìm thấy nút Thêm AWB.");
        button.click();
        for (let i = 0; i < 30; i += 1) {
          if (getOpenModal()) return;
          await sleep(100);
        }
        throw new Error("Không mở được modal Thêm AWB.");
      }

      async function saveAwbModal() {
        const modal = getOpenModal();
        if (!modal) throw new Error("Không thấy cửa sổ Thêm AWB.");
        const saveButton = findModalSaveButton(modal);
        if (!saveButton) throw new Error("Không tìm thấy nút lưu AWB.");
        saveButton.click();
        await sleep(800);
      }

      async function waitForAwbSaved(expectedMawb) {
        for (let i = 0; i < 40; i += 1) {
          const modalOpen = Boolean(getOpenModal());
          if (hasAwbRow(expectedMawb) && !modalOpen) return;
          if (hasAwbRow(expectedMawb) && i >= 6) return;
          await sleep(100);
        }
        const hint = modalValidationHint();
        if (getOpenModal()) {
          throw new Error(
            hint
              ? `Modal AWB không đóng — ${hint}`
              : "Modal AWB không đóng sau khi bấm lưu — kiểm tra MAWB/chuyến/ngày bay."
          );
        }
        throw new Error(
          hint
            ? `Chưa lưu được AWB — ${hint}`
            : "Chưa có AWB trong bảng sau khi lưu — kiểm tra MAWB/chuyến/ngày bay hoặc dùng sao chép thủ công."
        );
      }

      async function createOrder() {
        const button = findButtonByText("Tạo phiếu");
        if (!button) throw new Error("Không tìm thấy nút Tạo phiếu.");
        if (!hasAwbRow(b.mawb)) throw new Error("Chưa có AWB trong bảng.");
        button.click();
        await sleep(500);
      }

      fillMainForm(b);
      await sleep(200);
      await openAwbModal();
      await sleep(300);
      fillAwbModal(b);
      await saveAwbModal();
      await waitForAwbSaved(b.mawb);
      await sleep(300);
      await createOrder();
      return { ok: true, vehicleNo: b.vehicleNo, mawb: b.mawb };
    },
    { booking, fixedConfig }
  );
}

/** Nút xanh cạnh ô mã — khớp extension Chrome SCSC (contains «xác thực», label ngắn). */
function isVerifySubmitLabel(label) {
  const t = String(label || "").trim();
  if (!t || t.length > 32) return false;
  if (!/xác\s*thực/i.test(t)) return false;
  if (/gửi\s*lại|hủy|đóng|quay\s*lại/i.test(t)) return false;
  return /^xác\s*thực\.?!?$/i.test(t) || t.replace(/\s+/g, " ").length <= 16;
}

/** Chờ trang Verify render nút — khớp extension (delay ~1.2s + poll). */
async function waitForVerifyPageReady(page) {
  await page.waitForLoadState("load", { timeout: 60_000 }).catch(() => null);
  await page.waitForTimeout(1_200);
  await page
    .waitForFunction(
      () => {
        const isVerify = (label) => {
          const t = String(label || "").trim();
          if (!t || t.length > 32) return false;
          if (!/xác\s*thực/i.test(t)) return false;
          if (/gửi\s*lại|hủy|đóng|quay\s*lại/i.test(t)) return false;
          return /^xác\s*thực\.?!?$/i.test(t) || t.replace(/\s+/g, " ").length <= 16;
        };
        const nodes = [
          ...document.querySelectorAll("button, input[type='button'], input[type='submit']"),
        ];
        return nodes.some((btn) => {
          const label = (btn.innerText || btn.value || btn.textContent || "").trim();
          if (!isVerify(label)) return false;
          const style = window.getComputedStyle(btn);
          const rect = btn.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 1 &&
            rect.height > 1 &&
            !btn.disabled
          );
        });
      },
      { timeout: 25_000 }
    )
    .catch(() => null);
}

/**
 * @returns {Promise<{ clicked: boolean; method?: string; debug?: string }>}
 */
async function clickVerifyOnPage(page) {
  await waitForVerifyPageReady(page);

  const roleBtn = page.getByRole("button", { name: /xác\s*thực/i });
  if ((await roleBtn.count()) > 0) {
    try {
      await roleBtn.first().scrollIntoViewIfNeeded();
      await roleBtn.first().click({ timeout: 8_000 });
      return { clicked: true, method: "getByRole" };
    } catch {
      /* thử cách khác */
    }
  }

  const pwLocator = page
    .locator("button, input[type='button'], input[type='submit']")
    .filter({ hasText: /xác\s*thực/i })
    .first();
  try {
    if ((await pwLocator.count()) > 0) {
      await pwLocator.scrollIntoViewIfNeeded();
      await pwLocator.click({ timeout: 8_000, force: true });
      return { clicked: true, method: "locator" };
    }
  } catch {
    /* thử evaluate */
  }

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const evalResult = await page.evaluate(() => {
      const isVerify = (label) => {
        const t = String(label || "").trim();
        if (!t || t.length > 32) return false;
        if (!/xác\s*thực/i.test(t)) return false;
        if (/gửi\s*lại|hủy|đóng|quay\s*lại/i.test(t)) return false;
        return /^xác\s*thực\.?!?$/i.test(t) || t.replace(/\s+/g, " ").length <= 16;
      };
      const nodes = [
        ...document.querySelectorAll("button, input[type='button'], input[type='submit']"),
      ];
      const verifyButton = nodes.find((btn) => {
        const label = (btn.innerText || btn.value || btn.textContent || "").trim();
        if (!isVerify(label)) return false;
        const style = window.getComputedStyle(btn);
        const rect = btn.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || rect.width < 1 || rect.height < 1) {
          return false;
        }
        if (btn.disabled) return false;
        return true;
      });
      if (!verifyButton) return { clicked: false };
      verifyButton.scrollIntoView({ block: "center" });
      verifyButton.click();
      return {
        clicked: true,
        label: (verifyButton.innerText || verifyButton.value || "").trim().slice(0, 40),
      };
    });
    if (evalResult?.clicked) {
      return { clicked: true, method: "evaluate", debug: evalResult.label };
    }
    await page.waitForTimeout(80);
  }

  const debug = await page.evaluate(() => {
    const labels = [...document.querySelectorAll("button, input[type='button'], input[type='submit']")]
      .map((b) => (b.innerText || b.value || "").trim())
      .filter(Boolean)
      .slice(0, 12);
    return { title: document.title, url: location.href, buttons: labels };
  });
  return {
    clicked: false,
    debug: JSON.stringify(debug).slice(0, 400),
  };
}

/**
 * Chờ trang Details sau khi bấm Xác Thực — banner xanh "Phiếu đăng ký đã được xác thực thành công".
 * @returns {Promise<{ success: boolean; failure: boolean; registrationNo?: string; detailsUrl?: string; text: string }>}
 */
async function waitForVerifySuccessPage(page) {
  await page
    .waitForURL(/\/Export\/VCTOrder\/Details\//i, { timeout: 45_000 })
    .catch(() => null);

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const snap = await page.evaluate(() => {
      const text = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
      const href = location.href;
      const onDetails = /\/Export\/VCTOrder\/Details\//i.test(href);
      const bannerOk = /Phiếu đăng ký đã được xác thực thành công/i.test(text);
      const detailsPage =
        /Thông tin hàng vào kho/i.test(text) &&
        (/Số đăng ký/i.test(text) || /Trạng thái/i.test(text));
      const success =
        bannerOk ||
        onDetails ||
        detailsPage ||
        (onDetails && /đã được xác thực/i.test(text));
      const failure =
        (/không\s*hợp\s*lệ|thất\s*bại|hết\s*hạn|invalid|không\s*tìm\s*thấy/i.test(text) &&
          !success) ||
        false;
      const regMatch =
        href.match(/\/Details\/([A-Z0-9]{6,12})/i) ||
        text.match(/Số đăng ký\s*:?\s*([A-Z0-9]{6,12})/i);
      return {
        success,
        failure,
        onDetails,
        registrationNo: regMatch ? regMatch[1].toUpperCase() : "",
        detailsUrl: onDetails ? href : "",
        text: text.slice(0, 320),
      };
    });
    if (snap.success) return { ...snap, success: true };
    if (snap.failure) return { ...snap, failure: true };
    await page.waitForTimeout(300);
  }

  return page.evaluate(() => ({
    success: false,
    failure: false,
    text: (document.body?.innerText || "").slice(0, 320),
    detailsUrl: location.href,
  }));
}

/**
 * Một phiên Playwright: điền form + tạo phiếu. Trả context để tái dùng cho Verify.
 */
export async function runEcargoPlaywrightSession(booking, hooks = {}) {
  const errors = validateEcargoBooking(booking);
  if (errors.length) throw new Error(errors.join(" "));

  const context = await acquirePooledContext();
  const page = await borrowCreatePage(context);

  try {
    hooks.onStatus?.("filling");
    await runEcargoDomAutomation(page, booking, FIXED_ECARGO_CONFIG);
    hooks.onStatus?.("submitted");
    const submittedAt = Date.now();
    await stashWarmCreatePage(page);
    return { submittedAt, context };
  } catch (e) {
    warmedCreatePage = null;
    for (const p of context.pages()) {
      await p.close().catch(() => {});
    }
    await context.close().catch(() => {});
    if (pooledContext === context) pooledContext = null;
    throw e;
  }
}

/**
 * Mở link Verify và bấm nút Xác Thực — context riêng (không chặn asset) để trang render đủ.
 * @returns {Promise<{ verifyClicked: boolean; verifyMessage: string; verifyPageHint?: string; verifyClickMethod?: string; registrationNo?: string; detailsUrl?: string; verifySuccess: boolean }>}
 */
export async function runVerifyInContext(_context, verifyUrl) {
  const browser = await getBrowser();
  const verifyContext = await browser.newContext(BROWSER_CONTEXT_OPTS);
  const page = await verifyContext.newPage();

  try {
    console.info("[ecargo-pw] verify goto", verifyUrl.slice(0, 80));
    await page.goto(verifyUrl, { waitUntil: "load", timeout: 60_000 });

    let clickResult = await clickVerifyOnPage(page);
    if (!clickResult.clicked) {
      await page.reload({ waitUntil: "load", timeout: 45_000 }).catch(() => null);
      clickResult = await clickVerifyOnPage(page);
    }

    if (!clickResult.clicked) {
      throw new Error(
        `Không tìm thấy hoặc không bấm được nút Xác Thực. Debug: ${clickResult.debug ?? "no buttons"}`
      );
    }

    console.info("[ecargo-pw] verify clicked via", clickResult.method, clickResult.debug ?? "");

    const after = await waitForVerifySuccessPage(page);
    if (after.failure && !after.success) {
      throw new Error(
        after.text
          ? `Trang xác thực báo lỗi: ${after.text}`
          : "Trang xác thực có thể thất bại — kiểm tra lại mã trong email."
      );
    }
    if (!after.success) {
      throw new Error(
        "Đã bấm Xác Thực nhưng chưa thấy trang xác nhận «Phiếu đăng ký đã được xác thực thành công»."
      );
    }

    const reg = after.registrationNo || "";
    const verifyMessage = reg
      ? `Phiếu đăng ký đã được xác thực thành công — số ${reg}.`
      : "Phiếu đăng ký đã được xác thực thành công.";

    return {
      verifyClicked: true,
      verifySuccess: true,
      verifyMessage,
      verifyPageHint: after.text || undefined,
      verifyClickMethod: clickResult.method,
      registrationNo: reg || undefined,
      detailsUrl: after.detailsUrl,
    };
  } finally {
    await page.close().catch(() => {});
    await verifyContext.close().catch(() => {});
  }
}

/**
 * @param {import('playwright').BrowserContext | null} context
 * @param {{ destroy?: boolean }} [opts] — `destroy: true` khi lỗi; mặc định giữ context cho job sau.
 */
export async function closeEcargoContext(context, opts = {}) {
  if (!context) return;
  if (opts.destroy) {
    warmedCreatePage = null;
    await context.close().catch(() => {});
    if (pooledContext === context) pooledContext = null;
    return;
  }
  for (const p of context.pages()) {
    if (p !== warmedCreatePage) await p.close().catch(() => {});
  }
}

export async function runEcargoAutomation(booking, hooks = {}) {
  const { submittedAt, context } = await runEcargoPlaywrightSession(booking, hooks);
  await context.close();
  return { submittedAt };
}

export async function runEcargoVerifyClick(verifyUrl) {
  const browser = await getBrowser();
  const context = await browser.newContext(BROWSER_CONTEXT_OPTS);
  const page = await context.newPage();
  try {
    await page.goto(verifyUrl, { waitUntil: "commit", timeout: 45_000 });
    await clickVerifyOnPage(page);
  } finally {
    await context.close();
  }
}

export async function closeEcargoBrowser() {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}
