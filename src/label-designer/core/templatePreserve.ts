import type { ThermalFieldOverride, ThermalFieldOverridesMap } from "../../printing/printTypes";
import { getThermalLabelFieldCatalog } from "../../printing/thermalLabel/thermalLabelFieldCatalog";
import { hasThermalFieldCalibration, roundThermalMm } from "../../printing/thermalLabel/thermalFieldOverrides";
import type { LabelSheetFormat } from "../../utils/labelSheetFormat";
import { documentKindFromLabelFormat, getBuiltinTemplate } from "./defaultTemplates";
import { migrateThermalOverridesToTemplate } from "./templateMigrate";
import type { LabelDocumentKind, LabelObject, LabelTemplateV1, TextObject } from "./types";

const POS_EPS = 0.25;

/** Preview: không dùng LabelMmHtmlView (template mm đầy đủ). Dùng LabelContent hoặc ThermalLabelCalibratedSheet. */
export function usesLabelTemplateForPreview(_profile: {
  labelTemplate?: LabelTemplateV1 | null;
}): boolean {
  return false;
}

export function hasDesignerExtras(template: LabelTemplateV1, kind: LabelDocumentKind): boolean {
  const builtinIds = new Set(getBuiltinTemplate(kind).objects.map((o) => o.id));
  return template.objects.some((o) => !builtinIds.has(o.id));
}

/**
 * Trả về chỉ các đối tượng THÊM (không có trong mẫu gốc builtin).
 * Dùng để overlay lên LabelContent CSS — không thay đổi bố cục gốc.
 */
export function getExtraObjects(template: LabelTemplateV1, kind: LabelDocumentKind): LabelObject[] {
  const builtinIds = new Set(getBuiltinTemplate(kind).objects.map((o) => o.id));
  return template.objects.filter((o) => !builtinIds.has(o.id));
}

function mergeTextWithBuiltin(base: TextObject, patch: LabelObject): TextObject {
  if (patch.type !== "text") return base;
  return {
    ...base,
    x: patch.x,
    y: patch.y,
    width: patch.width,
    height: patch.height,
    fontSize: patch.fontSize,
    fontWeight: patch.fontWeight ?? base.fontWeight,
    align: patch.align ?? base.align,
    color: patch.color ?? base.color,
    rotation: patch.rotation ?? base.rotation,
    zIndex: patch.zIndex ?? base.zIndex,
    hideWhen: patch.hideWhen ?? base.hideWhen,
    bind: base.bind ?? patch.bind,
    text: patch.text?.trim() ? patch.text : base.text,
  };
}

/** Gộp thay đổi designer vào mẫu gốc — giữ bind và field mặc định. */
export function mergeDesignerTemplateWithBuiltin(
  saved: LabelTemplateV1,
  kind: LabelDocumentKind
): LabelTemplateV1 {
  const builtin = getBuiltinTemplate(kind);
  const savedById = new Map(saved.objects.map((o) => [o.id, o]));
  const mergedBuiltin = builtin.objects.map((b) => {
    const patch = savedById.get(b.id);
    if (!patch) return b;
    if (b.type === "text") return mergeTextWithBuiltin(b, patch);
    return { ...b, ...patch, id: b.id, type: b.type } as LabelObject;
  });
  const builtinIds = new Set(builtin.objects.map((o) => o.id));
  const extras = saved.objects.filter((o) => !builtinIds.has(o.id));
  return {
    ...builtin,
    id: saved.id || builtin.id,
    name: saved.name || builtin.name,
    documentKind: kind,
    page: { ...builtin.page, ...saved.page },
    objects: [...mergedBuiltin, ...extras],
    designerActive: false,
    updatedAt: saved.updatedAt,
  };
}

/** Chuyển lệch tọa độ/cỡ chữ so với mẫu gốc → thermalFieldOverrides (tương thích căn chỉnh cũ). */
export function templateToThermalFieldOverrides(
  template: LabelTemplateV1,
  format: LabelSheetFormat
): ThermalFieldOverridesMap | undefined {
  const kind = documentKindFromLabelFormat(format);
  const builtin = getBuiltinTemplate(kind);
  const catalog = getThermalLabelFieldCatalog(format);
  const out: ThermalFieldOverridesMap = {};

  for (const def of catalog) {
    const base = builtin.objects.find((o) => o.id === def.key);
    const cur = template.objects.find((o) => o.id === def.key);
    if (!base || base.type !== "text" || !cur || cur.type !== "text") continue;
    const patch: ThermalFieldOverride = {};
    if (Math.abs(cur.x - base.x) > POS_EPS) patch.x = roundThermalMm(cur.x);
    if (Math.abs(cur.y - base.y) > POS_EPS) patch.y = roundThermalMm(cur.y);
    if (Math.abs(cur.fontSize - base.fontSize) > POS_EPS) patch.fontMm = roundThermalMm(cur.fontSize);
    if (Object.keys(patch).length) out[def.key] = patch;
  }
  return Object.keys(out).length ? out : undefined;
}

export type ThermalDesignerCommit = {
  thermalFieldOverrides?: ThermalFieldOverridesMap;
  /** Lưu để mở lại designer + in TSPL khi có đường/bảng/ảnh thêm. */
  labelTemplate?: LabelTemplateV1;
};

/**
 * Lưu từ Label Designer: không bật preview mm; giữ layout CSS gốc + căn chỉnh an toàn.
 */
export function commitThermalDesignerSave(
  saved: LabelTemplateV1,
  kind: LabelDocumentKind,
  format: LabelSheetFormat
): ThermalDesignerCommit {
  const merged = mergeDesignerTemplateWithBuiltin(saved, kind);
  const thermalFieldOverrides = templateToThermalFieldOverrides(merged, format);
  const labelTemplate: LabelTemplateV1 = {
    ...merged,
    designerActive: false,
    updatedAt: new Date().toISOString(),
  };
  return { thermalFieldOverrides, labelTemplate };
}

/** Sửa profile cũ lưu nhầm designerActive=true (gây preview lỗi). */
export function repairThermalProfileAfterDesigner(profile: {
  labelTemplate?: LabelTemplateV1 | null;
  thermalFieldOverrides?: ThermalFieldOverridesMap;
  labelSheetFormat?: "100x80" | "100x50";
  labelHeightMm?: number;
}): {
  labelTemplate?: LabelTemplateV1;
  thermalFieldOverrides?: ThermalFieldOverridesMap;
} {
  const tpl = profile.labelTemplate;
  if (!tpl?.designerActive) {
    return {
      labelTemplate: tpl ?? undefined,
      thermalFieldOverrides: profile.thermalFieldOverrides,
    };
  }
  const format: LabelSheetFormat =
    profile.labelSheetFormat ??
    (profile.labelHeightMm != null && profile.labelHeightMm <= 55 ? "100x50" : "100x80");
  const kind = documentKindFromLabelFormat(format);
  const merged = mergeDesignerTemplateWithBuiltin(tpl, kind);
  const fromTpl = templateToThermalFieldOverrides(merged, format);
  return {
    thermalFieldOverrides: fromTpl ?? profile.thermalFieldOverrides,
    labelTemplate: { ...merged, designerActive: false },
  };
}

export function resolveThermalLabelTemplateForDesigner(
  profile: {
    labelTemplate?: LabelTemplateV1 | null;
    thermalFieldOverrides?: ThermalFieldOverridesMap;
  },
  format: LabelSheetFormat
): LabelTemplateV1 {
  const kind = documentKindFromLabelFormat(format);
  if (profile.labelTemplate?.objects.length) {
    return mergeDesignerTemplateWithBuiltin(structuredClone(profile.labelTemplate), kind);
  }
  if (hasThermalFieldCalibration(profile.thermalFieldOverrides)) {
    return migrateThermalOverridesToTemplate(format, profile.thermalFieldOverrides);
  }
  return getBuiltinTemplate(kind);
}

/** TSPL: dùng template đầy đủ khi có đối tượng thêm (đường, bảng, ảnh…). */
export function shouldUseFullTemplateForTspl(
  profile: {
    labelTemplate?: LabelTemplateV1 | null;
    thermalFieldOverrides?: ThermalFieldOverridesMap;
  },
  kind: LabelDocumentKind
): boolean {
  if (profile.labelTemplate?.objects.length && hasDesignerExtras(profile.labelTemplate, kind)) {
    return true;
  }
  return false;
}
