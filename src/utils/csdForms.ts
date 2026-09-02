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
export type CsdCarrier = "FD" | "TG";

export type CsdCarrierProfile = {
  id: CsdCarrier;
  label: string;
  airlineName: string;
  templateUrl: string;
  /** Prefix mã chuyến (FD301 → FD, TG621 → TG). */
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
};

export const CSD_TEMPLATE_URL: Record<CsdCarrier, string> = {
  FD: CSD_CARRIER_PROFILES.FD.templateUrl,
  TG: CSD_CARRIER_PROFILES.TG.templateUrl,
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

/** @deprecated dùng isCsdTgFlight */
export function isCsdThFlight(flight: string | undefined | null): boolean {
  return isCsdTgFlight(flight);
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
 * Gợi ý Transit: nhớ lần trước theo hãng; không thì BKK khi DEST không phải hub BKK/DMK.
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

async function loadTemplate(carrier: CsdCarrier): Promise<ArrayBuffer> {
  const url = getCsdCarrierProfile(carrier).templateUrl;
  const res = await fetch(url, { cache: "force-cache" });
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

/** Tên file tải về — theo kho + hãng + AWB. */
export function csdDownloadFilename(
  carrier: CsdCarrier,
  awb: string,
  opsTeam?: OpsTeam
): string {
  const digits = awbDigitsKey(awb);
  const label =
    digits.length === 11
      ? `${digits.slice(0, 3)}-${digits.slice(3)}`
      : digits || "draft";
  const team = opsTeam ? `${opsTeam}-` : "";
  return `CSD-${team}${carrier}-${label}.pdf`;
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
  const filename = csdDownloadFilename(carrier, s.awb, fields.opsTeam);

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
