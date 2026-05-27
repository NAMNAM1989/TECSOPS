import { chromium } from "playwright";
import { ECARGO_CREATE_URL, FIXED_ECARGO_CONFIG } from "./ecargoConfig.mjs";
import { validateEcargoBooking } from "./ecargoPayload.mjs";
import { runEcargoCreatePageDom } from "./ecargoCreatePageDom.mjs";
import {
  clickVerifyOnPage,
  waitForVerifySuccessPage,
} from "./ecargoVerifyPage.mjs";

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

/** @see ./ecargoCreatePageDom.mjs */
async function runEcargoDomAutomation(page, booking, fixedConfig) {
  return runEcargoCreatePageDom(page, booking, fixedConfig);
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
