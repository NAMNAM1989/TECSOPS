import { describe, expect, it } from "vitest";
import { getThermalLabelFieldCatalog } from "./thermalLabelFieldCatalog";
import { resolveThermalLabelFields, visibleThermalLabelFieldsForRender } from "./thermalLabelTsplSlots";

describe("visibleThermalLabelFieldsForRender", () => {
  it("100x80 không HAWB: chỉ pieces, không piecesHawb/Mawb", () => {
    const fields = resolveThermalLabelFields("100x80");
    const values = {
      airlineLine1: "VIETJET",
      mawb: "978",
      origin: "SGN",
      dest: "MEL",
      pieces: "4",
      piecesHawb: "4",
      piecesMawb: "4",
      piecesLabel: "Total no. of pieces",
      piecesHawbLabel: "Pieces HAWB",
      piecesMawbLabel: "Total MAWB",
    };
    const visible = visibleThermalLabelFieldsForRender("100x80", fields, values, false);
    const keys = visible.map((f) => f.key);
    expect(keys).toContain("pieces");
    expect(keys).not.toContain("piecesHawb");
    expect(keys).not.toContain("piecesMawb");
    expect(keys).not.toContain("piecesHawbLabel");
  });

  it("catalog 100x80 có đủ ô khi edit", () => {
    expect(getThermalLabelFieldCatalog("100x80").length).toBeGreaterThan(10);
  });
});
