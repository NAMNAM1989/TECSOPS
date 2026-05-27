import { describe, expect, it } from "vitest";
import {
  mawbDigits,
  pickEcargoModalSaveLabel,
  rowTextContainsMawb,
  scoreEcargoModalSaveLabel,
  splitEcargoFlight,
} from "./ecargoAwbModalCore.mjs";

describe("ecargoAwbModalCore", () => {
  it("splitEcargoFlight tách SQ185", () => {
    expect(splitEcargoFlight("SQ185")).toEqual({ carrier: "SQ", flightNo: "185" });
  });

  it("splitEcargoFlight tách VJ085", () => {
    expect(splitEcargoFlight("VJ085")).toEqual({ carrier: "VJ", flightNo: "085" });
  });

  it("pickEcargoModalSaveLabel ưu tiên Lưu hơn Hủy", () => {
    expect(pickEcargoModalSaveLabel(["Hủy", "Lưu"])).toBe("Lưu");
    expect(pickEcargoModalSaveLabel(["Đóng", "Xác nhận"])).toBe("Xác nhận");
    expect(scoreEcargoModalSaveLabel("Thêm AWB")).toBeLessThan(scoreEcargoModalSaveLabel("Lưu"));
  });

  it("pickEcargoModalSaveLabel chọn Save & Close thay vì Thêm House", () => {
    expect(pickEcargoModalSaveLabel(["Thêm House", "Save & Close", "Close"])).toBe("Save & Close");
    expect(scoreEcargoModalSaveLabel("Save & Close")).toBeGreaterThan(scoreEcargoModalSaveLabel("Thêm House"));
    expect(scoreEcargoModalSaveLabel("Close")).toBeLessThan(0);
  });

  it("rowTextContainsMawb khớp MAWB trong dòng bảng", () => {
    expect(rowTextContainsMawb("SQ185 618-54405131 184 CTNS", "618-5440 5131")).toBe(true);
    expect(rowTextContainsMawb("SQ185 999-00001111", "618-54405131")).toBe(false);
    expect(mawbDigits("618-5440 5131")).toBe("61854405131");
  });
});
