import { describe, expect, it } from "vitest";
import { buildThermalCargo100x80Template } from "./defaultTemplates";
import {
  commitThermalDesignerSave,
  mergeDesignerTemplateWithBuiltin,
  repairThermalProfileAfterDesigner,
  usesLabelTemplateForPreview,
} from "./templatePreserve";

describe("templatePreserve", () => {
  it("preview luôn dùng LabelContent (không mm)", () => {
    const tpl = buildThermalCargo100x80Template();
    expect(usesLabelTemplateForPreview({ labelTemplate: tpl })).toBe(false);
    const saved = commitThermalDesignerSave(tpl, "thermal-cargo-100x80", "100x80");
    expect(usesLabelTemplateForPreview({ labelTemplate: saved.labelTemplate })).toBe(false);
  });

  it("lưu designer: designerActive=false và giữ đủ field gốc", () => {
    const builtin = buildThermalCargo100x80Template();
    const saved = commitThermalDesignerSave(
      { ...builtin, objects: builtin.objects.slice(0, 1) },
      "thermal-cargo-100x80",
      "100x80"
    );
    expect(saved.labelTemplate?.designerActive).toBe(false);
    expect(saved.labelTemplate?.objects.length).toBeGreaterThan(10);
  });

  it("merge giữ đủ field gốc khi user chỉ sửa một phần", () => {
    const builtin = buildThermalCargo100x80Template();
    const saved = {
      ...builtin,
      objects: [{ ...builtin.objects[0], x: 99 }],
    };
    const merged = mergeDesignerTemplateWithBuiltin(saved, "thermal-cargo-100x80");
    expect(merged.objects.length).toBe(builtin.objects.length);
    expect(merged.objects[0].x).toBe(99);
  });

  it("repair profile cũ có designerActive=true", () => {
    const tpl = buildThermalCargo100x80Template();
    tpl.designerActive = true;
    const repaired = repairThermalProfileAfterDesigner({
      labelTemplate: tpl,
      labelSheetFormat: "100x80",
    });
    expect(repaired.labelTemplate?.designerActive).toBe(false);
    expect(repaired.labelTemplate?.objects.length).toBeGreaterThan(10);
  });
});
