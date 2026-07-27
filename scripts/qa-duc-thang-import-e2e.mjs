/**
 * E2E — Import khách Đức Thắng (DTE): kiểm tra tab Dữ liệu mặc định.
 * Chạy: node scripts/qa-duc-thang-import-e2e.mjs
 */
import { chromium } from "playwright";
import ExcelJS from "exceljs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.TECSOPS_URL || "http://127.0.0.1:5173";
const API = process.env.TECSOPS_API || "http://127.0.0.1:3001";
const OUT = path.resolve("output/qa-duc-thang-import");

const DTE_CUSTOMER = {
  id: "92863c46-a931-43cd-9726-c0fc55894278",
  code: "DTE",
  name: "ĐỨC THẮNG EXPRESS",
  shortCode: "ĐỨC THẮNG",
  customerType: "DIRECT_SHIPPER",
  savedShippers: [
    {
      id: "5c70bfef-2ceb-4b6e-8a8a-3c6c9362e3b1",
      label: "",
      shipperName: "ĐỨC THẮNG EXPRESS",
      shipperAddress: "",
      shipperPhone: "",
      shipperEmail: "",
      taxCode: "",
    },
  ],
  savedConsignees: [],
  savedGoods: [],
  savedVehicles: [],
  defaultShipperId: "5c70bfef-2ceb-4b6e-8a8a-3c6c9362e3b1",
};

const findings = [];
function ok(id, msg) {
  findings.push({ id, ok: true, msg });
  console.log(`PASS ${id}: ${msg}`);
}
function fail(id, msg) {
  findings.push({ id, ok: false, msg });
  console.error(`FAIL ${id}: ${msg}`);
}

async function seedDteCustomer() {
  const stateRes = await fetch(`${API}/api/state`);
  const state = await stateRes.json();
  const others = (state.customers ?? []).filter((c) => c.code !== "DTE" && c.code !== "ĐỨCTHẮNG");
  const res = await fetch(`${API}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "SET_CUSTOMERS",
      customers: [DTE_CUSTOMER, ...others],
    }),
  });
  if (!res.ok) throw new Error(`seed failed: ${res.status} ${await res.text()}`);
}

async function buildXlsx(filePath, code, rowData) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("HỒ SƠ KH");
  ws.addRow([
    "STT", "Mã KH", "DEST",
    "Người gửi - Họ tên", "Người gửi - Địa chỉ", "Người gửi - Email", "Người gửi - ĐT", "Người gửi - MST",
    "Người nhận - Họ tên", "Người nhận - Địa chỉ", "Người nhận - Email", "Người nhận - ĐT", "Người nhận - MST",
    "Notify Party", "Loại hàng", "Biển số xe", "Tên tài xế", "CCCD tài xế",
  ]);
  ws.addRow([
    1, code, "KUL",
    rowData.shipperName, rowData.shipperAddress, rowData.email, rowData.phone, rowData.tax,
    rowData.cneeName, rowData.cneeAddress, rowData.cneeEmail, rowData.cneePhone, "",
    rowData.notify, rowData.goods, rowData.plate, rowData.driver, rowData.driverId,
  ]);
  await wb.xlsx.writeFile(filePath);
}

async function importFile(page, xlsxPath) {
  await page.getByTitle("Import đúng mẫu Hồ sơ KH").click();
  await page.locator('input[type="file"][accept*="xlsx"]').setInputFiles(xlsxPath);
  await page.waitForTimeout(1500);
}

async function openDteDefaultsTab(page) {
  await page.goto(`${BASE}/#/customers`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('button:has-text("Import")', { timeout: 15000 });
  await page.waitForTimeout(600);

  const dteBtn = page.getByRole("button", { name: /ĐỨC THẮNG EXPRESS/i });
  if (await dteBtn.count()) {
    await dteBtn.first().click();
  }
  await page.waitForTimeout(400);
  await page.getByRole("tab", { name: "Dữ liệu mặc định" }).click();
  await page.waitForTimeout(400);
}

async function readDefaultsPane(page) {
  return page.locator("main").innerText();
}

async function clickDefaultsSubTab(page, name) {
  await page.getByRole("button", { name }).click();
  await page.waitForTimeout(300);
}

async function readShipperFormValues(page) {
  const main = page.locator("main");
  const address = await main.locator("textarea").first().inputValue().catch(() => "");
  const inputs = main.locator('input:not([type="search"]):not([type="file"])');
  const values = await inputs.evaluateAll((els) =>
    els.map((el) => el.value),
  );
  return { address, inputs: values.join("\n") };
}

async function selectedCustomerText(page) {
  const row = page.locator("[data-customer-id].ring-ui-primary\\/35").first();
  if (await row.count()) return row.innerText();
  const alt = page.locator("[data-customer-id].bg-ui-primary\\/10").first();
  if (await alt.count()) return alt.innerText();
  return "";
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await seedDteCustomer();
  ok("SEED", "Đã seed khách DTE vào server local");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });

  try {
    const rowData = {
      shipperName: "ĐỨC THẮNG EXPRESS",
      shipperAddress: "999 ĐƯỜNG TEST IMPORT DTE, Q.1, TP.HCM",
      email: "ducthang-import@test.vn",
      phone: "0909888777",
      tax: "0399888777",
      cneeName: "KUALA LUMPUR CONSIGNEE DTE",
      cneeAddress: "88 JALAN TEST KL",
      cneeEmail: "kl-cnee@test.my",
      cneePhone: "+60 3 9999 8888",
      notify: "NOTIFY DTE IMPORT",
      goods: "MÁY MÓC ĐIỆN TỬ DTE",
      plate: "51H-888.99",
      driver: "TÀI XẾ DTE TEST",
      driverId: "079888777666",
    };

    // --- Kịch bản 1: Mã KH đúng DTE ---
    const dteXlsx = path.join(OUT, "import-dte-code.xlsx");
    await buildXlsx(dteXlsx, "DTE", rowData);
    await openDteDefaultsTab(page);
    const before = await readDefaultsPane(page);

    await importFile(page, dteXlsx);
    await page.waitForTimeout(500);

    const selectedName = await selectedCustomerText(page);
    if (/ĐỨC THẮNG EXPRESS/i.test(selectedName)) {
      ok("DTE-FOCUS", `Sau import tự chọn đúng khách DTE`);
    } else {
      fail("DTE-FOCUS", `BUG: Sau import đang xem khách khác: «${selectedName.trim()}»`);
    }

    await page.getByRole("tab", { name: "Dữ liệu mặc định" }).click();
    await page.waitForTimeout(400);
    const shipperForm = await readShipperFormValues(page);

    if (
      shipperForm.address.includes(rowData.shipperAddress) ||
      shipperForm.inputs.includes(rowData.phone) ||
      shipperForm.inputs.includes(rowData.email)
    ) {
      ok("DTE-CODE-ADDR", "Thông tin người gửi cập nhật trong form Dữ liệu mặc định");
    } else {
      fail(
        "DTE-CODE-ADDR",
        `Không thấy dữ liệu người gửi trong input (addr=${shipperForm.address.slice(0, 40)}…)`,
      );
    }

    await clickDefaultsSubTab(page, /CNEE \(\d+\)/);
    const afterCnee = await readDefaultsPane(page);
    if (afterCnee.includes(rowData.cneeName)) {
      ok("DTE-CODE-CNEE", "CNEE mặc định hiện sau import mã DTE");
    } else {
      fail("DTE-CODE-CNEE", "Không thấy CNEE mới trong tab CNEE");
    }

    await clickDefaultsSubTab(page, /Tên hàng \(\d+\)/);
    const afterGoods = await readDefaultsPane(page);
    if (afterGoods.includes(rowData.goods)) {
      ok("DTE-CODE-GOODS", "Tên hàng mặc định hiện sau import mã DTE");
    } else {
      fail("DTE-CODE-GOODS", "Không thấy loại hàng trong tab Tên hàng");
    }

    await page.screenshot({ path: path.join(OUT, "dte-code-after-import.png"), fullPage: true });

    // Lưu và kiểm tra server
    const saveBtn = page.getByRole("button", { name: /^Lưu$/ });
    if (await saveBtn.count()) {
      await saveBtn.first().click();
      await page.waitForTimeout(1200);
    }
    const stateRes = await fetch(`${API}/api/state`);
    const state = await stateRes.json();
    const dte = (state.customers ?? []).find((c) => c.code === "DTE");
    if (dte?.savedConsignees?.[0]?.consigneeName === rowData.cneeName) {
      ok("DTE-SAVE-SERVER", "Sau Lưu: CNEE có trên server");
    } else {
      fail("DTE-SAVE-SERVER", `Sau Lưu server chưa có CNEE: ${JSON.stringify(dte?.savedConsignees)}`);
    }
    const shp = dte?.savedShippers?.find((s) => s.id === dte.defaultShipperId);
    if (shp?.shipperAddress?.includes("999") || shp?.shipperPhone === rowData.phone) {
      ok("DTE-SAVE-SHIPPER", "Sau Lưu: người gửi có trên server");
    } else {
      fail("DTE-SAVE-SHIPPER", `Sau Lưu shipper chưa cập nhật: ${JSON.stringify(shp)}`);
    }

    // --- Kịch bản 2: Mã KH «ĐỨC THẮNG» (shortCode) thay vì DTE ---
    await seedDteCustomer();
    const wrongXlsx = path.join(OUT, "import-shortcode.xlsx");
    await buildXlsx(wrongXlsx, "ĐỨC THẮNG", {
      ...rowData,
      shipperAddress: "111 ĐỊA CHỈ SHORTCODE TEST",
      cneeName: "CNEE MÃ SAI",
      goods: "HÀNG MÃ SAI",
    });
    await page.goto(`${BASE}/#/customers`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    await importFile(page, wrongXlsx);
    await page.waitForTimeout(800);

    const wrongSelected = await selectedCustomerText(page);
    if (/ĐỨC THẮNG EXPRESS/i.test(wrongSelected)) {
      ok("WRONG-CODE-FOCUS", "Import mã shortCode khớp và mở đúng DTE");
    } else {
      fail("WRONG-CODE-FOCUS", `Import shortCode không mở DTE: «${wrongSelected.trim()}»`);
    }

    await page.getByRole("tab", { name: "Dữ liệu mặc định" }).click();
    await clickDefaultsSubTab(page, /CNEE \(\d+\)/);
    const dtePaneWrong = await page.locator("main").innerText();
    await page.screenshot({ path: path.join(OUT, "dte-wrong-code-after-import.png"), fullPage: true });

    if (dtePaneWrong.includes("CNEE MÃ SAI")) {
      ok("WRONG-CODE-MERGE", "Mã «ĐỨC THẮNG» cập nhật hồ sơ DTE (shortCode)");
    } else {
      fail("WRONG-CODE-MERGE", "Mã «ĐỨC THẮNG» không gộp vào DTE");
    }

    const ghostInList = await page.getByRole("button", { name: /ĐỨCTHẮNG/i }).count();
    if (ghostInList === 0) {
      ok("WRONG-CODE-NO-GHOST", "Không tạo khách trùng khi import bằng shortCode");
    } else {
      fail("WRONG-CODE-NO-GHOST", "Vẫn tạo khách ghost khi dùng shortCode «ĐỨC THẮNG»");
    }

    await writeFile(
      path.join(OUT, "report.json"),
      JSON.stringify({ findings, beforeLen: before.length }, null, 2),
    );
  } finally {
    await browser.close();
  }

  const passed = findings.filter((f) => f.ok).length;
  const failed = findings.filter((f) => !f.ok).length;
  console.log(`\n=== QA ĐỨC THẮNG ${passed} pass / ${failed} fail ===`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
