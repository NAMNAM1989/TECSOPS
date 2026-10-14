import { describe, expect, it } from "vitest";
import { parseAppState, parseAppStateFetchResult } from "./appStateParse";

describe("parseAppStateFetchResult", () => {
  it("parses unchanged delta response", () => {
    expect(parseAppStateFetchResult({ version: 42, unchanged: true })).toEqual({
      kind: "unchanged",
      version: 42,
    });
    expect(parseAppState({ version: 42, unchanged: true })).toBeNull();
  });

  it("parses full snapshot", () => {
    const raw = { version: 7, rows: [], customers: [] };
    expect(parseAppStateFetchResult(raw)).toEqual({
      kind: "full",
      state: expect.objectContaining({ version: 7, rows: [] }),
    });
  });

  it("giữ h21InvoicePresets khi parse customers từ wire", () => {
    const raw = {
      version: 9,
      rows: [],
      customers: [
        {
          id: "c1",
          code: "MKH",
          name: "MINH KHANG",
          parties: [],
          h21InvoicePresets: [
            {
              warehouseScope: "SCSC",
              items: [
                { id: "kh1", description: "Ao thun", unitFactor: 0.2, hsCode: "6109" },
              ],
              preferredLineCount: 12,
            },
            { warehouseScope: "TCS", catalogItemIds: ["t1"] },
          ],
        },
      ],
    };
    const state = parseAppState(raw);
    const presets = state?.customers[0]?.h21InvoicePresets;
    expect(presets?.find((p) => p.warehouseScope === "SCSC")?.items?.[0]?.description).toBe(
      "Ao thun"
    );
    expect(presets?.find((p) => p.warehouseScope === "TCS")?.catalogItemIds).toEqual([
      "t1",
    ]);
  });
});
