import type { LabelSheetFormat } from "../../utils/labelSheetFormat";
import type { ThermalLabelPrinterProfile } from "../printTypes";
import { resolveThermalProfileLabelFormat } from "../thermalLabelFormat";
import type { ThermalLabelFieldDef } from "./thermalLabelFieldCatalog";
import { getThermalLabelFieldCatalog } from "./thermalLabelFieldCatalog";
import { applyThermalFieldOverrides } from "./thermalFieldOverrides";
import { thermalDefToTsplMul } from "./thermalLabelTsplFont";
import { buildThermalLabelSlotValues, type ThermalLabelSlotValues } from "./thermalLabelValues";
import type { Shipment } from "../../types/shipment";
import type { AirlineLabelOverrides } from "../../utils/airlineLabelOverridesCore";

export type ThermalTsplTextSlot = {
  key: string;
  text: string;
  x: number;
  y: number;
  font: string;
  mulX: number;
  mulY: number;
};

export function visibleThermalFieldKeys(format: LabelSheetFormat, hasHawb: boolean): Set<string> {
  if (format === "100x50") {
    const keys = new Set(["piecesLabel", "pieces"]);
    if (hasHawb) {
      keys.add("hawbLine");
      keys.add("piecesHawb");
    }
    return keys;
  }
  const keys = new Set([
    "airlineLine1",
    "airlineLine2",
    "mawb",
    "originLabel",
    "origin",
    "destLabel",
    "dest",
  ]);
  if (hasHawb) {
    keys.add("hawbLine");
    keys.add("piecesHawbLabel");
    keys.add("piecesHawb");
    keys.add("piecesMawbLabel");
    keys.add("piecesMawb");
  } else {
    keys.add("piecesLabel");
    keys.add("pieces");
  }
  return keys;
}

export function resolveThermalLabelFields(
  format: LabelSheetFormat,
  overrides?: ThermalLabelPrinterProfile["thermalFieldOverrides"]
): ThermalLabelFieldDef[] {
  return applyThermalFieldOverrides(getThermalLabelFieldCatalog(format), overrides);
}

/** Chỉ các ô sẽ in (tránh chồng pieces / piecesHawb / piecesMawb trên preview). */
export function visibleThermalLabelFieldsForRender(
  format: LabelSheetFormat,
  fields: ThermalLabelFieldDef[],
  values: ThermalLabelSlotValues,
  hasHawb: boolean,
  opts?: { showAllSlotsForEdit?: boolean }
): ThermalLabelFieldDef[] {
  const visible = visibleThermalFieldKeys(format, hasHawb);
  return fields.filter((def) => {
    if (!visible.has(def.key)) return false;
    if (opts?.showAllSlotsForEdit) return true;
    return Boolean((values[def.key] ?? "").trim());
  });
}

export function buildThermalTsplTextSlots(
  fields: ThermalLabelFieldDef[],
  values: ThermalLabelSlotValues,
  format: LabelSheetFormat,
  hasHawb: boolean
): ThermalTsplTextSlot[] {
  const visible = visibleThermalFieldKeys(format, hasHawb);
  const catalogByKey = new Map(getThermalLabelFieldCatalog(format).map((f) => [f.key, f]));
  const slots: ThermalTsplTextSlot[] = [];
  for (const def of fields) {
    if (!visible.has(def.key)) continue;
    const text = (values[def.key] ?? "").trim();
    if (!text) continue;
    const catalogDef = catalogByKey.get(def.key) ?? def;
    const { mulX, mulY } = thermalDefToTsplMul(def, catalogDef);
    slots.push({
      key: def.key,
      text,
      x: def.x,
      y: def.y,
      font: def.tsplFont,
      mulX,
      mulY,
    });
  }
  return slots;
}

export function buildThermalTsplPayloadFromShipment(
  shipment: Shipment,
  profile: ThermalLabelPrinterProfile,
  airlineLabelOverrides?: AirlineLabelOverrides | null
) {
  const format = resolveThermalProfileLabelFormat(profile);
  const pack = buildThermalLabelSlotValues(shipment, airlineLabelOverrides);
  const fields = resolveThermalLabelFields(format, profile.thermalFieldOverrides);
  const thermalSlots = buildThermalTsplTextSlots(fields, pack.values, format, pack.hasHawb);
  return { format, fields, values: pack.values, thermalSlots };
}
