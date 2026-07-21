import type { DimDivisor, DimPieceLine, ScscDimRoundContext } from "./volumetricDim";
import { lineDimKg, totalDimKgFromLines } from "./volumetricDim";

/**
 * Tổng DIM mục tiêu: **dưới kg lô** và trong vùng ~5% phía dưới.
 * Ví dụ kg lô 1000 → tổng DIM ngẫu nhiên khoảng 950–999 kg.
 */
export const DIM_TOTAL_BAND_BELOW_RATIO = 0.05;

/** Trần tổng DIM — luôn nhỏ hơn kg lô (×0.999). */
export const DIM_TOTAL_CEILING_RATIO = 0.999;

/** Ngưỡng cạnh tối thiểu SCSC — tối đa 1 cạnh được dưới mức này. */
export const DIM_MIN_EDGE_CM = 25;

/** Cạnh dài tối đa cho kiện ước tính — danh sách in gọn (≤65 cm). */
export const DIM_MAX_LONG_EDGE_CM = 65;

/** Trần kiện / dòng ước tính — tránh 1 dòng 70+ kiện (dễ bị nghi ngờ). */
export const DIM_MAX_PCS_PER_ESTIMATED_LINE = 12;

/** Sai số chấp nhận khi khớp tổng DIM do người dùng nhập (kg). */
export const DIM_TARGET_MATCH_TOLERANCE_KG = 1;

/** Số dòng DIM mục tiêu cho lô nhiều kiện (tổng cả đo + ước tính). */
export const DIM_LOT_LINE_COUNT_MIN = 13;
export const DIM_LOT_LINE_COUNT_MAX = 17;
/** Lô từ ngưỡng này trở lên → mục tiêu 13–17 dòng. */
export const DIM_LOT_LINE_COUNT_PCS_THRESHOLD = 40;

/** @deprecated Hành vi cũ 90% tổng — chỉ test legacy. */
export const DIM_RANDOM_FILL_CAP_RATIO = 0.9;

/** @deprecated Alias cũ — dùng DIM_TOTAL_BAND_BELOW_RATIO. */
export const DIM_ESTIMATED_BUDGET_RATIO = DIM_TOTAL_BAND_BELOW_RATIO;

export type DimRandomPoolId = "light" | "medium" | "heavy" | "mix" | "smart";

type SizeTemplate = { lCm: number; wCm: number; hCm: number };

const POOL_LIGHT: SizeTemplate[] = [
  { lCm: 30, wCm: 25, hCm: 20 },
  { lCm: 35, wCm: 28, hCm: 22 },
  { lCm: 32, wCm: 30, hCm: 24 },
  { lCm: 28, wCm: 26, hCm: 25 },
];

const POOL_MICRO: SizeTemplate[] = [
  { lCm: 30, wCm: 25, hCm: 20 },
  { lCm: 28, wCm: 26, hCm: 24 },
  { lCm: 25, wCm: 25, hCm: 20 },
  { lCm: 26, wCm: 25, hCm: 25 },
];

const POOL_MEDIUM: SizeTemplate[] = [
  { lCm: 40, wCm: 35, hCm: 30 },
  { lCm: 45, wCm: 40, hCm: 32 },
  { lCm: 50, wCm: 35, hCm: 30 },
  { lCm: 42, wCm: 36, hCm: 30 },
  { lCm: 45, wCm: 38, hCm: 32 },
  { lCm: 38, wCm: 35, hCm: 28 },
];

const POOL_HEAVY: SizeTemplate[] = [
  { lCm: 50, wCm: 45, hCm: 40 },
  { lCm: 60, wCm: 50, hCm: 35 },
  { lCm: 55, wCm: 45, hCm: 38 },
];

export const DIM_RANDOM_POOLS: Record<
  Exclude<DimRandomPoolId, "smart">,
  { label: string; templates: SizeTemplate[] }
> = {
  light: { label: "Nhẹ", templates: POOL_LIGHT },
  medium: { label: "Vừa", templates: POOL_MEDIUM },
  heavy: { label: "Nặng", templates: POOL_HEAVY },
  mix: { label: "Mix", templates: [...POOL_MICRO, ...POOL_LIGHT, ...POOL_MEDIUM, ...POOL_HEAVY] },
};

function roundCm(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(1, Math.round(n));
}

/** Đếm số cạnh dưới ngưỡng (mặc định 25 cm). */
export function countEdgesBelowMin(
  line: Pick<DimPieceLine, "lCm" | "wCm" | "hCm">,
  minCm = DIM_MIN_EDGE_CM
): number {
  return [line.lCm, line.wCm, line.hCm].filter((d) => d < minCm - 1e-6).length;
}

/** Tối đa 1 cạnh dưới 25 cm — không được có 2 cạnh cùng dưới ngưỡng. */
export function satisfiesMaxOneEdgeBelowMin(
  line: Pick<DimPieceLine, "lCm" | "wCm" | "hCm">,
  minCm = DIM_MIN_EDGE_CM
): boolean {
  return countEdgesBelowMin(line, minCm) <= 1;
}

/** Nâng cạnh nhỏ lên minCm nếu vi phạm «tối đa 1 cạnh dưới 25 cm». */
export function enforceMaxOneEdgeBelowMin(
  line: SizeTemplate,
  minCm = DIM_MIN_EDGE_CM
): SizeTemplate {
  const dims = [line.lCm, line.wCm, line.hCm];
  const below = dims
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d < minCm - 1e-6);
  if (below.length <= 1) {
    return {
      lCm: roundCm(dims[0]!),
      wCm: roundCm(dims[1]!),
      hCm: roundCm(dims[2]!),
    };
  }
  below.sort((a, b) => a.d - b.d);
  const keepIndex = below[0]!.i;
  const next = [...dims];
  for (const { i } of below) {
    if (i !== keepIndex) next[i] = minCm;
  }
  return {
    lCm: roundCm(next[0]!),
    wCm: roundCm(next[1]!),
    hCm: roundCm(next[2]!),
  };
}

export function longestEdgeCm(line: Pick<DimPieceLine, "lCm" | "wCm" | "hCm">): number {
  return Math.max(line.lCm, line.wCm, line.hCm);
}

/** Thu nhỏ tỉ lệ để cạnh dài ≤ maxCm (in đẹp, tránh 117 cm). */
export function clampLongestEdgeAtMost(
  line: SizeTemplate,
  maxCm = DIM_MAX_LONG_EDGE_CM
): SizeTemplate {
  const maxEdge = longestEdgeCm(line);
  if (maxEdge <= maxCm + 1e-6) {
    return enforceMaxOneEdgeBelowMin(line);
  }
  const scale = maxCm / maxEdge;
  return enforceMaxOneEdgeBelowMin({
    lCm: roundCm(line.lCm * scale),
    wCm: roundCm(line.wCm * scale),
    hCm: roundCm(line.hCm * scale),
  });
}

/** Phóng cạnh dài lên maxCm (giữ tỉ lệ) — dùng khi mục tiêu kg cao hơn mẫu đo. */
export function scaleLongestEdgeToMax(
  line: SizeTemplate,
  maxCm = DIM_MAX_LONG_EDGE_CM
): SizeTemplate {
  const maxEdge = longestEdgeCm(line);
  if (maxEdge <= 0 || maxEdge >= maxCm - 1e-6) {
    return clampLongestEdgeAtMost(line, maxCm);
  }
  const scale = maxCm / maxEdge;
  return clampLongestEdgeAtMost(
    {
      lCm: roundCm(line.lCm * scale),
      wCm: roundCm(line.wCm * scale),
      hCm: roundCm(line.hCm * scale),
    },
    maxCm
  );
}

/** Mở rộng 2 cạnh ngắn hơn (≤ maxCm) để tăng kg DIM khi còn kiện thiếu. */
export function buildVolumeExpansionVariants(
  base: SizeTemplate,
  maxCm = DIM_MAX_LONG_EDGE_CM
): SizeTemplate[] {
  const scaled = scaleLongestEdgeToMax(base, maxCm);
  const [l, w, h] = [scaled.lCm, scaled.wCm, scaled.hCm].sort((a, b) => b - a);
  const out: SizeTemplate[] = [];
  const seen = new Set<string>();

  const add = (candidate: SizeTemplate) => {
    const fixed = clampLongestEdgeAtMost(candidate, maxCm);
    if (longestEdgeCm(fixed) > maxCm + 1e-6) return;
    if (!satisfiesMaxOneEdgeBelowMin(fixed)) return;
    const key = `${fixed.lCm}|${fixed.wCm}|${fixed.hCm}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(fixed);
  };

  const bumps = [0, 2, 5, 8, 12, 15, 20];
  for (const dw of bumps) {
    for (const dh of bumps) {
      add({
        lCm: l,
        wCm: Math.min(maxCm, w + dw),
        hCm: Math.min(maxCm, h + dh),
      });
    }
  }

  return out;
}

/** Trần tổng DIM khả thi: đo thật + kiện còn lại × mẫu nặng nhất (cạnh ≤65 cm). */
export function computeMaxAchievableDimTotal(
  manualNorm: DimPieceLine[],
  templates: DimPieceLine[],
  remainingPcs: number,
  divisor: DimDivisor,
  dimCtx: ScscDimRoundContext
): number | null {
  const manualTotal = totalDimKgFromLines(manualNorm, divisor, dimCtx);
  if (manualTotal == null) return null;
  let maxUnit = 0;
  for (const t of templates) {
    const uk = lineDimKg({ ...t, pcs: 1 }, divisor, dimCtx);
    if (uk != null && uk > maxUnit) maxUnit = uk;
  }
  return manualTotal + maxUnit * Math.max(0, remainingPcs);
}

export function normalizeDimLineEdges(line: DimPieceLine): DimPieceLine {
  const [lCm, wCm, hCm] = [line.lCm, line.wCm, line.hCm]
    .map(roundCm)
    .sort((a, b) => b - a);
  return {
    lCm,
    wCm,
    hCm,
    pcs: line.pcs,
    ...(line.estimated ? { estimated: true } : {}),
  };
}

function consolidateKey(line: DimPieceLine): string {
  const n = normalizeDimLineEdges(line);
  const est = line.estimated ? "1" : "0";
  return `${n.lCm}|${n.wCm}|${n.hCm}|${est}`;
}

export function consolidateDimPieceLines(lines: DimPieceLine[]): DimPieceLine[] {
  const map = new Map<string, DimPieceLine>();
  for (const raw of lines) {
    const line = normalizeDimLineEdges(raw);
    const key = consolidateKey(line);
    const prev = map.get(key);
    if (prev) {
      prev.pcs += line.pcs;
    } else {
      map.set(key, { ...line });
    }
  }
  return [...map.values()];
}

export function dimRandomSeed(shipmentId: string, declaredPcs: number, declaredKg: number): number {
  let h = 2166136261;
  const s = `${shipmentId}|${declaredPcs}|${declaredKg}|${DIM_TOTAL_BAND_BELOW_RATIO}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mục tiêu tổng DIM: [floor, ceiling) với floor = 95% kg lô (mặc định). */
export function computeTotalDimTargets(
  declaredKg: number,
  seed: number,
  bandBelowRatio = DIM_TOTAL_BAND_BELOW_RATIO,
  ceilingRatio = DIM_TOTAL_CEILING_RATIO
): { floorKg: number; ceilingKg: number; targetKg: number } {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const floorKg = declaredKg * (1 - bandBelowRatio);
  const ceilingKg = declaredKg * ceilingRatio;
  const targetKg = floorKg + (ceilingKg - floorKg) * rng();
  return { floorKg, ceilingKg, targetKg };
}

/** Mục tiêu tổng DIM — tự (95–99.9% kg lô) hoặc do người dùng nhập. */
export function resolveRandomFillDimTargets(
  declaredKg: number,
  manualTotalDim: number,
  runSeed: number,
  userTargetTotalDimKg?: number,
  bandBelowRatio = DIM_TOTAL_BAND_BELOW_RATIO,
  ceilingRatio = DIM_TOTAL_CEILING_RATIO
):
  | { ok: true; floorKg: number; ceilingKg: number; targetKg: number; userSpecified: boolean }
  | { ok: false; error: string } {
  if (
    userTargetTotalDimKg != null &&
    Number.isFinite(userTargetTotalDimKg) &&
    userTargetTotalDimKg > 0
  ) {
    if (userTargetTotalDimKg >= declaredKg - 1e-6) {
      return {
        ok: false,
        error: `Tổng DIM mục tiêu (${userTargetTotalDimKg} kg) phải nhỏ hơn kg lô (${declaredKg} kg).`,
      };
    }
    if (userTargetTotalDimKg <= manualTotalDim + 1e-6) {
      return {
        ok: false,
        error: `Tổng DIM mục tiêu phải lớn hơn DIM đo thật (${manualTotalDim.toFixed(1)} kg).`,
      };
    }
    const tol = DIM_TARGET_MATCH_TOLERANCE_KG;
    return {
      ok: true,
      targetKg: userTargetTotalDimKg,
      ceilingKg: userTargetTotalDimKg,
      floorKg: Math.max(manualTotalDim, userTargetTotalDimKg - tol),
      userSpecified: true,
    };
  }

  const auto = computeTotalDimTargets(declaredKg, runSeed, bandBelowRatio, ceilingRatio);
  return { ok: true, ...auto, userSpecified: false };
}

/** Mục tiêu số dòng DIM trên lô (đo + ước tính). Lô lớn → 13–17 dòng. */
export function computeTargetLotLineCount(totalLotPcs: number, seed: number): number {
  if (totalLotPcs < DIM_LOT_LINE_COUNT_PCS_THRESHOLD) {
    return Math.max(3, Math.min(10, Math.ceil(totalLotPcs / 5)));
  }
  const rng = mulberry32(seed ^ 0x4c494e);
  return (
    DIM_LOT_LINE_COUNT_MIN +
    Math.floor(rng() * (DIM_LOT_LINE_COUNT_MAX - DIM_LOT_LINE_COUNT_MIN + 1))
  );
}

function lineKey(line: DimPieceLine): string {
  return consolidateKey(normalizeDimLineEdges(line));
}

/** Thêm biến thể ±1–3 cm để sinh nhiều dòng size khác nhau. */
function expandTemplateVariants(
  templates: DimPieceLine[],
  seed: number,
  maxExtra = 48
): DimPieceLine[] {
  const seen = new Set(templates.map(lineKey));
  const out = [...templates];
  const rng = mulberry32(seed ^ 0x564152);
  const deltas = [-3, -2, -1, 1, 2, 3];

  for (const base of templates) {
    if (out.length - templates.length >= maxExtra) break;
    for (let attempt = 0; attempt < 8; attempt++) {
      const fixed = clampLongestEdgeAtMost({
        lCm: roundCm(base.lCm + deltas[Math.floor(rng() * deltas.length)]!),
        wCm: roundCm(base.wCm + deltas[Math.floor(rng() * deltas.length)]!),
        hCm: roundCm(base.hCm + deltas[Math.floor(rng() * deltas.length)]!),
      });
      const n = normalizeDimLineEdges({ ...fixed, pcs: 1, estimated: true });
      if (!satisfiesMaxOneEdgeBelowMin(n)) continue;
      const key = lineKey(n);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(n);
      if (out.length - templates.length >= maxExtra) break;
    }
  }
  return out;
}

/** Tách dòng pcs lớn sang size lệch nhẹ để tăng số dòng hiển thị. */
function diversifyGeneratedLines(
  generated: DimPieceLine[],
  targetEstimatedLines: number,
  ceilingKg: number,
  manualNorm: DimPieceLine[],
  divisor: DimDivisor,
  dimCtx: ScscDimRoundContext,
  rng: () => number
): DimPieceLine[] {
  let lines = consolidateDimPieceLines(generated);
  let guard = 0;

  const withinCeiling = (next: DimPieceLine[]): boolean => {
    const total = mergedTotalDim(manualNorm, next, divisor, dimCtx);
    return total != null && total <= ceilingKg + 1e-9;
  };

  while (lines.length < targetEstimatedLines && guard++ < 300) {
    const splittable = [...lines].filter((l) => l.pcs >= 2).sort((a, b) => b.pcs - a.pcs)[0];
    if (!splittable) break;

    let variant: DimPieceLine | null = null;
    for (let attempt = 0; attempt < 16; attempt++) {
      const fixed = clampLongestEdgeAtMost({
        lCm: roundCm(splittable.lCm + (rng() > 0.5 ? 1 : -1) * (1 + Math.floor(rng() * 3))),
        wCm: roundCm(splittable.wCm + (rng() > 0.5 ? 1 : -1) * (1 + Math.floor(rng() * 3))),
        hCm: roundCm(splittable.hCm + (rng() > 0.5 ? 1 : -1) * (1 + Math.floor(rng() * 2))),
      });
      const n = normalizeDimLineEdges({ ...fixed, pcs: 1, estimated: true });
      if (!satisfiesMaxOneEdgeBelowMin(n)) continue;
      if (lineKey(n) === lineKey(splittable)) continue;
      variant = n;
      break;
    }
    if (!variant) break;

    const move = Math.min(
      splittable.pcs - 1,
      Math.max(1, Math.ceil(splittable.pcs / (targetEstimatedLines - lines.length + 1)))
    );
    const trial = consolidateDimPieceLines([
      ...lines.filter((l) => l !== splittable),
      { ...splittable, pcs: splittable.pcs - move },
      { ...variant, pcs: move },
    ]);
    if (!withinCeiling(trial)) continue;
    lines = trial;
  }

  return lines;
}

export type RandomDimFillInput = {
  manualLines: DimPieceLine[];
  remainingPcs: number;
  declaredKg: number;
  bandBelowRatio?: number;
  ceilingRatio?: number;
  /** @deprecated capRatio=0.9 — hành vi cũ. */
  capRatio?: number;
  estimatedBudgetRatio?: never;
  poolId: DimRandomPoolId;
  divisor: DimDivisor;
  dimCtx: ScscDimRoundContext;
  seed: number;
  /** Mỗi lần bấm Sinh lại — đổi phân bổ kiện (xor vào seed). */
  regenerationNonce?: number;
  /** Số dòng ước tính do người dùng chọn (vd. 20 dòng / 100 kiện). */
  targetEstimatedLineCount?: number;
  /** Tổng DIM mục tiêu (đo + ước tính) — hệ thống tự cân bằng khớp. */
  targetTotalDimKg?: number;
};

export type RandomDimFillResult =
  | {
      ok: true;
      lines: DimPieceLine[];
      totalDim: number;
      estimatedDim: number;
      targetKg: number;
      floorKg: number;
      ceilingKg: number;
      estimatedPcs: number;
    }
  | { ok: false; error: string };

export type SmartDimFillPreview = {
  remainingPcs: number;
  measuredPcs: number;
  floorKg: number;
  ceilingKg: number;
  canAutoFill: boolean;
};

export function previewSmartDimFill(
  lines: DimPieceLine[],
  declaredPcs: number | null | undefined,
  declaredKg: number | null | undefined,
  bandBelowRatio = DIM_TOTAL_BAND_BELOW_RATIO
): SmartDimFillPreview {
  const measured = splitMeasuredAndEstimated(lines).measured;
  const measuredPcs = measured.reduce((s, l) => s + l.pcs, 0);
  const remainingPcs =
    declaredPcs != null ? Math.max(0, declaredPcs - measuredPcs) : 0;
  const floorKg =
    declaredKg != null && declaredKg > 0 ? declaredKg * (1 - bandBelowRatio) : 0;
  const ceilingKg =
    declaredKg != null && declaredKg > 0 ? declaredKg * DIM_TOTAL_CEILING_RATIO : 0;
  const canAutoFill =
    remainingPcs > 0 &&
    measured.length > 0 &&
    declaredPcs != null &&
    declaredKg != null &&
    declaredKg > 0;
  return { remainingPcs, measuredPcs, floorKg, ceilingKg, canAutoFill };
}

export function buildSmartDimTemplates(
  manualLines: DimPieceLine[],
  poolId: DimRandomPoolId
): DimPieceLine[] {
  const seen = new Set<string>();
  const out: DimPieceLine[] = [];

  const push = (line: DimPieceLine) => {
    const fixed = clampLongestEdgeAtMost({
      lCm: line.lCm,
      wCm: line.wCm,
      hCm: line.hCm,
    });
    const n = normalizeDimLineEdges({ ...fixed, pcs: 1, estimated: true });
    if (!satisfiesMaxOneEdgeBelowMin(n)) return;
    if (longestEdgeCm(n) > DIM_MAX_LONG_EDGE_CM + 1e-6) return;
    const key = consolidateKey(n);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(n);
  };

  for (const raw of manualLines.filter((l) => !l.estimated)) {
    const base = normalizeDimLineEdges({ ...raw, estimated: false });
    push({ ...base, estimated: true });
    for (const scale of [0.92, 0.85, 0.75, 0.65]) {
      push({
        lCm: roundCm(base.lCm * scale),
        wCm: roundCm(base.wCm * scale),
        hCm: roundCm(base.hCm * scale),
        pcs: 1,
        estimated: true,
      });
    }
    push({ ...scaleLongestEdgeToMax(base), pcs: 1, estimated: true });
    for (const expanded of buildVolumeExpansionVariants(base)) {
      push({ ...expanded, pcs: 1, estimated: true });
    }
  }

  const fallbackPool: Exclude<DimRandomPoolId, "smart"> =
    poolId === "smart" ? "mix" : poolId;
  for (const t of [...POOL_MICRO, ...DIM_RANDOM_POOLS[fallbackPool].templates]) {
    push({ ...t, pcs: 1, estimated: true });
  }

  return out;
}

function composeMeasuredAndEstimatedLines(
  manualNorm: DimPieceLine[],
  generated: DimPieceLine[]
): DimPieceLine[] {
  return [
    ...consolidateDimPieceLines(manualNorm),
    ...generated.map((l) => normalizeDimLineEdges({ ...l, estimated: true as const })),
  ];
}

function mergedTotalDim(
  manualNorm: DimPieceLine[],
  generated: DimPieceLine[],
  divisor: DimDivisor,
  dimCtx: ScscDimRoundContext
): number | null {
  return totalDimKgFromLines(
    composeMeasuredAndEstimatedLines(manualNorm, generated),
    divisor,
    dimCtx
  );
}

function estimatedDimTotal(
  generated: DimPieceLine[],
  divisor: DimDivisor,
  dimCtx: ScscDimRoundContext
): number {
  if (generated.length === 0) return 0;
  return (
    totalDimKgFromLines(
      generated.map((l) => normalizeDimLineEdges({ ...l, estimated: true as const })),
      divisor,
      dimCtx
    ) ?? 0
  );
}

function dimTotalMatchesTarget(
  total: number,
  floorKg: number,
  ceilingKg: number,
  targetKg: number,
  userSpecified: boolean
): boolean {
  if (total > ceilingKg + 1e-9) return false;
  if (userSpecified) {
    return (
      total <= targetKg + 1e-9 &&
      total >= targetKg - DIM_TARGET_MATCH_TOLERANCE_KG - 1e-6
    );
  }
  return total >= floorKg - 1e-6 && total <= ceilingKg + 1e-9;
}

function buildEstimatedLinesForTarget(
  sizeLines: DimPieceLine[],
  remainingPcs: number,
  targetKg: number,
  maxPerLine: number,
  manualNorm: DimPieceLine[],
  templates: DimPieceLine[],
  divisor: DimDivisor,
  dimCtx: ScscDimRoundContext,
  rng: () => number
): DimPieceLine[] {
  const lineCount = sizeLines.length;
  if (lineCount === 0) return [];

  const unitKgOf = (line: DimPieceLine): number =>
    lineDimKg({ ...line, pcs: 1 }, divisor, dimCtx) ?? 0;

  const pcs = allocatePcsAcrossLines(remainingPcs, lineCount, rng, maxPerLine);
  let lines = sizeLines.map((s, i) => ({ ...s, pcs: pcs[i]! }));

  const scoreLines = (trial: DimPieceLine[]): number => {
    const total = mergedTotalDim(manualNorm, trial, divisor, dimCtx);
    if (total == null) return -Infinity;
    if (total > targetKg + 1e-6) return -1e6 + (targetKg - total);
    return -Math.abs(targetKg - total);
  };

  let bestScore = scoreLines(lines);

  for (let iter = 0; iter < 350; iter++) {
    const total = mergedTotalDim(manualNorm, lines, divisor, dimCtx);
    if (total != null && Math.abs(total - targetKg) <= DIM_TARGET_MATCH_TOLERANCE_KG + 1e-6) {
      break;
    }

    let bestTrial: DimPieceLine[] | null = null;
    let bestTrialScore = bestScore;

    for (let from = 0; from < lineCount; from++) {
      for (let to = 0; to < lineCount; to++) {
        if (from === to || lines[from]!.pcs <= 1 || lines[to]!.pcs >= maxPerLine) continue;
        const trial = lines.map((l) => ({ ...l }));
        trial[from] = { ...trial[from]!, pcs: trial[from]!.pcs - 1 };
        trial[to] = { ...trial[to]!, pcs: trial[to]!.pcs + 1 };
        const s = scoreLines(trial);
        if (s > bestTrialScore) {
          bestTrialScore = s;
          bestTrial = trial;
        }
      }
    }

    for (let i = 0; i < lineCount; i++) {
      const taken = new Set(lines.map((l) => lineKey(l)));
      taken.delete(lineKey(lines[i]!));
      const totalNow = mergedTotalDim(manualNorm, lines, divisor, dimCtx) ?? 0;
      const pool = templates
        .filter(
          (t) =>
            !taken.has(lineKey(t)) &&
            longestEdgeCm(t) <= DIM_MAX_LONG_EDGE_CM + 1e-6
        )
        .sort(
          (a, b) =>
            Math.abs(unitKgOf(a) * lines[i]!.pcs - (targetKg - totalNow) / lineCount) -
            Math.abs(unitKgOf(b) * lines[i]!.pcs - (targetKg - totalNow) / lineCount)
        )
        .slice(0, 8);
      for (const pick of pool) {
        const trial = lines.map((l) => ({ ...l }));
        trial[i] = { ...pick, pcs: lines[i]!.pcs, estimated: true as const };
        const s = scoreLines(trial);
        if (s > bestTrialScore) {
          bestTrialScore = s;
          bestTrial = trial;
        }
      }
    }

    if (bestTrial == null || bestTrialScore <= bestScore + 1e-9) break;
    lines = bestTrial;
    bestScore = bestTrialScore;
  }

  return lines;
}

function effectiveRandomSeed(seed: number, regenerationNonce?: number): number {
  const n = regenerationNonce ?? 0;
  return (seed ^ Math.imul(n, 0x85ebca6b)) >>> 0;
}

function maxPcsPerEstimatedLine(totalPcs: number, lineCount: number): number {
  const avg = totalPcs / Math.max(1, lineCount);
  return Math.max(2, Math.min(DIM_MAX_PCS_PER_ESTIMATED_LINE, Math.ceil(avg * 2.2)));
}

/** Phân bổ kiện ngẫu nhiên — mỗi dòng 1…maxPerLine, không dồn 1 dòng. */
export function allocatePcsAcrossLines(
  totalPcs: number,
  lineCount: number,
  rng: () => number,
  maxPerLine: number
): number[] {
  const count = Math.max(1, Math.min(lineCount, totalPcs));
  const pcs = new Array<number>(count).fill(1);
  let left = totalPcs - count;
  let guard = 0;
  while (left > 0 && guard++ < totalPcs * 30) {
    const i = Math.floor(rng() * count);
    if (pcs[i]! >= maxPerLine) continue;
    pcs[i]! += 1;
    left -= 1;
  }
  while (left > 0) {
    const i = pcs.indexOf(Math.min(...pcs));
    if (pcs[i]! >= maxPerLine) break;
    pcs[i]! += 1;
    left -= 1;
  }
  return pcs;
}

function pickEstimatedSizeLines(
  templates: DimPieceLine[],
  lineCount: number,
  rng: () => number
): DimPieceLine[] {
  const shuffled = templates.map((_, i) => i).sort(() => rng() - 0.5);
  const picked: DimPieceLine[] = [];
  const seen = new Set<string>();
  for (const ti of shuffled) {
    if (picked.length >= lineCount) break;
    const t = templates[ti]!;
    if (longestEdgeCm(t) > DIM_MAX_LONG_EDGE_CM + 1e-6) continue;
    const key = lineKey(t);
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push({ ...t, pcs: 1, estimated: true as const });
  }
  return picked;
}

function nudgeEstimatedLineDim(
  line: DimPieceLine,
  direction: "up" | "down",
  rng: () => number
): DimPieceLine | null {
  const keys: ("lCm" | "wCm" | "hCm")[] = ["lCm", "wCm", "hCm"];
  const order = keys.map((_, i) => i).sort(() => rng() - 0.5);
  for (const idx of order) {
    const key = keys[idx]!;
    const nextVal = direction === "up" ? line[key] + 1 : line[key] - 1;
    if (nextVal < 1) continue;
    const candidate = normalizeDimLineEdges({
      ...line,
      [key]: nextVal,
      estimated: true as const,
    });
    const fixed = clampLongestEdgeAtMost(candidate);
    const n = normalizeDimLineEdges({ ...fixed, pcs: line.pcs, estimated: true as const });
    if (!satisfiesMaxOneEdgeBelowMin(n)) continue;
    if (longestEdgeCm(n) > DIM_MAX_LONG_EDGE_CM + 1e-6) continue;
    if (lineKey(n) === lineKey(line) && direction === "down") continue;
    return n;
  }
  return null;
}

function fineTuneDimToTarget(
  generated: DimPieceLine[],
  templates: DimPieceLine[],
  manualNorm: DimPieceLine[],
  targetKg: number,
  ceilingKg: number,
  maxPerLine: number,
  divisor: DimDivisor,
  dimCtx: ScscDimRoundContext,
  rng: () => number
): DimPieceLine[] {
  let lines = generated.map((l) => ({ ...l }));
  const totalPcsBudget = lines.reduce((s, l) => s + l.pcs, 0);
  const unitKgOf = (line: DimPieceLine): number =>
    lineDimKg({ ...line, pcs: 1 }, divisor, dimCtx) ?? 0;

  const withinTarget = (total: number): boolean =>
    total <= ceilingKg + 1e-9 &&
    total >= targetKg - DIM_TARGET_MATCH_TOLERANCE_KG - 1e-6;

  for (let iter = 0; iter < 400; iter++) {
    const total = mergedTotalDim(manualNorm, lines, divisor, dimCtx);
    if (total == null) break;
    if (withinTarget(total)) break;

    if (total > targetKg + 1e-6) {
      let bestIdx = -1;
      let bestDrop = 0;
      for (let i = 0; i < lines.length; i++) {
        const nudged = nudgeEstimatedLineDim(lines[i]!, "down", rng);
        if (!nudged) continue;
        const trial = [...lines];
        trial[i] = nudged;
        const trialTotal = mergedTotalDim(manualNorm, trial, divisor, dimCtx);
        if (trialTotal == null || trialTotal > ceilingKg + 1e-9) continue;
        const drop = total - trialTotal;
        if (drop > bestDrop) {
          bestDrop = drop;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        const nudged = nudgeEstimatedLineDim(lines[bestIdx]!, "down", rng);
        if (nudged) {
          lines[bestIdx] = nudged;
          continue;
        }
      }
      break;
    }

    let bestIdx = -1;
    let bestGain = 0;
    for (let i = 0; i < lines.length; i++) {
      const nudged = nudgeEstimatedLineDim(lines[i]!, "up", rng);
      if (!nudged) continue;
      const trial = [...lines];
      trial[i] = nudged;
      const trialTotal = mergedTotalDim(manualNorm, trial, divisor, dimCtx);
      if (trialTotal == null || trialTotal > ceilingKg + 1e-9) continue;
      const gain = trialTotal - total;
      if (gain > bestGain) {
        bestGain = gain;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      const nudged = nudgeEstimatedLineDim(lines[bestIdx]!, "up", rng);
      if (nudged) {
        lines[bestIdx] = nudged;
        continue;
      }
    }

    const lightIdx = lines
      .map((l, i) => ({ i, uk: unitKgOf(l) }))
      .sort((a, b) => a.uk - b.uk)[0]?.i;
    if (lightIdx == null) break;
    const heavier = templates
      .filter(
        (t) =>
          unitKgOf(t) > unitKgOf(lines[lightIdx]!) * 1.02 &&
          longestEdgeCm(t) <= DIM_MAX_LONG_EDGE_CM + 1e-6 &&
          lineKey(t) !== lineKey(lines[lightIdx]!)
      )
      .sort((a, b) => unitKgOf(a) - unitKgOf(b))[0];
    if (heavier) {
      const trial = [...lines];
      trial[lightIdx] = { ...heavier, pcs: lines[lightIdx]!.pcs, estimated: true as const };
      const trialTotal = mergedTotalDim(manualNorm, trial, divisor, dimCtx);
      if (trialTotal != null && trialTotal <= ceilingKg + 1e-9 && trialTotal > total) {
        lines = trial;
        continue;
      }
    }
    break;
  }

  const sum = lines.reduce((s, l) => s + l.pcs, 0);
  if (sum !== totalPcsBudget) {
    return tuneGeneratedToTarget(
      lines,
      templates,
      manualNorm,
      targetKg - DIM_TARGET_MATCH_TOLERANCE_KG,
      ceilingKg,
      targetKg,
      maxPerLine,
      true,
      divisor,
      dimCtx,
      rng
    );
  }
  return lines.filter((l) => l.pcs > 0);
}

/** Hạ tổng DIM xuống ≤ target khi vượt mục tiêu (bước cuối). */
function forceTrimTotalToTarget(
  generated: DimPieceLine[],
  templates: DimPieceLine[],
  manualNorm: DimPieceLine[],
  targetKg: number,
  maxPerLine: number,
  divisor: DimDivisor,
  dimCtx: ScscDimRoundContext,
  rng: () => number
): DimPieceLine[] {
  let lines = generated.map((l) => ({ ...l }));
  const budget = lines.reduce((s, l) => s + l.pcs, 0);

  for (let iter = 0; iter < 500; iter++) {
    const total = mergedTotalDim(manualNorm, lines, divisor, dimCtx);
    if (total == null) break;
    if (total <= targetKg + 1e-9) break;

    let improved = false;
    for (let i = 0; i < lines.length; i++) {
      const nudged = nudgeEstimatedLineDim(lines[i]!, "down", rng);
      if (!nudged) continue;
      const trial = lines.map((l) => ({ ...l }));
      trial[i] = nudged;
      const trialTotal = mergedTotalDim(manualNorm, trial, divisor, dimCtx);
      if (trialTotal == null || trialTotal > targetKg + 1e-9) continue;
      if (trialTotal < total - 1e-9) {
        lines = trial;
        improved = true;
        break;
      }
    }
    if (improved) continue;

    const unitKgOf = (line: DimPieceLine): number =>
      lineDimKg({ ...line, pcs: 1 }, divisor, dimCtx) ?? 0;
    const unitKgs = lines.map(unitKgOf);
    const heavyIdx = unitKgs.indexOf(Math.max(...unitKgs));
    const lightIdx = unitKgs.indexOf(Math.min(...unitKgs));
    if (
      heavyIdx !== lightIdx &&
      lines[heavyIdx]!.pcs > 1 &&
      lines[lightIdx]!.pcs < maxPerLine
    ) {
      const trial = lines.map((l) => ({ ...l }));
      trial[heavyIdx] = { ...trial[heavyIdx]!, pcs: trial[heavyIdx]!.pcs - 1 };
      trial[lightIdx] = { ...trial[lightIdx]!, pcs: trial[lightIdx]!.pcs + 1 };
      const trialTotal = mergedTotalDim(manualNorm, trial, divisor, dimCtx);
      if (trialTotal != null && trialTotal <= targetKg + 1e-9 && trialTotal < total - 1e-9) {
        lines = trial;
        continue;
      }
    }

    const heavy = heavyIdx;
    const taken = new Set(lines.map((l) => lineKey(l)));
    const lighter = templates.find(
      (t) =>
        unitKgOf(t) < unitKgs[heavy]! * 0.9 &&
        !taken.has(lineKey(t)) &&
        longestEdgeCm(t) <= DIM_MAX_LONG_EDGE_CM + 1e-6
    );
    if (lighter) {
      const trial = lines.map((l) => ({ ...l }));
      trial[heavy] = { ...lighter, pcs: lines[heavy]!.pcs, estimated: true as const };
      const trialTotal = mergedTotalDim(manualNorm, trial, divisor, dimCtx);
      if (trialTotal != null && trialTotal <= targetKg + 1e-9 && trialTotal < total - 1e-9) {
        lines = trial;
        continue;
      }
    }
    break;
  }

  const sum = lines.reduce((s, l) => s + l.pcs, 0);
  if (sum !== budget) {
    return generated;
  }
  return lines.filter((l) => l.pcs > 0);
}

function tuneGeneratedToTarget(
  generated: DimPieceLine[],
  templates: DimPieceLine[],
  manualNorm: DimPieceLine[],
  floorKg: number,
  ceilingKg: number,
  targetKg: number,
  maxPerLine: number,
  userSpecified: boolean,
  divisor: DimDivisor,
  dimCtx: ScscDimRoundContext,
  rng: () => number
): DimPieceLine[] {
  const lines = generated.map((l) => ({ ...l }));
  const totalPcsBudget = lines.reduce((s, l) => s + l.pcs, 0);

  const unitKgOf = (line: DimPieceLine): number =>
    lineDimKg({ ...line, pcs: 1 }, divisor, dimCtx) ?? 0;

  const usedKeys = (): Set<string> => new Set(lines.map((l) => lineKey(l)));

  for (let iter = 0; iter < 700; iter++) {
    const curSum = lines.reduce((s, l) => s + l.pcs, 0);
    if (curSum !== totalPcsBudget) {
      const diff = totalPcsBudget - curSum;
      const idx = diff > 0
        ? lines.findIndex((l) => l.pcs < maxPerLine)
        : lines.findIndex((l) => l.pcs > 1);
      if (idx < 0) break;
      lines[idx] = { ...lines[idx]!, pcs: lines[idx]!.pcs + (diff > 0 ? 1 : -1) };
      continue;
    }

    const total = mergedTotalDim(manualNorm, lines, divisor, dimCtx);
    if (total == null) break;
    if (dimTotalMatchesTarget(total, floorKg, ceilingKg, targetKg, userSpecified)) {
      break;
    }

    const unitKgs = lines.map(unitKgOf);

    if (total > targetKg + 1e-6 || total > ceilingKg + 1e-9) {
      let nudgeIdx = -1;
      let nudgeLine: DimPieceLine | null = null;
      let nudgeDrop = 0;
      for (let i = 0; i < lines.length; i++) {
        const nudged = nudgeEstimatedLineDim(lines[i]!, "down", rng);
        if (!nudged) continue;
        const trial = lines.map((l) => ({ ...l }));
        trial[i] = nudged;
        const trialTotal = mergedTotalDim(manualNorm, trial, divisor, dimCtx);
        if (trialTotal == null || trialTotal > ceilingKg + 1e-9) continue;
        const drop = total - trialTotal;
        if (drop > nudgeDrop) {
          nudgeDrop = drop;
          nudgeIdx = i;
          nudgeLine = nudged;
        }
      }
      if (nudgeLine && nudgeIdx >= 0) {
        lines[nudgeIdx] = nudgeLine;
        continue;
      }

      const heavyIdx = unitKgs.indexOf(Math.max(...unitKgs));
      const taken = usedKeys();
      const lighterPool = templates.filter(
        (t) =>
          unitKgOf(t) < unitKgs[heavyIdx]! * 0.92 &&
          longestEdgeCm(t) <= DIM_MAX_LONG_EDGE_CM + 1e-6 &&
          !taken.has(lineKey(t))
      );
      if (lighterPool.length > 0) {
        const pick = lighterPool[Math.floor(rng() * lighterPool.length)]!;
        lines[heavyIdx] = { ...pick, pcs: lines[heavyIdx]!.pcs, estimated: true as const };
        continue;
      }
      const lightIdx = unitKgs.indexOf(Math.min(...unitKgs));
      if (
        heavyIdx !== lightIdx &&
        lines[heavyIdx]!.pcs > 1 &&
        lines[lightIdx]!.pcs < maxPerLine
      ) {
        lines[heavyIdx] = { ...lines[heavyIdx]!, pcs: lines[heavyIdx]!.pcs - 1 };
        lines[lightIdx] = { ...lines[lightIdx]!, pcs: lines[lightIdx]!.pcs + 1 };
        continue;
      }
      break;
    }

    const lightIdx = unitKgs.indexOf(Math.min(...unitKgs));
    const taken = usedKeys();
    taken.delete(lineKey(lines[lightIdx]!));
    const heavierPool = templates.filter(
      (t) =>
        unitKgOf(t) > unitKgs[lightIdx]! * 1.05 &&
        longestEdgeCm(t) <= DIM_MAX_LONG_EDGE_CM + 1e-6 &&
        !taken.has(lineKey(t))
    );
    if (heavierPool.length > 0) {
      const pick = heavierPool[Math.floor(rng() * heavierPool.length)]!;
      lines[lightIdx] = { ...pick, pcs: lines[lightIdx]!.pcs, estimated: true as const };
      continue;
    }
    const heavyIdx = unitKgs.indexOf(Math.max(...unitKgs));
    if (
      heavyIdx !== lightIdx &&
      lines[lightIdx]!.pcs > 1 &&
      lines[heavyIdx]!.pcs < maxPerLine
    ) {
      lines[lightIdx] = { ...lines[lightIdx]!, pcs: lines[lightIdx]!.pcs - 1 };
      lines[heavyIdx] = { ...lines[heavyIdx]!, pcs: lines[heavyIdx]!.pcs + 1 };
      continue;
    }
    break;
  }

  return lines.filter((l) => l.pcs > 0);
}

/** Legacy: tổng DIM ≤ capRatio × kg lô. */
function generateRandomDimFillLegacy(
  input: RandomDimFillInput & { capRatio: number }
): RandomDimFillResult {
  const capKg = input.declaredKg * input.capRatio;
  const manualNorm = input.manualLines
    .filter((l) => !l.estimated)
    .map((l) => normalizeDimLineEdges({ ...l, estimated: false }));
  const manualTotal = totalDimKgFromLines(manualNorm, input.divisor, input.dimCtx) ?? 0;
  if (manualTotal > capKg) {
    return {
      ok: false,
      error: `DIM đo thật (${manualTotal.toFixed(1)} kg) đã vượt trần ${Math.round(input.capRatio * 100)}% kg lô.`,
    };
  }

  const templates = buildSmartDimTemplates(manualNorm, input.poolId);
  const unitKgs = templates.map((t) => lineDimKg(t, input.divisor, input.dimCtx));
  if (unitKgs.some((k) => k == null)) {
    return { ok: false, error: "Mẫu kích thước không hợp lệ." };
  }

  const rng = mulberry32(input.seed);
  let generated: DimPieceLine[] = [];
  const templateOrder = templates.map((_, i) => i).sort((a, b) => unitKgs[a]! - unitKgs[b]!);

  const tryPlace = (ti: number): boolean => {
    const candidate = { ...templates[ti]!, pcs: 1, estimated: true as const };
    const next = consolidateDimPieceLines([...generated, candidate]);
    const trial = mergedTotalDim(manualNorm, next, input.divisor, input.dimCtx);
    if (trial != null && trial <= capKg + 1e-9) {
      generated = next;
      return true;
    }
    return false;
  };

  for (let i = 0; i < input.remainingPcs; i++) {
    const order = templateOrder.slice().sort(() => rng() - 0.5);
    const placed = order.some(tryPlace) || templateOrder.some(tryPlace);
    if (!placed) {
      return { ok: false, error: `Không sinh được kiện ${i + 1}/${input.remainingPcs} (legacy cap).` };
    }
  }

  const totalDim = mergedTotalDim(manualNorm, generated, input.divisor, input.dimCtx)!;
  return {
    ok: true,
    lines: consolidateDimPieceLines([...manualNorm, ...generated]),
    totalDim,
    estimatedDim: estimatedDimTotal(generated, input.divisor, input.dimCtx),
    targetKg: capKg,
    floorKg: 0,
    ceilingKg: capKg,
    estimatedPcs: input.remainingPcs,
  };
}

/**
 * Sinh kiện ước tính — **tổng DIM** (đo + ước tính) nằm trong vùng
 * [95% kg lô, 99.9% kg lô) — ví dụ lô 1000 kg → ~950–999 kg.
 */
export function generateRandomDimFill(input: RandomDimFillInput): RandomDimFillResult {
  if (input.capRatio != null) {
    return generateRandomDimFillLegacy({ ...input, capRatio: input.capRatio });
  }

  const declaredKg = input.declaredKg;
  if (!Number.isFinite(declaredKg) || declaredKg <= 0) {
    return { ok: false, error: "Cần kg lô (> 0) trên lô hàng để sinh DIM ngẫu nhiên." };
  }
  if (input.remainingPcs <= 0) {
    return { ok: false, error: "Không còn kiện thiếu — đã đủ so với kiện lô." };
  }

  const bandBelow = input.bandBelowRatio ?? DIM_TOTAL_BAND_BELOW_RATIO;
  const ceilingRatio = input.ceilingRatio ?? DIM_TOTAL_CEILING_RATIO;
  const runSeed = effectiveRandomSeed(input.seed, input.regenerationNonce);
  const manualNormEarly = input.manualLines
    .filter((l) => !l.estimated)
    .map((l) => normalizeDimLineEdges({ ...l, estimated: false }));
  const manualTotalEarly =
    manualNormEarly.length > 0
      ? (totalDimKgFromLines(manualNormEarly, input.divisor, input.dimCtx) ?? 0)
      : 0;

  const targets = resolveRandomFillDimTargets(
    declaredKg,
    manualTotalEarly,
    runSeed,
    input.targetTotalDimKg,
    bandBelow,
    ceilingRatio
  );
  if (!targets.ok) return { ok: false, error: targets.error };
  const { floorKg, ceilingKg, targetKg, userSpecified } = targets;

  const manualNorm = manualNormEarly;

  if (manualNorm.length === 0) {
    return { ok: false, error: "Cần ít nhất một dòng đo thật trước khi sinh kiện ước tính." };
  }

  const manualTotal = totalDimKgFromLines(manualNorm, input.divisor, input.dimCtx) ?? 0;
  if (manualTotal >= ceilingKg - 1e-6 && !userSpecified) {
    return {
      ok: false,
      error: `DIM đo thật (${manualTotal.toFixed(1)} kg) đã gần/ vượt kg lô (${declaredKg} kg). Giảm kích thước mẫu đo.`,
    };
  }

  const templates = expandTemplateVariants(
    buildSmartDimTemplates(manualNorm, input.poolId),
    runSeed
  );
  const unitKgs = templates.map((t) => lineDimKg(t, input.divisor, input.dimCtx));
  if (unitKgs.some((k) => k == null)) {
    return { ok: false, error: "Mẫu kích thước không hợp lệ." };
  }

  const rng = mulberry32(runSeed);
  const totalLotPcs =
    manualNorm.reduce((s, l) => s + l.pcs, 0) + input.remainingPcs;
  const targetTotalLines = computeTargetLotLineCount(totalLotPcs, runSeed);
  const targetEstimatedLines =
    input.targetEstimatedLineCount != null && input.targetEstimatedLineCount > 0
      ? Math.max(1, Math.min(input.remainingPcs, Math.floor(input.targetEstimatedLineCount)))
      : Math.max(
          3,
          Math.min(input.remainingPcs, Math.max(1, targetTotalLines - manualNorm.length))
        );

  let sizeLines = pickEstimatedSizeLines(templates, targetEstimatedLines, rng);
  let expandGuard = 0;
  while (
    sizeLines.length < Math.min(targetEstimatedLines, templates.length) &&
    expandGuard++ < 50
  ) {
    const ti = Math.floor(rng() * templates.length);
    const t = templates[ti]!;
    if (longestEdgeCm(t) > DIM_MAX_LONG_EDGE_CM + 1e-6) continue;
    const key = lineKey(t);
    if (sizeLines.some((l) => lineKey(l) === key)) continue;
    sizeLines.push({ ...t, pcs: 1, estimated: true as const });
  }

  if (sizeLines.length === 0) {
    return {
      ok: false,
      error: "Không có mẫu kích thước hợp lệ (cạnh dài tối đa 65 cm).",
    };
  }

  const lineCount = Math.min(sizeLines.length, targetEstimatedLines);
  sizeLines = sizeLines.slice(0, lineCount);
  const maxPerLine = maxPcsPerEstimatedLine(input.remainingPcs, lineCount);

  let generated = buildEstimatedLinesForTarget(
    sizeLines,
    input.remainingPcs,
    targetKg,
    maxPerLine,
    manualNorm,
    templates,
    input.divisor,
    input.dimCtx,
    rng
  );

  generated = tuneGeneratedToTarget(
    generated,
    templates,
    manualNorm,
    floorKg,
    ceilingKg,
    targetKg,
    maxPerLine,
    userSpecified,
    input.divisor,
    input.dimCtx,
    rng
  );

  if (userSpecified) {
    generated = fineTuneDimToTarget(
      generated,
      templates,
      manualNorm,
      targetKg,
      ceilingKg,
      maxPerLine,
      input.divisor,
      input.dimCtx,
      rng
    );
  } else if (
    !dimTotalMatchesTarget(
      mergedTotalDim(manualNorm, generated, input.divisor, input.dimCtx) ?? 0,
      floorKg,
      ceilingKg,
      targetKg,
      false
    )
  ) {
    generated = fineTuneDimToTarget(
      generated,
      templates,
      manualNorm,
      targetKg,
      ceilingKg,
      maxPerLine,
      input.divisor,
      input.dimCtx,
      rng
    );
  }

  if (totalLotPcs >= DIM_LOT_LINE_COUNT_PCS_THRESHOLD && !userSpecified) {
    const estCount = consolidateDimPieceLines(generated).length;
    const maxPcs = generated.reduce((m, l) => Math.max(m, l.pcs), 0);
    if (estCount < targetEstimatedLines || maxPcs > maxPerLine) {
      generated = diversifyGeneratedLines(
        generated,
        targetEstimatedLines,
        ceilingKg,
        manualNorm,
        input.divisor,
        input.dimCtx,
        rng
      );
      generated = tuneGeneratedToTarget(
        generated,
        templates,
        manualNorm,
        floorKg,
        ceilingKg,
        targetKg,
        maxPerLine,
        userSpecified,
        input.divisor,
        input.dimCtx,
        rng
      );
      if (userSpecified) {
        generated = fineTuneDimToTarget(
          generated,
          templates,
          manualNorm,
          targetKg,
          ceilingKg,
          maxPerLine,
          input.divisor,
          input.dimCtx,
          rng
        );
      }
    }
  }

  const merged = composeMeasuredAndEstimatedLines(manualNorm, generated);
  let totalDim = totalDimKgFromLines(merged, input.divisor, input.dimCtx);
  const estimatedDim = estimatedDimTotal(generated, input.divisor, input.dimCtx);
  if (totalDim == null) {
    return { ok: false, error: "Không tính được tổng DIM sau khi sinh." };
  }

  if (userSpecified && totalDim > targetKg + 1e-6) {
    generated = forceTrimTotalToTarget(
      generated,
      templates,
      manualNorm,
      targetKg,
      maxPerLine,
      input.divisor,
      input.dimCtx,
      rng
    );
    totalDim = totalDimKgFromLines(
      composeMeasuredAndEstimatedLines(manualNorm, generated),
      input.divisor,
      input.dimCtx
    );
  }

  if (totalDim == null) {
    return { ok: false, error: "Không tính được tổng DIM sau khi sinh." };
  }

  if (totalDim >= declaredKg - 1e-6) {
    return {
      ok: false,
      error: `Tổng DIM sinh ra (${totalDim.toFixed(1)} kg) không nhỏ hơn kg lô (${declaredKg} kg).`,
    };
  }

  if (userSpecified && totalDim > targetKg + 1e-6) {
    return {
      ok: false,
      error: `Không cân bằng được tổng DIM ≤ ${targetKg} kg (hiện ${totalDim.toFixed(1)} kg). Thử tăng mục tiêu hoặc giảm size mẫu đo.`,
    };
  }

  if (
    userSpecified &&
    totalDim < targetKg - DIM_TARGET_MATCH_TOLERANCE_KG - 1e-6
  ) {
    const maxAch = computeMaxAchievableDimTotal(
      manualNorm,
      templates,
      input.remainingPcs,
      input.divisor,
      input.dimCtx
    );
    if (
      maxAch != null &&
      targetKg > maxAch + DIM_TARGET_MATCH_TOLERANCE_KG + 1e-6
    ) {
      return {
        ok: false,
        error: `Mục tiêu ${targetKg} kg không khả thi với mẫu đo và cạnh ≤ ${DIM_MAX_LONG_EDGE_CM} cm — tối đa ~${maxAch.toFixed(0)} kg. Thử giảm mục tiêu hoặc thêm mẫu đo lớn hơn.`,
      };
    }
    return {
      ok: false,
      error: `Không khớp mục tiêu ${targetKg} kg (đạt ${totalDim.toFixed(1)} kg, lệch > ${DIM_TARGET_MATCH_TOLERANCE_KG} kg). Thử giảm mục tiêu hoặc thêm mẫu đo.`,
    };
  }

  const badEdge = generated.find((l) => !satisfiesMaxOneEdgeBelowMin(l));
  if (badEdge) {
    return {
      ok: false,
      error: `Kiện ước tính ${badEdge.lCm}×${badEdge.wCm}×${badEdge.hCm} vi phạm quy tắc tối đa 1 cạnh dưới ${DIM_MIN_EDGE_CM} cm.`,
    };
  }

  const longEdge = generated.find((l) => longestEdgeCm(l) > DIM_MAX_LONG_EDGE_CM + 1e-6);
  if (longEdge) {
    return {
      ok: false,
      error: `Kiện ước tính ${longEdge.lCm}×${longEdge.wCm}×${longEdge.hCm} có cạnh dài > ${DIM_MAX_LONG_EDGE_CM} cm.`,
    };
  }

  const heavyPcs = generated.reduce((m, l) => Math.max(m, l.pcs), 0);
  if (heavyPcs > maxPerLine) {
    return {
      ok: false,
      error: `Phân bổ kiện không hợp lý (tối đa ${maxPerLine} kiện/dòng ước tính).`,
    };
  }

  return {
    ok: true,
    lines: composeMeasuredAndEstimatedLines(manualNorm, generated),
    totalDim,
    estimatedDim,
    targetKg,
    floorKg,
    ceilingKg,
    estimatedPcs: input.remainingPcs,
  };
}

export function applySmartDimAutoFill(
  lines: DimPieceLine[],
  opts: {
    declaredPcs: number;
    declaredKg: number;
    divisor: DimDivisor;
    dimCtx: ScscDimRoundContext;
    seed: number;
    poolId?: DimRandomPoolId;
    enabled?: boolean;
    regenerationNonce?: number;
    targetEstimatedLineCount?: number;
    targetTotalDimKg?: number;
  }
): { lines: DimPieceLine[]; autoFilled: boolean; error?: string } {
  const consolidated = consolidateDimPieceLines(lines);
  if (opts.enabled === false) {
    return { lines: consolidated, autoFilled: false };
  }

  const preview = previewSmartDimFill(consolidated, opts.declaredPcs, opts.declaredKg);
  if (!preview.canAutoFill) {
    const manualOnly = consolidateDimPieceLines(splitMeasuredAndEstimated(consolidated).measured);
    return { lines: manualOnly, autoFilled: false };
  }

  const result = generateRandomDimFill({
    manualLines: splitMeasuredAndEstimated(consolidated).measured,
    remainingPcs: preview.remainingPcs,
    declaredKg: opts.declaredKg,
    poolId: opts.poolId ?? "smart",
    divisor: opts.divisor,
    dimCtx: opts.dimCtx,
    seed: opts.seed,
    regenerationNonce: opts.regenerationNonce,
    targetEstimatedLineCount: opts.targetEstimatedLineCount,
    targetTotalDimKg: opts.targetTotalDimKg,
  });

  if (!result.ok) {
    return { lines: consolidated, autoFilled: false, error: result.error };
  }
  return { lines: result.lines, autoFilled: true };
}

export function splitMeasuredAndEstimated(lines: DimPieceLine[]): {
  measured: DimPieceLine[];
  estimated: DimPieceLine[];
} {
  const measured: DimPieceLine[] = [];
  const estimated: DimPieceLine[] = [];
  for (const line of lines) {
    if (line.estimated) estimated.push(line);
    else measured.push(line);
  }
  return { measured, estimated };
}
