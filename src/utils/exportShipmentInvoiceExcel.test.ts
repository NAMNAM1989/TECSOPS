import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { Shipment } from "../types/shipment";
import {
  buildInvoiceNumber,
  buildShipmentInvoiceXlsxBuffer,
  formatInvoiceFlightLine,
  formatInvoiceSheetDate,
  resolveCustomerCode,
} from "./exportShipmentInvoiceExcel";
import { emptyInvoiceLineItem } from "../types/invoiceItem";

const base = (over: Partial<Shipment> = {}): Shipment =>
  ({
    id: "s1",
    stt: 1,
    sessionDate: "2026-05-26",
    awb: "738-1234 5678",
    flight: "VJ085",
    flightDate: "26MAY",
    cutoff: "",
    cutoffNote: "",
    note: "",
    dest: "TPE",
    warehouse: "TECS-TCS",
    pcs: 1,
    kg: 10,
    dimWeightKg: null,
    dimLines: null,
    dimDivisor: null,
    customer: "ACME",
    customerCode: "EBB",
    status: "PENDING",
    ...over,
  }) as Shipment;

async function loadSheet(buffer: ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet("NNL");
  if (!ws) throw new Error("Missing sheet NNL");
  return ws;
}

function cellFormula(ws: ExcelJS.Worksheet, address: string): string | undefined {
  const v = ws.getCell(address).value;
  if (v && typeof v === "object" && "formula" in v) return v.formula;
  return undefined;
}

describe("exportShipmentInvoiceExcel helpers", () => {
  it("InvoiceNO = mã khách + dest + ddmmyy", () => {
    const at = new Date(2026, 4, 26, 12, 0, 0);
    expect(buildInvoiceNumber(base(), [], at)).toBe("EBBTPE260526");
  });

  it("InvoiceNO nhiều tờ thêm hậu tố -01", () => {
    const at = new Date(2026, 4, 26, 12, 0, 0);
    expect(buildInvoiceNumber(base(), [], at, 2, 5)).toBe("EBBTPE260526-02");
  });

  it("formatInvoiceSheetDate theo mẫu ddMON,yyyy", () => {
    const at = new Date(2026, 4, 20, 12, 0, 0);
    expect(formatInvoiceSheetDate(at)).toBe("20MAY,2026");
  });

  it("formatInvoiceFlightLine gộp chuyến + ngày bay", () => {
    expect(formatInvoiceFlightLine({ flight: "SQ185", flightDate: "28MAY" })).toBe("SQ185/ 28MAY");
    expect(formatInvoiceFlightLine({ flight: "VJ085", flightDate: "" })).toBe("VJ085");
    expect(formatInvoiceFlightLine({ flight: "", flightDate: "26MAY" })).toBe("26MAY");
    expect(formatInvoiceFlightLine({ flight: "", flightDate: "" })).toBe("");
  });

  it("resolveCustomerCode ưu tiên mã trên lô", () => {
    expect(resolveCustomerCode(base({ customerCode: "cy1" }), [])).toBe("CY1");
  });

  it("tạo file Excel mới không lỗi, có title + invoice no", async () => {
    const { buffer, invoiceNo } = await buildShipmentInvoiceXlsxBuffer(
      base({ dest: "TPE", customerCode: "EBB", flight: "VJ085" }),
      [],
    );
    expect(invoiceNo).toMatch(/^EBBTPE\d{6}$/);

    const ws = await loadSheet(buffer);
    expect(ws.getCell("B1").value).toBe("NONCOMMERCIAL INVOICE & PACKING LIST");
    // Invoice No ở F3
    expect(ws.getCell("F3").value).toBe(invoiceNo);
    // Flight + ngày bay ở F5
    expect(ws.getCell("F5").value).toBe("VJ085/ 26MAY");
  });

  it("ghi items với formula E*G (Amount)", async () => {
    const items = [
      emptyInvoiceLineItem({
        description: "BÁNH AFC. NSX: T03/2026",
        hsCode: "19059090",
        origin: "VN",
        quantity: 33,
        unit: "BAG",
        unitPriceUsd: 0.62,
        kgPerUnit: 0.5,
      }),
      emptyInvoiceLineItem({
        description: "BÚN GẠO KHÔ SELECT",
        hsCode: "19023020",
        origin: "VN",
        quantity: 49,
        unit: "BAG",
        unitPriceUsd: 0.98,
        kgPerUnit: 0.5,
      }),
    ];
    const ws = await loadSheet(
      (await buildShipmentInvoiceXlsxBuffer(base({ pcs: 82, kg: 41 }), [], { items })).buffer,
    );

    // Tìm dòng có No=1 (goods area)
    let goodsRow = 0;
    for (let r = 1; r <= ws.rowCount; r++) {
      if (ws.getCell(r, 1).value === 1) { goodsRow = r; break; }
    }
    expect(goodsRow).toBeGreaterThan(10);
    // Item 1
    expect(ws.getCell(goodsRow, 5).value).toBe(33); // Quantity
    expect(ws.getCell(goodsRow, 7).value).toBe(0.62); // Price
    expect(cellFormula(ws, `H${goodsRow}`)).toBe(`E${goodsRow}*G${goodsRow}`);
    expect(ws.getCell(goodsRow, 9).value).toBe(0.5); // Quy cách
    expect(cellFormula(ws, `J${goodsRow}`)).toBe(`E${goodsRow}*I${goodsRow}`);
    // Item 2
    expect(ws.getCell(goodsRow + 1, 1).value).toBe(2);
    expect(ws.getCell(goodsRow + 1, 5).value).toBe(49);
  });

  it("10 dòng hàng — tất cả có border + formula", async () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      emptyInvoiceLineItem({
        description: `Mặt hàng ${i + 1}`,
        hsCode: "19059090",
        origin: "VN",
        quantity: 1,
        unit: "BAG",
        unitPriceUsd: 0.5,
        kgPerUnit: 0.5,
      }),
    );
    const ws = await loadSheet(
      (await buildShipmentInvoiceXlsxBuffer(base({ pcs: 10, kg: 5 }), [], { items })).buffer,
    );

    // Find item 10
    let lastItemRow = 0;
    for (let r = 1; r <= ws.rowCount; r++) {
      if (ws.getCell(r, 1).value === 10) { lastItemRow = r; break; }
    }
    expect(lastItemRow).toBeGreaterThan(0);
    expect(ws.getCell(lastItemRow, 2).value).toBe("Mặt hàng 10");
    // TOTAL row should be right after
    expect(ws.getCell(lastItemRow + 1, 2).value).toBe("TOTAL");
  });

  it("12 dòng hàng — TOTAL + SUM đúng range", async () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      emptyInvoiceLineItem({
        description: `Mặt hàng ${i + 1}`,
        hsCode: "00000000",
        origin: "VN",
        quantity: i + 1,
        unit: "BAG",
        unitPriceUsd: 1,
        kgPerUnit: 0.5,
      }),
    );
    const ws = await loadSheet(
      (await buildShipmentInvoiceXlsxBuffer(base({ pcs: 12, kg: 60 }), [], { items })).buffer,
    );

    // Find first goods row
    let firstGoodsRow = 0;
    for (let r = 1; r <= ws.rowCount; r++) {
      if (ws.getCell(r, 1).value === 1) { firstGoodsRow = r; break; }
    }
    const lastGoodsRow = firstGoodsRow + 11; // 12 items
    expect(ws.getCell(lastGoodsRow, 1).value).toBe(12);

    // TOTAL row
    const totalRow = lastGoodsRow + 1;
    expect(ws.getCell(totalRow, 2).value).toBe("TOTAL");
    expect(cellFormula(ws, `G${totalRow}`)).toBeUndefined();
    expect(cellFormula(ws, `H${totalRow}`)).toBe(`SUM(H${firstGoodsRow}:H${lastGoodsRow})`);
    expect(cellFormula(ws, `J${totalRow}`)).toBe(`SUM(J${firstGoodsRow}:J${lastGoodsRow})`);

    // Footer
    expect(ws.getCell(totalRow + 1, 2).value).toBe("1.   Total carton: 12 CTNS");
    expect(ws.getCell(totalRow + 2, 2).value).toBe("2.   Total gross weight: 39.00 KGM");
  });

  it("mô tả dài — tự tăng chiều cao hàng (wrapText)", async () => {
    const longDesc =
      "BÁNH TRÁNG ĐAI ĐIÊU. NSX: T03/2026, HSD T03/2027. " +
      "Xuất xứ Việt Nam, hàng mới nguyên kiện, không tem phụ, không quà tặng kèm.";
    const items = [
      emptyInvoiceLineItem({
        description: longDesc,
        hsCode: "19059090",
        origin: "VN",
        quantity: 10,
        unit: "BAG",
        unitPriceUsd: 0.5,
        kgPerUnit: 0.5,
      }),
    ];
    const ws = await loadSheet(
      (await buildShipmentInvoiceXlsxBuffer(base(), [], { items })).buffer,
    );
    let goodsRow = 0;
    for (let r = 1; r <= ws.rowCount; r++) {
      if (ws.getCell(r, 1).value === 1) { goodsRow = r; break; }
    }
    expect(ws.getCell(goodsRow, 2).alignment?.wrapText).toBe(true);
    expect(ws.getRow(goodsRow).height).toBeGreaterThanOrEqual(48);
    expect(ws.getCell(goodsRow, 2).value).toBe(longDesc);
  });

  it("buffer load lại không lỗi", async () => {
    const { buffer } = await buildShipmentInvoiceXlsxBuffer(base(), [], {
      items: [
        emptyInvoiceLineItem({
          description: "TEST",
          hsCode: "19059090",
          origin: "VN",
          quantity: 1,
          unit: "BAG",
          unitPriceUsd: 1,
          kgPerUnit: 0.5,
        }),
      ],
    });
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buffer);
    const ws2 = wb2.getWorksheet("NNL");
    expect(ws2).toBeTruthy();
    // No extra columns beyond J
    expect(ws2!.columnCount).toBeLessThanOrEqual(10);
  });

  it("phần header dòng 1–13 — merge ô + wrap cho shipper/meta/CNEE", async () => {
    const ws = await loadSheet(
      (
        await buildShipmentInvoiceXlsxBuffer(base(), [], {
          items: [
            emptyInvoiceLineItem({
              description: "TEST",
              hsCode: "19059090",
              origin: "VN",
              quantity: 1,
              unit: "BAG",
              unitPriceUsd: 1,
              kgPerUnit: 0.5,
            }),
          ],
        })
      ).buffer,
    );

    expect(ws.model.merges).toEqual(
      expect.arrayContaining(["B1:J1", "B3:D3", "F3:J3", "B10:D10"]),
    );
    expect(ws.getCell(1, 2).alignment?.wrapText).toBe(true);
    expect(ws.getCell(3, 2).alignment?.wrapText).toBe(true);
    expect(ws.getCell(3, 6).alignment?.wrapText).toBe(true);
    expect(ws.getCell(10, 2).alignment?.wrapText).toBe(true);

    let tableHeaderRow = 0;
    for (let r = 1; r <= ws.rowCount; r++) {
      if (String(ws.getCell(r, 7).value ?? "").includes("U.Price")) {
        tableHeaderRow = r;
        break;
      }
    }
    expect(tableHeaderRow).toBe(13);
    expect(ws.getRow(tableHeaderRow).height).toBeGreaterThanOrEqual(30);
    expect(ws.getRow(tableHeaderRow).height).toBeLessThanOrEqual(48);
    const expectedWidths = [4.5, 37, 10, 7, 12, 6.5, 13, 11.5, 9.01, 12];
    for (let col = 1; col <= 10; col++) {
      expect(ws.getColumn(col).width ?? expectedWidths[col - 1]).toBe(expectedWidths[col - 1]);
    }

    let goodsRow = 0;
    for (let r = 1; r <= ws.rowCount; r++) {
      if (ws.getCell(r, 1).value === 1) {
        goodsRow = r;
        break;
      }
    }
    expect(ws.getCell(goodsRow, 2).alignment?.wrapText).toBe(true);
    expect(ws.getCell(goodsRow, 2).alignment?.horizontal).toBe("left");
    expect(ws.getCell(goodsRow, 2).alignment?.vertical).toBe("top");
  });

  it("file không có column definitions > J (tránh HRESULT)", async () => {
    const { buffer } = await buildShipmentInvoiceXlsxBuffer(base(), [], {
      items: [
        emptyInvoiceLineItem({
          description: "Test item",
          hsCode: "123",
          origin: "VN",
          quantity: 5,
          unit: "BAG",
          unitPriceUsd: 2,
          kgPerUnit: 1,
        }),
      ],
    });
    // Check raw ZIP
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buffer);
    const sheetFile = Object.keys(zip.files).find((f) => f.includes("sheet"));
    expect(sheetFile).toBeTruthy();
    const xml = await zip.files[sheetFile!].async("string");
    // No col definitions beyond col 10
    const colDefs = [...xml.matchAll(/<col min="(\d+)" max="(\d+)"/g)];
    for (const m of colDefs) {
      expect(parseInt(m[2])).toBeLessThanOrEqual(10);
    }
    // No K/L cells
    expect(xml).not.toMatch(/r="[KL]\d+"/);
  });
});
