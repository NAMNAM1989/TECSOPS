import {
  applyScscChargeableRounding,
  applyScscTotalRounding,
  formatScscChargeableKg,
  scscChargeableKindFromShipment,
  type ScscChargeableRoundKind,
} from "./scscChargeableWeight";

/** Hệ số thể tích phổ biến: cm³/kg (IATA thường 6000; một số hãng/điều kiện 5000). */
export const DIM_DIVISORS = [6000, 5000] as const;
export type DimDivisor = (typeof DIM_DIVISORS)[number];

/**
 * Tiền tố mã chuyến (2–3 chữ đầu) dùng hệ số **5000** cm³/kg.
 * Tài liệu SCSC Required airline (29MAR2025) không nêu 5000 — danh sách trống → luôn 6000.
 */
export const DIM_DIVISOR_5000_FLIGHT_PREFIXES: readonly string[] = [];

function flightPrefix(flight: string): string {
  const head = flight.trim().toUpperCase().replace(/\s+/g, "");
  return head.match(/^([A-Z0-9]{2,3})/)?.[1] ?? "";
}

/** Hệ số L×W×H (cm³/kg) theo ký hiệu hãng — mặc định 6000. */
export function dimDivisorFromFlight(flight: string): DimDivisor {
  const p = flightPrefix(flight);
  if (p && DIM_DIVISOR_5000_FLIGHT_PREFIXES.includes(p)) return 5000;
  return 6000;
}

/**
 * Quy tắc quy đổi DIM (kg) — cột Chargeable Weight SCSC Required airline.
 * Alias cũ `VJ_TRUNC3_LINE_SUM_NO_TOTAL_ROUND` → `DP3_ROUND_0_5`.
 */
export type DimRoundingPolicyId = ScscChargeableRoundKind | "VJ_TRUNC3_LINE_SUM_NO_TOTAL_ROUND";

export const DIM_ROUNDING_POLICY_IDS = [
  "DP3_ROUND_0_5",
  "DP3_ROUND_1",
  "DP2_ROUND_0_5",
  "ROUND_INTEGER",
  "QR_SPECIAL",
  "STANDARD_IATA_2DP",
  "VJ_TRUNC3_LINE_SUM_NO_TOTAL_ROUND",
] as const;

function normalizePolicy(policy: DimRoundingPolicyId): ScscChargeableRoundKind {
  if (policy === "VJ_TRUNC3_LINE_SUM_NO_TOTAL_ROUND") return "DP3_ROUND_0_5";
  return policy;
}

/** Suy ra chính sách từ mã chuyến (+ AWB nếu có). */
export function dimRoundingPolicyFromFlight(flight: string, awb = ""): DimRoundingPolicyId {
  return scscChargeableKindFromShipment(flight, awb);
}

export function truncatePositiveKg(n: number, decimalPlaces: number): number {
  if (!Number.isFinite(n) || n <= 0) return n;
  const f = 10 ** decimalPlaces;
  return Math.floor(n * f + 1e-9) / f;
}

/** Hiển thị kg DIM theo chính sách SCSC. */
export function formatDimKgDisplay(kg: number, policy: DimRoundingPolicyId): string {
  return formatScscChargeableKg(kg, normalizePolicy(policy));
}

/** DIM kg trên lô — theo mã chuyến (+ AWB). */
export function formatShipmentDimWeightKg(
  flight: string,
  dimWeightKg: number | null,
  awb = ""
): string {
  if (dimWeightKg == null) return "—";
  return formatDimKgDisplay(dimWeightKg, dimRoundingPolicyFromFlight(flight, awb));
}

/** Một nhóm kiện cùng kích thước (cm). */
export type DimPieceLine = {
  lCm: number;
  wCm: number;
  hCm: number;
  /** Số kiện cùng D×R×C */
  pcs: number;
};

/** Trích các số dương từ chuỗi. */
export function parsePositiveNumbersFromText(s: string): number[] {
  const m = s.replace(/,/g, ".").match(/\d+(?:\.\d+)?/g);
  if (!m) return [];
  return m
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/** DIM (kg) từ kích thước cm — một kiện (chưa nhân số kiện). */
export function volumetricKgFromCm(
  lengthCm: number,
  widthCm: number,
  heightCm: number,
  divisor: DimDivisor,
  policy: DimRoundingPolicyId = "STANDARD_IATA_2DP"
): number | null {
  if (!Number.isFinite(lengthCm) || !Number.isFinite(widthCm) || !Number.isFinite(heightCm)) return null;
  if (lengthCm <= 0 || widthCm <= 0 || heightCm <= 0) return null;
  const v = (lengthCm * widthCm * heightCm) / divisor;
  if (!Number.isFinite(v) || v <= 0) return null;
  return applyScscChargeableRounding(v, normalizePolicy(policy));
}

export function parseKgInput(t: string): number | null {
  const s = t.trim();
  if (s === "") return null;
  const n = Number(s.replace(",", "."));
  if (Number.isNaN(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function normalizePieceCount(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(1, Math.min(99999, Math.floor(n)));
}

/** DIM một dòng = làm tròn((D×R×C÷hệ số) × số kiện) theo hãng SCSC. */
export function lineDimKg(
  line: DimPieceLine,
  divisor: DimDivisor,
  policy: DimRoundingPolicyId = "STANDARD_IATA_2DP"
): number | null {
  const rawUnit = (line.lCm * line.wCm * line.hCm) / divisor;
  if (!Number.isFinite(rawUnit) || rawUnit <= 0) return null;
  const pcs = normalizePieceCount(line.pcs);
  const rawLine = rawUnit * pcs;
  const kind = normalizePolicy(policy);
  if (kind === "STANDARD_IATA_2DP") {
    const unit = Math.round(rawUnit * 100) / 100;
    return Math.round(unit * pcs * 100) / 100;
  }
  return applyScscChargeableRounding(rawLine, kind);
}

export function totalDimKgFromLines(
  lines: DimPieceLine[],
  divisor: DimDivisor,
  policy: DimRoundingPolicyId = "STANDARD_IATA_2DP"
): number | null {
  if (lines.length === 0) return null;
  const kind = normalizePolicy(policy);
  let sum = 0;
  for (const line of lines) {
    const x = lineDimKg(line, divisor, kind);
    if (x === null) return null;
    sum += x;
  }
  return applyScscTotalRounding(sum, kind);
}

export function parseDimLineQuadsFromNumbers(nums: number[]): DimPieceLine[] {
  const out: DimPieceLine[] = [];
  let i = 0;
  while (i < nums.length) {
    const rest = nums.length - i;
    if (rest >= 4) {
      out.push({
        lCm: nums[i],
        wCm: nums[i + 1],
        hCm: nums[i + 2],
        pcs: normalizePieceCount(nums[i + 3]),
      });
      i += 4;
    } else if (rest === 3) {
      out.push({
        lCm: nums[i],
        wCm: nums[i + 1],
        hCm: nums[i + 2],
        pcs: 1,
      });
      i += 3;
    } else {
      break;
    }
  }
  return out;
}

export function parseDimLineQuadsFromNumbersStrict(nums: number[]): DimPieceLine[] | null {
  if (nums.length === 0) return null;
  const out: DimPieceLine[] = [];
  let i = 0;
  while (i < nums.length) {
    const rest = nums.length - i;
    if (rest >= 4) {
      out.push({
        lCm: nums[i],
        wCm: nums[i + 1],
        hCm: nums[i + 2],
        pcs: normalizePieceCount(nums[i + 3]),
      });
      i += 4;
    } else if (rest === 3) {
      out.push({
        lCm: nums[i],
        wCm: nums[i + 1],
        hCm: nums[i + 2],
        pcs: 1,
      });
      i += 3;
    } else {
      return null;
    }
  }
  return out;
}

const DIM_COMBO_LINE_SPLIT = /[\n;]+/;

export function tryParseDimPieceLinesFromComboText(raw: string):
  | { ok: true; lines: DimPieceLine[] }
  | { ok: false; error: string } {
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (text === "") return { ok: false, error: "Trống." };

  const physicalLines = text
    .split(DIM_COMBO_LINE_SPLIT)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (physicalLines.length === 0) return { ok: false, error: "Trống." };

  const all: DimPieceLine[] = [];
  for (let idx = 0; idx < physicalLines.length; idx++) {
    const line = physicalLines[idx];
    const nums = parsePositiveNumbersFromText(line);
    const parsed = parseDimLineQuadsFromNumbersStrict(nums);
    if (parsed === null) {
      const hint =
        physicalLines.length > 1
          ? `Dòng ${idx + 1} không hợp lệ (mỗi nhóm đúng 4 số: D-R-C-kiện, hoặc 3 số: D-R-C): "${line}"`
          : "Số không khớp nhóm — mỗi nhóm cần đúng 4 số (D, R, C, kiện) hoặc 3 số (D, R, C), lặp lại cho nhiều nhóm.";
      return { ok: false, error: hint };
    }
    all.push(...parsed);
  }

  return { ok: true, lines: all };
}
