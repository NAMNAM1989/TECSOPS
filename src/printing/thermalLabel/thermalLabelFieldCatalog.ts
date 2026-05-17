import type { LabelSheetFormat } from "../../utils/labelSheetFormat";
import type { LabelTextSlot } from "./labelLayoutMm";
import { THERMAL_LABEL_LAYOUT_100x50, THERMAL_LABEL_LAYOUT_100x80 } from "./labelLayoutMm";

export type ThermalLabelFieldDef = {
  key: string;
  label: string;
  x: number;
  y: number;
  fontMm: number;
  tsplFont: string;
  mulX: number;
  mulY: number;
  /** Ô rộng để bắt chuột kéo (mm). */
  hitW: number;
  hitH: number;
};

const FIELD_LABELS: Record<string, string> = {
  airlineLine1: "Hãng bay (dòng 1)",
  airlineLine2: "Hãng bay (dòng 2)",
  mawb: "MAWB / AWB",
  originLabel: "Nhãn Origin",
  origin: "Origin",
  destLabel: "Nhãn Destination",
  dest: "Destination",
  hawbLine: "Dòng HAWB",
  piecesLabel: "Nhãn số kiện",
  pieces: "Số kiện",
  piecesHawbLabel: "Nhãn Pieces HAWB",
  piecesHawb: "Số kiện HAWB",
  piecesMawbLabel: "Nhãn Total MAWB",
  piecesMawb: "Số kiện MAWB",
};

function slotToField(
  key: string,
  slot: LabelTextSlot,
  fontMm: number,
  hitW = 46,
  hitH = 8
): ThermalLabelFieldDef {
  return {
    key,
    label: FIELD_LABELS[key] ?? key,
    x: slot.x,
    y: slot.y,
    fontMm,
    tsplFont: slot.font ?? "4",
    mulX: slot.mulX ?? 1,
    mulY: slot.mulY ?? 1,
    hitW,
    hitH,
  };
}

const CATALOG_100x80: ThermalLabelFieldDef[] = [
  slotToField("airlineLine1", THERMAL_LABEL_LAYOUT_100x80.airlineLine1, 4, 90, 5),
  slotToField("airlineLine2", THERMAL_LABEL_LAYOUT_100x80.airlineLine2, 4, 90, 5),
  slotToField("mawb", THERMAL_LABEL_LAYOUT_100x80.mawb, 8, 92, 10),
  slotToField("originLabel", THERMAL_LABEL_LAYOUT_100x80.originLabel, 2.5, 40, 4),
  slotToField("origin", THERMAL_LABEL_LAYOUT_100x80.origin, 9, 40, 8),
  slotToField("destLabel", THERMAL_LABEL_LAYOUT_100x80.destLabel, 2.5, 40, 4),
  slotToField("dest", THERMAL_LABEL_LAYOUT_100x80.dest, 9, 40, 8),
  slotToField("hawbLine", THERMAL_LABEL_LAYOUT_100x80.hawbLine, 10, 92, 12),
  slotToField("piecesLabel", THERMAL_LABEL_LAYOUT_100x80.piecesLabel, 2.6, 44, 4),
  slotToField("pieces", THERMAL_LABEL_LAYOUT_100x80.pieces, 11, 22, 12),
  slotToField("piecesHawbLabel", THERMAL_LABEL_LAYOUT_100x80.piecesHawbLabel, 2.6, 44, 4),
  slotToField("piecesHawb", THERMAL_LABEL_LAYOUT_100x80.piecesHawb, 11, 18, 10),
  slotToField("piecesMawbLabel", THERMAL_LABEL_LAYOUT_100x80.piecesMawbLabel, 2.6, 44, 4),
  slotToField("piecesMawb", THERMAL_LABEL_LAYOUT_100x80.piecesMawb, 11, 18, 10),
];

const CATALOG_100x50: ThermalLabelFieldDef[] = [
  slotToField("hawbLine", THERMAL_LABEL_LAYOUT_100x50.hawbLine, 7, 92, 10),
  slotToField("piecesLabel", THERMAL_LABEL_LAYOUT_100x50.piecesLabel, 2.3, 48, 4),
  slotToField("pieces", THERMAL_LABEL_LAYOUT_100x50.pieces, 15, 28, 12),
  slotToField("piecesHawb", THERMAL_LABEL_LAYOUT_100x50.piecesHawb, 12, 20, 10),
];

export function getThermalLabelFieldCatalog(format: LabelSheetFormat): ThermalLabelFieldDef[] {
  return format === "100x50" ? [...CATALOG_100x50] : [...CATALOG_100x80];
}

export function thermalLabelDimensions(format: LabelSheetFormat): { w: number; h: number } {
  return format === "100x50" ? { w: 100, h: 50 } : { w: 100, h: 80 };
}
