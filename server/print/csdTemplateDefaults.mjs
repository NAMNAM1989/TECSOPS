import { mmFontToPt } from "./printMmUnits.mjs";
import { CSD_A4_PAGE } from "./csdAirlineCatalog.mjs";

/** A4 — mẫu CSD mặc định (fallback khi hãng chưa gán form riêng). */
export const CSD_TEMPLATE = {
  code: "csd-a4-default",
  name: "CSD IATA (A4 — mặc định)",
  page_width_mm: CSD_A4_PAGE.page_width_mm,
  page_height_mm: CSD_A4_PAGE.page_height_mm,
  background_asset_url: "/print-templates/csd/_default/background.png",
  paper: "A4",
};

function field(key, x, y, width, fontPt, extra = {}) {
  return {
    field_key: key,
    pos_x_mm: x,
    pos_y_mm: y,
    width_mm: width,
    font_size_pt: fontPt,
    align: "left",
    multiline: false,
    bold: false,
    line_height_mm: null,
    height_mm: null,
    max_lines: null,
    wipe: false,
    ...extra,
  };
}

function fieldMm(key, x, y, width, fontMm, extra = {}) {
  return field(key, x, y, width, mmFontToPt(fontMm), extra);
}

/** Tọa độ căn theo form IATA CSD mẫu (mm, gốc trên-trái). */
export function buildCsdDefaultFields() {
  const noWipe = { wipe: false };
  return [
    fieldMm("raCategoryIdentifier", 26, 54, 78, 2.8, { bold: true, ...noWipe }),
    fieldMm("uniqueConsignmentId", 108, 54, 100, 2.8, { bold: true, ...noWipe }),
    fieldMm("contentsOfConsignment", 26, 62, 183, 2.6, {
      multiline: true,
      max_lines: 4,
      line_height_mm: 3.2,
      height_mm: 12,
      ...noWipe,
    }),
    fieldMm("consolidationMark", 25.5, 69.2, 5, 2.4, { align: "center", ...noWipe }),
    fieldMm("origin", 26, 82.5, 42, 2.8, { bold: true, ...noWipe }),
    fieldMm("destination", 71, 82.5, 33, 2.8, { bold: true, ...noWipe }),
    fieldMm("transferTransit", 108, 82.5, 100, 2.5, { ...noWipe }),
    fieldMm("securityStatus", 26, 105.5, 26, 2.8, { bold: true, ...noWipe }),
    fieldMm("receivedFrom", 55, 105.5, 38, 2.5, { ...noWipe }),
    fieldMm("screeningMethod", 98, 105.5, 40, 2.5, { ...noWipe }),
    fieldMm("groundsExemption", 143, 105.5, 66, 2.5, { ...noWipe }),
    fieldMm("otherScreening", 26, 134, 183, 2.5, { ...noWipe }),
    fieldMm("issuedByName", 26, 153.5, 92, 2.5, { ...noWipe }),
    fieldMm("issuedDate", 123, 153.5, 32, 2.5, { ...noWipe }),
    fieldMm("issuedTime", 160, 153.5, 28, 2.5, { ...noWipe }),
    fieldMm("acceptedEntity", 26, 167.5, 183, 2.4, {
      multiline: true,
      max_lines: 2,
      line_height_mm: 3.2,
      height_mm: 8,
      ...noWipe,
    }),
    fieldMm("additionalSecurityInfo", 26, 187, 183, 2.2, {
      multiline: true,
      max_lines: 10,
      line_height_mm: 3,
      height_mm: 72,
      ...noWipe,
    }),
  ];
}
