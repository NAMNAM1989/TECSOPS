import type { Shipment } from "../types/shipment";
import { isScscWarehouse } from "../constants/warehouses";
import type { ScscAirlineDimRule, ScscLineDimRoundKind } from "../constants/scscAirlineChargeableRules";
import {
  dimDivisorFromFlight,
  formatDimKgDisplay,
  formatLineDimKgDisplay,
  formatShipmentDimWeightKg,
  lineDimKg,
  resolveScscDimRuleFromFlight,
  totalDimKgFromLines,
  type DimDivisor,
  type ScscDimRoundContext,
} from "./volumetricDim";

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
  estimated?: boolean;
};

export type ScscDimListModel = {
  rule: ScscAirlineDimRule | null;
  dimCtx: ScscDimRoundContext;
  divisor: DimDivisor;
  rows: ScscDimListRow[];
  totalPcs: number;
  dimKgStrip: string;
};

export function buildScscDimListModel(s: Shipment): ScscDimListModel | null {
  if (!isScscWarehouse(s.warehouse)) return null;
  const lines = s.dimLines;
  if (!lines?.length) return null;

  const divisor = scscDimDivisor(s);
  const dimCtx: ScscDimRoundContext = { flight: s.flight, awb: s.awb };
  const rule = resolveScscDimRuleFromFlight(s.flight, s.awb);
  let totalPcs = 0;
  const rows: ScscDimListRow[] = lines.map((line, i) => {
    totalPcs += line.pcs;
    const dimKg = lineDimKg(line, divisor, dimCtx);
    return {
      stt: i + 1,
      lCm: round2(line.lCm),
      wCm: round2(line.wCm),
      hCm: round2(line.hCm),
      pcs: line.pcs,
      dimKg,
      ...(line.estimated ? { estimated: true } : {}),
    };
  });

  const computedTotal = totalDimKgFromLines(lines, divisor, dimCtx);
  const totalKg = computedTotal ?? s.dimWeightKg;
  const dimKgStrip =
    totalKg != null ? `${formatShipmentDimWeightKg(s.flight, totalKg, s.awb)} kg` : "—";

  return { rule, dimCtx, divisor, rows, totalPcs, dimKgStrip };
}

export function formatLineDimKgLabel(
  kg: number | null,
  ctx: ScscDimRoundContext
): string {
  if (kg == null) return "—";
  return formatLineDimKgDisplay(kg, ctx);
}

export function formatTotalDimKgLabel(
  kg: number | null,
  ctx: ScscDimRoundContext
): string {
  if (kg == null) return "—";
  return formatDimKgDisplay(kg, ctx);
}

export function scscDimListHasEstimatedRows(rows: readonly ScscDimListRow[]): boolean {
  return rows.some((r) => r.estimated);
}

export function scscDimLineNoteLabel(row: ScscDimListRow): string {
  return row.estimated ? "ƯT" : "";
}

/** Định dạng số DIM (kg) từng dòng trên Excel — theo cột «Dim CỦA MỖI DÒNG». */
export function dimKgExcelLineNumFmt(lineRound: ScscLineDimRoundKind | null | undefined): string {
  switch (lineRound) {
    case "TRUNCATE_3DP":
      return "0.000";
    case "TRUNCATE_2DP":
      return "0.00";
    case "ROUND_INTEGER":
      return "0";
    case "QR_LINE":
      return "0.0";
    default:
      return "0.000";
  }
}

/** @deprecated Dùng dimKgExcelLineNumFmt(rule.lineRound). */
export function dimKgExcelNumFmt(ctx: ScscDimRoundContext): string {
  if (typeof ctx === "object" && "lineRound" in ctx) {
    return dimKgExcelLineNumFmt(ctx.lineRound);
  }
  return "0.000";
}
