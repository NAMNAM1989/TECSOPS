import { mmFontToPt } from "./printMmUnits.mjs";

/** US Letter — khớp `public/print-templates/csd-template.pdf`. */
export const CSD_TEMPLATE = {
  code: "iata-csd-letter",
  name: "IATA Consignment Security Declaration",
  page_width_mm: 215.9,
  page_height_mm: 279.4,
  background_asset_url: "/print-templates/csd-template.png",
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
  return [
    fieldMm("raCategoryIdentifier", 26, 54, 78, 2.8, { bold: true, wipe: true, wipe_h_mm: 5 }),
    fieldMm("uniqueConsignmentId", 108, 54, 100, 2.8, { bold: true, wipe: true, wipe_h_mm: 5 }),
    fieldMm("contentsOfConsignment", 26, 62, 183, 2.6, {
      multiline: true,
      max_lines: 4,
      line_height_mm: 3.2,
      height_mm: 12,
      wipe: true,
      wipe_h_mm: 13,
    }),
    fieldMm("consolidationMark", 25.5, 69.2, 5, 2.4, { align: "center" }),
    fieldMm("origin", 26, 82.5, 42, 2.8, { bold: true, wipe: true, wipe_h_mm: 6 }),
    fieldMm("destination", 71, 82.5, 33, 2.8, { bold: true, wipe: true, wipe_h_mm: 6 }),
    fieldMm("transferTransit", 108, 82.5, 100, 2.5, { wipe: true, wipe_h_mm: 6 }),
    fieldMm("securityStatus", 26, 105.5, 26, 2.8, { bold: true, wipe: true, wipe_h_mm: 7 }),
    fieldMm("receivedFrom", 55, 105.5, 38, 2.5, { wipe: true, wipe_h_mm: 7 }),
    fieldMm("screeningMethod", 98, 105.5, 40, 2.5, { wipe: true, wipe_h_mm: 7 }),
    fieldMm("groundsExemption", 143, 105.5, 66, 2.5, { wipe: true, wipe_h_mm: 7 }),
    fieldMm("otherScreening", 26, 134, 183, 2.5, { wipe: true, wipe_h_mm: 6 }),
    fieldMm("issuedByName", 26, 153.5, 92, 2.5, { wipe: true, wipe_h_mm: 5 }),
    fieldMm("issuedDate", 123, 153.5, 32, 2.5, { wipe: true, wipe_h_mm: 5 }),
    fieldMm("issuedTime", 160, 153.5, 28, 2.5, { wipe: true, wipe_h_mm: 5 }),
    fieldMm("acceptedEntity", 26, 167.5, 183, 2.4, {
      multiline: true,
      max_lines: 2,
      line_height_mm: 3.2,
      height_mm: 8,
      wipe: true,
      wipe_h_mm: 9,
    }),
    fieldMm("additionalSecurityInfo", 26, 187, 183, 2.2, {
      multiline: true,
      max_lines: 10,
      line_height_mm: 3,
      height_mm: 72,
      wipe: true,
      wipe_h_mm: 74,
    }),
  ];
}
