/**
 * E2E — Import file Excel thật, mở DTE, kiểm tra Dữ liệu mặc định.
 * Chạy:
 *   IMPORT_XLSX=fixtures/ho-so-khach-hang.xlsx npm run qa:real-ho-so-import
 * Hoặc copy file user vào fixtures/ho-so-khach-hang.xlsx
 */
import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.TECSOPS_URL || "http://127.0.0.1:5173";
const API = process.env.TECSOPS_API || "http://127.0.0.1:3001";
const XLSX =
  process.env.IMPORT_XLSX ||
  path.resolve("fixtures/ho-so-khach-hang.xlsx");
const OUT = path.resolve("output/qa-real-ho-so-import");

async function seedProductionCustomers() {
  const state = JSON.parse(
    await readFile(
      process.env.STATE_JSON || path.resolve("output/production-state.json"),
      "utf8",
    ),
  );
  const res = await fetch(`${API}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "SET_CUSTOMERS",
      customers: state.customers ?? [],
    }),
  });
  if (!res.ok) throw new Error(`seed: ${res.status}`);
  return (state.customers ?? []).length;
}

async function parseDteFromFile() {
  const buf = await readFile(XLSX);
  const { parseCustomerFullProfileWorkbook, applyFullProfileImport } = await import(
    "../src/utils/customerFullProfileExcel.ts"
  );
  const prod = JSON.parse(
    await readFile(path.resolve("output/production-state.json"), "utf8"),
  );
  const parsed = await parseCustomerFullProfileWorkbook(buf);
  const dteRow = parsed.customers.find((c) => c.code === "DTE");
  const merged = applyFullProfileImport(prod.customers ?? [], parsed.customers);
  const dteAfter = merged.customers.find((c) => c.code === "DTE");
  return { parsed, dteRow, merged, dteAfter };
}

async function readShipperInputs(page) {
  const main = page.locator("main");
  const address = await main.locator("textarea").first().inputValue().catch(() => "");
  const inputs = await main
    .locator('input:not([type="search"]):not([type="file"])')
    .evaluateAll((els) => els.map((el) => el.value));
  return { address, inputs: inputs.filter(Boolean) };
}

async function clickSubTab(page, pattern) {
  const btn = page.getByRole("button", { name: pattern });
  if ((await btn.count()) === 0) return false;
  await btn.first().click();
  await page.waitForTimeout(350);
  return true;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const findings = [];
  const ok = (id, msg) => {
    findings.push({ id, ok: true, msg });
    console.log(`PASS ${id}: ${msg}`);
  };
  const fail = (id, msg) => {
    findings.push({ id, ok: false, msg });
    console.error(`FAIL ${id}: ${msg}`);
  };

  console.log("File import:", XLSX);
  const n = await seedProductionCustomers();
  ok("SEED", `Seed ${n} khách production vào local`);

  const { dteRow, dteAfter, merged } = await parseDteFromFile();
  console.log("\n--- Parse file: DTE ---");
  console.log(
    JSON.stringify(
      {
        code: dteRow?.code,
        cnees: dteRow?.savedConsignees?.length ?? 0,
        goods: dteRow?.savedGoods?.length ?? 0,
        vehicles: dteRow?.savedVehicles?.length ?? 0,
        shipperAddr: dteRow?.savedShippers?.[0]?.shipperAddress ?? "",
      },
      null,
      2,
    ),
  );
  console.log("Merge: created", merged.created, "updated", merged.updated);

  if (!dteRow) {
    fail("PARSE-DTE", "File không có dòng Mã KH = DTE");
  } else if (
    (dteRow.savedConsignees?.length ?? 0) === 0 &&
    (dteRow.savedGoods?.length ?? 0) === 0 &&
    !(dteRow.savedShippers?.[0]?.shipperAddress?.trim()) &&
    !(dteRow.phone?.trim())
  ) {
    fail(
      "PARSE-DTE-EMPTY",
      "Dòng DTE trong file Excel TRỐNG (chỉ có tên) — import báo cập nhật nhưng không có gì để điền vào hồ sơ mặc định",
    );
  } else {
    ok("PARSE-DTE", "File có dữ liệu DTE để import");
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  try {
    await page.goto(`${BASE}/#/customers`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('button:has-text("Import")', { timeout: 20000 });
    await page.waitForTimeout(800);

    await page.getByTitle("Import đúng mẫu Hồ sơ KH").click();
    await page.locator('input[type="file"][accept*="xlsx"]').setInputFiles(XLSX);
    await page.waitForTimeout(2000);

    const dteList = page.getByRole("button", { name: /ĐỨC THẮNG EXPRESS/i });
    if (await dteList.count()) {
      await dteList.first().click();
    } else {
      fail("UI-DTE", "Không thấy ĐỨC THẮNG EXPRESS trong danh sách");
    }
    await page.waitForTimeout(500);

    await page.getByRole("tab", { name: "Dữ liệu mặc định" }).click();
    await page.waitForTimeout(400);

    const shipper = await readShipperInputs(page);
    await clickSubTab(page, /CNEE \(\d+\)/);
    const cneeText = await page.locator("main").innerText();
    const hasCneeTab = /CNEE \(/.test(await page.locator("main").innerText());
    await clickSubTab(page, /Tên hàng \(\d+\)/);
    const goodsText = await page.locator("main").innerText();
    await clickSubTab(page, /Xe \/ TX \(\d+\)/);
    const vehicleText = await page.locator("main").innerText();

    await page.screenshot({ path: path.join(OUT, "dte-defaults-after-import.png"), fullPage: true });

    const fileHasCnee = (dteRow?.savedConsignees?.length ?? 0) > 0;
    const fileHasGoods = (dteRow?.savedGoods?.length ?? 0) > 0;
    const fileHasShipperAddr = Boolean(dteRow?.savedShippers?.[0]?.shipperAddress?.trim());

    if (fileHasShipperAddr && !shipper.address.trim()) {
      fail("UI-SHIPPER", "File có địa chỉ người gửi nhưng UI trống");
    } else if (fileHasShipperAddr) {
      ok("UI-SHIPPER", `UI có địa chỉ: ${shipper.address.slice(0, 50)}…`);
    } else {
      ok("UI-SHIPPER", "File không có địa chỉ người gửi — UI trống (đúng)");
    }

    const cneeName = dteRow?.savedConsignees?.[0]?.consigneeName ?? "";
    if (fileHasCnee && !cneeText.includes(cneeName.slice(0, 12))) {
      fail("UI-CNEE", `File có CNEE «${cneeName}» nhưng UI không hiện`);
    } else if (fileHasCnee) {
      ok("UI-CNEE", `UI có CNEE: ${cneeName.slice(0, 40)}`);
    } else {
      ok("UI-CNEE", "Tab CNEE trống — file Excel dòng DTE không có cột người nhận điền");
    }

    const goodsName = dteRow?.savedGoods?.[0]?.goodsDescription ?? "";
    if (fileHasGoods && !goodsText.includes(goodsName.slice(0, 8))) {
      fail("UI-GOODS", `File có hàng «${goodsName}» nhưng UI không hiện`);
    } else if (fileHasGoods) {
      ok("UI-GOODS", `UI có hàng: ${goodsName.slice(0, 40)}`);
    } else {
      ok("UI-GOODS", "Tab Tên hàng trống — file Excel dòng DTE không có loại hàng");
    }

    await writeFile(
      path.join(OUT, "report.json"),
      JSON.stringify(
        {
          xlsx: XLSX,
          findings,
          fileDte: dteRow,
          ui: { shipper, cneeSnippet: cneeText.slice(0, 300), goodsSnippet: goodsText.slice(0, 300) },
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }

  const passed = findings.filter((f) => f.ok).length;
  const failed = findings.filter((f) => !f.ok).length;
  console.log(`\n=== REAL IMPORT ${passed} pass / ${failed} fail ===`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
