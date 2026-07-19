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
  return Math.max(1, Math.round(n * 10) / 10);
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

export function normalizeDimLineEdges(line: DimPieceLine): DimPieceLine {
  const [lCm, wCm, hCm] = [line.lCm, line.wCm, line.hCm].sort((a, b) => b - a);
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
    const fixed = enforceMaxOneEdgeBelowMin({
      lCm: line.lCm,
      wCm: line.wCm,
      hCm: line.hCm,
    });
    const n = normalizeDimLineEdges({ ...fixed, pcs: 1, estimated: true });
    if (!satisfiesMaxOneEdgeBelowMin(n)) return;
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
  }

  const fallbackPool: Exclude<DimRandomPoolId, "smart"> =
    poolId === "smart" ? "mix" : poolId;
  for (const t of [...POOL_MICRO, ...DIM_RANDOM_POOLS[fallbackPool].templates]) {
    push(t);
  }

  return out;
}

function mergedTotalDim(
  manualNorm: DimPieceLine[],
  generated: DimPieceLine[],
  divisor: DimDivisor,
  dimCtx: ScscDimRoundContext
): number | null {
  return totalDimKgFromLines(
    consolidateDimPieceLines([...manualNorm, ...generated]),
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
  return totalDimKgFromLines(consolidateDimPieceLines(generated), divisor, dimCtx) ?? 0;
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
    let placed = order.some(tryPlace) || templateOrder.some(tryPlace);
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
  const { floorKg, ceilingKg, targetKg } = computeTotalDimTargets(
    declaredKg,
    input.seed,
    bandBelow,
    ceilingRatio
  );

  const manualNorm = input.manualLines
    .filter((l) => !l.estimated)
    .map((l) => normalizeDimLineEdges({ ...l, estimated: false }));

  if (manualNorm.length === 0) {
    return { ok: false, error: "Cần ít nhất một dòng đo thật trước khi sinh kiện ước tính." };
  }

  const manualTotal = totalDimKgFromLines(manualNorm, input.divisor, input.dimCtx) ?? 0;
  if (manualTotal >= ceilingKg - 1e-6) {
    return {
      ok: false,
      error: `DIM đo thật (${manualTotal.toFixed(1)} kg) đã gần/ vượt kg lô (${declaredKg} kg). Giảm kích thước mẫu đo.`,
    };
  }

  const templates = buildSmartDimTemplates(manualNorm, input.poolId);
  const unitKgs = templates.map((t) => lineDimKg(t, input.divisor, input.dimCtx));
  if (unitKgs.some((k) => k == null)) {
    return { ok: false, error: "Mẫu kích thước không hợp lệ." };
  }

  const rng = mulberry32(input.seed);
  let generated: DimPieceLine[] = [];

  const currentTotalDim = (): number =>
    mergedTotalDim(manualNorm, generated, input.divisor, input.dimCtx) ?? manualTotal;

  const pickTemplate = (remainingSlots: number): number | null => {
    const curTotal = currentTotalDim();
    const remainingBudget = ceilingKg - curTotal;
    if (remainingBudget <= 1e-6) return null;
    const idealUnitKg = remainingBudget / remainingSlots;

    let bestTi: number | null = null;
    let bestScore = -Infinity;
    const shuffled = templates.map((_, i) => i).sort(() => rng() - 0.5);

    const scoreTemplate = (ti: number): number | null => {
      const uk = unitKgs[ti]!;
      if (uk > remainingBudget + 1e-6) return null;

      const candidate = { ...templates[ti]!, pcs: 1, estimated: true as const };
      const nextGen = consolidateDimPieceLines([...generated, candidate]);
      const trialTotal = mergedTotalDim(manualNorm, nextGen, input.divisor, input.dimCtx);
      if (trialTotal == null || trialTotal > ceilingKg + 1e-9) return null;

      const totalScore = -Math.abs(targetKg - trialTotal);
      const unitScore = -Math.abs(idealUnitKg - uk);
      return totalScore + unitScore * Math.min(remainingSlots, 20) * 0.2;
    };

    for (const ti of shuffled) {
      const score = scoreTemplate(ti);
      if (score == null) continue;
      if (score > bestScore) {
        bestScore = score;
        bestTi = ti;
      }
    }

    if (bestTi != null) return bestTi;

    for (let ti = 0; ti < templates.length; ti++) {
      if (scoreTemplate(ti) != null) return ti;
    }
    return null;
  };

  for (let i = 0; i < input.remainingPcs; i++) {
    const ti = pickTemplate(input.remainingPcs - i);
    if (ti == null) {
      const pct = Math.round(bandBelow * 100);
      return {
        ok: false,
        error: `Không sinh được kiện ${i + 1}/${input.remainingPcs} (mục tiêu tổng DIM ${floorKg.toFixed(0)}–${Math.floor(ceilingKg)} kg, ~${pct}% dưới kg lô). Thử giảm kích thước mẫu đo.`,
      };
    }
    const candidate = { ...templates[ti]!, pcs: 1, estimated: true as const };
    generated = consolidateDimPieceLines([...generated, candidate]);
  }

  const merged = consolidateDimPieceLines([...manualNorm, ...generated]);
  const totalDim = totalDimKgFromLines(merged, input.divisor, input.dimCtx);
  const estimatedDim = estimatedDimTotal(generated, input.divisor, input.dimCtx);
  if (totalDim == null) {
    return { ok: false, error: "Không tính được tổng DIM sau khi sinh." };
  }

  if (totalDim >= declaredKg - 1e-6) {
    return {
      ok: false,
      error: `Tổng DIM sinh ra (${totalDim.toFixed(1)} kg) không nhỏ hơn kg lô (${declaredKg} kg).`,
    };
  }

  const badEdge = generated.find((l) => !satisfiesMaxOneEdgeBelowMin(l));
  if (badEdge) {
    return {
      ok: false,
      error: `Kiện ước tính ${badEdge.lCm}×${badEdge.wCm}×${badEdge.hCm} vi phạm quy tắc tối đa 1 cạnh dưới ${DIM_MIN_EDGE_CM} cm.`,
    };
  }

  return {
    ok: true,
    lines: merged,
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
