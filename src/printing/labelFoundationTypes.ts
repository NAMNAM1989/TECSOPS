/** Types nền tảng in tem — Giai đoạn 1 (docs/label-print-foundation-impl.md). */

import type { LabelSheetFormat } from "../utils/labelSheetFormat";
import type { DimPieceLine } from "../utils/volumetricDim";

export type LabelTemplateKind = "master-cargo" | "house-cargo";

export type LabelTemplateVersionStatus = "draft" | "published" | "archived";

export type HouseAllocationStatus = "needs-confirmation" | "confirmed" | "unassigned";

export type ShipmentHouse = {
  id: string;
  shipmentId: string;
  hawb: string;
  pcs: number | null;
  kg: number | null;
  dimWeightKg: number | null;
  dimLines: DimPieceLine[] | null;
  dest: string;
  consigneeName: string;
  goodsDescription: string;
  specialHandling: string;
  templateId?: string;
  sortOrder: number;
  allocationStatus: HouseAllocationStatus;
};

export type LabelFieldKey =
  | "shipment.mawb"
  | "shipment.airline"
  | "shipment.origin"
  | "shipment.destination"
  | "shipment.pieces"
  | "shipment.flight"
  | "shipment.flightDate"
  | "shipment.customer"
  | "shipment.specialHandling"
  | "house.hawb"
  | "house.pieces"
  | "house.weightKg"
  | "house.destination"
  | "house.consignee"
  | "house.goodsDescription"
  | "house.pieceIndex"
  | "house.pieceCount"
  | "house.sequence";

export type LabelElementType =
  | "data-text"
  | "static-text"
  | "line"
  | "rectangle"
  | "barcode"
  | "qr";

export type LabelElement = {
  id: string;
  type: LabelElementType;
  fieldKey?: LabelFieldKey;
  text?: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotation: 0 | 90 | 180 | 270;
  zIndex: number;
  locked: boolean;
  visible: boolean;
  style: {
    fontFamily?: "sans" | "mono" | "printer-0" | "printer-3";
    fontMm?: number;
    bold?: boolean;
    align?: "left" | "center" | "right";
    lineWidthMm?: number;
  };
  format?: {
    prefix?: string;
    suffix?: string;
    uppercase?: boolean;
    maxChars?: number;
  };
};

export type LabelScene = {
  canvasWidthMm: number;
  canvasHeightMm: number;
  format: LabelSheetFormat;
  elements: LabelElement[];
};

export type LabelTemplateMeta = {
  id: string;
  code: string;
  name: string;
  kind: LabelTemplateKind;
  format: LabelSheetFormat;
  activeVersionId: string | null;
};

export type LabelTemplateVersion = {
  id: string;
  templateId: string;
  versionNo: number;
  status: LabelTemplateVersionStatus;
  scene: LabelScene;
  createdAt: string;
  publishedAt?: string;
};

export type LabelPrintItemKind = "master" | "house";

/** Snapshot bất biến một tem trong lệnh in. */
export type LabelPrintItem = {
  kind: LabelPrintItemKind;
  shipmentId: string;
  houseId?: string;
  copyIndex: number;
  copiesEntered: number;
  templateVersionId: string;
  data: Record<string, string>;
};

export type HouseAllocationSummary = {
  masterPcs: number | null;
  allocatedPcs: number;
  unassignedPcs: number | null;
  houses: ShipmentHouse[];
  errors: string[];
  warnings: string[];
};
