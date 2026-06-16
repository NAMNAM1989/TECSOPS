import { describe, expect, it } from "vitest";
import { awbPrefixFromAwb, listCsdAirlineEntries } from "./csdAirlineCatalog.mjs";
import { listCsdTemplateCatalog, resolveCsdTemplateForAwb } from "./csdTemplateRegistry.mjs";

describe("csdTemplateRegistry", () => {
  it("lấy prefix AWB 3 số", () => {
    expect(awbPrefixFromAwb("738-0704 7051")).toBe("738");
    expect(awbPrefixFromAwb("")).toBe("");
  });

  it("catalog có đủ hãng trong danh sách AWB prefix", () => {
    const catalog = listCsdTemplateCatalog();
    expect(catalog.paper).toBe("A4");
    expect(catalog.airlines.length).toBe(listCsdAirlineEntries().length);
    expect(catalog.summary.total).toBeGreaterThan(20);
  });

  it("resolve VN AWB — pending hoặc ready tuỳ background", () => {
    const resolved = resolveCsdTemplateForAwb("738-0704 7051");
    expect(resolved.awbPrefix).toBe("738");
    expect(resolved.airlineName).toBe("VIETNAM AIRLINES");
    expect(resolved.paper).toBe("A4");
    expect(resolved.page.width_mm).toBe(210);
    expect(resolved.bundle.fields.length).toBeGreaterThan(10);
    expect(["pending", "ready"]).toContain(resolved.status);
  });

  it("forceDefault luôn dùng _default", () => {
    const resolved = resolveCsdTemplateForAwb("738-0704 7051", { forceDefault: true });
    expect(resolved.templateDir).toBe("_default");
    expect(resolved.useCustomTemplate).toBe(false);
    expect(resolved.status).toBe("default");
  });
});
