import { mmToPt, clamp } from "./printMmUnits.mjs";

/**
 * Vẽ text trong hộp mm: tự xuống dòng + thu nhỏ font nếu tràn chiều cao.
 * @param {import('pdfkit').PDFDocument} doc
 * @param {object} field — row từ print_template_fields
 * @param {string} text
 * @param {{ offsetXmm?: number; offsetYmm?: number; scaleX?: number; scaleY?: number }} profile
 */
export function drawFieldText(doc, field, text, profile = {}) {
  const raw = String(text ?? "").trim();
  if (!raw) return;

  const offsetX = Number(profile.offsetXmm ?? 0);
  const offsetY = Number(profile.offsetYmm ?? 0);
  const scaleX = Number(profile.scaleX ?? 1);
  const scaleY = Number(profile.scaleY ?? 1);

  const xMm = (Number(field.pos_x_mm) + offsetX) * scaleX;
  const yMm = (Number(field.pos_y_mm) + offsetY) * scaleY;
  const widthMm = field.width_mm != null ? Number(field.width_mm) * scaleX : 50 * scaleX;
  const heightMm = field.height_mm != null ? Number(field.height_mm) * scaleY : null;
  const lineHeightMm = field.line_height_mm != null ? Number(field.line_height_mm) * scaleY : null;

  const x = mmToPt(xMm);
  const y = mmToPt(yMm);
  const width = mmToPt(widthMm);

  const align = field.align === "center" || field.align === "right" ? field.align : "left";
  const fontName = field.bold ? "Helvetica-Bold" : "Helvetica";

  let fontPt = clamp(Number(field.font_size_pt) || 9, 4, 36);
  const minPt = 4;
  const maxLines = field.max_lines != null ? Math.max(1, Number(field.max_lines)) : null;

  doc.font(fontName);

  while (fontPt >= minPt) {
    doc.fontSize(fontPt);
    const lineGap = lineHeightMm != null ? mmToPt(lineHeightMm) - fontPt : fontPt * 0.15;
    const options = {
      width,
      align,
      lineGap,
      ellipsis: maxLines === 1,
    };
    if (field.multiline || maxLines == null || maxLines > 1) {
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
