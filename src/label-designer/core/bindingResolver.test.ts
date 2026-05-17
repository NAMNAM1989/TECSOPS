import { describe, expect, it } from "vitest";
import { bindLabelTemplate, resolveBindString } from "./bindingResolver";
import { buildThermalCargo100x80Template } from "./defaultTemplates";

describe("bindingResolver", () => {
  it("thay {{awb}} trong chuỗi", () => {
    expect(resolveBindString("AWB {{awb}}", { awb: "978-1" })).toBe("AWB 978-1");
  });

  it("ẩn ô khi hasHawb", () => {
    const tpl = buildThermalCargo100x80Template();
    const bound = bindLabelTemplate(tpl, { hasHawb: true, "!hasHawb": false, pieces: "4" });
    expect(bound.objects.some((o) => o.id === "pieces" && o.type === "text")).toBe(false);
  });

  it("ẩn ô hawbLine khi không có HAWB ({{!hasHawb}})", () => {
    const tpl = buildThermalCargo100x80Template();
    const bound = bindLabelTemplate(tpl, { hasHawb: false, pieces: "40" });
    expect(bound.objects.some((o) => o.id === "hawbLine")).toBe(false);
    expect(bound.objects.some((o) => o.id === "pieces" && o.type === "text")).toBe(true);
  });
});
