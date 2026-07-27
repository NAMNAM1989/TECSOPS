import type { CargoDayReportModel } from "./cargoDayReport";

export type CopyCargoDayReportImageResult =
  | { ok: true; mode: "clipboard" | "download"; filename: string }
  | { ok: false; reason: string };

/** Cột rộng hơn — AWB / flight / cutoff đọc rõ trên Zalo sau khi nén. */
const COLS = [
  { key: "stt", title: "STT", width: 64 },
  { key: "booking", title: "Booking (AWB)", width: 200 },
  { key: "flightDate", title: "Flight / Date", width: 210 },
  { key: "cutoff", title: "Cutoff", width: 210 },
  { key: "dest", title: "Dest", width: 100 },
] as const;

/** Scale cố định cao — ảnh chat bị nén vẫn còn nét. */
const RENDER_SCALE = 3;

const FONT_STACK = "Segoe UI, ui-sans-serif, system-ui, Arial, sans-serif";
const MONO_STACK = "Consolas, ui-monospace, Cascadia Mono, monospace";

type ColKey = (typeof COLS)[number]["key"];

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

/** Vẽ bảng báo cáo hàng hóa ra canvas (độ phân giải cao, dễ đọc trên group chat). */
export function renderCargoDayReportCanvas(
  model: CargoDayReportModel,
): HTMLCanvasElement {
  const scale = RENDER_SCALE;
  const padX = 36;
  const padY = 32;
  const titleH = 44;
  const subH = 28;
  const sectionGap = 28;
  const sectionHeadH = 44;
  const rowH = 44;
  const headH = 42;
  const cellPadX = 14;
  const tableW = COLS.reduce((s, c) => s + c.width, 0);

  let contentH = padY + titleH + subH + 16;
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
  ctx.fillText(`Báo cáo hàng hóa · ${model.titleDate}`, padX, y);
  y += titleH;

  ctx.fillStyle = "#334155";
  ctx.font = `500 16px ${FONT_STACK}`;
  const sectionSummary = model.sections
    .map((s) => `${s.label} ${s.rows.length}`)
    .join("  ·  ");
  ctx.fillText(`Tổng ${model.totalLots} lô  ·  ${sectionSummary}`, padX, y);
  y += subH + 16;

  for (const sec of model.sections) {
    ctx.fillStyle = sec.warehouse === "TECS-TCS" ? "#bae6fd" : "#ddd6fe";
    ctx.fillRect(padX, y, tableW, sectionHeadH);
    ctx.strokeStyle = sec.warehouse === "TECS-TCS" ? "#0284c7" : "#7c3aed";
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
    ctx.font = `700 15px ${FONT_STACK}`;
    ctx.fillStyle = "#f8fafc";
    for (const col of COLS) {
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, col.width - 1, headH - 1);
      if (col.key === "stt") {
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

      const cells: Record<ColKey, string> = {
        stt: String(row.stt),
        booking: row.booking,
        flightDate: row.flightDate,
        cutoff: row.cutoff,
        dest: row.dest,
      };

      x = padX;
      for (const col of COLS) {
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, col.width - 1, rowH - 1);

        const maxW = col.width - cellPadX * 2;
        ctx.fillStyle = "#0f172a";

        if (col.key === "stt") {
          ctx.font = `700 16px ${FONT_STACK}`;
          const text = measureText(ctx, cells.stt, maxW);
          const tw = ctx.measureText(text).width;
          fillTextVCenter(ctx, text, x + (col.width - tw) / 2, y, rowH);
        } else if (col.key === "booking") {
          ctx.font = `700 17px ${MONO_STACK}`;
          const text = measureText(ctx, cells.booking, maxW);
          fillTextVCenter(ctx, text, x + cellPadX, y, rowH);
        } else if (col.key === "dest") {
          ctx.font = `700 16px ${FONT_STACK}`;
          const text = measureText(ctx, cells.dest, maxW);
          const tw = ctx.measureText(text).width;
          fillTextVCenter(ctx, text, x + (col.width - tw) / 2, y, rowH);
        } else {
          ctx.font = `600 16px ${FONT_STACK}`;
          const text = measureText(ctx, cells[col.key], maxW);
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
 */
export async function copyCargoDayReportImage(
  model: CargoDayReportModel,
): Promise<CopyCargoDayReportImageResult> {
  if (model.totalLots <= 0 || model.sections.length === 0) {
    return { ok: false, reason: "Không có lô nào trong ngày phiên này." };
  }

  const filename = `bao-cao-hang-hoa-${model.sessionYmd || "ngay"}.png`;
  try {
    const canvas = renderCargoDayReportCanvas(model);
    const blob = await canvasToPngBlob(canvas);
    const clipped = await tryWriteImageClipboard(blob);
    if (clipped) {
      return { ok: true, mode: "clipboard", filename };
    }
    downloadPngBlob(blob, filename);
    return { ok: true, mode: "download", filename };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "Không tạo được ảnh báo cáo.",
    };
  }
}
