import { describe, expect, it } from "vitest";
import { warehouseSeriesFor, warehouseSeriesHex } from "./warehouseTokens";

describe("warehouseSeriesHex", () => {
  it("maps color by warehouse code, not by list order", () => {
    expect(warehouseSeriesHex.SCSC).toBe("#7A4CC4");
    expect(warehouseSeriesHex["TECS-SCSC"]).toBe("#4A2384");
    expect(warehouseSeriesFor("TCS")).toBe("#2F6FC0");
    expect(warehouseSeriesFor("TECS-TCS")).toBe("#17457E");
    expect(warehouseSeriesFor("TECS-TCS")).not.toBe(warehouseSeriesFor("TCS"));
  });
});
