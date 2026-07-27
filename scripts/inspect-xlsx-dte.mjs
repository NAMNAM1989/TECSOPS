/**
 * Phân tích file Excel Hồ sơ KH — in dòng liên quan DTE / Đức Thắng.
 * Chạy: node scripts/inspect-xlsx-dte.mjs [path.xlsx]
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const xlsxPath = process.argv[2] || process.env.IMPORT_XLSX || path.resolve("fixtures/ho-so-khach-hang.xlsx");

async function main() {
  const buf = await readFile(xlsxPath);
  const { parseCustomerFullProfileWorkbook, applyFullProfileImport, findCustomerByImportCode } =
    await import("../src/utils/customerFullProfileExcel.ts");

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  console.log("\n=== FILE:", xlsxPath);
  console.log("Sheets:", wb.worksheets.map((s) => s.name).join(", "));
  const ws = wb.worksheets.find((s) => /hồ sơ|ho so/i.test(s.name)) ?? wb.worksheets[0];
  console.log("Active sheet:", ws?.name, "rows:", ws?.rowCount);

  if (ws) {
    for (let r = 1; r <= Math.min(5, ws.rowCount); r++) {
      const vals = [];
      ws.getRow(r).eachCell({ includeEmpty: false }, (c, i) => {
        vals.push(`[${i}]=${String(c.value ?? "").slice(0, 40)}`);
      });
      console.log(`Row ${r}:`, vals.join(" | "));
    }
    console.log("\n--- Rows matching DTE / Đức Thắng ---");
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const line = [];
      row.eachCell({ includeEmpty: false }, (c) => line.push(String(c.value ?? "")));
      const joined = line.join(" ").toLowerCase();
      if (/dte|đức|duc|thắng|thang/.test(joined)) {
        console.log(`Row ${r}:`, line.slice(0, 18).join(" | "));
      }
    }
  }

  const parsed = await parseCustomerFullProfileWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  console.log("\n=== PARSE RESULT ===");
  console.log("customerCount:", parsed.customerCount);
  const dteCodes = parsed.customers.filter(
    (c) => /dte|đức|thang/i.test(c.code) || /đức|thang/i.test(c.name),
  );
  for (const c of dteCodes) {
    console.log(JSON.stringify({
      code: c.code,
      name: c.name,
      address: c.address,
      phone: c.phone,
      shippers: c.savedShippers?.length,
      cnees: c.savedConsignees?.map((x) => x.consigneeName),
      goods: c.savedGoods?.map((x) => x.goodsDescription),
      vehicles: c.savedVehicles?.length,
    }, null, 2));
  }

  const prod = JSON.parse(await readFile(process.env.STATE_JSON || "output/production-state.json", "utf8"));
  const existing = prod.customers ?? [];
  const merged = applyFullProfileImport(existing, parsed.customers);
  const dte = merged.customers.find((c) => c.code === "DTE");
  console.log("\n=== AFTER MERGE INTO PRODUCTION DTE ===");
  console.log("created:", merged.created, "updated:", merged.updated);
  if (dte) {
    console.log(JSON.stringify({
      code: dte.code,
      address: dte.address,
      phone: dte.phone,
      shipper: dte.savedShippers?.[0],
      cnees: dte.savedConsignees,
      goods: dte.savedGoods,
      vehicles: dte.savedVehicles,
    }, null, 2));
  } else {
    console.log("DTE NOT FOUND after merge — check Mã KH column in file");
    for (const imp of parsed.customers) {
      const hit = findCustomerByImportCode(existing, imp.code);
      console.log(" import code", imp.code, "→", hit?.code ?? "NO MATCH");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
