import { describe, expect, it } from "vitest";
import { clampPrinterProfilesCatalog, mergePrinterProfileCatalogs } from "./printerProfilesCore";

describe("clampPrinterProfilesCatalog", () => {
  it("chuẩn hóa profile thermal", () => {
    const c = clampPrinterProfilesCatalog({
      version: 1,
      profiles: [
        {
          id: "t1",
          name: "XP-470B",
          type: "thermal-tspl",
          host: "192.168.1.50",
          port: 9100,
        },
      ],
    });
    expect(c.profiles).toHaveLength(1);
    expect(c.profiles[0]?.type).toBe("thermal-tspl");
    if (c.profiles[0]?.type === "thermal-tspl") {
      expect(c.profiles[0].host).toBe("192.168.1.50");
      expect(c.profiles[0].labelSheetFormat).toBe("100x80");
      expect(c.profiles[0].pageWidthMm).toBe(100);
      expect(c.profiles[0].pageHeightMm).toBe(80);
      expect(c.profiles[0].rotation).toBe(0);
      expect(c.profiles[0].dpi).toBe(203);
    }
  });

  it("bỏ profile a4-browser (tờ cân đã gỡ)", () => {
    const c = clampPrinterProfilesCatalog({
      profiles: [
        { id: "a4", name: "A4", type: "a4-browser" },
        { id: "t1", name: "T", type: "thermal-tspl" },
      ],
    });
    expect(c.profiles).toHaveLength(1);
    expect(c.profiles[0]?.id).toBe("t1");
  });
});

describe("mergePrinterProfileCatalogs", () => {
  it("server ghi đè local khi trùng id", () => {
    const local = [
      {
        id: "t1",
        name: "Local",
        type: "thermal-tspl" as const,
        connection: "tcp" as const,
        dpi: 203,
        labelWidthMm: 100,
        labelHeightMm: 80,
        pageWidthMm: 100,
        pageHeightMm: 80,
        gapMm: 2,
        rotation: 0 as const,
        offsetXmm: 0,
        offsetYmm: 0,
        speed: 4,
        density: 8,
        copiesDefault: 1,
        labelSheetFormat: "100x80" as const,
        host: "10.0.0.1",
      },
    ];
    const server = clampPrinterProfilesCatalog({
      profiles: [
        {
          id: "t1",
          name: "Server",
          type: "thermal-tspl",
          host: "10.0.0.2",
        },
      ],
    });
    const merged = mergePrinterProfileCatalogs(local, server);
    const hit = merged.find((p) => p.id === "t1");
    expect(hit?.name).toBe("Server");
    if (hit?.type === "thermal-tspl") {
      expect(hit.host).toBe("10.0.0.2");
    }
  });
});
