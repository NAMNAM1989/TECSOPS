/**
 * Quy tắc Chargeable Weight (DIM kg) theo tài liệu SCSC
 * «Required airline» — Sheet2, Update: 29MAR2025.
 *
 * File nguồn: e:/Requirerd airline.xlsx (cột Airline + Chargeable Weight).
 * Hệ số thể tích L×W×H vẫn mặc định 6000 cm³/kg (IATA) — tài liệu không nêu 5000.
 */

export type ScscChargeableRoundKind =
  /** Để 3 số lẻ → làm tròn bậc 0.5 (đa số hãng, gồm VJ). */
  | "DP3_ROUND_0_5"
  /** Để 3 số lẻ → làm tròn bậc 1 kg (TK, SQ, TR). */
  | "DP3_ROUND_1"
  /** Để 2 số lẻ → làm tròn bậc 0.5 (CX/LD). */
  | "DP2_ROUND_0_5"
  /** Làm tròn số nguyên (TG, 6E, BD). */
  | "ROUND_INTEGER"
  /**
   * QR: để 1 số lẻ — 0 giữ; 1–4 lên 0.5; ≥5 lên 1;
   * tổng sau đó làm tròn bậc 0.5.
   */
  | "QR_SPECIAL"
  /** Hãng không có trong bảng — giữ hành vi IATA 2 số lẻ cũ. */
  | "STANDARD_IATA_2DP";

export type ScscAirlineDimRule = {
  /** Mã IATA / designator trên chuyến (VJ, CX, 3U…). */
  codes: readonly string[];
  /** 3 số đầu AWB (prefix). */
  awbPrefixes: readonly string[];
  round: ScscChargeableRoundKind;
  /** Trích từ cột Chargeable Weight (gốc tiếng Việt). */
  chargeableNote: string;
  /**
   * Max trọng lượng / kiện (kg) từ cột Max weight — khi tài liệu ghi số rõ.
   * Không dùng để chặn lưu; chỉ cảnh báo (thường là gross, không phải DIM).
   */
  maxPieceKg?: number;
  /** Max kích thước kiện (cm) — so khớp sau khi sắp xếp 3 cạnh giảm dần. */
  maxDimsCm?: { l: number; w: number; h: number };
  /** Ghi chú giới hạn (máy bay / WET / …) khi không gói được 1 số. */
  limitsNote?: string;
};

/**
 * Danh mục hãng SCSC — thứ tự: mã dài / đặc thù trước khi khớp chung.
 * SF/O3, CX/LD gom chung một rule.
 */
export const SCSC_AIRLINE_DIM_RULES: readonly ScscAirlineDimRule[] = [
  {
    codes: ["VJ"],
    awbPrefixes: ["978"],
    round: "DP3_ROUND_0_5",
    chargeableNote: "Để 3 số lẻ làm tròn 0.5",
    maxPieceKg: 120,
    maxDimsCm: { l: 140, w: 100, h: 100 },
    limitsNote: "A320: 120kg / 140×100×100; SEAFOOD 40kg; WET 90×70×50",
  },
  {
    codes: ["2Y"],
    awbPrefixes: ["585"],
    round: "DP3_ROUND_0_5",
    chargeableNote: "Để 3 số lẻ làm tròn 0.5",
  },
  {
    codes: ["GM"],
    awbPrefixes: ["000"],
    round: "DP3_ROUND_0_5",
    chargeableNote: "Để 3 số lẻ làm tròn 0.5",
  },
  {
    codes: ["TK"],
    awbPrefixes: ["235"],
    round: "DP3_ROUND_1",
    chargeableNote: "Để 3 số lẻ làm tròn 1",
  },
  {
    codes: ["CV"],
    awbPrefixes: ["172"],
    round: "DP3_ROUND_0_5",
    chargeableNote: "Để 3 số lẻ làm tròn 0.5",
  },
  {
    /** SQ + TR cùng AWB 618 — cùng quy tắc Chargeable Weight. */
    codes: ["SQ", "TR"],
    awbPrefixes: ["618"],
    round: "DP3_ROUND_1",
    chargeableNote: "Để 3 số lẻ làm tròn 1",
    maxPieceKg: 50,
    maxDimsCm: { l: 150, w: 130, h: 110 },
    limitsNote: "TR ghi Max 50kg / 150×130×110; SQ MinDims riêng — áp TR khi có số",
  },
  {
    codes: ["EK"],
    awbPrefixes: ["176"],
    round: "DP3_ROUND_0_5",
    chargeableNote: "Để 3 số lẻ làm tròn 0.5",
  },
  {
    codes: ["TH"],
    awbPrefixes: ["539"],
    round: "DP3_ROUND_0_5",
    chargeableNote: "Để 3 số lẻ làm tròn 0.5",
  },
  {
    codes: ["BI"],
    awbPrefixes: ["672"],
    round: "DP3_ROUND_0_5",
    chargeableNote: "Để 3 số lẻ làm tròn 0.5",
    maxPieceKg: 99,
    maxDimsCm: { l: 110, w: 100, h: 70 },
  },
  {
    codes: ["CX", "LD"],
    awbPrefixes: ["160"],
    round: "DP2_ROUND_0_5",
    chargeableNote: "Để 2 số lẻ làm tròn 0.5",
    limitsNote: "MinDims: 1 cạnh >10cm; 3 cạnh cộng >60cm",
  },
  {
    codes: ["LH"],
    awbPrefixes: ["020"],
    round: "DP3_ROUND_0_5",
    chargeableNote: "Để 3 số lẻ làm tròn 0.5",
  },
  {
    codes: ["RH"],
    awbPrefixes: ["828"],
    round: "DP3_ROUND_0_5",
    chargeableNote: "Để 3 số lẻ làm tròn 0.5",
  },
  {
    codes: ["TW"],
    awbPrefixes: ["722"],
    round: "DP3_ROUND_0_5",
    chargeableNote: "Để 3 số lẻ làm tròn 0.5",
    maxPieceKg: 100,
    maxDimsCm: { l: 110, w: 110, h: 80 },
  },
  {
    codes: ["TG"],
    awbPrefixes: ["217"],
    round: "ROUND_INTEGER",
    chargeableNote: "Làm tròn số",
  },
  {
    codes: ["MF"],
    awbPrefixes: ["731"],
    round: "DP3_ROUND_0_5",
    chargeableNote: "Để 3 số lẻ làm tròn 0.5",
    maxPieceKg: 80,
    maxDimsCm: { l: 100, w: 60, h: 40 },
    limitsNote: "B737: 80kg / 100×60×40; B787: 250kg / 140×100×100 — mặc định cảnh báo theo B737",
  },
  {
    codes: ["JL"],
    awbPrefixes: ["131"],
    round: "DP3_ROUND_0_5",
    chargeableNote: "Để 3 số lẻ làm tròn 0.5",
  },
  {
    codes: ["6E"],
    awbPrefixes: ["312"],
    round: "ROUND_INTEGER",
    chargeableNote: "Làm tròn số",
    maxPieceKg: 150,
    maxDimsCm: { l: 110, w: 110, h: 80 },
  },
  {
    codes: ["VZ"],
    awbPrefixes: ["863"],
    round: "DP3_ROUND_0_5",
    chargeableNote: "Để 3 số lẻ làm tròn 0.5",
    maxPieceKg: 85,
    maxDimsCm: { l: 160, w: 110, h: 110 },
  },
  {
    codes: ["5X"],
    awbPrefixes: ["406"],
    round: "DP3_ROUND_0_5",
    chargeableNote: "Để 3 số lẻ làm tròn 0.5",
  },
  {
    codes: ["QH"],
    awbPrefixes: ["926"],
    round: "DP3_ROUND_0_5",
    chargeableNote: "Để 3 số lẻ làm tròn 0.5",
    maxPieceKg: 60,
    maxDimsCm: { l: 75, w: 60, h: 60 },
    limitsNote: "QH325/307 SIN/BKK: 60kg; WET 35kg / 75×60×60 — cảnh báo theo mức chặt",
  },
  {
    codes: ["YP"],
    awbPrefixes: ["350"],
    round: "DP3_ROUND_0_5",
    chargeableNote: "Để 3 số lẻ làm tròn 0.5",
  },
  {
    codes: ["7C"],
    awbPrefixes: ["806"],
    round: "DP3_ROUND_0_5",
    chargeableNote: "Để 3 số lẻ làm tròn 0.5",
    maxPieceKg: 100,
    maxDimsCm: { l: 120, w: 110, h: 80 },
  },
  {
    codes: ["VU"],
    awbPrefixes: ["759"],
    round: "DP3_ROUND_0_5",
    chargeableNote: "Để 3 số lẻ làm tròn 0.5",
    maxPieceKg: 85,
    maxDimsCm: { l: 140, w: 100, h: 100 },
  },
  {
    codes: ["3U"],
    awbPrefixes: ["876"],
    round: "DP3_ROUND_0_5",
    chargeableNote: "Để 3 số lẻ làm tròn 0.5",
    maxPieceKg: 80,
    maxDimsCm: { l: 100, w: 60, h: 40 },
    limitsNote: "A320: 80kg / 100×60×40; A330: 250kg / 140×100×100 — mặc định cảnh báo A320",
  },
  {
    codes: ["OD"],
    awbPrefixes: ["816"],
    round: "DP3_ROUND_0_5",
    chargeableNote: "Để 3 số lẻ làm tròn 0.5",
    maxPieceKg: 100,
    maxDimsCm: { l: 120, w: 80, h: 70 },
  },
  {
    codes: ["JG"],
    awbPrefixes: ["619"],
    round: "DP3_ROUND_0_5",
    chargeableNote: "Để 3 số lẻ làm tròn 0.5",
    maxPieceKg: 250,
    maxDimsCm: { l: 100, w: 100, h: 140 },
  },
  {
    codes: ["BD"],
    awbPrefixes: ["765"],
    round: "ROUND_INTEGER",
    chargeableNote: "Làm tròn số",
  },
  {
    codes: ["HU"],
    awbPrefixes: ["880"],
    round: "DP3_ROUND_0_5",
    chargeableNote: "Để 3 số lẻ làm tròn 0.5",
  },
  {
    codes: ["QR"],
    awbPrefixes: ["157"],
    round: "QR_SPECIAL",
    chargeableNote:
      "Để 1 số lẻ (0 giữ nguyên, 1→4 up 0.5, trên 5 up 1); tổng làm tròn 0.5",
  },
  {
    codes: ["SF", "O3"],
    awbPrefixes: ["921"],
    round: "DP3_ROUND_0_5",
    chargeableNote: "Để 3 số lẻ làm tròn 0.5",
  },
  {
    codes: ["HT"],
    awbPrefixes: ["877"],
    round: "DP3_ROUND_0_5",
    chargeableNote: "Để 3 số lẻ làm tròn 0.5",
  },
];

/** Tập mã chuyến đã biết (để extractFlightAirlinePrefix ưu tiên 2–3 ký tự). */
export const SCSC_KNOWN_FLIGHT_CODES: ReadonlySet<string> = new Set(
  SCSC_AIRLINE_DIM_RULES.flatMap((r) => r.codes)
);

/** Map AWB prefix → rule (một prefix → một rule; SQ+TR cùng 618 đã gộp). */
export const SCSC_RULE_BY_AWB_PREFIX: ReadonlyMap<string, ScscAirlineDimRule> = (() => {
  const m = new Map<string, ScscAirlineDimRule>();
  for (const r of SCSC_AIRLINE_DIM_RULES) {
    for (const p of r.awbPrefixes) {
      if (!m.has(p)) m.set(p, r);
    }
  }
  return m;
})();

/** Map flight code → rule */
export const SCSC_RULE_BY_FLIGHT_CODE: ReadonlyMap<string, ScscAirlineDimRule> = (() => {
  const m = new Map<string, ScscAirlineDimRule>();
  for (const r of SCSC_AIRLINE_DIM_RULES) {
    for (const c of r.codes) m.set(c, r);
  }
  return m;
})();
