/**
 * E2E — Import Hồ sơ KH trên trang Khách (Playwright).
 * Chạy: node scripts/qa-customer-import-e2e.mjs
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

const BASE = process.env.TECSOPS_URL || "http://127.0.0.1:5173";
const OUT = path.resolve("output/qa-customer-import");
const findings = [];

function ok(id, msg) {
  findings.push({ id, ok: true, msg });
  console.log(`PASS ${id}: ${msg}`);
}
function fail(id, msg) {
  findings.push({ id, ok: false, msg });
  console.error(`FAIL ${id}: ${msg}`);
}

async function buildSampleXlsx(filePath, code = "E2ETEST") {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("HỒ SƠ KH");
  ws.addRow([
    "STT",
    "Mã KH",
    "DEST",
    "Người gửi - Họ tên",
    "Người gửi - Địa chỉ",
    "Người gửi - Email",
    "Người gửi - ĐT",
    "Người gửi - MST",
    "Người nhận - Họ tên",
    "Người nhận - Địa chỉ",
    "Người nhận - Email",
    "Người nhận - ĐT",
    "Người nhận - MST",
    "Notify Party",
    "Loại hàng",
    "Biển số xe",
    "Tên tài xế",
    "CCCD tài xế",
  ]);
  ws.addRow([
    1,
    code,
    "KUL",
    `CÔNG TY ${code} IMPORT TEST`,
    "99 Đường Kiểm Thử, Q.1, TP.HCM",
    "e2e@test.local",
    "0901111222",
    "0311223344",
    `${code} CONSIGNEE PTE`,
    "1 TEST ROAD, SINGAPORE",
    "cnee@e2e.test",
    "+65 6000 0000",
    "",
    `${code} NOTIFY PARTY`,
    "TEST GOODS",
    "51E-123.45",
    "E2E DRIVER",
    "079111222333",
  ]);
  await wb.xlsx.writeFile(filePath);
}

async function waitCustomersReady(page) {
  await page.goto(`${BASE}/#/customers`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForSelector('button:has-text("Import")', { timeout: 20000 });
  await page.waitForFunction(
    () => !document.body.textContent?.includes("Đang tải"),
    { timeout: 15000 },
  ).catch(() => {});
  await page.waitForTimeout(800);
}

async function importSample(page, xlsxPath) {
  const importBtn = page.getByTitle("Import đúng mẫu Hồ sơ KH");
  const fileInput = page.locator('input[type="file"][accept*="xlsx"]');
  await importBtn.click();
  await fileInput.setInputFiles(xlsxPath);
  await page.waitForSelector("text=Import Hồ sơ KH", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

async function inspectSaveState(page, label) {
  const saveBtn = page.getByRole("button", { name: /^Lưu$/ });
  const count = await saveBtn.count();
  const visible = count > 0 ? await saveBtn.first().isVisible() : false;
  const enabled = count > 0 ? await saveBtn.first().isEnabled() : false;
  const chuaLuu = await page.getByText("Chưa lưu").count();
  const toast = await page.locator('[role="status"], [data-sonner-toast], .toast').count();

  console.log(`  [${label}] save visible=${visible} enabled=${enabled} count=${count} chuaLuu=${chuaLuu} toast=${toast}`);

  if (visible && enabled) ok(`${label}-SAVE`, "Nút Lưu hiện và bấm được");
  else if (visible && !enabled) fail(`${label}-SAVE`, "Nút Lưu hiện nhưng bị disabled");
  else fail(`${label}-SAVE`, "Nút Lưu không hiện sau import");

  if (chuaLuu > 0) ok(`${label}-STATUS`, "Header hiện «Chưa lưu»");
  else fail(`${label}-STATUS`, "Header không hiện «Chưa lưu» sau import");

  return { visible, enabled, count, chuaLuu };
}

async function clickSave(page, label) {
  const saveBtn = page.getByRole("button", { name: /^Lưu$/ });
  if ((await saveBtn.count()) === 0 || !(await saveBtn.first().isEnabled())) {
    fail(`${label}-CLICK`, "Không bấm được Lưu");
    return false;
  }
  await saveBtn.first().click();
  await page.waitForSelector("text=Lưu thành công", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  const daLuu = await page.getByText("Đã lưu").count();
  if (daLuu > 0) ok(`${label}-CLICK`, "Lưu thành công, header «Đã lưu»");
  else fail(`${label}-CLICK`, "Bấm Lưu nhưng không thấy «Đã lưu»");
  return daLuu > 0;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const runId = Date.now().toString(36).toUpperCase();
  const desktopCode = `E2D${runId.slice(-4)}`;
  const mobileCode = `E2M${runId.slice(-4)}`;
  const desktopXlsx = path.join(OUT, `e2e-import-${desktopCode}.xlsx`);
  const mobileXlsx = path.join(OUT, `e2e-import-${mobileCode}.xlsx`);
  await buildSampleXlsx(desktopXlsx, desktopCode);
  await buildSampleXlsx(mobileXlsx, mobileCode);
  ok("SETUP-01", `Tạo file desktop=${desktopCode}, mobile=${mobileCode}`);

  const browser = await chromium.launch({ headless: true });
  const consoleErrors = [];

  try {
    // Desktop
    const desktop = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    desktop.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    desktop.on("pageerror", (e) => consoleErrors.push(String(e)));

    await waitCustomersReady(desktop);
    ok("DESKTOP-01", "Trang Khách tải được (desktop)");

    await importSample(desktop, desktopXlsx);
    await desktop.screenshot({ path: path.join(OUT, "desktop-after-import.png") });

    const desktopState = await inspectSaveState(desktop, "DESKTOP");

    const customerInList = await desktop.getByText(desktopCode).count();
    if (customerInList > 0) ok("DESKTOP-DATA", `Khách ${desktopCode} xuất hiện trong danh sách`);
    else fail("DESKTOP-DATA", `Không thấy khách ${desktopCode} sau import`);

    // Re-import same file — kiểm tra dirty vẫn bật hoặc ít nhất Lưu vẫn hoạt động
    await importSample(desktop, desktopXlsx);
    await inspectSaveState(desktop, "DESKTOP-REIMPORT");

    // Lưu rồi import lại cùng file — dirty thường false
    if (await clickSave(desktop, "DESKTOP-SAVE-FLOW")) {
      await importSample(desktop, desktopXlsx);
      const saveBtn = desktop.getByRole("button", { name: /^Lưu$/ });
      const count = await saveBtn.count();
      const visible = count > 0 ? await saveBtn.first().isVisible() : false;
      const enabled = count > 0 ? await saveBtn.first().isEnabled() : false;
      const chuaLuu = await desktop.getByText("Chưa lưu").count();
      console.log(
        `  [DESKTOP-AFTER-SAVE-REIMPORT] save visible=${visible} enabled=${enabled} chuaLuu=${chuaLuu}`,
      );
      if (!enabled && chuaLuu === 0) {
        ok(
          "DESKTOP-AFTER-SAVE-REIMPORT",
          "Import lại file đã lưu: không dirty (Lưu disabled) — toast vẫn báo cập nhật nhưng không cần lưu",
        );
        const toastText = await desktop.locator("text=Bấm Lưu để ghi lên server").count();
        const noChangeToast = await desktop.locator("text=Không có thay đổi cần lưu").count();
        if (toastText > 0 && !enabled) {
          fail(
            "DESKTOP-TOAST-MISMATCH",
            "BUG: Toast vẫn bảo «Bấm Lưu» dù không có thay đổi cần lưu",
          );
        } else if (noChangeToast > 0 || (!enabled && chuaLuu === 0)) {
          ok("DESKTOP-TOAST-MISMATCH", "Toast/import đúng khi re-import không đổi dữ liệu");
        } else {
          ok("DESKTOP-TOAST-MISMATCH", "Toast khớp trạng thái Lưu");
        }
      } else if (!enabled && chuaLuu > 0) {
        fail(
          "DESKTOP-AFTER-SAVE-REIMPORT",
          "BUG: Header «Chưa lưu» nhưng Lưu disabled sau import lại",
        );
      } else if (enabled) {
        ok(
          "DESKTOP-AFTER-SAVE-REIMPORT",
          "Import lại vẫn bật Lưu (có thay đổi hoặc pendingImportSave)",
        );
      }
      await desktop.screenshot({
        path: path.join(OUT, "desktop-after-save-reimport.png"),
      });
    }

    await desktop.close();

    // Mobile list view
    const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
    mobile.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    mobile.on("pageerror", (e) => consoleErrors.push(String(e)));

    await waitCustomersReady(mobile);
    ok("MOBILE-01", "Trang Khách tải được (mobile)");

    await importSample(mobile, mobileXlsx);
    await mobile.screenshot({ path: path.join(OUT, "mobile-detail-after-import.png") });
    await inspectSaveState(mobile, "MOBILE-DETAIL");

    const backBtn = mobile.getByRole("button", { name: "← Danh sách" });
    if (await backBtn.count()) {
      await backBtn.click();
      await mobile.waitForTimeout(400);
      await mobile.screenshot({ path: path.join(OUT, "mobile-back-to-list.png") });
      const backState = await inspectSaveState(mobile, "MOBILE-AFTER-BACK");
      if (!backState.visible && backState.chuaLuu > 0) {
        fail(
          "MOBILE-BUG-LIST",
          "BUG tái hiện: quay về danh sách mobile — «Chưa lưu» nhưng không có nút Lưu",
        );
      } else if (backState.visible && backState.enabled) {
        ok("MOBILE-BUG-LIST", "Danh sách mobile vẫn có nút Lưu khi chưa lưu");
      }
    }

    await mobile.close();

    const serious = consoleErrors.filter(
      (t) => !/favicon|Download the React DevTools|Warning:/i.test(t),
    );
    if (serious.length === 0) ok("CONSOLE-01", "Không có console error nghiêm trọng");
    else fail("CONSOLE-01", serious.slice(0, 5).join(" | "));
  } finally {
    await browser.close();
  }

  const passed = findings.filter((f) => f.ok).length;
  const failed = findings.filter((f) => !f.ok).length;
  const report = { passed, failed, findings, at: new Date().toISOString() };
  await writeFile(path.join(OUT, "report.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(`\n=== QA CUSTOMER IMPORT ${passed} pass / ${failed} fail ===`);
  console.log(`Report: ${path.join(OUT, "report.json")}`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
