import type { ScscFieldDef } from "./scscWeighTemplate";

/** Nhãn tiếng Việt cho bảng tọa độ (preview / căn chỉnh). */
export const SCSC_FIELD_LABELS_VI: Record<string, string> = {
  shipper: "Shipper — tên",
  shipperAddress1: "Shipper — địa chỉ 1",
  shipperAddress2: "Shipper — địa chỉ 2",
  shipperPhone: "Shipper — SĐT",
  shipperEmail: "Shipper — email",
  shipperTaxCode: "Shipper — MST",
  agentName: "Agent — tên",
  agentAddress1: "Agent — địa chỉ 1",
  agentAddress2: "Agent — địa chỉ 2",
  agentPhone: "Agent — SĐT",
  agentEmail: "Agent — email",
  agentTaxCode: "Agent — MST",
  mawb: "MAWB (góc phải)",
  hawb: "HAWB (góc phải)",
  consignee: "CNEE — tên",
  consigneeAddress1: "CNEE — địa chỉ 1",
  consigneeAddress2: "CNEE — địa chỉ 2",
  consigneePhone: "CNEE — SĐT",
  consigneeEmail: "CNEE — email",
  notify: "Notify",
  destination: "DEST",
  flightDate: "Chuyến / ngày bay",
  totalHawbs: "Nhãn HAWB (NO/01)",
  goods: "Tên hàng",
  pieces: "Số kiện",
  grossWeight: "GW",
  chargeableWeight: "CW",
  dimensions: "Kích thước",
  senderName: "Người gửi — tên",
  senderPhone: "Người gửi — SĐT",
  otherRequirements: "Yêu cầu khác",
};

export type ScscFieldBoundsMm = {
  key: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number | null;
  fontMm: number | null;
  fontPt: number | null;
  hasValue: boolean;
};

export function scscFieldLabelVi(key: string): string {
  return SCSC_FIELD_LABELS_VI[key] ?? key;
}

export function scscFieldHeightMm(def: ScscFieldDef): number | null {
  if (def.heightMm != null) return def.heightMm;
  if (def.lineHeightMm != null) return def.lineHeightMm;
  return null;
}

export function getScscFieldBoundsMm(
  def: ScscFieldDef,
  values: Record<string, string>
): ScscFieldBoundsMm {
  return {
    key: def.key,
    label: scscFieldLabelVi(def.key),
    x: def.x,
    y: def.y,
    width: def.width,
    height: scscFieldHeightMm(def),
    fontMm: def.fontMm ?? null,
    fontPt: def.fontPt ?? null,
    hasValue: Boolean((values[def.key] ?? "").trim()),
  };
}

export type ScscPrintTransformMm = {
  offsetXmm: number;
  offsetYmm: number;
  scaleX: number;
  scaleY: number;
};

/** Tọa độ sau translate/scale của profile A4 (khớp lớp in thực). */
export function applyScscPrintTransformToBounds(
  b: Pick<ScscFieldBoundsMm, "x" | "y" | "width" | "height">,
  t: ScscPrintTransformMm
): { x: number; y: number; width: number; height: number | null } {
  const h = b.height ?? 0;
  return {
    x: roundMm(t.offsetXmm + b.x * t.scaleX),
    y: roundMm(t.offsetYmm + b.y * t.scaleY),
    width: roundMm(b.width * t.scaleX),
    height: b.height != null ? roundMm(h * t.scaleY) : null,
  };
}

function roundMm(n: number): number {
  return Math.round(n * 10) / 10;
}

export function formatScscCoordMm(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Một dòng copy-paste cho dev / chỉnh layout. */
export function formatScscFieldCoordSnippet(b: ScscFieldBoundsMm): string {
  const font =
    b.fontMm != null
      ? `fontMm: ${formatScscCoordMm(b.fontMm)}`
      : b.fontPt != null
        ? `fontPt: ${b.fontPt}`
        : "";
  const h = b.height != null ? `, h: ${formatScscCoordMm(b.height)}` : "";
  return `{ key: "${b.key}", x: ${formatScscCoordMm(b.x)}, y: ${formatScscCoordMm(b.y)}, w: ${formatScscCoordMm(b.width)}${h}${font ? `, ${font}` : ""} }`;
}

export function buildScscCoordsCopyText(
  fields: ScscFieldBoundsMm[],
  profileName: string,
  transform: ScscPrintTransformMm
): string {
  const lines = [
    `# SCSC phiếu cân — ${profileName}`,
    `# Offset: X=${formatScscCoordMm(transform.offsetXmm)}mm Y=${formatScscCoordMm(transform.offsetYmm)}mm | Scale: ${transform.scaleX}×${transform.scaleY}`,
    `# Gốc tọa độ: mép trái + mép trên A4 (210×297mm)`,
    "",
    ...fields.map((b) => formatScscFieldCoordSnippet(b)),
  ];
  return lines.join("\n");
}
