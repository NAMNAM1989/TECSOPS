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
  extractNumbersFromDimText,
} from "./volumetricDim";

/** Ngữ cảnh lô hàng khi nhập DIM. */
export type DimEntryLotContext = {
  shipmentId: string;
  declaredPcs: number | null;
  declaredKg: number | null;
  customerCode?: string | null;
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
  /** true khi tổng DIM < kg lô (chargeable theo cân); false = chargeable theo DIM. */
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
    ...lines.filter((l) => !l.estimated || l.locked),
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
      lines.filter((l) => l.estimated && !l.locked).length > 0
        ? "Đã xóa kiện ước tính chưa khóa cũ — bấm Ngẫu nhiên để sinh lại."
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
  /** Mục tiêu phần trăm kg lô (% Gross Weight). */
  targetRatioPercent?: number;
};

export function dimEntryRandomFill(
  lines: DimPieceLine[],
  lot: DimEntryLotContext,
  params: DimRandomFillParams
): DimEntryMutation {
  if (lot.declaredPcs == null || lot.declaredKg == null || lot.declaredKg <= 0) {
    return { ok: false, error: "Cần kiện lô và kg lô trên lô hàng." };
  }
  const fixed = lines.filter((l) => !l.estimated || l.locked);
  const measured = consolidateDimPieceLines(fixed);
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
    targetRatioPercent: params.targetRatioPercent,
    customerCode: lot.customerCode || undefined,
  });

  if (error) return { ok: false, error };
  const totalDim = totalDimKgFromLines(next, params.divisor, params.dimCtx);
  const note =
    totalDim != null
      ? params.targetTotalDimKg != null
        ? `Tổng DIM ${totalDim.toFixed(1)} kg (mục tiêu ${params.targetTotalDimKg} kg).`
        : params.targetRatioPercent != null
          ? `Tổng DIM ${totalDim.toFixed(1)} kg (mục tiêu ${params.targetRatioPercent}% kg lô).`
          : undefined
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
  return consolidateDimPieceLines(lines.filter((l) => !l.estimated || l.locked));
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

export function preprocessSpeechText(text: string): string {
  let s = text.toLowerCase();
  const replacements: [RegExp, string][] = [
    // Hàng chục lẻ
    [/\bhai mươi mốt\b/g, "21"],
    [/\bhai mươi lăm\b/g, "25"],
    [/\bhai mươi nhăm\b/g, "25"],
    [/\bba mươi mốt\b/g, "31"],
    [/\bba mươi lăm\b/g, "35"],
    [/\bba mươi nhăm\b/g, "35"],
    [/\bbốn mươi mốt\b/g, "41"],
    [/\bbốn mươi lăm\b/g, "45"],
    [/\bbốn mươi nhăm\b/g, "45"],
    [/\bnăm mươi mốt\b/g, "51"],
    [/\bnăm mươi lăm\b/g, "55"],
    [/\bnăm mươi nhăm\b/g, "55"],
    [/\bsáu mươi mốt\b/g, "61"],
    [/\bsáu mươi lăm\b/g, "65"],
    [/\bsáu mươi nhăm\b/g, "65"],
    [/\bbảy mươi mốt\b/g, "71"],
    [/\bbảy mươi lăm\b/g, "75"],
    [/\bbảy mươi nhăm\b/g, "75"],
    [/\btám mươi mốt\b/g, "81"],
    [/\btám mươi lăm\b/g, "85"],
    [/\btám mươi nhăm\b/g, "85"],
    [/\bchín mươi mốt\b/g, "91"],
    [/\bchín mươi lăm\b/g, "95"],
    [/\bchín mươi nhăm\b/g, "95"],

    // Có dạng số + mươi + số
    [/\bhai mươi (\d)\b/g, "2$1"],
    [/\bba mươi (\d)\b/g, "3$1"],
    [/\bbốn mươi (\d)\b/g, "4$1"],
    [/\bnăm mươi (\d)\b/g, "5$1"],
    [/\bsáu mươi (\d)\b/g, "6$1"],
    [/\bbảy mươi (\d)\b/g, "7$1"],
    [/\btám mươi (\d)\b/g, "8$1"],
    [/\bchín mươi (\d)\b/g, "9$1"],

    // Hàng chục tròn
    [/\bhai mươi\b/g, "20"],
    [/\bba mươi\b/g, "30"],
    [/\bbốn mươi\b/g, "40"],
    [/\bnăm mươi\b/g, "50"],
    [/\bsáu mươi\b/g, "60"],
    [/\bbảy mươi\b/g, "70"],
    [/\btám mươi\b/g, "80"],
    [/\bchín mươi\b/g, "90"],

    // Mười lẻ
    [/\bmười một\b/g, "11"],
    [/\bmười hai\b/g, "12"],
    [/\bmười ba\b/g, "13"],
    [/\bmười bốn\b/g, "14"],
    [/\bmười lăm\b/g, "15"],
    [/\bmười nhăm\b/g, "15"],
    [/\bmười sáu\b/g, "16"],
    [/\bmười bảy\b/g, "17"],
    [/\bmười tám\b/g, "18"],
    [/\bmười chín\b/g, "19"],

    // Số hàng chục khác
    [/\bhăm lăm\b/g, "25"],
    [/\bhăm nhăm\b/g, "25"],
    [/\bhăm mốt\b/g, "21"],
    [/\bhăm (\d)\b/g, "2$1"],

    // Số đơn lẻ và mười
    [/\bmười\b/g, "10"],
    [/\bkhông\b/g, "0"],
    [/\bmột\b/g, "1"],
    [/\bhai\b/g, "2"],
    [/\bba\b/g, "3"],
    [/\bbốn\b/g, "4"],
    [/\btư\b/g, "4"],
    [/\bnăm\b/g, "5"],
    [/\bsáu\b/g, "6"],
    [/\bbảy\b/g, "7"],
    [/\btám\b/g, "8"],
    [/\bchín\b/g, "9"],
    [/\blăm\b/g, "5"],
    [/\bnhăm\b/g, "5"],
    [/\bmốt\b/g, "1"],
    [/\bx\b/g, "×"],
    [/\bnhân\b/g, "×"],
  ];
  for (const [regex, replacement] of replacements) {
    s = s.replace(regex, replacement);
  }
  return s;
}

export function parseSpeechToDimLines(speechText: string): { ok: boolean; lines: DimPieceLine[]; error?: string } {
  const preprocessed = preprocessSpeechText(speechText);
  const nums = extractNumbersFromDimText(preprocessed);
  if (nums.length === 0) {
    return { ok: false, lines: [], error: "Không tìm thấy số kích thước nào trong giọng nói." };
  }
  
  const lines: DimPieceLine[] = [];
  let i = 0;
  while (i < nums.length) {
    const left = nums.length - i;
    if (left >= 4) {
      lines.push({
        lCm: nums[i]!,
        wCm: nums[i + 1]!,
        hCm: nums[i + 2]!,
        pcs: Math.round(nums[i + 3]!),
      });
      i += 4;
    } else if (left === 3) {
      lines.push({
        lCm: nums[i]!,
        wCm: nums[i + 1]!,
        hCm: nums[i + 2]!,
        pcs: 1,
      });
      i += 3;
    } else {
      break;
    }
  }
  
  if (lines.length === 0) {
    return { ok: false, lines: [], error: "Thiếu kích thước (cần ít nhất 3 số Dài, Rộng, Cao)." };
  }
  
  return { ok: true, lines };
}
