import { describe, expect, it } from "vitest";
import { tcsLoginCtaHasAbbreviation, tcsLoginCtaLabel } from "./tcsLoginCtaLabel";

describe("tcsLoginCtaLabel", () => {
  it("luôn cụm đầy đủ — không viết tắt ĐN", () => {
    expect(tcsLoginCtaLabel()).toBe("Đăng Nhập TCS");
    expect(tcsLoginCtaLabel({ retry: false })).toBe("Đăng Nhập TCS");
    expect(tcsLoginCtaLabel({ retry: true })).toBe("Thử Đăng Nhập TCS");
    expect(tcsLoginCtaHasAbbreviation(tcsLoginCtaLabel())).toBe(false);
    expect(tcsLoginCtaHasAbbreviation(tcsLoginCtaLabel({ retry: true }))).toBe(false);
  });

  it("bắt viết tắt ĐN trong copy lỗi", () => {
    expect(tcsLoginCtaHasAbbreviation("Bấm ĐN để thử lại")).toBe(true);
    expect(tcsLoginCtaHasAbbreviation("Chờ ĐN / READY")).toBe(true);
  });
});
