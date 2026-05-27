import { describe, expect, it } from "vitest";
import { formatEcargoJobErrorMessage } from "./formatEcargoJobErrorMessage";

describe("formatEcargoJobErrorMessage", () => {
  it("rút gọn lỗi cut-off eCargo", () => {
    const raw =
      "Modal AWB không đóng — Thời gian hàng vào phải trước thời gian cut-off · (*) · (*)";
    expect(formatEcargoJobErrorMessage(raw)).toMatch(/khung giờ vào kho|cutoff/i);
  });

  it("map lỗi không lưu AWB", () => {
    expect(formatEcargoJobErrorMessage("Modal AWB không đóng sau khi bấm lưu")).toMatch(
      /Không lưu được AWB|đăng ký lại/i
    );
  });

  it("map thiếu Chromium Playwright", () => {
    expect(formatEcargoJobErrorMessage("Executable doesn't exist at ...")).toMatch(/playwright install/i);
  });
});
