import { describe, expect, it } from "vitest";
import { normalizePrinterProfilesCatalogLoose } from "./printerProfilesNormalize.mjs";

describe("normalizePrinterProfilesCatalogLoose", () => {
  it("chỉ giữ profile tem nhiệt", () => {
    const catalog = normalizePrinterProfilesCatalogLoose({
      version: 1,
      profiles: [
        { id: "a4-old", name: "Tờ cân cũ", type: "a4-browser" },
        { id: "thermal", name: "Tem 100×80", type: "thermal-tspl" },
      ],
    });

    expect(catalog.profiles).toHaveLength(1);
    expect(catalog.profiles[0]).toMatchObject({
      id: "thermal",
      type: "thermal-tspl",
    });
  });
});
