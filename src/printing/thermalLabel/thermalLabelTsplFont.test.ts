import { describe, expect, it } from "vitest";
import { getThermalLabelFieldCatalog } from "./thermalLabelFieldCatalog";
import { applyThermalFieldOverrides } from "./thermalFieldOverrides";
import { buildThermalTsplTextSlots } from "./thermalLabelTsplSlots";

describe("thermalLabelTsplFont", () => {
  it("fontMm lớn hơn → mul TSPL tăng khi in", () => {
    const catalog = getThermalLabelFieldCatalog("100x80");
    const fields = applyThermalFieldOverrides(catalog, {
      pieces: { fontMm: 16 },
    });
    const values = {
      airlineLine1: "VJ",
      airlineLine2: "",
      mawb: "978",
      originLabel: "Origin",
      origin: "SGN",
      destLabel: "Destination",
      dest: "MEL",
      piecesLabel: "Total",
      pieces: "4",
      piecesHawbLabel: "",
      piecesHawb: "",
      piecesMawbLabel: "",
      piecesMawb: "",
      hawbLine: "",
    };
    const slots = buildThermalTsplTextSlots(fields, values, "100x80", false);
    const pieces = slots.find((s) => s.key === "pieces")!;
    const base = catalog.find((f) => f.key === "pieces")!;
    expect(pieces.mulX).toBeGreaterThan(base.mulX);
  });
});
