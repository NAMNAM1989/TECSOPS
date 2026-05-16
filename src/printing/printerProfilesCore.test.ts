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
    }
  });
});

describe("mergePrinterProfileCatalogs", () => {
  it("server ghi đè local khi trùng id", () => {
    const local = [
      {
        id: "a4-default",
        name: "Local",
        type: "a4-browser" as const,
        paper: "A4" as const,
        offsetXmm: 1,
        offsetYmm: 0,
        scaleX: 1,
        scaleY: 1,
        templateVersion: "scsc-weigh-v1",
      },
    ];
    const server = clampPrinterProfilesCatalog({
      profiles: [
        {
          id: "a4-default",
          name: "Server",
          type: "a4-browser",
          offsetXmm: 2,
          offsetYmm: 3,
        },
      ],
    });
    const merged = mergePrinterProfileCatalogs(local, server);
    const hit = merged.find((p) => p.id === "a4-default");
    expect(hit?.name).toBe("Server");
    if (hit?.type === "a4-browser") {
      expect(hit.offsetXmm).toBe(2);
    }
  });
});
