import {
  applySmartDimAutoFill,
  consolidateDimPieceLines,
  DIM_LOT_LINE_COUNT_MAX,
  DIM_LOT_LINE_COUNT_MIN,
  DIM_LOT_LINE_COUNT_PCS_THRESHOLD,
  dimRandomSeed,
  normalizeDimLineEdges,
  previewSmartDimFill,
  splitMeasuredAndEstimated,
} from "./dimBulkFill";
import type { DimDivisor, DimPieceLine, ScscDimRoundContext } from "./volumetricDim";
import {
  totalDimKgFromLines,
  tryParseDimPieceLinesFromComboText,
} from "./volumetricDim";

/** Ngữ cảnh lô hàng khi nhập DIM. */
export type DimEntryLotContext = {
  shipmentId: string;
  declaredPcs: number | null;
  declaredKg: number | null;
};

export type DimEntryWorkflowStep = 1 | 2 | 3;

export type DimEntrySnapshot = {
  measured: DimPieceLine[];
  estimated: DimPieceLine[];
  measuredLineCount: number;
  estimatedLineCount: number;
  lineCount: number;
  sumMeasuredPcs: number;
  sumEstimatedPcs: number;
  sumDimPcs: number;
  remainingPcs: number;
  totalDim: number | null;
  floorKg: number;
  ceilingKg: number;
  canRandomFill: boolean;
  pcsExcess: boolean;
  pcsShort: boolean;
  pcsMatch: boolean;
  /** Tổng DIM < kg lô (mục tiêu chargeable). */
  dimBelowGross: boolean | null;
  workflowStep: DimEntryWorkflowStep;
  targetLineCount: { min: number; max: number } | null;
};

export type DimEntryMutation =
  | { ok: true; lines: DimPieceLine[]; note?: string }
  | { ok: false; error: string };

export function dimEntrySeed(lot: DimEntryLotContext): number {
  return dimRandomSeed(lot.shipmentId, lot.declaredPcs ?? 0, lot.declaredKg ?? 0);
}

export function snapshotDimEntry(
  lines: DimPieceLine[],
  lot: DimEntryLotContext,
  divisor: DimDivisor,
  dimCtx: ScscDimRoundContext
): DimEntrySnapshot {
  const { measured, estimated } = splitMeasuredAndEstimated(lines);
  const sumMeasuredPcs = measured.reduce((s, l) => s + l.pcs, 0);
  const sumEstimatedPcs = estimated.reduce((s, l) => s + l.pcs, 0);
  const sumDimPcs = sumMeasuredPcs + sumEstimatedPcs;
  const preview = previewSmartDimFill(lines, lot.declaredPcs, lot.declaredKg);
  const totalDim = totalDimKgFromLines(lines, divisor, dimCtx);

  const pcsExcess =
    lot.declaredPcs != null && lines.length > 0 && sumDimPcs > lot.declaredPcs;
  const pcsShort =
    lot.declaredPcs != null && lines.length > 0 && sumDimPcs < lot.declaredPcs;
  const pcsMatch =
    lot.declaredPcs != null && lines.length > 0 && sumDimPcs === lot.declaredPcs;

  const remainingPcs =
    lot.declaredPcs != null && lines.length > 0
      ? Math.max(0, lot.declaredPcs - sumDimPcs)
      : preview.remainingPcs;

  let dimBelowGross: boolean | null = null;
  if (totalDim != null && lot.declaredKg != null && lot.declaredKg > 0) {
    dimBelowGross = totalDim < lot.declaredKg;
  }

  let workflowStep: DimEntryWorkflowStep = 1;
  if (measured.length === 0) {
    workflowStep = 1;
  } else if (remainingPcs > 0) {
    workflowStep = 2;
  } else {
    workflowStep = 3;
  }

  const targetLineCount =
    lot.declaredPcs != null && lot.declaredPcs >= DIM_LOT_LINE_COUNT_PCS_THRESHOLD
      ? { min: DIM_LOT_LINE_COUNT_MIN, max: DIM_LOT_LINE_COUNT_MAX }
      : null;

  return {
    measured,
    estimated,
    measuredLineCount: measured.length,
    estimatedLineCount: estimated.length,
    lineCount: lines.length,
    sumMeasuredPcs,
    sumEstimatedPcs,
    sumDimPcs,
    remainingPcs,
    totalDim,
    floorKg: preview.floorKg,
    ceilingKg: preview.ceilingKg,
    canRandomFill:
      preview.canAutoFill &&
      lot.declaredKg != null &&
      lot.declaredKg > 0 &&
      measured.length > 0 &&
      remainingPcs > 0,
    pcsExcess,
    pcsShort,
    pcsMatch,
    dimBelowGross,
    workflowStep,
    targetLineCount,
  };
}

/** Thêm dòng đo từ combo — xóa ước tính cũ (mẫu đo đổi → phải sinh lại). */
export function dimEntryAddMeasuredFromCombo(
  lines: DimPieceLine[],
  comboRaw: string,
  lot: DimEntryLotContext,
  opts?: { thenRandomFill?: boolean; randomFillParams?: DimRandomFillParams }
): DimEntryMutation {
  const parsedResult = tryParseDimPieceLinesFromComboText(comboRaw);
  if (!parsedResult.ok) return parsedResult;

  const parsed = parsedResult.lines.map((l) =>
    normalizeDimLineEdges({ ...l, estimated: false as const })
  );
  const addPcs = parsed.reduce((s, l) => s + l.pcs, 0);
  const nextMeasuredPcs =
    splitMeasuredAndEstimated(lines).measured.reduce((s, l) => s + l.pcs, 0) + addPcs;

  if (lot.declaredPcs != null && nextMeasuredPcs > lot.declaredPcs) {
    return {
      ok: false,
      error: `Dư kiện đo: tổng kiện đo (${nextMeasuredPcs}) vượt kiện lô (${lot.declaredPcs}).`,
    };
  }

  const measuredOnly = [
    ...splitMeasuredAndEstimated(lines).measured,
    ...parsed,
  ];

  if (opts?.thenRandomFill && opts.randomFillParams) {
    const fill = dimEntryRandomFill(measuredOnly, lot, opts.randomFillParams);
    if (!fill.ok) return fill;
    return { ok: true, lines: fill.lines, note: fill.note };
  }

  return {
    ok: true,
    lines: measuredOnly,
    note:
      splitMeasuredAndEstimated(lines).estimated.length > 0
        ? "Đã xóa kiện ước tính cũ — bấm Ngẫu nhiên để sinh lại."
        : undefined,
  };
}

export type DimRandomFillParams = {
  declaredPcs: number;
  declaredKg: number;
  divisor: DimDivisor;
  dimCtx: ScscDimRoundContext;
  seed: number;
  /** Tăng mỗi lần bấm Ngẫu nhiên để đổi phân bổ kiện. */
  regenerationNonce?: number;
  /** Số dòng ước tính (tùy chọn). */
  targetEstimatedLineCount?: number;
  /** Tổng DIM mục tiêu kg (đo + ước tính). */
  targetTotalDimKg?: number;
};

export function dimEntryRandomFill(
  lines: DimPieceLine[],
  lot: DimEntryLotContext,
  params: DimRandomFillParams
): DimEntryMutation {
  if (lot.declaredPcs == null || lot.declaredKg == null || lot.declaredKg <= 0) {
    return { ok: false, error: "Cần kiện lô và kg lô trên lô hàng." };
  }
  const measured = consolidateDimPieceLines(splitMeasuredAndEstimated(lines).measured);
  if (measured.length === 0) {
    return { ok: false, error: "Cần ít nhất một mẫu kiện đo trước khi sinh ngẫu nhiên." };
  }

  const { lines: next, error } = applySmartDimAutoFill(measured, {
    declaredPcs: params.declaredPcs,
    declaredKg: params.declaredKg,
    divisor: params.divisor,
    dimCtx: params.dimCtx,
    seed: params.seed,
    poolId: "smart",
    enabled: true,
    regenerationNonce: params.regenerationNonce,
    targetEstimatedLineCount: params.targetEstimatedLineCount,
    targetTotalDimKg: params.targetTotalDimKg,
  });

  if (error) return { ok: false, error };
  const totalDim = totalDimKgFromLines(next, params.divisor, params.dimCtx);
  const note =
    params.targetTotalDimKg != null && totalDim != null
      ? `Tổng DIM ${totalDim.toFixed(1)} kg (mục tiêu ${params.targetTotalDimKg} kg).`
      : undefined;
  return { ok: true, lines: next, note };
}

export function dimEntryMergeLines(lines: DimPieceLine[]): DimEntryMutation {
  if (lines.length < 2) {
    return { ok: false, error: "Cần ít nhất 2 dòng để gộp." };
  }
  return { ok: true, lines: consolidateDimPieceLines(lines) };
}

export function dimEntryClearEstimated(lines: DimPieceLine[]): DimPieceLine[] {
  return consolidateDimPieceLines(splitMeasuredAndEstimated(lines).measured);
}

export function dimEntryRemoveLine(lines: DimPieceLine[], index: number): DimPieceLine[] {
  return lines.filter((_, i) => i !== index);
}

export function dimEntryValidateSave(
  lines: DimPieceLine[],
  lot: DimEntryLotContext,
  divisor: DimDivisor,
  dimCtx: ScscDimRoundContext
): DimEntryMutation {
  const snap = snapshotDimEntry(lines, lot, divisor, dimCtx);
  if (lines.length === 0 || snap.totalDim == null) {
    return { ok: false, error: "Thêm ít nhất một dòng D×R×C×kiện." };
  }
  if (snap.pcsExcess) {
    return {
      ok: false,
      error: `Dư kiện: tổng kiện DIM (${snap.sumDimPcs}) lớn hơn kiện lô (${lot.declaredPcs}).`,
    };
  }
  if (snap.dimBelowGross === false) {
    return {
      ok: false,
      error: `Tổng DIM (${snap.totalDim.toFixed(1)} kg) không nhỏ hơn kg lô (${lot.declaredKg} kg). Bấm Sinh lại hoặc chỉnh dòng.`,
    };
  }
  return { ok: true, lines: consolidateDimPieceLines(lines) };
}

/** Chuẩn hóa ô nhập combo DIM (giữ nguyên xuống dòng khi dán Excel). */
export function normalizeDimComboInput(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/,/g, "×")
    .replace(/\u060C/g, "×")
    .replace(/\*/g, "×")
    .replace(/[xX](?=\d)/g, "×")
    .replace(/(?<=\d)[xX]/g, "×");
}

export function parseTargetDimKgInput(raw: string): number | undefined {
  const s = raw.trim();
  if (s === "") return undefined;
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n * 10) / 10;
}

export function parseRandomLineCountInput(raw: string): number | undefined {
  const s = raw.trim();
  if (s === "") return undefined;
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}

export function appendDimComboNumber(combo: string, num: string): string {
  const c = combo.trim();
  if (!c) return num;
  const last = c.slice(-1);
  if (last === "×") return c + num;
  if (/\d/.test(last)) return `${c}×${num}`;
  return `${c}${num}`;
}
