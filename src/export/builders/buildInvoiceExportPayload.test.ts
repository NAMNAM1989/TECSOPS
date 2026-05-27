import { describe, expect, it } from "vitest";
import type { Shipment } from "../../types/shipment";
import { emptyInvoiceLineItem } from "../../types/invoiceItem";
import { buildInvoiceExportPayload } from "./buildInvoiceExportPayload";

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
    pcs: 50,
    kg: 1000,
    dimWeightKg: null,
    dimLines: null,
    dimDivisor: null,
    customer: "ACME",
    customerCode: "EBB",
    status: "PENDING",
    ...over,
  }) as Shipment;

describe("buildInvoiceExportPayload", () => {
  it("payload ngắn — 1 dòng, footer target", () => {
    const payload = buildInvoiceExportPayload(base(), [], {
      items: [
        emptyInvoiceLineItem({
          description: "TEST",
          hsCode: "19059090",
          quantity: 10,
          unitPriceUsd: 1,
          kgPerUnit: 0.5,
        }),
      ],
      footerPcs: 20,
      footerKg: 400,
      declarationSeq: 1,
      totalDeclarations: 3,
    });
    expect(payload.version).toBe(1);
    expect(payload.meta.invoiceNo).toMatch(/^EBBTPE\d{6}(-\d{2})?$/);
    expect(payload.lines).toHaveLength(1);
    expect(payload.footer.cartons).toBe(20);
    expect(payload.footer.grossKg).toBe(400);
    expect(payload.cnee.lines.every((l) => !/^EMAIL:/i.test(l))).toBe(true);
  });

  it("payload dài — mô tả dài vẫn map đủ field", () => {
    const longDesc = "BÁNH ".repeat(40);
    const payload = buildInvoiceExportPayload(base(), [], {
      items: [emptyInvoiceLineItem({ description: longDesc, quantity: 1 })],
    });
    expect(payload.lines[0]?.description).toBe(longDesc);
  });

  it("payload nhiều dòng — totals khớp", () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      emptyInvoiceLineItem({
        description: `Item ${i + 1}`,
        quantity: i + 1,
        unitPriceUsd: 1,
        kgPerUnit: 0.5,
      })
    );
    const payload = buildInvoiceExportPayload(base(), [], { items });
    expect(payload.lines).toHaveLength(12);
    expect(payload.totals.totalAmountUsd).toBeGreaterThan(0);
    expect(payload.totals.totalGrossKg).toBeGreaterThan(0);
  });
});
