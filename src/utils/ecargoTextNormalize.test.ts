import { describe, expect, it } from "vitest";
import {
  ensureEcargoArrivalDate,
  normalizeEcargoPersonName,
  resolveEcargoArrivalDateFromShipments,
  splitEcargoFlightDesignator,
  stripVietnameseDiacritics,
  todayLocalYmd,
  tomorrowLocalYmd,
} from "./ecargoTextNormalize";

describe("ecargoTextNormalize", () => {
  it("bỏ dấu, giữ khoảng trắng họ tên", () => {
    expect(stripVietnameseDiacritics("Nguyễn Văn Á")).toBe("Nguyen Van A");
    expect(normalizeEcargoPersonName("Nguyễn Văn Á")).toBe("NGUYEN VAN A");
    expect(normalizeEcargoPersonName("  HOANG   CAO  NHAN ")).toBe("HOANG CAO NHAN");
  });

  it("tomorrowLocalYmd tăng 1 ngày", () => {
    expect(tomorrowLocalYmd(new Date(2026, 7, 2))).toBe("2026-08-03");
  });

  it("ensureEcargoArrivalDate chỉ sửa format — giữ hôm nay / quá khứ", () => {
    const from = new Date(2026, 7, 3);
    expect(ensureEcargoArrivalDate("2026-08-03", from)).toBe("2026-08-03");
    expect(ensureEcargoArrivalDate("2026-08-02", from)).toBe("2026-08-02");
    expect(ensureEcargoArrivalDate("2026-08-05", from)).toBe("2026-08-05");
    expect(ensureEcargoArrivalDate("", from)).toBe(todayLocalYmd(from));
    expect(ensureEcargoArrivalDate("bad", from, "2026-08-03")).toBe("2026-08-03");
  });

  it("resolveEcargoArrivalDateFromShipments lấy ngày bay sớm nhất", () => {
    const r = resolveEcargoArrivalDateFromShipments([
      { flightDate: "03AUG", sessionDate: "2026-08-03", awb: "232-1" },
      { flightDate: "05AUG", sessionDate: "2026-08-03", awb: "232-2" },
    ]);
    expect(r.arrivalDate).toBe("2026-08-03");
    expect(r.warning).toMatch(/ngày sớm nhất/);
  });

  it("resolveEcargoArrivalDateFromShipments cùng ngày bay", () => {
    const r = resolveEcargoArrivalDateFromShipments([
      { flightDate: "03AUG", sessionDate: "2026-08-03", awb: "232-1" },
    ]);
    expect(r.arrivalDate).toBe("2026-08-03");
    expect(r.warning).toBeUndefined();
  });

  it("splitEcargoFlightDesignator tách carrier / số CB", () => {
    expect(splitEcargoFlightDesignator("VJ842")).toEqual({
      carrier: "VJ",
      flightNo: "842",
    });
    expect(splitEcargoFlightDesignator("VN605")).toEqual({
      carrier: "VN",
      flightNo: "605",
    });
    expect(splitEcargoFlightDesignator("5J123")).toEqual({
      carrier: "5J",
      flightNo: "123",
    });
  });
});
