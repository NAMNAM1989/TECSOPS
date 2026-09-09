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
import {
  loadLastCsdTransfer,
  saveLastCsdEkIssuer,
  saveLastCsdTransfer,
} from "./csdPrintPrefs";
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
  | "BI"
  | "EK"
  | "PR";

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
  EK: {
    id: "EK",
    label: "EK",
    airlineName: "Emirates SkyCargo",
    templateUrl: "/templates/csd/CSD-EK.pdf?v=20260908fill",
    flightPrefixes: ["EK"],
    /** Origin/Transfer auto SGN + DXB trên CSD; Letter routing SGN-DXB-{DEST}. */
    showOrigin: false,
    showTransfer: false,
    transferPresets: ["DXB"],
  },
  PR: {
    id: "PR",
    label: "PR",
    airlineName: "Philippine Airlines",
    templateUrl: "/templates/csd/CSD-PR.pdf?v=20260908",
    flightPrefixes: ["PR"],
    /** Origin SGN + SPX / X-RAY / defaults đã in sẵn trên F-0462. */
    showOrigin: false,
    showTransfer: false,
    transferPresets: ["MNL"],
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
  EK: CSD_CARRIER_PROFILES.EK.templateUrl,
  PR: CSD_CARRIER_PROFILES.PR.templateUrl,
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
  /** EK Letter: Company Name / Address. */
  companyBlock?: string;
  /** EK: số kiện / kg lô. */
  pcs?: string;
  kg?: string;
  /** EK Letter: routing luôn SGN-DXB-{DEST}. */
  routing?: string;
  /** EK Letter: ngày trên thư (cùng ngày popup). */
  letterDate?: string;
  /** EK popup — Security Status Issued by / Name. */
  issuedBy?: string;
  /** EK popup — Title (mặc định STAFF). */
  issuedTitle?: string;
  /** EK Letter — Company ký. */
  signCompany?: string;
  /** EK popup — Date-Time phát hành CSD. */
  issuedDateTime?: string;
  /** EK Additional Security Information. */
  additionalSecurity?: string;
  /** PR: shipper / phone / pcs-weight / flight-dest / ngày form. */
  shipperName?: string;
  shipperAddress?: string;
  shipperPhone?: string;
  pcsWeight?: string;
  flightDest?: string;
  formDate?: string;
  verifiedBy?: string;
};

export type PrintCsdOptions = {
  transfer?: string;
  origin?: string;
  /** Modal đã xác nhận — bỏ window.confirm tên hàng trống. */
  allowEmptyGoods?: boolean;
  /** Hồ sơ khách — lấy tên hàng đã chọn nếu lô chưa có goodsDescriptionPrint. */
  customerDirectory?: readonly CustomerDirectoryEntry[];
  /** EK popup fields. */
  issuedBy?: string;
  issuedTitle?: string;
  signCompany?: string;
  issuedDateTime?: string;
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

/** Chuyến EK… → Emirates SkyCargo CSD (Letter + CSD). */
export function isCsdEkFlight(flight: string | undefined | null): boolean {
  return flightCarrierPrefix(flight) === "EK";
}

/** Chuyến PR… → Philippine Airlines Cargo Security Declaration. */
export function isCsdPrFlight(flight: string | undefined | null): boolean {
  return flightCarrierPrefix(flight) === "PR";
}

/** Ba hãng dùng chung mẫu CSD-IATA.pdf. */
export function isCsdIataTemplateCarrier(carrier: CsdCarrier): boolean {
  return carrier === "VJ" || carrier === "SQ" || carrier === "TR";
}

const CSD_EK_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Ngày EK dạng `08-Sep-2026`. */
export function formatCsdEkDate(d: Date = new Date()): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mon = CSD_EK_MONTHS[d.getMonth()];
  return `${dd}-${mon}-${d.getFullYear()}`;
}

/** Date-Time EK dạng `08-Sep-2026  15:30`. */
export function formatCsdEkDateTime(d: Date = new Date()): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatCsdEkDate(d)}  ${hh}:${mm}`;
}

export function resolveCsdEkCompanyBlock(
  s: Pick<
    Shipment,
    "consigneeNamePrint" | "consigneeAddressPrint"
  >
): string {
  const name = String(s.consigneeNamePrint || "").trim();
  const addr = String(s.consigneeAddressPrint || "").trim();
  if (name || addr) return [name, addr].filter(Boolean).join("\n");
  return "";
}

/** Letter signature Company — lấy tên shipper in ấn. */
export function resolveCsdEkSignCompany(
  s: Pick<Shipment, "shipperNamePrint">
): string {
  return String(s.shipperNamePrint || "").trim();
}

/** PR — Verified/Accepted by theo kho. */
export function resolveCsdPrVerifiedBy(
  warehouse: Shipment["warehouse"] | string | undefined | null
): string {
  const team = opsTeamOf(normalizeWarehouse(warehouse));
  if (team === "SCSC") return "SCSC - PAL Cargo Handler";
  if (team === "TECS") return "TECS - PAL Cargo Handler";
  return "TCS Co., Ltd. - PAL Cargo Handler";
}

/** PR — Flight No./Destination, vd. PR598/MNL. */
export function formatCsdPrFlightDest(
  flight: string | undefined | null,
  dest: string | undefined | null
): string {
  const f = String(flight || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const d = String(dest || "")
    .trim()
    .toUpperCase()
    .slice(0, 3);
  if (f && d) return `${f}/${d}`;
  return f || d;
}

/** PR — Pcs/Weight tendered. */
export function formatCsdPrPcsWeight(
  pcs: string | undefined | null,
  kg: string | undefined | null
): string {
  const p = String(pcs || "").trim();
  const k = String(kg || "").trim();
  if (p && k) return `${p} / ${k} kg`;
  if (p) return `${p} pcs`;
  if (k) return `${k} kg`;
  return "";
}

/** Pcs in CSD/Letter — số nguyên gọn. */
export function formatCsdEkPcs(pcs: number | string | null | undefined): string {
  if (pcs == null || pcs === "") return "";
  const n = typeof pcs === "number" ? pcs : Number(String(pcs).replace(/,/g, ""));
  if (!Number.isFinite(n)) return String(pcs).trim();
  return String(Math.round(n));
}

/** Kg in CSD/Letter — bỏ phần thập phân thừa. */
export function formatCsdEkKg(kg: number | string | null | undefined): string {
  if (kg == null || kg === "") return "";
  const n = typeof kg === "number" ? kg : Number(String(kg).replace(/,/g, ""));
  if (!Number.isFinite(n)) return String(kg).trim();
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
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
 * MH/AK → KUL; QR → DOH; SQ/TR → SIN; BI → BWN; EK → DXB; PR → MNL;
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
  if (carrier === "EK") {
    if (d && d !== "DXB") return "DXB";
    return "";
  }
  if (carrier === "PR") {
    if (d && d !== "MNL") return "MNL";
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
  > &
    Partial<
      Pick<
        Shipment,
        | "pcs"
        | "kg"
        | "flight"
        | "shipperNamePrint"
        | "shipperAddressPrint"
        | "shipperPhonePrint"
        | "consigneeNamePrint"
        | "consigneeAddressPrint"
      >
    >,
  carrier: CsdCarrier,
  overrides?: Pick<
    PrintCsdOptions,
    | "transfer"
    | "origin"
    | "customerDirectory"
    | "issuedBy"
    | "issuedTitle"
    | "signCompany"
    | "issuedDateTime"
  >
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
  if (carrier === "EK") {
    const issuedDateTime =
      String(overrides?.issuedDateTime || "").trim() || formatCsdEkDateTime();
    base.origin = "SGN";
    base.transfer = "DXB";
    base.routing = base.dest ? `SGN-DXB-${base.dest}` : "SGN-DXB";
    base.companyBlock = resolveCsdEkCompanyBlock(s);
    base.pcs = formatCsdEkPcs(s.pcs);
    base.kg = formatCsdEkKg(s.kg);
    base.letterDate =
      issuedDateTime.match(/^\d{2}-[A-Za-z]{3}-\d{4}/)?.[0] || formatCsdEkDate();
    base.issuedBy = String(overrides?.issuedBy || "").trim();
    base.issuedTitle =
      String(overrides?.issuedTitle || "").trim() || "STAFF";
    base.signCompany =
      String(overrides?.signCompany || "").trim() ||
      resolveCsdEkSignCompany(s);
    base.issuedDateTime = issuedDateTime;
    base.additionalSecurity = "NO HAWB";
  }
  if (carrier === "PR") {
    base.origin = "SGN";
    base.pcs = formatCsdEkPcs(s.pcs);
    base.kg = formatCsdEkKg(s.kg);
    base.pcsWeight = formatCsdPrPcsWeight(base.pcs, base.kg);
    base.shipperName = String(s.shipperNamePrint || "").trim();
    base.shipperAddress = String(s.shipperAddressPrint || "").trim();
    base.shipperPhone = String(s.shipperPhonePrint || "").trim();
    base.flightDest = formatCsdPrFlightDest(s.flight, base.dest);
    base.formDate = formatCsdEkDate();
    base.verifiedBy = resolveCsdPrVerifiedBy(s.warehouse);
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
  pdf.registerFontkit(fontkit);
  if (assets?.bold) {
    return pdf.embedFont(assets.bold);
  }
  const load = async (url: string) => {
    /** no-cache: tránh font lỗi/cũ trong HTTP cache trình duyệt (production). */
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Không tải được font CSD (${url}: ${res.status}).`);
    return res.arrayBuffer();
  };
  try {
    return await pdf.embedFont(await load(CSD_FONT_BOLD_URL));
  } catch (e1) {
    try {
      return await pdf.embedFont(await load("/fonts/NotoSans-Regular.ttf"));
    } catch {
      throw new Error(
        `Không tải được font Unicode cho CSD (cần Noto Sans). ${
          e1 instanceof Error ? e1.message : ""
        }`.trim()
      );
    }
  }
}

function lineYToPdfLibBaseline(pageH: number, lineY: number): number {
  return pageH - (lineY - 2.5);
}

function topYToPdfLibBaseline(pageH: number, yTop: number): number {
  return pageH - yTop;
}

type CsdPdfFont = {
  widthOfTextAtSize: (text: string, size: number) => number;
};

function fitCsdFontSize(
  font: CsdPdfFont,
  text: string,
  maxWidth: number,
  preferred: number,
  minSize: number
): number {
  let size = preferred;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.5;
  }
  return size;
}

/** Bọc tên hàng theo chiều rộng font thật (không cắt cứng theo số ký tự). */
export function wrapCsdGoodsByWidth(
  font: CsdPdfFont,
  text: string,
  maxWidth: number,
  size: number,
  maxLines: number
): string[] {
  const words = text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (!words.length) return [];
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
      continue;
    }
    if (line) {
      out.push(line);
      if (out.length >= maxLines) return out;
    }
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      let chunk = "";
      for (const ch of word) {
        const tryChunk = chunk + ch;
        if (font.widthOfTextAtSize(tryChunk, size) > maxWidth && chunk) {
          out.push(chunk);
          if (out.length >= maxLines) return out;
          chunk = ch;
        } else {
          chunk = tryChunk;
        }
      }
      line = chunk;
    } else {
      line = word;
    }
  }
  if (line && out.length < maxLines) out.push(line);
  return out.slice(0, maxLines);
}

/**
 * Điền Contents: ưu tiên giữ cỡ chữ đọc được.
 * 1) đủ 1 dòng ở size gốc → ghi 1 dòng
 * 2) không đủ → xuống dòng (maxLines) vẫn giữ size lớn nhất có thể
 * 3) vẫn tràn → wrap ở minSize (có thể cắt đuôi nếu quá dài)
 */
function drawCsdGoodsFitted(
  page: {
    drawText: (text: string, opts: Record<string, unknown>) => void;
  },
  pageH: number,
  font: CsdPdfFont & object,
  color: ReturnType<typeof rgb>,
  text: string,
  slot: {
    x: number;
    yTop: number;
    size: number;
    maxWidth: number;
    minSize?: number;
    maxLines?: number;
    leading?: number;
  }
): void {
  const t = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return;
  /** Sàn đọc được — tránh chữ 4–6pt khó nhìn khi in. */
  const minSize = Math.max(slot.minSize ?? 9, 8);
  const maxLines = Math.max(slot.maxLines ?? 2, 1);
  const preferred = Math.max(slot.size, minSize);

  const paint = (lines: string[], size: number) => {
    const leading = slot.leading ?? size + 2;
    lines.forEach((line, i) => {
      page.drawText(line, {
        x: slot.x,
        y: topYToPdfLibBaseline(pageH, slot.yTop + i * leading),
        size,
        font,
        color,
      });
    });
  };

  if (font.widthOfTextAtSize(t, preferred) <= slot.maxWidth) {
    paint([t], preferred);
    return;
  }

  for (let size = preferred; size >= minSize; size -= 0.5) {
    const probe = wrapCsdGoodsByWidth(font, t, slot.maxWidth, size, 99);
    if (probe.length > 0 && probe.length <= maxLines) {
      paint(probe, size);
      return;
    }
  }

  const fallback = wrapCsdGoodsByWidth(font, t, slot.maxWidth, minSize, maxLines);
  paint(fallback.length ? fallback : [t], minSize);
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
  goods: { x: 240, yTop: 268, size: 11, maxWidth: 250, minSize: 9, maxLines: 2 },
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
  goods: { x: 200, yTop: 215, size: 11, maxWidth: 230, minSize: 9, maxLines: 2 },
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
  goods: { x: 148, yTop: 236, size: 11, maxWidth: 280, minSize: 9, maxLines: 2 },
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
 *
 * Ô Contents: x≈57–564, nhãn ~232–244, Consolidation ~282 → chữ từ ~250, rộng ~480, tối đa 3 dòng.
 */
const LAYOUT_VU = {
  ra: { x: 70, yTop: 222, size: 11 },
  awb: { x: 330, yTop: 210, size: 13 },
  goods: {
    x: 70,
    /** Dưới nhãn Contents (~244), trên Consolidation (~282). */
    yTop: 258,
    size: 12,
    maxWidth: 480,
    minSize: 10,
    maxLines: 3,
    leading: 13,
  },
  goodsMaxChars: 150,
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
  goods: { x: 130, yTop: 236, size: 11, maxWidth: 250, minSize: 9, maxLines: 2 },
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
  goods: { x: 70, yTop: 238, size: 11, maxWidth: 280, minSize: 9, maxLines: 2 },
  goodsMaxChars: 55,
  /** Cùng hàng với Origin SGN (glyph ≈303–318). */
  dest: { x: 200, yTop: 316, size: 14 },
  transfer: { x: 320, yTop: 316, size: 13 },
  footerRa: { x: 65, yTop: 620, size: 10 },
} as const;

/**
 * Layout PR — A4 PAL F-0462 Cargo Security Declaration.
 * Giữ defaults (N/A, Forwarder, X-RAY Yes, SPX, Origin SGN, UAI…).
 * Điền: Date, Shipper, AWB, Pcs/Weight, Contents, Verified by, counts, Flight/Dest.
 */
const LAYOUT_PR = {
  dateTop: { x: 470, yTop: 82, size: 8, maxWidth: 65, minSize: 6 },
  shipperName: { x: 60, yTop: 266, size: 8, maxWidth: 175, minSize: 6 },
  shipperAddress: { x: 246, yTop: 266, size: 7, maxWidth: 175, minSize: 5 },
  telephone: { x: 435, yTop: 266, size: 8, maxWidth: 95, minSize: 6 },
  awb: { x: 132, yTop: 284, size: 9, maxWidth: 105, minSize: 6 },
  pcsWeight: { x: 250, yTop: 285, size: 8, maxWidth: 135, minSize: 6 },
  goods: { x: 398, yTop: 285, size: 9, maxWidth: 130, minSize: 8, maxLines: 1 },
  verifiedBy: { x: 380, yTop: 351, size: 6, maxWidth: 150, minSize: 5 },
  xrayCount: { x: 340, yTop: 485, size: 10, maxWidth: 42, minSize: 7 },
  totalScreened: { x: 490, yTop: 485, size: 10, maxWidth: 42, minSize: 7 },
  flightDest: { x: 400, yTop: 525, size: 8, maxWidth: 62, minSize: 6 },
  dateOrigin: { x: 475, yTop: 525, size: 8, maxWidth: 55, minSize: 6 },
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

/**
 * Layout EK — tọa độ baseline từ đỉnh trang (khớp mẫu gốc + blank sạch).
 * Trang 0 Letter 612×792 · Trang 1 CSD ~523×755.
 * maxWidth: thu nhỏ font để chữ không tràn ô.
 */
const LAYOUT_EK_LETTER = {
  company: {
    x: 78,
    yTop: 118,
    size: 10,
    leading: 12,
    maxWidth: 460,
    maxLines: 4,
    minSize: 7,
  },
  awb: { x: 144, yTop: 238, size: 14, maxWidth: 128, minSize: 10 },
  routing: { x: 388, yTop: 236, size: 11, maxWidth: 160, minSize: 8 },
  letterDate: { x: 144, yTop: 258, size: 13, maxWidth: 120, minSize: 9 },
  goods: { x: 388, yTop: 258, size: 12, maxWidth: 165, minSize: 10, maxLines: 2 },
  pcs: { x: 150, yTop: 278, size: 12, maxWidth: 50, minSize: 9 },
  kg: { x: 390, yTop: 278, size: 12, maxWidth: 62, minSize: 9 },
  issuedBy: { x: 120, yTop: 662, size: 11, maxWidth: 160, minSize: 8 },
  title: { x: 365, yTop: 662, size: 10, maxWidth: 140, minSize: 8 },
  signCompany: { x: 120, yTop: 686, size: 10, maxWidth: 185, minSize: 7 },
  signDate: { x: 365, yTop: 686, size: 10, maxWidth: 140, minSize: 8 },
} as const;

const LAYOUT_EK_CSD = {
  ra: { x: 18, yTop: 191, size: 10, maxWidth: 95, minSize: 7 },
  awb: { x: 250, yTop: 191, size: 12, maxWidth: 115, minSize: 8 },
  /** Contents — cột trái, dưới nhãn; size lớn nhưng fit width. */
  goods: { x: 18, yTop: 232, size: 13, maxWidth: 220, minSize: 10, maxLines: 2 },
  pcs: { x: 286, yTop: 217, size: 11, maxWidth: 42, minSize: 8 },
  kg: { x: 416, yTop: 217, size: 11, maxWidth: 72, minSize: 8 },
  origin: { x: 56, yTop: 262, size: 14, maxWidth: 50, minSize: 10 },
  dest: { x: 185, yTop: 262, size: 16, maxWidth: 55, minSize: 10 },
  transfer: { x: 390, yTop: 258, size: 12, maxWidth: 100, minSize: 8 },
  xryTick: { x: 268, yTop: 319, size: 10 },
  issuedBy: { x: 20, yTop: 534, size: 11, maxWidth: 200, minSize: 8 },
  issuedDateTime: { x: 348, yTop: 540, size: 10, maxWidth: 150, minSize: 7 },
  footerRa: { x: 36, yTop: 584, size: 11, maxWidth: 140, minSize: 8 },
  additional: { x: 20, yTop: 630, size: 11, maxWidth: 470, minSize: 8 },
} as const;

type EkFont = {
  widthOfTextAtSize: (text: string, size: number) => number;
};

function fitEkFontSize(
  font: EkFont,
  text: string,
  maxWidth: number,
  preferred: number,
  minSize: number
): number {
  let size = preferred;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.5;
  }
  return size;
}

function wrapEkLines(
  font: EkFont,
  text: string,
  maxWidth: number,
  size: number,
  maxLines: number
): string[] {
  const raw = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const paragraph of raw) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const next = line ? line + " " + word : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        line = next;
        continue;
      }
      if (line) {
        out.push(line);
        if (out.length >= maxLines) return out;
      }
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = '';
        for (const ch of word) {
          const tryChunk = chunk + ch;
          if (font.widthOfTextAtSize(tryChunk, size) > maxWidth && chunk) {
            out.push(chunk);
            if (out.length >= maxLines) return out;
            chunk = ch;
          } else {
            chunk = tryChunk;
          }
        }
        line = chunk;
      } else {
        line = word;
      }
    }
    if (line) {
      out.push(line);
      if (out.length >= maxLines) return out;
    }
  }
  return out.slice(0, maxLines);
}

async function fillCsdEkPdfBytes(
  pdf: PDFDocument,
  fields: CsdFillFields,
  assets?: CsdPdfAssets
): Promise<Uint8Array> {
  const pages = pdf.getPages();
  if (pages.length < 2) {
    throw new Error('Mẫu CSD EK cần đủ 2 trang (Letter + CSD).');
  }
  const [letterPage, csdPage] = pages;
  const fontBold = await embedCsdBoldFont(pdf, assets);
  let fontReg;
  try {
    fontReg = await pdf.embedFont(StandardFonts.Helvetica);
  } catch {
    fontReg = fontBold;
  }
  const ink = rgb(0, 0, 0);

  const drawFitted = (
    page: (typeof pages)[0],
    text: string,
    slot: { x: number; yTop: number; size: number; maxWidth?: number; minSize?: number },
    font = fontBold
  ) => {
    const t = text.trim();
    if (!t) return;
    const maxW = slot.maxWidth ?? 9999;
    const minS = slot.minSize ?? 7;
    const size = fitEkFontSize(font, t, maxW, slot.size, minS);
    const pageH = page.getHeight();
    page.drawText(t, {
      x: slot.x,
      y: topYToPdfLibBaseline(pageH, slot.yTop),
      size,
      font,
      color: ink,
    });
  };

  const L = LAYOUT_EK_LETTER;
  const companyText = String(fields.companyBlock || '').trim();
  if (companyText) {
    const longest =
      companyText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)[0] || companyText;
    const companySize = fitEkFontSize(
      fontReg,
      longest,
      L.company.maxWidth,
      L.company.size,
      L.company.minSize
    );
    const lines = wrapEkLines(
      fontReg,
      companyText,
      L.company.maxWidth,
      companySize,
      L.company.maxLines
    );
    const pageH = letterPage.getHeight();
    lines.forEach((line, i) => {
      letterPage.drawText(line, {
        x: L.company.x,
        y: topYToPdfLibBaseline(
          pageH,
          L.company.yTop + i * L.company.leading
        ),
        size: companySize,
        font: fontReg,
        color: ink,
      });
    });
  }

  drawFitted(letterPage, fields.awb, L.awb);
  drawFitted(letterPage, fields.routing || '', L.routing);
  drawFitted(letterPage, fields.letterDate || '', L.letterDate);
  drawCsdGoodsFitted(letterPage, letterPage.getHeight(), fontBold, ink, fields.goods, {
    ...L.goods,
    leading: 14,
  });
  drawFitted(letterPage, fields.pcs || '', L.pcs);
  if ((fields.pcs || '').trim()) {
    drawFitted(
      letterPage,
      'pcs',
      { x: 206, yTop: 278, size: 10, maxWidth: 28, minSize: 8 },
      fontReg
    );
  }
  drawFitted(letterPage, fields.kg || '', L.kg);
  if ((fields.kg || '').trim()) {
    drawFitted(
      letterPage,
      'kgs',
      { x: 458, yTop: 278, size: 10, maxWidth: 28, minSize: 8 },
      fontReg
    );
  }
  drawFitted(letterPage, fields.issuedBy || '', L.issuedBy);
  drawFitted(letterPage, fields.issuedTitle || '', L.title);
  drawFitted(letterPage, fields.signCompany || '', L.signCompany, fontReg);
  drawFitted(letterPage, fields.letterDate || '', L.signDate);

  const C = LAYOUT_EK_CSD;
  const raCode = (fields.raCode || '').trim();
  drawFitted(csdPage, raCode, C.ra);
  drawFitted(csdPage, fields.awb, C.awb);
  drawCsdGoodsFitted(csdPage, csdPage.getHeight(), fontBold, ink, fields.goods, {
    ...C.goods,
    leading: 15,
  });
  drawFitted(csdPage, fields.pcs || '', C.pcs);
  drawFitted(csdPage, fields.kg || '', C.kg);
  drawFitted(csdPage, fields.origin || 'SGN', C.origin);
  drawFitted(csdPage, fields.dest, C.dest);
  drawFitted(csdPage, fields.transfer || 'DXB', C.transfer);
  // SPX + REGULATED AGENT đã bake trên template
  drawFitted(csdPage, 'X', C.xryTick);
  drawFitted(csdPage, fields.issuedBy || '', C.issuedBy);
  drawFitted(csdPage, fields.issuedDateTime || '', C.issuedDateTime);
  drawFitted(csdPage, raCode, C.footerRa);
  drawFitted(
    csdPage,
    fields.additionalSecurity || 'NO HAWB',
    C.additional
  );

  return pdf.save();
}

export async function fillCsdPdfBytes(
  carrier: CsdCarrier,
  fields: CsdFillFields,
  templateBytes?: ArrayBuffer | Uint8Array,
  assets?: CsdPdfAssets
): Promise<Uint8Array> {
  const raw = templateBytes ?? (await loadTemplate(carrier));
  const pdf = await PDFDocument.load(raw);
  if (carrier === "EK") {
    return fillCsdEkPdfBytes(pdf, fields, assets);
  }
  const page = pdf.getPages()[0];
  if (!page) throw new Error(`Mẫu CSD ${carrier} không có trang.`);
  const pageH = page.getHeight();
  const fontBold = await embedCsdBoldFont(pdf, assets);
  const ink = rgb(0, 0, 0);
  const raCode = (fields.raCode || "").trim();
  const raLabel = raCode ? `RA ${raCode}` : "";

  const draw = (text: string, x: number, y: number, size: number) => {
    const t = text.trim();
    if (!t) return;
    page.drawText(t, { x, y, size, font: fontBold, color: ink });
  };

  const drawGoods = (
    slot: {
      x: number;
      yTop: number;
      size: number;
      maxWidth: number;
      minSize?: number;
      maxLines?: number;
      leading?: number;
    }
  ) => drawCsdGoodsFitted(page, pageH, fontBold, ink, fields.goods, slot);

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
    wrapCsdGoodsByWidth(
      fontBold,
      fields.goods,
      320,
      LAYOUT_FD.goodsSize,
      LAYOUT_FD.goodsLines.length
    ).forEach((line, i) => {
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
    drawGoods(LAYOUT_MH.goods);
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
    drawGoods(LAYOUT_AK.goods);
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
    drawGoods(LAYOUT_QR.goods);
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
    drawGoods(LAYOUT_VU.goods);
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
    drawGoods(LAYOUT_IATA.goods);
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
    drawGoods(LAYOUT_BI.goods);
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
  } else if (carrier === "PR") {
    /* Philippine Airlines F-0462 — giữ defaults; điền shipper/AWB/pcs/goods/flight */
    const fit = (
      text: string,
      slot: {
        x: number;
        yTop: number;
        size: number;
        maxWidth: number;
        minSize: number;
      }
    ) => {
      const t = text.trim();
      if (!t) return;
      let size = slot.size;
      while (size > slot.minSize && fontBold.widthOfTextAtSize(t, size) > slot.maxWidth) {
        size -= 0.5;
      }
      draw(t, slot.x, topYToPdfLibBaseline(pageH, slot.yTop), size);
    };
    const P = LAYOUT_PR;
    fit(fields.formDate || "", P.dateTop);
    fit(fields.shipperName || "", P.shipperName);
    fit(fields.shipperAddress || "", P.shipperAddress);
    fit(fields.shipperPhone || "", P.telephone);
    fit(fields.awb, P.awb);
    fit(fields.pcsWeight || "", P.pcsWeight);
    drawGoods(P.goods);
    fit(fields.verifiedBy || "", P.verifiedBy);
    const pcsNum = (fields.pcs || "").trim();
    if (pcsNum) {
      fit(pcsNum, P.xrayCount);
      fit(pcsNum, P.totalScreened);
    }
    fit(fields.flightDest || "", P.flightDest);
    fit(fields.formDate || "", P.dateOrigin);
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
    wrapCsdGoodsByWidth(
      fontBold,
      fields.goods,
      340,
      LAYOUT_TG.goodsSize,
      LAYOUT_TG.goodsLines.length
    ).forEach((line, i) => {
      const slot = LAYOUT_TG.goodsLines[i];
      if (!slot) return;
      draw(
        line,
        slot.x,
        topYToPdfLibBaseline(pageH, slot.yTop),
        LAYOUT_TG.goodsSize
      );
    });
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
  if (carrier === "EK") {
    saveLastCsdEkIssuer({
      issuedBy: fields.issuedBy || "",
      issuedTitle: fields.issuedTitle || "STAFF",
      signCompany: fields.signCompany || "",
    });
  }

  /** Preload Noto trước khi fill — tránh Helvetica cắt mất tiếng Việt trên production. */
  let assets: CsdPdfAssets | undefined;
  try {
    const res = await fetch(CSD_FONT_BOLD_URL, { cache: "no-cache" });
    if (res.ok) assets = { bold: await res.arrayBuffer() };
  } catch {
    /* embedCsdBoldFont sẽ thử lại / báo lỗi rõ */
  }

  const bytes = await fillCsdPdfBytes(carrier, fields, undefined, assets);
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
