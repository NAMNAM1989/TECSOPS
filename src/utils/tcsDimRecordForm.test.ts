import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Shipment } from "../types/shipment";
import {
  buildTcsDimRecordModel,
  buildTcsDimRecordPdfBytes,
  canDownloadTcsDimRecordPdf,
  computeTcsDimRecordTableLayout,
  downloadTcsDimRecordPdf,
  TCS_DIM_RECORD_BASE_LINES,
  tcsDimRecordFilename,
  tcsDimRecordSlotCount,
} from "./tcsDimRecordForm";

function sample(over: Partial<Shipment> = {}): Shipment {
  return {
    id: "t1",
    stt: 1,
    sessionDate: "2026-08-09",
    awb: "160-12345675",
    flight: "QH201",
    flightDate: "09AUG",
    cutoff: "",
    cutoffNote: "",
    note: "",
    dest: "han",
    warehouse: "TCS",
    pcs: 5,
    kg: 100,
    dimWeightKg: null,
    dimDivisor: 6000,
    dimLines: [{ lCm: 60, wCm: 40, hCm: 30, pcs: 5 }],
    customer: "ABC Logistics",
    customerCode: "ABC",
    goodsDescriptionPrint: "GARMENTS",
    otherRequirementsPrint: "",
    status: "VOLUME_DONE",
    ...over,
  };
}

function manyLines(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    lCm: 50 + (i % 5),
    wCm: 40,
    hCm: 30,
    pcs: 1,
  }));
}

describe("canDownloadTcsDimRecordPdf", () => {
  it("family TCS + có dimLines", () => {
    expect(canDownloadTcsDimRecordPdf(sample())).toBe(true);
    expect(canDownloadTcsDimRecordPdf(sample({ warehouse: "TECS-TCS" }))).toBe(true);
    expect(canDownloadTcsDimRecordPdf(sample({ warehouse: "SCSC" }))).toBe(false);
    expect(canDownloadTcsDimRecordPdf(sample({ dimLines: null }))).toBe(false);
  });
});

describe("tcsDimRecordSlotCount / layout", () => {
  it("tối thiểu 13 ô; >13 thì lấy đúng số dòng", () => {
    expect(tcsDimRecordSlotCount(1)).toBe(TCS_DIM_RECORD_BASE_LINES);
    expect(tcsDimRecordSlotCount(13)).toBe(13);
    expect(tcsDimRecordSlotCount(20)).toBe(20);
  });

  it("co chiều cao dòng khi nhiều hơn 13 để vừa một trang", () => {
    const base = computeTcsDimRecordTableLayout(13, 200);
    const many = computeTcsDimRecordTableLayout(25, 200);
    expect(many.slotCount).toBe(25);
    expect(many.rowH).toBeLessThan(base.rowH);
    const tableH = many.headerH + many.slotCount * many.rowH + many.totalRowH;
    expect(200 + tableH + 90 + 28).toBeLessThanOrEqual(841.89 + 0.5);
  });
});

describe("tcsDimRecordFilename", () => {
  it("dim + tên khách hàng", () => {
    expect(tcsDimRecordFilename("ABC Logistics")).toBe("dimABC Logistics.pdf");
    expect(tcsDimRecordFilename("")).toBe("dimKHACH.pdf");
  });
});

describe("buildTcsDimRecordModel", () => {
  it("map meta + dòng DIM", () => {
    const m = buildTcsDimRecordModel(sample());
    expect(m).not.toBeNull();
    expect(m!.rows).toHaveLength(1);
    expect(m!.dest).toBe("HAN");
  });

  it("giữ đủ dòng khi >13", () => {
    const m = buildTcsDimRecordModel(sample({ dimLines: manyLines(18) }));
    expect(m).not.toBeNull();
    expect(m!.rows).toHaveLength(18);
    expect(m!.totalPcsLines).toBe(18);
  });

  it("null khi không phải family TCS", () => {
    expect(buildTcsDimRecordModel(sample({ warehouse: "SCSC" }))).toBeNull();
  });
});

describe("buildTcsDimRecordPdfBytes", () => {
  const assets = {
    regular: new Uint8Array(readFileSync(resolve("public/fonts/NotoSans-Regular.ttf"))),
    bold: new Uint8Array(readFileSync(resolve("public/fonts/NotoSans-Bold.ttf"))),
    logo: new Uint8Array(readFileSync(resolve("public/brand/tcs-logo.png"))),
  };

  it("tạo PDF có chữ ký %PDF + logo", async () => {
    const model = buildTcsDimRecordModel(sample())!;
    const bytes = await buildTcsDimRecordPdfBytes(model, assets);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("%PDF");
    expect(bytes.byteLength).toBeGreaterThan(assets.logo.byteLength / 2);
  });

  it("tạo PDF khi >13 dòng", async () => {
    const model = buildTcsDimRecordModel(sample({ dimLines: manyLines(22) }))!;
    expect(model.rows).toHaveLength(22);
    const bytes = await buildTcsDimRecordPdfBytes(model, assets);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("%PDF");
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});

describe("downloadTcsDimRecordPdf", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("alert khi kho không phải family TCS", async () => {
    const alert = vi.fn();
    // Suite chạy dưới environment node (đọc font file) — stub window.alert.
    vi.stubGlobal("window", { alert });
    await downloadTcsDimRecordPdf(sample({ warehouse: "SCSC" }));
    expect(alert).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
