import { describe, expect, it } from "vitest";
import {
  buildKhoScscEcargoPasteBlock,
  compactAwbDigitsForEcargoPaste,
  formatFlightForEcargoPaste,
} from "./ecargoPasteBlock";

describe("compactAwbDigitsForEcargoPaste", () => {
  it("bỏ gạch và khoảng", () => {
    expect(compactAwbDigitsForEcargoPaste("978-2556 2555")).toBe("97825562555");
  });
  it("chuỗi rỗng", () => {
    expect(compactAwbDigitsForEcargoPaste("")).toBe("");
  });
});

describe("formatFlightForEcargoPaste", () => {
  it("pad phần số tối thiểu 3 ký tự", () => {
    expect(formatFlightForEcargoPaste("VJ85")).toBe("VJ085");
    expect(formatFlightForEcargoPaste("vj85")).toBe("VJ085");
  });
  it("giữ nguyên khi đã đủ 3+ chữ số", () => {
    expect(formatFlightForEcargoPaste("VJ123")).toBe("VJ123");
    expect(formatFlightForEcargoPaste("VN0123")).toBe("VN0123");
  });
});

describe("buildKhoScscEcargoPasteBlock", () => {
  it("đủ 5 dòng eCargo + tên khách tham chiếu", () => {
    const block = buildKhoScscEcargoPasteBlock(
      {
        flight: "VJ85",
        flightDate: "10MAY",
        dest: "SYD",
        awb: "978-2556 2555",
        customerCode: "CYL",
        customer: "Công ty ABC",
      },
      " 50h17480 "
    );
    expect(block).toBe(
      ["50H17480", "VJ085", "10MAY", "SYD", "97825562555", "CYL · CÔNG TY ABC"].join("\n")
    );
  });
});
