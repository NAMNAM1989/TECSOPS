import { describe, expect, it } from "vitest";
import { overridesFromEffectiveMaps } from "./airlineLabelOverridesCore";
import {
  DEFAULT_AIRLINE_BY_AWB_PREFIX,
  DEFAULT_AIRLINE_BY_FLIGHT_PREFIX,
} from "../constants/airlineLabelDefaults";

describe("overridesFromEffectiveMaps", () => {
  it("rỗng khi trùng hoàn toàn bảng mặc định", () => {
    const o = overridesFromEffectiveMaps(
      { ...DEFAULT_AIRLINE_BY_AWB_PREFIX },
      { ...DEFAULT_AIRLINE_BY_FLIGHT_PREFIX }
    );
    expect(Object.keys(o.byAwbPrefix)).toHaveLength(0);
    expect(Object.keys(o.byFlightPrefix)).toHaveLength(0);
  });

  it("chỉ lưu key đã đổi tên", () => {
    const awb = { ...DEFAULT_AIRLINE_BY_AWB_PREFIX, "978": "VIETJET CUSTOM" };
    const o = overridesFromEffectiveMaps(awb, { ...DEFAULT_AIRLINE_BY_FLIGHT_PREFIX });
    expect(o.byAwbPrefix["978"]).toBe("VIETJET CUSTOM");
    expect(Object.keys(o.byAwbPrefix)).toHaveLength(1);
  });

  it("lưu prefix chuyến mới không có trong mặc định", () => {
    const flt = { ...DEFAULT_AIRLINE_BY_FLIGHT_PREFIX, XX: "NEW AIR" };
    const o = overridesFromEffectiveMaps({ ...DEFAULT_AIRLINE_BY_AWB_PREFIX }, flt);
    expect(o.byFlightPrefix.XX).toBe("NEW AIR");
  });
});
