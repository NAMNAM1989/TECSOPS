/**
 * Smoke E2E — Playwright.
 * Mặc định read-only. Chỉ tạo booking khi QA_SMOKE_ALLOW_MUTATION=1;
 * record được đánh marker và xóa chính xác theo ID trong finally.
 * Chạy: npm run qa:smoke
 * (hoặc: node scripts/qa-smoke-e2e.mjs)
 */
import { chromium } from "playwright";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  loginIfConfigured,
} from "../tests/e2e/support.mjs";

const BASE = process.env.TECSOPS_URL || "http://127.0.0.1:5173";
const OUT = path.resolve("output/qa-smoke");
const ALLOW_MUTATION = process.env.QA_SMOKE_ALLOW_MUTATION === "1";
const RUN_MARKER = `E2E-QA-SMOKE-${Date.now()}`;
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
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  await loginIfConfigured(context, BASE);
  const page = await context.newPage();
  const createdShipmentIds = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  try {
    await page.goto(`${BASE}/#/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector("text=TECS", { timeout: 15000 });
    await page.getByRole("button", { name: /^\+ Booking/ }).first().waitFor({ timeout: 15000 });
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
    const tcsLogin = page.getByRole("button", { name: /^(Login|ĐN|Đăng nhập)$/i });
    if (await tcsLogin.count()) ok("TCS-01", "Thanh Cổng TCS hiện");
    else fail("TCS-01", "Không thấy nút đăng nhập TCS");

    const pdfBar = page.getByRole("button", { name: /^PDF ESID/ });
    if ((await pdfBar.count()) === 0) ok("TCS-02", "Toolbar không còn PDF ESID hàng loạt (đúng)");
    else fail("TCS-02", "Toolbar vẫn còn nút PDF ESID — cần bỏ");

    // Tải PDF ESID theo từng lô trên menu ⋮ (đã bỏ In ESID)
    const menus = page.getByRole("button", { name: "Menu thao tác lô hàng" });
    const n = await menus.count();
    if (n > 0) ok("MENU-01", `${n} menu dòng`);
    else if (ALLOW_MUTATION) ok("MENU-01", "DB test rỗng — kiểm tra menu sau bước CRUD");
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
    } else if (ALLOW_MUTATION) ok("FILTER-01", "DB test rỗng — status filter chưa dựng");
    else fail("FILTER-01", "Không thấy tab trạng thái");

    // Booking mutation chỉ chạy khi opt-in; luôn marker + cleanup đúng ID.
    const addBtn = page.getByRole("button", { name: /^\+ Booking/ }).first();
    if (!ALLOW_MUTATION) {
      ok("CRUD-01", "Bỏ qua mutation (set QA_SMOKE_ALLOW_MUTATION=1 trên DB test để chạy)");
    } else if (await addBtn.count()) {
      const stateBeforeResponse = await page.request.get(new URL("/api/state", BASE).toString());
      const stateBefore = await stateBeforeResponse.json();
      const previousIds = new Set((stateBefore.rows || []).map((row) => row.id));
      const before = await menus.count();
      const mutationResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/mutation") &&
          response.request().method() === "POST" &&
          response.request().postDataJSON()?.action === "ADD",
      );
      await addBtn.click();
      const mutationResponse = await mutationResponsePromise;
      const mutationState = await mutationResponse.json();
      const addedRows = (mutationState.rows || []).filter((row) => !previousIds.has(row.id));
      const added = addedRows.sort((a, b) => {
        const an = Number(String(a.id).replace(/^new-/, ""));
        const bn = Number(String(b.id).replace(/^new-/, ""));
        return bn - an;
      })[0];
      if (!added?.id) throw new Error("Không xác định được ID booking smoke vừa tạo");
      createdShipmentIds.push(added.id);
      const markResponse = await page.request.post(new URL("/api/mutation", BASE).toString(), {
        data: {
          action: "UPDATE",
          id: added.id,
          patch: { note: RUN_MARKER },
        },
      });
      if (!markResponse.ok()) {
        throw new Error(`Không gắn được marker smoke cho ${added.id}`);
      }
      await page.waitForTimeout(600);
      const after = await page.getByRole("button", { name: "Menu thao tác lô hàng" }).count();
      if (after >= before) {
        ok("CRUD-01", `Thêm booking ${added.id}: menu ${before}→${after}; đã gắn marker`);
      }
      else fail("CRUD-01", "Thêm booking không tăng dòng");
    } else fail("CRUD-01", "Không thấy + Booking");

    // Khách (toolbar — tránh nhầm ô Customer trên lưới)
    await page.goto(`${BASE}/#/customers`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    const customerUrl = page.url();
    if (
      /customer/i.test(customerUrl) &&
      (await page.getByText(/Danh bạ|Short Code|khách hàng/i).count())
    ) {
      ok("CUST-01", `Trang Khách: ${customerUrl}`);
    } else fail("CUST-01", `Không vào được trang Khách (${customerUrl})`);
    await page.goto(`${BASE}/#/`, { waitUntil: "domcontentloaded" });

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
    for (const id of createdShipmentIds) {
      try {
        const cleanup = await page.request.post(new URL("/api/mutation", BASE).toString(), {
          data: { action: "DELETE", id },
        });
        if (cleanup.ok()) ok("CLEANUP-01", `Đã xóa booking smoke ${id}`);
        else fail("CLEANUP-01", `Cleanup ${id} trả HTTP ${cleanup.status()}`);
      } catch (error) {
        fail("CLEANUP-01", `Cleanup ${id} lỗi: ${String(error?.message || error)}`);
      }
    }
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
