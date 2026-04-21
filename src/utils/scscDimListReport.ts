import type { Shipment } from "../types/shipment";
import { isScscWarehouse } from "../constants/warehouses";
import {
  dimDivisorFromFlight,
  dimRoundingPolicyFromFlight,
  formatDimKgDisplay,
  formatShipmentDimWeightKg,
  lineDimKg,
  type DimDivisor,
  type DimRoundingPolicyId,
} from "./volumetricDim";

/**
 * Hệ số dùng cho LIST SCSC / in / Excel: ưu tiên giá trị đã lưu trên lô;
 * nếu chưa có (dữ liệu cũ) → suy từ mã chuyến (`dimDivisorFromFlight`).
 */
export function scscDimDivisor(s: Shipment): DimDivisor {
  if (s.dimDivisor === 5000 || s.dimDivisor === 6000) return s.dimDivisor;
  return dimDivisorFromFlight(s.flight);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type ScscDimListRow = {
  stt: number;
  lCm: number;
  wCm: number;
  hCm: number;
  pcs: number;
  dimKg: number | null;
};

export type ScscDimListModel = {
  policy: DimRoundingPolicyId;
  divisor: DimDivisor;
  rows: ScscDimListRow[];
  totalPcs: number;
  dimKgStrip: string;
};

/** Dữ liệu bảng DIM SCSC — cùng logic với modal nhập (lineDimKg + chính sách theo chuyến). */
export function buildScscDimListModel(s: Shipment): ScscDimListModel | null {
  if (!isScscWarehouse(s.warehouse)) return null;
  const lines = s.dimLines;
  if (!lines?.length) return null;

  const divisor = scscDimDivisor(s);
  const policy = dimRoundingPolicyFromFlight(s.flight);
  let totalPcs = 0;
  const rows: ScscDimListRow[] = lines.map((line, i) => {
    totalPcs += line.pcs;
    const dimKg = lineDimKg(line, divisor, policy);
    return {
      stt: i + 1,
      lCm: round2(line.lCm),
      wCm: round2(line.wCm),
      hCm: round2(line.hCm),
      pcs: line.pcs,
      dimKg,
    };
  });

  const dimKgStrip =
    s.dimWeightKg != null ? `${formatShipmentDimWeightKg(s.flight, s.dimWeightKg)} kg` : "—";

  return { policy, divisor, rows, totalPcs, dimKgStrip };
}

export function formatLineDimKgLabel(kg: number | null, policy: DimRoundingPolicyId): string {
  if (kg == null) return "—";
  return formatDimKgDisplay(kg, policy);
}

/** Định dạng số DIM (kg) trên ô Excel theo chính sách chuyến. */
export function dimKgExcelNumFmt(policy: DimRoundingPolicyId): string {
  return policy === "VJ_TRUNC3_LINE_SUM_NO_TOTAL_ROUND" ? "0.000" : "0.00";
}
