/** Hệ số thể tích phổ biến: cm³/kg (IATA thường 6000; một số hãng/điều kiện 5000). */
export const DIM_DIVISORS = [6000, 5000] as const;
export type DimDivisor = (typeof DIM_DIVISORS)[number];

/**
 * Tiền tố mã chuyến (2–3 chữ đầu, ví dụ VJ, VN, QH) dùng hệ số **5000** cm³/kg.
 * Để trống → mọi chuyến dùng **6000** (chuẩn IATA phổ biến).
 * Cập nhật theo tài liệu hãng (PDF “Required airline”) — không đoán bừa; thêm từng hãng khi có quy định rõ.
 */
export const DIM_DIVISOR_5000_FLIGHT_PREFIXES: readonly string[] = [];

function flightPrefix(flight: string): string {
  const head = flight.trim().toUpperCase().replace(/\s+/g, "");
  return head.match(/^([A-Z]{2,3})/)?.[1] ?? "";
}

/** Hệ số L×W×H (cm³/kg) theo ký hiệu hãng — mặc định 6000. */
export function dimDivisorFromFlight(flight: string): DimDivisor {
  const p = flightPrefix(flight);
  if (p && DIM_DIVISOR_5000_FLIGHT_PREFIXES.includes(p)) return 5000;
  return 6000;
}

/**
 * Quy tắc quy đổi DIM (kg) từ dimLines — một số hãng khác cách xử lý phần thập phân.
 * - STANDARD_IATA_2DP: làm tròn 2 số lẻ mỗi dòng và tổng (mặc định).
 * - VJ_TRUNC3_LINE_SUM_NO_TOTAL_ROUND: chuyến VJ* — mỗi dòng cắt (truncate) 3 chữ thập phân,
 *   tổng = tổng các dòng đã cắt, không làm tròn lại tổng.
 */
export const DIM_ROUNDING_POLICY_IDS = ["STANDARD_IATA_2DP", "VJ_TRUNC3_LINE_SUM_NO_TOTAL_ROUND"] as const;
export type DimRoundingPolicyId = (typeof DIM_ROUNDING_POLICY_IDS)[number];

/** Suy ra chính sách từ mã chuyến (tiền tố hãng). */
export function dimRoundingPolicyFromFlight(flight: string): DimRoundingPolicyId {
  const head = flight.trim().toUpperCase().replace(/\s+/g, "");
  if (/^VJ/.test(head)) return "VJ_TRUNC3_LINE_SUM_NO_TOTAL_ROUND";
  return "STANDARD_IATA_2DP";
}

function truncatePositiveKg(n: number, decimalPlaces: number): number {
  if (!Number.isFinite(n) || n <= 0) return n;
  const f = 10 ** decimalPlaces;
  return Math.floor(n * f + 1e-9) / f;
}

/**
 * Hiển thị kg DIM theo chính sách.
 * VJ: luôn **cắt** (truncate) đúng 3 chữ số thập phân — bỏ nhiễu float kiểu 1392.1080000000002.
 */
export function formatDimKgDisplay(kg: number, policy: DimRoundingPolicyId): string {
  if (policy === "VJ_TRUNC3_LINE_SUM_NO_TOTAL_ROUND") {
    const t = truncatePositiveKg(kg, 3);
    return t.toFixed(3);
  }
  return String(Math.round(kg * 100) / 100);
}

/** DIM kg trên lô (cột bảng / Excel / in) — theo mã chuyến. */
export function formatShipmentDimWeightKg(flight: string, dimWeightKg: number | null): string {
  if (dimWeightKg == null) return "—";
  return formatDimKgDisplay(dimWeightKg, dimRoundingPolicyFromFlight(flight));
}

/** Một nhóm kiện cùng kích thước (cm). */
export type DimPieceLine = {
  lCm: number;
  wCm: number;
  hCm: number;
  /** Số kiện cùng D×R×C */
  pcs: number;
};

/** Trích các số dương từ chuỗi (gõ tay, dán, hoặc transcript giọng nói). */
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
  if (policy === "VJ_TRUNC3_LINE_SUM_NO_TOTAL_ROUND") return truncatePositiveKg(v, 3);
  return Math.round(v * 100) / 100;
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

/** DIM một dòng = (D×R×C÷hệ số) × số kiện. */
export function lineDimKg(
  line: DimPieceLine,
  divisor: DimDivisor,
  policy: DimRoundingPolicyId = "STANDARD_IATA_2DP"
): number | null {
  const rawUnit = (line.lCm * line.wCm * line.hCm) / divisor;
  if (!Number.isFinite(rawUnit) || rawUnit <= 0) return null;
  const pcs = normalizePieceCount(line.pcs);
  const rawLine = rawUnit * pcs;
  if (policy === "VJ_TRUNC3_LINE_SUM_NO_TOTAL_ROUND") return truncatePositiveKg(rawLine, 3);
  const unit = Math.round(rawUnit * 100) / 100;
  return Math.round(unit * pcs * 100) / 100;
}

export function totalDimKgFromLines(
  lines: DimPieceLine[],
  divisor: DimDivisor,
  policy: DimRoundingPolicyId = "STANDARD_IATA_2DP"
): number | null {
  if (lines.length === 0) return null;
  let sum = 0;
  for (const line of lines) {
    const x = lineDimKg(line, divisor, policy);
    if (x === null) return null;
    sum += x;
  }
  if (policy === "VJ_TRUNC3_LINE_SUM_NO_TOTAL_ROUND") return truncatePositiveKg(sum, 3);
  return Math.round(sum * 100) / 100;
}

/**
 * Gom dãy số thành các dòng [D,R,C,Kiện].
 * Cứ 4 số = 1 dòng; còn đúng 3 số cuối → Kiện = 1.
 */
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

/**
 * Giống parseDimLineQuadsFromNumbers nhưng bắt buộc dùng hết dãy số (không bỏ sót số thừa).
 */
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

/**
 * Ô nhập DIM: mỗi dòng (hoặc mỗi đoạn sau ;) là một hoặc nhiều nhóm D×R×C×kiện / D×R×C (kiện=1).
 * Phân cách số: - × * khoảng trắng… (parsePositiveNumbersFromText).
 */
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
