/**
 * Quy tắc DIM kg kho SCSC — Required airline.1.xlsx, Sheet2, Update: 14JUL2026.
 *
 * Cột «Dim CỦA MỖI DÒNG» → lineRound (thường cắt số lẻ, không làm tròn bậc).
 * Cột «TỔNG Dim» → totalRound (làm tròn chargeable sau khi cộng các dòng).
 * Hệ số thể tích L×W×H: 6000 cm³/kg (IATA).
 */

/** Cách xử lý DIM kg trên từng dòng (cột «Dim CỦA MỖI DÒNG»). */
export type ScscLineDimRoundKind =
  | "TRUNCATE_3DP"
  | "TRUNCATE_2DP"
  | "ROUND_INTEGER"
  | "QR_LINE";

/** Cách làm tròn tổng DIM (cột «TỔNG Dim»). */
export type ScscTotalDimRoundKind =
  | "ROUND_0_5"
  | "ROUND_1"
  | "ROUND_INTEGER"
  | "QR_TOTAL";

/**
 * @deprecated Dùng lineRound + totalRound. Giữ alias cho test / dữ liệu cũ.
 */
export type ScscChargeableRoundKind =
  | "DP3_ROUND_0_5"
  | "DP3_ROUND_1"
  | "DP2_ROUND_0_5"
  | "ROUND_INTEGER"
  | "QR_SPECIAL"
  | "STANDARD_IATA_2DP";

export type ScscAirlineDimRule = {
  codes: readonly string[];
  awbPrefixes: readonly string[];
  lineRound: ScscLineDimRoundKind;
  totalRound: ScscTotalDimRoundKind;
  /** Trích cột Dim CỦA MỖI DÒNG. */
  lineNote: string;
  /** Trích cột TỔNG Dim. */
  totalNote: string;
  /** Hiển thị gộp trên UI. */
  chargeableNote: string;
  maxPieceKg?: number;
  maxDimsCm?: { l: number; w: number; h: number };
  limitsNote?: string;
};

const NOTE_LINE_TRUNC3 = "Để 3 số lẻ";
const NOTE_TOTAL_HALF = "Để 3 số lẻ làm tròn 0.5";
const NOTE_TOTAL_ONE = "Để 3 số lẻ làm tròn 1";
const NOTE_LINE_TRUNC2 = "Để 2 số lẻ";
const NOTE_TOTAL_TRUNC2_HALF = "Để 2 số lẻ làm tròn 0.5";
const NOTE_ROUND_INT = "Làm tròn số";
const NOTE_QR_LINE =
  "Để 1 số lẻ (0 giữ nguyên, 1→4 up 0.5, trên 5 up 1)";
const NOTE_QR_TOTAL = `${NOTE_QR_LINE}; tổng làm tròn 0.5`;

function ruleTrunc3TotalHalf(
  over: Partial<ScscAirlineDimRule> & Pick<ScscAirlineDimRule, "codes" | "awbPrefixes">
): ScscAirlineDimRule {
  return {
    lineRound: "TRUNCATE_3DP",
    totalRound: "ROUND_0_5",
    lineNote: NOTE_LINE_TRUNC3,
    totalNote: NOTE_TOTAL_HALF,
    chargeableNote: `${NOTE_LINE_TRUNC3} · Tổng: ${NOTE_TOTAL_HALF}`,
    ...over,
  };
}

function ruleTrunc3TotalOne(
  over: Partial<ScscAirlineDimRule> & Pick<ScscAirlineDimRule, "codes" | "awbPrefixes">
): ScscAirlineDimRule {
  return {
    lineRound: "TRUNCATE_3DP",
    totalRound: "ROUND_1",
    lineNote: NOTE_LINE_TRUNC3,
    totalNote: NOTE_TOTAL_ONE,
    chargeableNote: `${NOTE_LINE_TRUNC3} · Tổng: ${NOTE_TOTAL_ONE}`,
    ...over,
  };
}

/**
 * Danh mục hãng SCSC — 22 hãng file 14JUL2026 + legacy ngoài file.
 */
export const SCSC_AIRLINE_DIM_RULES: readonly ScscAirlineDimRule[] = [
  ruleTrunc3TotalHalf({
    codes: ["3U"],
    awbPrefixes: ["876"],
    maxDimsCm: { l: 100, w: 60, h: 40 },
    limitsNote: "A320: 100×60×40; A330: 140×100×100",
  }),
  ruleTrunc3TotalHalf({ codes: ["5X"], awbPrefixes: ["406"] }),
  {
    codes: ["6E"],
    awbPrefixes: ["312"],
    lineRound: "ROUND_INTEGER",
    totalRound: "ROUND_INTEGER",
    lineNote: NOTE_ROUND_INT,
    totalNote: NOTE_ROUND_INT,
    chargeableNote: NOTE_ROUND_INT,
    maxDimsCm: { l: 110, w: 110, h: 80 },
  },
  ruleTrunc3TotalHalf({ codes: ["9A"], awbPrefixes: [] }),
  ruleTrunc3TotalHalf({
    codes: ["BI"],
    awbPrefixes: ["672"],
    maxDimsCm: { l: 163, w: 149, h: 119 },
  }),
  ruleTrunc3TotalHalf({ codes: ["CO"], awbPrefixes: ["921"] }),
  ruleTrunc3TotalHalf({ codes: ["CV"], awbPrefixes: ["172"] }),
  {
    codes: ["CX", "LD"],
    awbPrefixes: ["160"],
    lineRound: "TRUNCATE_2DP",
    totalRound: "ROUND_0_5",
    lineNote: NOTE_LINE_TRUNC2,
    totalNote: NOTE_TOTAL_TRUNC2_HALF,
    chargeableNote: `${NOTE_LINE_TRUNC2} · Tổng: ${NOTE_TOTAL_TRUNC2_HALF}`,
    limitsNote: "MinDims: 1 cạnh >10cm; 3 cạnh cộng >60cm",
  },
  ruleTrunc3TotalHalf({ codes: ["EK"], awbPrefixes: ["176"] }),
  ruleTrunc3TotalHalf({ codes: ["HT"], awbPrefixes: ["877"] }),
  ruleTrunc3TotalHalf({ codes: ["HU"], awbPrefixes: ["880"] }),
  ruleTrunc3TotalHalf({ codes: ["JL"], awbPrefixes: ["131"] }),
  ruleTrunc3TotalHalf({
    codes: ["LH"],
    awbPrefixes: ["020"],
    limitsNote: "BUP 1 LD: 1650 kg; MD(1 J4): 2860 kg",
  }),
  ruleTrunc3TotalHalf({ codes: ["MF"], awbPrefixes: ["731"] }),
  {
    codes: ["QR"],
    awbPrefixes: ["157"],
    lineRound: "QR_LINE",
    totalRound: "QR_TOTAL",
    lineNote: NOTE_QR_LINE,
    totalNote: NOTE_QR_TOTAL,
    chargeableNote: NOTE_QR_TOTAL,
  },
  ruleTrunc3TotalOne({
    codes: ["SQ"],
    awbPrefixes: ["618"],
    limitsNote: "MinDims: 25×25×?? cm",
  }),
  ruleTrunc3TotalHalf({ codes: ["TH"], awbPrefixes: ["539"] }),
  {
    codes: ["TG"],
    awbPrefixes: ["217"],
    lineRound: "ROUND_INTEGER",
    totalRound: "ROUND_INTEGER",
    lineNote: NOTE_ROUND_INT,
    totalNote: NOTE_ROUND_INT,
    chargeableNote: NOTE_ROUND_INT,
  },
  ruleTrunc3TotalOne({
    codes: ["TR"],
    awbPrefixes: [],
    maxDimsCm: { l: 150, w: 130, h: 110 },
  }),
  ruleTrunc3TotalHalf({
    codes: ["VJ"],
    awbPrefixes: ["978"],
    maxDimsCm: { l: 140, w: 100, h: 100 },
    limitsNote: "A320: 140×100×100; WET: 90×70×50",
  }),
  ruleTrunc3TotalHalf({
    codes: ["VU"],
    awbPrefixes: ["759"],
    maxDimsCm: { l: 140, w: 100, h: 100 },
  }),
  ruleTrunc3TotalHalf({
    codes: ["VZ"],
    awbPrefixes: ["863"],
    maxDimsCm: { l: 160, w: 110, h: 110 },
  }),
  /** --- Legacy (không có trong file 14JUL2026) --- */
  ruleTrunc3TotalHalf({ codes: ["2Y"], awbPrefixes: ["585"] }),
  ruleTrunc3TotalHalf({ codes: ["GM"], awbPrefixes: ["000"] }),
  ruleTrunc3TotalOne({ codes: ["TK"], awbPrefixes: ["235"] }),
  ruleTrunc3TotalHalf({ codes: ["RH"], awbPrefixes: ["828"] }),
  ruleTrunc3TotalHalf({
    codes: ["TW"],
    awbPrefixes: ["722"],
    maxPieceKg: 100,
    maxDimsCm: { l: 110, w: 110, h: 80 },
  }),
  ruleTrunc3TotalHalf({
    codes: ["QH"],
    awbPrefixes: ["926"],
    maxPieceKg: 60,
    maxDimsCm: { l: 75, w: 60, h: 60 },
    limitsNote: "QH325/307: 60kg; WET 35kg / 75×60×60",
  }),
  ruleTrunc3TotalHalf({ codes: ["YP"], awbPrefixes: ["350"] }),
  ruleTrunc3TotalHalf({
    codes: ["7C"],
    awbPrefixes: ["806"],
    maxPieceKg: 100,
    maxDimsCm: { l: 120, w: 110, h: 80 },
  }),
  ruleTrunc3TotalHalf({
    codes: ["OD"],
    awbPrefixes: ["816"],
    maxPieceKg: 100,
    maxDimsCm: { l: 120, w: 80, h: 70 },
  }),
  ruleTrunc3TotalHalf({
    codes: ["JG"],
    awbPrefixes: ["619"],
    maxPieceKg: 250,
    maxDimsCm: { l: 100, w: 100, h: 140 },
  }),
  {
    codes: ["BD"],
    awbPrefixes: ["765"],
    lineRound: "ROUND_INTEGER",
    totalRound: "ROUND_INTEGER",
    lineNote: NOTE_ROUND_INT,
    totalNote: NOTE_ROUND_INT,
    chargeableNote: NOTE_ROUND_INT,
  },
];

/** Map policy cũ (1 field) → line + total — dùng test / IATA fallback. */
export function scscRoundKindsFromLegacyPolicy(
  policy: ScscChargeableRoundKind
): { lineRound: ScscLineDimRoundKind; totalRound: ScscTotalDimRoundKind } {
  switch (policy) {
    case "DP3_ROUND_1":
      return { lineRound: "TRUNCATE_3DP", totalRound: "ROUND_1" };
    case "DP2_ROUND_0_5":
      return { lineRound: "TRUNCATE_2DP", totalRound: "ROUND_0_5" };
    case "ROUND_INTEGER":
      return { lineRound: "ROUND_INTEGER", totalRound: "ROUND_INTEGER" };
    case "QR_SPECIAL":
      return { lineRound: "QR_LINE", totalRound: "QR_TOTAL" };
    case "DP3_ROUND_0_5":
    default:
      return { lineRound: "TRUNCATE_3DP", totalRound: "ROUND_0_5" };
  }
}

/** Policy cũ suy từ totalRound — hiển thị tổng / Excel numFmt header. */
export function legacyPolicyFromScscRule(rule: ScscAirlineDimRule): ScscChargeableRoundKind {
  switch (rule.totalRound) {
    case "ROUND_1":
      return "DP3_ROUND_1";
    case "ROUND_INTEGER":
      return "ROUND_INTEGER";
    case "QR_TOTAL":
      return "QR_SPECIAL";
    case "ROUND_0_5":
      return rule.lineRound === "TRUNCATE_2DP" ? "DP2_ROUND_0_5" : "DP3_ROUND_0_5";
    default:
      return "DP3_ROUND_0_5";
  }
}

export const SCSC_KNOWN_FLIGHT_CODES: ReadonlySet<string> = new Set(
  SCSC_AIRLINE_DIM_RULES.flatMap((r) => r.codes)
);

export const SCSC_RULE_BY_AWB_PREFIX: ReadonlyMap<string, ScscAirlineDimRule> = (() => {
  const m = new Map<string, ScscAirlineDimRule>();
  for (const r of SCSC_AIRLINE_DIM_RULES) {
    for (const p of r.awbPrefixes) {
      if (!m.has(p)) m.set(p, r);
    }
  }
  return m;
})();

export const SCSC_RULE_BY_FLIGHT_CODE: ReadonlyMap<string, ScscAirlineDimRule> = (() => {
  const m = new Map<string, ScscAirlineDimRule>();
  for (const r of SCSC_AIRLINE_DIM_RULES) {
    for (const c of r.codes) m.set(c, r);
  }
  return m;
})();
