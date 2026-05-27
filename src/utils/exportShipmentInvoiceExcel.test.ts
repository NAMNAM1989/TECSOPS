import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { Shipment } from "../types/shipment";
import {
  buildInvoiceNumber,
  buildShipmentInvoiceXlsxBuffer,
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

function lastRowFromPrintArea(ws: ExcelJS.Worksheet): number {
  const m = /:K(\d+)/i.exec(String(ws.pageSetup.printArea ?? ""));
  return m ? parseInt(m[1], 10) : 0;
}

describe("exportShipmentInvoiceExcel helpers", () => {
  it("InvoiceNO = NNL + dest + mã khách + ddmmyy", () => {
    const at = new Date(2026, 4, 26, 12, 0, 0);
    expect(buildInvoiceNumber(base(), [], at)).toBe("NNLTPEEBB260526");
  });

  it("formatInvoiceSheetDate theo mẫu ddMON,yyyy", () => {
    const at = new Date(2026, 4, 20, 12, 0, 0);
    expect(formatInvoiceSheetDate(at)).toBe("20MAY,2026");
  });

  it("resolveCustomerCode ưu tiên mã trên lô", () => {
    expect(resolveCustomerCode(base({ customerCode: "cy1" }), [])).toBe("CY1");
  });

  it("điền header, CNEE, footer — giữ khung mẫu 28 dòng", async () => {
    const { buffer, invoiceNo } = await buildShipmentInvoiceXlsxBuffer(
      base({
        dest: "TPE",
        customerCode: "EBB",
        flight: "VJ085",
        consigneeNamePrint: "DATONG INTERNATIONAL DEVELOPMENT CO., LTD.",
        consigneeAddressPrint: "TAOYUAN CITY 33051, TAIWAN (R.O.C.)",
        consigneePhonePrint: "03-383045",
      }),
      []
    );
    expect(invoiceNo).toMatch(/^NNLTPEEBB\d{6}$/);

    const ws = await loadSheet(buffer);
    expect(ws.getCell("A1").value).toBe("NONCOMMERCIAL INVOICE");
    expect(ws.getCell("G3").value).toBe(invoiceNo);
    expect(ws.getCell("G5").value).toBe("VJ085");
    expect(ws.getCell("C27").value).toBe("1 CTNS");
    expect(ws.getCell("C28").value).toBe("10 KGM");
    expect(lastRowFromPrintArea(ws)).toBe(28);
    expect(ws.pageSetup.printArea).toBe("A1:K28");
    expect(cellFormula(ws, "I16")).toBeUndefined();
    expect(ws.getRow(16).hidden).toBeFalsy();
  });

  it("ghi từng item với formula F*H và J*F", async () => {
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
      (await buildShipmentInvoiceXlsxBuffer(base({ pcs: 82, kg: 41 }), [], { items })).buffer
    );

    expect(ws.getCell("A16").value).toBe(1);
    expect(ws.getCell("A17").value).toBe(2);
    expect(ws.getCell("F16").value).toBe(33);
    expect(ws.getCell("H17").value).toBe(0.98);
    expect(cellFormula(ws, "I16")).toBe("F16*H16");
    expect(cellFormula(ws, "K17")).toBe("J17*F17");
    expect(cellFormula(ws, "G26")).toBe("SUM(G16:G17)");
    expect(ws.getCell("C27").value).toBe("82 CTNS");
    expect(ws.getCell("C28").value).toBe("41 KGM");
    expect(lastRowFromPrintArea(ws)).toBe(28);
    expect(ws.getCell("B19").value).toBeNull();
  });

  it("10 dòng hàng — kết thúc dòng 28", async () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      emptyInvoiceLineItem({
        description: `Mặt hàng ${i + 1}`,
        hsCode: "19059090",
        origin: "VN",
        quantity: 1,
        unit: "BAG",
        unitPriceUsd: 0.5,
        kgPerUnit: 0.5,
      })
    );
    const ws = await loadSheet(
      (await buildShipmentInvoiceXlsxBuffer(base({ pcs: 1, kg: 99 }), [], { items })).buffer
    );
    expect(lastRowFromPrintArea(ws)).toBe(28);
    expect(ws.pageSetup.printArea).toBe("A1:K28");
    expect(ws.getCell("A25").value).toBe(10);
    expect(ws.getRow(25).hidden).toBeFalsy();
  });

  it("7 dòng hàng — ẩn slot trống, TOTAL vẫn hàng 26", async () => {
    const items = Array.from({ length: 7 }, (_, i) =>
      emptyInvoiceLineItem({
        description: `Mặt hàng ${i + 1}`,
        hsCode: "19059090",
        origin: "VN",
        quantity: 1,
        unit: "BAG",
        unitPriceUsd: 0.5,
        kgPerUnit: 0.5,
      })
    );
    const ws = await loadSheet(
      (await buildShipmentInvoiceXlsxBuffer(base({ pcs: 1, kg: 99 }), [], { items })).buffer
    );
    expect(lastRowFromPrintArea(ws)).toBe(28);
    expect(ws.getCell("A22").value).toBe(7);
    expect(ws.getCell("A23").value).toBeNull();
    expect(ws.getCell("A26").value).toBe("TOTAL");
  });

  it("3 dòng hàng — SUM đúng vùng, footer C27/C28", async () => {
    const items = Array.from({ length: 3 }, (_, i) =>
      emptyInvoiceLineItem({
        description: `Mặt hàng ${i + 1}`,
        hsCode: "19059090",
        origin: "VN",
        quantity: i + 1,
        unit: "BAG",
        unitPriceUsd: 1,
        kgPerUnit: 0.5,
      })
    );
    const ws = await loadSheet(
      (await buildShipmentInvoiceXlsxBuffer(base({ pcs: 6, kg: 30 }), [], { items })).buffer
    );

    expect(ws.getCell("A18").value).toBe(3);
    expect(cellFormula(ws, "G26")).toBe("SUM(G16:G18)");
    expect(ws.getCell("C27").value).toBe("6 CTNS");
    expect(ws.getCell("C28").value).toBe("30 KGM");
    expect(lastRowFromPrintArea(ws)).toBe(28);
    expect(ws.pageSetup.printArea).toBe("A1:K28");
    expect(ws.getCell("A19").value).toBeFalsy();
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
      (await buildShipmentInvoiceXlsxBuffer(base(), [], { items })).buffer
    );
    expect(ws.getCell("B16").alignment?.wrapText).toBe(true);
    expect(ws.getRow(16).height).toBeGreaterThan(47.25);
    expect(ws.getCell("B16").value).toBe(longDesc);
  });

  it("buffer xuất ra load lại được (không hỏng XML/merge)", async () => {
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
    expect((ws2?.model.merges?.length ?? 0) >= 20).toBe(true);
    expect(ws2?.getCell("A16").value).toBe(1);
  });

  it("12 dòng hàng — chèn thêm 2 dòng, footer dòng 30", async () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      emptyInvoiceLineItem({
        description: `Mặt hàng ${i + 1}`,
        hsCode: "00000000",
        origin: "VN",
        quantity: i + 1,
        unit: "BAG",
        unitPriceUsd: 1,
        kgPerUnit: 0.5,
      })
    );
    const ws = await loadSheet(
      (await buildShipmentInvoiceXlsxBuffer(base({ pcs: 12, kg: 60 }), [], { items })).buffer
    );

    expect(ws.getCell("A26").value).toBe(11);
    expect(ws.getCell("A27").value).toBe(12);
    expect(cellFormula(ws, "G28")).toBe("SUM(G16:G27)");
    expect(ws.getCell("C29").value).toBe("12 CTNS");
    expect(ws.getCell("C30").value).toBe("60 KGM");
    expect(lastRowFromPrintArea(ws)).toBe(30);
    expect(ws.pageSetup.printArea).toBe("A1:K30");
  });
});
