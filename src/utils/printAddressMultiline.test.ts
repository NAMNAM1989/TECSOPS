import { describe, expect, it } from "vitest";
import {
  normalizePrintAddressMultiline,
  resolvePrintAddressForShipment,
  splitScscShipperAddressLines,
} from "./printAddressMultiline";

describe("printAddressMultiline", () => {
  it("giữ xuống dòng, bỏ dòng trống thừa", () => {
    expect(normalizePrintAddressMultiline("  Dòng 1  \n\n  Dòng 2  ")).toBe("Dòng 1\nDòng 2");
  });

  it("tách shipper đúng 2 dòng in", () => {
    expect(splitScscShipperAddressLines("40mm line\n10mm wider line")).toEqual({
      line1: "40mm line",
      line2: "10mm wider line",
    });
  });

  it("ưu tiên danh bạ khi lô chỉ có 1 dòng cũ", () => {
    const resolved = resolvePrintAddressForShipment({
      bookingPrint: "Chi cu dong 1",
      directoryPrint: "Dong 1 danh ba\nDong 2 danh ba",
      maxLines: 2,
    });
    expect(resolved).toBe("Dong 1 danh ba\nDong 2 danh ba");
    expect(splitScscShipperAddressLines(resolved).line2).toBe("Dong 2 danh ba");
  });

  it("ưu tiên booking khi booking có Enter", () => {
    expect(
      resolvePrintAddressForShipment({
        bookingPrint: "Tren booking\nDong 2 booking",
        directoryPrint: "Danh ba\nKhac",
        maxLines: 2,
      })
    ).toBe("Tren booking\nDong 2 booking");
  });
});
