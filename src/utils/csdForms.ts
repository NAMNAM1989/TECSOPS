import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Shipment } from "../types/shipment";
import { awbDigitsKey, formatAwb } from "./awbFormat";
import { loadLastCsdTransfer, saveLastCsdTransfer } from "./csdPrintPrefs";

/** Thêm hãng mới: mở rộng union + thêm entry trong CSD_CARRIER_PROFILES + PDF mẫu. */
export type CsdCarrier = "FD" | "TH";

export type CsdCarrierProfile = {
  id: CsdCarrier;
  label: string;
  airlineName: string;
  templateUrl: string;
  /** Prefix mã chuyến (FD301 → FD). */
  flightPrefixes: readonly string[];
  showOrigin: boolean;
  showTransfer: boolean;
  defaultOrigin?: string;
  transferPresets: readonly string[];
};

/** Origin mặc định CSD FD (form TH đã in sẵn SGN). */
export const CSD_FD_DEFAULT_ORIGIN = "SGN";

export const CSD_CARRIER_PROFILES: Record<CsdCarrier, CsdCarrierProfile> = {
  FD: {
    id: "FD",
    label: "FD",
    airlineName: "Thai AirAsia",
    templateUrl: "/templates/csd/CSD-FD.pdf",
    flightPrefixes: ["FD"],
    showOrigin: true,
    showTransfer: true,
    defaultOrigin: CSD_FD_DEFAULT_ORIGIN,
    transferPresets: ["BKK", "DMK", "CNX", "HKT"],
  },
  TH: {
    id: "TH",
    label: "TH",
    airlineName: "Thai Airways",
    templateUrl: "/templates/csd/CSD-TH.pdf",
    flightPrefixes: ["TH"],
    showOrigin: false,
    showTransfer: true,
    transferPresets: ["BKK", "HKT", "CNX", "USM"],
  },
};

export const CSD_TEMPLATE_URL: Record<CsdCarrier, string> = {
  FD: CSD_CARRIER_PROFILES.FD.templateUrl,
  TH: CSD_CARRIER_PROFILES.TH.templateUrl,
};

const PAGE_H = 792;

export type CsdFillFields = {
  awb: string;
  goods: string;
  dest: string;
  origin?: string;
  /** Mã sân bay Transfer/Transit (1–n điểm, vd. BKK hoặc BKK/CNX). */
  transfer?: string;
};

export type PrintCsdOptions = {
  transfer?: string;
  origin?: string;
  /** Modal đã xác nhận — bỏ window.confirm tên hàng trống. */
  allowEmptyGoods?: boolean;
};

/** Chuyến FD… → Thai AirAsia CSD. */
export function isCsdFdFlight(flight: string | undefined | null): boolean {
  return flightCarrierPrefix(flight) === "FD";
}

/** Chuyến TH… → Thai Airways CSD. */
export function isCsdThFlight(flight: string | undefined | null): boolean {
  return flightCarrierPrefix(flight) === "TH";
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
  s: Pick<Shipment, "awb" | "dest" | "goodsDescriptionPrint">,
  carrier: CsdCarrier,
  overrides?: Pick<PrintCsdOptions, "transfer" | "origin">
): CsdFillFields {
  const profile = getCsdCarrierProfile(carrier);
  const digits = awbDigitsKey(s.awb);
  const base: CsdFillFields = {
    awb: digits.length === 11 ? formatAwb(digits) : (s.awb || "").trim(),
    goods: (s.goodsDescriptionPrint || "").trim(),
    dest: (s.dest || "").trim().toUpperCase().slice(0, 3),
  };
  if (profile.showOrigin) {
    const origin =
      normalizeCsdTransfer(overrides?.origin || "").split("/")[0] ||
      profile.defaultOrigin ||
      CSD_FD_DEFAULT_ORIGIN;
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
  s: Pick<Shipment, "awb" | "dest" | "goodsDescriptionPrint">
): CsdFillFields & { origin: string } {
  return buildCsdFields(s, "FD") as CsdFillFields & { origin: string };
}

function lineYToPdfLibBaseline(lineY: number): number {
  return PAGE_H - (lineY - 2.5);
}

function topYToPdfLibBaseline(yTop: number): number {
  return PAGE_H - yTop;
}

/** Layout FD — chữ đậm + size lớn để dễ đọc khi in. */
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
} as const;

/** Layout TH — AirWaybill No / Contents / Destination / Transfer. */
const LAYOUT_TH = {
  awb: { x: 375, yTop: 144, size: 13 },
  goods: { x: 80, yTop: 230, size: 12 },
  dest: { x: 255, yTop: 300, size: 14 },
  transfer: { x: 340, yTop: 300, size: 13 },
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
  templateBytes?: ArrayBuffer
): Promise<Uint8Array> {
  const raw = templateBytes ?? (await loadTemplate(carrier));
  const pdf = await PDFDocument.load(raw);
  const page = pdf.getPages()[0];
  if (!page) throw new Error(`Mẫu CSD ${carrier} không có trang.`);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0, 0, 0);

  const draw = (text: string, x: number, y: number, size: number) => {
    const t = text.trim();
    if (!t) return;
    page.drawText(t, { x, y, size, font: fontBold, color: ink });
  };

  if (carrier === "FD") {
    draw(
      fields.awb,
      LAYOUT_FD.awb.x,
      lineYToPdfLibBaseline(LAYOUT_FD.awb.lineY),
      LAYOUT_FD.awb.size
    );
    wrapCsdGoodsLines(fields.goods, 58).forEach((line, i) => {
      const slot = LAYOUT_FD.goodsLines[i];
      if (!slot) return;
      draw(line, slot.x, lineYToPdfLibBaseline(slot.lineY), LAYOUT_FD.goodsSize);
    });
    draw(
      fields.origin || CSD_FD_DEFAULT_ORIGIN,
      LAYOUT_FD.origin.x,
      topYToPdfLibBaseline(LAYOUT_FD.origin.yTop),
      LAYOUT_FD.origin.size
    );
    draw(
      fields.dest,
      LAYOUT_FD.dest.x,
      topYToPdfLibBaseline(LAYOUT_FD.dest.yTop),
      LAYOUT_FD.dest.size
    );
    if (fields.transfer) {
      draw(
        fields.transfer,
        LAYOUT_FD.transfer.x,
        topYToPdfLibBaseline(LAYOUT_FD.transfer.yTop),
        LAYOUT_FD.transfer.size
      );
    }
  } else {
    draw(
      fields.awb,
      LAYOUT_TH.awb.x,
      topYToPdfLibBaseline(LAYOUT_TH.awb.yTop),
      LAYOUT_TH.awb.size
    );
    const goodsLine = wrapCsdGoodsLines(fields.goods, 62)[0] || fields.goods;
    draw(
      goodsLine,
      LAYOUT_TH.goods.x,
      topYToPdfLibBaseline(LAYOUT_TH.goods.yTop),
      LAYOUT_TH.goods.size
    );
    draw(
      fields.dest,
      LAYOUT_TH.dest.x,
      topYToPdfLibBaseline(LAYOUT_TH.dest.yTop),
      LAYOUT_TH.dest.size
    );
    if (fields.transfer) {
      draw(
        fields.transfer,
        LAYOUT_TH.transfer.x,
        topYToPdfLibBaseline(LAYOUT_TH.transfer.yTop),
        LAYOUT_TH.transfer.size
      );
    }
  }

  return pdf.save();
}

/** @deprecated */
export async function fillCsdFdPdfBytes(
  fields: CsdFillFields,
  templateBytes?: ArrayBuffer
): Promise<Uint8Array> {
  return fillCsdPdfBytes("FD", fields, templateBytes);
}

/** Tên file tải về — theo số AWB (+ mã hãng để phân biệt form). */
export function csdDownloadFilename(
  carrier: CsdCarrier,
  awb: string
): string {
  const digits = awbDigitsKey(awb);
  const label =
    digits.length === 11
      ? `${digits.slice(0, 3)}-${digits.slice(3)}`
      : digits || "draft";
  return `CSD-${carrier}-${label}.pdf`;
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
    window.alert(`Form CSD chỉ áp dụng cho chuyến: ${known}.`);
    return;
  }
  if (awbDigitsKey(s.awb).length !== 11) {
    window.alert("AWB phải đủ 11 số để in CSD.");
    return;
  }
  const fields = buildCsdFields(s, carrier, opts);
  if (!fields.dest) {
    window.alert("Lô chưa có DEST — nhập mã sân bay đích trước khi in CSD.");
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
  const filename = csdDownloadFilename(carrier, s.awb);

  downloadPdfBytes(bytes, filename);

  const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) {
    window.alert(`Đã tải ${filename}. Cho phép popup nếu muốn mở bản in ngay.`);
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
