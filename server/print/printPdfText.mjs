import { mmToPt, clamp } from "./printMmUnits.mjs";
import { applyScscPrintTransformBox } from "./scscPrintTransform.mjs";

/**
 * Vẽ text trong hộp mm — transform khớp preview (offset + pos*scale).
 * @param {import('pdfkit').PDFDocument} doc
 * @param {object} field
 * @param {string} text
 * @param {{ offsetXmm?: number; offsetYMm?: number; scaleX?: number; scaleY?: number }} profile
 */
export function drawFieldText(doc, field, text, profile = {}) {
  const raw = String(text ?? "");
  if (!raw.trim()) return;

  const posX = Number(field.pos_x_mm) || 0;
  const posY = Number(field.pos_y_mm) || 0;
  const widthRaw = field.width_mm != null ? Number(field.width_mm) : 50;
  const heightRaw = field.height_mm != null ? Number(field.height_mm) : null;
  const lineHeightRaw = field.line_height_mm != null ? Number(field.line_height_mm) : null;

  const box = applyScscPrintTransformBox(
    { x: posX, y: posY, width: widthRaw, height: heightRaw, lineHeight: lineHeightRaw },
    profile
  );

  const x = mmToPt(box.xMm);
  const y = mmToPt(box.yMm);
  const width = mmToPt(box.widthMm);
  const heightMm = box.heightMm;
  const lineHeightMm = box.lineHeightMm;

  const align = field.align === "center" || field.align === "right" ? field.align : "left";
  const fontName = field.bold ? "Helvetica-Bold" : "Helvetica";

  let fontPt = clamp(Number(field.font_size_pt) || 9, 4, 36) * box.fontScale;
  const minPt = 4;
  const maxLines = field.max_lines != null ? Math.max(1, Number(field.max_lines)) : null;
  const multiline = Boolean(field.multiline || maxLines == null || maxLines > 1);
  const useFixedLayout = heightMm != null && lineHeightMm != null;

  doc.font(fontName);

  const drawAt = (sizePt) => {
    doc.fontSize(sizePt);
    const lineGap = lineHeightMm != null ? mmToPt(lineHeightMm) - sizePt : sizePt * 0.15;
    doc.text(raw, x, y, {
      width,
      align,
      lineGap,
      lineBreak: multiline,
      ellipsis: !multiline && maxLines === 1,
    });
  };

  if (useFixedLayout) {
    drawAt(fontPt);
    return;
  }

  while (fontPt >= minPt) {
    doc.fontSize(fontPt);
    const lineGap = lineHeightMm != null ? mmToPt(lineHeightMm) - fontPt : fontPt * 0.15;
    const options = {
      width,
      align,
      lineGap,
      ellipsis: maxLines === 1,
    };
    if (multiline) {
      options.lineBreak = true;
    }

    const h = doc.heightOfString(raw, options);
    const maxH = heightMm != null ? mmToPt(heightMm) : null;
    const lines = raw.split(/\r?\n/).length + Math.max(0, Math.ceil(h / (fontPt + lineGap)) - 1);

    if ((!maxH || h <= maxH + 0.5) && (!maxLines || lines <= maxLines)) {
      doc.text(raw, x, y, options);
      return;
    }
    fontPt -= 0.5;
  }

  doc.fontSize(minPt);
  doc.text(raw, x, y, { width, align, lineBreak: true, ellipsis: true });
}
