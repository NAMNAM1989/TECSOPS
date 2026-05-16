import type { ScaleTicketFormData } from "../../utils/mapBookingToScaleTicketFormData";

export type ScscFieldDef = {
  key: string;
  x: number;
  y: number;
  width: number;
  fontPt?: number;
  align?: "left" | "center" | "right";
  multiline?: boolean;
  bold?: boolean;
};

export const SCSC_WEIGH_PRINT_FIELDS: readonly ScscFieldDef[] = [
  { key: "shipper", x: 8, y: 26.2, width: 116, fontPt: 8.4, bold: true },
  { key: "shipperAddress", x: 8, y: 32.2, width: 116, fontPt: 7, multiline: true },
  { key: "shipperPhone", x: 8, y: 38.8, width: 56, fontPt: 7 },
  { key: "shipperEmail", x: 67, y: 38.8, width: 57, fontPt: 7 },
  { key: "agentName", x: 8, y: 51.5, width: 116, fontPt: 7.8, bold: true },
  { key: "agentAddress", x: 8, y: 58.7, width: 116, fontPt: 7, multiline: true },
  { key: "agentPhone", x: 8, y: 72.4, width: 56, fontPt: 7 },
  { key: "agentEmail", x: 67, y: 72.4, width: 57, fontPt: 7 },
  { key: "agentTaxCode", x: 8, y: 78.2, width: 116, fontPt: 7 },
  { key: "mawb", x: 130, y: 28, width: 70, fontPt: 9.5, bold: true },
  { key: "consignee", x: 8, y: 99.6, width: 116, fontPt: 8.2, bold: true },
  { key: "consigneeAddress", x: 8, y: 106.5, width: 116, fontPt: 7, multiline: true },
  { key: "consigneePhone", x: 8, y: 120.1, width: 56, fontPt: 7 },
  { key: "consigneeEmail", x: 67, y: 120.1, width: 57, fontPt: 7 },
  { key: "notify", x: 8, y: 128.3, width: 116, fontPt: 7.3 },
  { key: "origin", x: 150, y: 142, width: 44, fontPt: 11, align: "center", bold: true },
  { key: "destination", x: 150, y: 150.5, width: 44, fontPt: 11, align: "center", bold: true },
  { key: "totalHawbs", x: 8, y: 158.5, width: 48, fontPt: 8, align: "center" },
  { key: "flightDate", x: 112, y: 158.5, width: 88, fontPt: 9, align: "center", bold: true },
  { key: "pieces", x: 8, y: 168.5, width: 24, fontPt: 9.5, align: "center", bold: true },
  { key: "goods", x: 37, y: 168.5, width: 70, fontPt: 8.5, bold: true },
  { key: "grossWeight", x: 113, y: 168.5, width: 41, fontPt: 9.5, align: "center", bold: true },
  { key: "chargeableWeight", x: 154, y: 168.5, width: 46, fontPt: 9.5, align: "center", bold: true },
  { key: "dimensions", x: 9, y: 182.5, width: 188, fontPt: 7.8, multiline: true },
];

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fieldStyle(def: ScscFieldDef): string {
  const align = def.align ? `text-align:${def.align};` : "";
  const ws = def.multiline ? "white-space:pre-line;line-height:1.2;" : "white-space:nowrap;";
  const fw = def.bold ? "font-weight:700;" : "";
  const fs = `font-size:${(def.fontPt ?? 8.5).toFixed(2)}pt;`;
  return `left:${def.x.toFixed(2)}mm;top:${def.y.toFixed(2)}mm;width:${def.width.toFixed(
    2
  )}mm;${fs}${align}${ws}${fw}`;
}

export function buildScscWeighOverlayValues(fd: ScaleTicketFormData): Record<string, string> {
  return {
    shipper: fd.shipperName,
    shipperAddress: fd.shipperAddress,
    shipperPhone: fd.shipperPhone,
    shipperEmail: fd.shipperEmail,
    agentName: fd.agentName,
    agentAddress: fd.agentAddress,
    agentPhone: fd.agentPhone,
    agentEmail: fd.agentEmail,
    agentTaxCode: fd.agentTaxCode,
    mawb: fd.awb,
    consignee: fd.consigneeName || "",
    consigneeAddress: fd.consigneeAddress,
    consigneePhone: fd.consigneePhone,
    consigneeEmail: fd.consigneeEmail,
    notify: fd.notifyName,
    origin: fd.origin,
    destination: fd.destination,
    totalHawbs: fd.hawbDisplay,
    flightDate: fd.flightLinePrint,
    pieces: fd.totalPieces,
    goods: fd.goodsDescription,
    grossWeight: fd.grossWeight,
    chargeableWeight: fd.chargeableWeight,
    dimensions: fd.dimensionsText,
  };
}

export function renderScscWeighFieldLayer(values: Record<string, string>): string {
  return SCSC_WEIGH_PRINT_FIELDS.map((def) => {
    const val = values[def.key] ?? "";
    return `<div class="print-field print-only-data" style="${fieldStyle(def)}">${esc(val)}</div>`;
  }).join("\n");
}
