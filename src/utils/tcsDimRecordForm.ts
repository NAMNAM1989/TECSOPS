import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { isTcsFamily } from "../constants/warehouses";
import { notifyError, notifyWarning } from "../ui/notify";
import type { Shipment } from "../types/shipment";
import {
  dimDivisorFromFlight,
  formatDimKgDisplay,
  formatLineDimKgDisplay,
  lineDimKg,
  totalDimKgFromLines,
  type DimDivisor,
} from "./volumetricDim";

/** Số dòng trống mặc định trên mẫu giấy QF/ED/49. */
export const TCS_DIM_RECORD_BASE_LINES = 13;

/** @deprecated Dùng TCS_DIM_RECORD_BASE_LINES — giữ alias tương thích test cũ. */
export const TCS_DIM_RECORD_MAX_LINES = TCS_DIM_RECORD_BASE_LINES;

/**
 * Form giấy TCS (QF/ED/49): hiện cùng chỗ LIST DIM TCS
 * — mã lô `TCS` hoặc `TECS-TCS`.
 */
export function isTcsDimRecordWarehouse(warehouse: Shipment["warehouse"]): boolean {
  return isTcsFamily(warehouse);
}

const FORM_CODE = "QF/ED/49";
const FORM_EFFECTIVE = "12/06/2024";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 36;
const MARGIN_BOTTOM = 28;
const INK = rgb(0, 0, 0);

/** Khoảng chữ ký dưới bảng (điểm). */
const SIGNATURE_BLOCK_H = 90;

const FONT_REGULAR_URL = "/fonts/NotoSans-Regular.ttf";
const FONT_BOLD_URL = "/fonts/NotoSans-Bold.ttf";
const LOGO_URL = "/brand/tcs-logo.png";

/** Chiều rộng logo trên header (điểm PDF). */
const LOGO_DRAW_W = 118;

export type TcsDimRecordRow = {
  stt: number;
  lCm: number;
  wCm: number;
  hCm: number;
  pcs: number;
  dimKg: number | null;
};

export type TcsDimRecordModel = {
  flight: string;
  flightDateLine: string;
  dest: string;
  awb: string;
  totalPcsDeclared: string;
  natureOfGoods: string;
  specialRequirement: string;
  customer: string;
  divisor: DimDivisor;
  rows: TcsDimRecordRow[];
  totalPcsLines: number;
  totalDimKgText: string;
  totalDimKg: number | null;
};

export type TcsDimRecordTableLayout = {
  /** Số ô dòng dữ liệu trên bảng (≥13, hoặc đúng số dòng DIM nếu nhiều hơn). */
  slotCount: number;
  headerH: number;
  rowH: number;
  totalRowH: number;
  bodyFontSize: number;
  headerViSize: number;
  headerEnSize: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Hiển thị cạnh cm gọn trong ô (bỏ .00 thừa). */
function formatDimEdge(n: number): string {
  const r = round2(n);
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}

/** Số dòng bảng: tối thiểu 13; nếu DIM nhiều hơn thì lấy đúng số dòng. */
export function tcsDimRecordSlotCount(rowCount: number): number {
  return Math.max(TCS_DIM_RECORD_BASE_LINES, Math.max(0, rowCount));
}

/**
 * Tính chiều cao dòng / cỡ chữ để bảng + chữ ký vừa một trang A4.
 * `tableTopFromPageTop` = khoảng cách từ mép trên trang tới cạnh trên bảng.
 */
export function computeTcsDimRecordTableLayout(
  rowCount: number,
  tableTopFromPageTop: number
): TcsDimRecordTableLayout {
  const slotCount = tcsDimRecordSlotCount(rowCount);
  const available =
    PAGE_H - tableTopFromPageTop - SIGNATURE_BLOCK_H - MARGIN_BOTTOM;

  // Ưu tiên giữ header/total ổn định, co chiều cao dòng dữ liệu.
  let headerH = 28;
  let totalRowH = 22;
  let rowH = (available - headerH - totalRowH) / slotCount;

  const maxRowH = 22;
  const minRowH = 9;
  if (rowH > maxRowH) {
    rowH = maxRowH;
  } else if (rowH < minRowH) {
    // Co thêm header/total để giữ tối thiểu rowH.
    const shrink = minRowH * slotCount + 18 + 16;
    if (shrink <= available) {
      headerH = 18;
      totalRowH = 16;
      rowH = (available - headerH - totalRowH) / slotCount;
    } else {
      headerH = Math.max(14, available * 0.06);
      totalRowH = Math.max(12, available * 0.05);
      rowH = Math.max(7, (available - headerH - totalRowH) / slotCount);
    }
  }

  const bodyFontSize = Math.max(6, Math.min(10, rowH * 0.48));
  const headerViSize = Math.max(6, Math.min(9, headerH * 0.32));
  const headerEnSize = Math.max(5.5, Math.min(8, headerH * 0.28));

  return {
    slotCount,
    headerH,
    rowH,
    totalRowH,
    bodyFontSize,
    headerViSize,
    headerEnSize,
  };
}

/** Hiện nút tải PDF: family TCS + đã có DIM. */
export function canDownloadTcsDimRecordPdf(s: Shipment): boolean {
  if (!isTcsDimRecordWarehouse(s.warehouse)) return false;
  return (s.dimLines?.length ?? 0) > 0;
}

/** Tên file: dim + tên khách hàng. */
export function tcsDimRecordFilename(customer: string): string {
  const name =
    customer
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, " ")
      .slice(0, 80) || "KHACH";
  return `dim${name}.pdf`;
}

export function buildTcsDimRecordModel(s: Shipment): TcsDimRecordModel | null {
  if (!isTcsDimRecordWarehouse(s.warehouse)) return null;
  const lines = s.dimLines;
  if (!lines?.length) return null;

  const divisor: DimDivisor =
    s.dimDivisor === 5000 || s.dimDivisor === 6000
      ? s.dimDivisor
      : dimDivisorFromFlight(s.flight);
  const dimCtx = { flight: s.flight, awb: s.awb };

  let totalPcsLines = 0;
  const rows: TcsDimRecordRow[] = lines.map((line, i) => {
    totalPcsLines += line.pcs;
    return {
      stt: i + 1,
      lCm: round2(line.lCm),
      wCm: round2(line.wCm),
      hCm: round2(line.hCm),
      pcs: line.pcs,
      dimKg: lineDimKg(line, divisor, dimCtx),
    };
  });

  const computed = totalDimKgFromLines(lines, divisor, dimCtx);
  const totalDimKg =
    computed ??
    (s.dimWeightKg != null && Number.isFinite(s.dimWeightKg) ? s.dimWeightKg : null);
  const totalDimKgText =
    totalDimKg != null ? formatDimKgDisplay(totalDimKg, dimCtx) : "";

  const pcsDeclared =
    s.pcs != null && Number.isFinite(s.pcs) ? String(s.pcs) : String(totalPcsLines || "");

  return {
    flight: s.flight.trim(),
    flightDateLine: `${s.flight.trim()} / ${s.flightDate.trim()}`.replace(/\s+/g, " ").trim(),
    dest: (s.dest || "").trim().toUpperCase(),
    awb: (s.awb || "").trim(),
    totalPcsDeclared: pcsDeclared,
    natureOfGoods: (s.goodsDescriptionPrint || "").trim(),
    specialRequirement: (s.otherRequirementsPrint || "").trim(),
    customer: (s.customer || "").trim(),
    divisor,
    rows,
    totalPcsLines,
    totalDimKgText,
    totalDimKg,
  };
}

function topY(yFromTop: number): number {
  return PAGE_H - yFromTop;
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  yFromTop: number,
  size: number,
  font: PDFFont,
  opts?: { maxWidth?: number }
) {
  const t = text ?? "";
  if (!t) return;
  let draw = t;
  if (opts?.maxWidth != null) {
    while (draw.length > 1 && font.widthOfTextAtSize(draw, size) > opts.maxWidth) {
      draw = draw.slice(0, -1);
    }
    if (draw !== t && draw.length > 1) draw = `${draw.slice(0, -1)}…`;
  }
  page.drawText(draw, {
    x,
    y: topY(yFromTop) - size * 0.8,
    size,
    font,
    color: INK,
  });
}

function drawCentered(
  page: PDFPage,
  text: string,
  yFromTop: number,
  size: number,
  font: PDFFont
) {
  const w = font.widthOfTextAtSize(text, size);
  drawText(page, text, (PAGE_W - w) / 2, yFromTop, size, font);
}

/** Căn giữa ngang + dọc trong ô; co font nếu chữ rộng hơn ô. */
function drawCellCentered(
  page: PDFPage,
  text: string,
  xLeft: number,
  xRight: number,
  yTop: number,
  yBottom: number,
  preferSize: number,
  font: PDFFont,
  padX = 3
) {
  const t = (text ?? "").trim();
  if (!t) return;
  const maxW = Math.max(4, xRight - xLeft - padX * 2);
  const maxH = Math.max(4, yBottom - yTop - 2);
  let size = Math.min(preferSize, maxH * 0.72);
  while (size > 5 && font.widthOfTextAtSize(t, size) > maxW) {
    size -= 0.4;
  }
  let draw = t;
  if (font.widthOfTextAtSize(draw, size) > maxW) {
    while (draw.length > 1 && font.widthOfTextAtSize(draw, size) > maxW) {
      draw = draw.slice(0, -1);
    }
    if (draw !== t) draw = `${draw.slice(0, -1)}…`;
  }
  const tw = font.widthOfTextAtSize(draw, size);
  const x = xLeft + (xRight - xLeft - tw) / 2;
  // Baseline: tâm ô theo chiều dọc (ước lượng cap-height ≈ 0.72×size)
  const midFromTop = (yTop + yBottom) / 2;
  const baseline = topY(midFromTop) - size * 0.35;
  page.drawText(draw, { x, y: baseline, size, font, color: INK });
}

function drawLineH(page: PDFPage, x1: number, x2: number, yFromTop: number) {
  const y = topY(yFromTop);
  page.drawLine({
    start: { x: x1, y },
    end: { x: x2, y },
    thickness: 0.7,
    color: INK,
  });
}

function drawLineV(page: PDFPage, x: number, yTop: number, yBottom: number) {
  page.drawLine({
    start: { x, y: topY(yTop) },
    end: { x, y: topY(yBottom) },
    thickness: 0.7,
    color: INK,
  });
}

async function loadAssetBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không tải được tài nguyên: ${url}`);
  return res.arrayBuffer();
}

export type TcsDimRecordPdfAssets = {
  regular: ArrayBuffer | Uint8Array;
  bold: ArrayBuffer | Uint8Array;
  logo?: ArrayBuffer | Uint8Array | null;
};

export async function buildTcsDimRecordPdfBytes(
  model: TcsDimRecordModel,
  assets?: TcsDimRecordPdfAssets
): Promise<Uint8Array> {
  const regularBytes = assets?.regular ?? (await loadAssetBytes(FONT_REGULAR_URL));
  const boldBytes = assets?.bold ?? (await loadAssetBytes(FONT_BOLD_URL));
  let logoBytes: ArrayBuffer | Uint8Array | null | undefined = assets?.logo;
  if (logoBytes === undefined) {
    try {
      logoBytes = await loadAssetBytes(LOGO_URL);
    } catch {
      logoBytes = null;
    }
  }

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(regularBytes);
  const fontBold = await pdf.embedFont(boldBytes);
  const page = pdf.addPage([PAGE_W, PAGE_H]);

  const contentRight = PAGE_W - MARGIN_X;
  let y = 22;
  let logoBottomFromTop = y;

  if (logoBytes) {
    try {
      const logo = await pdf.embedPng(logoBytes);
      const scale = LOGO_DRAW_W / logo.width;
      const logoH = logo.height * scale;
      const logoY = topY(y) - logoH;
      page.drawImage(logo, {
        x: MARGIN_X,
        y: logoY,
        width: LOGO_DRAW_W,
        height: logoH,
      });
      logoBottomFromTop = y + logoH;
    } catch (e) {
      console.warn("[tcsDimRecordForm] không nhúng được logo PNG", e);
    }
  }

  // Mã hiệu / ngày hiệu lực — góc phải, ngang hàng logo
  drawText(page, `Mã hiệu: ${FORM_CODE}`, contentRight - 130, y + 6, 9, font);
  drawText(page, `Ngày hiệu lực: ${FORM_EFFECTIVE}`, contentRight - 145, y + 20, 9, font);

  y = Math.max(logoBottomFromTop, y + 34) + 10;

  drawCentered(page, "BẢNG GHI NHẬN KÍCH THƯỚC HÀNG HÓA", y, 13, fontBold);
  y += 15;
  drawCentered(page, "DIMENSION RECORD FORM", y, 11, fontBold);
  y += 18;

  const metaMax = contentRight - MARGIN_X - 4;
  const metaLine = (label: string, value: string) => {
    const text = value ? `${label} ${value}` : label;
    drawText(page, text, MARGIN_X, y, 10, fontBold, { maxWidth: metaMax });
    y += 14;
  };

  metaLine("CHUYẾN BAY/ NGÀY (Flight no/ Date):", model.flightDateLine);
  metaLine("Điểm đến (Dest):", model.dest);
  metaLine("Số không vận đơn (Airwaybill No):", model.awb);

  const pcsGoods = `Tổng số kiện (Pcs): ${model.totalPcsDeclared || "……"} PCS              Chủng loại hàng (Nature of goods): ${model.natureOfGoods || "……………………"}`;
  drawText(page, pcsGoods, MARGIN_X, y, 10, fontBold, { maxWidth: metaMax });
  y += 14;

  const special = `Yêu cầu phục vụ đặc biệt (nếu có)/ Special requirement (if any): ${model.specialRequirement || "……………………"}`;
  drawText(page, special, MARGIN_X, y, 10, fontBold, { maxWidth: metaMax });
  y += 14;

  drawText(page, "Kích thước hàng hóa (Dimension):", MARGIN_X, y, 10, fontBold);
  y += 12;

  const layout = computeTcsDimRecordTableLayout(model.rows.length, y);
  const { slotCount, headerH, rowH, totalRowH, bodyFontSize, headerViSize, headerEnSize } =
    layout;

  const tableLeft = MARGIN_X;
  const tableRight = contentRight;
  const colXs = [
    tableLeft,
    tableLeft + 28,
    tableLeft + 118,
    tableLeft + 208,
    tableLeft + 298,
    tableLeft + 388,
    tableRight,
  ];
  const tableTop = y;
  const headerBottom = tableTop + headerH;
  const bodyBottom = headerBottom + slotCount * rowH;
  const tableBottom = bodyBottom + totalRowH;

  drawLineH(page, tableLeft, tableRight, tableTop);
  drawLineH(page, tableLeft, tableRight, headerBottom);
  for (let i = 0; i <= slotCount; i++) {
    drawLineH(page, tableLeft, tableRight, headerBottom + i * rowH);
  }
  drawLineH(page, tableLeft, tableRight, tableBottom);

  // Cột dọc: header + thân đủ 6 cột; dòng Total gộp STT…Cao (không kẻ giữa).
  for (const x of colXs) {
    drawLineV(page, x, tableTop, bodyBottom);
  }
  for (const x of [colXs[0]!, colXs[4]!, colXs[5]!, colXs[6]!]) {
    drawLineV(page, x, bodyBottom, tableBottom);
  }

  const headers = [
    "",
    "Dài (cm)\nLength",
    "Rộng\nWidth",
    "Cao\nHeight",
    "Số kiện\nPieces",
    "Kết quả (kg)\nResult",
  ];
  for (let c = 1; c <= 5; c++) {
    const [vi, en] = headers[c]!.split("\n");
    const x0 = colXs[c]!;
    const x1 = colXs[c + 1]!;
    const band = headerH / 2;
    drawCellCentered(
      page,
      vi!,
      x0,
      x1,
      tableTop,
      tableTop + band,
      headerViSize,
      fontBold,
      2
    );
    drawCellCentered(
      page,
      en!,
      x0,
      x1,
      tableTop + band,
      headerBottom,
      headerEnSize,
      font,
      2
    );
  }

  const formatCtx = { flight: model.flight, awb: model.awb };

  for (let i = 0; i < slotCount; i++) {
    const rowTop = headerBottom + i * rowH;
    const rowBottom = rowTop + rowH;
    drawCellCentered(
      page,
      String(i + 1),
      colXs[0]!,
      colXs[1]!,
      rowTop,
      rowBottom,
      bodyFontSize,
      font,
      2
    );

    const data = model.rows[i];
    if (!data) continue;

    const cells = [
      formatDimEdge(data.lCm),
      formatDimEdge(data.wCm),
      formatDimEdge(data.hCm),
      String(data.pcs),
      data.dimKg == null ? "" : formatLineDimKgDisplay(data.dimKg, formatCtx),
    ];
    for (let c = 0; c < 5; c++) {
      drawCellCentered(
        page,
        cells[c]!,
        colXs[c + 1]!,
        colXs[c + 2]!,
        rowTop,
        rowBottom,
        bodyFontSize,
        font,
        3
      );
    }
  }

  // Ô gộp STT–Cao: căn giữa ngang/dọc; ưu tiên giữ đủ chữ (không cắt "Total").
  const totalLabelSize = Math.min(
    Math.max(bodyFontSize, 8),
    Math.max(7, totalRowH * 0.55)
  );
  drawCellCentered(
    page,
    "Tổng cộng/ Total",
    colXs[0]!,
    colXs[4]!,
    bodyBottom,
    tableBottom,
    totalLabelSize,
    fontBold,
    6
  );
  drawCellCentered(
    page,
    String(model.totalPcsLines || ""),
    colXs[4]!,
    colXs[5]!,
    bodyBottom,
    tableBottom,
    bodyFontSize,
    fontBold,
    3
  );
  if (model.totalDimKgText) {
    drawCellCentered(
      page,
      model.totalDimKgText,
      colXs[5]!,
      colXs[6]!,
      bodyBottom,
      tableBottom,
      bodyFontSize,
      fontBold,
      3
    );
  }

  // Chữ ký — neo gần đáy trang để luôn còn chỗ khi bảng dài.
  const sigTop = Math.min(tableBottom + 20, PAGE_H - MARGIN_BOTTOM - 70);
  const sigLeft = tableLeft + 40;
  const sigRight = tableLeft + 320;
  drawText(page, "Khách hàng", sigLeft, sigTop, 9, fontBold);
  drawText(page, "Customer", sigLeft, sigTop + 11, 8, font);
  drawText(page, "Nhân viên TCS", sigRight, sigTop, 9, fontBold);
  drawText(page, "TCS staff", sigRight, sigTop + 11, 8, font);
  const sigHint = "(Ký và ghi rõ họ tên/ Name, signature)";
  drawText(page, sigHint, sigLeft - 10, sigTop + 40, 7.5, font);
  drawText(page, sigHint, sigRight - 10, sigTop + 40, 7.5, font);

  return pdf.save();
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

/** Tải PDF form DIM TCS (QF/ED/49). >13 dòng → tự thêm hàng, co vừa 1 trang. */
export async function downloadTcsDimRecordPdf(s: Shipment): Promise<void> {
  if (!isTcsDimRecordWarehouse(s.warehouse)) {
    notifyWarning(
      "Form DIM TCS (QF/ED/49) chỉ áp dụng cho family TCS (TCS hoặc TECS-TCS).",
      "PDF DIM TCS"
    );
    return;
  }
  if ((s.dimLines?.length ?? 0) <= 0) {
    notifyWarning("Chưa có chi tiết DIM (D×R×C×kiện). Hãy nhập DIM trước.", "PDF DIM TCS");
    return;
  }

  const model = buildTcsDimRecordModel(s);
  if (!model) {
    notifyWarning("Không đọc được dữ liệu DIM.", "PDF DIM TCS");
    return;
  }

  try {
    const bytes = await buildTcsDimRecordPdfBytes(model);
    downloadPdfBytes(bytes, tcsDimRecordFilename(model.customer));
  } catch (e) {
    console.error("[downloadTcsDimRecordPdf]", e);
    notifyError(e instanceof Error ? e.message : "Không tạo được file PDF DIM.", "PDF DIM TCS");
  }
}
