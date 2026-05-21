import { chromium } from "playwright";
import { ECARGO_CREATE_URL, FIXED_ECARGO_CONFIG } from "./ecargoConfig.mjs";
import { validateEcargoBooking } from "./ecargoPayload.mjs";

let browserPromise = null;

const BROWSER_CONTEXT_OPTS = {
  locale: "vi-VN",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
};

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
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
        return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
      }

      function tomorrowIsoFromVietnamDate(vietnamDate) {
        const [year, month, day] = vietnamDate.split("-").map(Number);
        const current = new Date(Date.UTC(year, month - 1, day));
        current.setUTCDate(current.getUTCDate() + 1);
        return `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, "0")}-${String(current.getUTCDate()).padStart(2, "0")}`;
      }

      function selectTimeSlot(slotText) {
        const select = visibleElements("select").find((item) =>
          [...item.options].some((o) => o.textContent.trim() === slotText)
        );
        if (!select) throw new Error(`Không tìm thấy khung giờ ${slotText}`);
        const option = [...select.options].find((o) => o.textContent.trim() === slotText);
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

      function fillMainForm(data) {
        const inputs = mainInputs();
        if (inputs.length < 9) throw new Error("Không đủ trường form chính.");
        setNativeValue(inputs[0], cfg.agency.name);
        setNativeValue(inputs[1], cfg.agent.name);
        chooseDocumentRadio("agent", cfg.agent.documentType);
        setNativeValue(inputs[2], cfg.agent.documentNo);
        const vn = todayAtVietnamTime();
        if (vn.hour >= 20) {
          setNativeValue(inputs[3], tomorrowIsoFromVietnamDate(vn.date));
          selectTimeSlot(cfg.warehouse.timeRule.after20h.timeSlot);
        }
        chooseVehicleRadio(cfg.vehicle.type);
        setNativeValue(inputs[4], data.vehicleNo);
        setNativeValue(inputs[5], data.driverName || cfg.driver.name);
        chooseDocumentRadio("driver", cfg.driver.documentType);
        setNativeValue(inputs[6], data.driverId || cfg.driver.documentNo);
        setNativeValue(inputs[7], cfg.contact.email);
        setNativeValue(inputs[8], cfg.contact.phone);
      }

      function fillAwbModal(data) {
        const inputs = modalInputs();
        if (inputs.length < 9) throw new Error("Không đủ trường modal AWB.");
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
        setNativeValue(inputs[9], data.commodity);

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
        for (let i = 0; i < 25; i += 1) {
          if (getOpenModal()) return;
          await sleep(50);
        }
        throw new Error("Không mở được modal Thêm AWB.");
      }

      function hasAwbRow() {
        return visibleElements("table tbody tr").some((row) => textOf(row).replace(/\s+/g, "").length > 0);
      }

      async function saveAwbModal() {
        const modal = getOpenModal();
        const buttons = visibleElementsIn(modal, "button");
        const saveButton = buttons.find((btn) => /th[eê]m|l[uư]u|save|ok|x[aá]c nh[aậ]n/i.test(textOf(btn)));
        if (!saveButton) throw new Error("Không tìm thấy nút lưu AWB.");
        saveButton.click();
        await sleep(400);
      }

      async function waitForAwbRow() {
        for (let i = 0; i < 30; i += 1) {
          if (hasAwbRow()) return;
          await sleep(100);
        }
        const hint = modalValidationHint();
        throw new Error(
          hint
            ? `Chưa lưu được AWB — ${hint}`
            : "Chưa có AWB trong bảng sau khi lưu — kiểm tra MAWB/chuyến/ngày bay hoặc dùng sao chép thủ công."
        );
      }

      async function createOrder() {
        const button = findButtonByText("Tạo phiếu");
        if (!button) throw new Error("Không tìm thấy nút Tạo phiếu.");
        if (!hasAwbRow()) throw new Error("Chưa có AWB trong bảng.");
        button.click();
        await sleep(400);
      }

      fillMainForm(b);
      await sleep(100);
      await openAwbModal();
      await sleep(150);
      fillAwbModal(b);
      await saveAwbModal();
      await waitForAwbRow();
      await sleep(150);
      await createOrder();
      return { ok: true, vehicleNo: b.vehicleNo, mawb: b.mawb };
    },
    { booking, fixedConfig }
  );
}

async function clickVerifyOnPage(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1200);

  const locatorCandidates = [
    page.getByRole("button", { name: /xác\s*thực/i }),
    page.getByRole("link", { name: /xác\s*thực/i }),
    page.locator("input[type='button'], input[type='submit']").filter({ hasText: /xác\s*thực/i }),
    page.locator("a, button, input[type='button'], input[type='submit']").filter({ hasText: /xác\s*thực/i }),
  ];

  for (const locator of locatorCandidates) {
    const target = locator.first();
    try {
      if (await target.isVisible({ timeout: 2500 })) {
        await target.click({ timeout: 5000 });
        await page.waitForTimeout(800);
        return;
      }
    } catch {
      /* thử selector khác */
    }
  }

  const clicked = await page.evaluate(() => {
    const nodes = [
      ...document.querySelectorAll("button, input[type='button'], input[type='submit'], a"),
    ];
    const verifyButton = nodes.find((btn) => /xác\s*thực/i.test(btn.innerText || btn.value || btn.textContent || ""));
    if (!verifyButton) return false;
    verifyButton.click();
    return true;
  });
  if (!clicked) throw new Error("Không tìm thấy nút Xác Thực trên trang Verify.");
  await page.waitForTimeout(800);
}

/**
 * Một phiên Playwright: điền form + tạo phiếu. Trả context để tái dùng cho Verify.
 */
export async function runEcargoPlaywrightSession(booking, hooks = {}) {
  const errors = validateEcargoBooking(booking);
  if (errors.length) throw new Error(errors.join(" "));

  const browser = await getBrowser();
  const context = await browser.newContext(BROWSER_CONTEXT_OPTS);
  const page = await context.newPage();

  try {
    hooks.onStatus?.("filling");
    await openCreatePageReady(page);
    await runEcargoDomAutomation(page, booking, FIXED_ECARGO_CONFIG);
    hooks.onStatus?.("submitted");
    await page.close();
    return { submittedAt: Date.now(), context };
  } catch (e) {
    await context.close();
    throw e;
  }
}

/** Bấm Xác Thực trong context đã mở (sau runEcargoPlaywrightSession). */
export async function runVerifyInContext(context, verifyUrl) {
  const page = await context.newPage();
  try {
    await page.goto(verifyUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await clickVerifyOnPage(page);
  } finally {
    await page.close();
  }
}

export async function closeEcargoContext(context) {
  if (context) await context.close();
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
    await page.goto(verifyUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
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
