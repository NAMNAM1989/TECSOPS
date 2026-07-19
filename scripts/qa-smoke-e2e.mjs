/**
 * Smoke E2E — Playwright (không xóa dữ liệu thật).
 * Chạy: npm run qa:smoke
 * (hoặc: node scripts/qa-smoke-e2e.mjs)
 */
import { chromium } from "playwright";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.TECSOPS_URL || "http://127.0.0.1:5173";
const OUT = path.resolve("output/qa-smoke");
const findings = [];

function ok(id, msg) {
  findings.push({ id, ok: true, msg });
  console.log(`PASS ${id}: ${msg}`);
}
function fail(id, msg) {
  findings.push({ id, ok: false, msg });
  console.error(`FAIL ${id}: ${msg}`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const consoleErrors = [];
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  try {
    await page.goto(`${BASE}/#/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector("text=TECS", { timeout: 15000 });
    ok("NAV-01", "Trang Ops tải được");

    // Chọn ngày có data
    const dateInput = page.locator('input[type="date"]').first();
    if (await dateInput.count()) {
      await dateInput.fill("2026-07-17");
      await page.waitForTimeout(500);
      ok("DATE-01", `Đặt ngày phiên → ${await dateInput.inputValue()}`);
    } else {
      fail("DATE-01", "Không thấy input type=date");
    }

    // Thanh TCS
    const tcsLogin = page.getByRole("button", { name: "Login" });
    if (await tcsLogin.count()) ok("TCS-01", "Thanh Cổng TCS hiện (Login)");
    else fail("TCS-01", "Không thấy nút Login TCS");

    const pdfBar = page.getByRole("button", { name: /^PDF ESID/ });
    if ((await pdfBar.count()) === 0) ok("TCS-02", "Toolbar không còn PDF ESID hàng loạt (đúng)");
    else fail("TCS-02", "Toolbar vẫn còn nút PDF ESID — cần bỏ");

    // Tải PDF ESID theo từng lô trên menu ⋮ (đã bỏ In ESID)
    const menus = page.getByRole("button", { name: "Menu thao tác lô hàng" });
    const n = await menus.count();
    if (n > 0) ok("MENU-01", `${n} menu dòng`);
    else fail("MENU-01", "Không có menu thao tác lô");

    if (n > 0) {
      await menus.first().click();
      await page.waitForTimeout(200);
      const pdfItem = page.getByRole("menuitem", { name: /Tải PDF ESID|PDF ESID/ });
      const printItem = page.getByRole("menuitem", { name: "In ESID" });
      if (await pdfItem.count()) ok("MENU-02", "Menu dòng có Tải PDF ESID");
      else fail("MENU-02", "Menu dòng không có Tải PDF ESID");
      if ((await printItem.count()) === 0) ok("MENU-03", "Menu dòng đã bỏ In ESID (đúng)");
      else fail("MENU-03", "Menu dòng vẫn còn In ESID — cần gỡ");
      await page.keyboard.press("Escape");
    }

    // Tìm kiếm
    const search = page.getByRole("combobox", { name: /Tìm kiếm/i });
    if (await search.count()) {
      await search.fill("807");
      await page.waitForTimeout(300);
      ok("SEARCH-01", "Gõ tìm kiếm không crash");
      const clear = page.getByRole("button", { name: /Xóa tìm kiếm/i });
      if (await clear.count()) await clear.click();
    } else fail("SEARCH-01", "Không thấy ô tìm kiếm");

    // Lọc trạng thái
    const reception = page.getByRole("tab", { name: /HOÀN THÀNH TIẾP NHẬN/i });
    if (await reception.count()) {
      await reception.click();
      await page.waitForTimeout(200);
      ok("FILTER-01", "Lọc HOÀN THÀNH TIẾP NHẬN");
      const all = page.getByRole("tab", { name: /^Tất cả/i });
      if (await all.count()) await all.click();
    } else fail("FILTER-01", "Không thấy tab trạng thái");

    // Booking — tạo lô trống (không xóa)
    const addBtn = page.getByRole("button", { name: /^\+ Booking/ }).first();
    if (await addBtn.count()) {
      const before = await menus.count();
      await addBtn.click();
      await page.waitForTimeout(600);
      const after = await page.getByRole("button", { name: "Menu thao tác lô hàng" }).count();
      if (after >= before) ok("CRUD-01", `Thêm booking: menu ${before}→${after}`);
      else fail("CRUD-01", "Thêm booking không tăng dòng");
    } else fail("CRUD-01", "Không thấy + Booking");

    // Khách (toolbar — tránh nhầm ô Customer trên lưới)
    const khach = page.getByTitle("Danh bạ khách, hồ sơ in");
    if (await khach.count()) {
      await khach.click();
      await page.waitForTimeout(500);
      const url = page.url();
      if (/customer/i.test(url) || (await page.getByText(/Danh bạ|Short Code|khách hàng/i).count())) {
        ok("CUST-01", `Trang Khách: ${url}`);
      } else fail("CUST-01", `Không vào được trang Khách (${url})`);
      await page.goto(`${BASE}/#/`, { waitUntil: "domcontentloaded" });
    } else {
      fail("CUST-01", "Không thấy nút Danh bạ khách");
    }

    // Mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/#/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 8);
    if (!mobileOverflow) ok("RESP-01", "Mobile 375: không tràn ngang nghiêm trọng");
    else fail("RESP-01", "Mobile 375: có tràn ngang");

    await page.screenshot({ path: path.join(OUT, "mobile-375.png"), fullPage: false });

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.screenshot({ path: path.join(OUT, "desktop-1366.png"), fullPage: false });

    const serious = consoleErrors.filter(
      (t) => !/favicon|Download the React DevTools|Warning:/i.test(t)
    );
    if (serious.length === 0) ok("CONSOLE-01", "Không có console error nghiêm trọng");
    else fail("CONSOLE-01", serious.slice(0, 5).join(" | "));
  } finally {
    await browser.close();
  }

  const passed = findings.filter((f) => f.ok).length;
  const failed = findings.filter((f) => !f.ok).length;
  const report = { passed, failed, findings, consoleErrors, at: new Date().toISOString() };
  await import("node:fs/promises").then((fs) =>
    fs.writeFile(path.join(OUT, "report.json"), JSON.stringify(report, null, 2), "utf8")
  );
  console.log(`\n=== QA SMOKE ${passed} pass / ${failed} fail ===`);
  console.log(`Report: ${path.join(OUT, "report.json")}`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
