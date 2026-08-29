import type { DimPieceLine } from "../types/shipment";

function roundCm(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(1, Math.round(n));
}

function roundEstimatedCm(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 5;
  const r = Math.round(n);
  const m5 = Math.round(r / 5) * 5;
  return Math.max(5, m5);
}

/** Chuẩn hóa cạnh DIM: làm tròn, sắp l×w×h giảm dần. */
export function normalizeDimLineEdges(line: DimPieceLine): DimPieceLine {
  const roundFn = line.estimated ? roundEstimatedCm : roundCm;
  const [lCm, wCm, hCm] = [line.lCm, line.wCm, line.hCm]
    .map(roundFn)
    .sort((a, b) => b - a);
  return {
    lCm,
    wCm,
    hCm,
    pcs: line.pcs,
    ...(line.estimated ? { estimated: true } : {}),
    ...(line.locked ? { locked: true } : {}),
  };
}
