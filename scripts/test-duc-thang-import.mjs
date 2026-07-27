/**
 * Kiểm tra import Hồ sơ KH cho khách Đức Thắng (DTE) — tái hiện lỗi hồ sơ mặc định.
 * Chạy: node scripts/test-duc-thang-import.mjs
 */
import ExcelJS from "exceljs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve("output/duc-thang-import-test");

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

async function buildDteImportXlsx(filePath, { code = "DTE", shipperAddress, cneeName, goods }) {
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
    "ĐỨC THẮNG EXPRESS", shipperAddress, "ducthang@test.vn", "0909123456", "0312345678",
    cneeName, "10 TEST ROAD KUALA LUMPUR", "cnee@test.my", "+60 3 1234 5678", "",
    "NOTIFY DTE TEST", goods, "51H-999.01", "NGUYỄN VĂN DTE", "079123456789",
  ]);
  await wb.xlsx.writeFile(filePath);
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const { applyFullProfileImport, parseCustomerFullProfileWorkbook } = await import(
    "../src/utils/customerFullProfileExcel.ts"
  );
  const { clampCustomerDirectoryEntry } = await import(
    "../src/utils/customerDirectoryProfile.ts"
  );

  const scenarios = [
    {
      id: "DTE-code",
      code: "DTE",
      shipperAddress: "123 ĐƯỜNG MỚI SAU IMPORT, Q.1, TP.HCM",
      cneeName: "KUALA LUMPUR CONSIGNEE LTD",
      goods: "ELECTRONICS DTE",
    },
    {
      id: "SHORTCODE-wrong",
      code: "ĐỨC THẮNG",
      shipperAddress: "456 ĐỊA CHỈ MÃ SAI (SHORT CODE)",
      cneeName: "CONSIGNEE MÃ SAI",
      goods: "HANG MA SAI",
    },
  ];

  const report = [];

  for (const sc of scenarios) {
    const xlsx = path.join(OUT, `${sc.id}.xlsx`);
    await buildDteImportXlsx(xlsx, sc);

    const buf = await readFile(xlsx);
    const parsed = await parseCustomerFullProfileWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const merged = applyFullProfileImport([structuredClone(DTE_CUSTOMER)], parsed.customers);
    const hit = merged.customers.find((c) => c.code === "DTE");
    const wrongNew = merged.customers.find((c) => c.code !== "DTE");

    const clamped = hit ? clampCustomerDirectoryEntry(hit) : null;
    const defShipper = clamped?.savedShippers?.find((s) => s.id === clamped.defaultShipperId);
    const defCnee = clamped?.savedConsignees?.find((c) => c.id === clamped.defaultConsigneeId);
    const defGoods = clamped?.savedGoods?.find((g) => g.id === clamped.defaultGoodsId);

    const entry = {
      scenario: sc.id,
      importCode: sc.code,
      created: merged.created,
      updated: merged.updated,
      consigneesAdded: merged.consigneesAdded,
      goodsAdded: merged.goodsAdded,
      matchedDte: Boolean(hit),
      createdSeparateCustomer: wrongNew?.code ?? null,
      shipperAddress: defShipper?.shipperAddress ?? "",
      accountAddress: clamped?.address ?? "",
      defaultConsignee: defCnee?.consigneeName ?? "",
      defaultGoods: defGoods?.goodsDescription ?? "",
      consigneeCount: clamped?.savedConsignees?.length ?? 0,
      goodsCount: clamped?.savedGoods?.length ?? 0,
    };
    report.push(entry);

    console.log("\n---", sc.id, "---");
    console.log(JSON.stringify(entry, null, 2));
  }

  await writeFile(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log("\nReport:", path.join(OUT, "report.json"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
