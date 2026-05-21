import type { PrintTemplateFieldRecord } from "../types/printTemplate";
import type { ScscFieldDef } from "../printing/scscWeigh/scscWeighTemplate";
import { buildScscWeighPrintFields, resolveScscWeighLayout } from "../printing/scscWeigh/scscWeighLayout";
import { applyScscFieldOverrides } from "../printing/scscWeigh/scscFieldOverrides";
import { getActiveA4WeighProfile } from "../printing/printerProfiles";
import { loadPrinterProfileStore } from "../printing/printerProfileStorage";
import { MM_TO_PT } from "./printMmUnits";
import { savePrintProfileFields } from "./printServerApi";

export function mmFontToPt(mm: number): number {
  return mm * MM_TO_PT;
}

export function printFieldRecordToScscDef(f: PrintTemplateFieldRecord): ScscFieldDef {
  return {
    key: f.fieldKey,
    x: f.posXMm,
    y: f.posYMm,
    width: f.widthMm ?? 40,
    fontPt: f.fontSizePt,
    lineHeightMm: f.lineHeightMm ?? undefined,
    heightMm: f.heightMm ?? undefined,
    align: f.align,
    multiline: f.multiline,
    bold: f.bold,
  };
}

export function scscDefToPrintFieldPayload(
  def: ScscFieldDef,
  existing?: PrintTemplateFieldRecord,
  sortOrder = 0
): Record<string, unknown> {
  const fontPt = def.fontPt ?? (def.fontMm != null ? mmFontToPt(def.fontMm) : 9);
  return {
    fieldKey: def.key,
    posXMm: def.x,
    posYMm: def.y,
    widthMm: def.width,
    fontSizePt: fontPt,
    lineHeightMm: def.lineHeightMm ?? null,
    heightMm: def.heightMm ?? null,
    maxLines: existing?.maxLines ?? (def.multiline ? 4 : null),
    align: def.align ?? "left",
    multiline: def.multiline ?? false,
    bold: def.bold ?? false,
    sortOrder: existing?.sortOrder ?? sortOrder,
  };
}

export function printFieldsToScscDefs(fields: readonly PrintTemplateFieldRecord[]): ScscFieldDef[] {
  return [...fields]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.fieldKey.localeCompare(b.fieldKey))
    .map(printFieldRecordToScscDef);
}

export function scscDefsSnapshotEqual(a: readonly ScscFieldDef[], b: readonly ScscFieldDef[]): boolean {
  if (a.length !== b.length) return false;
  const mapB = new Map(b.map((f) => [f.key, f]));
  for (const f of a) {
    const o = mapB.get(f.key);
    if (!o) return false;
    if (
      f.x !== o.x ||
      f.y !== o.y ||
      f.width !== o.width ||
      (f.fontPt ?? 0) !== (o.fontPt ?? 0) ||
      (f.fontMm ?? 0) !== (o.fontMm ?? 0) ||
      (f.lineHeightMm ?? 0) !== (o.lineHeightMm ?? 0) ||
      (f.heightMm ?? 0) !== (o.heightMm ?? 0) ||
      (f.align ?? "left") !== (o.align ?? "left") ||
      Boolean(f.multiline) !== Boolean(o.multiline) ||
      Boolean(f.bold) !== Boolean(o.bold)
    ) {
      return false;
    }
  }
  return true;
}

/** Import tọa độ từ profile A4 localStorage → Postgres print_template_fields. */
export async function migrateLocalScscFieldsToServer(profileId: string): Promise<number> {
  const a4 = getActiveA4WeighProfile(loadPrinterProfileStore());
  const layout = resolveScscWeighLayout(a4);
  const baseFields = buildScscWeighPrintFields(layout);
  const merged = applyScscFieldOverrides(baseFields, a4.scscFieldOverrides);
  const payloads = merged.map((def, i) => scscDefToPrintFieldPayload(def, undefined, i));
  await savePrintProfileFields(profileId, payloads);
  return payloads.length;
}
