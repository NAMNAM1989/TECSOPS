import { isTcsFamily } from "../constants/warehouses";
import {
  filterCargoDayReportByWarehouseFamily,
  type CargoDayReportModel,
  type CargoDayReportRow,
} from "./cargoDayReport";

export type CargoDayReportImageVariant = "basic" | "withCustomer";

/** Nút copy ảnh Ops: Vantage / Tecs / kho TCS / kho SCSC. */
export type CargoDayReportCopyKind = "vantage" | "tecs" | "tcs" | "scsc";

export type CopyCargoDayReportImageResult =
  | {
      ok: true;
      mode: "clipboard" | "download";
      filename: string;
      label: string;
      totalLots: number;
    }
  | { ok: false; reason: string };

export type CargoDayReportCopyResolved = {
  variant: CargoDayReportImageVariant;
  family: "TCS" | "SCSC" | null;
  label: string;
  titleTag: string;
  filenameSuffix: string;
};

export function resolveCargoDayReportCopyKind(
  kind: CargoDayReportCopyKind,
): CargoDayReportCopyResolved {
  switch (kind) {
    case "tecs":
      return {
        variant: "withCustomer",
        family: null,
        label: "Tecs",
        titleTag: " · Tecs",
        filenameSuffix: "-tecs",
      };
    case "tcs":
      return {
        variant: "withCustomer",
        family: "TCS",
        label: "TCS",
        titleTag: " · TCS",
        filenameSuffix: "-tcs",
      };
    case "scsc":
      return {
        variant: "withCustomer",
        family: "SCSC",
        label: "SCSC",
        titleTag: " · SCSC",
        filenameSuffix: "-scsc",
      };
    case "vantage":
    default:
      return {
        variant: "basic",
        family: null,
        label: "Vantage",
        titleTag: " · Vantage",
        filenameSuffix: "-vantage",
      };
  }
}

type ColDef = { key: string; title: string; width: number };

/**
 * Cột rộng hơn — AWB / flight đọc rõ trên Zalo sau khi nén.
 * Cutoff hẹp lại (vừa `17H - 15APR`) để tổng ảnh không quá rộng → chữ ít bị nén.
 */
const COLS_BASIC: readonly ColDef[] = [
  { key: "stt", title: "STT", width: 64 },
  { key: "booking", title: "Booking (AWB)", width: 200 },
  { key: "flightDate", title: "Flight / Date", width: 210 },
  { key: "cutoff", title: "Cutoff", width: 148 },
  { key: "dest", title: "Dest", width: 100 },
];

/**
 * Tecs / kho: Short Code khách + Kiện/Kg.
 * Booking (AWB) đủ rộng cho `160-1234 5675`; Cutoff hẹp; Customer/Flight phóng to để đọc rõ.
 */
const COLS_WITH_CUSTOMER: readonly ColDef[] = [
  { key: "stt", title: "STT", width: 52 },
  { key: "booking", title: "Booking (AWB)", width: 198 },
  { key: "customer", title: "Customer", width: 180 },
  { key: "pcsKg", title: "Kiện/Kg", width: 118 },
  { key: "flightDate", title: "Flight / Date", width: 260 },
  { key: "cutoff", title: "Cutoff", width: 112 },
  { key: "dest", title: "Dest", width: 80 },
];

/** Scale cố định cao — ảnh chat bị nén vẫn còn nét. */
const RENDER_SCALE = 3;

/** Cỡ chữ cell Tecs/kho — Customer / Flight nổi bật hơn các cột phụ. */
const TECS_CUSTOMER_PX = 20;
const TECS_FLIGHT_PX = 20;
const BASIC_FLIGHT_PX = 16;

const FONT_STACK = "Segoe UI, ui-sans-serif, system-ui, Arial, sans-serif";
const MONO_STACK = "Consolas, ui-monospace, Cascadia Mono, monospace";

const URGENT_BG = "#fee2e2";
const URGENT_FG = "#b91c1c";

function colsForVariant(variant: CargoDayReportImageVariant): readonly ColDef[] {
  return variant === "withCustomer" ? COLS_WITH_CUSTOMER : COLS_BASIC;
}

/** Layout cột (test / debug) — Tecs ưu tiên rộng Customer + Flight. */
export function cargoDayReportImageColWidths(
  variant: CargoDayReportImageVariant,
): Readonly<Record<string, number>> {
  return Object.fromEntries(colsForVariant(variant).map((c) => [c.key, c.width]));
}

function downloadPngBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Không tạo được ảnh PNG."));
      },
      "image/png",
      1,
    );
  });
}

async function tryWriteImageClipboard(blob: Blob): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.write) return false;
  if (typeof ClipboardItem === "undefined") return false;
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ]);
    return true;
  } catch {
    return false;
  }
}

function measureText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = "…";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const trial = `${text.slice(0, mid)}${ellipsis}`;
    if (ctx.measureText(trial).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? `${text.slice(0, lo)}${ellipsis}` : ellipsis;
}

function fillTextVCenter(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  cellTop: number,
  cellH: number,
): void {
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, cellTop + cellH / 2);
}

function cellValue(row: CargoDayReportRow, key: string): string {
  switch (key) {
    case "stt":
      return String(row.stt);
    case "booking":
      return row.booking;
    case "customer":
      return row.customerShortCode;
    case "pcsKg":
      return row.pcsKg;
    case "flightDate":
      return row.flightDate;
    case "cutoff":
      return row.cutoff;
    case "dest":
      return row.dest;
    default:
      return "";
  }
}

/** Vẽ Flight / Date — tô đỏ phần ngày khi lô gấp (bay cùng phiên). */
function drawFlightDateCell(
  ctx: CanvasRenderingContext2D,
  row: CargoDayReportRow,
  x: number,
  y: number,
  colW: number,
  rowH: number,
  cellPadX: number,
  fontPx: number = BASIC_FLIGHT_PX,
): void {
  const maxW = colW - cellPadX * 2;
  const midY = y + rowH / 2;

  if (row.flightDateUrgent) {
    ctx.fillStyle = URGENT_BG;
    ctx.fillRect(x + 1, y + 1, colW - 2, rowH - 2);
  }

  ctx.textBaseline = "middle";
  ctx.font = `700 ${fontPx}px ${FONT_STACK}`;

  const flight = row.flight;
  const dateLabel = row.flightDateLabel;

  if (flight && dateLabel) {
    const sep = " / ";
    const flightDraw = measureText(ctx, flight, Math.max(24, maxW * 0.55));
    ctx.fillStyle = "#0f172a";
    ctx.fillText(flightDraw, x + cellPadX, midY);
    let cursor = x + cellPadX + ctx.measureText(flightDraw).width;

    ctx.fillStyle = "#0f172a";
    ctx.fillText(sep, cursor, midY);
    cursor += ctx.measureText(sep).width;

    const remain = Math.max(8, x + cellPadX + maxW - cursor);
    ctx.font = `800 ${fontPx}px ${FONT_STACK}`;
    ctx.fillStyle = row.flightDateUrgent ? URGENT_FG : "#0f172a";
    const dateDraw = measureText(ctx, dateLabel, remain);
    ctx.fillText(dateDraw, cursor, midY);
    return;
  }

  const text = measureText(ctx, row.flightDate, maxW);
  ctx.font = `700 ${fontPx}px ${FONT_STACK}`;
  ctx.fillStyle = row.flightDateUrgent ? URGENT_FG : "#0f172a";
  fillTextVCenter(ctx, text, x + cellPadX, y, rowH);
}

/** Vẽ bảng báo cáo hàng hóa ra canvas (độ phân giải cao, dễ đọc trên group chat). */
export function renderCargoDayReportCanvas(
  model: CargoDayReportModel,
  variant: CargoDayReportImageVariant = "basic",
  titleTag = "",
): HTMLCanvasElement {
  const cols = colsForVariant(variant);
  const isTecsLayout = variant === "withCustomer";
  const scale = RENDER_SCALE;
  const padX = 36;
  const padY = 32;
  const titleH = 44;
  const subH = 28;
  const legendH = model.hasUrgentFlightDate ? 26 : 0;
  const sectionGap = 28;
  const sectionHeadH = 44;
  /** Tecs/kho: hàng cao hơn để chữ Customer / Flight 20px không bị chật. */
  const rowH = isTecsLayout ? 52 : 44;
  const headH = isTecsLayout ? 46 : 42;
  const cellPadX = isTecsLayout ? 16 : 14;
  const flightFontPx = isTecsLayout ? TECS_FLIGHT_PX : BASIC_FLIGHT_PX;
  const tableW = cols.reduce((s, c) => s + c.width, 0);

  let contentH = padY + titleH + subH + (legendH ? legendH + 4 : 0) + 16;
  for (const sec of model.sections) {
    contentH += sectionHeadH + headH + sec.rows.length * rowH + sectionGap;
  }
  contentH += padY;

  const cssW = padX * 2 + tableW;
  const cssH = Math.max(contentH, 180);

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(cssW * scale);
  canvas.height = Math.ceil(cssH * scale);

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D không khả dụng.");

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cssW, cssH);

  let y = padY;

  ctx.fillStyle = "#0f172a";
  ctx.font = `700 28px ${FONT_STACK}`;
  ctx.textBaseline = "top";
  ctx.fillText(`Báo cáo hàng hóa · ${model.titleDate}${titleTag}`, padX, y);
  y += titleH;

  ctx.fillStyle = "#334155";
  ctx.font = `500 16px ${FONT_STACK}`;
  const sectionSummary = model.sections
    .map((s) => `${s.label} ${s.rows.length}`)
    .join("  ·  ");
  ctx.fillText(`Tổng ${model.totalLots} lô  ·  ${sectionSummary}`, padX, y);
  y += subH;

  if (model.hasUrgentFlightDate) {
    ctx.fillStyle = URGENT_FG;
    ctx.font = `600 14px ${FONT_STACK}`;
    ctx.fillText("Ngày đỏ = bay cùng ngày phiên (lô gấp)", padX, y + 4);
    y += legendH + 4;
  } else {
    y += 16;
  }

  for (const sec of model.sections) {
    const tcsFamily = isTcsFamily(sec.warehouse);
    ctx.fillStyle = tcsFamily ? "#bae6fd" : "#ddd6fe";
    ctx.fillRect(padX, y, tableW, sectionHeadH);
    ctx.strokeStyle = tcsFamily ? "#0284c7" : "#7c3aed";
    ctx.lineWidth = 2;
    ctx.strokeRect(padX + 0.5, y + 0.5, tableW - 1, sectionHeadH - 1);

    ctx.fillStyle = "#0f172a";
    ctx.font = `700 18px ${FONT_STACK}`;
    fillTextVCenter(
      ctx,
      `${sec.label}  (${sec.rows.length} lô)`,
      padX + cellPadX,
      y,
      sectionHeadH,
    );
    y += sectionHeadH;

    ctx.fillStyle = "#1e293b";
    ctx.fillRect(padX, y, tableW, headH);

    let x = padX;
    ctx.fillStyle = "#f8fafc";
    for (const col of cols) {
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, col.width - 1, headH - 1);
      const headerPx =
        isTecsLayout && (col.key === "customer" || col.key === "flightDate")
          ? 16
          : 15;
      ctx.font = `700 ${headerPx}px ${FONT_STACK}`;
      if (col.key === "stt" || col.key === "dest" || col.key === "pcsKg") {
        const tw = ctx.measureText(col.title).width;
        fillTextVCenter(ctx, col.title, x + (col.width - tw) / 2, y, headH);
      } else {
        fillTextVCenter(ctx, col.title, x + cellPadX, y, headH);
      }
      x += col.width;
    }
    y += headH;

    for (let i = 0; i < sec.rows.length; i++) {
      const row = sec.rows[i]!;
      ctx.fillStyle = i % 2 === 1 ? "#f1f5f9" : "#ffffff";
      ctx.fillRect(padX, y, tableW, rowH);

      x = padX;
      for (const col of cols) {
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, col.width - 1, rowH - 1);

        const maxW = col.width - cellPadX * 2;

        if (col.key === "flightDate") {
          drawFlightDateCell(
            ctx,
            row,
            x,
            y,
            col.width,
            rowH,
            cellPadX,
            flightFontPx,
          );
        } else if (col.key === "stt") {
          ctx.fillStyle = "#0f172a";
          ctx.font = `700 16px ${FONT_STACK}`;
          const text = measureText(ctx, cellValue(row, col.key), maxW);
          const tw = ctx.measureText(text).width;
          fillTextVCenter(ctx, text, x + (col.width - tw) / 2, y, rowH);
        } else if (col.key === "booking") {
          ctx.fillStyle = "#0f172a";
          ctx.font = `700 17px ${MONO_STACK}`;
          const text = measureText(ctx, cellValue(row, col.key), maxW);
          fillTextVCenter(ctx, text, x + cellPadX, y, rowH);
        } else if (col.key === "customer") {
          ctx.fillStyle = "#0f172a";
          ctx.font = `800 ${TECS_CUSTOMER_PX}px ${FONT_STACK}`;
          const text = measureText(ctx, cellValue(row, col.key), maxW);
          fillTextVCenter(ctx, text, x + cellPadX, y, rowH);
        } else if (col.key === "pcsKg") {
          ctx.fillStyle = "#0f172a";
          ctx.font = `700 15px ${MONO_STACK}`;
          const text = measureText(ctx, cellValue(row, col.key), maxW);
          const tw = ctx.measureText(text).width;
          fillTextVCenter(ctx, text, x + (col.width - tw) / 2, y, rowH);
        } else if (col.key === "dest") {
          ctx.fillStyle = "#0f172a";
          ctx.font = `700 16px ${FONT_STACK}`;
          const text = measureText(ctx, cellValue(row, col.key), maxW);
          const tw = ctx.measureText(text).width;
          fillTextVCenter(ctx, text, x + (col.width - tw) / 2, y, rowH);
        } else if (col.key === "cutoff") {
          // Cột hẹp — chữ gọn nhưng đậm để vẫn đọc được `17H - 15APR`
          ctx.fillStyle = "#0f172a";
          ctx.font = `700 15px ${FONT_STACK}`;
          const text = measureText(ctx, cellValue(row, col.key), maxW);
          fillTextVCenter(ctx, text, x + cellPadX, y, rowH);
        } else {
          ctx.fillStyle = "#0f172a";
          ctx.font = `600 16px ${FONT_STACK}`;
          const text = measureText(ctx, cellValue(row, col.key), maxW);
          fillTextVCenter(ctx, text, x + cellPadX, y, rowH);
        }
        x += col.width;
      }
      y += rowH;
    }

    y += sectionGap;
  }

  return canvas;
}

/**
 * Copy ảnh PNG vào clipboard; nếu trình duyệt chặn thì tải file.
 * `vantage` = layout cơ bản; `tecs` = Short Code + Kiện/Kg;
 * `tcs` / `scsc` = cùng layout Tecs, chỉ một family kho.
 */
export async function copyCargoDayReportImage(
  model: CargoDayReportModel,
  options?: {
    kind?: CargoDayReportCopyKind;
    /** @deprecated dùng `kind` */
    variant?: CargoDayReportImageVariant;
  },
): Promise<CopyCargoDayReportImageResult> {
  const resolved = options?.kind
    ? resolveCargoDayReportCopyKind(options.kind)
    : resolveCargoDayReportCopyKind(
        options?.variant === "withCustomer" ? "tecs" : "vantage",
      );

  const scoped = resolved.family
    ? filterCargoDayReportByWarehouseFamily(model, resolved.family)
    : model;

  if (scoped.totalLots <= 0 || scoped.sections.length === 0) {
    return {
      ok: false,
      reason: resolved.family
        ? `Không có lô ${resolved.label} trong ngày phiên này.`
        : "Không có lô nào trong ngày phiên này.",
    };
  }

  const filename = `bao-cao-hang-hoa${resolved.filenameSuffix}-${scoped.sessionYmd || "ngay"}.png`;
  try {
    const canvas = renderCargoDayReportCanvas(
      scoped,
      resolved.variant,
      resolved.titleTag,
    );
    const blob = await canvasToPngBlob(canvas);
    const clipped = await tryWriteImageClipboard(blob);
    if (clipped) {
      return {
        ok: true,
        mode: "clipboard",
        filename,
        label: resolved.label,
        totalLots: scoped.totalLots,
      };
    }
    downloadPngBlob(blob, filename);
    return {
      ok: true,
      mode: "download",
      filename,
      label: resolved.label,
      totalLots: scoped.totalLots,
    };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "Không tạo được ảnh báo cáo.",
    };
  }
}
