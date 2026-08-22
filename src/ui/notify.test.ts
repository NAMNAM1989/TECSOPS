import { afterEach, describe, expect, it, vi } from "vitest";
import {
  notify,
  notifyError,
  notifyWarning,
  registerNotifySink,
} from "./notify";

describe("notify", () => {
  afterEach(() => {
    registerNotifySink(null);
    vi.restoreAllMocks();
  });

  it("gửi vào sink đã đăng ký — không gọi window.alert", () => {
    const sink = vi.fn();
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    registerNotifySink(sink);
    notifyWarning("AWB phải đủ 11 chữ số.", "AWB");
    notifyError("Agent cloud offline", "Không Đăng Nhập TCS được");
    expect(sink).toHaveBeenCalledTimes(2);
    expect(sink).toHaveBeenNthCalledWith(1, {
      message: "AWB phải đủ 11 chữ số.",
      title: "AWB",
      tone: "warning",
    });
    expect(sink).toHaveBeenNthCalledWith(2, {
      message: "Agent cloud offline",
      title: "Không Đăng Nhập TCS được",
      tone: "danger",
    });
    expect(alert).not.toHaveBeenCalled();
  });

  it("không có sink thì console.warn — vẫn không alert", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    notify({ message: "Không tạo được file Excel.", title: "Xuất ESID", tone: "danger" });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Không tạo được file Excel.")
    );
    expect(alert).not.toHaveBeenCalled();
  });
});
