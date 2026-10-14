import { describe, expect, it } from "vitest";
import { warehouseSeriesFor, warehouseSeriesHex } from "./warehouseTokens";

describe("warehouseSeriesHex", () => {
  it("maps color by warehouse code, not by list order", () => {
    expect(warehouseSeriesHex.SCSC).toBe("#6D28D9");
    expect(warehouseSeriesHex["TECS-SCSC"]).toBe("#4C1D95");
    expect(warehouseSeriesFor("TCS")).toBe("#0369A1");
    expect(warehouseSeriesFor("TECS-TCS")).toBe("#0C4A6E");
    expect(warehouseSeriesFor("TECS-TCS")).not.toBe(warehouseSeriesFor("TCS"));
  });
});
