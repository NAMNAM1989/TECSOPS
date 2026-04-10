/** Hệ số thể tích phổ biến: cm³/kg (IATA thường 6000; một số hãng 5000). */
export const DIM_DIVISORS = [6000, 5000] as const;
export type DimDivisor = (typeof DIM_DIVISORS)[number];

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

/** DIM (kg) từ kích thước cm. */
export function volumetricKgFromCm(
  lengthCm: number,
  widthCm: number,
  heightCm: number,
  divisor: DimDivisor
): number | null {
  if (!Number.isFinite(lengthCm) || !Number.isFinite(widthCm) || !Number.isFinite(heightCm)) return null;
  if (lengthCm <= 0 || widthCm <= 0 || heightCm <= 0) return null;
  const v = (lengthCm * widthCm * heightCm) / divisor;
  if (!Number.isFinite(v) || v <= 0) return null;
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
export function lineDimKg(line: DimPieceLine, divisor: DimDivisor): number | null {
  const unit = volumetricKgFromCm(line.lCm, line.wCm, line.hCm, divisor);
  if (unit === null) return null;
  const pcs = normalizePieceCount(line.pcs);
  return Math.round(unit * pcs * 100) / 100;
}

export function totalDimKgFromLines(lines: DimPieceLine[], divisor: DimDivisor): number | null {
  if (lines.length === 0) return null;
  let sum = 0;
  for (const line of lines) {
    const x = lineDimKg(line, divisor);
    if (x === null) return null;
    sum += x;
  }
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
