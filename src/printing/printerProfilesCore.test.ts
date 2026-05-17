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

  it("giữ scscFieldOverrides local khi server chưa có căn chỉnh", () => {
    const local = [
      {
        id: "a4-default",
        name: "Local",
        type: "a4-browser" as const,
        paper: "A4" as const,
        offsetXmm: 0,
        offsetYmm: 0,
        scaleX: 1,
        scaleY: 1,
        templateVersion: "scsc-weigh-v1",
        scscFieldOverrides: { goods: { x: 36, y: 161 } },
      },
    ];
    const server = clampPrinterProfilesCatalog({
      profiles: [
        {
          id: "a4-default",
          name: "Server",
          type: "a4-browser",
          offsetXmm: 0,
          offsetYmm: 0,
        },
      ],
    });
    const merged = mergePrinterProfileCatalogs(local, server);
    const hit = merged.find((p) => p.id === "a4-default");
    expect(hit?.type).toBe("a4-browser");
    if (hit?.type === "a4-browser") {
      expect(hit.scscFieldOverrides?.goods?.x).toBe(36);
    }
  });

  it("ưu tiên catalog local mới hơn khi đã căn SCSC", () => {
    const local = [
      {
        id: "a4-default",
        name: "Local",
        type: "a4-browser" as const,
        paper: "A4" as const,
        offsetXmm: 0,
        offsetYmm: 0,
        scaleX: 1,
        scaleY: 1,
        templateVersion: "scsc-weigh-v1",
        scscFieldOverrides: { pieces: { x: 10, y: 20 } },
      },
    ];
    const server = clampPrinterProfilesCatalog({
      updatedAt: "2020-01-01T00:00:00.000Z",
      profiles: [
        {
          id: "a4-default",
          name: "Server",
          type: "a4-browser",
          scscFieldOverrides: { pieces: { x: 99, y: 99 } },
        },
      ],
    });
    const merged = mergePrinterProfileCatalogs(local, server, {
      localCatalogUpdatedAt: "2026-05-18T00:00:00.000Z",
    });
    const hit = merged.find((p) => p.id === "a4-default");
    if (hit?.type === "a4-browser") {
      expect(hit.scscFieldOverrides?.pieces?.x).toBe(10);
    }
  });
});
