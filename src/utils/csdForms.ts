import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  normalizeWarehouse,
  opsTeamOf,
  type OpsTeam,
} from "../constants/warehouses";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { Shipment, Warehouse } from "../types/shipment";
import { awbDigitsKey, formatAwb } from "./awbFormat";
import {
  findCustomerEntry,
  resolveSavedGoodsForBooking,
} from "./customerBookingResolve";
import { savedGoodsPrintText } from "./customerPrintProfileLink";
import { loadLastCsdTransfer, saveLastCsdTransfer } from "./csdPrintPrefs";
import { clipScscGoodsDescriptionPrint } from "./scscPrintContent";
import { notifyInfo, notifyWarning } from "../ui/notify";

/** Thêm hãng mới: mở rộng union + thêm entry trong CSD_CARRIER_PROFILES + PDF mẫu. */
export type CsdCarrier =
  | "FD"
  | "TG"
  | "MH"
  | "QR"
  | "AK"
  | "VU"
  | "VJ"
  | "SQ"
  | "TR"
  | "BI";

export type CsdCarrierProfile = {
  id: CsdCarrier;
  label: string;
  airlineName: string;
  templateUrl: string;
  /** Prefix mã chuyến (FD301 → FD, AK512 → AK, …). */
  flightPrefixes: readonly string[];
  showOrigin: boolean;
  showTransfer: boolean;
  defaultOrigin?: string;
  transferPresets: readonly string[];
};

/** Mã RA §1 theo 3 kho hoạt động (TECS / TCS / SCSC) — chỉ đóng dấu mã, không ghi tên kho. */
export type CsdRaProfile = {
  opsTeam: OpsTeam;
  raCode: string;
};

export const CSD_RA_BY_OPS_TEAM: Record<OpsTeam, CsdRaProfile> = {
  TECS: { opsTeam: "TECS", raCode: "VN/RA3/00013-01" },
  SCSC: { opsTeam: "SCSC", raCode: "VN/RA3/00009-01" },
  TCS: { opsTeam: "TCS", raCode: "VN/RA3/00010-01" },
};

export function csdRaForWarehouse(
  warehouse: Warehouse | string | undefined | null
): CsdRaProfile {
  const team = opsTeamOf(normalizeWarehouse(warehouse));
  return CSD_RA_BY_OPS_TEAM[team];
}

/** Origin mặc định CSD (FD / TG form để trống ô Origin). */
export const CSD_FD_DEFAULT_ORIGIN = "SGN";
export const CSD_DEFAULT_ORIGIN = CSD_FD_DEFAULT_ORIGIN;

export const CSD_CARRIER_PROFILES: Record<CsdCarrier, CsdCarrierProfile> = {
  FD: {
    id: "FD",
    label: "FD",
    airlineName: "Thai AirAsia",
    templateUrl: "/templates/csd/CSD-FD.pdf",
    flightPrefixes: ["FD"],
    showOrigin: true,
    showTransfer: true,
    defaultOrigin: CSD_DEFAULT_ORIGIN,
    transferPresets: ["BKK", "DMK", "CNX", "HKT"],
  },
  TG: {
    id: "TG",
    label: "TG",
    airlineName: "Thai Airways",
    templateUrl: "/templates/csd/CSD-TG.pdf",
    flightPrefixes: ["TG"],
    showOrigin: true,
    showTransfer: true,
    defaultOrigin: CSD_DEFAULT_ORIGIN,
    transferPresets: ["BKK", "HKT", "CNX", "USM"],
  },
  MH: {
    id: "MH",
    label: "MH",
    airlineName: "Malaysia Airlines",
    /** ?v= — bust cache khi đổi layout/điền mẫu. */
    templateUrl: "/templates/csd/CSD-MH.pdf?v=20260905",
    flightPrefixes: ["MH"],
    /** Origin SGN đã in sẵn trên mẫu maskargo. */
    showOrigin: false,
    showTransfer: true,
    transferPresets: ["KUL", "PEN", "BKI", "KCH"],
  },
  QR: {
    id: "QR",
    label: "QR",
    airlineName: "Qatar Airways",
    templateUrl: "/templates/csd/CSD-QR.pdf?v=20260905",
    flightPrefixes: ["QR"],
    /** Origin SGN đã in sẵn trên mẫu QTR-CGO. */
    showOrigin: false,
    showTransfer: true,
    transferPresets: ["DOH", "DXB", "BAH", "MCT"],
  },
  AK: {
    id: "AK",
    label: "AK",
    airlineName: "AirAsia",
    templateUrl: "/templates/csd/CSD-AK.pdf?v=20260905",
    flightPrefixes: ["AK"],
    /** Origin SGN + chữ RA đã in sẵn trên mẫu. */
    showOrigin: false,
    showTransfer: true,
    transferPresets: ["KUL", "BKI", "PEN", "KCH"],
  },
  VU: {
    id: "VU",
    label: "VU",
    airlineName: "Vietravel Airlines",
    templateUrl: "/templates/csd/CSD-VU.pdf?v=20260907",
    flightPrefixes: ["VU"],
    /** Origin SGN + SPX / X-RAY đã in sẵn trên mẫu SCSC. */
    showOrigin: false,
    showTransfer: true,
    transferPresets: ["HAN", "DAD", "CXR", "PQC", "HPH"],
  },
  VJ: {
    id: "VJ",
    label: "VJ",
    airlineName: "VietJet Air",
    templateUrl: "/templates/csd/CSD-IATA.pdf?v=20260907",
    flightPrefixes: ["VJ"],
    /** Mẫu IATA chung — Origin SGN đã in sẵn. */
    showOrigin: false,
    showTransfer: true,
    transferPresets: ["HAN", "DAD", "CXR", "BKK", "SIN"],
  },
  SQ: {
    id: "SQ",
    label: "SQ",
    airlineName: "Singapore Airlines",
    templateUrl: "/templates/csd/CSD-IATA.pdf?v=20260907",
    flightPrefixes: ["SQ"],
    showOrigin: false,
    showTransfer: true,
    transferPresets: ["SIN", "CGK", "BKK", "HKG"],
  },
  TR: {
    id: "TR",
    label: "TR",
    airlineName: "Scoot",
    templateUrl: "/templates/csd/CSD-IATA.pdf?v=20260907",
    flightPrefixes: ["TR"],
    showOrigin: false,
    showTransfer: true,
    transferPresets: ["SIN", "DMK", "TPE", "NRT"],
  },
  BI: {
    id: "BI",
    label: "BI",
    airlineName: "Royal Brunei Airlines",
    templateUrl: "/templates/csd/CSD-BI.pdf?v=20260907",
    flightPrefixes: ["BI"],
    /** Origin SGN + SPX / XRAY / R.A đã in sẵn. */
    showOrigin: false,
    showTransfer: true,
    transferPresets: ["BWN", "KUL", "SIN", "CGK"],
  },
};

export const CSD_TEMPLATE_URL: Record<CsdCarrier, string> = {
  FD: CSD_CARRIER_PROFILES.FD.templateUrl,
  TG: CSD_CARRIER_PROFILES.TG.templateUrl,
  MH: CSD_CARRIER_PROFILES.MH.templateUrl,
  QR: CSD_CARRIER_PROFILES.QR.templateUrl,
  AK: CSD_CARRIER_PROFILES.AK.templateUrl,
  VU: CSD_CARRIER_PROFILES.VU.templateUrl,
  VJ: CSD_CARRIER_PROFILES.VJ.templateUrl,
  SQ: CSD_CARRIER_PROFILES.SQ.templateUrl,
  TR: CSD_CARRIER_PROFILES.TR.templateUrl,
  BI: CSD_CARRIER_PROFILES.BI.templateUrl,
};

export type CsdFillFields = {
  awb: string;
  goods: string;
  dest: string;
  origin?: string;
  /** Mã sân bay Transfer/Transit (1–n điểm, vd. BKK hoặc BKK/CNX). */
  transfer?: string;
  /** Mã RA theo kho lô (đóng dấu §1). */
  raCode?: string;
  opsTeam?: OpsTeam;
};

export type PrintCsdOptions = {
  transfer?: string;
  origin?: string;
  /** Modal đã xác nhận — bỏ window.confirm tên hàng trống. */
  allowEmptyGoods?: boolean;
  /** Hồ sơ khách — lấy tên hàng đã chọn nếu lô chưa có goodsDescriptionPrint. */
  customerDirectory?: readonly CustomerDirectoryEntry[];
};

const CSD_FONT_BOLD_URL = "/fonts/NotoSans-Bold.ttf";

export type CsdPdfAssets = {
  bold?: ArrayBuffer | Uint8Array;
};

/**
 * Tên hàng in CSD (Contents):
 * 1) mô tả in trên lô
 * 2) tên hàng đã chọn / mặc định trong hồ sơ khách
 */
export function resolveCsdGoodsText(
  s: Pick<
    Shipment,
    | "goodsDescriptionPrint"
    | "customerGoodsId"
    | "customerId"
    | "customerCode"
    | "customer"
  >,
  directory: readonly CustomerDirectoryEntry[] = []
): string {
  const fromPrint = clipScscGoodsDescriptionPrint(s.goodsDescriptionPrint || "");
  if (fromPrint) return fromPrint;
  const customer = findCustomerEntry(s as Shipment, directory);
  const saved = resolveSavedGoodsForBooking(s as Shipment, customer);
  return saved ? savedGoodsPrintText(saved) : "";
}

/** Chuyến FD… → Thai AirAsia CSD. */
export function isCsdFdFlight(flight: string | undefined | null): boolean {
  return flightCarrierPrefix(flight) === "FD";
}

/** Chuyến TG… → Thai Airways CSD. */
export function isCsdTgFlight(flight: string | undefined | null): boolean {
  return flightCarrierPrefix(flight) === "TG";
}

/** Chuyến MH… → Malaysia Airlines (maskargo) CSD. */
export function isCsdMhFlight(flight: string | undefined | null): boolean {
  return flightCarrierPrefix(flight) === "MH";
}

/** Chuyến QR… → Qatar Airways CSD. */
export function isCsdQrFlight(flight: string | undefined | null): boolean {
  return flightCarrierPrefix(flight) === "QR";
}

/** Chuyến AK… → AirAsia CSD. */
export function isCsdAkFlight(flight: string | undefined | null): boolean {
  return flightCarrierPrefix(flight) === "AK";
}

/** Chuyến VU… → Vietravel Airlines CSD. */
export function isCsdVuFlight(flight: string | undefined | null): boolean {
  return flightCarrierPrefix(flight) === "VU";
}

/** Chuyến VJ… → VietJet (mẫu IATA). */
export function isCsdVjFlight(flight: string | undefined | null): boolean {
  return flightCarrierPrefix(flight) === "VJ";
}

/** Chuyến SQ… → Singapore Airlines (mẫu IATA). */
export function isCsdSqFlight(flight: string | undefined | null): boolean {
  return flightCarrierPrefix(flight) === "SQ";
}

/** Chuyến TR… → Scoot (mẫu IATA). */
export function isCsdTrFlight(flight: string | undefined | null): boolean {
  return flightCarrierPrefix(flight) === "TR";
}

/** Chuyến BI… → Royal Brunei Airlines CSD. */
export function isCsdBiFlight(flight: string | undefined | null): boolean {
  return flightCarrierPrefix(flight) === "BI";
}

/** Ba hãng dùng chung mẫu CSD-IATA.pdf. */
export function isCsdIataTemplateCarrier(carrier: CsdCarrier): boolean {
  return carrier === "VJ" || carrier === "SQ" || carrier === "TR";
}

/** @deprecated dùng isCsdTgFlight */
export function isCsdThFlight(flight: string | undefined | null): boolean {
  return isCsdTgFlight(flight);
}

/** Mẫu MH in sẵn dạng VN/RA3-00010-01 (gạch ngang sau RA3). */
export function formatCsdMhRaCode(raCode: string): string {
  return String(raCode || "")
    .trim()
    .replace(/^(VN\/RA3)\//i, "$1-");
}

export function getCsdCarrierProfile(
  carrier: CsdCarrier
): CsdCarrierProfile {
  return CSD_CARRIER_PROFILES[carrier];
}

export function flightCarrierPrefix(
  flight: string | undefined | null
): CsdCarrier | null {
  const f = String(flight || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!f) return null;
  for (const profile of Object.values(CSD_CARRIER_PROFILES)) {
    if (profile.flightPrefixes.some((px) => f.startsWith(px))) {
      return profile.id;
    }
  }
  return null;
}

export function csdCarrierForShipment(
  s: Pick<Shipment, "flight">
): CsdCarrier | null {
  return flightCarrierPrefix(s.flight);
}

export function canPrintCsd(s: Pick<Shipment, "flight" | "awb">): boolean {
  return csdCarrierForShipment(s) != null && awbDigitsKey(s.awb).length === 11;
}

/** @deprecated dùng canPrintCsd */
export function canPrintCsdFd(s: Pick<Shipment, "flight" | "awb">): boolean {
  return isCsdFdFlight(s.flight) && awbDigitsKey(s.awb).length === 11;
}

/** Chuẩn hoá Transfer: chữ hoa, tách bằng `/`, tối đa 24 ký tự in. */
export function normalizeCsdTransfer(raw: string | undefined | null): string {
  const parts = String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9/\s,-]/g, "")
    .split(/[\s,/|-]+/)
    .map((p) => p.trim())
    .filter((p) => /^[A-Z]{3}$/.test(p));
  return parts.slice(0, 4).join("/");
}

/**
 * Gợi ý Transit: nhớ lần trước theo hãng;
 * MH/AK → KUL; QR → DOH; SQ/TR → SIN; BI → BWN;
 * VU/VJ → không gợi ý hub mặc định; FD/TG → BKK.
 */
export function suggestCsdTransfer(
  dest: string | undefined | null,
  carrier: CsdCarrier
): string {
  const last = loadLastCsdTransfer(carrier);
  if (last) return last;
  const d = String(dest || "")
    .trim()
    .toUpperCase()
    .slice(0, 3);
  if (carrier === "MH" || carrier === "AK") {
    if (d && d !== "KUL") return "KUL";
    return "";
  }
  if (carrier === "QR") {
    if (d && d !== "DOH") return "DOH";
    return "";
  }
  if (carrier === "SQ" || carrier === "TR") {
    if (d && d !== "SIN") return "SIN";
    return "";
  }
  if (carrier === "BI") {
    if (d && d !== "BWN") return "BWN";
    return "";
  }
  if (carrier === "VU" || carrier === "VJ") {
    return "";
  }
  if (d && d !== "BKK" && d !== "DMK") return "BKK";
  return "";
}

export function wrapCsdGoodsLines(text: string, maxChars = 72): string[] {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return [];
  if (t.length <= maxChars) return [t];
  const words = t.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const nxt = cur ? `${cur} ${w}` : w;
    if (nxt.length <= maxChars) cur = nxt;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

export function buildCsdFields(
  s: Pick<
    Shipment,
    | "awb"
    | "dest"
    | "goodsDescriptionPrint"
    | "warehouse"
    | "customerGoodsId"
    | "customerId"
    | "customerCode"
    | "customer"
  >,
  carrier: CsdCarrier,
  overrides?: Pick<PrintCsdOptions, "transfer" | "origin" | "customerDirectory">
): CsdFillFields {
  const profile = getCsdCarrierProfile(carrier);
  const ra = csdRaForWarehouse(s.warehouse);
  const digits = awbDigitsKey(s.awb);
  const base: CsdFillFields = {
    awb: digits.length === 11 ? formatAwb(digits) : (s.awb || "").trim(),
    goods: resolveCsdGoodsText(s, overrides?.customerDirectory),
    dest: (s.dest || "").trim().toUpperCase().slice(0, 3),
    raCode: ra.raCode,
    opsTeam: ra.opsTeam,
  };
  if (profile.showOrigin) {
    const origin =
      normalizeCsdTransfer(overrides?.origin || "").split("/")[0] ||
      profile.defaultOrigin ||
      CSD_DEFAULT_ORIGIN;
    base.origin = origin.slice(0, 3);
  }
  if (profile.showTransfer) {
    const transfer = normalizeCsdTransfer(overrides?.transfer ?? "");
    if (transfer) base.transfer = transfer;
  }
  return base;
}

/** @deprecated */
export function buildCsdFdFields(
  s: Pick<
    Shipment,
    | "awb"
    | "dest"
    | "goodsDescriptionPrint"
    | "warehouse"
    | "customerGoodsId"
    | "customerId"
    | "customerCode"
    | "customer"
  >
): CsdFillFields & { origin: string } {
  return buildCsdFields(s, "FD") as CsdFillFields & { origin: string };
}

async function embedCsdBoldFont(
  pdf: PDFDocument,
  assets?: CsdPdfAssets
): Promise<Awaited<ReturnType<PDFDocument["embedFont"]>>> {
  const bytes =
    assets?.bold ??
    (await (async () => {
      const res = await fetch(CSD_FONT_BOLD_URL, { cache: "force-cache" });
      if (!res.ok) throw new Error(`Không tải được font CSD (${res.status}).`);
      return res.arrayBuffer();
    })());
  pdf.registerFontkit(fontkit);
  return pdf.embedFont(bytes);
}

function lineYToPdfLibBaseline(pageH: number, lineY: number): number {
  return pageH - (lineY - 2.5);
}

function topYToPdfLibBaseline(pageH: number, yTop: number): number {
  return pageH - yTop;
}

/** Layout FD — Letter 612×792; chữ đậm + size lớn để dễ đọc khi in. */
const LAYOUT_FD = {
  awb: { x: 414, lineY: 152, size: 13 },
  goodsLines: [
    { x: 64, lineY: 235.8 },
    { x: 64, lineY: 251.1 },
    { x: 64, lineY: 265.2 },
  ] as const,
  goodsSize: 12,
  origin: { x: 95, yTop: 325, size: 14 },
  dest: { x: 230, yTop: 325, size: 14 },
  /** §6 Transfer/Transit Points — dưới nhãn, trên đường gạch. */
  transfer: { x: 340, yTop: 332, size: 13 },
  /** §1 tick Regulated Agent + mã RA trên đường gạch. */
  raCheck: { x: 64, yTop: 155, size: 11 },
  raCode: { x: 175, yTop: 155, size: 9 },
} as const;

/**
 * Layout TG — A4 ~595×842 (TG Cargo/AVSEC F008).
 * yTop = khoảng cách từ mép trên trang (giống tọa độ PyMuPDF).
 */
const LAYOUT_TG = {
  /** §1 Regulated Entity — ghi "RA {mã}". */
  ra: { x: 40, yTop: 120, size: 11 },
  /** §2 Unique Consignment Identifier (AWB). */
  awb: { x: 330, yTop: 120, size: 13 },
  /** §3 Contents — 2 dòng trên đường chấm (y≈199 / 220). */
  goodsLines: [
    { x: 35, yTop: 196 },
    { x: 35, yTop: 217 },
  ] as const,
  goodsSize: 11,
  goodsMaxChars: 72,
  /** §4 Origin / §5 Destination / §6 Transfer. */
  origin: { x: 55, yTop: 278, size: 14 },
  dest: { x: 220, yTop: 278, size: 14 },
  transfer: { x: 410, yTop: 278, size: 13 },
  /** §14 Regulated Entity (footer). */
  footerRa: { x: 35, yTop: 678, size: 10 },
} as const;

/**
 * Layout MH — A4 ~595×842 (maskargo).
 * Ô trống: RA / AWB / Contents / DEST / Transfer; Origin SGN đã in sẵn.
 * Contents ghi bên phải Consolidation — tránh đè nhãn (khoảng dọc quá hẹp).
 */
const LAYOUT_MH = {
  ra: { x: 54, yTop: 212, size: 11 },
  awb: { x: 350, yTop: 178, size: 13 },
  goods: { x: 240, yTop: 268, size: 11 },
  goodsMaxChars: 48,
  /** Cùng hàng với Origin SGN (glyph top ≈313). */
  dest: { x: 270, yTop: 326, size: 14 },
  transfer: { x: 430, yTop: 326, size: 13 },
} as const;

/**
 * Layout AK — Letter 612×792 (AirAsia).
 * Giữ "RA" + Origin SGN in sẵn; ghi mã RA bên cạnh; AWB/Contents/DEST/Transfer trống.
 * Không wipe — tránh che nhãn trên form ảnh.
 */
const LAYOUT_AK = {
  /** Identifier sau chữ "RA" đã in. */
  ra: { x: 170, yTop: 176, size: 10 },
  awb: { x: 330, yTop: 176, size: 13 },
  /** Bên phải checkbox Consolidation. */
  goods: { x: 200, yTop: 215, size: 11 },
  goodsMaxChars: 48,
  /** Cùng hàng với Origin SGN (y≈240). */
  dest: { x: 230, yTop: 254, size: 14 },
  transfer: { x: 400, yTop: 254, size: 13 },
} as const;

/**
 * Layout QR — A4 (QTR-CGO-CSM-001-CSD).
 * Wipe CHỈ đúng bbox chữ mẫu (không phủ nhãn / Consolidation).
 * Sample fitz: RA y≈152 x52–166 · AWB y≈149 x320–410 · FABRICS y≈227 x149–195 ·
 * JED y≈273 x211–234 · DOH y≈270 x362–391.
 */
const LAYOUT_QR = {
  raWipe: { x: 50, yTop: 150, w: 125, h: 16 },
  ra: { x: 52, yTop: 162, size: 11 },
  awbWipe: { x: 315, yTop: 147, w: 105, h: 16 },
  awb: { x: 318, yTop: 160, size: 13 },
  /** Chỉ phủ "FABRICS" — không kéo xuống checkbox Consolidation. */
  goodsWipe: { x: 145, yTop: 224, w: 70, h: 14 },
  goods: { x: 148, yTop: 236, size: 11 },
  goodsMaxChars: 55,
  /** Dưới nhãn Destination (y≈251), chỉ phủ "JED". */
  destWipe: { x: 205, yTop: 270, w: 35, h: 16 },
  dest: { x: 210, yTop: 282, size: 14 },
  /** Dưới nhãn Transfer (y≈251), chỉ phủ "DOH". */
  transferWipe: { x: 355, yTop: 267, w: 42, h: 16 },
  transfer: { x: 360, yTop: 282, size: 13 },
} as const;

/**
 * Layout VU — A4 (mẫu SCSC Vietravel).
 * Origin SGN + SPX + X-RAY đã in sẵn; ô trống: RA / AWB / Contents / DEST / Transfer / footer RA.
 * Không wipe.
 */
const LAYOUT_VU = {
  ra: { x: 70, yTop: 222, size: 11 },
  awb: { x: 330, yTop: 210, size: 13 },
  goods: { x: 70, yTop: 268, size: 11 },
  goodsMaxChars: 58,
  /** Cùng hàng với Origin SGN (glyph ≈334–346). */
  dest: { x: 210, yTop: 346, size: 14 },
  transfer: { x: 335, yTop: 346, size: 13 },
  footerRa: { x: 70, yTop: 658, size: 10 },
} as const;

/**
 * Layout IATA chung — A4 (CSD-IATA.pdf) cho VJ / SQ / TR.
 * Origin SGN đã in sẵn; ô trống: RA / AWB / Contents / DEST / Transfer /
 * Security Status (SPX) / Screening (XRY) / footer RA. Không wipe.
 */
const LAYOUT_IATA = {
  ra: { x: 65, yTop: 188, size: 11 },
  awb: { x: 300, yTop: 188, size: 13 },
  /** Bên phải checkbox Consolidation. */
  goods: { x: 130, yTop: 236, size: 11 },
  goodsMaxChars: 55,
  /** Cùng hàng với Origin SGN (glyph ≈276–286). */
  dest: { x: 190, yTop: 286, size: 13 },
  transfer: { x: 320, yTop: 286, size: 12 },
  /** Security Status — ghi mã SPX. */
  securityStatus: { x: 68, yTop: 340, size: 12 },
  /** Screening Method (codes) — ghi XRY. */
  screening: { x: 275, yTop: 355, size: 11 },
  footerRa: { x: 65, yTop: 532, size: 10 },
} as const;

/**
 * Layout BI — A4 (Royal Brunei).
 * Origin SGN + SPX + XRAY + Received from R.A đã in sẵn.
 * Ô trống: RA / AWB / Contents / DEST / Transfer / footer RA. Không wipe.
 */
const LAYOUT_BI = {
  ra: { x: 65, yTop: 185, size: 11 },
  awb: { x: 310, yTop: 185, size: 13 },
  goods: { x: 70, yTop: 238, size: 11 },
  goodsMaxChars: 55,
  /** Cùng hàng với Origin SGN (glyph ≈303–318). */
  dest: { x: 200, yTop: 316, size: 14 },
  transfer: { x: 320, yTop: 316, size: 13 },
  footerRa: { x: 65, yTop: 620, size: 10 },
} as const;

/**
 * Phủ trắng vùng giá trị mẫu. Caller phải truyền bbox sát chữ — không phủ nhãn.
 */
function wipeRect(
  page: {
    getHeight: () => number;
    drawRectangle: (opts: {
      x: number;
      y: number;
      width: number;
      height: number;
      color: ReturnType<typeof rgb>;
      borderWidth: number;
    }) => void;
  },
  box: { x: number; yTop: number; w: number; h: number }
) {
  const pageH = page.getHeight();
  page.drawRectangle({
    x: box.x,
    y: pageH - box.yTop - box.h,
    width: box.w,
    height: box.h,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });
}

async function loadTemplate(carrier: CsdCarrier): Promise<ArrayBuffer> {
  const url = getCsdCarrierProfile(carrier).templateUrl;
  /** no-cache: tránh giữ PDF mẫu cũ trong HTTP cache trình duyệt. */
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(
      `Không tải được mẫu CSD ${carrier} (${res.status}). Kiểm tra ${url}.`
    );
  }
  return res.arrayBuffer();
}

export async function fillCsdPdfBytes(
  carrier: CsdCarrier,
  fields: CsdFillFields,
  templateBytes?: ArrayBuffer | Uint8Array,
  assets?: CsdPdfAssets
): Promise<Uint8Array> {
  const raw = templateBytes ?? (await loadTemplate(carrier));
  const pdf = await PDFDocument.load(raw);
  const page = pdf.getPages()[0];
  if (!page) throw new Error(`Mẫu CSD ${carrier} không có trang.`);
  const pageH = page.getHeight();
  let fontBold;
  try {
    fontBold = await embedCsdBoldFont(pdf, assets);
  } catch {
    fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  }
  const ink = rgb(0, 0, 0);
  const raCode = (fields.raCode || "").trim();
  const raLabel = raCode ? `RA ${raCode}` : "";

  const draw = (text: string, x: number, y: number, size: number) => {
    const t = text.trim();
    if (!t) return;
    page.drawText(t, { x, y, size, font: fontBold, color: ink });
  };

  if (carrier === "FD") {
    if (raCode) {
      draw(
        "X",
        LAYOUT_FD.raCheck.x,
        topYToPdfLibBaseline(pageH, LAYOUT_FD.raCheck.yTop),
        LAYOUT_FD.raCheck.size
      );
      draw(
        raCode,
        LAYOUT_FD.raCode.x,
        topYToPdfLibBaseline(pageH, LAYOUT_FD.raCode.yTop),
        LAYOUT_FD.raCode.size
      );
    }
    draw(
      fields.awb,
      LAYOUT_FD.awb.x,
      lineYToPdfLibBaseline(pageH, LAYOUT_FD.awb.lineY),
      LAYOUT_FD.awb.size
    );
    wrapCsdGoodsLines(fields.goods, 58).forEach((line, i) => {
      const slot = LAYOUT_FD.goodsLines[i];
      if (!slot) return;
      draw(
        line,
        slot.x,
        lineYToPdfLibBaseline(pageH, slot.lineY),
        LAYOUT_FD.goodsSize
      );
    });
    draw(
      fields.origin || CSD_DEFAULT_ORIGIN,
      LAYOUT_FD.origin.x,
      topYToPdfLibBaseline(pageH, LAYOUT_FD.origin.yTop),
      LAYOUT_FD.origin.size
    );
    draw(
      fields.dest,
      LAYOUT_FD.dest.x,
      topYToPdfLibBaseline(pageH, LAYOUT_FD.dest.yTop),
      LAYOUT_FD.dest.size
    );
    if (fields.transfer) {
      draw(
        fields.transfer,
        LAYOUT_FD.transfer.x,
        topYToPdfLibBaseline(pageH, LAYOUT_FD.transfer.yTop),
        LAYOUT_FD.transfer.size
      );
    }
  } else if (carrier === "MH") {
    /* maskargo A4 — ô trống: ghi RA + AWB + Contents + DEST + Transfer */
    const mhRa = formatCsdMhRaCode(raCode);
    if (mhRa) {
      draw(
        mhRa,
        LAYOUT_MH.ra.x,
        topYToPdfLibBaseline(pageH, LAYOUT_MH.ra.yTop),
        LAYOUT_MH.ra.size
      );
    }
    draw(
      fields.awb,
      LAYOUT_MH.awb.x,
      topYToPdfLibBaseline(pageH, LAYOUT_MH.awb.yTop),
      LAYOUT_MH.awb.size
    );
    const goodsLine =
      wrapCsdGoodsLines(fields.goods, LAYOUT_MH.goodsMaxChars)[0] ||
      fields.goods;
    draw(
      goodsLine,
      LAYOUT_MH.goods.x,
      topYToPdfLibBaseline(pageH, LAYOUT_MH.goods.yTop),
      LAYOUT_MH.goods.size
    );
    if (fields.dest) {
      draw(
        fields.dest,
        LAYOUT_MH.dest.x,
        topYToPdfLibBaseline(pageH, LAYOUT_MH.dest.yTop),
        LAYOUT_MH.dest.size
      );
    }
    if (fields.transfer) {
      draw(
        fields.transfer,
        LAYOUT_MH.transfer.x,
        topYToPdfLibBaseline(pageH, LAYOUT_MH.transfer.yTop),
        LAYOUT_MH.transfer.size
      );
    }
  } else if (carrier === "AK") {
    /* AirAsia — giữ "RA"/SGN in sẵn; ghi mã RA + AWB + Contents + DEST + Transfer */
    if (raCode) {
      draw(
        raCode,
        LAYOUT_AK.ra.x,
        topYToPdfLibBaseline(pageH, LAYOUT_AK.ra.yTop),
        LAYOUT_AK.ra.size
      );
    }
    draw(
      fields.awb,
      LAYOUT_AK.awb.x,
      topYToPdfLibBaseline(pageH, LAYOUT_AK.awb.yTop),
      LAYOUT_AK.awb.size
    );
    const goodsLine =
      wrapCsdGoodsLines(fields.goods, LAYOUT_AK.goodsMaxChars)[0] ||
      fields.goods;
    draw(
      goodsLine,
      LAYOUT_AK.goods.x,
      topYToPdfLibBaseline(pageH, LAYOUT_AK.goods.yTop),
      LAYOUT_AK.goods.size
    );
    if (fields.dest) {
      draw(
        fields.dest,
        LAYOUT_AK.dest.x,
        topYToPdfLibBaseline(pageH, LAYOUT_AK.dest.yTop),
        LAYOUT_AK.dest.size
      );
    }
    if (fields.transfer) {
      draw(
        fields.transfer,
        LAYOUT_AK.transfer.x,
        topYToPdfLibBaseline(pageH, LAYOUT_AK.transfer.yTop),
        LAYOUT_AK.transfer.size
      );
    }
  } else if (carrier === "QR") {
    /* Qatar Airways — wipe giá trị mẫu rồi ghi RA/AWB/Contents/DEST/Transfer */
    if (raCode) {
      wipeRect(page, LAYOUT_QR.raWipe);
      draw(
        raCode,
        LAYOUT_QR.ra.x,
        topYToPdfLibBaseline(pageH, LAYOUT_QR.ra.yTop),
        LAYOUT_QR.ra.size
      );
    }
    wipeRect(page, LAYOUT_QR.awbWipe);
    draw(
      fields.awb,
      LAYOUT_QR.awb.x,
      topYToPdfLibBaseline(pageH, LAYOUT_QR.awb.yTop),
      LAYOUT_QR.awb.size
    );
    wipeRect(page, LAYOUT_QR.goodsWipe);
    const goodsLine =
      wrapCsdGoodsLines(fields.goods, LAYOUT_QR.goodsMaxChars)[0] ||
      fields.goods;
    draw(
      goodsLine,
      LAYOUT_QR.goods.x,
      topYToPdfLibBaseline(pageH, LAYOUT_QR.goods.yTop),
      LAYOUT_QR.goods.size
    );
    wipeRect(page, LAYOUT_QR.destWipe);
    if (fields.dest) {
      draw(
        fields.dest,
        LAYOUT_QR.dest.x,
        topYToPdfLibBaseline(pageH, LAYOUT_QR.dest.yTop),
        LAYOUT_QR.dest.size
      );
    }
    wipeRect(page, LAYOUT_QR.transferWipe);
    if (fields.transfer) {
      draw(
        fields.transfer,
        LAYOUT_QR.transfer.x,
        topYToPdfLibBaseline(pageH, LAYOUT_QR.transfer.yTop),
        LAYOUT_QR.transfer.size
      );
    }
  } else if (carrier === "VU") {
    /* Vietravel — giữ SGN/SPX/X-RAY; ghi RA + AWB + Contents + DEST + Transfer (+ footer RA) */
    if (raLabel) {
      draw(
        raLabel,
        LAYOUT_VU.ra.x,
        topYToPdfLibBaseline(pageH, LAYOUT_VU.ra.yTop),
        LAYOUT_VU.ra.size
      );
      draw(
        raLabel,
        LAYOUT_VU.footerRa.x,
        topYToPdfLibBaseline(pageH, LAYOUT_VU.footerRa.yTop),
        LAYOUT_VU.footerRa.size
      );
    }
    draw(
      fields.awb,
      LAYOUT_VU.awb.x,
      topYToPdfLibBaseline(pageH, LAYOUT_VU.awb.yTop),
      LAYOUT_VU.awb.size
    );
    const goodsLine =
      wrapCsdGoodsLines(fields.goods, LAYOUT_VU.goodsMaxChars)[0] ||
      fields.goods;
    draw(
      goodsLine,
      LAYOUT_VU.goods.x,
      topYToPdfLibBaseline(pageH, LAYOUT_VU.goods.yTop),
      LAYOUT_VU.goods.size
    );
    if (fields.dest) {
      draw(
        fields.dest,
        LAYOUT_VU.dest.x,
        topYToPdfLibBaseline(pageH, LAYOUT_VU.dest.yTop),
        LAYOUT_VU.dest.size
      );
    }
    if (fields.transfer) {
      draw(
        fields.transfer,
        LAYOUT_VU.transfer.x,
        topYToPdfLibBaseline(pageH, LAYOUT_VU.transfer.yTop),
        LAYOUT_VU.transfer.size
      );
    }
  } else if (isCsdIataTemplateCarrier(carrier)) {
    /* IATA blank (VJ/SQ/TR) — giữ SGN; ghi RA/AWB/Contents/DEST/Transfer + SPX/XRY */
    if (raLabel) {
      draw(
        raLabel,
        LAYOUT_IATA.ra.x,
        topYToPdfLibBaseline(pageH, LAYOUT_IATA.ra.yTop),
        LAYOUT_IATA.ra.size
      );
      draw(
        raLabel,
        LAYOUT_IATA.footerRa.x,
        topYToPdfLibBaseline(pageH, LAYOUT_IATA.footerRa.yTop),
        LAYOUT_IATA.footerRa.size
      );
    }
    draw(
      fields.awb,
      LAYOUT_IATA.awb.x,
      topYToPdfLibBaseline(pageH, LAYOUT_IATA.awb.yTop),
      LAYOUT_IATA.awb.size
    );
    const goodsLine =
      wrapCsdGoodsLines(fields.goods, LAYOUT_IATA.goodsMaxChars)[0] ||
      fields.goods;
    draw(
      goodsLine,
      LAYOUT_IATA.goods.x,
      topYToPdfLibBaseline(pageH, LAYOUT_IATA.goods.yTop),
      LAYOUT_IATA.goods.size
    );
    if (fields.dest) {
      draw(
        fields.dest,
        LAYOUT_IATA.dest.x,
        topYToPdfLibBaseline(pageH, LAYOUT_IATA.dest.yTop),
        LAYOUT_IATA.dest.size
      );
    }
    if (fields.transfer) {
      draw(
        fields.transfer,
        LAYOUT_IATA.transfer.x,
        topYToPdfLibBaseline(pageH, LAYOUT_IATA.transfer.yTop),
        LAYOUT_IATA.transfer.size
      );
    }
    draw(
      "SPX",
      LAYOUT_IATA.securityStatus.x,
      topYToPdfLibBaseline(pageH, LAYOUT_IATA.securityStatus.yTop),
      LAYOUT_IATA.securityStatus.size
    );
    draw(
      "XRY",
      LAYOUT_IATA.screening.x,
      topYToPdfLibBaseline(pageH, LAYOUT_IATA.screening.yTop),
      LAYOUT_IATA.screening.size
    );
  } else if (carrier === "BI") {
    /* Royal Brunei — giữ SGN/SPX/XRAY/R.A; ghi RA + AWB + Contents + DEST + Transfer */
    if (raLabel) {
      draw(
        raLabel,
        LAYOUT_BI.ra.x,
        topYToPdfLibBaseline(pageH, LAYOUT_BI.ra.yTop),
        LAYOUT_BI.ra.size
      );
      draw(
        raLabel,
        LAYOUT_BI.footerRa.x,
        topYToPdfLibBaseline(pageH, LAYOUT_BI.footerRa.yTop),
        LAYOUT_BI.footerRa.size
      );
    }
    draw(
      fields.awb,
      LAYOUT_BI.awb.x,
      topYToPdfLibBaseline(pageH, LAYOUT_BI.awb.yTop),
      LAYOUT_BI.awb.size
    );
    const goodsLine =
      wrapCsdGoodsLines(fields.goods, LAYOUT_BI.goodsMaxChars)[0] ||
      fields.goods;
    draw(
      goodsLine,
      LAYOUT_BI.goods.x,
      topYToPdfLibBaseline(pageH, LAYOUT_BI.goods.yTop),
      LAYOUT_BI.goods.size
    );
    if (fields.dest) {
      draw(
        fields.dest,
        LAYOUT_BI.dest.x,
        topYToPdfLibBaseline(pageH, LAYOUT_BI.dest.yTop),
        LAYOUT_BI.dest.size
      );
    }
    if (fields.transfer) {
      draw(
        fields.transfer,
        LAYOUT_BI.transfer.x,
        topYToPdfLibBaseline(pageH, LAYOUT_BI.transfer.yTop),
        LAYOUT_BI.transfer.size
      );
    }
  } else {
    /* TG — mẫu A4 trống: ghi §1 RA, §2 AWB, §3 Contents, §4–6, §14 RA */
    if (raLabel) {
      draw(
        raLabel,
        LAYOUT_TG.ra.x,
        topYToPdfLibBaseline(pageH, LAYOUT_TG.ra.yTop),
        LAYOUT_TG.ra.size
      );
      draw(
        raLabel,
        LAYOUT_TG.footerRa.x,
        topYToPdfLibBaseline(pageH, LAYOUT_TG.footerRa.yTop),
        LAYOUT_TG.footerRa.size
      );
    }
    draw(
      fields.awb,
      LAYOUT_TG.awb.x,
      topYToPdfLibBaseline(pageH, LAYOUT_TG.awb.yTop),
      LAYOUT_TG.awb.size
    );
    wrapCsdGoodsLines(fields.goods, LAYOUT_TG.goodsMaxChars).forEach(
      (line, i) => {
        const slot = LAYOUT_TG.goodsLines[i];
        if (!slot) return;
        draw(
          line,
          slot.x,
          topYToPdfLibBaseline(pageH, slot.yTop),
          LAYOUT_TG.goodsSize
        );
      }
    );
    draw(
      fields.origin || CSD_DEFAULT_ORIGIN,
      LAYOUT_TG.origin.x,
      topYToPdfLibBaseline(pageH, LAYOUT_TG.origin.yTop),
      LAYOUT_TG.origin.size
    );
    draw(
      fields.dest,
      LAYOUT_TG.dest.x,
      topYToPdfLibBaseline(pageH, LAYOUT_TG.dest.yTop),
      LAYOUT_TG.dest.size
    );
    if (fields.transfer) {
      draw(
        fields.transfer,
        LAYOUT_TG.transfer.x,
        topYToPdfLibBaseline(pageH, LAYOUT_TG.transfer.yTop),
        LAYOUT_TG.transfer.size
      );
    }
  }

  return pdf.save();
}

/** @deprecated */
export async function fillCsdFdPdfBytes(
  fields: CsdFillFields,
  templateBytes?: ArrayBuffer,
  assets?: CsdPdfAssets
): Promise<Uint8Array> {
  return fillCsdPdfBytes("FD", fields, templateBytes, assets);
}

/** Chuẩn hoá đoạn tên file CSD (bỏ ký tự Windows-illegal; giữ khoảng trắng tên khách). */
export function sanitizeCsdFilenamePart(
  raw: string | undefined | null,
  fallback = "NA"
): string {
  const t = String(raw ?? "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .replace(/_+/g, "_")
    .replace(/^[\s._-]+|[\s._-]+$/g, "");
  return t || fallback;
}

/**
 * Tên file tải về: `{kho}_{hãng}_{awb}_{tên khách}.pdf`
 * Ví dụ: `tecs_qr_15799888899_tín phát.pdf`
 * — kho = ops team (tecs/tcs/scsc); awb = 11 số; khách = tên khách (không dùng mã).
 */
export function csdDownloadFilename(input: {
  carrier: CsdCarrier;
  awb: string;
  warehouse?: string | null;
  customer?: string | null;
  /** @deprecated không dùng cho tên file — chỉ tên khách (`customer`). */
  customerCode?: string | null;
}): string {
  const team = opsTeamOf(normalizeWarehouse(input.warehouse));
  const kho = team.toLowerCase();
  const hang = input.carrier.toLowerCase();
  const digits = awbDigitsKey(input.awb);
  const awb = digits || "draft";
  const khach = sanitizeCsdFilenamePart(input.customer, "khach").toLowerCase();
  return `${kho}_${hang}_${awb}_${khach}.pdf`;
}

function downloadPdfBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Điền CSD theo mã chuyến → tải PDF + mở hộp thoại In.
 * Nên gọi từ popup với `transfer` đã nhập.
 */
export async function printCsdForShipment(
  s: Shipment,
  opts: PrintCsdOptions = {}
): Promise<void> {
  const carrier = csdCarrierForShipment(s);
  if (!carrier) {
    const known = Object.values(CSD_CARRIER_PROFILES)
      .map((p) => `${p.label} (${p.airlineName})`)
      .join(", ");
    notifyWarning(`Form CSD chỉ áp dụng cho chuyến: ${known}.`, "In CSD");
    return;
  }
  if (awbDigitsKey(s.awb).length !== 11) {
    notifyWarning("AWB phải đủ 11 số để in CSD.", "In CSD");
    return;
  }
  const fields = buildCsdFields(s, carrier, opts);
  if (!fields.dest) {
    notifyWarning("Lô chưa có DEST — nhập mã sân bay đích trước khi in CSD.", "In CSD");
    return;
  }
  if (!fields.goods && !opts.allowEmptyGoods) {
    const ok = window.confirm(
      "Lô chưa có tên hàng (mô tả hàng in ấn). Vẫn in CSD với Contents trống?"
    );
    if (!ok) return;
  }

  if (fields.transfer) {
    saveLastCsdTransfer(carrier, fields.transfer);
  }

  const bytes = await fillCsdPdfBytes(carrier, fields);
  const filename = csdDownloadFilename({
    carrier,
    awb: s.awb,
    warehouse: s.warehouse,
    customer: s.customer,
    customerCode: s.customerCode,
  });

  downloadPdfBytes(bytes, filename);

  const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) {
    notifyInfo(`Đã tải ${filename}. Cho phép popup nếu muốn mở bản in ngay.`, "In CSD");
    return;
  }
  window.setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch {
      /* tab PDF vẫn mở để in tay */
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  }, 600);
}

/** @deprecated dùng printCsdForShipment */
export async function printCsdFdForShipment(s: Shipment): Promise<void> {
  return printCsdForShipment(s);
}
