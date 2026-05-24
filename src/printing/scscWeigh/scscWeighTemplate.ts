import type { CSSProperties } from "react";
import type { A4WeighReceiptPrinterProfile } from "../printTypes";
import type { ScscWeighPrintSettings } from "../../types/scscWeighPrintSettings";
import type { ScaleTicketFormData } from "../../utils/mapBookingToScaleTicketFormData";
import type { Warehouse } from "../../types/shipment";
import { defaultScscWeighPrintSettings, resolveScscSenderForWarehouse } from "./scscWeighPrintSettingsCore";
import { splitScscAddressTwoLines } from "../../utils/printAddressMultiline";
import {
  SCSC_PARTY_LINE_GAP_MM_DEFAULT,
  buildScscPartyBlocks,
  buildScscWeighPrintFields,
  enrichScscPrintForRender,
  resolveScscWeighLayout,
  type ScscWeighLayout,
} from "./scscWeighLayout";
import { applyScscFieldOverrides } from "./scscFieldOverrides";

export type ScscFieldDef = {
  key: string;
  x: number;
  y: number;
  width: number;
  /** Cỡ chữ theo pt (mặc định các ô form). */
  fontPt?: number;
  /** Cỡ chữ theo mm — ưu tiên hơn fontPt khi có (AWB/HAWB góc phải). */
  fontMm?: number;
  /** Chiều cao dòng (mm) — dùng cho địa chỉ căn vừa `partyLineGapMm`. */
  lineHeightMm?: number;
  /** Chiều cao ô (mm) — tên hàng nhiều dòng. */
  heightMm?: number;
  align?: "left" | "center" | "right";
  multiline?: boolean;
  /** Tự xuống dòng trong ô (căn theo `align`). */
  wrapText?: boolean;
  bold?: boolean;
};

/** Font in phiếu cân — Arial khớp PDF/in thực tế; preview dùng cùng stack. */
export const SCSC_PRINT_FONT_FAMILY =
  'Arial, "Helvetica Neue", Helvetica, ui-sans-serif, system-ui, sans-serif';

/** Khoảng cách giữa các dòng trong khối Shipper / Agent / CNEE (mm). */
export const SCSC_PARTY_LINE_GAP_MM = SCSC_PARTY_LINE_GAP_MM_DEFAULT;

/** @deprecated */
export const SCSC_SHIPPER_LINE_GAP_MM = SCSC_PARTY_LINE_GAP_MM;

const defaultLayout = resolveScscWeighLayout(null);
const defaultBlocks = buildScscPartyBlocks(defaultLayout);

/** Khối Shipper (tọa độ mép trái / mép trên A4) — mặc định layout. */
export const SCSC_SHIPPER_BLOCK = defaultBlocks.shipper;

/** Agent: mép trên 70mm. */
export const SCSC_AGENT_BLOCK = defaultBlocks.agent;

/** CNEE: layout giống Agent/Shipper. */
export const SCSC_CNEE_BLOCK = defaultBlocks.cnee;

/** @deprecated dùng SCSC_SHIPPER_BLOCK.name */
export const SCSC_SHIPPER_NAME = SCSC_SHIPPER_BLOCK.name;

/** AWB/HAWB góc phải trên phiếu SCSC. */
export const SCSC_AWB_BLOCK = {
  awb: { x: 140, y: 35, fontMm: 5, width: 68 },
  hawb: { x: 140, y: 40.5, fontMm: 4, width: 68 },
} as const;

export const SCSC_WEIGH_PRINT_FIELDS: readonly ScscFieldDef[] = buildScscWeighPrintFields(defaultLayout);

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fieldUsesWrap(def: ScscFieldDef): boolean {
  return Boolean(def.multiline || def.wrapText);
}

function cssPropKey(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/** Inline CSS từ cùng logic preview React — preview và in HTML dùng chung. */
export function scscFieldInlineStyle(def: ScscFieldDef): string {
  const box = scscFieldBoxStyle(def);
  return Object.entries(box)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${cssPropKey(k)}:${v}`)
    .join(";");
}

export function fieldStyle(def: ScscFieldDef): string {
  return scscFieldInlineStyle(def);
}

/** Style cho preview React (cùng tọa độ mm như bản in). */
export function scscFieldBoxStyle(def: ScscFieldDef): CSSProperties {
  const wrap = fieldUsesWrap(def);
  const lineHeight =
    def.lineHeightMm != null
      ? `${def.lineHeightMm}mm`
      : def.multiline
        ? 1.2
        : 1.1;
  return {
    position: "absolute",
    left: `${def.x}mm`,
    top: `${def.y}mm`,
    width: `${def.width}mm`,
    height:
      def.heightMm != null
        ? `${def.heightMm}mm`
        : def.lineHeightMm != null
          ? `${def.lineHeightMm}mm`
          : undefined,
    fontSize: def.fontMm != null ? `${def.fontMm}mm` : `${def.fontPt ?? 8.5}pt`,
    fontWeight: def.bold ? 700 : 400,
    textAlign: def.align ?? "left",
    whiteSpace: def.multiline ? "pre-line" : wrap ? "normal" : "nowrap",
    wordBreak: wrap ? "break-word" : undefined,
    overflowWrap: wrap ? "anywhere" : undefined,
    lineHeight,
    display: def.lineHeightMm != null && !wrap ? "flex" : undefined,
    alignItems: def.lineHeightMm != null && !wrap ? "center" : undefined,
    justifyContent:
      def.lineHeightMm != null && !wrap
        ? def.align === "center"
          ? "center"
          : def.align === "right"
            ? "flex-end"
            : "flex-start"
        : undefined,
    overflow: "hidden",
    color: "#000",
    fontFamily: SCSC_PRINT_FONT_FAMILY,
    boxSizing: "border-box",
  };
}

function finalizeScscPrintLayer(
  profile: A4WeighReceiptPrinterProfile | null | undefined,
  values: Record<string, string>
): { fields: ScscFieldDef[]; values: Record<string, string> } {
  const base = buildScscWeighPrintFields(resolveScscWeighLayout(profile));
  const overrides = profile?.scscFieldOverrides;
  const withOverrides = applyScscFieldOverrides(base, overrides);
  const enriched = enrichScscPrintForRender(withOverrides, values, overrides);
  const fields = applyScscFieldOverrides(enriched.fields, overrides);
  return { fields, values: enriched.values };
}

export function getScscWeighPrintFields(
  profile?: A4WeighReceiptPrinterProfile | null,
  values?: Record<string, string>
): ScscFieldDef[] {
  if (!values) {
    return buildScscWeighPrintFields(resolveScscWeighLayout(profile));
  }
  return finalizeScscPrintLayer(profile ?? null, values).fields;
}

export function resolveScscWeighPrintLayer(
  profile: A4WeighReceiptPrinterProfile | null | undefined,
  values: Record<string, string>
): { fields: ScscFieldDef[]; values: Record<string, string> } {
  return finalizeScscPrintLayer(profile ?? null, values);
}

export { resolveScscWeighLayout, type ScscWeighLayout };

export function buildScscWeighOverlayValues(
  fd: ScaleTicketFormData,
  shared: ScscWeighPrintSettings = defaultScscWeighPrintSettings(),
  warehouse: Warehouse = "TECS-SCSC"
): Record<string, string> {
  const sender = resolveScscSenderForWarehouse(shared, warehouse);
  const shipperAddr = splitScscAddressTwoLines(fd.shipperAddress);
  const agentAddr = splitScscAddressTwoLines(fd.agentAddress);
  const cneeAddr = splitScscAddressTwoLines(fd.consigneeAddress);
  return {
    shipper: fd.shipperName,
    shipperAddress1: shipperAddr.line1,
    shipperAddress2: shipperAddr.line2,
    shipperPhone: fd.shipperPhone,
    shipperEmail: fd.shipperEmail,
    shipperTaxCode: fd.taxCode,
    agentName: fd.agentName,
    agentAddress1: agentAddr.line1,
    agentAddress2: agentAddr.line2,
    agentPhone: fd.agentPhone,
    agentEmail: fd.agentEmail,
    agentTaxCode: fd.agentTaxCode,
    mawb: fd.awb,
    hawb: fd.hawb,
    consignee: fd.consigneeName || "",
    consigneeAddress1: cneeAddr.line1,
    consigneeAddress2: cneeAddr.line2,
    consigneePhone: fd.consigneePhone,
    consigneeEmail: fd.consigneeEmail,
    notify: fd.notifyName,
    destination: fd.destination,
    totalHawbs: fd.hawbDisplay,
    flightDate: fd.flightLinePrint,
    pieces: fd.totalPieces,
    goods: fd.goodsDescription,
    grossWeight: fd.grossWeight,
    chargeableWeight: fd.chargeableWeight,
    dimensions: fd.dimensionsText,
    senderName: sender.senderName,
    senderPhone: sender.senderPhone,
    otherRequirements: fd.otherRequirements,
  };
}

export function renderScscWeighFieldLayer(
  values: Record<string, string>,
  profile?: A4WeighReceiptPrinterProfile | null
): string {
  const layer = profile
    ? resolveScscWeighPrintLayer(profile, values)
    : resolveScscWeighPrintLayer(null, values);
  return layer.fields
    .filter((def) => {
      if (def.key !== "otherRequirements") return true;
      return Boolean((layer.values[def.key] ?? "").trim());
    })
    .map((def) => {
      const val = layer.values[def.key] ?? "";
      return `<div class="print-field print-only-data" style="${fieldStyle(def)}">${esc(val)}</div>`;
    })
    .join("\n");
}
