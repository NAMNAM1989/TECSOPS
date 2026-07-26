import { describe, expect, it } from "vitest";
import { formatKgTotal } from "./formatKgTotal";

describe("formatKgTotal", () => {
  it("giữ phần thập phân, không làm tròn về số nguyên", () => {
    expect(formatKgTotal(36947.6)).toBe("36,947.6");
    expect(formatKgTotal(36947.65)).toBe("36,947.65");
    expect(formatKgTotal(36947.655)).toBe("36,947.655");
  });

  it("không rút gọn dạng k khi >= 10000", () => {
    expect(formatKgTotal(36947)).toBe("36,947");
    expect(formatKgTotal(10000.5)).toBe("10,000.5");
  });

  it("bỏ số 0 thập phân thừa", () => {
    expect(formatKgTotal(100)).toBe("100");
    expect(formatKgTotal(100.5)).toBe("100.5");
  });
});
