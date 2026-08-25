import { chromium } from "playwright";
import {
  BASE_URL,
  isLocalBaseUrl,
  loginIfConfigured,
} from "./support.mjs";

const IS_REMOTE = !isLocalBaseUrl();
const failures = [];
const results = [];

function record(id, passed, detail) {
  results.push({ id, passed, detail });
  const label = passed ? "PASS" : "FAIL";
  console.log(`${label} ${id}: ${detail}`);
  if (!passed) failures.push(`${id}: ${detail}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await loginIfConfigured(context);
  const page = await context.newPage();
  const consoleErrors = [];
  const failedResponses = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push({ status: response.status(), url: response.url() });
    }
  });

  try {
    const health = await context.request.get(`${BASE_URL}/api/health`);
    const healthBody = await health.json().catch(() => ({}));
    record(
      "R-HEALTH",
      health.ok() && healthBody?.storage?.postgres === true,
      `HTTP ${health.status()} · postgres=${String(healthBody?.storage?.postgres)}`,
    );

    await page.goto(`${BASE_URL}/#/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.getByRole("heading", { level: 1 }).waitFor({ timeout: 15_000 });
    await page.getByRole("button", { name: /\+ Booking/i }).first().waitFor({ timeout: 15_000 });
    await page.getByText("Live", { exact: true }).waitFor({ timeout: 15_000 });
    record("A-OPS", (await page.getByRole("button", { name: /\+ Booking/i }).count()) > 0, "#/ tải Ops");
    record("A-LIVE", (await page.getByText("Live", { exact: true }).count()) > 0, "Socket Live");

    await page.goto(`${BASE_URL}/#/customers`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /Khách hàng/i }).waitFor({ timeout: 15_000 });
    record(
      "A-CUSTOMERS",
      (await page.getByRole("heading", { name: /Khách hàng/i }).count()) > 0,
      "#/customers tải danh bạ",
    );

    await page.goto(`${BASE_URL}/#/stats`, { waitUntil: "domcontentloaded" });
    await page.getByRole("tablist", { name: "Bộ lọc thống kê" }).waitFor({ timeout: 15_000 });
    record(
      "A-STATS",
      (await page.getByText("Dashboard", { exact: true }).count()) > 0,
      "#/stats tải Dashboard",
    );

    await page.goto(`${BASE_URL}/#/invalid-e2e-route`, { waitUntil: "domcontentloaded" });
    record(
      "A-INVALID",
      (await page.getByRole("button", { name: /\+ Booking/i }).count()) > 0,
      "hash lạ fallback Ops",
    );

    await page.goto(`${BASE_URL}/#/`, { waitUntil: "domcontentloaded" });
    const warehouseButtons = {
      "TECS-TCS": page.getByRole("button", { name: /TECS TECS-TCS/i }),
      "TECS-SCSC": page.getByRole("button", { name: /TECS TECS-SCSC/i }),
      TCS: page.getByRole("button", { name: /^TCS TCS/i }),
      SCSC: page.getByRole("button", { name: /^SCSC SCSC/i }),
    };
    for (const [warehouse, locator] of Object.entries(warehouseButtons)) {
      record(`D-WH-${warehouse}`, (await locator.count()) > 0, `có tab ${warehouse}`);
    }

    async function statusOptionsFor(warehouse) {
      const button = warehouseButtons[warehouse];
      if ((await button.count()) === 0) return [];
      await button.first().click();
      const select = page.locator('select[aria-label*="Trạng thái"]').first();
      if ((await select.count()) === 0) return [];
      return select.locator("option").allTextContents();
    }

    const tcsOptions = await statusOptionsFor("TECS-TCS");
    const scscOptions = await statusOptionsFor("SCSC");
    record(
      "C-TCS-RECEPTION",
      tcsOptions.some((value) => /Hoàn thành tiếp nhận/i.test(value)),
      "TCS có RECEPTION_COMPLETED",
    );
    record(
      "C-SCSC-NO-RECEPTION",
      scscOptions.length > 0 && !scscOptions.some((value) => /Hoàn thành tiếp nhận/i.test(value)),
      "SCSC không có RECEPTION_COMPLETED",
    );

    const scscMenus = page.getByRole("button", { name: /Menu thao tác lô hàng/i });
    if ((await scscMenus.count()) > 0) {
      await scscMenus.first().click();
      const text = await page.locator("body").innerText();
      record("D-ECARGO-SCSC", !/eCargo|VCT|đăng ký xe/i.test(text), "SCSC không còn hành động eCargo");
      await page.keyboard.press("Escape");
    } else {
      record("D-ECARGO-SCSC", false, "ngày hiện tại không có row SCSC để kiểm tra");
    }

    await warehouseButtons["TECS-SCSC"].first().click();
    const hubMenus = page.getByRole("button", { name: /Menu thao tác lô hàng/i });
    if ((await hubMenus.count()) > 0) {
      await hubMenus.first().click();
      const text = await page.locator("body").innerText();
      record(
        "D-NO-ECARGO-TECS-SCSC",
        !/eCargo|VCT|đăng ký xe/i.test(text),
        "TECS-SCSC không có eCargo",
      );
      await page.keyboard.press("Escape");
    }

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/#/`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /\+ Booking/i }).first().waitFor({ timeout: 15_000 });
    const mobileSize = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    const overflow = mobileSize.scrollWidth > mobileSize.clientWidth + 2;
    record(
      "N-MOBILE-OVERFLOW",
      !overflow,
      `375px scroll=${mobileSize.scrollWidth} client=${mobileSize.clientWidth}`,
    );

    const seriousConsoleErrors = consoleErrors.filter(
      (message) => !/favicon|Download the React DevTools/i.test(message),
    );
    record(
      "N-CONSOLE",
      seriousConsoleErrors.length === 0,
      seriousConsoleErrors.length ? seriousConsoleErrors.slice(0, 3).join(" | ") : "console sạch",
    );
  } finally {
    await browser.close();
  }

  console.log(
    `\nE2E L1 ${results.filter((item) => item.passed).length}/${results.length} PASS · BASE_URL=${BASE_URL}${IS_REMOTE ? " (remote read-only)" : ""}`,
  );
  if (failures.length) {
    throw new Error(`E2E L1 failed:\n- ${failures.join("\n- ")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
