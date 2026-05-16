import { describe, expect, it } from "vitest";
import {
  applyMeasuredErrorToOffset,
  mergeCalibrationCorrection,
  suggestScaleFromSizeMeasurement,
} from "./calibrationMath";

describe("applyMeasuredErrorToOffset", () => {
  it("trừ sai lệch để bù vị trí in", () => {
    expect(
      applyMeasuredErrorToOffset({ offsetXmm: 0, offsetYmm: 0 }, { errorXmm: 2, errorYmm: -1 })
    ).toEqual({ offsetXmm: -2, offsetYmm: 1 });
  });
});

describe("suggestScaleFromSizeMeasurement", () => {
  it("điều chỉnh scaleX khi chiều ngang co", () => {
    const out = suggestScaleFromSizeMeasurement(
      { measuredWidthMm: 98, expectedWidthMm: 100 },
      { scaleX: 1, scaleY: 1 }
    );
    expect(out.scaleX).toBeCloseTo(1 / 0.98, 4);
    expect(out.scaleY).toBe(1);
  });
});

describe("mergeCalibrationCorrection", () => {
  it("gộp offset và scale", () => {
    const out = mergeCalibrationCorrection(
      { offsetXmm: 0, offsetYmm: 0, scaleX: 1, scaleY: 1 },
      {
        errorXmm: 1,
        errorYmm: 0,
        measuredHeightMm: 99,
        expectedHeightMm: 100,
      }
    );
    expect(out.offsetXmm).toBe(-1);
    expect(out.scaleY).toBeCloseTo(1 / 0.99, 4);
  });
});
