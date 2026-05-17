import { describe, expect, it } from "vitest";
import { applyThermalFieldOverrides, hasThermalFieldCalibration, roundThermalMm } from "./thermalFieldOverrides";
import { getThermalLabelFieldCatalog } from "./thermalLabelFieldCatalog";

describe("thermalFieldOverrides", () => {
  it("dịch ô pieces khi lưu override", () => {
    const base = getThermalLabelFieldCatalog("100x50");
    const pieces = base.find((f) => f.key === "pieces")!;
    const next = applyThermalFieldOverrides(base, { pieces: { x: 40, y: 30, fontMm: 22 } });
    const updated = next.find((f) => f.key === "pieces")!;
    expect(updated.x).toBe(40);
    expect(updated.y).toBe(30);
    expect(updated.fontMm).toBe(22);
    expect(pieces.x).not.toBe(40);
  });

  it("roundThermalMm", () => {
    expect(roundThermalMm(1.24)).toBe(1);
    expect(roundThermalMm(1.26)).toBe(1.5);
  });

  it("hasThermalFieldCalibration", () => {
    expect(hasThermalFieldCalibration(undefined)).toBe(false);
    expect(hasThermalFieldCalibration({})).toBe(false);
    expect(hasThermalFieldCalibration({ pieces: { x: 1 } })).toBe(true);
  });
});
