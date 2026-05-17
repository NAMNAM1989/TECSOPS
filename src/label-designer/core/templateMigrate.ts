import type { ThermalFieldOverridesMap } from "../../printing/printTypes";
import { getThermalLabelFieldCatalog } from "../../printing/thermalLabel/thermalLabelFieldCatalog";
import { applyThermalFieldOverrides } from "../../printing/thermalLabel/thermalFieldOverrides";
import type { LabelSheetFormat } from "../../utils/labelSheetFormat";
import { documentKindFromLabelFormat, getBuiltinTemplate } from "./defaultTemplates";
import type { LabelTemplateV1 } from "./types";

/** Chuyển thermalFieldOverrides cũ → template v1 (giữ tọa độ đã căn). */
export function migrateThermalOverridesToTemplate(
  format: LabelSheetFormat,
  overrides?: ThermalFieldOverridesMap | null
): LabelTemplateV1 {
  const kind = documentKindFromLabelFormat(format);
  const base = getBuiltinTemplate(kind);
  if (!overrides || !Object.keys(overrides).length) return base;

  const fields = applyThermalFieldOverrides(getThermalLabelFieldCatalog(format), overrides);
  const byKey = new Map(fields.map((f) => [f.key, f]));

  return {
    ...base,
    id: `migrated-${kind}-${Date.now().toString(36)}`,
    name: `Đã migrate ${format}`,
    objects: base.objects.map((obj) => {
      const f = byKey.get(obj.id);
      if (!f || obj.type !== "text") return obj;
      return {
        ...obj,
        x: f.x,
        y: f.y,
        fontSize: f.fontMm,
      };
    }),
    updatedAt: new Date().toISOString(),
  };
}
