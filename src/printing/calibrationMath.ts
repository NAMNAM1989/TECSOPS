import type { CalibrationMeasurement } from "./printTypes";

export type OffsetCorrection = {
  offsetXmm: number;
  offsetYmm: number;
  scaleX: number;
  scaleY: number;
  warnings: string[];
};

/**
 * Tính offset mới từ sai lệch đo được.
 * errorXmm/errorYmm: nội dung in lệch so với vị trí mong muốn (dương = sang phải / xuống).
 * Để căn lại, áp dụng offset ngược chiều.
 */
export function applyMeasuredErrorToOffset(
  current: { offsetXmm: number; offsetYmm: number },
  measured: Pick<CalibrationMeasurement, "errorXmm" | "errorYmm">
): { offsetXmm: number; offsetYmm: number } {
  return {
    offsetXmm: roundMm(current.offsetXmm - measured.errorXmm),
    offsetYmm: roundMm(current.offsetYmm - measured.errorYmm),
  };
}

/**
 * Gợi ý scale khi kích thước in thực tế khác kỳ vọng (co/giãn đều theo trục).
 */
export function suggestScaleFromSizeMeasurement(
  measured: Pick<
    CalibrationMeasurement,
    "measuredWidthMm" | "measuredHeightMm" | "expectedWidthMm" | "expectedHeightMm"
  >,
  current: { scaleX: number; scaleY: number }
): Pick<OffsetCorrection, "scaleX" | "scaleY" | "warnings"> {
  const warnings: string[] = [];
  let scaleX = current.scaleX;
  let scaleY = current.scaleY;

  const { measuredWidthMm, measuredHeightMm, expectedWidthMm, expectedHeightMm } = measured;

  if (
    measuredWidthMm != null &&
    expectedWidthMm != null &&
    expectedWidthMm > 0 &&
    measuredWidthMm > 0
  ) {
    const ratio = measuredWidthMm / expectedWidthMm;
    if (Math.abs(ratio - 1) > 0.002) {
      scaleX = roundScale(current.scaleX / ratio);
      if (Math.abs(ratio - 1) > 0.02) {
        warnings.push(
          "Chiều ngang lệch >2% — kiểm tra Scale 100% trong hộp thoại in hoặc DPI/driver."
        );
      }
    }
  }

  if (
    measuredHeightMm != null &&
    expectedHeightMm != null &&
    expectedHeightMm > 0 &&
    measuredHeightMm > 0
  ) {
    const ratio = measuredHeightMm / expectedHeightMm;
    if (Math.abs(ratio - 1) > 0.002) {
      scaleY = roundScale(current.scaleY / ratio);
      if (Math.abs(ratio - 1) > 0.02) {
        warnings.push(
          "Chiều dọc lệch >2% — kiểm tra Fit to page, margin, hoặc kéo giấy máy in."
        );
      }
    }
  }

  return { scaleX, scaleY, warnings };
}

export function mergeCalibrationCorrection(
  current: { offsetXmm: number; offsetYmm: number; scaleX: number; scaleY: number },
  measured: CalibrationMeasurement
): OffsetCorrection {
  const offset = applyMeasuredErrorToOffset(current, measured);
  const scaled = suggestScaleFromSizeMeasurement(measured, {
    scaleX: current.scaleX,
    scaleY: current.scaleY,
  });
  return {
    ...offset,
    scaleX: scaled.scaleX,
    scaleY: scaled.scaleY,
    warnings: scaled.warnings,
  };
}

function roundMm(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundScale(n: number): number {
  return Math.round(n * 10000) / 10000;
}
