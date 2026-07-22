import {

  applyScscLineDimRounding,

  applyScscTotalDimRounding,

  formatScscLineDimKg,

  formatScscTotalDimKg,

  resolveScscAirlineDimRule,

  scscChargeableKindFromShipment,

  truncatePositiveKg,

  type ScscAirlineDimRule,

  type ScscChargeableRoundKind,

} from "./scscChargeableWeight";

import {

  legacyPolicyFromScscRule,

  scscRoundKindsFromLegacyPolicy,

  type ScscLineDimRoundKind,

  type ScscTotalDimRoundKind,

} from "../constants/scscAirlineChargeableRules";



/** Hệ số thể tích phổ biến: cm³/kg (IATA thường 6000; một số hãng/điều kiện 5000). */

export const DIM_DIVISORS = [6000, 5000] as const;

export type DimDivisor = (typeof DIM_DIVISORS)[number];



/**

 * Tiền tố mã chuyến (2–3 chữ đầu) dùng hệ số **5000** cm³/kg.

 * Tài liệu SCSC Required airline không nêu 5000 — danh sách trống → luôn 6000.

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



function normalizeLegacyPolicy(policy: DimRoundingPolicyId): ScscChargeableRoundKind {

  if (policy === "VJ_TRUNC3_LINE_SUM_NO_TOTAL_ROUND") return "DP3_ROUND_0_5";

  return policy;

}



export type ScscDimRoundContext =

  | ScscAirlineDimRule

  | DimRoundingPolicyId

  | { flight: string; awb?: string };



function resolveDimRoundContext(ctx: ScscDimRoundContext): {

  lineRound: ScscLineDimRoundKind;

  totalRound: ScscTotalDimRoundKind;

  legacyPolicy: ScscChargeableRoundKind;

} {

  if (typeof ctx === "object" && "lineRound" in ctx) {

    return {

      lineRound: ctx.lineRound,

      totalRound: ctx.totalRound,

      legacyPolicy: legacyPolicyFromScscRule(ctx),

    };

  }

  if (typeof ctx === "object" && "flight" in ctx) {

    const rule = resolveScscAirlineDimRule(ctx.flight, ctx.awb ?? "");

    if (rule) {

      return {

        lineRound: rule.lineRound,

        totalRound: rule.totalRound,

        legacyPolicy: legacyPolicyFromScscRule(rule),

      };

    }

    return {

      lineRound: "TRUNCATE_3DP",

      totalRound: "ROUND_0_5",

      legacyPolicy: "STANDARD_IATA_2DP",

    };

  }

  const legacy = normalizeLegacyPolicy(ctx);

  if (legacy === "STANDARD_IATA_2DP") {

    return {

      lineRound: "TRUNCATE_3DP",

      totalRound: "ROUND_0_5",

      legacyPolicy: legacy,

    };

  }

  const kinds = scscRoundKindsFromLegacyPolicy(legacy);

  return { ...kinds, legacyPolicy: legacy };

}



/** Suy ra chính sách legacy (total) từ mã chuyến (+ AWB). */

export function dimRoundingPolicyFromFlight(flight: string, awb = ""): DimRoundingPolicyId {

  return scscChargeableKindFromShipment(flight, awb);

}



/** Hiển thị kg DIM dòng theo quy tắc SCSC. */

export function formatLineDimKgDisplay(

  kg: number,

  ctx: ScscDimRoundContext

): string {

  const { lineRound, legacyPolicy } = resolveDimRoundContext(ctx);

  if (legacyPolicy === "STANDARD_IATA_2DP") {

    return String(Math.round(kg * 100) / 100);

  }

  return formatScscLineDimKg(kg, lineRound);

}



/** Hiển thị kg DIM tổng theo quy tắc SCSC. */

export function formatDimKgDisplay(kg: number, ctx: ScscDimRoundContext): string {

  const { totalRound, legacyPolicy } = resolveDimRoundContext(ctx);

  if (legacyPolicy === "STANDARD_IATA_2DP") {

    return String(Math.round(kg * 100) / 100);

  }

  return formatScscTotalDimKg(kg, totalRound);

}



/** DIM kg trên lô — theo mã chuyến (+ AWB). */
export function formatShipmentDimWeightKg(
  flight: string,
  dimWeightKg: number | null,
  awb = ""
): string {
  if (dimWeightKg == null) return "—";
  return formatDimKgDisplay(dimWeightKg, { flight, awb });
}

export type ShipmentDimWeightInput = {
  flight: string;
  awb?: string;
  dimWeightKg?: number | null;
  dimLines?: DimPieceLine[] | null;
  dimDivisor?: DimDivisor | null;
};

/** Tổng DIM hiển thị — ưu tiên dimWeightKg, fallback tính từ dimLines. */
export function resolveShipmentDimWeightKg(input: ShipmentDimWeightInput): number | null {
  if (input.dimWeightKg != null && Number.isFinite(input.dimWeightKg)) {
    return input.dimWeightKg;
  }
  const lines = input.dimLines;
  if (!lines?.length) return null;
  const divisor =
    input.dimDivisor === 5000 || input.dimDivisor === 6000
      ? input.dimDivisor
      : dimDivisorFromFlight(input.flight);
  return totalDimKgFromLines(lines, divisor, {
    flight: input.flight,
    awb: input.awb ?? "",
  });
}

/** Format DIM trên grid — khớp modal khi có dimLines nhưng thiếu dimWeightKg. */
export function formatShipmentDimWeightDisplay(input: ShipmentDimWeightInput): string {
  const kg = resolveShipmentDimWeightKg(input);
  if (kg == null) return "—";
  return formatDimKgDisplay(kg, { flight: input.flight, awb: input.awb ?? "" });
}



/** Một nhóm kiện cùng kích thước (cm). */

export type DimPieceLine = {

  lCm: number;

  wCm: number;

  hCm: number;

  pcs: number;

  estimated?: boolean;

};



export function normalizeDimEdgeCm(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(1, Math.round(n));
}

export function parsePositiveNumbersFromText(s: string): number[] {
  return extractNumbersFromDimText(s);
}

/** Trích số từ text DIM — hỗ trợ dán Excel, khoảng trắng, x/X/*, dấu gạch, tab. */
export function extractNumbersFromDimText(s: string): number[] {
  const normalized = s
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/,/g, ".")
    .replace(/[×xX*]/g, " ")
    .replace(/[\\/|;|\u060C]/g, " ")
    .replace(/[-–—]+/g, " ")
    .replace(/\b(cm|mm|kgs?|kiện|kien|pcs|pc|p)\b/gi, " ")
    .replace(/\b[dDrRcChH]\s*[:=]?\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const m = normalized.match(/\d+(?:\.\d+)?/g);
  if (!m) return [];

  return m
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);
}



export function volumetricKgFromCm(

  lengthCm: number,

  widthCm: number,

  heightCm: number,

  divisor: DimDivisor,

  ctx: ScscDimRoundContext = "STANDARD_IATA_2DP"

): number | null {

  if (!Number.isFinite(lengthCm) || !Number.isFinite(widthCm) || !Number.isFinite(heightCm)) return null;

  if (lengthCm <= 0 || widthCm <= 0 || heightCm <= 0) return null;

  const v = (lengthCm * widthCm * heightCm) / divisor;

  if (!Number.isFinite(v) || v <= 0) return null;

  const { lineRound, legacyPolicy } = resolveDimRoundContext(ctx);

  if (legacyPolicy === "STANDARD_IATA_2DP") {

    return Math.round(v * 100) / 100;

  }

  return applyScscLineDimRounding(v, lineRound);

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



/** DIM một dòng = cắt/làm tròn ((D×R×C÷6000)×kiện) theo cột «Dim CỦA MỖI DÒNG». */

export function lineDimKg(

  line: DimPieceLine,

  divisor: DimDivisor,

  ctx: ScscDimRoundContext = "STANDARD_IATA_2DP"

): number | null {

  const rawUnit = (line.lCm * line.wCm * line.hCm) / divisor;

  if (!Number.isFinite(rawUnit) || rawUnit <= 0) return null;

  const pcs = normalizePieceCount(line.pcs);

  const rawLine = rawUnit * pcs;

  const { lineRound, legacyPolicy } = resolveDimRoundContext(ctx);

  if (legacyPolicy === "STANDARD_IATA_2DP") {

    const unit = Math.round(rawUnit * 100) / 100;

    return Math.round(unit * pcs * 100) / 100;

  }

  return applyScscLineDimRounding(rawLine, lineRound);

}



export function totalDimKgFromLines(

  lines: DimPieceLine[],

  divisor: DimDivisor,

  ctx: ScscDimRoundContext = "STANDARD_IATA_2DP"

): number | null {

  if (lines.length === 0) return null;

  const { totalRound, legacyPolicy } = resolveDimRoundContext(ctx);

  let sum = 0;

  for (const line of lines) {

    const x = lineDimKg(line, divisor, ctx);

    if (x === null) return null;

    sum += x;

  }

  if (legacyPolicy === "STANDARD_IATA_2DP") {

    return Math.round(sum * 100) / 100;

  }

  return applyScscTotalDimRounding(sum, totalRound);

}



export { truncatePositiveKg };



export function parseDimLineQuadsFromNumbers(nums: number[]): DimPieceLine[] {

  const out: DimPieceLine[] = [];

  let i = 0;

  while (i < nums.length) {

    const rest = nums.length - i;

    if (rest >= 4) {

      out.push({

        lCm: normalizeDimEdgeCm(nums[i]),

        wCm: normalizeDimEdgeCm(nums[i + 1]),

        hCm: normalizeDimEdgeCm(nums[i + 2]),

        pcs: normalizePieceCount(nums[i + 3]),

      });

      i += 4;

    } else if (rest === 3) {

      out.push({

        lCm: normalizeDimEdgeCm(nums[i]),

        wCm: normalizeDimEdgeCm(nums[i + 1]),

        hCm: normalizeDimEdgeCm(nums[i + 2]),

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

        lCm: normalizeDimEdgeCm(nums[i]),

        wCm: normalizeDimEdgeCm(nums[i + 1]),

        hCm: normalizeDimEdgeCm(nums[i + 2]),

        pcs: normalizePieceCount(nums[i + 3]),

      });

      i += 4;

    } else if (rest === 3) {

      out.push({

        lCm: normalizeDimEdgeCm(nums[i]),

        wCm: normalizeDimEdgeCm(nums[i + 1]),

        hCm: normalizeDimEdgeCm(nums[i + 2]),

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

    const nums = extractNumbersFromDimText(line);

    if (nums.length === 0) {

      return {

        ok: false,

        error:

          physicalLines.length > 1

            ? `Dòng ${idx + 1} không có số hợp lệ: "${line}"`

            : "Không nhận diện được số — thử D×R×C×kiện hoặc dán từ Excel.",

      };

    }

    const parsed = parseDimLineQuadsFromNumbersStrict(nums);

    if (parsed === null) {

      const hint =

        physicalLines.length > 1

          ? `Dòng ${idx + 1} không hợp lệ (mỗi nhóm 4 số D-R-C-kiện hoặc 3 số D-R-C): "${line}"`

          : nums.length % 4 === 1 || nums.length % 4 === 2

            ? `Số lượng số (${nums.length}) không khớp nhóm 3 hoặc 4 — kiểm tra lại dòng dán.`

            : "Số không khớp nhóm — mỗi nhóm cần 4 số (D, R, C, kiện) hoặc 3 số (D, R, C).";

      return { ok: false, error: hint };

    }

    all.push(...parsed);

  }



  return { ok: true, lines: all };

}


