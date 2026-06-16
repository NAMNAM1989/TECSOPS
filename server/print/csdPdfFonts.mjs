import fs from "node:fs";
import path from "node:path";

/**
 * Font giống AWB Editor (data = monospace/courier, label = sans nhỏ).
 * @param {import('pdfkit').PDFDocument} doc
 */
export function registerCsdPdfFonts(doc) {
  const win = process.env.WINDIR || "C:\\Windows";
  const fontsDir = path.join(win, "Fonts");

  const courier = [path.join(fontsDir, "cour.ttf"), path.join(fontsDir, "Courier New.ttf")].find((p) =>
    fs.existsSync(p)
  );
  const courierBd = [path.join(fontsDir, "courbd.ttf"), path.join(fontsDir, "Courier New Bold.ttf")].find((p) =>
    fs.existsSync(p)
  );
  const times = [path.join(fontsDir, "times.ttf"), path.join(fontsDir, "Times.TTF")].find((p) =>
    fs.existsSync(p)
  );
  const timesBd = [path.join(fontsDir, "timesbd.ttf"), path.join(fontsDir, "Timesbd.TTF")].find((p) =>
    fs.existsSync(p)
  );

  if (courier) {
    doc.registerFont("Csd-Courier", courier);
    doc.registerFont("Csd-Courier-Bold", courierBd || courier);
  }
  if (times) {
    doc.registerFont("Csd-Times", times);
    doc.registerFont("Csd-Times-Bold", timesBd || times);
  }

  return {
    data: courier ? "Csd-Courier" : "Courier",
    dataBold: courier ? "Csd-Courier-Bold" : "Courier-Bold",
    label: times ? "Csd-Times" : "Helvetica",
    title: times ? "Csd-Times-Bold" : "Helvetica-Bold",
  };
}

/** Chọn font theo field CSD. */
export function csdFontForField(fonts, field) {
  if (field.font_role === "label") return fonts.label;
  if (field.bold) return fonts.dataBold;
  return fonts.data;
}
